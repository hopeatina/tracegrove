import { z } from 'zod';
import { GitObjectId, RefSchema } from '../protocol/primitives.ts';

export const VerificationSourceSelection = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('working_tree') }).strict(),
  z.object({ kind: z.literal('snapshot'), path: z.string().min(1).max(8192), ref: RefSchema }).strict(),
]);
export type VerificationSourceSelection = z.infer<typeof VerificationSourceSelection>;

/** Describes requested local input; never grants remote identity or qualification. */
export const VerificationSourceBinding = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('working_tree') }).strict(),
  z.object({ kind: z.literal('snapshot'), ref: RefSchema, commit: GitObjectId,
    files: z.number().int().positive(), bytes: z.number().int().nonnegative() }).strict(),
]);
export type VerificationSourceBinding = z.infer<typeof VerificationSourceBinding>;
