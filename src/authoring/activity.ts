import { z } from 'zod';
import type { StepEvent } from '../protocol/index.ts';

/** Local progress is an observation, never execution or qualification evidence. */
export const RunActivity = z.object({
  status: z.enum(['idle', 'running', 'finished', 'failed']),
  event: z.string().nullable(), stepId: z.string().nullable(),
  label: z.string(), observedAt: z.string().datetime(),
}).strict();
export type RunActivity = z.infer<typeof RunActivity>;

export function runActivity(event: Pick<StepEvent, 'kind' | 'stepId' | 'at'>): RunActivity {
  const label = event.kind.startsWith('cleanup.') ? 'Cleaning up owned resources'
    : event.kind.startsWith('fixture.') ? 'Preparing and checking fixtures'
    : event.kind.startsWith('step.') ? `Running scenarios${event.stepId ? ` · ${event.stepId}` : ''}`
    : event.kind === 'cell.finalized' ? 'Finalizing and checking evidence'
    : event.kind === 'host.started' ? 'Checking application identity'
    : event.kind === 'host.failed' ? 'Application startup failed; cleanup continues'
    : 'Running verification';
  return RunActivity.parse({ status: 'running', event: event.kind, stepId: event.stepId, label, observedAt: event.at });
}
