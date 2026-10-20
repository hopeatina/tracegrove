/**
 * Sealed run archives: a whole run folder (receipts, transcripts, readbacks) encrypted into one
 * file with AES-256-GCM under a scrypt-derived key, so evidence holding client data can be stored or
 * handed over without sitting on disk in plaintext. The header is authenticated with the content;
 * tracegrove never stores or prints the passphrase.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Blocked } from './errors.ts';

const MAGIC = 'TGSEAL1\n';
const SCRYPT = { N: 1 << 15, r: 8, p: 1 };
const MAX_BYTES = 512 * 1024 * 1024;

export type SealHeader = { schemaVersion: 'tracegrove.sealed-run/v1'; cipher: 'aes-256-gcm'; kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  iv: string; tag: string; name: string; files: number; bytes: number; sealedAt: string };

function key(passphrase: string, salt: Buffer, kdf = SCRYPT): Buffer {
  if (passphrase.length < 12) throw new Blocked([{ code: 'seal_passphrase_weak', detail: 'the sealing passphrase must be at least 12 characters', action: 'set TRACEGROVE_SEAL_KEY to a long random value (for example: openssl rand -base64 32) and keep it in your password manager' }]);
  return scryptSync(passphrase, salt, 32, { ...kdf, maxmem: 256 * 1024 * 1024 });
}

function walk(root: string): Array<{ path: string; data: string }> {
  const out: Array<{ path: string; data: string }> = [];
  let total = 0;
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry); const stat = lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) { visit(full); continue; }
      total += stat.size;
      if (total > MAX_BYTES) throw new Blocked([{ code: 'seal_too_large', detail: `${root} exceeds ${MAX_BYTES} bytes` }]);
      out.push({ path: relative(root, full).split(sep).join('/'), data: readFileSync(full).toString('base64') });
    }
  };
  visit(root);
  return out;
}

export function sealRun(runDir: string, outFile: string, passphrase: string, options: { remove?: boolean } = {}): SealHeader {
  const root = resolve(runDir);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new Blocked([{ code: 'seal_run_missing', detail: runDir }]);
  if (existsSync(outFile)) throw new Blocked([{ code: 'seal_output_exists', detail: outFile, action: 'choose a new output path; sealed archives are never overwritten' }]);
  const files = walk(root);
  const plain = gzipSync(Buffer.from(JSON.stringify({ files })));
  const salt = randomBytes(16); const iv = randomBytes(12);
  const base = { schemaVersion: 'tracegrove.sealed-run/v1' as const, cipher: 'aes-256-gcm' as const, kdf: { name: 'scrypt' as const, ...SCRYPT, salt: salt.toString('base64') },
    iv: iv.toString('base64'), name: root.split(sep).pop() ?? 'run', files: files.length, bytes: plain.length, sealedAt: new Date().toISOString() };
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(base)));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const header: SealHeader = { ...base, tag: cipher.getAuthTag().toString('base64') };
  mkdirSync(dirname(resolve(outFile)), { recursive: true });
  writeFileSync(outFile, Buffer.concat([Buffer.from(MAGIC), Buffer.from(`${JSON.stringify(header)}\n`), body]), { mode: 0o600, flag: 'wx' });
  // Prove the archive opens before deleting anything.
  if (options.remove) { openSealed(outFile, passphrase); rmSync(root, { recursive: true, force: true }); }
  return header;
}

function openSealed(file: string, passphrase: string): { header: SealHeader; files: Array<{ path: string; data: string }> } {
  const raw = readFileSync(file);
  if (raw.subarray(0, MAGIC.length).toString() !== MAGIC) throw new Blocked([{ code: 'seal_format_unknown', detail: `${file} is not a tracegrove sealed run` }]);
  const newline = raw.indexOf(0x0a, MAGIC.length);
  const header = JSON.parse(raw.subarray(MAGIC.length, newline).toString()) as SealHeader;
  if (header.schemaVersion !== 'tracegrove.sealed-run/v1' || header.cipher !== 'aes-256-gcm' || header.kdf?.name !== 'scrypt') throw new Blocked([{ code: 'seal_format_unknown', detail: `${file}: unsupported sealed-run header` }]);
  const { tag, ...base } = header;
  const decipher = createDecipheriv('aes-256-gcm', key(passphrase, Buffer.from(header.kdf.salt, 'base64'), { N: header.kdf.N, r: header.kdf.r, p: header.kdf.p }), Buffer.from(header.iv, 'base64'));
  decipher.setAAD(Buffer.from(JSON.stringify(base)));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  let plain: Buffer;
  try { plain = Buffer.concat([decipher.update(raw.subarray(newline + 1)), decipher.final()]); }
  catch { throw new Blocked([{ code: 'seal_open_failed', detail: 'wrong passphrase, or the archive was modified', action: 'check TRACEGROVE_SEAL_KEY; a modified archive cannot be opened' }]); }
  return { header, files: (JSON.parse(gunzipSync(plain).toString()) as { files: Array<{ path: string; data: string }> }).files };
}

export function unsealRun(file: string, outDir: string, passphrase: string): { header: SealHeader; outDir: string } {
  const target = resolve(outDir);
  if (existsSync(target) && readdirSync(target).length) throw new Blocked([{ code: 'unseal_output_not_empty', detail: outDir }]);
  const { header, files } = openSealed(file, passphrase);
  for (const entry of files) {
    const path = resolve(target, entry.path);
    if (!path.startsWith(`${target}${sep}`)) throw new Blocked([{ code: 'seal_path_escape', detail: entry.path }]);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(entry.data, 'base64'), { mode: 0o600 });
  }
  return { header, outDir: target };
}
