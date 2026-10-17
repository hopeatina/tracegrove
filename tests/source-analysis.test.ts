import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChangeModel, RevisionMatrix, SourcePlan, digestOfBytes, freeze, refKey, type Ref, type Scope } from '../src/protocol/index.ts';
import { validatePlanSources, type SourceAnalysisPorts } from '../src/core/source-analysis.ts';
import { reviewPlan, type PlanReviewPorts, type ReviewSnapshot } from '../src/core/review.ts';

const scope: Scope = { ownerId: 'owner', tenantId: 'tenant', visibility: 'tenant_private' };
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
const temps: string[] = [];
afterEach(() => { for (const root of temps.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-source-review-')); temps.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root });
  git('init', '--quiet');
  writeFileSync(join(root, 'route.ts'), 'export const authorization = true;\n');
  git('add', 'route.ts');
  git('-c', 'user.name=Conformance', '-c', 'user.email=conformance@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Source fixture');
  const head = git('rev-parse', 'HEAD').toString().trim();
  const bytes = git('show', `${head}:route.ts`);
  const diff = git('diff', head, head, '--', 'route.ts');
  const repositoryRef = ref('repository');
  const citation = freeze({ ref: { id: 'citation', revision: '1' }, repositoryRef, resolvedCommit: head, path: 'route.ts',
    fileDigest: digestOfBytes(bytes), lineStart: 1, lineEnd: 1, excerptDigest: digestOfBytes(bytes), symbol: 'authorization' });
  const matrix = RevisionMatrix.parse(freeze({ schemaVersion: 'workflow.revisions/v1', ref: { id: 'matrix', revision: '1' }, scope,
    repositories: [{ repositoryRef, requestedRef: 'HEAD', requestedBaseRef: 'HEAD', headCommit: head, baseCommit: head,
      mergeBaseCommit: head, mergeBaseAbsentReason: null, diffRef: { ...ref('diff'), digest: digestOfBytes(diff) },
      changedFileRefs: [], resolverRef: ref('git-resolver') }], resolvedAt: '2026-10-14T00:00:00Z' }));
  const model = ChangeModel.parse(freeze({ schemaVersion: 'workflow.change-model/v1', ref: { id: 'model', revision: '1' }, scope,
    revisionMatrixRef: matrix.ref, elements: [{ id: 'authorization', boundary: 'route', behavior: 'Authorization guard is declared',
      citationRefs: [citation.ref], derivation: 'declared', confidence: null, verification: 'confirmed', verifierRef: ref('declaration-check'),
      verificationEvidenceRefs: [ref('oracle-evidence')] }], extractorReports: [], unresolvedQuestions: [], generationRef: null }));
  const plan = SourcePlan.parse(freeze({ schemaVersion: 'workflow.source-plan/v1', ref: { id: 'plan', revision: '1' }, scope,
    revisionMatrixRef: matrix.ref, changeModelRef: model.ref, disposition: 'scenario_set', dispositionReasonRefs: [],
    candidates: [{ id: 'candidate', sourceElementIds: ['authorization'], caseRef: ref('case'), disposition: 'runnable', reasonRefs: [], capabilityRefs: [] }],
    validFlowRefs: [], withheldFlows: [], invalidFlows: [], coverageObligationRefs: [ref('required-coverage')], gapRefs: [] }));
  const documents = new Map<string, unknown>([matrix, model, citation].map(document => [refKey(document.ref), document]));
  const ports: SourceAnalysisPorts = {
    authorize: async (selectedScope) => { if (selectedScope.tenantId !== scope.tenantId) throw new Error('denied'); },
    resolveDocument: async r => documents.get(refKey(r)),
    readFile: async (_scope, c) => ({ repositoryRef, resolvedCommit: c.resolvedCommit, path: c.path, bytes: git('show', `${c.resolvedCommit}:${c.path}`) }),
    readDiff: async (_scope, selected) => git('diff', selected.baseCommit, selected.headCommit, '--', 'route.ts'),
    verifyRevisionPolicy: async () => {},
    verifyElement: async (_scope, _element, citations) => ({ verified: citations.length === 1 && git('show', `${head}:route.ts`).toString().includes('authorization = true'), evidenceRefs: [ref('oracle-evidence')] }),
    verifyCoverage: async (_scope, selected) => { if (!selected.coverageObligationRefs.length) throw new Error('required coverage removed'); },
  };
  const withModel = (next: unknown, gaps: Ref[] = []) => {
    const updated = ChangeModel.parse(freeze(ChangeModel.parse(next))); documents.set(refKey(updated.ref), updated);
    return SourcePlan.parse(freeze({ ...plan, changeModelRef: updated.ref, gapRefs: gaps }));
  };
  return { root, ports, plan, model, matrix, citation, documents, withModel };
}
describe('source-backed plan validation', () => {
  it('composes real immutable source checks with an atomic approved review', async () => {
    const f = fixture();
    let snapshot: ReviewSnapshot = { storageVersion: 1, projection: { id: 'editable-plan', scope, editRevision: 1, sourcePlanRef: f.plan.ref, currentReviewRef: null } };
    const published: unknown[] = [];
    const ports: PlanReviewPorts = {
      authorize: async () => ({ actorId: 'authenticated-reviewer', policyRef: ref('registered-policy') }),
      resolvePlan: async () => f.plan, validateSources: (plan, policy) => validatePlanSources(f.ports, plan, policy),
      read: async () => structuredClone(snapshot),
      compareAndSwap: async (version, projection, review, validation) => {
        if (version !== snapshot.storageVersion) return false;
        snapshot = { storageVersion: version + 1, projection: structuredClone(projection) };
        published.push({ review, validation }); return true;
      },
    };
    const review = await reviewPlan(ports, { id: 'editable-plan', scope, expectedEditRevision: 1, expectedSourcePlanRef: f.plan.ref }, 'approved', []);
    expect(snapshot.storageVersion).toBe(2);
    expect(published).toEqual([{ review, validation: expect.objectContaining({ sourcePlanRef: f.plan.ref, verifiedCitationRefs: [f.citation.ref] }) }]);
    expect(review.reasonRefs).toHaveLength(1);
  });
  it('reads immutable Git bytes even after the working checkout changes', async () => {
    const f = fixture(); writeFileSync(join(f.root, 'route.ts'), 'uncommitted replacement\n');
    const result = await validatePlanSources(f.ports, f.plan, ref('policy'));
    expect(result.verifiedCitationRefs).toEqual([f.citation.ref]);
    expect(result.runnableElementIds).toEqual(['authorization']);
    expect(result).not.toHaveProperty('outcome');
  });
  it.each(['contradicted', 'unverified'] as const)('refuses %s executable derivations', async verification => {
    const f = fixture(); const plan = f.withModel({ ...f.model, elements: [{ ...f.model.elements[0], verification }] });
    await expect(validatePlanSources(f.ports, plan, ref('policy'))).rejects.toThrow('confirmed independent');
  });
  it('does not treat agent confidence or a proposed confirmed flag as oracle authority', async () => {
    const f = fixture(); const plan = f.withModel({ ...f.model, elements: [{ ...f.model.elements[0], derivation: 'agent', confidence: 1 }] });
    f.ports.verifyElement = async () => ({ verified: false, evidenceRefs: [ref('oracle-evidence')] });
    await expect(validatePlanSources(f.ports, plan, ref('policy'))).rejects.toThrow('confirmation disagrees');
  });
  it('rejects missing citations and unselected repository revisions', async () => {
    const f = fixture(); const plan = f.withModel({ ...f.model, elements: [{ ...f.model.elements[0], citationRefs: [] }] });
    await expect(validatePlanSources(f.ports, plan, ref('policy'))).rejects.toThrow('confirmed independent');
    const citation = freeze({ ...f.citation, resolvedCommit: 'f'.repeat(40) }); f.documents.set(refKey(citation.ref), citation);
    const outside = f.withModel({ ...f.model, elements: [{ ...f.model.elements[0], citationRefs: [citation.ref] }] });
    await expect(validatePlanSources(f.ports, outside, ref('policy'))).rejects.toThrow('outside selected');
  });
  it('retains extractor failure gaps and refuses dropping frozen requirements', async () => {
    const f = fixture(); const diagnostic = ref('extractor-failure');
    const model = { ...f.model, extractorReports: [{ extractorRef: ref('extractor'), sourceRefs: [], status: 'failed', diagnosticRefs: [diagnostic] }] };
    await expect(validatePlanSources(f.ports, f.withModel(model), ref('policy'))).rejects.toThrow('discarded required');
    expect((await validatePlanSources(f.ports, f.withModel(model, [diagnostic]), ref('policy'))).retainedDiagnosticRefs).toEqual([diagnostic]);
    await expect(validatePlanSources(f.ports, freeze({ ...f.plan, coverageObligationRefs: [] }), ref('policy'))).rejects.toThrow('coverage removed');
  });
  it('refuses changed full-diff bytes and a missing-base policy denial', async () => {
    const f = fixture(); f.ports.readDiff = async () => Buffer.from('invented diff');
    await expect(validatePlanSources(f.ports, f.plan, ref('policy'))).rejects.toThrow('full diff');
    const other = fixture(); other.ports.verifyRevisionPolicy = async () => { throw new Error('diff policy denied'); };
    await expect(validatePlanSources(other.ports, other.plan, ref('policy'))).rejects.toThrow('policy denied');
  });
  it('rejects source-document substitution and missing-base ambiguity', async () => {
    const f = fixture();
    f.documents.set(refKey(f.model.ref), freeze({ ...f.model, scope: { ...scope, tenantId: 'other' } }));
    await expect(validatePlanSources(f.ports, f.plan, ref('policy'))).rejects.toThrow('digest or scope');
    const other = fixture();
    const matrix = RevisionMatrix.parse(freeze({ ...other.matrix, repositories: [{ ...other.matrix.repositories[0], mergeBaseCommit: null }] }));
    other.documents.set(refKey(matrix.ref), matrix);
    const model = ChangeModel.parse(freeze({ ...other.model, revisionMatrixRef: matrix.ref }));
    other.documents.set(refKey(model.ref), model);
    await expect(validatePlanSources(other.ports, freeze({ ...other.plan, revisionMatrixRef: matrix.ref, changeModelRef: model.ref }), ref('policy'))).rejects.toThrow('explicit reason');
  });
});
