import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { SavedRunName } from './runReport.ts';

/** A removed/renamed run is unavailable, never a history-wide read failure. */
export function isRunDirectory(path: string): boolean {
  try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink(); }
  catch { return false; }
}

/** Resolve one named run through real owned collection directories; aliases are not input names. */
export function savedRunDirectory(root: string, name: string): string {
  return projectCollectionDirectory(root, 'runs', name);
}
/** Named project collections share the same traversal/link refusal; their payload readers remain distinct. */
export function projectCollectionDirectory(root: string, collection: 'runs' | 'imports', name: string): string {
  SavedRunName.parse(name);
  if (name === 'latest') throw new Error('Select a named run.');
  let directory = root;
  for (const part of ['.tracegrove', collection, name]) {
    directory = join(directory, part);
    if (!isRunDirectory(directory)) throw new Error('Saved run is unavailable or invalid.');
  }
  return directory;
}
