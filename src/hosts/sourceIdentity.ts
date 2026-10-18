import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { digestOfBytes, sha256Hex } from '../protocol/canonical.ts';
import { HexSha256, RefSchema } from '../protocol/primitives.ts';
import { Blocked } from '../core/errors.ts';
import { GitCommitObservation } from '../protocol/schemas/gitSources.ts';

export const SourceIdentity = z.object({ hex: HexSha256, entries: z.array(z.object({ path: z.string(), sha256: HexSha256 }).strict()).min(1).max(256) }).strict();
export const SnapshotLaunchObservation = z.object({ kind: z.literal('host.source'), snapshotRef: RefSchema, identity: SourceIdentity, gitSource: GitCommitObservation.optional() }).strict();
export type SnapshotLaunchObservation = z.infer<typeof SnapshotLaunchObservation>;
export const SnapshotLaunchFailure = z.object({ kind: z.literal('host.source_failed'), stage: z.enum(['read', 'template', 'copy', 'objects', 'identity']) }).strict();

export function identityFromEntries(entries: SourceIdentity['entries']): SourceIdentity {
  const sorted = [...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { hex: digestOfBytes(sorted.map(entry => `${entry.path}\n${entry.sha256}\n`).join('')).hex, entries: sorted };
}
type SourceIdentity = z.infer<typeof SourceIdentity>;

export function sourceIdentityDigest(root: string, files: string[]): SourceIdentity {
  const entries = files.map(path => {
    const absolute = resolve(root, path); const within = relative(root, absolute);
    if (within.startsWith('..') || isAbsolute(within)) throw new Blocked([{ code: 'identity_file_outside_root', detail: path }]);
    if (!existsSync(absolute)) throw new Blocked([{ code: 'identity_file_missing', detail: path, owner: 'operator', action: 'materialize the pinned source before launching' }]);
    return { path, sha256: sha256Hex(readFileSync(absolute)) };
  });
  return identityFromEntries(entries);
}
