import { z } from 'zod';
import { DigestSchema, IdString, LIMITS, RefSchema, ScopeSchema } from '../primitives.ts';
import { CampaignResult, ExecutionReceipt, Outcome, SelectionManifest, TargetTuple } from './execution.ts';

export const ReplayChange = z.enum(['unchanged', 'passed_to_failed', 'failed_to_passed', 'outcome_changed',
  'selection_added', 'selection_removed', 'ambiguous_selection', 'missing_receipt', 'contract_changed', 'context_changed']);
export const ReplayComparisonPoint = z.object({
  selectionCellId: IdString, required: z.boolean(), caseRef: RefSchema, personaRef: RefSchema,
  surfaceBindingRef: RefSchema, variantRef: RefSchema.nullable(),
  contractDigest: DigestSchema, contextDigest: DigestSchema, expectedTargetDigest: DigestSchema,
  observedTargetDigest: DigestSchema.nullable(), receiptRef: RefSchema.nullable(), executionId: IdString.nullable(),
  declaredComponents: TargetTuple.shape.components, observedComponents: TargetTuple.shape.components.nullable(),
  repositoryCommits: z.array(TargetTuple.shape.repositories.element.pick({ repositoryRole: true, resolvedCommit: true })).max(32),
  outcome: Outcome.nullable(), proofEligible: z.boolean().nullable(),
  reasons: ExecutionReceipt.shape.reasonCodes,
  steps: z.array(ExecutionReceipt.shape.steps.element.pick({ stepId: true, result: true, reasonCode: true })).max(LIMITS.list),
  assertions: z.array(ExecutionReceipt.shape.assertions.element.pick({ assertionId: true, required: true, result: true, reasonCode: true })).max(LIMITS.list),
}).strict();
const Bundle = z.object({ manifestDigest: DigestSchema, campaignId: IdString, requestRef: RefSchema,
  outcome: Outcome, coverage: CampaignResult.shape.coverage,
  selectedCells: z.number().int().nonnegative(), retainedReceipts: z.number().int().nonnegative(),
  excludedCells: SelectionManifest.shape.excludedCells,
}).strict();
export const ReplayComparison = z.object({
  schemaVersion: z.literal('tracegrove.replay-comparison/v1'), scope: ScopeSchema,
  operation: z.literal('read_only'), qualification: z.literal('not_evaluated'), issuerTrust: z.literal('not_authenticated'),
  evidenceScope: z.literal('provided_bundles_only'),
  executionIdentityRelation: z.enum(['same_campaign', 'overlapping_executions', 'distinct_recorded_executions', 'unavailable']),
  baseline: Bundle, candidate: Bundle,
  selectionPolicyChanged: z.boolean(),
  rows: z.array(z.object({ key: DigestSchema,
    dimensions: z.object({ caseId: IdString, personaId: IdString, surfaceId: IdString, variantId: IdString.nullable(), environmentId: IdString }).strict(),
    baseline: z.array(ReplayComparisonPoint).max(LIMITS.list), candidate: z.array(ReplayComparisonPoint).max(LIMITS.list),
    change: ReplayChange,
  }).strict()).max(LIMITS.list * 2),
}).strict();
export type ReplayComparison = z.infer<typeof ReplayComparison>;
export type ReplayComparisonPoint = z.infer<typeof ReplayComparisonPoint>;
export type ReplayChange = z.infer<typeof ReplayChange>;
