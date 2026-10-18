import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sampleCopy, planSample, cleanupTemps } from '../conformance/helpers.ts';
import { runTests } from '../src/authoring/run.ts';
import { inspectAttemptInventory, ATTEMPT_INVENTORY_LIMIT } from '../src/core/attemptInventory.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { VerifiedBundleSnapshot } from '../src/core/bundle.ts';
import { localScope } from '../src/core/corpus.ts';
import { AttemptInventoryReport } from '../src/protocol/index.ts';
import { registeredQualificationFixture } from './fixtures/registeredQualification.ts';
import { executeBundle } from '../src/core/executor.ts';
import { runCli } from './fixtures/cli.ts';
import { parseArgs } from '../src/cli/arguments.ts';

const roots: string[] = [], children: ChildProcess[] = [], ledgers: LocalLedger[] = [];
let sourceState: string, sourceRoot: string;
const scratch = () => { const root = mkdtempSync(join(tmpdir(), 'tracegrove-inventory-')); roots.push(root); return root; };
const copied = () => { const target = join(scratch(), 'state'); cpSync(sourceState, target, { recursive: true }); return target; };
const inspect = (stateDir: string) => inspectAttemptInventory({ stateDir, scope: localScope() });
const journal = (stateDir: string) => join(stateDir, 'ledger/journal.jsonl');
beforeAll(async () => {
  const sample = sampleCopy(); sourceRoot = sample.root; sourceState = join(sourceRoot, '.tracegrove/state');
  const configPath = join(sourceRoot, 'tracegrove.config.yaml');
  expect((await runTests({ configPath, grep: 'notes.list' })).report.outcome).toBe('passed');
  const flow = join(sourceRoot, 'tracegrove/notes/list.flow.yaml'); writeFileSync(flow, readFileSync(flow, 'utf8').replace('status: 200', 'status: 299'));
  expect((await runTests({ configPath, grep: 'notes.list' })).report.outcome).toBe('assertion_failed');
}, 60000);
afterEach(async () => {
  vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close();
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill('SIGKILL'); await ended; }
});
afterAll(() => { cleanupTemps(); for (const root of roots) rmSync(root, { recursive: true, force: true }); });

it('includes actual successful and failed admissions through the CLI without rewriting cached summaries or locks', () => {
  const state = copied(); const ledger = LocalLedger.open(state);
  try {
    for (const entry of JSON.parse(`[${readFileSync(journal(state), 'utf8').trim().split('\n').join(',')}]`)) if (entry.type === 'finalized') {
      const current = ledger.current(entry.aggregateId)!;
      ledger.append(entry.aggregateId, current.version, 'finalized', { ...current.data, summary: { outcome: 'passed', privateValue: 'PRIVATE_INVENTORY_SENTINEL' } });
    }
  } finally { ledger.close(); }
  const before = readFileSync(journal(state));
  const cli = runCli(['usage', '--state-dir', state]); expect(cli.status, cli.stderr).toBe(0);
  const report = AttemptInventoryReport.parse(JSON.parse(cli.stdout));
  expect(report).toMatchObject({ code: 'complete_inventory', evidenceComplete: true, actionAuthority: 'none', writerLock: 'absent', recordedUsageSubtotal: { receipts: 2 },
    recordedPricing: { estimatedSubtotalCents: null, reconciledSubtotalCents: null, unpricedEstimates: 2, unreconciledReceipts: 2 } });
  expect(report.attempts.map(attempt => attempt.outcome).sort()).toEqual(['assertion_failed', 'passed']);
  expect(report.timingPoints!.unknown).toBeGreaterThan(0); expect(report.timingPoints!.cold).toBe(0);
  expect(readFileSync(journal(state))).toEqual(before); expect(existsSync(join(state, 'ledger/lock.json'))).toBe(false);
  expect(cli.stdout).not.toContain('PRIVATE_INVENTORY_SENTINEL'); expect(cli.stdout).not.toContain(state);
});

it('keeps a real process-killed admission visible without recovering its writer lock or acquiring a host', async () => {
  const state = copied(); const input = join(scratch(), 'request.json'); writeFileSync(input, JSON.stringify(planSample(join(sourceRoot, 'verification/workflow.yaml'))));
  const child = fork(resolve('tests/fixtures/inventory-unsealed.ts'), [input, state], { cwd: resolve('.'), execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); children.push(child);
  const [message] = await once(child, 'message', { signal: AbortSignal.timeout(10000) }); expect(message.kind).toBe('admitted_before_host');
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  const before = readFileSync(journal(state)); const report = inspect(state);
  expect(report).toMatchObject({ code: 'partial_evidence', exitCode: 2, evidenceComplete: false, writerLock: 'present', recordedUsageSubtotal: { receipts: 2 } });
  expect(report.attempts).toHaveLength(3);
  expect(report.attempts.at(-1)).toMatchObject({ recordedPhase: 'admitted', status: 'bundle_unavailable', outcome: null, unresolvedResources: 1 });
  expect(readFileSync(journal(state))).toEqual(before); expect(existsSync(join(state, 'ledger/lock.json'))).toBe(true);
}, 20000);

it('includes qualification admissions and every registered cell allocation with their distinct IDs', async () => {
  const fixture = await registeredQualificationFixture(ledger => ledgers.push(ledger));
  const run = await executeBundle({ bundle: fixture.bundle, stateDir: fixture.root, ledger: fixture.ledger, scope: fixture.scope, qualification: fixture.owner });
  expect(run.outcome).toBe('passed');
  const report = inspectAttemptInventory({ stateDir: fixture.root, scope: fixture.scope });
  expect(report, JSON.stringify(report)).toMatchObject({ code: 'complete_inventory', evidenceComplete: true, writerLock: 'present', recordedUsageSubtotal: { receipts: 2 } });
  expect(report.attempts).toHaveLength(1); expect(report.attempts[0]!.kind).toBe('qualification');
  expect(new Set(report.attempts[0]!.cells!.map(cell => cell.executionId)).size).toBe(2);
});

it('preserves corrupt and malformed neighbors without presenting their absent usage as zero', () => {
  const state = copied(); const first = inspect(state).attempts[0]!;
  writeFileSync(join(state, 'executions', first.executionId!, 'campaign.json'), '{}');
  const ledger = LocalLedger.open(state); try { ledger.append('execution:invalid', 0, 'admitted', { privateValue: 'PRIVATE_INVENTORY_SENTINEL' }); } finally { ledger.close(); }
  const report = inspect(state); expect(report).toMatchObject({ code: 'partial_evidence', evidenceComplete: false, recordedUsageSubtotal: { receipts: 1 } });
  expect(report.attempts).toHaveLength(3); expect(report.attempts.map(row => row.status)).toContain('bundle_invalid');
  expect(report.attempts.at(-1)!.status).toBe('admission_invalid'); expect(JSON.stringify(report)).not.toContain('PRIVATE_INVENTORY_SENTINEL');
});

it('retains an older recorded binding when the current idempotency index points to a later attempt', () => {
  const state = copied();
  const first = JSON.parse(readFileSync(journal(state), 'utf8').trim().split('\n').find(line => JSON.parse(line).type === 'admitted')!);
  const ledger = LocalLedger.open(state); const key = `idempotency:${first.data.idempotencyKey}`;
  try { ledger.append(key, ledger.version(key), 'bound', { executionId: 'later-execution', attemptNumber: 2 }); }
  finally { ledger.close(); }
  const report = inspect(state);
  expect(report.attempts.find(row => row.executionId === first.data.executionId)!.status).toBe('finalized');
  expect(report.recordedUsageSubtotal!.receipts).toBe(2); expect(report.actionAuthority).toBe('none');
});

it('does not count copied duplicate admissions twice or expose another owner’s outcomes', () => {
  const state = copied(); const first = JSON.parse(readFileSync(journal(state), 'utf8').trim().split('\n').find(line => JSON.parse(line).type === 'admitted')!);
  const ledger = LocalLedger.open(state); try { ledger.append('execution:duplicate', 0, 'admitted', first.data); } finally { ledger.close(); }
  const report = inspect(state); expect(report.attempts.filter(row => row.status === 'duplicate_admission')).toHaveLength(2);
  expect(report.recordedUsageSubtotal!.receipts).toBe(1); expect(report.evidenceComplete).toBe(false);
  const foreign = inspectAttemptInventory({ stateDir: copied(), scope: { ...localScope(), ownerId: 'another-owner' } });
  expect(foreign.attempts.every(row => row.outcome === null && row.status === 'binding_invalid')).toBe(true);
  expect(foreign.recordedUsageSubtotal).toBeNull(); expect(foreign.recordedPricing).toBeNull();
});

it('refuses a changed checkpoint, truncation and inventory overflow without returning mixed subtotals', () => {
  const changing = copied(); const open = VerifiedBundleSnapshot.open;
  vi.spyOn(VerifiedBundleSnapshot, 'open').mockImplementation(dir => {
    const snapshot = open(dir); const ledger = LocalLedger.open(changing);
    try { ledger.append('observer-test', ledger.version('observer-test'), 'changed', {}); } finally { ledger.close(); }
    return snapshot;
  });
  expect(inspect(changing)).toMatchObject({ code: 'ledger_snapshot_changed', attempts: [], recordedUsageSubtotal: null }); vi.restoreAllMocks();
  const invalid = copied(); writeFileSync(journal(invalid), readFileSync(journal(invalid), 'utf8').trimEnd());
  expect(inspect(invalid)).toMatchObject({ code: 'ledger_snapshot_invalid', attempts: [], recordedUsageSubtotal: null });
  const overflow = copied(); const ledger = LocalLedger.open(overflow);
  try { for (let i = 0; i < ATTEMPT_INVENTORY_LIMIT; i++) ledger.append(`execution:extra-${i}`, 0, 'admitted', {}); } finally { ledger.close(); }
  expect(inspect(overflow)).toMatchObject({ code: 'inventory_limit_exceeded', attempts: [], recordedUsageSubtotal: null });
});

it('distinguishes an existing empty checkpoint from missing state and rejects effect flags before access', () => {
  const missing = join(scratch(), 'missing'); expect(inspect(missing)).toMatchObject({ code: 'ledger_snapshot_unavailable', recordedUsageSubtotal: null }); expect(existsSync(missing)).toBe(false);
  const empty = scratch(); mkdirSync(join(empty, 'ledger')); writeFileSync(journal(empty), '');
  expect(inspect(empty)).toMatchObject({ code: 'no_attempts', exitCode: 0, evidenceComplete: false, recordedUsageSubtotal: null });
  expect(() => parseArgs(['usage', '--state-dir', missing, '--recover'])).toThrow();
});
