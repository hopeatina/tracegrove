import { canonicalizeAgentWorkJson } from '@useorgx/agent-work-receipt';
import { LocalDeliveryJournal, type DeliveryState } from '../../core/deliveryJournal.ts';
import { LocalLedger } from '../../core/ledger.ts';
import { LocalResultSink } from '../../core/resultSink.ts';
import { Conflict } from '../../core/errors.ts';
import { nowIso } from '../../core/clock.ts';
import { ScopeSchema, WorkflowEvidenceProjection, digestOfBytes, digestOfValue, freeze, sameDigest, sameRef, sameScope, type Scope } from '../../protocol/index.ts';
import { LocalAwrOutbox, type AwrDeliveryState } from './outbox.ts';
import { AwrDestination } from './contracts.ts';
import { HostedReceiptReadback, PreparedReportAttachment, ReportAttachmentAcknowledgement, ReportWorkTarget } from './attachmentContracts.ts';

export interface ReportAttachmentAuthority { authorize(scope: Scope, destination: AwrDestination, target: ReportWorkTarget, action: 'prepare' | 'read' | 'attach'): Promise<void> }
export interface ReportAttachmentTransport { readReceipt(intent: PreparedReportAttachment): Promise<unknown>; attach(intent: PreparedReportAttachment): Promise<unknown> }
export type ReportAttachmentState = { prepared: PreparedReportAttachment; attempts: number; acknowledgement: ReportAttachmentAcknowledgement | null;
  status: 'prepared' | 'acknowledgement_unknown' | 'attached'; recordedArtifactStatus: ReportAttachmentAcknowledgement['data']['status'] | null; nativeAcceptance: 'not_requested' };
const identity = (scope: Scope, resultId: string) => `report-attachment-${digestOfValue({ scope, resultId }).hex}`;
const receiptDigest = (state: AwrDeliveryState) => digestOfBytes(canonicalizeAgentWorkJson(state.prepared.receipt));
function asState(state: DeliveryState<PreparedReportAttachment, ReportAttachmentAcknowledgement>): ReportAttachmentState {
  const { prepared, attempts, acknowledgement } = state;
  return { prepared, attempts, acknowledgement, status: acknowledgement ? 'attached' : attempts ? 'acknowledgement_unknown' : 'prepared',
    recordedArtifactStatus: acknowledgement?.data.status ?? null, nativeAcceptance: 'not_requested' };
}
function checkAck(intent: PreparedReportAttachment, ack: ReportAttachmentAcknowledgement): void {
  const row = ack.data;
  if (row.id !== intent.payload.artifact_id || row.workspace_id !== intent.destination.workspaceId || row.entity_type !== intent.target.entityType || row.entity_id !== intent.target.entityId ||
      row.artifact_url !== intent.payload.artifact_url || !sameDigest(digestOfValue(row.metadata.tracegrove), digestOfValue(intent.payload.metadata.tracegrove))) throw new Conflict('Artifact acknowledgement differs from the frozen work, scope, or evidence');
}

/** Attach the already-imported private report. No publishing, completion or product execution authority. */
export class LocalReportAttachmentOutbox {
  private readonly scope: Scope;
  private readonly journal: LocalDeliveryJournal<PreparedReportAttachment, ReportAttachmentAcknowledgement>;
  constructor(ledger: LocalLedger, private readonly sink: LocalResultSink, private readonly awr: LocalAwrOutbox, scope: Scope, private readonly authority: ReportAttachmentAuthority) {
    this.scope = ScopeSchema.parse(scope);
    this.journal = new LocalDeliveryJournal(ledger, this.scope, { prepared: 'workflow.report.prepared', attempted: 'workflow.report.attempted', acknowledged: 'workflow.report.attached' }, {
      prepared: raw => PreparedReportAttachment.parse(raw), acknowledgement: raw => ReportAttachmentAcknowledgement.parse(raw), checkAcknowledgement: checkAck,
    });
  }
  private async authorize(intent: PreparedReportAttachment, action: 'prepare' | 'read' | 'attach') {
    await this.authority.authorize(structuredClone(this.scope), structuredClone(intent.destination), structuredClone(intent.target), action);
  }
  async prepare(resultId: string, rawTarget: ReportWorkTarget): Promise<ReportAttachmentState> {
    const target = ReportWorkTarget.parse(rawTarget); const source = await this.awr.inspect(resultId);
    if (!source.acknowledgement) throw new Conflict('Receipt import must be acknowledged before report attachment');
    await this.authority.authorize(structuredClone(this.scope), structuredClone(source.prepared.destination), structuredClone(target), 'prepare');
    const result = await this.sink.get(resultId);
    if (!sameScope(result.receipt.scope, this.scope) || !sameRef(result.receipt.ref, source.prepared.resultRef)) throw new Conflict('Retained result belongs to another delivery scope or ref');
    const projection = WorkflowEvidenceProjection.parse(source.prepared.receipt.extensions?.['org.tracegrove.workflow']);
    if (!projection.workBinding || projection.workBinding.workId !== target.entityId) throw new Conflict('Attachment target must match the campaign’s frozen work binding');
    const id = identity(this.scope, resultId); const existing = this.journal.read(id);
    if (existing) {
      if (!sameDigest(digestOfValue(existing.prepared.target), digestOfValue(target))) throw new Conflict('Attachment is already bound to another work target');
      return asState(existing);
    }
    const digest = receiptDigest(source); const hostedReceiptId = source.acknowledgement.receipt_id;
    const key = digestOfValue({ result: result.receipt.ref, delivery: source.prepared.ref, hostedReceiptId, target }).hex;
    const artifactId = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
    const intent = PreparedReportAttachment.parse(freeze({ schemaVersion: 'workflow.report-attachment/v1' as const, ref: { id, revision: '1' },
      scope: this.scope, resultRef: result.receipt.ref, deliveryRef: source.prepared.ref, destination: source.prepared.destination, target,
      hostedReceiptId, receiptDigest: digest, idempotencyKey: `tracegrove-report-${key}`, preparedAt: nowIso(),
      payload: { artifact_id: artifactId, entity_type: target.entityType, entity_id: target.entityId,
        name: `Workflow evidence: ${projection.campaignId}`, artifact_type: 'proof.link' as const,
        artifact_url: `${source.prepared.destination.origin}/work-ledger/receipts/${hostedReceiptId}`,
        description: `Retained workflow evidence. Product outcome: ${projection.productOutcome}. Imported evidence awaits review.`,
        preview_markdown: `Product outcome: **${projection.productOutcome}**\n\nPlanned lanes: ${projection.plannedLanes.join(', ')}.\n\nThis imported report does not approve or complete work.`,
        status: 'in_review' as const, created_by_type: 'agent' as const, metadata: { tracegrove: { schemaVersion: 'workflow.report-attachment/v1' as const,
          resultRef: result.receipt.ref, deliveryRef: source.prepared.ref, requestRef: projection.requestRef,
          hostedReceiptId, receiptDigest: digest, claim: 'external_unverified' as const, nativeAcceptance: 'not_requested' as const } } },
    }));
    await this.authorize(intent, 'prepare');
    if (this.journal.read(id)) return this.prepare(resultId, target);
    return asState(this.journal.prepare(intent));
  }
  async inspect(resultId: string): Promise<ReportAttachmentState> {
    const state = this.journal.read(identity(this.scope, resultId)); if (!state || state.prepared.resultRef.id !== resultId) throw new Conflict('No prepared report attachment for this result');
    await this.authorize(state.prepared, 'read'); return asState(state);
  }
  async deliver(resultId: string, transport: ReportAttachmentTransport): Promise<ReportAttachmentState> {
    return this.journal.whileIdle(identity(this.scope, resultId), async () => {
      const state = await this.inspect(resultId); const intent = state.prepared; await this.authorize(intent, 'attach');
      if (state.acknowledgement) return state;
      const source = await this.awr.inspect(resultId); const result = await this.sink.get(resultId);
      if (!sameScope(result.receipt.scope, this.scope) || !sameRef(result.receipt.ref, intent.resultRef) || !sameRef(source.prepared.ref, intent.deliveryRef) ||
          source.acknowledgement?.receipt_id !== intent.hostedReceiptId || !sameDigest(receiptDigest(source), intent.receiptDigest)) throw new Conflict('Imported report differs from the frozen attachment');
      const readback = HostedReceiptReadback.parse(await transport.readReceipt(structuredClone(intent)));
      if (readback.data.receipt_id !== intent.hostedReceiptId || !sameDigest(digestOfBytes(canonicalizeAgentWorkJson(readback.data.receipt)), intent.receiptDigest)) throw new Conflict('Hosted receipt readback differs from the exact imported report');
      await this.authorize(intent, 'attach');
      const attempt = this.journal.attempt(intent.ref.id);
      const acknowledgement = await transport.attach(structuredClone(intent));
      return asState(this.journal.acknowledge(intent.ref.id, attempt.version, acknowledgement));
    });
  }
}
