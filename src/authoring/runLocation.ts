import { lstatSync } from 'node:fs';

/** A removed/renamed run is unavailable, never a history-wide read failure. */
export function isRunDirectory(path: string): boolean {
  try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink(); }
  catch { return false; }
}
