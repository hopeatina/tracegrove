import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { cleanupTemps } from '../conformance/helpers.ts';
import { qualificationFixture, defineQualificationScenario } from './fixtures/qualification.ts';
import { localScope } from '../src/core/corpus.ts';
import { reduceQualificationRound } from '../src/core/qualification.ts';
import { assessScenarioReplay, type ReplayAssessmentPorts } from '../src/core/replayAssessment.ts';
import { QualificationPolicy, ScenarioDefinition, freeze, refKey, digestOfBytes, type Ref,
  type ScenarioRevisionToken, type ScenarioReplayAssessment } from '../src/protocol/index.ts';
import type { ScenarioSnapshot } from '../src/core/scenario.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';

const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
const policy = QualificationPolicy.parse(freeze({ schemaVersion: 'workflow.qualification-policy/v1',
  ref: { id: 'qualification-policy', revision: '1' }, scope: localScope(), requiredLevel: 'environment', minimumIndependentRounds: 2 }));
type Fixture = Awaited<ReturnType<typeof qualificationFixture>>;
const live: Fixture[] = [];
const revisionPolicy = QualificationPolicy.parse(freeze({ ...policy, ref: { id: policy.ref.id, revision: '2' }, requiredLevel: 'revision' }));
let scenario: ScenarioDefinition;
let mock: Fixture;
let failed: Fixture;
let revisionOnly: Fixture;
let sourceOnly: Fixture;
let inconclusive: Fixture;
const definitions = new Map<string, ScenarioDefinition>();
const locations = new Map<string, { roundRef: Ref; bundleDir: string }>();


beforeAll(async () => {
  // Authentic local application observations with simulated registration/issuer ports.
  // These exercise reduction, not a hosted qualification/activation authority.
  for (let index = 0; index < 2; index++) {
    const fixture = await qualificationFixture(false, (admission, selection) => {
      if (!scenario) scenario = defineQualificationScenario(selection, admission);
      admission.ref.id = `admission-${index + 1}`;
      admission.roundSequence = index + 1; admission.scenarioRef = scenario.ref;
      admission.qualificationMatrixRef = scenario.qualificationMatrixRef;
      admission.stateLeaseRefs = [ref(`lease-${index + 1}`)];
    }, 'native-real', policy.ref);
    live.push(fixture);
  }
  for (const [id, fail, profile, ownPolicy] of [
    ['mock', false, 'offline-contract', policy], ['failed', true, 'offline-contract', policy], ['revision', false, 'native-real', revisionPolicy],
    ['source', false, 'native-real', policy],
  ] as const) {
    let definition: ScenarioDefinition;
    const saved = await qualificationFixture(fail, (admission, selection) => {
      definition = defineQualificationScenario(selection, admission);
      if (id === 'source') definition = ScenarioDefinition.parse(freeze({ ...definition, sourcePlanRef: ref('reviewed-source-plan') }));
      admission.ref.id = `${id}-admission`; admission.scenarioRef = definition.ref;
    }, profile, ownPolicy.ref);
    definitions.set(refKey(saved.admission.ref), definition!);
    if (id === 'mock') mock = saved;
    if (id === 'failed') failed = saved;
    if (id === 'revision') revisionOnly = saved;
    if (id === 'source') sourceOnly = saved;
  }
  const host = new LocalProcessHost();
  inconclusive = await qualificationFixture(false, admission => {
    admission.ref.id = 'unconfirmed-cleanup'; admission.scenarioRef = scenario.ref; admission.roundSequence = 3;
    admission.qualificationMatrixRef = scenario.qualificationMatrixRef; admission.stateLeaseRefs = [ref('third-state')];
  }, 'native-real', policy.ref, { hosts: { local: { start: async context => {
    const session = await host.start(context);
    return { ...session, stop: async reason => {
      await session.stop(reason); // Always stop this test's real owned process before simulating lost acknowledgement.
      return { confirmed: false, detail: 'test simulates missing cleanup acknowledgement' };
    } };
  } } } });
  for (const fixture of [...live, mock, failed, revisionOnly, sourceOnly, inconclusive]) locations.set(refKey(fixture.admission.ref), {
    roundRef: (await reduceQualificationRound(fixture.ports, fixture.input)).ref, bundleDir: fixture.input.bundleDir,
  });
}, 30_000);
afterAll(cleanupTemps);

function fixture() {
  let snapshot: ScenarioSnapshot = { projection: { id: 'catalog', scope: scenario.scope, aggregateVersion: 3,
    definitionRef: scenario.ref, state: 'validating', invalidationEpoch: 0, latestRoundSequence: 2,
    qualificationRoundRefs: [], activationDecisionRef: null }, admissions: live.map(f => structuredClone(f.admission)) };
  const ports: ReplayAssessmentPorts = {
    authorize: vi.fn(async () => {}), read: vi.fn(async () => structuredClone(snapshot)),
    resolveDefinition: async () => structuredClone(scenario), resolveSelection: async () => structuredClone(live[0]!.bundle.selection),
    validateDefinition: vi.fn(async () => {}), resolvePolicy: async () => structuredClone(policy),
    resolveRound: vi.fn(async admission => locations.get(refKey(admission.ref)) ?? null), authenticateEvidence: vi.fn(async () => {}),
  };
  const token = (): ScenarioRevisionToken => ({ id: snapshot.projection.id, scope: snapshot.projection.scope,
    expectedAggregateVersion: snapshot.projection.aggregateVersion, expectedDefinitionRef: snapshot.projection.definitionRef,
    expectedInvalidationEpoch: snapshot.projection.invalidationEpoch, expectedLatestRoundSequence: snapshot.projection.latestRoundSequence });
  const pending = () => {
    const last = snapshot.admissions.at(-1)!;
    const admission = freeze({ ...last, ref: { id: 'pending-admission', revision: '1' }, roundSequence: last.roundSequence + 1,
      campaignId: 'pending-campaign', attempts: last.attempts.map((a, index) => ({ ...a, executionId: `pending-exec-${index}`, attemptId: `pending-attempt-${index}` })),
      stateLeaseRefs: [ref('pending-state')] });
    snapshot.admissions.push(admission); snapshot.projection.latestRoundSequence++; snapshot.projection.aggregateVersion++;
    return admission;
  };
  return { ports, token, pending, snapshot: () => snapshot, replace: (value: ScenarioSnapshot) => { snapshot = value; } };
}

it('requires two independently allocated complete live campaigns and retains the assessment snapshot', async () => {
  const f = fixture(); const result = await assessScenarioReplay(f.ports, f.token());
  expect(result.qualifies).toBe(true); expect(result.qualifyingRoundRefs).toHaveLength(2);
  expect(result.rounds.map(r => r.assessment?.level)).toEqual(['environment', 'environment']);
  expect(result.findings).toEqual([]); expect(result.snapshot).toEqual(f.token());
  expect(result.latestAdmissionRef).toEqual(live[1]!.admission.ref);
  expect(f.ports.authenticateEvidence).toHaveBeenCalledTimes(2);
  expect(f.ports.read).toHaveBeenCalledTimes(2);
});
it('does not select older passes while the latest admitted campaign is still pending', async () => {
  const f = fixture(); const latest = f.pending();
  const result = await assessScenarioReplay(f.ports, f.token());
  expect(result.qualifyingRoundRefs).toHaveLength(2);
  expect(result.qualifies).toBe(false); expect(result.reasonCodes).toContain('latest_round_pending');
  expect(result.latestAdmissionRef).toEqual(latest.ref); expect(result.rounds.at(-1)?.assessment).toBeNull();
});
it('retains a newer inconclusive complete live campaign instead of selecting only older passes', async () => {
  expect(inconclusive.bundle.campaign.outcome).toBe('inconclusive');
  const f = fixture(); f.snapshot().admissions.push(inconclusive.admission); f.snapshot().projection.latestRoundSequence = 3;
  const result = await assessScenarioReplay(f.ports, f.token());
  expect(result.qualifyingRoundRefs).toHaveLength(2); expect(result.rounds).toHaveLength(3);
  expect(result.rounds.at(-1)!.assessment).toMatchObject({ level: 'environment', qualifies: false });
  expect(result.reasonCodes).toContain('latest_round_not_qualified'); expect(result.qualifies).toBe(false);
  expect(result.findings.map(finding => finding.code)).toContain('campaign_not_passed');
});
it('cannot use one campaign or duplicate replay/state allocations as two independent rounds', async () => {
  const f = fixture(); const old = f.snapshot(); old.admissions.pop(); old.projection.latestRoundSequence = 1;
  const result = await assessScenarioReplay(f.ports, f.token());
  expect(result.qualifies).toBe(false); expect(result.reasonCodes).toContain('insufficient_independent_rounds');
  const duplicated = fixture(); duplicated.snapshot().admissions[1] = freeze({ ...live[1]!.admission, campaignId: live[0]!.admission.campaignId });
  await expect(assessScenarioReplay(duplicated.ports, duplicated.token())).rejects.toThrow('reuses');
  const reusedState = fixture(); reusedState.snapshot().admissions[1] = freeze({ ...live[1]!.admission, stateLeaseRefs: live[0]!.admission.stateLeaseRefs });
  await expect(assessScenarioReplay(reusedState.ports, reusedState.token())).rejects.toThrow('reuses');
});
it('does not count pre-invalidation rounds and never resurrects degraded or retired scenarios', async () => {
  const f = fixture(); f.snapshot().projection.invalidationEpoch = 1;
  const result = await assessScenarioReplay(f.ports, f.token());
  expect(result.qualifies).toBe(false); expect(result.rounds).toEqual([]);
  expect(result.reasonCodes).toContain('no_current_epoch_rounds'); expect(result.reasonCodes).not.toContain('latest_round_pending');
  for (const state of ['degraded', 'retired'] as const) {
    const g = fixture(); g.snapshot().projection.state = state;
    const report = await assessScenarioReplay(g.ports, g.token());
    expect(report.qualifies).toBe(false); expect(report.reasonCodes).toContain('scenario_not_validating');
  }
});
it.each(['definition', 'replay', 'policy', 'matrix', 'target', 'strata'] as const)('refuses a current-epoch %s substitution', async field => {
  const f = fixture(); const changed = structuredClone(f.snapshot().admissions[1]!);
  if (field === 'definition') changed.scenarioRef = { ...changed.scenarioRef, revision: 'different' };
  if (field === 'replay') changed.replayContractRef = ref('different');
  if (field === 'policy') changed.qualificationPolicyRef = ref('different');
  if (field === 'matrix') changed.qualificationMatrixRef = ref('different');
  if (field === 'target') changed.targetProfileRef = ref('different');
  if (field === 'strata') changed.strataDigest = digestOfBytes('different');
  f.snapshot().admissions[1] = freeze(changed);
  await expect(assessScenarioReplay(f.ports, f.token())).rejects.toThrow('bindings');
});
it('refuses a stale version and a newer admission arriving during evidence authentication', async () => {
  const f = fixture(); const stale = f.token(); f.pending();
  await expect(assessScenarioReplay(f.ports, stale)).rejects.toThrow('stale');
  const raced = fixture(); raced.ports.authenticateEvidence = async () => { if (raced.snapshot().admissions.length === 2) raced.pending(); };
  await expect(assessScenarioReplay(raced.ports, raced.token())).rejects.toThrow('stale');
});
it('refuses incomplete history, forged round indexes and unavailable authority instead of defaulting to passes', async () => {
  const f = fixture(); f.snapshot().admissions.pop();
  await expect(assessScenarioReplay(f.ports, f.token())).rejects.toThrow('incomplete');
  const g = fixture(); g.ports.resolveRound = async () => ({ roundRef: ref('forged-round'), bundleDir: live[0]!.input.bundleDir });
  await expect(assessScenarioReplay(g.ports, g.token())).rejects.toThrow('index');
  const denied = fixture(); denied.ports.authorize = async () => { throw new Error('denied'); };
  await expect(assessScenarioReplay(denied.ports, denied.token())).rejects.toThrow('denied');
  expect(denied.ports.read).not.toHaveBeenCalled();
  const issuer = fixture(); issuer.ports.authenticateEvidence = async () => { throw new Error('issuer unavailable'); };
  await expect(assessScenarioReplay(issuer.ports, issuer.token())).rejects.toThrow('issuer unavailable');
});

// The tests below assess isolated evidence under a matching synthetic catalog/host registration.
async function assessSingle(saved: Fixture, ownPolicy = policy): Promise<ScenarioReplayAssessment> {
  const definition = definitions.get(refKey(saved.admission.ref))!;
  const f = fixture(); f.ports.resolveDefinition = async () => definition; f.ports.resolvePolicy = async () => ownPolicy;
  f.ports.resolveSelection = async () => saved.bundle.selection;
  f.snapshot().projection.definitionRef = definition.ref;
  f.snapshot().admissions = [saved.admission]; f.snapshot().projection.latestRoundSequence = 1;
  return assessScenarioReplay(f.ports, f.token());
}
it('retains complete mock and failed rounds while deriving their nonqualification from raw evidence', async () => {
  const report = await assessSingle(mock);
  expect(report.qualifies).toBe(false); expect(report.rounds[0]!.assessment).toMatchObject({ level: 'mock', qualifies: false });
  expect(report.findings.map(f => f.code)).toContain('non_live_provenance');
  expect(report.reasonCodes).toContain('latest_round_not_qualified');
  const failure = await assessSingle(failed);
  expect(failure.findings.map(f => f.code)).toContain('campaign_not_passed');
  expect(failure.reasonCodes).toContain('latest_round_not_qualified');
});
it('does not use generic environment proof to satisfy a revision-specific policy', async () => {
  const report = await assessSingle(revisionOnly, revisionPolicy);
  expect(report.rounds[0]!.assessment).toMatchObject({ level: 'environment', qualifies: false });
  expect(report.findings.map(f => f.code)).toContain('revision_identity_unproven');
  expect(report.qualifies).toBe(false);
});
it('refuses qualification requests missing their scenario-bound source plan and review', async () => {
  await expect(assessSingle(sourceOnly)).rejects.toThrow('reviewed scenario source plan');
});
it('does not accept a one-round policy or substitute the current policy scope', async () => {
  expect(QualificationPolicy.safeParse({ ...policy, minimumIndependentRounds: 1 }).success).toBe(false);
  const f = fixture(); f.ports.resolvePolicy = async () => freeze({ ...policy, scope: { ...policy.scope, ownerId: 'foreign' } });
  await expect(assessScenarioReplay(f.ports, f.token())).rejects.toThrow('policy identity or scope');
});
