import { vi } from 'vitest';
import { localScope } from '../../src/core/corpus.ts';
import { reduceQualificationRound } from '../../src/core/qualification.ts';
import type { ScenarioSnapshot } from '../../src/core/scenario.ts';
import type { ScenarioActivationPorts } from '../../src/core/scenarioActivation.ts';
import { QualificationPolicy, ScenarioActivationIntent, digestOfBytes, freeze, refKey, sameRef, sameScope,
  type Ref, type ScenarioActivation, type ScenarioDefinition, type ScenarioReplayAssessment } from '../../src/protocol/index.ts';
import { qualificationFixture, defineQualificationScenario } from './qualification.ts';

const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });

/** Simulated trusted store around real observation bundles; no hosted authorization or activation. */
export async function activationFixture(profile = 'native-real', rounds = 2) {
  const policy = QualificationPolicy.parse(freeze({ schemaVersion: 'workflow.qualification-policy/v1',
    ref: { id: 'policy', revision: '1' }, scope: localScope(), requiredLevel: 'environment', minimumIndependentRounds: 2 }));
  let scenario: ScenarioDefinition | undefined;
  const fixtures: Awaited<ReturnType<typeof qualificationFixture>>[] = [];
  for (let index = 0; index < rounds; index++) {
    const saved = await qualificationFixture(false, (admission, selection) => {
      scenario ??= defineQualificationScenario(selection, admission);
      admission.ref.id = `admission-${index + 1}`; admission.roundSequence = index + 1;
      admission.scenarioRef = scenario.ref; admission.qualificationMatrixRef = scenario.qualificationMatrixRef;
      admission.stateLeaseRefs = [ref(`state-${index + 1}`)];
    }, profile, policy.ref);
    fixtures.push(saved);
  }
  const definition = scenario!;
  const locations = new Map<string, { roundRef: Ref; bundleDir: string }>();
  for (const saved of fixtures) locations.set(refKey(saved.admission.ref), {
    roundRef: (await reduceQualificationRound(saved.ports, saved.input)).ref, bundleDir: saved.input.bundleDir,
  });
  const snapshot: ScenarioSnapshot = { projection: { id: 'catalog', scope: definition.scope, aggregateVersion: rounds + 1,
    definitionRef: definition.ref, state: 'validating', invalidationEpoch: 0, latestRoundSequence: rounds,
    qualificationRoundRefs: [], activationDecisionRef: null }, admissions: fixtures.map(saved => saved.admission) };
  const decisions = new Map<string, ScenarioActivation>();
  const published: ScenarioReplayAssessment[] = [];
  const controls = { authorized: true, beforeCommit: () => {} };
  const ports: ScenarioActivationPorts = {
    authorize: async () => {}, read: vi.fn(async () => structuredClone(snapshot)),
    resolveDefinition: async () => definition, resolveSelection: async () => fixtures[0]!.bundle.selection,
    validateDefinition: async () => {}, resolvePolicy: async () => policy,
    resolveRound: async admission => locations.get(refKey(admission.ref)) ?? null, authenticateEvidence: async () => {},
    authorizeActivation: vi.fn(async scope => {
      if (!controls.authorized || !sameScope(scope, definition.scope)) throw new Error('activation denied');
      return { actorId: 'authenticated-owner', policyRef: ref('owner-activation-policy') };
    }),
    readActivation: vi.fn(async (key, scope) => sameScope(scope, definition.scope) ? decisions.get(key) ?? null : null),
    compareAndSwapActivation: vi.fn<ScenarioActivationPorts['compareAndSwapActivation']>(async (intent, next, decision, report) => {
      controls.beforeCommit();
      const p = snapshot.projection; const token = intent.snapshot;
      const actualRounds = [...locations.values()].map(location => location.roundRef);
      if (!controls.authorized || decisions.has(intent.idempotencyKey) || p.state !== 'validating' || p.id !== token.id ||
          !sameScope(p.scope, token.scope) || p.aggregateVersion !== token.expectedAggregateVersion ||
          p.invalidationEpoch !== token.expectedInvalidationEpoch || p.latestRoundSequence !== token.expectedLatestRoundSequence ||
          !sameRef(p.definitionRef, token.expectedDefinitionRef) || !sameRef(intent.replayContractRef, definition.replayContractRef) ||
          !sameRef(intent.qualificationPolicyRef, definition.qualificationPolicyRef) || !sameRef(intent.qualificationMatrixRef, definition.qualificationMatrixRef) ||
          !sameRef(intent.targetProfileRef, definition.qualificationTargetProfileRef) || !intent.roundRefs.every(round => actualRounds.some(ref => sameRef(ref, round)))) return false;
      // The simulated transaction publishes all three effects together, only after every guard.
      published.push(structuredClone(report)); decisions.set(intent.idempotencyKey, structuredClone(decision));
      snapshot.projection = structuredClone(next);
      return true;
    }),
  };
  const intent = (): ScenarioActivationIntent => ({ snapshot: { id: snapshot.projection.id, scope: definition.scope,
    expectedAggregateVersion: snapshot.projection.aggregateVersion, expectedDefinitionRef: definition.ref,
    expectedInvalidationEpoch: snapshot.projection.invalidationEpoch, expectedLatestRoundSequence: snapshot.projection.latestRoundSequence },
    replayContractRef: definition.replayContractRef, qualificationPolicyRef: policy.ref, qualificationMatrixRef: definition.qualificationMatrixRef,
    targetProfileRef: definition.qualificationTargetProfileRef, roundRefs: [...locations.values()].map(location => location.roundRef), idempotencyKey: 'activate-1' });
  const pending = () => {
    const previous = snapshot.admissions.at(-1)!;
    snapshot.admissions.push(freeze({ ...previous, ref: { id: 'new-admission', revision: '1' }, roundSequence: previous.roundSequence + 1,
      campaignId: 'new-campaign', attempts: previous.attempts.map((a, index) => ({ ...a, executionId: `new-execution-${index}`, attemptId: `new-attempt-${index}` })),
      stateLeaseRefs: [ref('new-state')] }));
    snapshot.projection.aggregateVersion++; snapshot.projection.latestRoundSequence++;
  };
  return { ports, intent, snapshot, controls, decisions, published, pending, locations };
}
