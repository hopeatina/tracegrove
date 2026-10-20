import { lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { NativeObservationSnapshot, exportImportedObservations, readImportedObservations, NativeObservationError } from '../imports/index.ts';
import { createDurableDirectory, requireRealDirectory } from '../core/atomicFiles.ts';
import { bundlePathPresent } from '../core/bundleFiles.ts';
import { sameRef } from '../protocol/index.ts';
import { SavedRunName } from './runReport.ts';
import { projectCollectionDirectory } from './runLocation.ts';

export const NativeImportName = SavedRunName.refine(name => name !== 'latest' && !name.endsWith('.import-lock'), 'Select a named import.');
export const NativeImportEntry = z.object({ name: NativeImportName, storedAt: z.string().datetime(), inspection: z.literal('not_checked') }).strict();
export type NativeImportEntry = z.infer<typeof NativeImportEntry>;
export const NATIVE_IMPORT_LIMIT = 500;
function collection(root: string): string | null {
  requireRealDirectory(resolve(root)); let path = resolve(root);
  for (const part of ['.tracegrove', 'imports']) {
    path = join(path, part); if (!bundlePathPresent(path)) return null; requireRealDirectory(path);
  }
  return path;
}
/** Directory metadata only. Selection separately reparses the complete native archive. No corrupt entry is hidden. */
export function listNativeImports(root: string): NativeImportEntry[] {
  const path = collection(root); if (!path) return [];
  const names = readdirSync(path).filter(name => NativeImportName.safeParse(name).success && !name.startsWith('.'));
  if (names.length > NATIVE_IMPORT_LIMIT) throw new NativeObservationError('native_output_conflict');
  return names.map(name => NativeImportEntry.parse({ name, storedAt: lstatSync(join(path, name)).mtime.toISOString(), inspection: 'not_checked' }))
    .sort((a,b) => b.storedAt.localeCompare(a.storedAt) || a.name.localeCompare(b.name));
}
export function readNativeImport(root: string, name: string): NativeObservationSnapshot {
  try {
    NativeImportName.parse(name); requireRealDirectory(resolve(root));
    return readImportedObservations(projectCollectionDirectory(resolve(root), 'imports', name));
  } catch { throw new NativeObservationError('native_archive_invalid'); }
}
/** Repeated identical capture rechecks existing bytes. It never overwrites a different or damaged archive. */
export function retainNativeImport(root: string, snapshot: NativeObservationSnapshot) {
  const project = resolve(root); requireRealDirectory(project);
  const name = snapshot.report.ref.digest.hex, current = listNativeImports(project), path = join(project, '.tracegrove/imports', name);
  if (bundlePathPresent(path)) {
    const prior = readNativeImport(project, name);
    if (!sameRef(prior.report.ref, snapshot.report.ref)) throw new NativeObservationError('native_output_conflict');
    return { name, report: prior.report, replayed: true };
  }
  if (current.length >= NATIVE_IMPORT_LIMIT) throw new NativeObservationError('native_output_conflict');
  createDurableDirectory(join(project, '.tracegrove/imports'));
  const retained = exportImportedObservations(snapshot, path);
  return { name, report: retained.report, replayed: false };
}
