import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import { registeredReplayFixture, projectionToken } from './fixtures/registeredReplay.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { LocalQualificationResults } from '../src/core/localQualificationResults.ts';
import { activateScenario } from '../src/core/scenarioActivation.ts';
import { invalidateScenario } from '../src/core/scenario.ts';
import { ScenarioDefinition, digestOfBytes, digestOfValue, freeze } from '../src/protocol/index.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); });
const fixture = (profile = 'native-real') => registeredReplayFixture(ledger => ledgers.push(ledger), profile);
const aggregate = (scope: Parameters<typeof digestOfValue>[0]) => `workflow-scenarios:${digestOfValue(scope).hex}`;
it('publishes activation, complete assessment records and projection in one synced journal entry, with reopen recovery', async () => {
  const f = await fixture(); const before = f.ledger.version(aggregate(f.scope));
  const receipt = await activateScenario(f.ports, f.intent);
  const saved = f.ledger.current(aggregate(f.scope))!;
  expect(saved.version).toBe(before + 1); expect(saved.type).toBe('workflow.scenario.activated');
  expect((await f.store.read('entry', f.scope)).projection).toMatchObject({ state: 'active', activationDecisionRef: receipt.ref });
  const stored = saved.data.scenarios as Array<{ activations: Array<{ activation: unknown; report: { rounds: unknown[] } }> }>;
  expect(stored[0]!.activations[0]!.activation).toEqual(receipt); expect(stored[0]!.activations[0]!.report.rounds).toHaveLength(2);
  f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const store = new LocalScenarioStore(ledger, 'entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const results = new LocalQualificationResults(ledger, f.scope, { ...f.resultAuthority, resolveAdmission: (ref, scope) => store.resolveAdmission(ref, scope) });
  expect(await activateScenario(store.activationPorts(results, f.authority), f.intent)).toEqual(receipt);
  expect((await store.read('entry', f.scope)).projection.state).toBe('active');
});
it('converges concurrent identical activations and conflicts on a different scoped intent', async () => {
  const f = await fixture();
  const receipts = await Promise.all([activateScenario(f.ports, f.intent), activateScenario(f.ports, { ...f.intent, roundRefs: [...f.intent.roundRefs].reverse() })]);
  expect(receipts[0]).toEqual(receipts[1]);
  expect(f.ledger.history(aggregate(f.scope)).filter(e => e.type === 'workflow.scenario.activated')).toHaveLength(1);
  await expect(activateScenario(f.ports, { ...f.intent, targetProfileRef: { id: 'changed', revision: '1', digest: digestOfBytes('changed') } })).rejects.toThrow('idempotency');
  const other = new LocalScenarioStore(f.ledger, 'other', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const selection = await f.store.resolveSelection(f.admission.selectionManifestRef, f.scope);
  const matrix = await f.store.resolveSelection(f.definition.qualificationMatrixRef, f.scope);
  await other.initialize(f.definition, [matrix, selection]);
  await expect(activateScenario(other.activationPorts(f.results, f.authority), { ...f.intent, snapshot: { ...f.intent.snapshot, id: 'other' } })).rejects.toThrow('idempotency');
});
it('recovers lost publication acknowledgement and historical receipts never reverse invalidation', async () => {
  const f = await fixture(); const append = f.ledger.append.bind(f.ledger);
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((id, version, type, data) => {
    const entry = append(id, version, type, data); if (type === 'workflow.scenario.activated') throw new Error('acknowledgement lost'); return entry;
  });
  await expect(activateScenario(f.ports, f.intent)).rejects.toThrow('acknowledgement lost'); spy.mockRestore();
  f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const store = new LocalScenarioStore(ledger, 'entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const results = new LocalQualificationResults(ledger, f.scope, { ...f.resultAuthority, resolveAdmission: (ref, scope) => store.resolveAdmission(ref, scope) });
  const ports = store.activationPorts(results, f.authority);
  const receipt = await activateScenario(ports, f.intent);
  const next = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' }, replayContractRef: { id: 'changed', revision: '1', digest: digestOfBytes('changed') } }));
  await store.stage(next);
  await invalidateScenario(store.ports(), projectionToken((await store.read('entry', f.scope)).projection), next.ref);
  expect(await activateScenario(ports, f.intent)).toEqual(receipt);
  expect((await store.read('entry', f.scope)).projection).toMatchObject({ state: 'degraded', invalidationEpoch: 1, activationDecisionRef: null });
  f.controls.authorized = false; await expect(activateScenario(ports, f.intent)).rejects.toThrow('activation denied');
});
it.each(['registration', 'invalidation', 'revocation', 'archive', 'index'] as const)('rejects %s during the final authorization await without publication', async race => {
  const f = await fixture(); f.controls.beforeAuthorization = async () => {
    if (f.controls.calls !== 2) return;
    if (race === 'registration') await f.pending();
    if (race === 'invalidation') {
      const definition = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' } }));
      await f.store.stage(definition);
      await invalidateScenario(f.store.ports(), projectionToken((await f.store.read('entry', f.scope)).projection), definition.ref);
    }
    if (race === 'revocation') f.controls.authorized = false;
    if (race === 'archive') {
      const manifest = join(f.first.bundleDir, 'manifest.json'); writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n`);
    }
    if (race === 'index') {
      const id = `qualification-results:${digestOfValue(f.scope).hex}`;
      const previous = f.ledger.current(id)!;
      f.ledger.append(id, previous.version, previous.type, previous.data); // Controlled corruption changes only the result index.
    }
  };
  await expect(activateScenario(f.ports, f.intent)).rejects.toThrow(race === 'revocation' ? 'activation denied' : 'changed during activation');
  expect((await f.store.read('entry', f.scope)).projection.state).toBe(race === 'invalidation' ? 'degraded' : 'validating');
  expect(f.ledger.history(aggregate(f.scope)).filter(e => e.type === 'workflow.scenario.activated')).toHaveLength(0);
});
it('refuses mock-only rounds and a foreign result ledger', async () => {
  const mock = await fixture('offline-contract'); await expect(activateScenario(mock.ports, mock.intent)).rejects.toThrow('scenario_not_qualified');
  const f = await fixture(); const foreignPorts = f.store.activationPorts(mock.results, f.authority);
  await expect(mock.results.replaySnapshot(f.ledger)).rejects.toThrow('result owner ledger');
  await expect(activateScenario(foreignPorts, f.intent)).rejects.toThrow();
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('validating');
});
it.each(['actor', 'projection', 'report'] as const)('rederives authority and refuses a submitted forged %s', async field => {
  const f = await fixture(); const commit = f.ports.compareAndSwapActivation;
  const ports = { ...f.ports, compareAndSwapActivation: async (...args: Parameters<typeof commit>) => {
    const [intent, next, activation, report] = args;
    return commit(intent, field === 'projection' ? { ...next, invalidationEpoch: 99 } : next,
      field === 'actor' ? freeze({ ...activation, actorId: 'forged-actor' }) : activation,
      field === 'report' ? { ...report, qualifies: false } : report);
  } };
  await expect(activateScenario(ports, f.intent)).rejects.toThrow();
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('validating');
  expect(await f.ports.readActivation(f.intent.idempotencyKey, f.scope)).toBeNull();
});
it('refuses a corrupted persisted activation assessment instead of projecting active coverage', async () => {
  const f = await fixture(); await activateScenario(f.ports, f.intent);
  const entry = f.ledger.current(aggregate(f.scope))!;
  const data = entry.data as { scenarios: Array<{ activations: Array<{ report: { qualifyingRoundRefs: unknown[] } }> }> };
  data.scenarios[0]!.activations[0]!.report.qualifyingRoundRefs = [];
  f.ledger.append(aggregate(f.scope), entry.version, 'workflow.scenario.activated', data);
  await expect(f.store.read('entry', f.scope)).rejects.toThrow('qualifying assessments');
});
it('publishes no partial activation when the journal append fails before writing', async () => {
  const f = await fixture(); const append = f.ledger.append.bind(f.ledger);
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((id, version, type, data) => {
    if (type === 'workflow.scenario.activated') throw new Error('write unavailable');
    return append(id, version, type, data);
  });
  await expect(activateScenario(f.ports, f.intent)).rejects.toThrow('write unavailable'); spy.mockRestore();
  expect(await f.ports.readActivation(f.intent.idempotencyKey, f.scope)).toBeNull();
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('validating');
  await activateScenario(f.ports, f.intent);
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('active');
});
