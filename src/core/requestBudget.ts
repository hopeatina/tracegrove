import { Blocked } from './errors.ts';

/** One synchronous reservation counter for an admitted run, shared across cells and transports.
 * Failed/uncertain dispatches remain charged. Cleanup uses its separate owned-resource path.
 */
export class RequestBudget {
  private spent = 0;
  private blocked: Blocked | null = null;
  constructor(readonly limit: number | null) {
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new Error('invalid request budget');
  }
  get count(): number { return this.spent; }
  throwIfBlocked(): void { if (this.blocked) throw this.blocked; }
  stop(reason: Blocked): never { this.blocked ??= reason; throw this.blocked; }
  claim(): void {
    this.throwIfBlocked();
    if (this.limit !== null && this.spent >= this.limit) this.stop(new Blocked([{ code: 'budget_exceeded',
      detail: `the run request budget of ${this.limit} is spent`, owner: 'operator', action: 'select fewer flows or explicitly revise the environment budget' }]));
    this.spent++;
  }
  /** No automatic redirect can dispatch an uncounted hop. */
  wrap(transport: typeof fetch): typeof fetch {
    return async (input, init) => { this.claim(); return transport(input, { ...init, redirect: 'manual' }); };
  }
}
