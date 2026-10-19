import { z } from 'zod';
import { DigestSchema, IdString, RefSchema, ScopeSchema, ShortText } from '../primitives.ts';
import { AttemptInventoryReport, AttemptInventoryRow } from './attemptInventory.ts';
import { Outcome } from './execution.ts';

const count = z.number().int().nonnegative().safe();
const quantity = z.number().finite().nonnegative();
export const BenchmarkAxis = z.enum(['runner', 'model']);
export type BenchmarkAxis = z.infer<typeof BenchmarkAxis>;
export const BenchmarkConditions = z.object({ caseRef: RefSchema, personaRef: RefSchema,
  surfaceBindingRef: RefSchema, environmentRef: RefSchema, variantRef: RefSchema.nullable(), executionHostRef: RefSchema,
  expectedTargetDigest: DigestSchema, observedTargetDigest: DigestSchema,
}).strict();
const Inventory = AttemptInventoryReport.omit({ attempts: true }).extend({
  attempts: z.array(AttemptInventoryRow.omit({ cells: true })).max(500),
}).strict();
export const BenchmarkFinding = z.enum(['inventory_incomplete', 'no_receipts', 'unknown_model', 'target_unobserved',
  'no_matching_cohorts', 'pricing_incomplete', 'temperature_unobserved', 'reservation_conflict',
  'conditions_unmatched', 'timing_coverage_unmatched', 'evidence_limit_exceeded', 'report_limit_exceeded']);
export const BenchmarkTiming = z.object({ metric: IdString, boundary: ShortText, clock: z.enum(['monotonic', 'wall']),
  temperature: z.enum(['warm', 'cold', 'unknown']), strataDigest: DigestSchema, points: count,
  censored: count, missing: count, numericUncensored: count,
  minimumMs: quantity.nullable(), medianMs: quantity.nullable(), maximumMs: quantity.nullable(),
}).strict();
export const BenchmarkCohort = z.object({ key: DigestSchema, runnerRef: RefSchema,
  requestedModel: ShortText.nullable(), observedModel: ShortText.nullable(),
  receipts: z.array(z.object({ admissionSequence: count, receiptRef: RefSchema,
    executionId: IdString, attemptId: IdString, selectionCellId: IdString, outcome: Outcome }).strict()).min(1).max(5000),
  outcomes: z.array(z.object({ outcome: Outcome, count }).strict()).min(1),
  usage: z.object({ runnerSeconds: quantity, browserSeconds: quantity, inferenceCalls: count,
    inferenceTokens: count, artifactBytes: count, integrationOperations: count }).strict(),
  pricing: z.object({ estimatedSubtotalCents: count.nullable(), reconciledSubtotalCents: count.nullable(),
    unpricedEstimates: count, unreconciledReceipts: count, unknownChargeCount: count }).strict(),
  timings: z.array(BenchmarkTiming).max(50000),
}).strict();
export const BenchmarkReport = z.object({ schemaVersion: z.literal('tracegrove.benchmark/v1'), scope: ScopeSchema,
  operation: z.literal('read_only'), axis: BenchmarkAxis, evidenceScope: z.literal('execution_admissions_in_checkpoint'),
  issuerTrust: z.literal('not_authenticated'), qualification: z.literal('not_evaluated'),
  statisticalInference: z.literal('not_performed'), controlledConditions: z.literal('not_independently_proven'),
  code: z.enum(['descriptive_evidence', 'incomplete_evidence']), exitCode: z.union([z.literal(0), z.literal(2)]),
  inventory: Inventory, findings: z.array(BenchmarkFinding),
  retainedReceipts: count, unassignedReceipts: count, groupsWithMultipleCohorts: count,
  reservations: z.object({ uniqueIds: count, retainedCents: count.nullable(), basis: z.literal('recorded_reservations_not_actual_charges') }).strict(),
  groups: z.array(z.object({ conditionsDigest: DigestSchema, conditions: BenchmarkConditions,
    cohorts: z.array(BenchmarkCohort).min(1).max(5000) }).strict()).max(1000),
}).strict();
export type BenchmarkReport = z.infer<typeof BenchmarkReport>;
export type BenchmarkTiming = z.infer<typeof BenchmarkTiming>;
export type BenchmarkCohort = z.infer<typeof BenchmarkCohort>;
