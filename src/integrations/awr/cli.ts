import { resolve } from 'node:path';
import { LocalLedger } from '../../core/ledger.ts';
import { LocalResultSink } from '../../core/resultSink.ts';
import { localScope } from '../../core/corpus.ts';
import { Conflict, InfrastructureFailure } from '../../core/errors.ts';
import { readConfigurationJson } from '../../cli/jsonFile.ts';
import { AwrDestination, LocalAwrOutbox, OrgxAwrHttpTransport, LocalReportAttachmentOutbox, ReportWorkTarget, OrgxReportAttachmentHttpTransport } from './index.ts';

export async function runAwrCommand(command: 'awr-prepare' | 'awr-inspect' | 'awr-deliver' | 'report-prepare' | 'report-inspect' | 'report-attach',
  flags: { sink: string; id: string; destination?: string | undefined; target?: string | undefined; 'credential-env'?: string | undefined }) {
  const destination = flags.destination ? AwrDestination.parse(readConfigurationJson(flags.destination, 8192)) : null;
  const target = flags.target ? ReportWorkTarget.parse(readConfigurationJson(flags.target, 8192)) : null;
  const credentialName = flags['credential-env'] ?? 'TRACEGROVE_ORGX_TOKEN';
  if ((command === 'awr-deliver' || command === 'report-attach') && !process.env[credentialName]) throw new InfrastructureFailure(`Set ${credentialName} through a protected environment before delivery`);
  const scope = localScope(); const ledger = LocalLedger.open(resolve(flags.sink));
  try {
    // Local operator owns the saved intent. The authenticated importer independently checks workspace access.
    const sink = new LocalResultSink(ledger, scope, { authorize: async () => {} });
    const outbox = new LocalAwrOutbox(ledger, sink, scope, { authorize: async () => {} });
    const reports = new LocalReportAttachmentOutbox(ledger, sink, outbox, scope, { authorize: async () => {} });
    if (command === 'report-prepare') {
      if (!target) throw new Conflict('Report target configuration required');
      return await reports.prepare(flags.id, target);
    }
    if (command === 'report-inspect') return await reports.inspect(flags.id);
    if (command === 'report-attach') return await reports.deliver(flags.id, new OrgxReportAttachmentHttpTransport(async () => process.env[credentialName] ?? ''));
    if (command === 'awr-prepare') {
      if (!destination) throw new Conflict('Destination configuration required');
      return await outbox.prepare(flags.id, destination);
    }
    if (command === 'awr-inspect') return await outbox.inspect(flags.id);
    return await outbox.deliver(flags.id, new OrgxAwrHttpTransport(async () => process.env[credentialName] ?? ''));
  } finally { ledger.close(); }
}
