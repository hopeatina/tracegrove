import { existsSync, lstatSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DigestSchema, sameDigest, type Digest } from '../protocol/index.ts';
import { VerifiedBundleSnapshot } from './bundle.ts';
import { Conflict } from './errors.ts';
import { syncPath } from './fsDurability.ts';
import { ensureBundleDirectory, bundlePathPresent, writeCapturedBundleFiles } from './bundleFiles.ts';

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
    ensureBundleDirectory(this.root); syncPath(dirname(this.root)); const digest = snapshot.manifestDigest; const target = this.path(digest);
    if (bundlePathPresent(target)) { const retained = this.read(digest); syncPath(this.root); return retained; }
    const staging = mkdtempSync(join(this.root, '.ingest-'));
    try {
      writeCapturedBundleFiles(snapshot, staging);
      renameSync(staging, target); syncPath(this.root);
      return this.read(digest);
    } finally { if (existsSync(staging)) rmSync(staging, { recursive: true, force: true }); }
  }
}
