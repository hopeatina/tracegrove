import { posix } from 'node:path';
import { GitSourceResolution, SourceSelection, TargetTuple, digestOfValue, freeze, sameRef, sameScope, verifySelfDigest,
  type GitSnapshotBinding, type RevisionMatrix } from '../protocol/index.ts';
import { verifyGitSnapshotProofMetadata } from '../source/gitObjectProof.ts';
import { GIT_RESOLVER_REF } from './gitSources.ts';
import { Conflict } from './errors.ts';

// v1: all recognized lockfiles at any depth, with their complete pinned path/mode/digest.
// An empty manifest has an explicit digest; this is not dependency-install evidence.
const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb',
  'uv.lock', 'poetry.lock', 'Pipfile.lock', 'Cargo.lock', 'Gemfile.lock', 'composer.lock', 'go.sum']);

/** Expected descriptor only. Callers must independently establish actual_file_bytes before observing it. */
export function snapshotRepository(pin: GitSnapshotBinding): TargetTuple['repositories'][number] {
  if (!pin.repositoryRole || !verifySelfDigest(pin.snapshot)) throw new Conflict('repository binding needs a sealed snapshot and explicit role');
  const proof = verifyGitSnapshotProofMetadata(pin.snapshot).binding;
  const lockfiles = pin.snapshot.files.filter(file => LOCKFILES.has(posix.basename(file.path)))
    .map(({ path, mode, digest }) => ({ path, mode, digest })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return TargetTuple.shape.repositories.element.parse({ repositoryRole: pin.repositoryRole,
    canonicalUrl: `urn:tracegrove:git-object:${proof.algorithm}:${proof.commit}`, requestedRef: proof.commit,
    resolvedCommit: proof.commit, origin: 'snapshot_bundle', sourceObjectsRef: pin.snapshot.ref,
    lockfileDigest: digestOfValue({ schemaVersion: 'tracegrove.lockfile-manifest/v1', files: lockfiles }), dirty: false });
}

export function snapshotRevision(pin: GitSnapshotBinding, matrix: RevisionMatrix) {
  if (!verifySelfDigest(matrix) || !sameScope(matrix.scope, pin.snapshot.scope) || matrix.repositories.length !== 1)
    throw new Conflict('snapshot repository binding requires one sealed, same-scope revision matrix');
  const row = matrix.repositories[0]!;
  if (pin.snapshot.side !== 'head' || !sameRef(row.repositoryRef, pin.snapshot.repositoryRef) || row.headCommit !== pin.snapshot.commit || !sameRef(row.resolverRef, GIT_RESOLVER_REF))
    throw new Conflict('snapshot repository binding must run the registered resolver matrix head');
  return row;
}

/** One opt-in source selection for one complete pinned repository. Never invent remote provenance. */
export function snapshotSourceSelection(pin: GitSnapshotBinding, input: unknown): { selection: SourceSelection; matrix: RevisionMatrix } {
  const resolution = GitSourceResolution.parse(input);
  if (!verifySelfDigest(resolution) || !sameRef(resolution.ref, pin.snapshot.resolutionRef) || !sameScope(resolution.scope, pin.snapshot.scope))
    throw new Conflict('snapshot resolution sidecar differs from the sealed source binding');
  const row = snapshotRevision(pin, resolution.matrix); const repository = snapshotRepository(pin);
  const selection = SourceSelection.parse(freeze({ schemaVersion: 'workflow.source-selection/v1' as const,
    ref: { id: `snapshot-selection-${digestOfValue({ snapshot: pin.snapshot.ref, role: pin.repositoryRole }).hex}`, revision: '1' },
    scope: pin.snapshot.scope, draftRevision: 0, strategy: 'commit_pair' as const,
    repositories: [{ repositoryRole: repository.repositoryRole, canonicalUrl: repository.canonicalUrl,
      requestedExpression: row.requestedRef, headCommit: row.headCommit, baseCommit: row.baseCommit,
      origin: repository.origin, sourceObjectsRef: pin.snapshot.ref, lockfileDigest: repository.lockfileDigest,
      resolvedAt: resolution.matrix.resolvedAt, resolverRef: row.resolverRef }],
    excludedRoles: [], compatibilityRuleRefs: [], revisionMatrixRef: resolution.matrix.ref }));
  return { selection, matrix: resolution.matrix };
}
