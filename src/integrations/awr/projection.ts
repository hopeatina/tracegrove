import { withAgentWorkReceiptContentHash, type AgentWorkExternalReference, type AgentWorkReceipt } from '@useorgx/agent-work-receipt';
import { VerifiedBundleSnapshot } from '../../core/bundle.ts';
import type { RetainedResult } from '../../core/resultSink.ts';
import { Conflict } from '../../core/errors.ts';
import { WorkflowEvidenceProjection, digestOfValue, sameDigest, type Ref } from '../../protocol/index.ts';
import { checkedAwrDocument } from './contracts.ts';

const external = (ref: Ref, type: string): AgentWorkExternalReference => ({ system: 'tracegrove', type, id: ref.id, version: ref.revision,
  digest: { algorithm: 'sha256', value: ref.digest.hex, encoding: 'hex' } });

/** Redacted export effort, not an assertion of target success or native work acceptance. */
export async function projectAwr(result: RetainedResult, preparedAt: string): Promise<AgentWorkReceipt> {
  const records = VerifiedBundleSnapshot.open(result.bundleDir).records;
  if (!sameDigest(records.manifestDigest, result.receipt.manifestDigest)) throw new Conflict('Retained archive changed before projection');
  const manifest = { system: 'tracegrove', type: 'bundle-manifest', id: records.campaign.campaignId,
    digest: { algorithm: 'sha256', value: records.manifestDigest.hex, encoding: 'hex' as const } };
  const projection = WorkflowEvidenceProjection.parse({
    schemaVersion: 'workflow.evidence-projection/v1', campaignId: records.campaign.campaignId,
    campaignRef: records.campaign.ref, requestRef: records.request.ref, selectionRef: records.selection.ref,
    manifestDigest: records.manifestDigest, productOutcome: records.campaign.outcome, plannedLanes: result.receipt.plannedLanes,
    workBinding: records.request.workBinding, issuerStatus: 'unverified', qualificationStatus: 'not_evaluated',
    nativeAcceptance: 'not_requested', nativeOutcome: 'not_observed', media: 'withheld', payloads: 'withheld',
    attempts: records.receipts.map(attempt => ({ receiptRef: attempt.ref, executionId: attempt.executionId, attemptId: attempt.attemptId,
      caseRef: attempt.caseRef, outcome: attempt.outcome, expectedTargetDigest: digestOfValue(attempt.environment.expected),
      observedTargetDigest: attempt.environment.observed ? digestOfValue(attempt.environment.observed) : null,
      provenance: attempt.environment.provenance, finalizedAt: attempt.finalizedAt,
      estimatedCents: attempt.accounting.estimatedCents, reconciledCents: attempt.accounting.reconciledCents,
      unknownChargeCount: attempt.accounting.unknownCharges.length })),
  });
  const receipt: AgentWorkReceipt = {
    schema_version: 'agent-work-receipt/v0.2', receipt_id: `tracegrove-export-${digestOfValue({ result: result.receipt.ref, preparedAt }).hex}`,
    actor: { type: 'service', id: 'tracegrove-result-exporter', runtime: { name: 'tracegrove' } },
    intent: { summary: 'Export retained workflow evidence for review.', request_ref: external(records.request.ref, 'workflow-request'),
      acceptance_criteria: ['Preserve the verified campaign verdict and evidence identity without claiming native acceptance.'] },
    authority: { mode: 'unknown', status: 'unknown', scope: { actions: ['export_retained_evidence'], resources: [external(result.receipt.ref, 'retained-result')] },
      constraints: ['Consumer authorization is checked separately by the delivery host; this receipt grants no authority.'] },
    actions: [{ id: 'export', type: 'evidence_export', summary: 'Prepared a redacted, digest-bound projection of retained evidence.', status: 'completed',
      started_at: preparedAt, completed_at: preparedAt }],
    artifacts: [{ id: 'bundle-manifest', kind: 'workflow_evidence', name: 'Retained workflow bundle manifest', role: 'report', ref: manifest, digest: manifest.digest }],
    evidence: [{ id: 'retention', kind: 'local_bundle_integrity', summary: 'The retained archive was captured and re-reduced before this export.',
      ref: external(result.receipt.ref, 'retained-result'), observed_at: preparedAt }],
    outcome: { status: 'succeeded', summary: `Evidence export prepared. Target campaign outcome: ${records.campaign.outcome}. Native acceptance remains pending.`,
      acceptance: { status: 'pending' } },
    verification: { status: 'unverified', method: 'local_bundle_integrity_only', checks: [], evidence_ids: ['retention'],
      notes: 'Bundle integrity is not independent issuer authentication, target success, qualification, or OrgX native verification.' },
    cost: { currency: 'USD', total: 0, estimated: true, metadata: { status: 'unknown', zero_is_schema_placeholder: true,
      notes: 'This required numeric placeholder is not a measured zero cost or campaign-cost total.' } },
    lineage: { run_ref: external(records.campaign.ref, 'workflow-campaign'), parent_receipt_refs: [],
      references: [{ relationship: 'produced_from', ref: external(records.selection.ref, 'workflow-selection') },
        ...(records.request.workBinding ? [{ relationship: 'reports_on', ref: { system: 'orgx', type: 'work', id: records.request.workBinding.workId } }] : [])] },
    human_interventions: [], timestamps: { started_at: preparedAt, completed_at: preparedAt, issued_at: preparedAt },
    extensions: { 'org.tracegrove.workflow': projection },
  };
  return checkedAwrDocument(await withAgentWorkReceiptContentHash(checkedAwrDocument(receipt)));
}
