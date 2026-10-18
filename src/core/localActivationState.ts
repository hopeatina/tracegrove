import { z } from 'zod';
import { ScenarioActivation, ScenarioReplayAssessment, digestOfValue, sameRef, sameScope, verifySelfDigest,
  type ScenarioProjection } from '../protocol/index.ts';
import { deriveScenarioActivation } from './activationDecision.ts';
import { Conflict } from './errors.ts';
import type { StoredScenario } from './localScenarioState.ts';

export const StoredActivation = z.object({ activation: ScenarioActivation, report: ScenarioReplayAssessment }).strict();
export type StoredActivation = z.infer<typeof StoredActivation>;
/** Structural historical validation. Authenticity is established by the commit's trusted evidence/actor ports. */
export function validateStoredActivations(entry: StoredScenario, keys: Set<string>): void {
  const p = entry.projection;
  for (const { activation, report } of entry.activations) {
    const intent = activation.intent; const token = intent.snapshot;
    if (keys.has(intent.idempotencyKey)) throw new Conflict('activation idempotency key is not unique in this scope');
    keys.add(intent.idempotencyKey);
    const definition = entry.definitions.find(d => sameRef(d.ref, token.expectedDefinitionRef));
    const admissions = entry.admissions.filter(a => a.roundSequence <= token.expectedLatestRoundSequence && a.invalidationEpoch === token.expectedInvalidationEpoch);
    if (!definition || token.id !== p.id || !sameScope(activation.scope, p.scope) || !sameScope(token.scope, p.scope) ||
        token.expectedInvalidationEpoch > p.invalidationEpoch || token.expectedLatestRoundSequence > p.latestRoundSequence ||
        token.expectedAggregateVersion >= p.aggregateVersion || !verifySelfDigest(activation) ||
        digestOfValue(report.rounds.map(r => r.admissionRef)).hex !== digestOfValue(admissions.map(a => a.ref)).hex ||
        !report.latestAdmissionRef || !admissions.length || !sameRef(report.latestAdmissionRef, admissions.at(-1)!.ref)) throw new Conflict('stored activation differs from its historical scenario');
    for (const document of [...report.findings, ...report.rounds.flatMap(r => r.assessment ? [r.assessment] : [])]) {
      if (!verifySelfDigest(document) || !sameScope(document.scope, p.scope)) throw new Conflict('stored activation assessment seal or scope changed');
    }
    const assessments = report.rounds.flatMap(r => r.assessment ? [r.assessment] : []);
    if (new Set(report.findings.map(f => f.ref.id)).size !== report.findings.length ||
        assessments.some(a => a.reasonRefs.some(ref => !report.findings.some(f => sameRef(f.ref, ref) && sameRef(f.roundRef, a.roundRef)))) ||
        report.findings.some(f => !assessments.some(a => a.reasonRefs.some(ref => sameRef(ref, f.ref))))) throw new Conflict('stored activation findings are incomplete or substituted');
    const qualifying = report.rounds.flatMap(r => r.assessment?.qualifies ? [r.assessment.roundRef] : []);
    if (digestOfValue(qualifying).hex !== digestOfValue(report.qualifyingRoundRefs).hex) throw new Conflict('stored activation qualifying assessments changed');
    const historical: ScenarioProjection = { ...p, aggregateVersion: token.expectedAggregateVersion, definitionRef: token.expectedDefinitionRef,
      invalidationEpoch: token.expectedInvalidationEpoch, latestRoundSequence: token.expectedLatestRoundSequence, state: 'validating' };
    const derived = deriveScenarioActivation(intent, historical, definition, report,
      { actorId: activation.actorId, policyRef: activation.authorizationPolicyRef }, activation.activatedAt);
    if (!sameRef(derived.activation.ref, activation.ref)) throw new Conflict('stored activation decision bindings changed');
  }
  if (p.state === 'active') {
    const record = entry.activations.find(a => p.activationDecisionRef && sameRef(a.activation.ref, p.activationDecisionRef));
    if (!record || !sameRef(record.activation.intent.snapshot.expectedDefinitionRef, p.definitionRef) ||
        record.activation.intent.snapshot.expectedInvalidationEpoch !== p.invalidationEpoch ||
        digestOfValue(record.activation.intent.roundRefs).hex !== digestOfValue(p.qualificationRoundRefs).hex) throw new Conflict('active projection has no matching persisted activation');
  }
}
