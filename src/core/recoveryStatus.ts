/** Read-only, checkpoint-bound diagnostics. Recorded cleanup is not a new absence observation. */
import { lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { RecoveryStatusReport, type Scope } from '../protocol/index.ts';
import { requireRealDirectory } from './atomicFiles.ts';
import { readVerifiedBundle } from './bundle.ts';
import { checkCommittedExecutionBinding } from './executionReadback.ts';
import { readExecutionOwnership } from './executionOwnership.ts';
import { inspectLedger, LedgerInspectionError } from './ledgerInspection.ts';

type Code = RecoveryStatusReport['code'];
const guidance: Record<Code, string> = {
  ledger_snapshot_unavailable: 'Select an existing readable owned state directory. Inspection creates no state or locks.',
  ledger_snapshot_changed: 'The checkpoint changed during inspection. Repeat this read-only command; no recovery action was admitted.',
  ledger_snapshot_invalid: 'Preserve the journal and seek trusted reconciliation of its incomplete or invalid records; do not edit or truncate it.',
  execution_missing: 'Select an execution recorded in this state directory.',
  execution_binding_invalid: 'Preserve the records and check the execution, scope and attempt binding with the trusted owner.',
  ownership_missing: 'Legacy or missing ownership inventory requires trusted reconciliation; absence of inventory does not prove cleanup.',
  ownership_invalid: 'Preserve the ownership records and obtain trusted binding reconciliation; no resource was discharged.',
  ownership_unresolved: 'Recorded acquisitions remain unresolved. Preserve their evidence; a trusted reconciliation path must establish cleanup before replay.',
  execution_in_flight: 'A final or interrupted transition is not recorded. Inspect through the current trusted owner; do not break locks or infer process absence.',
  interrupted_without_manifest: 'No committed bundle is available. Preserve incomplete records; use the original frozen request through normal admission only if another attempt is intended.',
  committed_evidence_invalid: 'Preserve the existing execution and reconcile its missing or corrupt evidence. Do not replay the acquisition.',
  committed_binding_mismatch: 'The committed evidence does not match this ledger attempt. Preserve both for trusted reconciliation; do not replay it.',
  committed_readback_available: 'The checkpoint contains matching committed evidence and recorded removals. Normal run admission must recheck it and sync before finalizing; inspection did neither.',
  finalized_evidence_verified: 'The finalized records match verified historical evidence. Inspection performed no new execution and grants no retry authority.',
  recovery_inspection_failed: 'Preserve the existing state and inspect it with its trusted owner. No cleanup, lock recovery or execution was attempted.',
};
function empty(): RecoveryStatusReport {
  return { schemaVersion: 'tracegrove.recovery-status/v1', exitCode: 2, code: 'recovery_inspection_failed', recovery: guidance.recovery_inspection_failed,
    checkpoint: null, writerLock: 'unknown', recordedPhase: null, resources: null, bundle: 'not_checked', historicalOutcome: null,
    actionAuthority: 'none', execution: 'not_started_by_inspection', verificationVerdict: 'not_evaluated' };
}
const Admission = z.object({ requestDigest: z.string().regex(/^[a-f0-9]{64}$/), attemptId: z.string().min(1).max(256),
  generation: z.number().int().positive(), attemptNumber: z.number().int().positive() });

export function inspectRecoveryStatus(options: { stateDir: string; executionId: string; scope: Scope }): RecoveryStatusReport {
  const report = empty();
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(options.executionId)) return RecoveryStatusReport.parse({ ...report,
      code: 'execution_binding_invalid', recovery: guidance.execution_binding_invalid });
    const view = inspectLedger(options.stateDir);
    report.checkpoint = { ...view.head }; report.writerLock = view.writerLock;
    const finish = (code: Code, exitCode: 0 | 2 = 2) => {
      view.assertUnchanged();
      return RecoveryStatusReport.parse({ ...report, code, exitCode, recovery: guidance[code] });
    };
    const executionId = options.executionId;
    const history = view.history(`execution:${executionId}`); const state = history.at(-1);
    if (!state) return finish('execution_missing');
    const admitted = history.find(row => row.type === 'admitted');
    const admission = Admission.safeParse(admitted?.data);
    if (!admission.success) return finish('execution_binding_invalid');
    report.recordedPhase = ['admitted', 'cell.finalized', 'interrupted', 'finalized'].includes(state.type) ? state.type as NonNullable<RecoveryStatusReport['recordedPhase']> : 'other';
    const ownership = view.current(`ownership:${executionId}`);
    if (!ownership) return finish('ownership_missing');
    const campaign = z.object({ binding: z.object({ campaignId: z.string().min(1) }) }).safeParse(ownership.data);
    if (!campaign.success) return finish('ownership_invalid');
    const expected = { executionId, attemptId: admission.data.attemptId, generation: admission.data.generation,
      requestDigest: admission.data.requestDigest, campaignId: campaign.data.binding.campaignId, scope: options.scope };
    let inventory: ReturnType<typeof readExecutionOwnership>['inventory'];
    try { inventory = readExecutionOwnership(view, expected).inventory; }
    catch { return finish('ownership_invalid'); }
    const counts = () => ({ reserved: 0, observed: 0, cleanup_pending: 0, removed: 0 });
    report.resources = { host: counts(), fixture: counts() };
    for (const resource of inventory.resources) report.resources[resource.kind][resource.state]++;
    // These are journal states only. Never infer removal from a PID, path or elapsed time.
    const unresolved = inventory.resources.some(resource => resource.state !== 'removed');
    if (unresolved && state.type !== 'finalized') return finish('ownership_unresolved');
    if (state.type !== 'finalized' && state.type !== 'interrupted') return finish('execution_in_flight');
    const dir = join(resolve(options.stateDir), 'executions', executionId);
    try { requireRealDirectory(dir); lstatSync(join(dir, 'manifest.json')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        report.bundle = 'absent'; return finish(state.type === 'finalized' ? 'committed_evidence_invalid' : 'interrupted_without_manifest');
      }
      report.bundle = 'invalid'; return finish('committed_evidence_invalid');
    }
    let checked: ReturnType<typeof readVerifiedBundle>;
    try { checked = readVerifiedBundle(dir); }
    catch { report.bundle = 'invalid'; return finish('committed_evidence_invalid'); }
    try { checkCommittedExecutionBinding(view, checked, { ...expected, attemptNumber: admission.data.attemptNumber }); }
    catch { report.bundle = 'invalid'; return finish('committed_binding_mismatch'); }
    report.bundle = 'verified_bound'; report.historicalOutcome = checked.campaign.outcome;
    // Finalized records may preserve failed/unconfirmed cleanup: show it rather than imply readiness.
    if (unresolved) return finish('ownership_unresolved');
    return finish(state.type === 'finalized' ? 'finalized_evidence_verified' : 'committed_readback_available', 0);
  } catch (error) {
    const code = error instanceof LedgerInspectionError ? error.code : 'recovery_inspection_failed';
    return RecoveryStatusReport.parse({ ...empty(), code, recovery: guidance[code] });
  }
}
