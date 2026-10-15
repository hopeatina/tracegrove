import { z } from 'zod';
import { DigestSchema, IdString, NonNegInt, PositiveInt, RefSchema, ScopeSchema, refList } from '../primitives.ts';

export const ScenarioDefinition = z.object({ schemaVersion: z.literal('workflow.scenario/v1'), ref: RefSchema, scope: ScopeSchema,
  sourcePlanRef: RefSchema.nullable(), reviewRef: RefSchema, caseRefs: refList().min(1), replayContractRef: RefSchema,
  qualificationPolicyRef: RefSchema, qualificationMatrixRef: RefSchema, qualificationTargetProfileRef: RefSchema,
}).strict();
export type ScenarioDefinition = z.infer<typeof ScenarioDefinition>;
export const ScenarioProjection = z.object({ id: IdString, scope: ScopeSchema, aggregateVersion: PositiveInt, definitionRef: RefSchema,
  state: z.enum(['proposed', 'validating', 'active', 'degraded', 'retired']), invalidationEpoch: NonNegInt,
  latestRoundSequence: NonNegInt, qualificationRoundRefs: refList(), activationDecisionRef: RefSchema.nullable(),
}).strict();
export type ScenarioProjection = z.infer<typeof ScenarioProjection>;
export const QualificationRoundAdmission = z.object({ schemaVersion: z.literal('workflow.qualification-admission/v1'), ref: RefSchema,
  scope: ScopeSchema, scenarioRef: RefSchema, replayContractRef: RefSchema, qualificationPolicyRef: RefSchema,
  qualificationMatrixRef: RefSchema, targetProfileRef: RefSchema, strataDigest: DigestSchema,
  invalidationEpoch: NonNegInt, roundSequence: PositiveInt, campaignId: IdString, selectionManifestRef: RefSchema,
  attempts: z.array(z.object({ selectionCellId: IdString, executionId: IdString, attemptId: IdString }).strict()).min(1).max(500),
  stateLeaseRefs: refList().min(1),
}).strict();
export type QualificationRoundAdmission = z.infer<typeof QualificationRoundAdmission>;
export const QualificationRound = z.object({ schemaVersion: z.literal('workflow.qualification-round/v1'), ref: RefSchema,
  scope: ScopeSchema, admissionRef: RefSchema, campaignResultRef: RefSchema, terminalReceiptRefs: refList().min(1),
}).strict();
export type QualificationRound = z.infer<typeof QualificationRound>;
export const QualificationPolicy = z.object({ schemaVersion: z.literal('workflow.qualification-policy/v1'), ref: RefSchema,
  scope: ScopeSchema, requiredLevel: z.enum(['environment', 'revision']), minimumIndependentRounds: z.number().int().min(2).max(20),
}).strict();
export type QualificationPolicy = z.infer<typeof QualificationPolicy>;
export const ReplayFindingCode = z.enum(['campaign_not_passed', 'non_live_provenance', 'target_identity_unproven', 'revision_identity_unproven']);
export type ReplayFindingCode = z.infer<typeof ReplayFindingCode>;
export const ReplayFinding = z.object({ schemaVersion: z.literal('workflow.replay-finding/v1'), ref: RefSchema,
  scope: ScopeSchema, roundRef: RefSchema, code: ReplayFindingCode,
}).strict();
export type ReplayFinding = z.infer<typeof ReplayFinding>;
export const ReplayAssessment = z.object({ schemaVersion: z.literal('workflow.replay-assessment/v1'), ref: RefSchema,
  scope: ScopeSchema, roundRef: RefSchema, level: z.enum(['structural', 'mock', 'environment', 'revision']),
  qualifies: z.boolean(), reasonRefs: refList(),
}).strict();
export type ReplayAssessment = z.infer<typeof ReplayAssessment>;
export const ScenarioRevisionToken = z.object({ id: IdString, scope: ScopeSchema, expectedAggregateVersion: PositiveInt,
  expectedDefinitionRef: RefSchema, expectedInvalidationEpoch: NonNegInt, expectedLatestRoundSequence: NonNegInt }).strict();
export type ScenarioRevisionToken = z.infer<typeof ScenarioRevisionToken>;
export const QualificationRoundIntent = z.object({ selectionManifestRef: RefSchema, stateLeaseRefs: refList().min(1) }).strict();
export type QualificationRoundIntent = z.infer<typeof QualificationRoundIntent>;
export const ScenarioReplayAssessment = z.object({ snapshot: ScenarioRevisionToken, policyRef: RefSchema,
  requiredRounds: z.number().int().min(2).max(20), latestAdmissionRef: RefSchema.nullable(),
  rounds: z.array(z.object({ admissionRef: RefSchema, assessment: ReplayAssessment.nullable() }).strict()).max(500),
  qualifyingRoundRefs: refList(), qualifies: z.boolean(), findings: z.array(ReplayFinding).max(2000),
  reasonCodes: z.array(z.enum(['scenario_not_validating', 'insufficient_independent_rounds', 'no_current_epoch_rounds', 'latest_round_pending', 'latest_round_not_qualified'])).max(4),
}).strict();
export type ScenarioReplayAssessment = z.infer<typeof ScenarioReplayAssessment>;
