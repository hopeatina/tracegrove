import { IdString, RefSchema, ScenarioActivation, ScenarioProjection, digestOfValue, freeze, sameRef,
  type ScenarioActivationIntent, type ScenarioDefinition, type ScenarioReplayAssessment } from '../protocol/index.ts';
import { z } from 'zod';
import { Blocked, Conflict } from './errors.ts';

export const ActivationActor = z.object({ actorId: IdString, policyRef: RefSchema }).strict();
export function assertActivationBindings(intent: ScenarioActivationIntent, scenario: ScenarioDefinition): void {
  if (!sameRef(intent.replayContractRef, scenario.replayContractRef) || !sameRef(intent.qualificationPolicyRef, scenario.qualificationPolicyRef) ||
      !sameRef(intent.qualificationMatrixRef, scenario.qualificationMatrixRef) || !sameRef(intent.targetProfileRef, scenario.qualificationTargetProfileRef)) throw new Conflict('activation replay/policy/matrix/target bindings changed');
}
/** Shared decision construction. The host must independently derive report and actor before calling. */
export function deriveScenarioActivation(intent: ScenarioActivationIntent, projection: ScenarioProjection, scenario: ScenarioDefinition,
  report: ScenarioReplayAssessment, actor: z.infer<typeof ActivationActor>, activatedAt: string) {
  assertActivationBindings(intent, scenario);
  if (projection.state !== 'validating' || digestOfValue(report.snapshot).hex !== digestOfValue(intent.snapshot).hex ||
      !sameRef(report.policyRef, scenario.qualificationPolicyRef)) throw new Conflict('activation evidence snapshot or policy changed');
  const latest = report.rounds.find(round => report.latestAdmissionRef && sameRef(round.admissionRef, report.latestAdmissionRef));
  if (!report.qualifies || report.reasonCodes.length || intent.roundRefs.length < report.requiredRounds ||
      new Set(intent.roundRefs.map(r => digestOfValue(r).hex)).size !== intent.roundRefs.length ||
      !intent.roundRefs.every(ref => report.qualifyingRoundRefs.some(qualified => sameRef(ref, qualified)) &&
        report.rounds.some(r => r.assessment?.qualifies && sameRef(r.assessment.roundRef, ref))) ||
      !latest?.assessment || !intent.roundRefs.some(ref => sameRef(ref, latest.assessment!.roundRef))) {
    throw new Blocked([{ code: 'scenario_not_qualified', detail: 'Selected independent live rounds must satisfy current policy and include the latest admitted round',
      owner: 'scenario owner', action: 'Complete qualification or review the current evidence and selection' }]);
  }
  const assessmentRefs = intent.roundRefs.map(ref => report.rounds.find(round => round.assessment && sameRef(round.assessment.roundRef, ref))!.assessment!.ref);
  const intentDigest = digestOfValue(intent);
  const activation = ScenarioActivation.parse(freeze({ schemaVersion: 'workflow.scenario-activation/v1',
    ref: { id: `scenario-activation-${intentDigest.hex}`, revision: '1' }, scope: intent.snapshot.scope, intent, intentDigest,
    actorId: actor.actorId, authorizationPolicyRef: actor.policyRef, assessmentRefs, activatedAt }));
  const next = ScenarioProjection.parse({ ...projection, aggregateVersion: projection.aggregateVersion + 1, state: 'active',
    qualificationRoundRefs: intent.roundRefs, activationDecisionRef: activation.ref });
  return { activation, next };
}
