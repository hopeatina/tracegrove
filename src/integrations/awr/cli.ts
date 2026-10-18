import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalLedger } from '../../core/ledger.ts';
import { LocalResultSink } from '../../core/resultSink.ts';
import { localScope } from '../../core/corpus.ts';
import { Conflict, InfrastructureFailure } from '../../core/errors.ts';
import { AwrDestination, LocalAwrOutbox, OrgxAwrHttpTransport } from './index.ts';

export async function runAwrCommand(command: 'awr-prepare' | 'awr-inspect' | 'awr-deliver', flags: { sink: string; id: string; destination?: string | undefined; 'credential-env'?: string | undefined }) {
  const destination = flags.destination ? (() => {
    const file = resolve(flags.destination!);
    if (statSync(file).size > 8192) throw new Conflict('Destination configuration exceeds 8192 bytes');
    return AwrDestination.parse(JSON.parse(readFileSync(file, 'utf8')));
  })() : null;
  const credentialName = flags['credential-env'] ?? 'TRACEGROVE_ORGX_TOKEN';
  if (command === 'awr-deliver' && !process.env[credentialName]) throw new InfrastructureFailure(`Set ${credentialName} through a protected environment before delivery`);
  const scope = localScope(); const ledger = LocalLedger.open(resolve(flags.sink));
  try {
    // Local operator owns the saved intent. The authenticated importer independently checks workspace access.
    const sink = new LocalResultSink(ledger, scope, { authorize: async () => {} });
    const outbox = new LocalAwrOutbox(ledger, sink, scope, { authorize: async () => {} });
    if (command === 'awr-prepare') {
      if (!destination) throw new Conflict('Destination configuration required');
      return await outbox.prepare(flags.id, destination);
    }
    if (command === 'awr-inspect') return await outbox.inspect(flags.id);
    return await outbox.deliver(flags.id, new OrgxAwrHttpTransport(async () => process.env[credentialName] ?? ''));
  } finally { ledger.close(); }
}
