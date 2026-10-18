import { z } from 'zod';
import { DigestSchema, IdString, IsoDateTime, RefSchema, ScopeSchema } from '../../protocol/index.ts';
import { AwrDestination, AwrDocument } from './contracts.ts';

export const ReportWorkTarget = z.object({ entityType: z.enum(['initiative', 'workstream', 'milestone', 'task']), entityId: z.string().uuid() }).strict();
export type ReportWorkTarget = z.infer<typeof ReportWorkTarget>;
export const ReportArtifactStatus = z.enum(['draft', 'in_review', 'eval_passed', 'approved', 'rejected', 'changes_requested', 'superseded', 'archived']);
const TracegroveAttachmentMetadata = z.object({ schemaVersion: z.literal('workflow.report-attachment/v1'), resultRef: RefSchema,
  deliveryRef: RefSchema, requestRef: RefSchema, hostedReceiptId: z.string().uuid(), receiptDigest: DigestSchema,
  claim: z.literal('external_unverified'), nativeAcceptance: z.literal('not_requested') }).strict();
export const ReportArtifactPayload = z.object({
  artifact_id: z.string().uuid(), entity_type: ReportWorkTarget.shape.entityType, entity_id: z.string().uuid(),
  name: z.string().min(1).max(500), artifact_type: z.literal('proof.link'), artifact_url: z.string().url(),
  description: z.string().max(4000), preview_markdown: z.string().max(25000), status: z.literal('in_review'),
  created_by_type: z.literal('agent'), metadata: z.object({ tracegrove: TracegroveAttachmentMetadata }).strict(),
}).strict();
export const PreparedReportAttachment = z.object({
  schemaVersion: z.literal('workflow.report-attachment/v1'), ref: RefSchema, scope: ScopeSchema,
  resultRef: RefSchema, deliveryRef: RefSchema, destination: AwrDestination, target: ReportWorkTarget,
  hostedReceiptId: z.string().uuid(), receiptDigest: DigestSchema, idempotencyKey: IdString,
  payload: ReportArtifactPayload, preparedAt: IsoDateTime,
}).strict();
export type PreparedReportAttachment = z.infer<typeof PreparedReportAttachment>;
export const HostedReceiptReadback = z.object({ ok: z.literal(true), data: z.object({
  receipt_id: z.string().uuid(), receipt: AwrDocument,
}).strip() }).strip();
export const ReportAttachmentAcknowledgement = z.object({ data: z.object({
  id: z.string().uuid(), workspace_id: z.string().uuid(), entity_type: ReportWorkTarget.shape.entityType,
  entity_id: z.string().uuid(), artifact_url: z.string().url(), status: ReportArtifactStatus,
  metadata: z.object({ tracegrove: TracegroveAttachmentMetadata }).strip(),
}).strip(), meta: z.object({ duplicate: z.boolean() }).strip() }).strip();
export type ReportAttachmentAcknowledgement = z.infer<typeof ReportAttachmentAcknowledgement>;
