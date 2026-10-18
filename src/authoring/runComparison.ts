import { join } from 'node:path';
import { z } from 'zod';
import { VerifiedBundleSnapshot } from '../core/bundle.ts';
import { compareReplays } from '../core/replayComparison.ts';
import { SavedRunName } from './runReport.ts';
import { savedRunDirectory } from './runLocation.ts';

export const SavedRunPair = z.object({ baseline: SavedRunName, candidate: SavedRunName }).strict()
  .refine(pair => pair.baseline !== 'latest' && pair.candidate !== 'latest', 'Select named runs.');

/** The same verified comparison as the CLI, constrained to one workbench's retained runs. */
export function compareSavedRuns(root: string, input: unknown) {
  const pair = SavedRunPair.parse(input);
  return compareReplays(VerifiedBundleSnapshot.open(join(savedRunDirectory(root, pair.baseline), 'bundle')),
    VerifiedBundleSnapshot.open(join(savedRunDirectory(root, pair.candidate), 'bundle')));
}
