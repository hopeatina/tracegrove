import { z } from 'zod';
import { RefSchema, ScopeSchema, GitRevision, RepositoryPath } from '../primitives.ts';
import { RevisionMatrix } from './source.ts';

export const GitRepositoryBinding = z.object({ repositoryRef: RefSchema, root: z.string().min(1).max(8192) }).strict();
export const GitSourceRequest = z.object({ scope: ScopeSchema, repositories: z.array(GitRepositoryBinding.extend({
  head: GitRevision, base: GitRevision,
}).strict()).min(1).max(32) }).strict();
export type GitSourceRequest = z.infer<typeof GitSourceRequest>;
export const GitSourceResolution = z.object({ schemaVersion: z.literal('workflow.git-source-resolution/v1'), ref: RefSchema,
  scope: ScopeSchema, matrix: RevisionMatrix,
  changes: z.array(z.object({ repositoryRef: RefSchema, path: RepositoryPath, status: z.enum(['A', 'D', 'M', 'T']),
    baseBlobRef: RefSchema.nullable(), headBlobRef: RefSchema.nullable() }).strict()).max(500),
  payloads: z.array(z.object({ ref: RefSchema, base64: z.string().max(6 * 1024 * 1024) }).strict()).min(1).max(1032),
}).strict();
export type GitSourceResolution = z.infer<typeof GitSourceResolution>;
