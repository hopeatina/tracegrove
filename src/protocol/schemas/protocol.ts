/** workflow.runner-protocol/v1: newline-delimited JSON frames between host and plugin. */
import { z } from 'zod';
import { DigestSchema, IdString, IsoDateTime, JsonValue, LIMITS, NonNegInt } from '../primitives.ts';

export const FRAME_MAX_BYTES = 64 * 1024;

const binding = {
  executionId: IdString,
  attemptId: IdString,
  generation: NonNegInt,
  requestDigest: DigestSchema,
};

export const HostFrame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prepare'), ...binding, operationId: IdString, deadlineAt: IsoDateTime, permittedOperations: z.array(IdString).max(64) }).strict(),
  z.object({ type: z.literal('execute'), ...binding, operationId: IdString, stepId: IdString, deadlineAt: IsoDateTime, input: JsonValue }).strict(),
  z.object({ type: z.literal('cancel'), ...binding, operationId: IdString }).strict(),
  z.object({ type: z.literal('collect'), ...binding, operationId: IdString, deadlineAt: IsoDateTime }).strict(),
  z.object({ type: z.literal('cleanup'), ...binding, operationId: IdString, deadlineAt: IsoDateTime }).strict(),
]);
export type HostFrame = z.infer<typeof HostFrame>;

export const PluginFrame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), ...binding, adapterId: IdString, protocolDigest: DigestSchema, capabilitiesDigest: DigestSchema }).strict(),
  z.object({ type: z.literal('step_observation'), ...binding, operationId: IdString, sequence: NonNegInt, stepId: IdString, result: z.enum(['completed', 'failed', 'cancelled']), reasonCode: z.string().max(LIMITS.shortText).nullable(), output: JsonValue.nullable() }).strict(),
  z.object({ type: z.literal('artifact_manifest'), ...binding, operationId: IdString, sequence: NonNegInt, artifacts: z.array(z.object({ path: z.string().max(LIMITS.shortText), mediaType: z.string().max(100), byteCount: NonNegInt, sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).max(LIMITS.list) }).strict(),
  z.object({ type: z.literal('heartbeat'), ...binding, sequence: NonNegInt, at: IsoDateTime }).strict(),
  z.object({ type: z.literal('terminal'), ...binding, operationId: IdString, sequence: NonNegInt, status: z.enum(['completed', 'failed', 'cancelled']), reasonCode: z.string().max(LIMITS.shortText).nullable() }).strict(),
]);
export type PluginFrame = z.infer<typeof PluginFrame>;
