import { InfrastructureFailure } from '../../core/errors.ts';
import { AwrAcknowledgement, PreparedAwrDelivery, checkedAwrDocument } from './contracts.ts';
import type { AwrTransport } from './outbox.ts';

/** Credential callback is invoked only at delivery; secrets never enter the journal. */
export class OrgxAwrHttpTransport implements AwrTransport {
  constructor(private readonly credential: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {}
  async import(delivery: PreparedAwrDelivery): Promise<unknown> {
    delivery = PreparedAwrDelivery.parse(delivery); checkedAwrDocument(delivery.receipt);
    try {
      const token = await this.credential();
      if (!token || /[\r\n]/.test(token)) throw new Error('Credential unavailable');
      const response = await this.fetcher(`${delivery.destination.origin}/api/v1/agent-work-receipts`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ workspace_id: delivery.destination.workspaceId, receipt: delivery.receipt, idempotency_key: delivery.idempotencyKey }),
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Import not acknowledged'); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
          if (size > 32_768) throw new Error('Oversize import response'); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => {}); }
      return AwrAcknowledgement.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch { throw new InfrastructureFailure('OrgX import acknowledgement unavailable; retry the saved delivery with the same key'); }
  }
}
