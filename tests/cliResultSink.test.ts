import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const root = resolve(import.meta.dirname, '..');
function cli(args: string[], owner?: string) {
  return spawnSync(process.execPath, process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled'
    ? [join(root, 'dist/cli/main.js'), ...args, '--json'] : ['--import', 'tsx', join(root, 'src/cli/main.ts'), ...args, '--json'],
  { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    env: { ...process.env, ...(owner ? { WORKFLOW_VERIFY_OWNER: owner } : {}) } });
}

it('independent CLI processes retain, deduplicate, inspect and refuse changed evidence after the producer directory is removed', () => {
  const path = mkdtempSync(join(tmpdir(), 'tracegrove-result-cli-')); roots.push(path);
  const producer = join(path, 'producer'); const sink = join(path, 'consumer');
  const generated = cli(['sample-config', '--sample', 'notes-api', '--output', producer]); expect(generated.status, generated.stderr).toBe(0);
  const executed = cli(['test', '--config', join(producer, 'tracegrove.config.yaml')]); expect(executed.status, executed.stderr).toBe(0);
  const run = JSON.parse(executed.stdout); expect(run.outcome).toBe('passed');
  const input = join(run.runDir, 'bundle');
  const foreign = cli(['result-ingest', '--bundle', input, '--sink', sink], 'different-result-owner'); expect(foreign.status).toBe(2);
  const imported = cli(['result-ingest', '--bundle', input, '--sink', sink]); expect(imported.status, imported.stderr).toBe(0);
  const result = JSON.parse(imported.stdout); expect(result.replayed).toBe(false); expect(result.receipt.qualificationStatus).toBe('not_evaluated');
  const duplicate = cli(['result-ingest', '--bundle', input, '--sink', sink]); expect(duplicate.status, duplicate.stderr).toBe(0);
  expect(JSON.parse(duplicate.stdout)).toMatchObject({ replayed: true, receipt: { ref: result.receipt.ref } });
  rmSync(producer, { recursive: true, force: true });
  const inspected = cli(['results', '--sink', sink, '--id', result.receipt.ref.id]); expect(inspected.status, inspected.stderr).toBe(0);
  expect(JSON.parse(inspected.stdout).verification).toMatchObject({ ok: true, outcome: 'passed' });
  const listed = cli(['results', '--sink', sink, '--limit', '1']); expect(listed.status).toBe(0);
  expect(JSON.parse(listed.stdout)).toMatchObject({ snapshotVersion: 1, archiveStatus: 'not_checked' });
  const journal = readFileSync(join(sink, 'ledger/journal.jsonl'), 'utf8');
  expect(cli(['results', '--sink', sink, '--id', result.receipt.ref.id, '--limit', '1']).status).toBe(2);
  expect(readFileSync(join(sink, 'ledger/journal.jsonl'), 'utf8')).toBe(journal);
  writeFileSync(join(result.bundleDir, 'campaign.json'), '{}');
  const corrupt = cli(['results', '--sink', sink, '--id', result.receipt.ref.id]); expect(corrupt.status).toBe(2);
  expect(JSON.parse(corrupt.stdout)).toMatchObject({ schemaVersion: 'tracegrove.cli-error/v1', errorClass: 'conflict' });
}, 60000); // Independent interpreter/CLI startups are part of the cross-process receipt proof.
