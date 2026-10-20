/**
 * Signed evidence: `tracegrove keygen`, `tracegrove sign` and the signature check that `verify-bundle`,
 * the handoff report and the PR card share. A signature binds a signer's Ed25519 key to one verified
 * bundle's manifest digest and outcome. It is written next to the bundle (signature.json), so the
 * sealed bundle bytes never change. Trust is a folder of public keys committed with the flows
 * (tracegrove/signers/<name>.pub): a valid signature from a key that isn't there is reported, not trusted.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { readVerifiedBundle } from '../core/bundle.ts';
import { canonicalBytes } from '../protocol/canonical.ts';

export const SIGNATURE_FILE = 'signature.json';
const DOMAIN = 'tracegrove.bundle-signature/v1\0';
const SignerName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);

export const BundleSignature = z.object({
  schemaVersion: z.literal('tracegrove.bundle-signature/v1'),
  algorithm: z.literal('ed25519'),
  run: z.string().max(200),
  manifestDigest: z.string().max(200),
  outcome: z.string().max(40),
  signer: z.object({ name: SignerName, fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/), publicKey: z.string().max(400) }).strict(),
  signedAt: z.string().max(40),
  signature: z.string().max(200),
}).strict();
export type BundleSignature = z.infer<typeof BundleSignature>;

export type SignatureCheck =
  | { state: 'unsigned' }
  | { state: 'invalid'; detail: string }
  | { state: 'trusted' | 'untrusted'; signer: string; fingerprint: string; signedAt: string };

const digestText = (d: { algorithm: string; hex: string }) => `${d.algorithm}:${d.hex}`;
const publicPem = (key: KeyObject) => key.export({ type: 'spki', format: 'pem' }).toString();
export function fingerprint(key: KeyObject): string {
  return `SHA256:${createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('base64').replace(/=+$/, '')}`;
}
const bytes = (unsigned: Omit<BundleSignature, 'signature'>) => Buffer.concat([Buffer.from(DOMAIN, 'utf8'), canonicalBytes(unsigned)]);

/** A new Ed25519 key: the private half stays on this machine, the public half is committed as trusted. */
export function keygen(root: string, testDir: string, name: string, keysDir = join(root, '.tracegrove', 'keys')): { privateKey: string; publicKey: string; fingerprint: string } {
  if (!SignerName.safeParse(name).success) throw new Blocked([{ code: 'invalid_argument', detail: `signer name ${name}: use letters, digits, . _ -`, owner: 'agent', action: 'tracegrove keygen --name ci' }]);
  const privateKey = join(keysDir, `${name}.pem`);
  const publicKey = join(root, testDir, 'signers', `${name}.pub`);
  if (existsSync(privateKey) || existsSync(publicKey)) throw new Blocked([{ code: 'already_exists', detail: `a key named ${name} already exists`, owner: 'developer', action: 'choose another --name, or delete the old key on purpose' }]);
  const pair = generateKeyPairSync('ed25519');
  mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  writeFileSync(privateKey, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  mkdirSync(join(root, testDir, 'signers'), { recursive: true });
  writeFileSync(publicKey, publicPem(pair.publicKey), { flag: 'wx' });
  return { privateKey, publicKey, fingerprint: fingerprint(pair.publicKey) };
}

/** The signing key: --key <file>, else TRACEGROVE_SIGNING_KEY (PEM text, or a path), else the only key in .tracegrove/keys. */
export function loadSigningKey(root: string, keyFile: string | null, env: NodeJS.ProcessEnv = process.env): { key: KeyObject; name: string } {
  const fromEnv = env.TRACEGROVE_SIGNING_KEY?.trim();
  let pem: string | null = null; let name = env.TRACEGROVE_SIGNER?.trim() || '';
  if (keyFile) { pem = readFileSync(keyFile, 'utf8'); name ||= basename(keyFile).replace(/\.pem$/, ''); }
  else if (fromEnv) { pem = fromEnv.startsWith('-----BEGIN') ? fromEnv : readFileSync(fromEnv, 'utf8'); name ||= fromEnv.startsWith('-----BEGIN') ? 'ci' : basename(fromEnv).replace(/\.pem$/, ''); }
  else {
    const dir = join(root, '.tracegrove', 'keys');
    const keys = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.pem')) : [];
    if (keys.length !== 1) throw new Blocked([{ code: 'signing_key_missing', detail: keys.length ? `${keys.length} keys in .tracegrove/keys; say which` : 'no signing key', owner: 'developer', action: keys.length ? 'tracegrove sign --key .tracegrove/keys/<name>.pem' : 'tracegrove keygen --name <you>, or set TRACEGROVE_SIGNING_KEY in CI' }]);
    pem = readFileSync(join(dir, keys[0]!), 'utf8'); name ||= keys[0]!.replace(/\.pem$/, '');
  }
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Blocked([{ code: 'signing_key_invalid', detail: `the signing key is ${key.asymmetricKeyType}, not ed25519`, owner: 'developer', action: 'tracegrove keygen --name <you>' }]);
  return { key, name: SignerName.safeParse(name).success ? name : 'signer' };
}

/** Sign one run whose bundle verifies. Refuses a bundle that doesn't: a signature vouches for verified evidence only. */
export function signRun(runDir: string, signing: { key: KeyObject; name: string }, now = new Date()): BundleSignature {
  let records: ReturnType<typeof readVerifiedBundle>;
  try { records = readVerifiedBundle(join(runDir, 'bundle')); }
  catch (error) { throw new Blocked([{ code: 'bundle_invalid', detail: error instanceof Error ? error.message : 'the bundle does not verify', owner: 'developer', action: 'rerun tracegrove test; only verified bundles are signed' }]); }
  const pub = createPublicKey(signing.key);
  const unsigned = {
    schemaVersion: 'tracegrove.bundle-signature/v1' as const, algorithm: 'ed25519' as const, run: basename(runDir),
    manifestDigest: digestText(records.manifestDigest), outcome: records.campaign.outcome,
    signer: { name: signing.name, fingerprint: fingerprint(pub), publicKey: publicPem(pub) }, signedAt: now.toISOString(),
  };
  const signature = BundleSignature.parse({ ...unsigned, signature: sign(null, bytes(unsigned), signing.key).toString('base64url') });
  writeFileSync(join(runDir, SIGNATURE_FILE), `${JSON.stringify(signature, null, 2)}\n`);
  return signature;
}

/** Fingerprints of the committed public keys, by signer name. */
export function trustedSigners(signersDir: string): Map<string, string> {
  const trusted = new Map<string, string>();
  if (!existsSync(signersDir)) return trusted;
  for (const file of readdirSync(signersDir).filter((f) => f.endsWith('.pub'))) {
    try { trusted.set(fingerprint(createPublicKey(readFileSync(join(signersDir, file), 'utf8'))), file.replace(/\.pub$/, '')); } catch { /* not a key */ }
  }
  return trusted;
}

/** Check signature.json beside a bundle: present, valid, about this exact bundle, and from a committed key. */
export function checkSignature(runDir: string, signersDir: string | null): SignatureCheck {
  const file = join(runDir, SIGNATURE_FILE);
  if (!existsSync(file)) return { state: 'unsigned' };
  let envelope: BundleSignature;
  try { envelope = BundleSignature.parse(JSON.parse(readFileSync(file, 'utf8'))); } catch { return { state: 'invalid', detail: `${SIGNATURE_FILE} is not a tracegrove signature` }; }
  const { signature, ...unsigned } = envelope;
  let key: KeyObject;
  try { key = createPublicKey(envelope.signer.publicKey); } catch { return { state: 'invalid', detail: 'the signer public key does not parse' }; }
  if (key.asymmetricKeyType !== 'ed25519' || fingerprint(key) !== envelope.signer.fingerprint) return { state: 'invalid', detail: 'the signer key does not match its fingerprint' };
  if (!verify(null, bytes(unsigned), key, Buffer.from(signature, 'base64url'))) return { state: 'invalid', detail: 'the signature does not match' };
  let records: ReturnType<typeof readVerifiedBundle>;
  try { records = readVerifiedBundle(join(runDir, 'bundle')); } catch { return { state: 'invalid', detail: 'the bundle it signs no longer verifies' }; }
  if (digestText(records.manifestDigest) !== envelope.manifestDigest || records.campaign.outcome !== envelope.outcome) return { state: 'invalid', detail: 'the signature is for a different bundle' };
  const trusted = signersDir ? trustedSigners(signersDir).get(envelope.signer.fingerprint) : undefined;
  return { state: trusted ? 'trusted' : 'untrusted', signer: trusted ?? envelope.signer.name, fingerprint: envelope.signer.fingerprint, signedAt: envelope.signedAt };
}

export function describeSignature(check: SignatureCheck): string {
  switch (check.state) {
    case 'unsigned': return 'unsigned';
    case 'invalid': return `signature INVALID: ${check.detail}`;
    case 'trusted': return `signed by ${check.signer} (trusted key ${check.fingerprint.slice(0, 19)}…)`;
    case 'untrusted': return `signed by ${check.signer}, but key ${check.fingerprint.slice(0, 19)}… is not in tracegrove/signers/`;
  }
}

export type SignatureSummary = { runs: number; trusted: number; untrusted: number; invalid: number; unsigned: number; signers: string[]; problems: string[] };

/** Signature state across the runs behind a set of claims, for the card and the handoff report. */
export function summarizeSignatures(root: string, testDir: string, runs: Array<string | null>, resolveRunDir: (name: string) => string | null): SignatureSummary {
  const signersDir = join(root, testDir, 'signers');
  const summary: SignatureSummary = { runs: 0, trusted: 0, untrusted: 0, invalid: 0, unsigned: 0, signers: [], problems: [] };
  for (const run of new Set(runs.filter((r): r is string => !!r))) {
    const dir = resolveRunDir(run);
    if (!dir) continue;
    const check = checkSignature(dir, signersDir);
    summary.runs += 1; summary[check.state] += 1;
    if ((check.state === 'trusted' || check.state === 'untrusted') && !summary.signers.includes(check.signer)) summary.signers.push(check.signer);
    if (check.state === 'invalid') summary.problems.push(`${run}: ${check.detail}`);
  }
  return summary;
}

export function signatureSentence(s: SignatureSummary): string {
  if (!s.runs) return 'No saved run to check for a signature.';
  if (s.invalid) return `${s.invalid} of ${s.runs} run${s.runs === 1 ? '' : 's'} carr${s.invalid === 1 ? 'ies' : 'y'} a signature that does not verify (${s.problems.join('; ')}); do not trust ${s.invalid === 1 ? 'it' : 'them'}.`;
  if (s.trusted === s.runs) return `Every run behind these claims is signed by ${s.signers.join(', ')}, with a key committed in the repository's signers/ folder, and the signature covers the exact evidence bundle.`;
  const parts = [s.trusted ? `${s.trusted} signed by a trusted key` : null, s.untrusted ? `${s.untrusted} signed by a key not in signers/` : null, s.unsigned ? `${s.unsigned} unsigned` : null].filter(Boolean);
  return `Of ${s.runs} run${s.runs === 1 ? '' : 's'}: ${parts.join(', ')}. Unsigned evidence is integrity-checked but only as trustworthy as whoever sent it.`;
}
