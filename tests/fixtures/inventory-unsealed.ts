import { readFileSync } from 'node:fs';
import { LocalLedger } from '../../src/core/ledger.ts';
import { executeBundle } from '../../src/core/executor.ts';
import { localScope } from '../../src/core/corpus.ts';
const [input, stateDir] = process.argv.slice(2);
const ledger = LocalLedger.open(stateDir!);
await executeBundle({ bundle: JSON.parse(readFileSync(input!, 'utf8')), stateDir: stateDir!, ledger, scope: localScope(),
  hosts: { local: { async start() {
    // Admission/reservation is durable, but no native application resource is acquired.
    process.send?.({ kind: 'admitted_before_host' });
    return new Promise<never>(() => {});
  } } },
});
