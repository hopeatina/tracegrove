import { z } from 'zod';
import { GitRepositoryBinding, GitSourceRequest, GitSourceResolution, RevisionMatrix, digestOfBytes, digestOfValue, freeze, refKey, sameDigest, sameRef, sameScope, verifySelfDigest,
  type Ref, type Scope } from '../protocol/index.ts';
import { GitRepository } from '../source/git.ts';
import { SourceCitation, type SourceCitationPorts } from './source-citation.ts';
import { Conflict } from './errors.ts';
import { newId, nowIso } from './clock.ts';

export { GitSourceRequest, GitSourceResolution } from '../protocol/index.ts';
export type GitSourceAuthorization = SourceCitationPorts['authorize'];
export const GIT_RESOLVER_REF: Ref = { id: 'tracegrove.git-object-resolver', revision: '0.1.0',
  digest: digestOfValue({ kind: 'git-commit-pair', version: 1, renames: false, externalDiff: false, textconv: false, lazyFetch: false }) };

/** Freeze complete local commit-pair source facts. No fetch, checkout, model, review or product verdict. */
export async function resolveGitSources(input: unknown, authorize: GitSourceAuthorization): Promise<GitSourceResolution> {
  const request = GitSourceRequest.parse(input);
  if (new Set(request.repositories.map(r => refKey(r.repositoryRef))).size !== request.repositories.length ||
      new Set(request.repositories.map(r => r.repositoryRef.id)).size !== request.repositories.length) throw new Conflict('duplicate source repository identity');
  const payloads = new Map<string, { ref: Ref; base64: string }>();
  const changes: GitSourceResolution['changes'] = [];
  const repositories: RevisionMatrix['repositories'] = [];
  let total = 0;
  const capture = (id: string, bytes: Buffer): Ref => {
    const ref = { id, revision: '1', digest: digestOfBytes(bytes) }; const key = refKey(ref);
    if (!payloads.has(key)) {
      total += bytes.length; if (total > 32 * 1024 * 1024) throw new Conflict('complete source resolution exceeds 32 MiB');
      payloads.set(key, { ref, base64: bytes.toString('base64') });
    }
    return ref;
  };
  for (const selected of request.repositories) {
    await authorize(structuredClone(request.scope), structuredClone(selected.repositoryRef));
    const git = new GitRepository(selected.root);
    const head = git.commit(selected.head); const base = git.commit(selected.base); const merge = git.mergeBase(base, head);
    const changedFileRefs: Ref[] = [];
    for (const change of git.changes(base, head)) {
      if (changes.length >= 500) throw new Conflict('complete multi-repository source resolution exceeds 500 changes');
      const blob = (revision: string, id: string, mode: string) => mode === '000000' ? null : capture(
        `source-file-${digestOfValue({ repository: selected.repositoryRef, revision, path: change.path }).hex}`, git.blob(id));
      const baseBlobRef = blob(base, change.oldId, change.oldMode); const headBlobRef = blob(head, change.newId, change.newMode);
      changes.push({ repositoryRef: selected.repositoryRef, path: change.path, status: change.status, baseBlobRef, headBlobRef });
      changedFileRefs.push((headBlobRef ?? baseBlobRef)!);
    }
    const diffRef = capture(`source-diff-${digestOfValue({ repository: selected.repositoryRef, base, head }).hex}`, git.diff(base, head));
    repositories.push({ repositoryRef: selected.repositoryRef, requestedRef: selected.head, requestedBaseRef: selected.base,
      headCommit: head, baseCommit: base, mergeBaseCommit: merge.commit, mergeBaseAbsentReason: merge.reason,
      diffRef, changedFileRefs, resolverRef: GIT_RESOLVER_REF });
  }
  const matrix = RevisionMatrix.parse(freeze({ schemaVersion: 'workflow.revisions/v1', ref: { id: newId('git-revisions'), revision: '1' },
    scope: request.scope, repositories, resolvedAt: nowIso() }));
  return GitSourceResolution.parse(freeze({ schemaVersion: 'workflow.git-source-resolution/v1' as const, ref: { id: newId('git-source-resolution'), revision: '1' },
    scope: request.scope, matrix, changes, payloads: [...payloads.values()] }));
}

/** Reopen selected immutable objects after restart. The trusted host owns repository mappings and authorization. */
export class GitSourceReader implements SourceCitationPorts {
  private readonly matrix: RevisionMatrix;
  private readonly bindings: Map<string, z.infer<typeof GitRepositoryBinding>>;
  constructor(matrix: unknown, bindings: unknown, private readonly admission: GitSourceAuthorization) {
    this.matrix = RevisionMatrix.parse(matrix);
    if (!verifySelfDigest(this.matrix)) throw new Conflict('source matrix digest mismatch');
    const parsed = z.array(GitRepositoryBinding).min(1).max(32).parse(bindings);
    this.bindings = new Map(parsed.map(binding => [refKey(binding.repositoryRef), binding]));
    if (this.bindings.size !== parsed.length || this.matrix.repositories.some(repo => !this.bindings.has(refKey(repo.repositoryRef)))) throw new Conflict('source matrix repository binding is missing or duplicated');
  }
  async authorize(scope: Scope, repositoryRef: Ref): Promise<void> {
    if (!sameScope(scope, this.matrix.scope) || !this.matrix.repositories.some(r => sameRef(r.repositoryRef, repositoryRef))) throw new Conflict('source read scope or repository mismatch');
    await this.admission(structuredClone(scope), structuredClone(repositoryRef));
  }
  async readFile(scope: Scope, input: SourceCitation) {
    const citation = SourceCitation.parse(input); await this.authorize(scope, citation.repositoryRef);
    const row = this.matrix.repositories.find(row => sameRef(row.repositoryRef, citation.repositoryRef))!;
    if (![row.headCommit, row.baseCommit, row.mergeBaseCommit].includes(citation.resolvedCommit)) throw new Conflict('source citation is outside selected immutable revisions');
    const bytes = new GitRepository(this.bindings.get(refKey(row.repositoryRef))!.root).file(citation.resolvedCommit, citation.path);
    return { repositoryRef: structuredClone(row.repositoryRef), resolvedCommit: citation.resolvedCommit, path: citation.path, bytes };
  }
  async readDiff(scope: Scope, repository: RevisionMatrix['repositories'][number]): Promise<Uint8Array> {
    const row = this.matrix.repositories.find(row => sameRef(row.repositoryRef, repository.repositoryRef));
    if (!row || !sameDigest(digestOfValue(row), digestOfValue(repository))) throw new Conflict('source diff revision binding differs from the frozen matrix');
    await this.authorize(scope, row.repositoryRef);
    const bytes = new GitRepository(this.bindings.get(refKey(row.repositoryRef))!.root).diff(row.baseCommit, row.headCommit);
    if (!sameDigest(digestOfBytes(bytes), row.diffRef.digest)) throw new Conflict('full immutable source diff changed');
    return bytes;
  }
}
