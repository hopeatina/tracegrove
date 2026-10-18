/** Compatibility entry point; all product facts use the shared verified capture. */
import { join } from 'node:path';
import { readSavedRun as readCheckedRun } from './runSource.ts';
import { SavedRunName } from './runReport.ts';
import { isRunDirectory } from './runLocation.ts';
export type SavedRunReport = ReturnType<typeof readCheckedRun>;
export function readSavedRun(root: string, name: string): SavedRunReport {
  SavedRunName.parse(name);
  let directory = root;
  for (const part of ['.tracegrove', 'runs', name]) {
    directory = join(directory, part);
    if (!isRunDirectory(directory)) throw new Error('Saved run is unavailable or invalid.');
  }
  return readCheckedRun(directory);
}
