import { Blocked, Conflict, InfrastructureFailure } from '../../core/errors.ts';
import { AwrDestination } from './contracts.ts';

/** Authenticated same-origin JSON only. Never persists credentials, raw responses or provider errors. */
export class OrgxJsonHttpClient {
  constructor(private readonly credential: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {}
  async request(input: { origin: string; path: string; method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string;
    maximumBytes: number; operation: 'import' | 'receipt readback' | 'artifact attachment' }): Promise<unknown> {
    const origin = AwrDestination.shape.origin.parse(input.origin); const url = new URL(input.path, origin);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new InfrastructureFailure('OrgX request must stay on the configured origin');
    const unavailable = () => new InfrastructureFailure(`OrgX ${input.operation} acknowledgement unavailable; retry the saved delivery with the same key`);
    let response: Response;
    try {
      const token = await this.credential(); if (!token || /[\r\n]/.test(token)) throw new Error('Credential unavailable');
      response = await this.fetcher(url.href, {
        method: input.method, redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${token}`, ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}) },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      });
    } catch { throw unavailable(); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 409) throw new Conflict(`OrgX ${input.operation} conflicts with the saved scope, version, or retry input. Preserve the delivery and reconcile its native receipt before preparing a new request.`);
      if ([400, 401, 403, 404, 422].includes(response.status)) throw new Blocked([{ code: 'orgx_delivery_rejected',
        detail: `OrgX ${input.operation} was rejected (HTTP ${response.status}).`,
        action: 'Check credentials, workspace access, work snapshot, and server contract. Preserve the saved delivery; do not remove its scope assertion or replace its retry key.' }]);
      throw unavailable();
    }
    try {
      if (!response.body) throw new Error('Response unavailable');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
          if (size > input.maximumBytes) throw new Error('Oversize response'); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => {}); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw unavailable(); }
  }
}
