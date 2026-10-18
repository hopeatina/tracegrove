import { z } from 'zod';
import { DigestSchema, IdString, RefSchema, ScopeSchema } from '../primitives.ts';
import { Outcome } from './execution.ts';
import { RecoveryStatusReport } from './recoveryStatus.ts';

export const AttemptInventoryRow = z.object({ admissionSequence: z.number().int().positive().safe(), executionId: IdString.nullable(),
  attemptId: IdString.nullable(), kind: z.enum(['ordinary', 'qualification', 'regression', 'unknown']), recordedPhase: RecoveryStatusReport.shape.recordedPhase,
  status: z.enum(['finalized', 'sealed_unfinalized', 'admission_invalid', 'duplicate_admission', 'binding_invalid', 'bundle_unavailable', 'bundle_invalid', 'unsupported_aggregate']),
  manifestDigest: DigestSchema.nullable(), outcome: Outcome.nullable(), receiptCount: z.number().int().nonnegative(),
  unresolvedResources: z.number().int().nonnegative().nullable(),
  cells: z.array(z.object({ selectionCellId: IdString, executionId: IdString.nullable(), attemptId: IdString.nullable(),
    receiptRef: RefSchema.nullable(), outcome: Outcome.nullable() }).strict()).max(500).nullable(),
}).strict();
const count = z.number().int().nonnegative().safe();
const quantity = z.number().finite().nonnegative();
export const AttemptInventoryReport = z.object({ schemaVersion: z.literal('tracegrove.attempt-inventory/v1'),
  scope: ScopeSchema, checkpoint: RecoveryStatusReport.shape.checkpoint, writerLock: RecoveryStatusReport.shape.writerLock,
  code: z.enum(['complete_inventory', 'partial_evidence', 'no_attempts', 'ledger_snapshot_unavailable', 'ledger_snapshot_changed',
    'ledger_snapshot_invalid', 'inventory_limit_exceeded', 'inspection_failed']), exitCode: z.union([z.literal(0), z.literal(2)]),
  evidenceScope: z.literal('execution_admissions_in_checkpoint'), actionAuthority: z.literal('none'), issuerTrust: z.literal('not_authenticated'),
  attempts: z.array(AttemptInventoryRow).max(500),
  recordedUsageSubtotal: z.object({ receipts: count, runnerSeconds: quantity, browserSeconds: quantity, artifactBytes: count,
    inferenceCalls: count, inferenceTokens: count, integrationOperations: count }).strict().nullable(),
  recordedPricing: z.object({ estimatedSubtotalCents: count.nullable(), reconciledSubtotalCents: count.nullable(),
    unpricedEstimates: count, unreconciledReceipts: count, unknownChargeCount: count,
    basis: z.literal('recorded_values_only_not_authenticated_invoices') }).strict().nullable(),
  timingPoints: z.object({ warm: count, cold: count, unknown: count, censored: count }).strict().nullable(),
  evidenceComplete: z.boolean(),
}).strict();
export type AttemptInventoryReport = z.infer<typeof AttemptInventoryReport>;
export type AttemptInventoryRow = z.infer<typeof AttemptInventoryRow>;
