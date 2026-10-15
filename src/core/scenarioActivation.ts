import { z } from 'zod';
import { IdString, RefSchema, ScenarioActivation, ScenarioActivationIntent, ScenarioProjection, digestOfValue, freeze,
  refKey, sameDigest, sameRef, sameScope, verifySelfDigest, type Digest, type Ref, type Scope, type ScenarioReplayAssessment } from '../protocol/index.ts';
import { assessScenarioReplay, type ReplayAssessmentPorts } from './replayAssessment.ts';
import { readScenarioSnapshot, resolveScenarioDefinition } from './scenario.ts';
import { Blocked, Conflict } from './errors.ts';
import { nowIso } from './clock.ts';

export interface ScenarioActivationPorts extends ReplayAssessmentPorts {
  /** Authenticated explicit activation of this intent, not a caller-provided actor or approval flag. */
  authorizeActivation(scope: Scope, intentDigest: Digest): Promise<{ actorId: string; policyRef: Ref }>;
  readActivation(idempotencyKey: string, scope: Scope): Promise<unknown | null>;
  /** One transaction: compare every intent binding, validating state, latest sequence, immutable
   * selected result refs and current authorization; enforce unique scoped idempotency; publish
   * all assessment/finding documents, decision and projection, or none. False publishes nothing. */
  compareAndSwapActivation(intent: ScenarioActivationIntent, next: ScenarioProjection,
    activation: ScenarioActivation, evidence: ScenarioReplayAssessment): Promise<boolean>;
}
const Actor = z.object({ actorId: IdString, policyRef: RefSchema }).strict();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

async function priorActivation(ports: ScenarioActivationPorts, intent: ScenarioActivationIntent, digest: Digest): Promise<ScenarioActivation | null> {
  const stored = await ports.readActivation(intent.idempotencyKey, structuredClone(intent.snapshot.scope));
  if (stored === null) return null;
  const prior = ScenarioActivation.parse(stored);
  if (!verifySelfDigest(prior) || !sameScope(prior.scope, intent.snapshot.scope) ||
      prior.ref.id !== `scenario-activation-${digest.hex}` || prior.ref.revision !== '1' ||
      !sameDigest(prior.intentDigest, digest) || !sameDigest(digestOfValue(prior.intent), digest)) {
    throw new Conflict('activation idempotency key belongs to different or corrupt intent');
  }
  return prior;
}

/** Returns an immutable activation receipt, not a claim that coverage remains active on a later retry. */
export async function activateScenario(ports: ScenarioActivationPorts, input: ScenarioActivationIntent): Promise<ScenarioActivation> {
  const parsed = ScenarioActivationIntent.parse(input);
  const intent = { ...parsed, roundRefs: [...parsed.roundRefs].sort((a, b) => compare(refKey(a), refKey(b))) };
  if (new Set(intent.roundRefs.map(refKey)).size !== intent.roundRefs.length) throw new Conflict('activation selects duplicate rounds');
  const intentDigest = digestOfValue(intent);
  const actor = Actor.parse(await ports.authorizeActivation(structuredClone(intent.snapshot.scope), structuredClone(intentDigest)));
  const prior = await priorActivation(ports, intent, intentDigest);
  if (prior) return prior;
  const { projection } = await readScenarioSnapshot(ports, intent.snapshot);
  if (projection.state !== 'validating') throw new Conflict('explicit activation requires a validating scenario');
  const scenario = await resolveScenarioDefinition(ports, projection.definitionRef, intent.snapshot.scope);
  if (!sameRef(intent.replayContractRef, scenario.replayContractRef) || !sameRef(intent.qualificationPolicyRef, scenario.qualificationPolicyRef) ||
      !sameRef(intent.qualificationMatrixRef, scenario.qualificationMatrixRef) || !sameRef(intent.targetProfileRef, scenario.qualificationTargetProfileRef)) {
    throw new Conflict('activation replay/policy/matrix/target bindings changed');
  }
  // Re-derive from authenticated raw evidence; a submitted readiness boolean is never accepted.
  const report = await assessScenarioReplay(ports, intent.snapshot);
  const latest = report.rounds.find(round => report.latestAdmissionRef && sameRef(round.admissionRef, report.latestAdmissionRef));
  if (!report.qualifies || intent.roundRefs.length < report.requiredRounds ||
      !intent.roundRefs.every(ref => report.qualifyingRoundRefs.some(qualified => sameRef(ref, qualified))) ||
      !latest?.assessment || !intent.roundRefs.some(ref => sameRef(ref, latest.assessment!.roundRef))) {
    throw new Blocked([{ code: 'scenario_not_qualified', detail: 'Selected independent live rounds must satisfy current policy and include the latest admitted round',
      owner: 'scenario owner', action: 'Complete qualification or review the current evidence and selection' }]);
  }
  const assessmentRefs = intent.roundRefs.map(ref => report.rounds.find(round => round.assessment && sameRef(round.assessment.roundRef, ref))!.assessment!.ref);
  const activation = ScenarioActivation.parse(freeze({ schemaVersion: 'workflow.scenario-activation/v1',
    ref: { id: `scenario-activation-${intentDigest.hex}`, revision: '1' }, scope: intent.snapshot.scope, intent, intentDigest,
    actorId: actor.actorId, authorizationPolicyRef: actor.policyRef, assessmentRefs, activatedAt: nowIso(),
  }));
  const next = ScenarioProjection.parse({ ...projection, aggregateVersion: projection.aggregateVersion + 1, state: 'active',
    qualificationRoundRefs: intent.roundRefs, activationDecisionRef: activation.ref });
  if (!await ports.compareAndSwapActivation(structuredClone(intent), structuredClone(next), structuredClone(activation), structuredClone(report))) {
    const raced = await priorActivation(ports, intent, intentDigest);
    if (raced) return raced;
    throw new Conflict('scenario or selected evidence changed during activation');
  }
  return activation;
}
