import { z } from 'zod';
import { IdString, JsonValue, NonNegInt } from '../primitives.ts';
const JobKey = z.string().min(1).max(128);

export const NativeJobAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), queue: IdString, requestKey: JobKey, payload: JsonValue }).strict(),
  z.object({ action: z.literal('read'), queue: IdString, jobId: JobKey }).strict(),
  z.object({ action: z.literal('cancel'), queue: IdString, jobId: JobKey }).strict(),
]);
export type NativeJobAction = z.infer<typeof NativeJobAction>;
export const NativeJobReady = z.object({ kind: z.literal('tracegrove.job.ready'), version: z.literal(1), queues: z.array(IdString).min(1).max(32) }).strict();
export const NativeJobRequest = z.object({ kind: z.literal('tracegrove.job.request'), id: z.string().uuid(), credential: z.string().max(4096).nullable(), command: NativeJobAction }).strict();
export const NativeJobResult = z.object({ jobId: IdString.nullable(), status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancel_requested', 'cancelled', 'missing', 'forbidden', 'conflict']),
  requestKey: JobKey.nullable(), output: JsonValue, workerId: IdString.nullable() }).strict();
export const NativeJobResponse = z.object({ kind: z.literal('tracegrove.job.response'), id: z.string().uuid(), result: NativeJobResult }).strict();
export const NativeJobObservation = NativeJobResult.extend({ kind: z.literal('native_job'), queue: IdString, action: z.enum(['submit', 'read', 'cancel']), durationMs: NonNegInt, attempts: NonNegInt }).strict();
export type NativeJobObservation = z.infer<typeof NativeJobObservation>;
export const MAX_NATIVE_JOB_MESSAGE_BYTES = 32 * 1024;
