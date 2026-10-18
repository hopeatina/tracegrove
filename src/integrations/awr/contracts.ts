import { z } from 'zod';
import { validateAgentWorkReceipt, type AgentWorkReceipt } from '@useorgx/agent-work-receipt';
import { IdString, IsoDateTime, JsonValue, RefSchema, ScopeSchema } from '../../protocol/index.ts';

/** Operator configuration, never a destination taken from producer evidence. */
export const AwrDestination = z.object({
  origin: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === value && url.protocol === 'https:' && !url.username && !url.password;
  }, 'Expected an HTTPS origin without path, credentials, query or fragment'),
  workspaceId: z.string().uuid(),
}).strict();
export type AwrDestination = z.infer<typeof AwrDestination>;

export const AwrDocument = z.custom<AgentWorkReceipt>(value => validateAgentWorkReceipt(value).ok, 'Invalid Agent Work Receipt');
export const PreparedAwrDelivery = z.object({
  schemaVersion: z.literal('workflow.awr-delivery/v1'), ref: RefSchema, scope: ScopeSchema,
  resultRef: RefSchema, destination: AwrDestination, idempotencyKey: IdString,
  receipt: AwrDocument, preparedAt: IsoDateTime,
}).strict();
export type PreparedAwrDelivery = z.infer<typeof PreparedAwrDelivery>;
export const AwrAcknowledgement = z.object({
  ok: z.literal(true), receipt_id: z.string().uuid(), external_receipt_id: IdString,
  schema_version: z.literal('agent-work-receipt/v0.2'), idempotent: z.boolean(),
}).strip();
export type AwrAcknowledgement = z.infer<typeof AwrAcknowledgement>;
export const AwrDeliveryAttempt = z.object({ attempt: z.number().int().positive().max(1000), startedAt: IsoDateTime }).strict();
export const AwrDeliveryAccepted = z.object({ acknowledgement: AwrAcknowledgement, acknowledgedAt: IsoDateTime }).strict();
// Exercise the core bounded JSON contract before an envelope can enter a journal.
export function checkedAwrDocument(value: unknown): AgentWorkReceipt {
  JsonValue.parse(value);
  const validation = validateAgentWorkReceipt(value);
  if (!validation.ok) throw new Error(`Invalid AWR projection: ${validation.issues.slice(0, 4).map(issue => `${issue.path} (${issue.code})`).join(', ')}`);
  const receipt = validation.receipt;
  if (Buffer.byteLength(JSON.stringify(receipt)) > 240_000) throw new Error('AWR projection exceeds the bounded import size; evidence was not truncated');
  return receipt;
}
