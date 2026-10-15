import { z } from 'zod';
import { QualificationPolicy, RefSchema, ScenarioReplayAssessment, ScenarioRevisionToken, sameDigest, sameRef, sameScope, verifySelfDigest,
  type QualificationRoundAdmission, type Ref, type Scope } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import { readQualificationEvidence, type QualificationResultPorts } from './qualification.ts';
import { assessReplayEvidence } from './replayEvidence.ts';
import { qualificationStrataDigest, readScenarioSnapshot, resolveScenarioDefinition, resolveQualificationSelection, validateQualificationMatrix,
  type ScenarioReadPorts } from './scenario.ts';

export interface ReplayAssessmentPorts extends ScenarioReadPorts {
  authorize(scope: Scope): Promise<void>;
  resolvePolicy(ref: Ref, scope: Scope): Promise<unknown>;
  /** Complete trusted index: null means still pending. Resolve retained terminal rounds of every outcome. */
  resolveRound(admission: QualificationRoundAdmission): Promise<{ roundRef: Ref; bundleDir: string } | null>;
  authenticateEvidence: QualificationResultPorts['authenticateEvidence'];
}
const RoundLocation = z.object({ roundRef: RefSchema, bundleDir: z.string().min(1).max(2048) }).strict();

/** Read-only readiness: never changes a scenario state or accepts caller-supplied passing assessments. */
export async function assessScenarioReplay(ports: ReplayAssessmentPorts, input: ScenarioRevisionToken): Promise<ScenarioReplayAssessment> {
  const token = ScenarioRevisionToken.parse(input);
  await ports.authorize(structuredClone(token.scope));
  const { projection, admissions } = await readScenarioSnapshot(ports, token);
  const scenario = await resolveScenarioDefinition(ports, projection.definitionRef, token.scope);
  const matrix = await resolveQualificationSelection(ports, scenario.qualificationMatrixRef, token.scope);
  validateQualificationMatrix(scenario, matrix, matrix);
  const policy = QualificationPolicy.parse(await ports.resolvePolicy(structuredClone(scenario.qualificationPolicyRef), structuredClone(token.scope)));
  if (!verifySelfDigest(policy) || !sameRef(policy.ref, scenario.qualificationPolicyRef) || !sameScope(policy.scope, token.scope)) {
    throw new Conflict('qualification policy identity or scope mismatch');
  }
  const rounds: ScenarioReplayAssessment['rounds'] = [];
  const findings: ScenarioReplayAssessment['findings'] = [];
  const qualifyingRoundRefs: Ref[] = [];
  // Inspect latest admission from the complete history before considering any passing results.
  const relevant = admissions.filter(a => a.invalidationEpoch === projection.invalidationEpoch).sort((a, b) => a.roundSequence - b.roundSequence);
  const latest = relevant.at(-1);
  for (const admission of relevant) {
    if (!sameRef(admission.scenarioRef, scenario.ref) || !sameRef(admission.replayContractRef, scenario.replayContractRef) ||
        !sameRef(admission.qualificationPolicyRef, policy.ref) || !sameRef(admission.qualificationMatrixRef, matrix.ref) ||
        !sameRef(admission.targetProfileRef, scenario.qualificationTargetProfileRef) ||
        !sameDigest(admission.strataDigest, qualificationStrataDigest(matrix))) {
      throw new Conflict('current-epoch admission differs from scenario replay/policy/matrix/target bindings');
    }
    const location = await ports.resolveRound(structuredClone(admission));
    if (location === null) { rounds.push({ admissionRef: admission.ref, assessment: null }); continue; }
    const { roundRef, bundleDir } = RoundLocation.parse(location);
    const evidence = await readQualificationEvidence({ authorize: async () => {},
      resolveAdmission: async ref => {
        if (!sameRef(ref, admission.ref)) throw new Conflict('foreign admission');
        return structuredClone(admission);
      }, authenticateEvidence: (a, bundle) => ports.authenticateEvidence(a, bundle),
    }, { admissionRef: admission.ref, scope: token.scope, bundleDir });
    if (!sameRef(evidence.round.ref, roundRef)) throw new Conflict('terminal round index differs from the verified campaign');
    const request = evidence.bundle.request;
    if ((scenario.sourcePlanRef === null ? request.sourcePlanRef !== null :
      !request.sourcePlanRef || !sameRef(request.sourcePlanRef, scenario.sourcePlanRef) || !request.reviewRef) ||
      (request.reviewRef !== null && !sameRef(request.reviewRef, scenario.reviewRef))) {
      throw new Conflict('qualification request differs from the reviewed scenario source plan');
    }
    validateQualificationMatrix(scenario, matrix, evidence.bundle.selection);
    const assessed = assessReplayEvidence(evidence, policy, scenario);
    rounds.push({ admissionRef: admission.ref, assessment: assessed.assessment });
    findings.push(...assessed.findings);
    if (assessed.assessment.qualifies) qualifyingRoundRefs.push(evidence.round.ref);
  }
  const reasonCodes: ScenarioReplayAssessment['reasonCodes'] = [];
  if (!['validating', 'active'].includes(projection.state)) reasonCodes.push('scenario_not_validating');
  if (qualifyingRoundRefs.length < policy.minimumIndependentRounds) reasonCodes.push('insufficient_independent_rounds');
  const latestResult = latest ? rounds.find(r => sameRef(r.admissionRef, latest.ref)) : undefined;
  if (!latest) reasonCodes.push('no_current_epoch_rounds');
  else if (!latestResult?.assessment) reasonCodes.push('latest_round_pending');
  else if (!latestResult.assessment.qualifies) reasonCodes.push('latest_round_not_qualified');
  // A registration/edit that arrives while reading evidence invalidates this report too.
  await readScenarioSnapshot(ports, token);
  return ScenarioReplayAssessment.parse({ snapshot: token, policyRef: policy.ref, requiredRounds: policy.minimumIndependentRounds,
    latestAdmissionRef: latest?.ref ?? null, rounds, qualifyingRoundRefs, qualifies: reasonCodes.length === 0, reasonCodes, findings });
}
