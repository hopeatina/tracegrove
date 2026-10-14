import { z } from 'zod';

const Key = z.string().min(1).max(256);
const Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const Counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Resource = z.object({
  entityKey: Key, physicalId: z.string().min(1).max(2048), boundaryId: Key,
  check: z.enum(['http_absence', 'host_stop']),
}).strict();
const Binding = {
  scopeId: Key, attemptId: Key, workerId: Key,
  generation: Counter.positive(), coordinationVersion: Counter.positive(),
};

/** Supplied by the trusted ownership/effect ledger, never by the worker report. */
export const CleanupExpectationSchema = z.object({
  schemaVersion: z.literal('workflow.cleanup-expectation/v1'), ...Binding,
  effectIds: z.array(Key).max(1000), unresolvedEffectIds: z.array(Key).max(1000),
  ownershipLedgerHeadDigest: Digest,
  resources: z.array(Resource).max(1000),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.effectIds).size !== value.effectIds.length ||
    new Set(value.unresolvedEffectIds).size !== value.unresolvedEffectIds.length ||
    new Set(value.resources.map(resource => resource.entityKey)).size !== value.resources.length) {
    ctx.addIssue({ code: 'custom', message: 'Cleanup expectation contains duplicate identities' });
  }
});
export type CleanupExpectation = z.infer<typeof CleanupExpectationSchema>;

export const WorkflowOwnershipSchema = z.object({
  hostReceiptDigest: Digest, hostResources: z.array(Resource).max(1000),
  effects: z.array(z.object({ effectId: Key, receiptDigest: Digest,
    resources: z.array(Resource).max(1000) }).strict()).max(1000),
}).strict().superRefine((value, ctx) => {
  const resources = [...value.hostResources, ...value.effects.flatMap(effect => effect.resources)];
  if (resources.length > 1000 || new Set(resources.map(item => item.entityKey)).size !== resources.length ||
    new Set(value.effects.map(item => item.effectId)).size !== value.effects.length ||
    value.hostResources.some(item => item.check !== 'host_stop') ||
    value.effects.some(effect => effect.resources.some(item => item.check !== 'http_absence'))) {
    ctx.addIssue({ code: 'custom', message: 'Workflow ownership closure is invalid' });
  }
});
export type WorkflowOwnership = z.infer<typeof WorkflowOwnershipSchema>;

const Evidence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('http_absence'), entityKey: Key, receiptDigest: Digest,
    method: z.enum(['GET', 'HEAD']), status: z.union([z.literal(404), z.literal(410)]) }).strict(),
  z.object({ kind: z.literal('host_stop'), entityKey: Key, receiptDigest: Digest }).strict(),
]);
export const CleanupFollowupSchema = z.object({
  schemaVersion: z.literal('workflow.cleanup-followup/v1'), ...Binding,
  observerId: Key, expectationDigest: Digest,
  observedAt: Counter, expiresAt: Counter, evidence: z.array(Evidence).max(1000),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.evidence.map(item => item.entityKey)).size !== value.evidence.length ||
    value.expiresAt <= value.observedAt || value.expiresAt - value.observedAt > 300_000) {
    ctx.addIssue({ code: 'custom', message: 'Cleanup evidence identities or freshness window are invalid' });
  }
});
export type CleanupFollowup = z.infer<typeof CleanupFollowupSchema>;

export const SignedCleanupFollowupSchema = z.object({
  schemaVersion: z.literal('workflow.signed-cleanup-followup/v1'),
  algorithm: z.literal('ed25519'), keyId: Key, followup: CleanupFollowupSchema,
  signature: z.string().regex(/^[A-Za-z0-9_-]{85}[AQgw]$/),
}).strict();
export type SignedCleanupFollowup = z.infer<typeof SignedCleanupFollowupSchema>;
