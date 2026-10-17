/** Common lifecycle/reporting invariants; provider-specific mutations remain typed capabilities. */
import { z } from 'zod';
import { IdString, RefSchema, PositiveInt, Millis, NonNegInt, DigestSchema } from '../primitives.ts';
import { CapabilityBinding, NativeEvidence } from './capability.ts';

export const CapabilityRetryPolicy = z.object({ maxAttempts: PositiveInt.max(10), baseDelayMs: Millis, maxDelayMs: Millis,
  maxElapsedMs: Millis, maxRequests: NonNegInt }).strict();
export const CapabilityRetryState = z.object({ attemptNumber: PositiveInt, elapsedMs: Millis, requestsUsed: NonNegInt,
  remainingDeadlineMs: Millis, retryAfterMs: Millis.nullable(),
  failure: z.enum(['transport', 'setup', 'assertion', 'cancelled', 'unsupported']),
  effects: z.enum(['none', 'acknowledged', 'ambiguous']), mutating: z.boolean(),
  idempotency: z.object({ key: IdString, requestDigest: DigestSchema, authorityRef: RefSchema }).strict().nullable(),
  priorAttemptRef: RefSchema, retainedArtifactRefs: z.array(RefSchema).max(500),
}).strict();
export const CapabilityLifecycleCheckpoint = z.object({ schemaVersion: z.literal('workflow.capability-lifecycle-checkpoint/v1'),
  binding: CapabilityBinding, operationId: IdString, inventory: z.array(z.object({ resourceRef: RefSchema, leaseRef: RefSchema,
    state: z.enum(['reserved', 'created', 'effect_unacknowledged', 'cleanup_pending', 'cleanup_failed', 'removed']),
    evidenceRefs: z.array(RefSchema).max(32),
  }).strict()).max(500),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.inventory.map(item => JSON.stringify(item.resourceRef))).size !== value.inventory.length) ctx.addIssue({ code: 'custom', message: 'duplicate owned inventory' });
  if (value.inventory.some(item => item.state === 'removed' && !item.evidenceRefs.length)) ctx.addIssue({ code: 'custom', message: 'removed resources require cleanup evidence' });
});
export type CapabilityLifecycleCheckpoint = z.infer<typeof CapabilityLifecycleCheckpoint>;
export const CapabilityArtifactManifest = z.object({ schemaVersion: z.literal('workflow.capability-artifact-manifest/v1'),
  binding: CapabilityBinding, publication: z.enum(['incomplete', 'committed']), artifacts: z.array(z.object({ fileName: z.string().regex(/^[a-f0-9]{64}\.(?:json|jsonl|xml|webm|png|zip|txt)$/),
    artifact: NativeEvidence,
  }).strict()).max(500),
}).strict().superRefine((value, ctx) => {
  if (value.publication === 'committed' && (!value.artifacts.length || value.artifacts.some(item => item.artifact.redaction === 'unavailable'))) ctx.addIssue({ code: 'custom', message: 'committed manifest requires available artifact evidence' });
  const names = value.artifacts.map(item => item.fileName);
  if (new Set(names).size !== names.length || names.join('\n') !== [...names].sort().join('\n')) ctx.addIssue({ code: 'custom', message: 'artifact names must be unique and sorted' });
  if (value.artifacts.some(item => !item.fileName.startsWith(`${item.artifact.ref.digest.hex}.`))) ctx.addIssue({ code: 'custom', message: 'filename must bind content digest' });
});
export type CapabilityArtifactManifest = z.infer<typeof CapabilityArtifactManifest>;

export const CapabilityReplayPlan = z.object({ schemaVersion: z.literal('workflow.capability-replay-plan/v1'),
  mode: z.enum(['evidence_playback', 'fixture_rerun', 'recorded_io_rerun', 'workflow_history_replay']),
  sourceReceiptRef: RefSchema, sourceBinding: CapabilityBinding, targetBinding: CapabilityBinding.nullable(),
  sourceCodeRef: RefSchema, targetCodeRef: RefSchema, compatibilityReviewRef: RefSchema.nullable(),
  pins: z.object({ fixtureRef: RefSchema, seedRef: RefSchema, generatorRef: RefSchema, runtimeRef: RefSchema, configRef: RefSchema,
    clockMode: z.enum(['wall', 'frozen', 'engine_virtual']), clockRef: RefSchema }).strict(),
  freshFixtureRefs: z.array(RefSchema).max(64), historyRef: RefSchema.nullable(),
  externalEffects: z.enum(['none', 'declared_isolated']),
}).strict();
