import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { localScope } from '../src/core/corpus.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalResultSink } from '../src/core/resultSink.ts';

const dirs: string[] = []; const root = resolve(import.meta.dirname, '..');
afterEach(() => { cleanupTemps(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function cli(args: string[]) {
  return spawnSync(process.execPath, process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled'
    ? [join(root, 'dist/cli/main.js'), ...args, '--json'] : ['--import', 'tsx', join(root, 'src/cli/main.ts'), ...args, '--json'],
  { cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, TRACEGROVE_ORGX_TOKEN: '' } });
}
it('independent CLI processes prepare, inspect and replay an immutable export without a credential or network call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-cli-awr-')); dirs.push(dir);
  const sinkDir = join(dir, 'sink'); const sample = sampleCopy();
  const run = await runSample(planSample(sample.configPath, 'offline-contract'), sample.stateDir);
  const ledger = LocalLedger.open(sinkDir); let id: string;
  try { id = (await new LocalResultSink(ledger, localScope(), { authorize: async () => {} }).ingest(run.executionDir)).receipt.ref.id; }
  finally { ledger.close(); }
  const destination = join(dir, 'destination.json'); writeFileSync(destination, JSON.stringify({ origin: 'https://orgx.example', workspaceId: '00000000-0000-4000-8000-000000000001' }));
  const prepared = cli(['awr-prepare', '--sink', sinkDir, '--id', id, '--destination', destination]); expect(prepared.status, prepared.stderr).toBe(0);
  const state = JSON.parse(prepared.stdout); expect(state.status).toBe('prepared'); expect(state.attempts).toBe(0);
  expect(JSON.parse(cli(['awr-prepare', '--sink', sinkDir, '--id', id, '--destination', destination]).stdout)).toEqual(state);
  expect(JSON.parse(cli(['awr-inspect', '--sink', sinkDir, '--id', id]).stdout)).toEqual(state);
  const journal = readFileSync(join(sinkDir, 'ledger/journal.jsonl'), 'utf8');
  const missing = cli(['awr-deliver', '--sink', sinkDir, '--id', id]); expect(missing.status).toBe(3); expect(JSON.parse(missing.stdout)).toMatchObject({ command: 'awr-deliver', exitCode: 3, reasons: [{ code: 'infrastructure_failure' }] });
  expect(readFileSync(join(sinkDir, 'ledger/journal.jsonl'), 'utf8')).toBe(journal);
  expect(cli(['awr-prepare', '--sink', sinkDir, '--id', id, '--destination', destination, '--credential-env', 'TOKEN']).status).toBe(2);
}, 60000);
