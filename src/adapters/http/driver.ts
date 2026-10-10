/**
 * Real bounded HTTP surface driver. Every request carries a deadline-derived AbortSignal.
 * Observations are bounded, redacted records the trusted reducer evaluates; the driver never
 * decides pass/fail. No interceptor exists in this driver; the mock lane is a separate host.
 */
import { applyTemplate, applyTemplateDeep } from '../../core/compiler.ts';
import { Deadline, sleep } from '../../core/deadline.ts';
import { monotonicMs } from '../../core/clock.ts';
import { evaluatePredicate } from '../../core/reducer.ts';
import type { PredicateT } from '../../protocol/index.ts';
import type { z } from 'zod';
import type { Capture as CaptureSchema } from '../../protocol/index.ts';
type Capture = z.infer<typeof CaptureSchema>;

export const MAX_BODY_TEXT = 8 * 1024;
const RECORDED_HEADERS = ['content-type', 'x-request-id', 'content-length'];

export type HttpObservation = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  bodyText: string | null;
  requestId: string | null;
  method: string;
  url: string;
  durationMs: number;
  attempts: number;
};

export type HttpCredentials = { persona: string | null; named: Record<string, string> };

export type HttpRequestSpec = {
  origin: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth: { kind: 'none' } | { kind: 'persona' } | { kind: 'credential'; name: string };
  variables: Record<string, unknown>;
  deadline: Deadline;
  signal?: AbortSignal;
};

export class HttpStepError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'HttpStepError';
  }
}

function bearerFor(spec: HttpRequestSpec, credentials: HttpCredentials): string | null {
  if (spec.auth.kind === 'none') return null;
  if (spec.auth.kind === 'persona') {
    if (!credentials.persona) throw new HttpStepError('missing_persona_credential', 'persona credential was not issued for this attempt');
    return credentials.persona;
  }
  const named = credentials.named[spec.auth.name];
  if (!named) throw new HttpStepError('missing_named_credential', `credential ${spec.auth.name} was not issued for this attempt`);
  return named;
}

export class HttpDriver {
  constructor(private readonly credentials: HttpCredentials, private readonly allowedOrigins: Set<string>) {}

  async request(spec: HttpRequestSpec): Promise<HttpObservation> {
    if (!this.allowedOrigins.has(spec.origin)) throw new HttpStepError('origin_not_admitted', `${spec.origin} is not an admitted origin`);
    const path = applyTemplate(spec.path, spec.variables);
    if (!path.startsWith('/')) throw new HttpStepError('invalid_path', path);
    const url = `${spec.origin}${path}`;
    const headers: Record<string, string> = { ...(spec.headers ?? {}) };
    const bearer = bearerFor(spec, this.credentials);
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    let bodyText: string | undefined;
    if (spec.body !== undefined && spec.body !== null && spec.method !== 'GET' && spec.method !== 'HEAD') {
      headers['content-type'] = headers['content-type'] ?? 'application/json';
      bodyText = JSON.stringify(applyTemplateDeep(spec.body, spec.variables));
    }
    const started = monotonicMs();
    const signal = spec.deadline.signal(spec.signal);
    let response: Response;
    try {
      response = await fetch(url, { method: spec.method, headers, ...(bodyText !== undefined ? { body: bodyText } : {}), signal, redirect: 'manual' });
    } catch (error) {
      const err = error as Error & { name?: string; cause?: unknown };
      if (spec.signal?.aborted) throw new HttpStepError('cancelled', 'request cancelled');
      if (err.name === 'TimeoutError' || err.name === 'AbortError' || signal.aborted) throw new HttpStepError('deadline_exceeded', `${spec.method} ${path} exceeded its deadline`);
      throw new HttpStepError('transport_failure', `${spec.method} ${path}: ${err.message}`);
    }
    const text = await response.text();
    const durationMs = monotonicMs() - started;
    const recorded: Record<string, string> = {};
    for (const name of RECORDED_HEADERS) { const value = response.headers.get(name); if (value) recorded[name] = value; }
    let body: unknown = null;
    let bodyOut: string | null = null;
    if (text.length > 0) {
      try { body = JSON.parse(text); } catch { bodyOut = text.slice(0, MAX_BODY_TEXT); }
    }
    return { status: response.status, headers: recorded, body, bodyText: bodyOut, requestId: response.headers.get('x-request-id'), method: spec.method, url: `${spec.origin}${path}`, durationMs, attempts: 1 };
  }

  /** Poll an independent readback until the predicate holds or the deadline expires. */
  async observe(spec: HttpRequestSpec, predicate: PredicateT, pollIntervalMs: number): Promise<HttpObservation> {
    let attempts = 0;
    let last: HttpObservation | null = null;
    while (true) {
      attempts += 1;
      last = await this.request(spec);
      last.attempts = attempts;
      if (evaluatePredicate(predicate, { status: last.status, body: last.body }).pass) return last;
      if (spec.deadline.remainingMs() <= pollIntervalMs) return last;
      await sleep(pollIntervalMs, spec.deadline.signal(spec.signal));
    }
  }
}

export function captureValues(observation: HttpObservation, captures: Capture[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const capture of captures) {
    switch (capture.from) {
      case 'status': values[capture.name] = observation.status; break;
      case 'header': values[capture.name] = capture.path ? observation.headers[capture.path.toLowerCase()] ?? null : null; break;
      case 'json': {
        let current: unknown = observation.body;
        for (const segment of (capture.path ?? '').split('.').filter(Boolean)) {
          current = current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined;
        }
        if (current === undefined) throw new HttpStepError('capture_missing', `capture ${capture.name}: path ${capture.path} absent from response`);
        values[capture.name] = current;
        break;
      }
    }
  }
  return values;
}

export function redactObservation(observation: HttpObservation): Record<string, unknown> {
  return { status: observation.status, headers: observation.headers, body: observation.body, bodyText: observation.bodyText, requestId: observation.requestId, method: observation.method, url: observation.url, durationMs: observation.durationMs, attempts: observation.attempts };
}
