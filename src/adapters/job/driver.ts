import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { NativeJobObservation, NativeJobReady, NativeJobRequest, NativeJobResponse, NativeJobResult, MAX_NATIVE_JOB_MESSAGE_BYTES, type NativeJobAction, type PredicateT } from '../../protocol/index.ts';
import { Deadline } from '../../core/deadline.ts';
import { pollObservation } from '../poll.ts';
import { monotonicMs } from '../../core/clock.ts';
import { evaluatePredicate } from '../../core/reducer.ts';
import type { NativeJobSession } from './types.ts';

export class NativeJobError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'NativeJobError'; }
}

/** One attempt's bounded native channel. Credentials never enter an observation or log. */
export class NativeJobDriver implements NativeJobSession {
  private queues = new Set<string>();
  private pending = new Map<string, { done: (value: unknown) => void; fail: (error: Error) => void }>();
  private ready: Promise<void>;
  private markReady!: () => void;
  private failReady!: (error: Error) => void;
  constructor(private readonly channel: ChildProcess) {
    this.ready = new Promise((done, fail) => { this.markReady = done; this.failReady = fail; });
    void this.ready.catch(() => undefined);
    channel.on('message', this.onMessage);
    channel.once('exit', this.onExit); channel.once('error', this.onExit);
  }
  private onMessage = (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const wrapper = message as { kind?: string; message?: unknown };
    if (wrapper.kind !== 'host.job') return;
    if (Buffer.byteLength(JSON.stringify(wrapper.message) ?? '') > MAX_NATIVE_JOB_MESSAGE_BYTES) return;
    const ready = NativeJobReady.safeParse(wrapper.message);
    if (ready.success) { this.queues = new Set(ready.data.queues); this.markReady(); return; }
    const response = NativeJobResponse.safeParse(wrapper.message);
    const id = (wrapper.message as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') return;
    const pending = this.pending.get(id);
    if (!pending) return;
    if (response.success) pending.done(response.data.result);
    else pending.fail(new NativeJobError('native_job_response_invalid', 'Native job response did not match the admitted protocol'));
  };
  private onExit = () => {
    const error = new NativeJobError('transport_failure', 'Native job owner exited');
    this.failReady(error); for (const pending of this.pending.values()) pending.fail(error);
    this.channel.off('message', this.onMessage);
  };
  async waitReady(deadline: Deadline, signal: AbortSignal): Promise<void> {
    await this.bounded(this.ready, deadline, signal);
  }
  private async bounded<T>(operation: Promise<T>, deadline: Deadline, signal: AbortSignal): Promise<T> {
    const combined = deadline.signal(signal);
    return new Promise((done, fail) => {
      const abort = () => fail(new NativeJobError(signal.aborted ? 'cancelled' : 'deadline_exceeded', 'Native job operation interrupted'));
      operation.then(done, fail).finally(() => combined.removeEventListener('abort', abort));
      if (combined.aborted) return abort();
      combined.addEventListener('abort', abort, { once: true });
    });
  }
  async request(command: NativeJobAction, credential: string | null, deadline: Deadline, signal: AbortSignal): Promise<NativeJobObservation> {
    if (signal.aborted || deadline.expired()) throw new NativeJobError(signal.aborted ? 'cancelled' : 'deadline_exceeded', 'Native job operation interrupted');
    if (!this.queues.has(command.queue)) throw new NativeJobError('native_job_queue_unavailable', 'Native queue was not advertised by the application');
    const request = NativeJobRequest.parse({ kind: 'tracegrove.job.request', id: randomUUID(), credential, command });
    if (Buffer.byteLength(JSON.stringify(request)) > MAX_NATIVE_JOB_MESSAGE_BYTES) throw new NativeJobError('native_job_request_too_large', 'Native job request exceeds the protocol limit');
    const started = monotonicMs();
    const response = new Promise<unknown>((done, fail) => {
      this.pending.set(request.id, { done, fail });
      this.channel.send({ kind: 'host.job_request', request }, error => { if (error) fail(new NativeJobError('transport_failure', 'Native job channel closed')); });
    });
    try {
      const result = NativeJobResult.parse(await this.bounded(response, deadline, signal));
      if (credential && JSON.stringify(result).includes(credential)) throw new NativeJobError('native_job_secret_echo', 'Native response echoed an issued credential; observation withheld');
      if (result.jobId !== null && (command.action === 'submit' ? result.requestKey !== command.requestKey : result.jobId !== command.jobId)) throw new NativeJobError('native_job_identity_mismatch', 'Native job readback belongs to another request');
      if (result.jobId === null && !['missing', 'forbidden', 'conflict'].includes(result.status)) throw new NativeJobError('native_job_identity_missing', 'Native job state has no resource identity');
      return NativeJobObservation.parse({ ...result, kind: 'native_job', queue: command.queue, action: command.action, durationMs: Math.round(monotonicMs() - started), attempts: 1 });
    } finally { this.pending.delete(request.id); }
  }
  async observe(command: Extract<NativeJobAction, { action: 'read' }>, credential: string | null, predicate: PredicateT, pollIntervalMs: number, deadline: Deadline, signal: AbortSignal): Promise<NativeJobObservation> {
    return pollObservation({ read: () => this.request(command, credential, deadline, signal), accepts: observation => evaluatePredicate(predicate, { body: observation }).pass,
      deadline, pollIntervalMs, signal, cancelled: () => new NativeJobError('cancelled', 'native job observation cancelled') });
  }
}
