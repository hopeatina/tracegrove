import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalResultSink } from '../src/core/resultSink.ts';
import { LocalAwrOutbox } from '../src/integrations/awr/index.ts';
import { localScope } from '../src/core/corpus.ts';

const root = resolve(import.meta.dirname, '..'); const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function cli(args: string[]) {
  return spawnSync(process.execPath, process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled'
    ? [join(root, 'dist/cli/main.js'), ...args, '--json'] : ['--import', 'tsx', join(root, 'src/cli/main.ts'), ...args, '--json'],
  { cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, TRACEGROVE_ORGX_TOKEN: '' } });
}
it('freezes work before execution, then independently prepares and inspects attachment without network or completion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-cli-report-')); dirs.push(dir);
  const producer = join(dir, 'producer'); const sinkDir = join(dir, 'sink'); const requestFile = join(dir, 'request.json');
  const work = { workId: '00000000-0000-4000-8000-000000000003', requirementRefs: [
    { id: 'fixture-review-requirement', revision: '1', digest: { algorithm: 'sha256', hex: '1'.repeat(64) } },
  ] };
  const binding = join(dir, 'binding.json'); writeFileSync(binding, JSON.stringify(work));
  expect(cli(['sample-config', '--sample', 'notes-api', '--output', producer]).status).toBe(0);
  const planned = cli(['plan', '--config', join(producer, 'verification/workflow.yaml'), '--profile', 'offline-contract', '--purpose', 'work_proof', '--work-binding', binding, '--output', requestFile]);
  expect(planned.status, planned.stderr).toBe(0); expect(JSON.parse(readFileSync(requestFile, 'utf8')).request.workBinding).toEqual(work);
  const ran = cli(['run', '--request', requestFile, '--state-dir', join(dir, 'run-state')]); expect(ran.status, ran.stderr).toBe(0);
  const run = JSON.parse(ran.stdout); const ledger = LocalLedger.open(sinkDir); let id: string;
  try {
    const sink = new LocalResultSink(ledger, localScope(), { authorize: async () => {} }); id = (await sink.ingest(run.executionDir)).receipt.ref.id;
    const awr = new LocalAwrOutbox(ledger, sink, localScope(), { authorize: async () => {} });
    await awr.prepare(id, { origin: 'https://orgx.example', workspaceId: '00000000-0000-4000-8000-000000000001' });
    await awr.deliver(id, { import: async delivery => ({ ok: true, receipt_id: '00000000-0000-4000-8000-000000000002', external_receipt_id: delivery.receipt.receipt_id,
      schema_version: 'agent-work-receipt/v0.2', idempotent: false }) }); // Import admission is simulated, not live.
  } finally { ledger.close(); }
  const target = { entityType: 'task', entityId: work.workId, workspaceId: '00000000-0000-4000-8000-000000000001', expectedUpdatedAt: '2026-10-18T01:00:00.123456Z' };
  const targetFile = join(dir, 'target.json'); writeFileSync(targetFile, JSON.stringify(target));
  const prepared = cli(['report-prepare', '--sink', sinkDir, '--id', id, '--target', targetFile]); expect(prepared.status, prepared.stderr).toBe(0);
  const state = JSON.parse(prepared.stdout); expect(state.status).toBe('prepared'); expect(state.nativeAcceptance).toBe('not_requested');
  expect(state.prepared.payload).toMatchObject({ entity_id: work.workId, entity_type: 'task', status: 'in_review',
    expected_scope: { workspace_id: target.workspaceId, expected_updated_at: target.expectedUpdatedAt } });
  expect(JSON.parse(cli(['report-inspect', '--sink', sinkDir, '--id', id]).stdout)).toEqual(state);
  const journal = readFileSync(join(sinkDir, 'ledger/journal.jsonl'), 'utf8');
  const missing = cli(['report-attach', '--sink', sinkDir, '--id', id]); expect(missing.status).toBe(3); expect(missing.stderr).toContain('protected environment');
  expect(readFileSync(join(sinkDir, 'ledger/journal.jsonl'), 'utf8')).toBe(journal);
  writeFileSync(targetFile, JSON.stringify({ ...target, entityId: '00000000-0000-4000-8000-000000000004' }));
  expect(cli(['report-prepare', '--sink', sinkDir, '--id', id, '--target', targetFile]).status).toBe(2);
  expect(readFileSync(join(sinkDir, 'ledger/journal.jsonl'), 'utf8')).toBe(journal);
}, 60000);
