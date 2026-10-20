/**
 * Real bounded HTTP surface driver. Every request carries a deadline-derived AbortSignal.
 * Observations are bounded, redacted records the trusted reducer evaluates; the driver never
 * decides pass/fail. No interceptor exists in this driver; the mock lane is a separate host.
 */
import { applyTemplate, applyTemplateDeep } from '../../core/compiler.ts';
import { Deadline } from '../../core/deadline.ts';
import { pollObservation } from '../poll.ts';
import { monotonicMs } from '../../core/clock.ts';
import { evaluatePredicate } from '../../core/reducer.ts';
import type { PredicateT } from '../../protocol/index.ts';
import type { RequestCredential } from '../../credentials/types.ts';
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

/** A bare string is a bearer token (legacy); a RequestCredential carries the auth recipe's headers. */
export type HttpCredential = string | RequestCredential;
export type HttpCredentials = { persona: HttpCredential | null; named: Record<string, HttpCredential> };

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

function credentialOf(spec: Pick<HttpRequestSpec, 'auth'>, credentials: HttpCredentials): HttpCredential | null {
  if (spec.auth.kind === 'none') return null;
  if (spec.auth.kind === 'persona') {
    if (!credentials.persona) throw new HttpStepError('missing_persona_credential', 'persona credential was not issued for this attempt');
    return credentials.persona;
  }
  const named = credentials.named[spec.auth.name];
  if (!named) throw new HttpStepError('missing_named_credential', `credential ${spec.auth.name} was not issued for this attempt`);
  return named;
}

/** Drivers that only speak bearer (browser, MCP, native jobs) use this; other recipes are refused. */
export function bearerFor(spec: Pick<HttpRequestSpec, 'auth'>, credentials: HttpCredentials): string | null {
  const credential = credentialOf(spec, credentials);
  if (credential === null || typeof credential === 'string') return credential;
  if (!credential.bearer) throw new HttpStepError('auth_recipe_unsupported', `the ${credential.recipe} auth recipe cannot be used by this surface; use a bearer recipe`);
  return credential.bearer.reveal();
}

/** Request headers for one call; values are revealed only into the outgoing request. */
export function authHeaders(spec: Pick<HttpRequestSpec, 'auth'>, credentials: HttpCredentials): Record<string, string> {
  const credential = credentialOf(spec, credentials);
  if (credential === null) return {};
  if (typeof credential === 'string') return { authorization: `Bearer ${credential}` };
  return Object.fromEntries(Object.entries(credential.headers).map(([name, value]) => [name, value.reveal()]));
}

/** Environment limits the driver enforces itself, independent of the planner. */
export type HttpPolicy = { maxRequests?: number | null; allowedMethods?: readonly string[] | null };

export class HttpDriver {
  private sent = 0;
  constructor(private readonly credentials: HttpCredentials, private readonly allowedOrigins: Set<string>, private readonly policy: HttpPolicy = {}) {}

  get requestCount(): number { return this.sent; }

  async request(spec: HttpRequestSpec): Promise<HttpObservation> {
    if (!this.allowedOrigins.has(spec.origin)) throw new HttpStepError('origin_not_admitted', `${spec.origin} is not an admitted origin`);
    if (this.policy.allowedMethods && !this.policy.allowedMethods.includes(spec.method)) throw new HttpStepError('environment_writes_forbidden', `${spec.method} is not allowed in a read-only environment`);
    if (this.policy.maxRequests !== undefined && this.policy.maxRequests !== null && this.sent >= this.policy.maxRequests) throw new HttpStepError('budget_exceeded', `the environment request budget of ${this.policy.maxRequests} is spent`);
    this.sent++;
    const path = applyTemplate(spec.path, spec.variables);
    if (!path.startsWith('/')) throw new HttpStepError('invalid_path', path);
    const url = `${spec.origin}${path}`;
    const headers: Record<string, string> = { ...(spec.headers ?? {}) };
    Object.assign(headers, authHeaders(spec, this.credentials));
    let bodyText: string | undefined;
    if (spec.body !== undefined && spec.body !== null && spec.method !== 'GET' && spec.method !== 'HEAD') {
      headers['content-type'] = headers['content-type'] ?? 'application/json';
      bodyText = JSON.stringify(applyTemplateDeep(spec.body, spec.variables));
    }
    const started = monotonicMs();
    const signal = spec.deadline.signal(spec.signal);
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, { method: spec.method, headers, ...(bodyText !== undefined ? { body: bodyText } : {}), signal, redirect: 'manual' });
      text = await response.text();
    } catch (error) {
      const err = error as Error & { name?: string; cause?: unknown };
      if (spec.signal?.aborted) throw new HttpStepError('cancelled', 'request cancelled');
      if (err.name === 'TimeoutError' || err.name === 'AbortError' || signal.aborted) throw new HttpStepError('deadline_exceeded', `${spec.method} ${path} exceeded its deadline`);
      throw new HttpStepError('transport_failure', `${spec.method} ${path}: ${err.message}`);
    }
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
    return pollObservation({ read: () => this.request(spec), accepts: observation => evaluatePredicate(predicate, { status: observation.status, body: observation.body }).pass,
      deadline: spec.deadline, pollIntervalMs, signal: spec.signal, cancelled: () => new HttpStepError('cancelled', 'observation cancelled') });
  }
}

export function captureValues(observation: Pick<HttpObservation, 'body'> & Partial<Pick<HttpObservation, 'status' | 'headers'>>, captures: Capture[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const capture of captures) {
    switch (capture.from) {
      case 'status': values[capture.name] = observation.status; break;
      case 'header': values[capture.name] = capture.path ? observation.headers?.[capture.path.toLowerCase()] ?? null : null; break;
      case 'json': {
        let current: unknown = observation.body;
        for (const segment of (capture.path ?? '').split('.').filter(Boolean)) {
          const indexed = segment.match(/^([A-Za-z_][A-Za-z0-9_]*)\[([0-9]+)\]$/);
          current = current && typeof current === 'object' ? (current as Record<string, unknown>)[indexed ? indexed[1]! : segment] : undefined;
          if (indexed) current = Array.isArray(current) ? current[Number(indexed[2])] : undefined;
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
