import { digestOfValue, parseAs, StepEvent, type Ref } from '../protocol/index.ts';
import { monotonicMs, newId, nowIso } from './clock.ts';

export class EventLog {
  readonly events: StepEvent[] = [];
  private sequence = 0;
  private readonly started = monotonicMs();
  constructor(private readonly executionId: string, private readonly attemptId: string, private readonly generation: number, private readonly sink?: (event: StepEvent) => void) {}

  emit(kind: string, stepId: string | null, payload: Record<string, unknown>, correlation: Partial<StepEvent['correlation']> = {}): StepEvent {
    const event = parseAs(StepEvent, {
      executionId: this.executionId, attemptId: this.attemptId, generation: this.generation,
      sequence: this.sequence++, eventId: newId('evt'), stepId, kind, at: nowIso(),
      monotonicOffsetMs: monotonicMs() - this.started,
      correlation: { traceId: null, requestId: null, turnId: null, jobId: null, nativeRunId: null, providerRequestId: null, ...correlation },
      payloadDigest: digestOfValue(payload),
      redactedPayload: payload,
    }, 'step event');
    this.events.push(event);
    this.sink?.(event);
    return event;
  }

  static refOf(event: StepEvent): Ref {
    return { id: event.eventId, revision: '1', digest: event.payloadDigest };
  }

  toJsonl(): string {
    return this.events.map((event) => JSON.stringify(event)).join('\n') + (this.events.length ? '\n' : '');
  }
}
