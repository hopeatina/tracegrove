/** Every operation receives a deadline bounded by the remaining budget; AbortSignal propagates. */
export class Deadline {
  readonly at: number;
  constructor(at: number) {
    this.at = at;
  }
  static in(ms: number, parent?: Deadline): Deadline {
    const at = Date.now() + ms;
    return new Deadline(parent ? Math.min(parent.at, at) : at);
  }
  remainingMs(): number {
    return Math.max(0, this.at - Date.now());
  }
  expired(): boolean {
    return this.remainingMs() === 0;
  }
  /** Child deadline never exceeds the parent. */
  child(ms: number): Deadline {
    return Deadline.in(ms, this);
  }
  signal(parent?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(Math.max(1, this.remainingMs()));
    return parent ? AbortSignal.any([parent, timeout]) : timeout;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error('aborted')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
