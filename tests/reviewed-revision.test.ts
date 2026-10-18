import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, resealBundle } from '../conformance/helpers.ts';
import { cleanupGitRepositories } from './fixtures/git.ts';
import { reviewedPromotionFixture } from './fixtures/reviewedPromotion.ts';
import { projectionToken } from './fixtures/registeredReplay.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalReviewStore } from '../src/core/localReviewStore.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { LocalQualificationResults } from '../src/core/localQualificationResults.ts';
import { promoteScenario } from '../src/core/sourcePromotion.ts';
import { validateScenarioStructure } from '../src/core/scenarioStructure.ts';
import { registerQualificationRound, invalidateScenario } from '../src/core/scenario.ts';
import { reviewPlan } from '../src/core/review.ts';
import { prepareQualificationExecution } from '../src/core/qualificationBundle.ts';
import { localQualificationExecutionOwner } from '../src/core/qualificationExecution.ts';
import { executeBundle } from '../src/core/executor.ts';
import { activateScenario } from '../src/core/scenarioActivation.ts';
import { assessScenarioReplay } from '../src/core/replayAssessment.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { ScenarioDefinition, digestOfBytes, digestOfValue, freeze, refKey, type ScenarioActivationIntent } from '../src/protocol/index.ts';

const ref = (id: string) => ({ id, revision: '1', digest: digestOfBytes(id) });
const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); cleanupGitRepositories(); });
async function fixture(independentReviewResolution = false) {
  const f = await reviewedPromotionFixture(ledger => ledgers.push(ledger), { pinnedSource: true, independentReviewResolution });
  await promoteScenario(f.ports, f.intent, f.definition, f.selections);
  const current = async () => projectionToken((await f.store.read('promoted-entry', f.scope)).projection);
  const structureAuthority = { authorizeValidation: async () => ({ actorId: 'structural-validator', policyRef: ref('structural-policy') }) };
  return { ...f, current, structureAuthority };
}
async function qualified() {
  const f = await fixture();
  await validateScenarioStructure(f.store.structuralPorts(f.structureAuthority), await f.current(), f.planned);
  const resultsAuthority = { authorize: async () => {}, authorizeRetention: async () => {},
    resolveAdmission: (r: Parameters<typeof f.store.resolveAdmission>[0], scope: typeof f.scope) => f.store.resolveAdmission(r, scope), authenticateEvidence: async () => {} };
  const results = new LocalQualificationResults(f.ledger, f.scope, resultsAuthority);
  const owner = localQualificationExecutionOwner(f.store, async () => {});
  const rounds = [];
  const executions = [];
  for (const index of [1, 2]) {
    const admission = await registerQualificationRound(f.store.ports(), await f.current(), { selectionManifestRef: f.admission.selectionManifestRef,
      stateLeaseRefs: [ref(`independent-reviewed-state-${index}`)] });
    const frozenBefore = JSON.stringify(f.planned);
    const bundle = await prepareQualificationExecution(f.planned, admission.ref, f.scope, f.ledger, owner);
    expect(JSON.stringify(f.planned)).toBe(frozenBefore);
    expect(bundle.documents[refKey(f.plan.ref)]).toEqual(f.plan);
    expect(bundle.documents[refKey(f.approved.ref)]).toEqual(f.approved);
    const execution = await executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner });
    expect(execution.outcome, JSON.stringify(execution.reasonCodes)).toBe('passed');
    expect(execution.receipts).toHaveLength(2);
    const retained = await results.retain({ admissionRef: admission.ref, scope: f.scope, bundleDir: execution.executionDir });
    rounds.push(retained.round); executions.push(execution);
  }
  const controls = { authorizations: 0, beforeAuthorize: async () => {} };
  const authority = { resolvePolicy: async () => f.qualificationPolicy, authorizeActivation: async () => {
    controls.authorizations++; await controls.beforeAuthorize(); return { actorId: 'local-owner', policyRef: ref('activation-policy') };
  } };
  const intent: ScenarioActivationIntent = { snapshot: await f.current(), replayContractRef: f.definition.replayContractRef,
    qualificationPolicyRef: f.qualificationPolicy.ref, qualificationMatrixRef: f.definition.qualificationMatrixRef,
    targetProfileRef: f.definition.qualificationTargetProfileRef, roundRefs: rounds.map(round => round.ref), idempotencyKey: 'activate-reviewed-revision' };
  return { ...f, results, resultsAuthority, owner, rounds, executions, controls, authority, activationIntent: intent };
}

it('runs real source checks, review, promotion, two native revision rounds and atomic activation, with reopen recovery', async () => {
  // Git/TypeScript oracle and actual application execution. Host authentication, coverage policy and physical leases are simulated.
  const f = await qualified();
  const report = await assessScenarioReplay({ ...f.store.ports(), ...f.results.replayPorts(), authorize: async () => {}, resolvePolicy: async () => f.qualificationPolicy }, await f.current());
  expect(report.qualifies).toBe(true); expect(report.rounds).toHaveLength(2);
  const activated = await activateScenario(f.store.activationPorts(f.results, f.authority), f.activationIntent);
  expect((await f.store.read('promoted-entry', f.scope)).projection).toMatchObject({ state: 'active', activationDecisionRef: activated.ref });
  const saved = readVerifiedBundle(f.executions[0]!.executionDir);
  expect(saved.request.sourcePlanRef).toEqual(f.plan.ref); expect(saved.request.reviewRef).toEqual(f.approved.ref);
  expect(saved.receipts.every(r => r.environment.observed?.repositories[0]?.resolvedCommit === f.head)).toBe(true);
  expect(saved.documents[refKey(f.plan.ref)]).toEqual(f.plan);
  expect(f.plan.gapRefs).toEqual([f.gap]); expect(f.plan.withheldFlows).toHaveLength(1);
  f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const reviewStore = new LocalReviewStore(ledger, 'editable-source', f.scope, f.reviewAuthority);
  const store = new LocalScenarioStore(ledger, 'promoted-entry', f.scope, { reviewStore, authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const results = new LocalQualificationResults(ledger, f.scope, { ...f.resultsAuthority, resolveAdmission: (r, scope) => store.resolveAdmission(r, scope) });
  expect(await activateScenario(store.activationPorts(results, f.authority), f.activationIntent)).toEqual(activated);
  expect((await store.read('promoted-entry', f.scope)).projection.state).toBe('active');
});

it('denies a review edit during final activation authorization without publishing an activation', async () => {
  const f = await qualified();
  f.controls.beforeAuthorize = async () => { if (f.controls.authorizations === 2) await f.edit(); };
  await expect(activateScenario(f.store.activationPorts(f.results, f.authority), f.activationIntent)).rejects.toThrow('approved review changed');
  expect((await f.store.read('promoted-entry', f.scope)).projection).toMatchObject({ state: 'validating', activationDecisionRef: null });
  expect(f.ledger.history(`workflow-scenarios:${digestOfValue(f.scope).hex}`).filter(e => e.type === 'workflow.scenario.activated')).toHaveLength(0);
  expect(verifyBundle(f.executions[0]!.executionDir).ok).toBe(true); // Historical integrity survives; current authority does not.
  await expect(activateScenario(f.store.activationPorts(f.results, f.authority), f.activationIntent)).rejects.toThrow('approved review');
});

it('denies review edits during final structural authorization without publishing a validating state', async () => {
  const f = await fixture(); let calls = 0;
  const authority = { authorizeValidation: async () => { if (++calls === 2) await f.edit(); return { actorId: 'validator', policyRef: ref('structural-policy') }; } };
  await expect(validateScenarioStructure(f.store.structuralPorts(authority), await f.current(), f.planned)).rejects.toThrow('approved review changed');
  expect((await f.store.read('promoted-entry', f.scope)).projection.state).toBe('proposed');
  expect(f.ledger.history(`workflow-scenarios:${digestOfValue(f.scope).hex}`).filter(e => e.type === 'workflow.scenario.structure-validated')).toHaveLength(0);
});

it('denies review edits during the final lease check without registering a round', async () => {
  const f = await fixture();
  await validateScenarioStructure(f.store.structuralPorts(f.structureAuthority), await f.current(), f.planned);
  const store = new LocalScenarioStore(f.ledger, 'promoted-entry', f.scope, { reviewStore: f.review, authorize: async () => {}, validateDefinition: async () => {},
    validateStateLeases: async () => { await f.edit(); } });
  await expect(registerQualificationRound(store.ports(), await f.current(), { selectionManifestRef: f.admission.selectionManifestRef,
    stateLeaseRefs: [ref('must-not-be-claimed')] })).rejects.toThrow('approved review changed');
  expect((await store.read('promoted-entry', f.scope)).projection.latestRoundSequence).toBe(0);
});

it('fails closed without the current same-ledger review owner', async () => {
  const f = await fixture();
  const missing = new LocalScenarioStore(f.ledger, 'missing-review-owner', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  await expect(missing.propose(f.definition, f.selections)).rejects.toThrow('current review owner');
  const foreign = await fixture();
  const store = new LocalScenarioStore(f.ledger, 'wrong-review-owner', f.scope, { reviewStore: foreign.review, authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  await expect(store.propose(f.definition, f.selections)).rejects.toThrow('review owner ledger');
});

it('refuses resealed saved evidence that drops the reviewed source validation', async () => {
  const f = await qualified(); const directory = f.executions[0]!.executionDir;
  const docsPath = join(directory, 'documents.json'); const docs = JSON.parse(readFileSync(docsPath, 'utf8'));
  const approved = await f.review.definitionSnapshot(f.ledger, f.definition);
  delete docs[refKey(approved.documents.validation.ref)]; writeFileSync(docsPath, JSON.stringify(docs)); resealBundle(directory);
  const checked = verifyBundle(directory); expect(checked.ok).toBe(false);
  expect(checked.problems.some(p => p.includes('persisted source validation'))).toBe(true);
});

it('refuses a separately reviewed resolver matrix even when it resolves to the same executable commit', async () => {
  const f = await fixture(true);
  expect(f.plan.revisionMatrixRef).not.toEqual(f.pinned!.resolution.matrix.ref);
  await expect(validateScenarioStructure(f.store.structuralPorts(f.structureAuthority), await f.current(), f.planned)).rejects.toThrow('different executable revision matrix');
  expect((await f.store.read('promoted-entry', f.scope)).projection.state).toBe('proposed');
});

it('clears active coverage on an explicitly reviewed semantic edit and cannot reuse earlier qualification rounds', async () => {
  const f = await qualified();
  await activateScenario(f.store.activationPorts(f.results, f.authority), f.activationIntent);
  const next = await f.edit();
  const nextReview = await reviewPlan(f.review.ports(), { ...f.token, expectedEditRevision: 2, expectedSourcePlanRef: next.ref }, 'approved', []);
  const definition = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: f.definition.ref.id, revision: '2' }, sourcePlanRef: next.ref, reviewRef: nextReview.ref }));
  await f.store.stage(definition);
  await invalidateScenario(f.store.ports(), await f.current(), definition.ref);
  expect((await f.store.read('promoted-entry', f.scope)).projection).toMatchObject({ state: 'degraded', invalidationEpoch: 1, activationDecisionRef: null });
  await validateScenarioStructure(f.store.structuralPorts(f.structureAuthority), await f.current(), f.planned);
  const report = await assessScenarioReplay({ ...f.store.ports(), ...f.results.replayPorts(), authorize: async () => {}, resolvePolicy: async () => f.qualificationPolicy }, await f.current());
  expect(report.qualifies).toBe(false);
  const intent = { ...f.activationIntent, snapshot: await f.current(), idempotencyKey: 'cannot-reuse-old-rounds' };
  await expect(activateScenario(f.store.activationPorts(f.results, f.authority), intent)).rejects.toThrow('scenario_not_qualified');
});
