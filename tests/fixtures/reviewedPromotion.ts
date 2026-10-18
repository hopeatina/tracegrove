import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import ts from 'typescript';
import { registeredQualificationFixture } from './registeredQualification.ts';
import { LocalLedger } from '../../src/core/ledger.ts';
import { LocalReviewStore } from '../../src/core/localReviewStore.ts';
import { LocalScenarioStore } from '../../src/core/localScenarioStore.ts';
import { localScope } from '../../src/core/corpus.ts';
import { validatePlanSources, type SourceAnalysisPorts } from '../../src/core/source-analysis.ts';
import { editPlan, reviewPlan } from '../../src/core/review.ts';
import { ChangeModel, QualificationPolicy, RevisionMatrix, SourcePlan, ScenarioDefinition, ScenarioPromotionIntent, digestOfBytes, freeze, refKey, type Ref } from '../../src/protocol/index.ts';

const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
/** Actual immutable Git bytes and a bounded TypeScript AST route oracle; authentication/coverage policy remain simulated. */
export async function reviewedPromotionFixture(track: (ledger: LocalLedger) => void) {
  const qualificationPolicy = QualificationPolicy.parse(freeze({ schemaVersion: 'workflow.qualification-policy/v1', ref: { id: 'promotion-qualification-policy', revision: '1' },
    scope: localScope(), requiredLevel: 'environment', minimumIndependentRounds: 2 }));
  const f = await registeredQualificationFixture(track, qualificationPolicy.ref);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: resolve(f.planned.projectRoot, '..') });
  git('init', '--quiet'); git('add', 'app/app.mjs', 'app/http.mjs');
  git('-c', 'user.name=Conformance', '-c', 'user.email=conformance@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Immutable notes source');
  const head = git('rev-parse', 'HEAD').toString().trim(); const bytes = git('show', `${head}:app/app.mjs`);
  const repositoryRef = ref('sample-repository'); const gap = ref('unresolved-provider-gap');
  const citation = freeze({ ref: { id: 'app-citation', revision: '1' }, repositoryRef, resolvedCommit: head, path: 'app/app.mjs',
    fileDigest: digestOfBytes(bytes), lineStart: 1, lineEnd: bytes.toString().trimEnd().split('\n').length,
    excerptDigest: digestOfBytes(bytes), symbol: null });
  const matrix = RevisionMatrix.parse(freeze({ schemaVersion: 'workflow.revisions/v1', ref: { id: 'source-matrix', revision: '1' }, scope: f.scope,
    repositories: [{ repositoryRef, requestedRef: 'HEAD', requestedBaseRef: 'HEAD', headCommit: head, baseCommit: head,
      mergeBaseCommit: head, mergeBaseAbsentReason: null, diffRef: { ...ref('source-diff'), digest: digestOfBytes(git('diff', head, head)) },
      changedFileRefs: [], resolverRef: ref('fixture-git-resolver') }], resolvedAt: '2026-10-18T00:00:00Z' }));
  const model = ChangeModel.parse(freeze({ schemaVersion: 'workflow.change-model/v1', ref: { id: 'source-model', revision: '1' }, scope: f.scope,
    revisionMatrixRef: matrix.ref, elements: [{ id: 'notes-route', boundary: 'http', behavior: 'A POST method branch is declared',
      citationRefs: [citation.ref], derivation: 'ast', confidence: null, verification: 'confirmed', verifierRef: ref('typescript-route-oracle'), verificationEvidenceRefs: [ref('post-route-observation')] }],
    extractorReports: [{ extractorRef: ref('provider-extractor'), sourceRefs: [citation.ref], status: 'partial', diagnosticRefs: [gap] }],
    unresolvedQuestions: [], generationRef: null }));
  const plan = SourcePlan.parse(freeze({ schemaVersion: 'workflow.source-plan/v1', ref: { id: 'notes-source-plan', revision: '1' }, scope: f.scope,
    revisionMatrixRef: matrix.ref, changeModelRef: model.ref, disposition: 'scenario_set', dispositionReasonRefs: [],
    candidates: [{ id: 'notes', sourceElementIds: ['notes-route'], caseRef: f.planned.request!.caseRefs[0]!, disposition: 'runnable', reasonRefs: [], capabilityRefs: [] },
      { id: 'provider', sourceElementIds: [], caseRef: ref('blocked-provider-case'), disposition: 'blocked', reasonRefs: [gap], capabilityRefs: [] }],
    validFlowRefs: [], withheldFlows: [{ flowRef: ref('withheld-provider-flow'), reasonRefs: [gap] }], invalidFlows: [], coverageObligationRefs: [ref('notes-coverage')], gapRefs: [gap] }));
  const documents = new Map([matrix, model, citation].map(d => [refKey(d.ref), d] as [string, unknown]));
  const source: SourceAnalysisPorts = { authorize: async () => {}, resolveDocument: async r => documents.get(refKey(r)),
    readFile: async (_scope, c) => ({ repositoryRef, resolvedCommit: c.resolvedCommit, path: c.path, bytes: git('show', `${c.resolvedCommit}:${c.path}`) }),
    readDiff: async (_scope, selected) => git('diff', selected.baseCommit, selected.headCommit), verifyRevisionPolicy: async () => {},
    verifyElement: async () => {
      const file = ts.createSourceFile('app.mjs', git('show', `${head}:app/app.mjs`).toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      let post = false;
      const visit = (node: ts.Node) => {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isPropertyAccessExpression(node.left) &&
            node.left.expression.getText(file) === 'req' && node.left.name.text === 'method' && ts.isStringLiteral(node.right) && node.right.text === 'POST') post = true;
        ts.forEachChild(node, visit);
      };
      visit(file); return { verified: post, evidenceRefs: [ref('post-route-observation')] };
    }, verifyCoverage: async (_scope, p) => { if (!p.gapRefs.some(r => refKey(r) === refKey(gap))) throw new Error('source gap removed'); } };
  const reviewAuthority = { authorize: async () => ({ actorId: 'authenticated-reviewer', policyRef: ref('source-policy') }),
    validateSources: (p: SourcePlan, policy: Ref) => validatePlanSources(source, p, policy) };
  const review = new LocalReviewStore(f.ledger, 'editable-source', f.scope, reviewAuthority); await review.initialize(plan);
  const token = { id: 'editable-source', scope: f.scope, expectedEditRevision: 1, expectedSourcePlanRef: plan.ref };
  const approved = await reviewPlan(review.ports(), token, 'approved', []);
  const definition = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'reviewed-scenario', revision: '1' }, sourcePlanRef: plan.ref, reviewRef: approved.ref }));
  const store = new LocalScenarioStore(f.ledger, 'promoted-entry', f.scope, { authorize: async () => {}, validateStateLeases: async () => {},
    validateDefinition: async d => { const snapshot = await review.definitionSnapshot(f.ledger, d); snapshot.assertCurrent(); } });
  const selections = await Promise.all([f.definition.qualificationMatrixRef, f.admission.selectionManifestRef].map(r => f.store.resolveSelection(r, f.scope)));
  const intent = ScenarioPromotionIntent.parse({ scenarioId: 'promoted-entry', definitionRef: definition.ref, reviewToken: token,
    selectionManifestRefs: selections.map(s => s.ref), idempotencyKey: 'promote-reviewed-source' });
  const controls = { allowed: true, calls: 0, beforeAuthorization: async () => {} };
  const authority = { authorizePromotion: async () => { controls.calls++; await controls.beforeAuthorization(); if (!controls.allowed) throw new Error('promotion denied');
    return { actorId: 'authenticated-promoter', policyRef: ref('promotion-policy') }; } };
  const edit = async () => { const next = SourcePlan.parse(freeze({ ...plan, ref: { id: plan.ref.id, revision: '2' } }));
    await review.stage(next); await editPlan(review.ports(), token, next.ref); return next; };
  return { ...f, store, review, reviewAuthority, plan, gap, approved, token, definition, selections, intent, controls, authority,
    ports: store.promotionPorts(review, authority), edit, head, sourceBytes: bytes, git, qualificationPolicy };
}
