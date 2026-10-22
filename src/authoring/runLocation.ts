import { lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
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

/**
 * Where a grow's runs are saved: beside the config it ran with, as it recorded that config relative to `dir`
 * (`dogfood/tracegrove.config.yaml` saves them under `dogfood/.tracegrove/runs`). Null for a path that leaves `dir` or passes
 * through a link. A folder that is not there is still its place: its runs are simply not saved there.
 */
export function configRunsRoot(dir: string, config: string): string | null {
  if (!config || isAbsolute(config) || config.includes('\0')) return null;
  const parts = config.split(/[\\/]+/).slice(0, -1).filter((p) => p && p !== '.');
  if (parts.includes('..')) return null;
  let root = dir;
  for (const part of parts) {
    root = join(root, part);
    try { if (lstatSync(root).isSymbolicLink()) return null; } catch { /* not there */ }
  }
  return root;
}
