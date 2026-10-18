import { afterEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import { registeredQualificationFixture } from './fixtures/registeredQualification.ts';
import { projectionToken } from './fixtures/registeredReplay.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { validateScenarioStructure } from '../src/core/scenarioStructure.ts';
import { invalidateScenario, registerQualificationRound } from '../src/core/scenario.ts';
import { localQualificationExecutionOwner } from '../src/core/qualificationExecution.ts';
import { prepareQualificationExecution } from '../src/core/qualificationBundle.ts';
import { executeBundle } from '../src/core/executor.ts';
import { FidelityPlan, RunnerProfile, ScenarioDefinition, SelectionManifest, digestOfBytes, digestOfValue, freeze, refKey, type RunRequest } from '../src/protocol/index.ts';
import type { FrozenBundle } from '../src/core/planner.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); });
async function fixture() {
  const f = await registeredQualificationFixture(ledger => ledgers.push(ledger));
  const store = new LocalScenarioStore(f.ledger, 'proposed-entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const matrix = await f.store.resolveSelection(f.definition.qualificationMatrixRef, f.scope);
  const selected = await f.store.resolveSelection(f.admission.selectionManifestRef, f.scope);
  await store.propose(f.definition, [matrix, selected]);
  const controls = { allowed: true, calls: 0, beforeAuthorization: async () => {} };
  const authority = { authorizeValidation: async () => {
    controls.calls++; await controls.beforeAuthorization();
    if (!controls.allowed) throw new Error('structural authority denied');
    return { actorId: 'authenticated-validator', policyRef: { id: 'structure-policy', revision: '1', digest: digestOfBytes('structure-policy') } };
  } };
  const token = projectionToken((await store.read('proposed-entry', f.scope)).projection);
  return { ...f, store, controls, authority, ports: store.structuralPorts(authority), token };
}
const changedRequest = (bundle: FrozenBundle, fields: Partial<RunRequest>) => {
  const request = freeze({ ...bundle.request!, ...fields });
  return { ...bundle, request, documents: { ...bundle.documents, [refKey(request.ref)]: request } };
};
it('records a real static preflight and validating projection atomically before any execution effects', async () => {
  const f = await fixture(); expect(existsSync(join(f.root, 'executions'))).toBe(false);
  await expect(registerQualificationRound(f.store.ports(), f.token, { selectionManifestRef: f.admission.selectionManifestRef, stateLeaseRefs: f.admission.stateLeaseRefs })).rejects.toThrow('structurally validated');
  const original = structuredClone(f.planned); const record = await validateScenarioStructure(f.ports, f.token, f.planned);
  expect(f.planned).toEqual(original); expect(existsSync(join(f.root, 'executions'))).toBe(false);
  const current = (await f.store.read('proposed-entry', f.scope)).projection;
  expect(current).toMatchObject({ state: 'validating', aggregateVersion: 2, qualificationRoundRefs: [], activationDecisionRef: null });
  expect(record.actorId).toBe('authenticated-validator'); expect(record.requestRef).toEqual(f.planned.request!.ref);
  const entry = f.ledger.current(`workflow-scenarios:${digestOfValue(f.scope).hex}`)!;
  expect(entry.type).toBe('workflow.scenario.structure-validated');
  const scenarios = entry.data.scenarios as Array<{ structuralValidations: unknown[] }>;
  expect(scenarios.at(-1)!.structuralValidations).toEqual([record]);
  const admission = await registerQualificationRound(f.store.ports(), projectionToken(current), { selectionManifestRef: f.admission.selectionManifestRef,
    stateLeaseRefs: [{ id: 'new-scenario-state', revision: '1', digest: digestOfBytes('new-scenario-state') }] });
  const owner = localQualificationExecutionOwner(f.store, async () => {});
  const bundle = await prepareQualificationExecution(f.planned, admission.ref, f.scope, f.ledger, owner);
  const run = await executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner });
  expect(run.outcome).toBe('passed'); expect(run.receipts).toHaveLength(2);
});
it('retains historical validation across reopen and edits, without reversing degradation, then revalidates the new revision', async () => {
  const f = await fixture(); const record = await validateScenarioStructure(f.ports, f.token, f.planned);
  f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const store = new LocalScenarioStore(ledger, 'proposed-entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const ports = store.structuralPorts(f.authority);
  expect(await validateScenarioStructure(ports, f.token, f.planned)).toEqual(record);
  const definition = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' } }));
  await store.stage(definition); await invalidateScenario(store.ports(), projectionToken((await store.read('proposed-entry', f.scope)).projection), definition.ref);
  expect(await validateScenarioStructure(ports, f.token, f.planned)).toEqual(record);
  expect((await store.read('proposed-entry', f.scope)).projection.state).toBe('degraded');
  const next = await validateScenarioStructure(ports, projectionToken((await store.read('proposed-entry', f.scope)).projection), f.planned);
  expect(next.snapshot.expectedInvalidationEpoch).toBe(1);
  expect((await store.read('proposed-entry', f.scope)).projection).toMatchObject({ state: 'validating', invalidationEpoch: 1 });
});
it('recovers a lost append acknowledgement without publishing another validation', async () => {
  const f = await fixture(); const append = f.ledger.append.bind(f.ledger); let lose = true;
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((id, version, type, data) => {
    const entry = append(id, version, type, data);
    if (type === 'workflow.scenario.structure-validated' && lose) { lose = false; throw new Error('acknowledgement lost'); }
    return entry;
  });
  await expect(validateScenarioStructure(f.ports, f.token, f.planned)).rejects.toThrow('acknowledgement lost'); spy.mockRestore();
  const both = await Promise.all([validateScenarioStructure(f.ports, f.token, f.planned), validateScenarioStructure(f.ports, f.token, f.planned)]);
  expect(both[0]).toEqual(both[1]);
  expect(f.ledger.history(`workflow-scenarios:${digestOfValue(f.scope).hex}`).filter(e => e.type === 'workflow.scenario.structure-validated')).toHaveLength(1);
});
it('converges concurrent validation deliveries on one atomic receipt', async () => {
  const f = await fixture();
  const both = await Promise.all([validateScenarioStructure(f.ports, f.token, f.planned), validateScenarioStructure(f.ports, f.token, f.planned)]);
  expect(both[0]).toEqual(both[1]);
  expect(f.ledger.history(`workflow-scenarios:${digestOfValue(f.scope).hex}`).filter(e => e.type === 'workflow.scenario.structure-validated')).toHaveLength(1);
});
it.each(['fixture', 'fidelity', 'matrix', 'lifecycle', 'capability'] as const)('reuses admission checks and refuses invalid %s plans without a receipt', async kind => {
  const f = await fixture(); let bundle = structuredClone(f.planned);
  if (kind === 'fixture') bundle = changedRequest(bundle, { fixturePlanRef: null });
  if (kind === 'lifecycle') bundle = changedRequest(bundle, { purpose: 'qualification', qualificationRoundRef: f.admission.ref });
  if (kind === 'capability') for (const [key, value] of Object.entries(bundle.documents)) {
    if (RunnerProfile.safeParse(value).success) delete bundle.documents[key];
  }
  if (kind === 'fidelity') {
    const original = FidelityPlan.parse(bundle.documents[refKey(bundle.request!.fidelityPlanRef)]);
    const altered = FidelityPlan.parse(freeze({ ...original, cells: original.cells.map(c => ({ ...c, boundaries: c.boundaries.map(b => ({ ...b, mode: 'stubbed' })) })) }));
    bundle.documents[refKey(altered.ref)] = altered; bundle = changedRequest(bundle, { fidelityPlanRef: altered.ref });
  }
  if (kind === 'matrix') {
    const original = SelectionManifest.parse(bundle.documents[refKey(bundle.request!.selectionManifestRef)]);
    const altered = SelectionManifest.parse(freeze({ ...original, cells: original.cells.slice(1) }));
    bundle.documents[refKey(altered.ref)] = altered; bundle = changedRequest(bundle, { selectionManifestRef: altered.ref });
  }
  await expect(validateScenarioStructure(f.ports, f.token, bundle)).rejects.toThrow();
  expect((await f.store.read('proposed-entry', f.scope)).projection.state).toBe('proposed');
  expect(existsSync(join(f.root, 'executions'))).toBe(false);
});
it.each(['revocation', 'invalidation', 'actor'] as const)('rejects %s at the final commit boundary', async kind => {
  const f = await fixture();
  f.controls.beforeAuthorization = async () => {
    if (f.controls.calls !== 2) return;
    if (kind === 'revocation') f.controls.allowed = false;
    if (kind === 'invalidation') {
      const definition = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' } }));
      await f.store.stage(definition); await invalidateScenario(f.store.ports(), f.token, definition.ref);
    }
  };
  const commit = f.ports.compareAndSwapStructuralValidation;
  const ports = kind === 'actor' ? { ...f.ports, compareAndSwapStructuralValidation: (...args: Parameters<typeof commit>) =>
    commit(args[0], args[1], freeze({ ...args[2], actorId: 'forged-validator' }), args[3]) } : f.ports;
  await expect(validateScenarioStructure(ports, f.token, f.planned)).rejects.toThrow();
  expect((await f.store.read('proposed-entry', f.scope)).projection.state).toBe(kind === 'invalidation' ? 'degraded' : 'proposed');
});
