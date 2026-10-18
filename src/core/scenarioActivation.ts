import { ScenarioActivation, ScenarioActivationIntent, ScenarioProjection, digestOfValue,
  refKey, sameDigest, sameRef, sameScope, verifySelfDigest, type Digest, type Ref, type Scope, type ScenarioReplayAssessment } from '../protocol/index.ts';
import { assessScenarioReplay, type ReplayAssessmentPorts } from './replayAssessment.ts';
import { readScenarioSnapshot, resolveScenarioDefinition } from './scenario.ts';
import { Conflict } from './errors.ts';
import { ActivationActor, assertActivationBindings, deriveScenarioActivation } from './activationDecision.ts';
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
  const actor = ActivationActor.parse(await ports.authorizeActivation(structuredClone(intent.snapshot.scope), structuredClone(intentDigest)));
  const prior = await priorActivation(ports, intent, intentDigest);
  if (prior) return prior;
  const { projection } = await readScenarioSnapshot(ports, intent.snapshot);
  if (projection.state !== 'validating') throw new Conflict('explicit activation requires a validating scenario');
  const scenario = await resolveScenarioDefinition(ports, projection.definitionRef, intent.snapshot.scope);
  assertActivationBindings(intent, scenario);
  // Re-derive from authenticated raw evidence; a submitted readiness boolean is never accepted.
  const report = await assessScenarioReplay(ports, intent.snapshot);
  const { activation, next } = deriveScenarioActivation(intent, projection, scenario, report, actor, nowIso());
  if (!await ports.compareAndSwapActivation(structuredClone(intent), structuredClone(next), structuredClone(activation), structuredClone(report))) {
    const raced = await priorActivation(ports, intent, intentDigest);
    if (raced) return raced;
    throw new Conflict('scenario or selected evidence changed during activation');
  }
  return activation;
}
