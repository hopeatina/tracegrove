import { InfrastructureFailure } from '../../core/errors.ts';
import { AwrAcknowledgement, PreparedAwrDelivery, checkedAwrDocument } from './contracts.ts';
import type { AwrTransport } from './outbox.ts';
import { OrgxJsonHttpClient } from './jsonHttp.ts';

/** Credential callback is invoked only at delivery; secrets never enter the journal. */
export class OrgxAwrHttpTransport implements AwrTransport {
  private readonly client: OrgxJsonHttpClient;
  constructor(credential: () => Promise<string>, fetcher: typeof fetch = fetch) { this.client = new OrgxJsonHttpClient(credential, fetcher); }
  async import(delivery: PreparedAwrDelivery): Promise<unknown> {
    delivery = PreparedAwrDelivery.parse(delivery); checkedAwrDocument(delivery.receipt);
    try {
      const response = await this.client.request({ origin: delivery.destination.origin, path: '/api/v1/agent-work-receipts',
        method: 'POST', maximumBytes: 32_768, operation: 'import',
        body: { workspace_id: delivery.destination.workspaceId, receipt: delivery.receipt, idempotency_key: delivery.idempotencyKey },
      });
      return AwrAcknowledgement.parse(response);
    } catch { throw new InfrastructureFailure('OrgX import acknowledgement unavailable; retry the saved delivery with the same key'); }
  }
}
