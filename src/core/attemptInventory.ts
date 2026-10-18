import { AttemptInventoryReport, ScopeSchema, type AttemptInventoryRow, type Scope } from '../protocol/index.ts';
import { inspectLedger, LedgerInspectionError } from './ledgerInspection.ts';
import { AttemptReadError, RecordedAdmission, readAdmittedAttempt } from './attemptInventoryBinding.ts';

export const ATTEMPT_INVENTORY_LIMIT = 500;
function empty(scope: Scope): AttemptInventoryReport {
  return { schemaVersion: 'tracegrove.attempt-inventory/v1', scope, checkpoint: null, writerLock: 'unknown',
    code: 'inspection_failed', exitCode: 2, evidenceScope: 'execution_admissions_in_checkpoint',
    actionAuthority: 'none', issuerTrust: 'not_authenticated', attempts: [], recordedUsageSubtotal: null,
    recordedPricing: null, timingPoints: null, evidenceComplete: false };
}

/** One stable read-only checkpoint, including unsuccessful and unsealed admissions. No writer or recovery is opened. */
export function inspectAttemptInventory(options: { stateDir: string; scope: Scope }): AttemptInventoryReport {
  const report = empty(ScopeSchema.parse(options.scope));
  try {
    const view = inspectLedger(options.stateDir); const entries = view.admissions();
    report.checkpoint = view.head; report.writerLock = view.writerLock;
    if (entries.length > ATTEMPT_INVENTORY_LIMIT) {
      view.assertUnchanged(); return AttemptInventoryReport.parse({ ...report, code: 'inventory_limit_exceeded' });
    }
    const usage = { receipts: 0, runnerSeconds: 0, browserSeconds: 0, artifactBytes: 0, inferenceCalls: 0, inferenceTokens: 0, integrationOperations: 0 };
    const pricing = { estimatedSubtotalCents: null as number | null, reconciledSubtotalCents: null as number | null,
      unpricedEstimates: 0, unreconciledReceipts: 0, unknownChargeCount: 0, basis: 'recorded_values_only_not_authenticated_invoices' as const };
    const timings = { warm: 0, cold: 0, unknown: 0, censored: 0 };
    const ids = entries.map(entry => RecordedAdmission.safeParse(entry.data)).map(parsed => parsed.success ? parsed.data.executionId : null);
    let complete = entries.length > 0;
    for (const entry of entries) {
      const parsed = RecordedAdmission.safeParse(entry.data);
      const row: AttemptInventoryRow = { admissionSequence: entry.seq, executionId: parsed.success ? parsed.data.executionId : null,
        attemptId: parsed.success ? parsed.data.attemptId : null,
        kind: parsed.success && parsed.data.regressionAdmissionRef ? 'regression' : entry.aggregateId.startsWith('execution:') ? 'ordinary' : entry.aggregateId.startsWith('qualification-execution:') ? 'qualification' : 'unknown',
        recordedPhase: null, status: 'admission_invalid',
        manifestDigest: null, outcome: null, receiptCount: 0, unresolvedResources: null, cells: null };
      const phase = view.current(entry.aggregateId)?.type;
      row.recordedPhase = phase === undefined ? null : ['admitted', 'cell.finalized', 'interrupted', 'finalized'].includes(phase)
        ? phase as NonNullable<AttemptInventoryRow['recordedPhase']> : 'other';
      try {
        if (parsed.success && ids.filter(id => id === parsed.data.executionId).length > 1) throw new AttemptReadError('duplicate_admission');
        const checked = readAdmittedAttempt(view, entry, options.stateDir, report.scope);
        if (checked.records.request.purpose === 'regression') row.kind = 'regression';
        row.status = checked.phase === 'finalized' ? 'finalized' : 'sealed_unfinalized';
        row.manifestDigest = checked.records.manifestDigest; row.outcome = checked.records.campaign.outcome;
        row.receiptCount = checked.records.receipts.length; row.unresolvedResources = checked.unresolvedResources;
        row.cells = checked.records.selection.cells.map(cell => {
          const receipt = checked.records.receipts.find(value => value.selectionCellId === cell.selectionCellId);
          return { selectionCellId: cell.selectionCellId, executionId: receipt?.executionId ?? null, attemptId: receipt?.attemptId ?? null,
            receiptRef: receipt?.ref ?? null, outcome: receipt?.outcome ?? null };
        });
        if (row.status !== 'finalized' || checked.unresolvedResources || row.cells.some(cell => cell.receiptRef === null)) complete = false;
        for (const receipt of checked.records.receipts) {
          usage.receipts++;
          for (const key of ['runnerSeconds', 'browserSeconds', 'artifactBytes', 'inferenceCalls', 'inferenceTokens', 'integrationOperations'] as const) usage[key] += receipt.accounting[key];
          const a = receipt.accounting;
          if (a.estimatedCents === null) pricing.unpricedEstimates++; else pricing.estimatedSubtotalCents = (pricing.estimatedSubtotalCents ?? 0) + a.estimatedCents;
          if (a.reconciledCents === null) pricing.unreconciledReceipts++; else pricing.reconciledSubtotalCents = (pricing.reconciledSubtotalCents ?? 0) + a.reconciledCents;
          pricing.unknownChargeCount += a.unknownCharges.length;
          for (const point of receipt.performance) {
            timings[point.warm === null ? 'unknown' : point.warm ? 'warm' : 'cold']++;
            if (point.censored) timings.censored++;
          }
        }
      } catch (error) {
        row.status = error instanceof AttemptReadError ? error.status : 'binding_invalid';
        row.unresolvedResources = error instanceof AttemptReadError ? error.unresolvedResources : null; complete = false;
      }
      report.attempts.push(row);
    }
    view.assertUnchanged();
    return AttemptInventoryReport.parse({ ...report, code: !entries.length ? 'no_attempts' : complete ? 'complete_inventory' : 'partial_evidence',
      exitCode: !entries.length || complete ? 0 : 2, recordedUsageSubtotal: usage.receipts ? usage : null,
      recordedPricing: usage.receipts ? pricing : null, timingPoints: usage.receipts ? timings : null, evidenceComplete: complete });
  } catch (error) {
    return AttemptInventoryReport.parse({ ...empty(report.scope), code: error instanceof LedgerInspectionError ? error.code : 'inspection_failed' });
  }
}
