import { afterEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import { reviewedPromotionFixture } from './fixtures/reviewedPromotion.ts';
import { projectionToken } from './fixtures/registeredReplay.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { LocalReviewStore } from '../src/core/localReviewStore.ts';
import { promoteScenario } from '../src/core/sourcePromotion.ts';
import { editPlan, reviewPlan } from '../src/core/review.ts';
import { validateScenarioStructure } from '../src/core/scenarioStructure.ts';
import { registerQualificationRound } from '../src/core/scenario.ts';
import { prepareQualificationExecution } from '../src/core/qualificationBundle.ts';
import { localQualificationExecutionOwner } from '../src/core/qualificationExecution.ts';
import { executeBundle } from '../src/core/executor.ts';
import { LocalQualificationResults } from '../src/core/localQualificationResults.ts';
import { assessScenarioReplay } from '../src/core/replayAssessment.ts';
import { ScenarioDefinition, SourcePlan, digestOfBytes, digestOfValue, freeze, type Ref } from '../src/protocol/index.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); });
const fixture = () => reviewedPromotionFixture(ledger => ledgers.push(ledger));
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
function reopen(f: Awaited<ReturnType<typeof fixture>>) {
  f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const review = new LocalReviewStore(ledger, 'editable-source', f.scope, f.reviewAuthority);
  const store = new LocalScenarioStore(ledger, 'promoted-entry', f.scope, { reviewStore: review, authorize: async () => {}, validateStateLeases: async () => {},
    validateDefinition: async () => {} });
  return { ledger, review, store, ports: store.promotionPorts(review, f.authority) };
}
it('promotes current real Git/AST-backed review and retains gaps in one proposed registry record without effects', async () => {
  const f = await fixture(); const before = await f.review.read(f.token.id, f.scope);
  const record = await promoteScenario(f.ports, f.intent, f.definition, f.selections);
  expect(await f.review.read(f.token.id, f.scope)).toEqual(before);
  const state = (await f.store.read('promoted-entry', f.scope)).projection;
  expect(state).toMatchObject({ state: 'proposed', aggregateVersion: 1, latestRoundSequence: 0, activationDecisionRef: null });
  expect(existsSync(join(f.root, 'executions'))).toBe(false);
  const entry = f.ledger.current(`workflow-scenarios:${digestOfValue(f.scope).hex}`)!;
  expect(entry.type).toBe('workflow.scenario.promoted');
  const stored = (entry.data.scenarios as Array<{ promotion: { receipt: unknown; approved: { plan: SourcePlan } } }>).at(-1)!.promotion;
  expect(stored.receipt).toEqual(record); expect(stored.approved.plan).toEqual(f.plan);
  expect(stored.approved.plan.gapRefs).toEqual([f.gap]); expect(stored.approved.plan.withheldFlows).toHaveLength(1);
  const snapshot = await f.review.approvedSnapshot(f.ledger, f.token, f.approved.ref);
  expect(record.sourceValidationRef).toEqual(snapshot.documents.validation.ref);
  expect(snapshot.documents.validation.runnableElementIds).toEqual(['notes-route']);
});
it('reopens the manifest and replays an identical intent without restoring current approval after a source edit', async () => {
  const f = await fixture(); const record = await promoteScenario(f.ports, f.intent, f.definition, f.selections);
  const { ledger, review, ports } = reopen(f);
  expect(await promoteScenario(ports, { ...f.intent, selectionManifestRefs: [...f.intent.selectionManifestRefs].reverse() }, f.definition, [...f.selections].reverse())).toEqual(record);
  const next = SourcePlan.parse(freeze({ ...f.plan, ref: { id: f.plan.ref.id, revision: '2' } })); await review.stage(next);
  await editPlan(review.ports(), f.token, next.ref);
  expect(await promoteScenario(ports, f.intent, f.definition, f.selections)).toEqual(record);
  await expect(review.definitionSnapshot(ledger, f.definition)).rejects.toThrow('approved review');
  f.controls.allowed = false; await expect(promoteScenario(ports, f.intent, f.definition, f.selections)).rejects.toThrow('promotion denied');
});
it('converges concurrent promotion and refuses changing the scoped key or overwriting an entry', async () => {
  const f = await fixture(); const both = await Promise.all([promoteScenario(f.ports, f.intent, f.definition, f.selections), promoteScenario(f.ports, f.intent, f.definition, f.selections)]);
  expect(both[0]).toEqual(both[1]);
  const substituted = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'substituted-definition', revision: '1' } }));
  await expect(promoteScenario(f.ports, f.intent, substituted, f.selections)).rejects.toThrow('definition digest');
  await expect(promoteScenario(f.ports, { ...f.intent, scenarioId: 'another-entry' }, f.definition, f.selections)).rejects.toThrow('idempotency');
  await expect(promoteScenario(f.ports, { ...f.intent, idempotencyKey: 'new-key' }, f.definition, f.selections)).rejects.toThrow('overwrite');
});
it.each(['edit', 'reject', 'revoke', 'actor'] as const)('refuses %s across the promotion boundary without a partial proposal', async kind => {
  const f = await fixture(); f.controls.beforeAuthorization = async () => {
    if (f.controls.calls !== 2) return;
    if (kind === 'edit') await f.edit();
    if (kind === 'reject') await reviewPlan(f.review.ports(), f.token, 'rejected', []);
    if (kind === 'revoke') f.controls.allowed = false;
  };
  const commit = f.ports.compareAndSwapPromotion;
  const ports = kind === 'actor' ? { ...f.ports, compareAndSwapPromotion: (...args: Parameters<typeof commit>) =>
    commit(args[0], args[1], args[2], freeze({ ...args[3], actorId: 'forged' }), args[4]) } : f.ports;
  await expect(promoteScenario(ports, f.intent, f.definition, f.selections)).rejects.toThrow();
  await expect(f.store.read('promoted-entry', f.scope)).rejects.toThrow('not initialized');
});
it('refuses stale review, unapproved cases and a foreign review writer', async () => {
  const f = await fixture(); const blocked = ScenarioDefinition.parse(freeze({ ...f.definition, caseRefs: [ref('blocked-provider-case')] }));
  await expect(f.review.definitionSnapshot(f.ledger, blocked)).rejects.toThrow('approved runnable');
  await expect(promoteScenario(f.ports, { ...f.intent, definitionRef: blocked.ref }, blocked, f.selections)).rejects.toThrow();
  const foreign = await fixture(); await expect(f.review.approvedSnapshot(foreign.ledger, f.token, f.approved.ref)).rejects.toThrow('review owner ledger');
  await f.edit(); await expect(promoteScenario(f.ports, f.intent, f.definition, f.selections)).rejects.toThrow('approved review');
});
it('recovers lost proposal acknowledgement after reopen without publishing twice', async () => {
  const f = await fixture(); const append = f.ledger.append.bind(f.ledger);
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((id, version, type, data) => {
    const entry = append(id, version, type, data); if (type === 'workflow.scenario.promoted') throw new Error('acknowledgement lost'); return entry;
  });
  await expect(promoteScenario(f.ports, f.intent, f.definition, f.selections)).rejects.toThrow('acknowledgement lost'); spy.mockRestore();
  const { ports, ledger } = reopen(f);
  const record = await promoteScenario(ports, f.intent, f.definition, f.selections); expect(record.reviewRef).toEqual(f.approved.ref);
  expect(ledger.history(`workflow-scenarios:${digestOfValue(f.scope).hex}`).filter(e => e.type === 'workflow.scenario.promoted')).toHaveLength(1);
});
it('publishes no partial scenario when the proposal append fails before writing', async () => {
  const f = await fixture(); const append = f.ledger.append.bind(f.ledger);
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((id, version, type, data) => {
    if (type === 'workflow.scenario.promoted') throw new Error('write unavailable'); return append(id, version, type, data);
  });
  await expect(promoteScenario(f.ports, f.intent, f.definition, f.selections)).rejects.toThrow('write unavailable'); spy.mockRestore();
  await expect(f.store.read('promoted-entry', f.scope)).rejects.toThrow('not initialized');
  await promoteScenario(f.ports, f.intent, f.definition, f.selections);
  expect((await f.store.read('promoted-entry', f.scope)).projection.state).toBe('proposed');
});
it('executes newly registered source-backed native cells, but an edited plan denies subsequent execution before effects', async () => {
  const f = await fixture(); await promoteScenario(f.ports, f.intent, f.definition, f.selections);
  const current = async () => projectionToken((await f.store.read('promoted-entry', f.scope)).projection);
  await validateScenarioStructure(f.store.structuralPorts({ authorizeValidation: async () => ({ actorId: 'validator', policyRef: ref('structural-policy') }) }), await current(), f.planned);
  const admission = await registerQualificationRound(f.store.ports(), await current(), { selectionManifestRef: f.admission.selectionManifestRef, stateLeaseRefs: [ref('fresh-promoted-state')] });
  const owner = localQualificationExecutionOwner(f.store, async () => {});
  const bundle = await prepareQualificationExecution(f.planned, admission.ref, f.scope, f.ledger, owner);
  const run = await executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner });
  expect(run.outcome).toBe('passed'); expect(run.receipts).toHaveLength(2);
  const results = new LocalQualificationResults(f.ledger, f.scope, { authorize: async () => {}, authorizeRetention: async () => {},
    resolveAdmission: (ref, scope) => f.store.resolveAdmission(ref, scope), authenticateEvidence: async () => {} });
  await results.retain({ admissionRef: admission.ref, scope: f.scope, bundleDir: run.executionDir });
  const report = await assessScenarioReplay({ ...f.store.ports(), ...results.replayPorts(), authorize: async () => {}, resolvePolicy: async () => f.qualificationPolicy }, await current());
  expect(report.qualifies).toBe(false);
  expect(report.findings.some(finding => finding.code === 'revision_identity_unproven')).toBe(true);
  await f.edit(); let starts = 0;
  await expect(executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner,
    hosts: { local: { start: async () => { starts++; throw new Error('must not start'); } } } })).rejects.toThrow('approved review');
  expect(starts).toBe(0);
});
it('stops later effects and preserves cleanup when the reviewed plan changes during execution', async () => {
  const f = await fixture(); await promoteScenario(f.ports, f.intent, f.definition, f.selections);
  const current = async () => projectionToken((await f.store.read('promoted-entry', f.scope)).projection);
  await validateScenarioStructure(f.store.structuralPorts({ authorizeValidation: async () => ({ actorId: 'validator', policyRef: ref('structural-policy') }) }), await current(), f.planned);
  const admission = await registerQualificationRound(f.store.ports(), await current(), { selectionManifestRef: f.admission.selectionManifestRef, stateLeaseRefs: [ref('midflight-state')] });
  let checks = 0;
  const owner = localQualificationExecutionOwner(f.store, async (_request, _admission, cell) => { if (cell && ++checks === 3) await f.edit(); });
  const bundle = await prepareQualificationExecution(f.planned, admission.ref, f.scope, f.ledger, owner);
  const run = await executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner });
  expect(run.outcome).not.toBe('passed');
  expect(run.receipts.some(r => r.steps.some(s => s.reasonCode === 'qualification_authority_unavailable'))).toBe(true);
  expect(run.receipts[0]!.cleanup.remainingUnknownMutations).toBe(0);
});
