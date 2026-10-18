import { lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { digestOfBytes, type Digest } from '../protocol/index.ts';
import { readBoundedFile as readBounded } from './boundedFile.ts';

export const BUNDLE_SCHEMA_VERSION = 'workflow.evidence-bundle/v1';
export const BUNDLE_LIMITS = { manifestBytes: 1024 * 1024, fileBytes: 16 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, files: 10000 } as const;
const Manifest = z.object({ schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION), executionId: z.string().nullable(), campaignId: z.string(),
  reducer: z.unknown(), runner: z.unknown(), createdAt: z.string(),
  files: z.array(z.object({ path: z.string().min(1).max(2048), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative().max(BUNDLE_LIMITS.fileBytes) }).strict()).min(1).max(BUNDLE_LIMITS.files),
}).strict();
const CANDIDATE = Symbol('internal candidate manifest');

function json(bytes: Uint8Array, path: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error(`invalid JSON or UTF-8 in sealed file ${path}`); }
}

/** Sealed bytes, not issuer authority. Caller owns/authorizes the quiescent artifact directory. */
export class BundleSnapshot {
  readonly manifestDigest: Digest;
  readonly #manifestBytes: Buffer;
  readonly #files = new Map<string, Buffer>();
  /** Internal writer readback only; public verification still requires the committed manifest. */
  static fromCandidateManifest(dir: string, bytes: Uint8Array): BundleSnapshot {
    return new BundleSnapshot(dir, { token: CANDIDATE, bytes });
  }
  constructor(dir: string, candidate?: { token: typeof CANDIDATE; bytes: Uint8Array }) {
    if (!lstatSync(dir).isDirectory()) throw new Error('bundle root must be a real directory');
    if (candidate && (candidate.token !== CANDIDATE || candidate.bytes.byteLength > BUNDLE_LIMITS.manifestBytes)) throw new Error('invalid bounded candidate manifest');
    const manifestBytes = candidate ? Buffer.from(candidate.bytes) : readBounded(join(dir, 'manifest.json'), BUNDLE_LIMITS.manifestBytes);
    this.#manifestBytes = manifestBytes;
    this.manifestDigest = digestOfBytes(manifestBytes);
    const manifest = Manifest.parse(json(manifestBytes, 'manifest.json'));
    let total = 0;
    for (const file of manifest.files) {
      if (file.path === 'manifest.json' || isAbsolute(file.path) || file.path.includes('\\') || /[\x00-\x1f\x7f]/.test(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..') || this.#files.has(file.path)) {
        throw new Error(`unsafe or duplicate manifest path ${file.path}`);
      }
      total += file.bytes;
      if (total > BUNDLE_LIMITS.totalBytes) throw new Error('bundle exceeds the total byte bound');
      let segment = dir;
      for (const part of file.path.split('/')) {
        segment = join(segment, part);
        if (lstatSync(segment).isSymbolicLink()) throw new Error(`symlink in bundle ${file.path}`);
      }
      const bytes = readBounded(join(dir, file.path), BUNDLE_LIMITS.fileBytes, file.bytes);
      if (digestOfBytes(bytes).hex !== file.sha256) throw new Error(`hash mismatch ${file.path}`);
      this.#files.set(file.path, bytes);
    }
  }
  has(path: string): boolean { return this.#files.has(path); }
  manifestBytes(): Buffer { return Buffer.from(this.#manifestBytes); }
  paths(): string[] { return [...this.#files.keys()]; }
  read(path: string): Buffer {
    const bytes = this.#files.get(path);
    if (!bytes) throw new Error(`unsealed required file ${path}`);
    return Buffer.from(bytes);
  }
  json(path: string): unknown { return json(this.read(path), path); }
}
