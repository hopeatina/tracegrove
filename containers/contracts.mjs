import { z } from 'zod';

export const ContainerProfile = z.enum(['native-real', 'offline-contract']);
export const ContainerCliReport = z.object({ schemaVersion: z.literal('container.cli/v1'), profile: ContainerProfile,
  exitCode: z.number().int(), steps: z.array(z.object({ name: z.string(), code: z.number().int(), output: z.unknown() })).min(1) }).strict();
export const PassedBundle = z.object({ ok: z.literal(true), outcome: z.literal('passed') }).passthrough();
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const ContainerQualification = z.object({ schemaVersion: z.literal('container.qualification/v1'), profile: ContainerProfile,
  imageId: digest.nullable(), containerId: z.string().regex(/^[a-f0-9]{64}$/).nullable(), runId: z.string().uuid(),
  containerRemoved: z.boolean(), runtimeExitCode: z.number().int().nullable(), state: z.enum(['blocked', 'passed']),
  output: z.string().min(1), boundary: z.string().min(1), hostVerification: PassedBundle.optional(),
  error: z.string().optional(), cleanupError: z.string().optional(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.state === 'passed' && (!receipt.imageId || !receipt.containerId || receipt.runtimeExitCode !== 0 ||
      !receipt.containerRemoved || !receipt.hostVerification || receipt.error || receipt.cleanupError)) {
    ctx.addIssue({ code: 'custom', message: 'Passing container qualification needs runtime, saved-bundle and removal proof' });
  }
});
