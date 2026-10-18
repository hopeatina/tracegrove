import { join, resolve } from 'node:path';
import { lstatSync } from 'node:fs';
import { z } from 'zod';
import { IdString, QualificationRoundAdmission, RefSchema, digestOfValue, refKey, sameRef, sameScope, verifySelfDigest,
  type AttemptInventoryRow, type Scope } from '../protocol/index.ts';
import { VerifiedBundleSnapshot } from './bundle.ts';
import { checkCommittedExecutionBinding } from './executionReadback.ts';
import { readExecutionOwnership } from './executionOwnership.ts';
import { requireRealDirectory } from './atomicFiles.ts';
import type { LedgerReadView, JournalEntry } from './ledgerRecords.ts';

export const RecordedAdmission = z.object({ executionId: IdString.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/), attemptId: IdString,
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/), generation: z.number().int().positive(), attemptNumber: z.number().int().positive(),
  qualificationRoundRef: RefSchema.optional(), regressionAdmissionRef: RefSchema.optional() });
export class AttemptReadError extends Error {
  constructor(readonly status: AttemptInventoryRow['status'], readonly unresolvedResources: number | null = null) { super(status); }
}

/** Historical local bindings only. This reader never re-authorizes a scenario or resumes an attempt. */
export function readAdmittedAttempt(view: LedgerReadView, entry: JournalEntry, stateDir: string, scope: Scope) {
  const admission = RecordedAdmission.safeParse(entry.data);
  if (!admission.success) throw new AttemptReadError('admission_invalid');
  const a = admission.data, qualification = a.qualificationRoundRef;
  if (entry.aggregateId !== (qualification ? `qualification-execution:${qualification.digest.hex}` : `execution:${a.executionId}`))
    throw new AttemptReadError('unsupported_aggregate');
  const state = view.current(entry.aggregateId);
  const campaign = z.object({ binding: z.object({ campaignId: IdString }) }).safeParse(view.current(`ownership:${a.executionId}`)?.data);
  if (!campaign.success) throw new AttemptReadError('binding_invalid');
  const expected = { executionId: a.executionId, attemptId: a.attemptId, generation: a.generation,
    requestDigest: a.requestDigest, campaignId: campaign.data.binding.campaignId, scope };
  let inventory: ReturnType<typeof readExecutionOwnership>['inventory'];
  try { inventory = readExecutionOwnership(view, expected).inventory; }
  catch { throw new AttemptReadError('binding_invalid'); }
  const unresolvedResources = inventory.resources.filter(resource => resource.state !== 'removed').length;
  const dir = join(resolve(stateDir), 'executions', a.executionId);
  try { requireRealDirectory(dir); lstatSync(join(dir, 'manifest.json')); }
  catch (error) { throw new AttemptReadError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'bundle_unavailable' : 'bundle_invalid', unresolvedResources); }
  let snapshot: VerifiedBundleSnapshot;
  try { snapshot = VerifiedBundleSnapshot.open(dir); }
  catch (error) { throw new AttemptReadError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'bundle_unavailable' : 'bundle_invalid', unresolvedResources); }
  const records = snapshot.records;
  try {
    if (!qualification) {
      const key = `idempotency:${records.request.idempotencyKey}`;
      const bound = view.history(key).find(row => row.type === 'bound' && row.seq > entry.seq &&
        row.data.executionId === a.executionId && row.data.attemptNumber === a.attemptNumber);
      // Historical readback uses the real recorded index entry for this admission.
      // Effectful recovery keeps using the unmodified current-index validator.
      const historical: LedgerReadView = { current: id => id === key ? bound ?? null : view.current(id), history: id => view.history(id) };
      checkCommittedExecutionBinding(historical, records, { ...expected, attemptNumber: a.attemptNumber });
      if (a.regressionAdmissionRef && (records.request.purpose !== 'regression' || !records.request.regressionAdmissionRef ||
          !sameRef(a.regressionAdmissionRef, records.request.regressionAdmissionRef))) throw new Error('regression binding');
    }
    else {
      const request = records.request;
      const round = QualificationRoundAdmission.parse(records.documents[refKey(qualification)]);
      if (!verifySelfDigest(round) || !sameRef(round.ref, qualification) || !sameScope(round.scope, scope) ||
          request.purpose !== 'qualification' || !request.qualificationRoundRef || !sameRef(request.qualificationRoundRef, qualification) ||
          request.ref.digest.hex !== a.requestDigest || request.campaignId !== expected.campaignId || round.campaignId !== expected.campaignId ||
          !sameRef(round.selectionManifestRef, records.selection.ref) || !sameScope(records.campaign.scope, scope) ||
          round.attempts[0]?.executionId !== a.executionId || round.attempts[0]?.attemptId !== a.attemptId ||
          round.attempts.length !== records.selection.cells.length || !records.receipts.length ||
          new Set(round.attempts.map(cell => cell.selectionCellId)).size !== round.attempts.length ||
          new Set(round.attempts.map(cell => cell.executionId)).size !== round.attempts.length ||
          new Set(round.attempts.map(cell => cell.attemptId)).size !== round.attempts.length ||
          records.receipts.some(receipt => { const allocation = round.attempts.find(cell => cell.selectionCellId === receipt.selectionCellId);
            return !allocation || allocation.executionId !== receipt.executionId || allocation.attemptId !== receipt.attemptId ||
              receipt.attemptNumber !== a.attemptNumber || receipt.environment.generation !== a.generation || !sameScope(receipt.scope, scope); })) throw new Error('binding');
      const finalizedRefs = view.history(entry.aggregateId).filter(row => row.type === 'cell.finalized').map(row => row.data.receiptRef);
      if (digestOfValue(finalizedRefs.map(ref => digestOfValue(ref).hex).sort()).hex !== digestOfValue(records.receipts.map(receipt => digestOfValue(receipt.ref).hex).sort()).hex ||
          state?.type === 'finalized' && (digestOfValue(state.data.campaignResultRef).hex !== digestOfValue(records.campaign.ref).hex || state.data.outcome !== records.campaign.outcome)) throw new Error('binding');
    }
  } catch { throw new AttemptReadError('binding_invalid', unresolvedResources); }
  return { admission: a, phase: state?.type ?? null, records, unresolvedResources };
}
