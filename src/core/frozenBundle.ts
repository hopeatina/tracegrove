import { z } from 'zod';
import { RunRequest } from '../protocol/index.ts';
import { readBoundedFile } from './boundedFile.ts';
import { Blocked } from './errors.ts';

const Path = z.string().min(1).max(8192);
export const PlanBlocker = z.object({ code: z.string(), detail: z.string(), owner: z.string(), action: z.string(), cellId: z.string().nullable() }).strict();
export type Blocker = z.infer<typeof PlanBlocker>;
/** Local transport envelope, not admission, review, or a product outcome. */
export const FrozenBundle = z.object({
  schemaVersion: z.literal('workflow.frozen-request-bundle/v1'), projectRoot: Path, configPath: Path, profileName: z.string().min(1).max(2048),
  request: RunRequest.nullable(), blockers: z.array(PlanBlocker).max(10000),
  excludedCells: z.array(z.object({ cellKey: z.string(), reason: z.string() }).strict()).max(10000),
  estimatedCostCents: z.number().int().nonnegative(), requirements: z.array(z.string()).max(10000),
  documents: z.record(z.string().min(1).max(8192), z.unknown()).refine(value => Object.keys(value).length <= 10000, 'too many frozen documents'),
}).strict();
export type FrozenBundle = z.infer<typeof FrozenBundle>;
export const FROZEN_BUNDLE_MAX_BYTES = 96 * 1024 * 1024;
export function readFrozenBundle(path: string): FrozenBundle {
  try { return FrozenBundle.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(path, FROZEN_BUNDLE_MAX_BYTES)))); }
  catch { throw new Blocked([{ code: 'invalid_request_file', detail: path, owner: 'operator', action: 'pass a bounded regular frozen request written by plan' }]); }
}
