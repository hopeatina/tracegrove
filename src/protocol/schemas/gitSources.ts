import { z } from 'zod';
import { RefSchema, ScopeSchema, GitRevision, GitObjectId, RepositoryPath, DigestSchema } from '../primitives.ts';
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

export const GIT_SNAPSHOT_LIMITS = { files: 10_000, fileBytes: 1_048_576, totalBytes: 32 * 1024 * 1024 } as const;
export const GitSnapshotSide = z.enum(['base', 'head']);
export const GitSourceSnapshot = z.object({
  schemaVersion: z.literal('workflow.git-source-snapshot/v1'), ref: RefSchema, scope: ScopeSchema,
  resolutionRef: RefSchema, repositoryRef: RefSchema, side: GitSnapshotSide, commit: GitObjectId,
  files: z.array(z.object({ path: RepositoryPath, mode: z.enum(['100644', '100755']),
    digest: DigestSchema, bytes: z.number().int().nonnegative().max(GIT_SNAPSHOT_LIMITS.fileBytes),
  }).strict()).min(1).max(GIT_SNAPSHOT_LIMITS.files),
}).strict();
export type GitSourceSnapshot = z.infer<typeof GitSourceSnapshot>;
export const GitSnapshotBinding = z.object({ snapshot: GitSourceSnapshot, root: z.string().min(1).max(8192), cwd: z.union([z.literal('.'), RepositoryPath]) }).strict();
export type GitSnapshotBinding = z.infer<typeof GitSnapshotBinding>;
