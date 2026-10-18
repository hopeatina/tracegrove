import { Deadline, sleep } from '../core/deadline.ts';

/** A timeout cannot erase a completed readback; transport errors and cancellation stay failures. */
export async function pollObservation<T extends { attempts: number }>(options: {
  read: () => Promise<T>; accepts: (observation: T) => boolean; deadline: Deadline;
  pollIntervalMs: number; signal?: AbortSignal | undefined; cancelled: () => Error;
}): Promise<T> {
  let attempts = 0; let last: T | null = null;
  while (true) {
    if (options.signal?.aborted) throw options.cancelled();
    if (last && options.deadline.expired()) return last;
    try {
      attempts++; last = await options.read(); last.attempts = attempts;
      if (options.accepts(last) || options.deadline.remainingMs() <= options.pollIntervalMs) return last;
      await sleep(options.pollIntervalMs, options.deadline.signal(options.signal));
    } catch (error) {
      if (options.signal?.aborted) throw options.cancelled();
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || (error as Error & { code?: string }).code === 'deadline_exceeded');
      if (last && timeout && options.deadline.expired()) { last.attempts = attempts; return last; }
      throw error;
    }
  }
}
