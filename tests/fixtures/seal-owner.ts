/** Stop only after the actual original bundle is committed and before its ledger finalization. */
import { readFileSync, writeFileSync } from 'node:fs';
import { executeBundle } from '../../src/core/executor.ts';
import { LocalLedger } from '../../src/core/ledger.ts';
import { localScope } from '../../src/core/corpus.ts';
import { verifyBundle } from '../../src/core/bundle.ts';
import { join } from 'node:path';

const [bundlePath, stateDir] = process.argv.slice(2);
const ledger = LocalLedger.open(stateDir!);
const append = ledger.append.bind(ledger);
ledger.append = (...args) => {
  if (args[2] === 'finalized' && args[0].startsWith('execution:')) {
    const executionId = args[0].slice('execution:'.length);
    const executionDir = join(stateDir!, 'executions', executionId);
    if (!verifyBundle(executionDir).ok) throw new Error('fixture reached finalization without a valid committed bundle');
    writeFileSync(join(stateDir!, 'seal-crash-window.json'), JSON.stringify({ kind: 'committed_before_ledger_finalized', executionId, executionDir }));
    // Actual controller death before the ledger write; owned application/fixtures already stopped.
    process.kill(process.pid, 'SIGKILL');
    throw new Error('unreachable');
  }
  return append(...args);
};
await executeBundle({ bundle: JSON.parse(readFileSync(bundlePath!, 'utf8')), stateDir: stateDir!, ledger, scope: localScope() });
