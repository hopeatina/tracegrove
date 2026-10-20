import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, editFile, planSample, resealBundle, sampleCopy, sampleIdentityDigest } from '../conformance/helpers.ts';
import { registeredReplayFixture, projectionToken } from './fixtures/registeredReplay.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { activateScenario } from '../src/core/scenarioActivation.ts';
import { invalidateScenario } from '../src/core/scenario.ts';
import { prepareRegressionExecution } from '../src/core/regressionBundle.ts';
import { executeBundle } from '../src/core/executor.ts';
import { inspectAttemptInventory } from '../src/core/attemptInventory.ts';
import { verifyBundle, VerifiedBundleSnapshot } from '../src/core/bundle.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
import { RegressionAdmission, ScenarioDefinition, RunRequest, digestOfBytes, digestOfValue, freeze, refKey,
  type RegressionRunIntent } from '../src/protocol/index.ts';
import type { LocalScenarioRegressionAuthority } from '../src/core/localScenarioRegression.ts';
import type { FrozenBundle } from '../src/core/planner.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); });
const ref = (id: string) => ({ id, revision: '1', digest: digestOfBytes(id) });
async function fixture(active = true, frozen?: FrozenBundle) {
  const f = await registeredReplayFixture(ledger => ledgers.push(ledger), 'native-real', frozen ? { frozen, requiredLevel: 'environment' } : undefined);
  if (active) await activateScenario(f.ports, f.intent);
  const controls = { registration: true, leases: true, effects: true, beforeEffects: async () => {}, beforeRegistration: async () => {} };
  const authority: LocalScenarioRegressionAuthority = {
    authorizeRegistration: async () => { await controls.beforeRegistration(); if (!controls.registration) throw new Error('registration denied'); },
    validateStateLeases: async () => { if (!controls.leases) throw new Error('state lease unavailable');
      return { assertCurrent() { if (!controls.leases) throw new Error('state lease unavailable'); } }; },
    authorizeEffects: async () => { await controls.beforeEffects(); if (!controls.effects) throw new Error('effects denied'); },
  };
  const owner = f.store.regressionOwner(authority);
  const intent = async (key = 'regression-one', lease = 'regression-fresh-state'): Promise<RegressionRunIntent> => ({
    snapshot: projectionToken((await f.store.read('entry', f.scope)).projection), selectionManifestRef: f.admission.selectionManifestRef,
    stateLeaseRefs: [ref(lease)], idempotencyKey: key,
  });
  return { ...f, controls, regressionAuthority: authority, regression: owner, regressionIntent: intent };
}
async function prepared(f: Awaited<ReturnType<typeof fixture>>) {
  const intent = await f.regressionIntent(); const admission = await f.regression.register(intent);
  const bundle = await prepareRegressionExecution(f.planned, admission.ref, f.scope, f.ledger, f.regression);
  return { intent, admission, bundle };
}
it('runs an explicitly activated scenario with real native fixtures, verified replay and all-attempt accounting', async () => {
  const f = await fixture(); const before = JSON.stringify(f.planned), p = await prepared(f);
  expect(JSON.stringify(f.planned)).toBe(before);
  const host = new LocalProcessHost(), start = vi.spyOn(host, 'start');
  const options = { bundle: p.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, regression: f.regression, hosts: { local: host } };
  const run = await executeBundle(options);
  expect(run.outcome).toBe('passed'); expect(run.receipts).toHaveLength(2); expect(start).toHaveBeenCalledTimes(2);
  const records = VerifiedBundleSnapshot.open(run.executionDir).records;
  expect(records.request.purpose).toBe('regression'); expect(records.request.regressionAdmissionRef).toEqual(p.admission.ref);
  expect(records.receipts.every(r => r.cleanup.critical.every(id => r.cleanup.confirmed.includes(id)))).toBe(true);
  const redelivered = await executeBundle(options); expect(redelivered.redelivered).toBe(true); expect(redelivered.receipts).toHaveLength(2);
  expect(start).toHaveBeenCalledTimes(2);
  const inventory = inspectAttemptInventory({ stateDir: f.root, scope: f.scope });
  expect(inventory.code).toBe('complete_inventory'); expect(inventory.attempts).toHaveLength(3);
  expect(inventory.attempts.filter(row => row.kind === 'regression')).toMatchObject([{ outcome: 'passed', receiptCount: 2 }]);
  await expect(f.results.retain({ admissionRef: f.admission.ref, scope: f.scope, bundleDir: run.executionDir })).rejects.toThrow('qualification admission');
  const documents = JSON.parse(readFileSync(join(run.executionDir, 'documents.json'), 'utf8'));
  delete documents[refKey(p.admission.ref)]; writeFileSync(join(run.executionDir, 'documents.json'), JSON.stringify(documents)); resealBundle(run.executionDir);
  expect(verifyBundle(run.executionDir).ok).toBe(false);
  await expect(executeBundle(options)).rejects.toThrow('committed_execution_evidence_invalid'); expect(start).toHaveBeenCalledTimes(2);
}, 60000);

it('requires active coverage, fresh nonduplicated state, exact snapshots and current registration permission', async () => {
  const f = await fixture(false); const inactive = await f.regressionIntent();
  await expect(f.regression.register(inactive)).rejects.toThrow('explicitly active');
  await activateScenario(f.ports, f.intent);
  const intent = await f.regressionIntent();
  await expect(f.regression.register({ ...intent, stateLeaseRefs: f.admission.stateLeaseRefs })).rejects.toThrow('leased-state');
  await expect(f.regression.register({ ...intent, stateLeaseRefs: [ref('duplicate'), ref('duplicate')] })).rejects.toThrow('leased-state');
  f.controls.leases = false; await expect(f.regression.register(intent)).rejects.toThrow('lease unavailable'); f.controls.leases = true;
  const admission = await f.regression.register(intent); expect(await f.regression.register(intent)).toEqual(admission);
  await expect(f.regression.register({ ...intent, idempotencyKey: 'stale' })).rejects.toThrow('stale scenario');
  await expect(f.regression.register({ ...intent, stateLeaseRefs: [ref('different')] })).rejects.toThrow('idempotency');
  f.controls.registration = false; await expect(f.regression.register(intent)).rejects.toThrow('registration denied');
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('active');
}, 60000);

it('retains an admitted registration after lost acknowledgement and reopens it without another write', async () => {
  const f = await fixture(); const intent = await f.regressionIntent(); const append = f.ledger.append.bind(f.ledger);
  vi.spyOn(f.ledger, 'append').mockImplementation((...args) => { const result = append(...args);
    if (args[2] === 'workflow.scenario.regression-registered') throw new Error('acknowledgement lost'); return result; });
  await expect(f.regression.register(intent)).rejects.toThrow('acknowledgement lost'); vi.restoreAllMocks();
  f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const store = new LocalScenarioStore(ledger, 'entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const owner = store.regressionOwner(f.regressionAuthority); const admission = await owner.register(intent);
  expect(RegressionAdmission.safeParse(admission).success).toBe(true);
  const id = `workflow-scenarios:${digestOfValue(f.scope).hex}`;
  expect(ledger.history(id).filter(row => row.type === 'workflow.scenario.regression-registered')).toHaveLength(1);
  const bundle = await prepareRegressionExecution(f.planned, admission.ref, f.scope, ledger, owner);
  expect((await executeBundle({ bundle, stateDir: f.root, ledger, scope: f.scope, regression: owner })).outcome).toBe('passed');
}, 60000);

it('refuses missing or substituted runtime owners and changed frozen contracts before host acquisition', async () => {
  const f = await fixture(); const p = await prepared(f); const start = vi.spyOn(LocalProcessHost.prototype, 'start');
  await expect(executeBundle({ bundle: p.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope })).rejects.toThrow('scenario_lifecycle_unavailable');
  const request = RunRequest.parse(freeze({ ...p.bundle.request!, regressionAdmissionRef: ref('unregistered') }));
  await expect(executeBundle({ bundle: { ...p.bundle, request }, ledger: f.ledger, stateDir: f.root, scope: f.scope, regression: f.regression })).rejects.toThrow('missing, inactive');
  const foreign = LocalLedger.open(join(f.root, 'foreign')); ledgers.push(foreign);
  await expect(prepareRegressionExecution(f.planned, p.admission.ref, f.scope, foreign, f.regression)).rejects.toThrow('owner ledger');
  const mutated = structuredClone(f.planned); const key = refKey(mutated.request!.selectionManifestRef);
  const selected = mutated.documents[key] as { cells: Array<{ required: boolean }> }; selected.cells[0]!.required = false;
  await expect(prepareRegressionExecution(mutated, p.admission.ref, f.scope, f.ledger, f.regression)).rejects.toThrow('matrix');
  expect(start).not.toHaveBeenCalled();
}, 60000);

it('blocks invalidation during effect authorization before admission and preserves the detecting scenario', async () => {
  const f = await fixture(); const p = await prepared(f), start = vi.spyOn(LocalProcessHost.prototype, 'start');
  const before = f.ledger.history(`idempotency:${p.bundle.request!.idempotencyKey}`);
  f.controls.beforeEffects = async () => {
    f.controls.beforeEffects = async () => {};
    const definition = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: f.definition.ref.id, revision: '2' } }));
    await f.store.stage(definition); await invalidateScenario(f.store.ports(), projectionToken((await f.store.read('entry', f.scope)).projection), definition.ref);
  };
  await expect(executeBundle({ bundle: p.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, regression: f.regression })).rejects.toThrow('invalidated');
  expect(start).not.toHaveBeenCalled(); expect(f.ledger.history(`idempotency:${p.bundle.request!.idempotencyKey}`)).toEqual(before);
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('degraded');
}, 60000);

it('retains a failed attempt with cleanup when effect permission is revoked after host acquisition', async () => {
  const f = await fixture(); const p = await prepared(f), start = vi.spyOn(LocalProcessHost.prototype, 'start');
  let checks = 0; f.controls.beforeEffects = async () => { if (++checks > 2) f.controls.effects = false; };
  const run = await executeBundle({ bundle: p.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, regression: f.regression });
  expect(run.outcome).not.toBe('passed'); expect(start).toHaveBeenCalledTimes(1);
  expect(run.reasonCodes).toContain('regression_authority_unavailable'); expect(verifyBundle(run.executionDir).ok).toBe(true);
  expect(inspectAttemptInventory({ stateDir: f.root, scope: f.scope }).attempts.find(row => row.kind === 'regression')?.outcome).not.toBe('passed');
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('active');
}, 60000);

it.each(['lease', 'scenario', 'permission'] as const)('rejects %s changes during the final registration authorization', async race => {
  const f = await fixture(); const intent = await f.regressionIntent(); let calls = 0;
  f.controls.beforeRegistration = async () => {
    if (++calls !== 2) return;
    if (race === 'lease') f.controls.leases = false;
    if (race === 'permission') f.controls.registration = false;
    if (race === 'scenario') await f.pending();
  };
  await expect(f.regression.register(intent)).rejects.toThrow(race === 'lease' ? 'lease unavailable' : race === 'permission' ? 'registration denied' : 'scenario changed');
  const entry = f.ledger.current(`workflow-scenarios:${digestOfValue(f.scope).hex}`)!;
  expect((entry.data.scenarios as Array<{ regressionAdmissions: unknown[] }>)[0]!.regressionAdmissions).toHaveLength(0);
}, 60000);

it('never repeats admission after a committed execution append loses its acknowledgement before index publication', async () => {
  const f = await fixture(); const p = await prepared(f), append = f.ledger.append.bind(f.ledger), start = vi.spyOn(LocalProcessHost.prototype, 'start');
  vi.spyOn(f.ledger, 'append').mockImplementation((...args) => { const row = append(...args);
    if (args[2] === 'admitted') throw new Error('execution acknowledgement lost'); return row; });
  const run = () => executeBundle({ bundle: p.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, regression: f.regression });
  await expect(run()).rejects.toThrow('acknowledgement lost'); vi.mocked(f.ledger.append).mockRestore();
  await expect(run()).rejects.toThrow('without its index'); expect(start).not.toHaveBeenCalled();
  const report = inspectAttemptInventory({ stateDir: f.root, scope: f.scope });
  expect(report.evidenceComplete).toBe(false); expect(report.attempts.filter(row => row.kind === 'regression')).toHaveLength(1);
}, 60000);

it('detects a real assertion regression under unchanged contracts without removing active coverage', async () => {
  const sample = sampleCopy(), control = join(sample.root, 'controlled-regression'), app = join(sample.root, 'app/app.mjs');
  const original = readFileSync(app, 'utf8');
  const changed = original.replace('return send(res, 200, { note });', `return send(res, 200, { note: existsSync(${JSON.stringify(control)}) && note.title === 'Fresh note' ? { ...note, title: 'Controlled regression' } : note });`);
  expect(changed).not.toBe(original); writeFileSync(app, changed);
  const digest = sampleIdentityDigest(sample.root).hex;
  editFile(join(sample.root, 'verification/components/notes-api.profile.yaml'), text => text.replace(/hex: "?[0-9a-f]{64}"?/, `hex: "${digest}"`));
  const f = await fixture(true, planSample(sample.configPath)); const p = await prepared(f);
  writeFileSync(control, 'controlled fault');
  const run = await executeBundle({ bundle: p.bundle, stateDir: f.root, ledger: f.ledger, scope: f.scope, regression: f.regression });
  expect(run.outcome).toBe('assertion_failed'); expect(verifyBundle(run.executionDir)).toMatchObject({ ok: true, outcome: 'assertion_failed' });
  expect(run.receipts.every(receipt => receipt.steps.some(step => step.output && JSON.stringify(step.output).includes('Controlled regression')))).toBe(true);
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('active');
  expect(inspectAttemptInventory({ stateDir: f.root, scope: f.scope }).attempts.find(row => row.kind === 'regression')?.outcome).toBe('assertion_failed');
}, 60000);
