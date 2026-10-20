/** Compatibility entry point; all product facts use the shared verified capture. */
import { readSavedRun as readCheckedRun } from './runSource.ts';
import { savedRunDirectory } from './runLocation.ts';
export type SavedRunReport = ReturnType<typeof readCheckedRun>;
export function readSavedRun(root: string, name: string): SavedRunReport {
  return readCheckedRun(savedRunDirectory(root, name));
}
