import { LocalLedger } from '../../src/core/ledger.ts';
import { LocalResultSink } from '../../src/core/resultSink.ts';
import { localScope } from '../../src/core/corpus.ts';

const ledger = LocalLedger.open(process.argv[3]!);
const append = ledger.append.bind(ledger);
ledger.append = (...args) => {
  if (args[2] === 'workflow.result.accepted') process.kill(process.pid, 'SIGKILL');
  return append(...args);
};
await new LocalResultSink(ledger, localScope(), { authorize: async () => {} }).ingest(process.argv[2]!);
throw new Error('Controlled crash did not run');
