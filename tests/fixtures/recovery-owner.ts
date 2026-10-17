import { readFileSync } from 'node:fs';
import { executeBundle } from '../../src/core/executor.ts';
import { LocalLedger } from '../../src/core/ledger.ts';
import { localScope } from '../../src/core/corpus.ts';
import { LocalProcessHost } from '../../src/hosts/local.ts';
const [bundlePath, stateDir, mode] = process.argv.slice(2);
const ledger = LocalLedger.open(stateDir!);
const originalFetch = globalThis.fetch;
if (mode === 'fixture') globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  if (init?.method === 'POST' && response.status >= 200 && response.status < 300) {
    process.send?.({ kind: 'acquired_before_ack', status: response.status });
    await new Promise(() => {});
  }
  return response;
};
await executeBundle({ bundle: JSON.parse(readFileSync(bundlePath!, 'utf8')), stateDir: stateDir!, ledger, scope: localScope(),
  hosts: { local: { async start(context) {
    const session = await new LocalProcessHost().start(context);
    if (mode === 'fixture') return session;
    // Real native acquisition completed, but the executor has not received or journaled its acknowledgement.
    process.send?.({ kind: 'acquired_before_ack', workspaceDir: context.workspaceDir });
    await new Promise(() => {});
    return session;
  } } },
});
