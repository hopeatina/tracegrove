import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemps, planSample, sampleCopy } from '../conformance/helpers.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore, type LocalScenarioAuthority } from '../src/core/localScenarioStore.ts';
import { registerQualificationRound, invalidateScenario, type ScenarioRevisionToken, type ScenarioPorts } from '../src/core/scenario.ts';
import { ScenarioDefinition, SelectionManifest, digestOfBytes, freeze, refKey, type Ref, type QualificationRoundAdmission, type ScenarioProjection } from '../src/protocol/index.ts';

const roots: string[] = []; const handles: LocalLedger[] = [];
afterEach(() => { for (const ledger of handles.splice(0)) ledger.close(); cleanupTemps(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
function fixture(policy?: Partial<LocalScenarioAuthority>) {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-scenario-store-')); roots.push(root);
  const bundle = planSample(sampleCopy().configPath);
  const original = SelectionManifest.parse(bundle.documents[refKey(bundle.request!.selectionManifestRef)]);
  const matrix = SelectionManifest.parse(freeze({ ...original, policyRef: ref('qualification-policy') }));
  const selected = SelectionManifest.parse(freeze({ ...matrix, ref: { id: 'selected-round', revision: '1' } }));
  const definition = ScenarioDefinition.parse(freeze({ schemaVersion: 'workflow.scenario/v1', ref: { id: 'scenario', revision: '1' }, scope: matrix.scope,
    sourcePlanRef: null, reviewRef: ref('review'), caseRefs: bundle.request!.caseRefs, replayContractRef: ref('contract'),
    qualificationPolicyRef: matrix.policyRef, qualificationMatrixRef: matrix.ref, qualificationTargetProfileRef: ref('target-profile') }));
  // Host authentication, structural promotion and physical lease provisioning are explicitly simulated.
  const authority: LocalScenarioAuthority = { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {}, ...policy };
  function open(id = 'entry') {
    const ledger = LocalLedger.open(root); handles.push(ledger);
    return { ledger, store: new LocalScenarioStore(ledger, id, matrix.scope, authority) };
  }
  const current = open();
  const intent = (lease = 'lease-a') => ({ selectionManifestRef: selected.ref, stateLeaseRefs: [ref(lease)] });
  const token = async (store = current.store): Promise<ScenarioRevisionToken> => {
    const p = (await store.read(store === current.store ? 'entry' : 'second', matrix.scope)).projection;
    return { id: p.id, scope: p.scope, expectedAggregateVersion: p.aggregateVersion, expectedDefinitionRef: p.definitionRef,
      expectedInvalidationEpoch: p.invalidationEpoch, expectedLatestRoundSequence: p.latestRoundSequence };
  };
  return { root, ...current, open, matrix, selected, definition, authority, intent, token };
}
it('atomically persists pending registration, fresh identities and semantic invalidation across a real journal reopen', async () => {
  const f = fixture(); await f.store.initialize(f.definition, [f.matrix, f.selected, f.matrix]);
  const admission = await registerQualificationRound(f.store.ports(), await f.token(), f.intent());
  const next = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' }, replayContractRef: ref('new-contract') }));
  await f.store.stage(next); await invalidateScenario(f.store.ports(), await f.token(), next.ref);
  const original = await f.store.read('entry', f.matrix.scope); expect(original.projection).toMatchObject({ state: 'degraded', invalidationEpoch: 1, latestRoundSequence: 1, aggregateVersion: 3 });
  expect(original.admissions).toEqual([admission]);
  f.ledger.close(); const reopened = f.open();
  expect(await reopened.store.read('entry', f.matrix.scope)).toEqual(original);
  expect(await reopened.store.resolveAdmission(admission.ref, f.matrix.scope)).toEqual(admission);
  const records = readFileSync(join(f.root, 'ledger/journal.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const committed = records.find(record => record.type === 'workflow.scenario.round-registered');
  expect(committed.data.scenarios[0].selections).toHaveLength(2);
  expect(committed.data.scenarios[0]).toMatchObject({ projection: { latestRoundSequence: 1, aggregateVersion: 2 }, admissions: [admission] });
});
it('arbitrates concurrent registration through one journal CAS and publishes no losing claim', async () => {
  let release!: () => void; const paused = new Promise<void>(resolve => { release = resolve; }); let waiting = 0;
  const f = fixture({ validateStateLeases: async () => { waiting++; await paused; } }); await f.store.initialize(f.definition, [f.matrix, f.selected]);
  const token = await f.token(); const first = registerQualificationRound(f.store.ports(), token, f.intent('lease-a'));
  const second = registerQualificationRound(f.store.ports(), token, f.intent('lease-b'));
  await expect.poll(() => waiting).toBe(2); release();
  const results = await Promise.allSettled([first, second]); expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const snapshot = await f.store.read('entry', f.matrix.scope); expect(snapshot.projection.latestRoundSequence).toBe(1); expect(snapshot.admissions).toHaveLength(1);
});
it('refuses lease reuse across different scenarios, including a renamed revision of the same physical identity', async () => {
  const f = fixture(); await f.store.initialize(f.definition, [f.matrix, f.selected]);
  await registerQualificationRound(f.store.ports(), await f.token(), f.intent());
  const second = new LocalScenarioStore(f.ledger, 'second', f.matrix.scope, f.authority); await second.initialize(f.definition, [f.matrix, f.selected]);
  const changed = { selectionManifestRef: f.selected.ref, stateLeaseRefs: [{ ...ref('lease-a'), revision: '2' }] };
  await expect(registerQualificationRound(second.ports(), await f.token(second), changed)).rejects.toThrow('reuses');
  expect((await second.read('second', f.matrix.scope)).admissions).toHaveLength(0);
  expect((await f.store.read('entry', f.matrix.scope)).admissions).toHaveLength(1);
});
it('refuses revoked or unprovisioned state without publishing admission or advancing its projection', async () => {
  let revoked = false;
  const f = fixture({ authorize: async (_scope, action) => { if (revoked && action === 'register_round') throw new Error('authority revoked'); },
    validateStateLeases: async () => { revoked = true; } });
  await f.store.initialize(f.definition, [f.matrix, f.selected]); const before = await f.store.read('entry', f.matrix.scope);
  await expect(registerQualificationRound(f.store.ports(), await f.token(), f.intent())).rejects.toThrow('revoked');
  expect(await f.store.read('entry', f.matrix.scope)).toEqual(before);
  revoked = false; f.authority.validateStateLeases = async () => { throw new Error('state not provisioned'); };
  await expect(registerQualificationRound(f.store.ports(), await f.token(), f.intent())).rejects.toThrow('not provisioned');
  expect(await f.store.read('entry', f.matrix.scope)).toEqual(before);
});
it('reconciles an acknowledgement lost after actual publication without registering a second attempt', async () => {
  const f = fixture(); await f.store.initialize(f.definition, [f.matrix, f.selected]); const old = await f.token();
  const append = f.ledger.append.bind(f.ledger);
  f.ledger.append = (...args) => { const result = append(...args); if (args[2] === 'workflow.scenario.round-registered') throw new Error('commit acknowledgement lost'); return result; };
  await expect(registerQualificationRound(f.store.ports(), old, f.intent())).rejects.toThrow('acknowledgement lost');
  f.ledger.close(); const reopened = f.open();
  const snapshot = await reopened.store.read('entry', f.matrix.scope); expect(snapshot.admissions).toHaveLength(1);
  await expect(registerQualificationRound(reopened.store.ports(), old, f.intent())).rejects.toThrow('stale scenario');
  expect(await reopened.store.resolveAdmission(snapshot.admissions[0]!.ref, f.matrix.scope)).toEqual(snapshot.admissions[0]);
});
it('refuses forged projection transitions, foreign documents and closed-ledger reads', async () => {
  let checked = 0; const f = fixture({ validateDefinition: async () => { checked++; } });
  const foreign = freeze({ ...f.definition, scope: { ...f.matrix.scope, ownerId: 'another-owner' } });
  await expect(f.store.initialize(foreign, [f.matrix, f.selected])).rejects.toThrow('scope mismatch'); expect(checked).toBe(0);
  await f.store.initialize(f.definition, [f.matrix, f.selected]);
  let captured: { projection: ScenarioProjection; admission: QualificationRoundAdmission | null } | null = null;
  const ports: ScenarioPorts = { ...f.store.ports(), compareAndSwap: async (_version, projection, admission) => { captured = { projection, admission }; return false; } };
  await expect(registerQualificationRound(ports, await f.token(), f.intent())).rejects.toThrow('changed during');
  if (!captured) throw new Error('Admission callback was not exercised');
  const candidate = captured as { projection: ScenarioProjection; admission: QualificationRoundAdmission | null };
  await expect(f.store.ports().compareAndSwap(1, { ...candidate.projection, state: 'active' }, candidate.admission)).rejects.toThrow('unauthorized projection');
  expect((await f.store.read('entry', f.matrix.scope)).admissions).toEqual([]);
  f.ledger.close(); await expect(f.store.read('entry', f.matrix.scope)).rejects.toThrow('ledger closed');
});

it('lets invalidation win while a registration is validating state, without restoring the older epoch', async () => {
  let release!: () => void; const paused = new Promise<void>(resolve => { release = resolve; }); let waiting = false;
  const f = fixture({ validateStateLeases: async () => { waiting = true; await paused; } }); await f.store.initialize(f.definition, [f.matrix, f.selected]);
  const pending = registerQualificationRound(f.store.ports(), await f.token(), f.intent());
  await expect.poll(() => waiting).toBe(true);
  const next = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' }, replayContractRef: ref('changed-contract') }));
  await f.store.stage(next); await invalidateScenario(f.store.ports(), await f.token(), next.ref);
  release(); await expect(pending).rejects.toThrow('changed during round');
  expect(await f.store.read('entry', f.matrix.scope)).toMatchObject({ projection: { state: 'degraded', invalidationEpoch: 1, latestRoundSequence: 0 }, admissions: [] });
});
it('keeps staged definitions unactivated, rejects immutable collisions, and returns copies of journal records', async () => {
  const f = fixture(); await f.store.initialize(f.definition, [f.matrix, f.selected]); const initial = await f.store.read('entry', f.matrix.scope);
  const next = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' }, replayContractRef: ref('changed-contract') }));
  await f.store.stage(next); expect(await f.store.read('entry', f.matrix.scope)).toEqual(initial);
  const before = readFileSync(join(f.root, 'ledger/journal.jsonl'), 'utf8');
  await f.store.stage(next); expect(readFileSync(join(f.root, 'ledger/journal.jsonl'), 'utf8')).toBe(before);
  const altered = freeze({ ...next, replayContractRef: ref('substituted') }); await expect(f.store.stage(altered)).rejects.toThrow('immutable identity');
  const admission = await registerQualificationRound(f.store.ports(), await f.token(), f.intent());
  const returned = await f.store.resolveAdmission(admission.ref, f.matrix.scope); returned.stateLeaseRefs[0]!.id = 'caller-mutation';
  expect(await f.store.resolveAdmission(admission.ref, f.matrix.scope)).toEqual(admission);
});
it('rechecks initialization authority after definition validation and leaves no validating projection on revocation', async () => {
  let revoked = false;
  const f = fixture({ authorize: async (_scope, action) => { if (revoked && action === 'initialize') throw new Error('initialization revoked'); },
    validateDefinition: async () => { revoked = true; } });
  await expect(f.store.initialize(f.definition, [f.matrix, f.selected])).rejects.toThrow('revoked');
  await expect(f.store.read('entry', f.matrix.scope)).rejects.toThrow('not initialized');
});
