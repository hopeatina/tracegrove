import { existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DigestSchema, sameDigest, type Digest } from '../protocol/index.ts';
import { VerifiedBundleSnapshot } from './bundle.ts';
import { Conflict } from './errors.ts';
import { syncPath } from './fsDurability.ts';

function directory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Conflict('Bundle archive path is not a real directory');
}
function present(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Single-writer protected local storage. Fully durable objects precede ledger publication. */
export class LocalBundleArchive {
  constructor(private readonly root: string) {}
  path(digest: Digest): string { return join(this.root, DigestSchema.parse(digest).hex); }
  read(digest: Digest): VerifiedBundleSnapshot {
    const root = lstatSync(this.root);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Conflict('Bundle archive root is not a real directory');
    const snapshot = VerifiedBundleSnapshot.open(this.path(digest));
    if (!sameDigest(snapshot.manifestDigest, digest)) throw new Conflict('Retained bundle manifest changed');
    return snapshot;
  }
  put(snapshot: VerifiedBundleSnapshot): VerifiedBundleSnapshot {
    directory(this.root); syncPath(dirname(this.root)); const digest = snapshot.manifestDigest; const target = this.path(digest);
    if (present(target)) { const retained = this.read(digest); syncPath(this.root); return retained; }
    const staging = mkdtempSync(join(this.root, '.ingest-'));
    try {
      const directories = new Set([staging]);
      for (const path of snapshot.paths()) {
        const parts = path.split('/'); let parent = staging;
        for (const part of parts.slice(0, -1)) { parent = join(parent, part); directory(parent); directories.add(parent); }
        const file = join(staging, ...parts); writeFileSync(file, snapshot.read(path), { flag: 'wx', mode: 0o600 }); syncPath(file);
      }
      for (const path of [...directories].sort((a, b) => b.length - a.length)) syncPath(path);
      renameSync(staging, target); syncPath(this.root);
      return this.read(digest);
    } finally { if (existsSync(staging)) rmSync(staging, { recursive: true, force: true }); }
  }
}
