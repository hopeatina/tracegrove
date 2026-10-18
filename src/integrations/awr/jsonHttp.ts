import { InfrastructureFailure } from '../../core/errors.ts';
import { AwrDestination } from './contracts.ts';

/** Authenticated same-origin JSON only. Never persists credentials, raw responses or provider errors. */
export class OrgxJsonHttpClient {
  constructor(private readonly credential: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {}
  async request(input: { origin: string; path: string; method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string;
    maximumBytes: number; operation: 'import' | 'receipt readback' | 'artifact attachment' }): Promise<unknown> {
    const origin = AwrDestination.shape.origin.parse(input.origin); const url = new URL(input.path, origin);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new InfrastructureFailure('OrgX request must stay on the configured origin');
    try {
      const token = await this.credential(); if (!token || /[\r\n]/.test(token)) throw new Error('Credential unavailable');
      const response = await this.fetcher(url.href, {
        method: input.method, redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${token}`, ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}) },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Response unavailable'); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
          if (size > input.maximumBytes) throw new Error('Oversize response'); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => {}); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new InfrastructureFailure(`OrgX ${input.operation} acknowledgement unavailable; retry the saved delivery with the same key`); }
  }
}
