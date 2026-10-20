/**
 * Requests the app actually served during a run, read back from the sealed `app.request`
 * events the recording proxy produced. This is what coverage and the grove's roots use: what
 * happened, not what a flow file says should happen.
 */
import { z } from 'zod';
import { digestOfBytes, type ExecutionReceipt } from '../protocol/index.ts';

export const ObservedRequest = z.object({
  method: z.string().max(16),
  path: z.string().max(2048),
  status: z.number().int().nullable(),
  /** step id, or null for fixture setup outside any step */
  step: z.string().max(200).nullable(),
  count: z.number().int().positive(),
  durationMs: z.number().nonnegative(),
}).strict();
export type ObservedRequest = z.infer<typeof ObservedRequest>;

export const MAX_OBSERVED_PER_CASE = 256;

const Payload = z.object({ method: z.string(), path: z.string(), status: z.number().int().nullable(), durationMs: z.number() }).passthrough();

/** Group a cell's app.request events by step, method, path and status. */
export function observedRequests(eventsJsonl: string): ObservedRequest[] {
  const groups = new Map<string, ObservedRequest>();
  for (const line of eventsJsonl.split('\n')) {
    if (!line.includes('"app.request"')) continue;
    let event: { kind?: string; stepId?: string | null; redactedPayload?: unknown };
    try { event = JSON.parse(line); } catch { continue; }
    if (event.kind !== 'app.request') continue;
    const payload = Payload.safeParse(event.redactedPayload);
    if (!payload.success) continue;
    const { method, path, status, durationMs } = payload.data;
    const step = event.stepId ?? null;
    const key = JSON.stringify([step, method, path, status]);
    const group = groups.get(key);
    if (group) { group.count++; group.durationMs += durationMs; continue; }
    if (groups.size >= MAX_OBSERVED_PER_CASE) continue;
    groups.set(key, { method, path: path.slice(0, 2048), status, step, count: 1, durationMs });
  }
  return [...groups.values()];
}

/** Only events whose bytes match the receipt's sealed digest count as observed. */
export function verifiedObservedRequests(receipt: ExecutionReceipt, eventsBytes: Buffer): ObservedRequest[] {
  if (digestOfBytes(eventsBytes).hex !== receipt.eventsDigest.hex) return [];
  return observedRequests(eventsBytes.toString('utf8'));
}

/**
 * Whether a concrete request path matches a route template. `{name}` matches one non-empty
 * segment; a trailing slash is ignored on both sides.
 */
export function matchesTemplate(template: string, path: string): boolean {
  const split = (p: string) => p.replace(/\/+$/, '').split('/').filter((s, i) => i === 0 || s.length > 0);
  const t = split(template), p = split(path);
  if (t.length !== p.length) return false;
  return t.every((segment, i) => /^\{[^}]*\}$/.test(segment) ? p[i]!.length > 0 : segment === p[i]);
}
