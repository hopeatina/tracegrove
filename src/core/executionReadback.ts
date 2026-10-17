/** Shared trusted-ledger binding checks. Integrity readback does not grant new effect authority. */
import { digestOfValue, sameRef, sameScope, type Ref, type Scope } from '../protocol/index.ts';
import type { VerifiedBundleRecords } from './bundle.ts';
import { Conflict } from './errors.ts';
import type { LedgerReadView } from './ledgerRecords.ts';

export function checkCommittedExecutionBinding(ledger: LedgerReadView, checked: VerifiedBundleRecords, expected: {
  executionId: string; attemptId: string; generation: number; attemptNumber: number; requestDigest: string;
  scope: Scope; campaignId: string; requestRef?: Ref; selectionRef?: Ref;
}): void {
  const { executionId, attemptId, generation, attemptNumber, scope } = expected;
  if (!/^[A-Za-z0-9_-]+$/.test(executionId) || !Number.isInteger(generation) || generation < 1 || !Number.isInteger(attemptNumber) || attemptNumber < 1)
    throw new Conflict('committed_execution_binding_invalid');
  const finalized = ledger.current(`execution:${executionId}`);
  const idempotency = ledger.current(`idempotency:${checked.request.idempotencyKey}`);
  const finalizedRefs = ledger.history(`execution:${executionId}`).filter(row => row.type === 'cell.finalized').map(row => row.data.receiptRef);
  if (idempotency?.data.executionId !== executionId || idempotency.data.attemptNumber !== attemptNumber ||
      checked.request.ref.digest.hex !== expected.requestDigest || expected.requestRef && !sameRef(checked.request.ref, expected.requestRef) ||
      expected.selectionRef && !sameRef(checked.selection.ref, expected.selectionRef) || !sameScope(checked.campaign.scope, scope) ||
      checked.campaign.campaignId !== checked.request.campaignId || checked.request.campaignId !== expected.campaignId || !checked.receipts.length ||
      checked.receipts.some(receipt => receipt.executionId !== executionId || receipt.attemptId !== attemptId || receipt.attemptNumber !== attemptNumber ||
        receipt.environment.generation !== generation || !sameScope(receipt.scope, scope) || receipt.idempotencyKey !== checked.request.idempotencyKey) ||
      digestOfValue(finalizedRefs.map(ref => digestOfValue(ref).hex).sort()).hex !== digestOfValue(checked.receipts.map(receipt => digestOfValue(receipt.ref).hex).sort()).hex ||
      finalized?.type === 'finalized' && (digestOfValue(finalized.data.campaignResultRef).hex !== digestOfValue(checked.campaign.ref).hex || finalized.data.outcome !== checked.campaign.outcome))
    throw new Conflict('committed_execution_binding_mismatch; no acquisition was replayed');
}
