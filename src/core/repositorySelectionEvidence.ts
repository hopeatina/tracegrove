import { GitSourceSnapshot, HostPlan, PlanReview, PlanSourceValidation, RevisionMatrix, SourcePlan, SourceSelection, digestOfValue, refKey, sameRef, sameScope,
  verifySelfDigest, type Ref, type RunRequest, type SelectionManifest } from '../protocol/index.ts';
import { snapshotRepository, snapshotRevision } from './snapshotRepository.ts';
import { validateReviewedSourceDocuments } from './sourceReviewEvidence.ts';

/** Frozen source closure, shared by preflight, saved evidence and revision assessment. No effects. */
export function repositorySelectionProblems(request: RunRequest, cell: SelectionManifest['cells'][number], host: HostPlan,
  documents: Record<string, unknown>): string[] {
  const pin = host.launch?.sourceSnapshot;
  if (!request.sourceSelectionRef && !cell.sourceSelectionRef && !pin?.repositoryRole) return [];
  try {
    const read = <T extends { ref: Ref }>(schema: { parse(value: unknown): T }, ref: Ref): T => {
      const value = schema.parse(documents[refKey(ref)]);
      if (!sameRef(value.ref, ref) || !verifySelfDigest(value)) throw new Error('source closure document digest mismatch');
      return value;
    };
    if (!request.sourceSelectionRef || !cell.sourceSelectionRef || !sameRef(request.sourceSelectionRef, cell.sourceSelectionRef) || !pin?.repositoryRole)
      throw new Error('source selection needs matching request, cell and pinned repository role');
    const source = read(SourceSelection, request.sourceSelectionRef);
    if (!sameScope(source.scope, request.requestedScope) || !sameScope(pin.snapshot.scope, source.scope) || !source.revisionMatrixRef)
      throw new Error('source selection scope or revision matrix missing');
    const matrix = read(RevisionMatrix, source.revisionMatrixRef); const row = snapshotRevision(pin, matrix);
    const snapshot = read(GitSourceSnapshot, pin.snapshot.ref);
    if (digestOfValue(snapshot).hex !== digestOfValue(pin.snapshot).hex) throw new Error('source snapshot document differs from host pin');
    const expected = snapshotRepository(pin); const repository = source.repositories[0];
    if (source.repositories.length !== 1 || source.excludedRoles.length || source.compatibilityRuleRefs.length || source.strategy !== 'commit_pair' || !repository ||
      repository.repositoryRole !== expected.repositoryRole || repository.canonicalUrl !== expected.canonicalUrl ||
      repository.headCommit !== row.headCommit || repository.baseCommit !== row.baseCommit || repository.requestedExpression !== row.requestedRef ||
      repository.resolvedAt !== matrix.resolvedAt || !repository.resolverRef || !sameRef(repository.resolverRef, row.resolverRef) ||
      repository.origin !== expected.origin || !repository.sourceObjectsRef || !sameRef(repository.sourceObjectsRef, snapshot.ref) ||
      digestOfValue(repository.lockfileDigest).hex !== digestOfValue(expected.lockfileDigest).hex)
      throw new Error('source selection differs from the complete pinned resolver head');
    for (const target of [request.expectedTarget, cell.expectedTarget]) {
      if (!target || digestOfValue(target.repositories).hex !== digestOfValue([expected]).hex) throw new Error('target repository differs from frozen source selection');
    }
    if (request.sourcePlanRef) {
      const plan = read(SourcePlan, request.sourcePlanRef);
      if (!sameScope(plan.scope, source.scope) || !sameRef(plan.revisionMatrixRef, matrix.ref)) throw new Error('reviewed source plan selects a different revision matrix');
      if (!request.reviewRef) throw new Error('source-backed repository binding requires its approved review');
      const review = read(PlanReview, request.reviewRef);
      const validationRef = [...review.reasonRefs].reverse().find(ref => PlanSourceValidation.safeParse(documents[refKey(ref)]).success);
      if (!validationRef) throw new Error('source-backed repository binding requires persisted source validation');
      const validation = read(PlanSourceValidation, validationRef);
      validateReviewedSourceDocuments({ plan, review, validation }, source.scope);
    }
    return [];
  } catch (error) { return [`repository source binding invalid: ${(error as Error).message}`]; }
}
