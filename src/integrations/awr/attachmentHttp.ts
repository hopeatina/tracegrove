import { PreparedReportAttachment } from './attachmentContracts.ts';
import type { ReportAttachmentTransport } from './attachment.ts';
import { OrgxJsonHttpClient } from './jsonHttp.ts';

/** Existing workspace receipt readback plus canonical artifact creation; no completion route. */
export class OrgxReportAttachmentHttpTransport implements ReportAttachmentTransport {
  private readonly client: OrgxJsonHttpClient;
  constructor(credential: () => Promise<string>, fetcher: typeof fetch = fetch) { this.client = new OrgxJsonHttpClient(credential, fetcher); }
  async readReceipt(raw: PreparedReportAttachment): Promise<unknown> {
    const intent = PreparedReportAttachment.parse(raw);
    return this.client.request({ origin: intent.destination.origin,
      path: `/api/v1/work-ledger/receipts/${intent.hostedReceiptId}?workspace_id=${intent.destination.workspaceId}`,
      method: 'GET', maximumBytes: 1_048_576, operation: 'receipt readback' });
  }
  async attach(raw: PreparedReportAttachment): Promise<unknown> {
    const intent = PreparedReportAttachment.parse(raw);
    return this.client.request({ origin: intent.destination.origin, path: '/api/v1/artifacts',
      method: 'POST', body: intent.payload, idempotencyKey: intent.idempotencyKey, maximumBytes: 32_768, operation: 'artifact attachment' });
  }
}
