import { z } from 'zod';
import { CampaignResult } from './execution.ts';

export const RecoveryStatusCode = z.enum(['ledger_snapshot_unavailable', 'ledger_snapshot_changed', 'ledger_snapshot_invalid',
  'execution_missing', 'execution_binding_invalid', 'ownership_missing', 'ownership_invalid', 'ownership_unresolved',
  'execution_in_flight', 'interrupted_without_manifest', 'committed_evidence_invalid', 'committed_binding_mismatch',
  'committed_readback_available', 'finalized_evidence_verified', 'recovery_inspection_failed']);
const counts = z.object({ reserved: z.number().int().min(0).max(10000), observed: z.number().int().min(0).max(10000),
  cleanup_pending: z.number().int().min(0).max(10000), removed: z.number().int().min(0).max(10000) }).strict();
export const RecoveryStatusReport = z.object({
  schemaVersion: z.literal('tracegrove.recovery-status/v1'), exitCode: z.union([z.literal(0), z.literal(2)]),
  code: RecoveryStatusCode, recovery: z.string().min(1).max(512),
  checkpoint: z.object({ sequence: z.number().int().nonnegative().safe(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable(),
  writerLock: z.enum(['present', 'absent', 'unknown']),
  recordedPhase: z.enum(['admitted', 'cell.finalized', 'interrupted', 'finalized', 'other']).nullable(),
  resources: z.object({ host: counts, fixture: counts }).strict().nullable(),
  bundle: z.enum(['not_checked', 'absent', 'invalid', 'verified_bound']),
  historicalOutcome: CampaignResult.shape.outcome.nullable(),
  actionAuthority: z.literal('none'), execution: z.literal('not_started_by_inspection'), verificationVerdict: z.literal('not_evaluated'),
}).strict();
export type RecoveryStatusReport = z.infer<typeof RecoveryStatusReport>;
