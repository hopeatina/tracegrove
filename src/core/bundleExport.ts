import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sameDigest } from '../protocol/index.ts';
import { VerifiedBundleSnapshot } from './bundle.ts';
import { ensureBundleDirectory, writeCapturedBundleFiles } from './bundleFiles.ts';
import { Conflict } from './errors.ts';
import { syncPath } from './fsDurability.ts';

/** Export only sealed captured bytes. Existing destinations are never merged, followed or removed. */
export function exportVerifiedBundle(snapshot: VerifiedBundleSnapshot, output: string) {
  if (!(snapshot instanceof VerifiedBundleSnapshot)) throw new Conflict('Export requires a captured verified bundle');
  const target = resolve(output); const parent = dirname(target);
  ensureBundleDirectory(parent);
  try { mkdirSync(target, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Conflict('Export destination already exists; choose a new directory'); throw error; }
  try {
    writeCapturedBundleFiles(snapshot, target);
    const checked = VerifiedBundleSnapshot.open(target);
    if (!sameDigest(checked.manifestDigest, snapshot.manifestDigest)) throw new Conflict('Exported bundle differs from captured evidence');
    syncPath(parent);
    return { output: target, manifestDigest: checked.manifestDigest, verification: checked.records.verification };
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error; }
}
