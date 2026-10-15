import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTemps, planSample, sampleCopy } from '../conformance/helpers.ts';
import { ScenarioDefinition, SelectionManifest, digestOfBytes, freeze, refKey, type Ref } from '../src/protocol/index.ts';
import { invalidateScenario, registerQualificationRound, type ScenarioPorts, type ScenarioRevisionToken, type ScenarioSnapshot } from '../src/core/scenario.ts';

afterEach(cleanupTemps);
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
function fixture() {
  const bundle = planSample(sampleCopy().configPath);
  const selection = SelectionManifest.parse(bundle.documents[refKey(bundle.request!.selectionManifestRef)]);
  const policy = ref('qualification-policy');
  const matrix = SelectionManifest.parse(freeze({ ...selection, policyRef: policy }));
  const selected = SelectionManifest.parse(freeze({ ...matrix, ref: { id: 'round-selection', revision: '1' } }));
  const scenario = ScenarioDefinition.parse(freeze({ schemaVersion: 'workflow.scenario/v1', ref: { id: 'scenario', revision: '1' },
    scope: matrix.scope, sourcePlanRef: null, reviewRef: ref('review'), caseRefs: bundle.request!.caseRefs, replayContractRef: ref('contract'),
    qualificationPolicyRef: policy, qualificationMatrixRef: matrix.ref, qualificationTargetProfileRef: ref('target-profile') }));
  const next = ScenarioDefinition.parse(freeze({ ...scenario, ref: { id: scenario.ref.id, revision: '2' }, replayContractRef: ref('new-contract') }));
  let snapshot: ScenarioSnapshot = { projection: { id: 'catalog-entry', scope: matrix.scope, aggregateVersion: 1, definitionRef: scenario.ref,
    state: 'validating', invalidationEpoch: 0, latestRoundSequence: 0, qualificationRoundRefs: [], activationDecisionRef: null }, admissions: [] };
  const documents = new Map<string, unknown>([scenario, next, matrix, selected].map(d => [refKey(d.ref), d]));
  const ports: ScenarioPorts = {
    authorize: async () => {}, read: async () => structuredClone(snapshot),
    resolveDefinition: async r => documents.get(refKey(r)), resolveSelection: async r => documents.get(refKey(r)), validateDefinition: async () => {},
    compareAndSwap: async (version, projection, admission) => {
      if (snapshot.projection.aggregateVersion !== version) return false;
      snapshot = { projection: structuredClone(projection), admissions: [...snapshot.admissions, ...(admission ? [structuredClone(admission)] : [])] };
      return true;
    },
  };
  const token = (): ScenarioRevisionToken => ({ id: snapshot.projection.id, scope: matrix.scope, expectedAggregateVersion: snapshot.projection.aggregateVersion,
    expectedDefinitionRef: snapshot.projection.definitionRef, expectedInvalidationEpoch: snapshot.projection.invalidationEpoch,
    expectedLatestRoundSequence: snapshot.projection.latestRoundSequence });
  const intent = (id: string) => ({ selectionManifestRef: selected.ref, stateLeaseRefs: [ref(id)] });
  return { ports, token, intent, scenario, next, matrix, selected, documents, snapshot: () => structuredClone(snapshot),
    replace: (value: ScenarioSnapshot) => { snapshot = value; } };
}
describe('qualification round registration and semantic invalidation', () => {
  it('publishes the complete pending selection before any execution and allocates distinct attempts', async () => {
    const f = fixture(); const before = f.token();
    const first = await registerQualificationRound(f.ports, before, f.intent('lease-1'));
    expect(first.attempts.map(a => a.selectionCellId)).toEqual(f.matrix.cells.map(c => c.selectionCellId));
    expect(first).not.toHaveProperty('outcome');
    expect(f.snapshot().projection).toMatchObject({ aggregateVersion: 2, latestRoundSequence: 1, state: 'validating' });
    const second = await registerQualificationRound(f.ports, f.token(), f.intent('lease-2'));
    expect(second.roundSequence).toBe(2);
    expect(second.campaignId).not.toBe(first.campaignId);
    expect(second.attempts[0]!.attemptId).not.toBe(first.attempts[0]!.attemptId);
    await expect(registerQualificationRound(f.ports, before, f.intent('lease-3'))).rejects.toThrow('stale scenario');
  });
  it('refuses a changed persona or target even when the case set still matches', async () => {
    const f = fixture();
    const changed = SelectionManifest.parse(freeze({ ...f.selected, cells: f.selected.cells.map(c => ({ ...c, personaRef: ref('another-persona') })) }));
    f.documents.set(refKey(changed.ref), changed);
    await expect(registerQualificationRound(f.ports, f.token(), { ...f.intent('lease'), selectionManifestRef: changed.ref })).rejects.toThrow('exact required');
    expect(f.snapshot().admissions).toEqual([]);
  });
  it('does not let redelivery or a changed lease digest count as fresh state', async () => {
    const f = fixture(); await registerQualificationRound(f.ports, f.token(), f.intent('lease'));
    await expect(registerQualificationRound(f.ports, f.token(), f.intent('lease'))).rejects.toThrow('fresh');
    await expect(registerQualificationRound(f.ports, f.token(), { selectionManifestRef: f.selected.ref,
      stateLeaseRefs: [{ ...ref('lease'), revision: '2', digest: digestOfBytes('relabeled') }] })).rejects.toThrow('fresh');
    expect(f.snapshot().admissions).toHaveLength(1);
  });
  it('permits only one concurrent registration for an exact scenario snapshot', async () => {
    const f = fixture(); const token = f.token();
    const results = await Promise.allSettled([registerQualificationRound(f.ports, token, f.intent('a')), registerQualificationRound(f.ports, token, f.intent('b'))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.snapshot().admissions).toHaveLength(1);
  });
  it('arbitrates registration against semantic invalidation without publishing the loser', async () => {
    const f = fixture(); const token = f.token();
    const results = await Promise.allSettled([registerQualificationRound(f.ports, token, f.intent('lease')), invalidateScenario(f.ports, token, f.next.ref)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const saved = f.snapshot();
    expect(saved.projection.aggregateVersion).toBe(2);
    expect(saved.admissions.length + saved.projection.invalidationEpoch).toBe(1);
  });
  it('refuses an empty selection and keeps rejected authorization outside the store', async () => {
    const f = fixture(); const empty = SelectionManifest.parse(freeze({ ...f.selected, cells: [] }));
    f.documents.set(refKey(empty.ref), empty);
    await expect(registerQualificationRound(f.ports, f.token(), { ...f.intent('lease'), selectionManifestRef: empty.ref })).rejects.toThrow('empty');
    const denied = fixture(); denied.ports.authorize = async () => { throw new Error('registration denied'); };
    await expect(registerQualificationRound(denied.ports, denied.token(), denied.intent('lease'))).rejects.toThrow('denied');
    expect(denied.snapshot().admissions).toEqual([]);
  });
  it('retains pending history and advances epoch while clearing active authority on edit', async () => {
    const f = fixture(); await registerQualificationRound(f.ports, f.token(), f.intent('lease'));
    const active = f.snapshot(); active.projection.state = 'active'; active.projection.activationDecisionRef = ref('activation'); f.replace(active);
    const changed = await invalidateScenario(f.ports, f.token(), f.next.ref);
    expect(changed).toMatchObject({ state: 'degraded', invalidationEpoch: 1, latestRoundSequence: 1, activationDecisionRef: null });
    expect(f.snapshot().admissions).toEqual(active.admissions);
    await expect(registerQualificationRound(f.ports, f.token(), f.intent('fresh-lease'))).rejects.toThrow('structurally validated');
  });
  it('rejects incomplete history, retired coverage and denied definition closure', async () => {
    const f = fixture(); const corrupt = f.snapshot(); corrupt.projection.latestRoundSequence = 1; f.replace(corrupt);
    await expect(registerQualificationRound(f.ports, f.token(), f.intent('lease'))).rejects.toThrow('incomplete');
    const retired = fixture(); const old = retired.snapshot(); old.projection.state = 'retired'; retired.replace(old);
    await expect(invalidateScenario(retired.ports, retired.token(), retired.next.ref)).rejects.toThrow('retired');
    const denied = fixture(); denied.ports.validateDefinition = async () => { throw new Error('unresolved replay contract'); };
    await expect(registerQualificationRound(denied.ports, denied.token(), denied.intent('lease'))).rejects.toThrow('unresolved');
    expect(denied.snapshot().admissions).toEqual([]);
  });
});
