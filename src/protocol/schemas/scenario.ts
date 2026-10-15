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
export const ScenarioRevisionToken = z.object({ id: IdString, scope: ScopeSchema, expectedAggregateVersion: PositiveInt,
  expectedDefinitionRef: RefSchema, expectedInvalidationEpoch: NonNegInt, expectedLatestRoundSequence: NonNegInt }).strict();
export type ScenarioRevisionToken = z.infer<typeof ScenarioRevisionToken>;
export const QualificationRoundIntent = z.object({ selectionManifestRef: RefSchema, stateLeaseRefs: refList().min(1) }).strict();
export type QualificationRoundIntent = z.infer<typeof QualificationRoundIntent>;
