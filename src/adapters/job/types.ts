import type { NativeJobAction, NativeJobObservation, PredicateT } from '../../protocol/index.ts';
import type { Deadline } from '../../core/deadline.ts';

/** Provider-neutral attempt port; transports own admission, correlation and cancellation. */
export interface NativeJobSession {
  request(command: NativeJobAction, credential: string | null, deadline: Deadline, signal: AbortSignal): Promise<NativeJobObservation>;
  observe(command: Extract<NativeJobAction, { action: 'read' }>, credential: string | null, predicate: PredicateT, pollIntervalMs: number, deadline: Deadline, signal: AbortSignal): Promise<NativeJobObservation>;
}
