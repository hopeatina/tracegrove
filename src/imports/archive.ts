import { mkdirSync, mkdtempSync, renameSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ImportedObservations, canonicalize } from '../protocol/index.ts';
import { requireRealDirectory, syncDirectory, writeExclusiveDurable } from '../core/atomicFiles.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { Conflict } from '../core/errors.ts';
import { bundlePathPresent } from '../core/bundleFiles.ts';
import { IMPORT_LIMITS } from './normalize.ts';
import { NativeObservationSnapshot } from './snapshot.ts';
import { NativeObservationError } from './errors.ts';

export function readImportedObservations(directory: string): NativeObservationSnapshot {
  try {
    const root = resolve(directory); requireRealDirectory(root);
    const report = ImportedObservations.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(join(root, 'import.json'), IMPORT_LIMITS.artifactBytes))));
    return NativeObservationSnapshot.restore(report, readBoundedFile(join(root, 'source.bin'), IMPORT_LIMITS.reportBytes, report.source.byteCount),
      (digest, bytes) => { requireRealDirectory(join(root, 'artifacts')); return readBoundedFile(join(root, 'artifacts', digest.hex), IMPORT_LIMITS.artifactBytes, bytes); });
  } catch { throw new NativeObservationError('native_archive_invalid'); }
}
/** Local protected publication. A final directory appears only after captured payloads and report are synced. */
export function exportImportedObservations(snapshot: NativeObservationSnapshot, output: string): NativeObservationSnapshot {
  if (!(snapshot instanceof NativeObservationSnapshot)) throw new Conflict('Native capture is required');
  const target = resolve(output), parent = dirname(target), lock = `${target}.import-lock`; requireRealDirectory(parent);
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new NativeObservationError('native_output_conflict'); throw error; }
  let staging: string | null = null;
  try {
    if (bundlePathPresent(target)) throw new NativeObservationError('native_output_conflict');
    staging = mkdtempSync(join(parent, '.native-import-')); const report = snapshot.report;
    writeExclusiveDurable(join(staging, 'source.bin'), snapshot.source());
    const captured = report.attachments.filter(a => a.state === 'captured');
    if (captured.length) {
      const assets = join(staging, 'artifacts'); mkdirSync(assets, { mode: 0o700 });
      for (const digest of new Map(captured.map(a => [a.digest!.hex, a.digest!])).values()) writeExclusiveDurable(join(assets, digest.hex), snapshot.artifact(digest));
      syncDirectory(assets);
    }
    const bytes = Buffer.from(canonicalize(report)); if (bytes.length > IMPORT_LIMITS.artifactBytes) throw new Conflict('Normalized native report exceeds its byte limit');
    writeExclusiveDurable(join(staging, 'import.json'), bytes); syncDirectory(staging);
    readImportedObservations(staging); renameSync(staging, target); staging = null; syncDirectory(parent);
    return readImportedObservations(target);
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true }); rmdirSync(lock);
  }
}
