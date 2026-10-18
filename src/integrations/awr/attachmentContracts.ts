import { z } from 'zod';
import { DigestSchema, IdString, IsoDateTime, RefSchema, ScopeSchema } from '../../protocol/index.ts';
import { AwrDestination, AwrDocument } from './contracts.ts';

/** An operator-supplied native snapshot, never a timestamp invented by the sender. */
export const ReportWorkTarget = z.object({
  entityType: z.enum(['project', 'initiative', 'workstream', 'milestone', 'task']), entityId: z.string().uuid(),
  workspaceId: z.string().uuid(), expectedUpdatedAt: IsoDateTime,
}).strict();
export type ReportWorkTarget = z.infer<typeof ReportWorkTarget>;
export const ReportArtifactStatus = z.enum(['draft', 'in_review', 'eval_passed', 'approved', 'rejected', 'changes_requested', 'superseded', 'archived']);
const TracegroveAttachmentMetadata = z.object({ schemaVersion: z.literal('workflow.report-attachment/v2'), resultRef: RefSchema,
  deliveryRef: RefSchema, requestRef: RefSchema, hostedReceiptId: z.string().uuid(), receiptDigest: DigestSchema,
  claim: z.literal('external_unverified'), nativeAcceptance: z.literal('not_requested') }).strict();
export const ReportArtifactPayload = z.object({
  artifact_id: z.string().uuid(), entity_type: ReportWorkTarget.shape.entityType, entity_id: z.string().uuid(),
  expected_scope: z.object({ workspace_id: ReportWorkTarget.shape.workspaceId, expected_updated_at: ReportWorkTarget.shape.expectedUpdatedAt }).strict(),
  name: z.string().min(1).max(500), artifact_type: z.literal('proof.link'), artifact_url: z.string().url(),
  description: z.string().max(4000), preview_markdown: z.string().max(25000), status: z.literal('in_review'),
  created_by_type: z.literal('agent'), metadata: z.object({ tracegrove: TracegroveAttachmentMetadata }).strict(),
}).strict();
export const PreparedReportAttachment = z.object({
  schemaVersion: z.literal('workflow.report-attachment/v2'), ref: RefSchema, scope: ScopeSchema,
  resultRef: RefSchema, deliveryRef: RefSchema, destination: AwrDestination, target: ReportWorkTarget,
  hostedReceiptId: z.string().uuid(), receiptDigest: DigestSchema, idempotencyKey: IdString,
  payload: ReportArtifactPayload, preparedAt: IsoDateTime,
}).strict().superRefine((intent, ctx) => {
  if (intent.target.workspaceId !== intent.destination.workspaceId || intent.payload.expected_scope.workspace_id !== intent.target.workspaceId ||
      intent.payload.expected_scope.expected_updated_at !== intent.target.expectedUpdatedAt || intent.payload.entity_type !== intent.target.entityType ||
      intent.payload.entity_id !== intent.target.entityId) ctx.addIssue({ code: 'custom', message: 'Attachment payload must match its frozen work snapshot and destination', path: ['payload'] });
});
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
