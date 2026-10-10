import { z } from 'zod';
import { IdString, LIMITS, RefSchema, ScopeSchema } from '../primitives.ts';

export const CorpusManifest = z.object({
  schemaVersion: z.literal('workflow.corpus/v1'),
  ref: RefSchema,
  scope: ScopeSchema,
  projectId: IdString,
  members: z.array(z.object({ ref: RefSchema, schemaVersion: z.string().max(64), sourcePath: z.string().max(LIMITS.shortText), sourceDigest: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).max(LIMITS.bigList),
}).strict();
export type CorpusManifest = z.infer<typeof CorpusManifest>;
