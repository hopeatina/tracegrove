import { execFileSync, fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { CliErrorReport, RecoveryStatusReport } from '../src/protocol/index.ts';
import { localScope } from '../src/core/corpus.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { inspectLedger, LEDGER_INSPECTION_LIMITS } from '../src/core/ledgerInspection.ts';
import { inspectRecoveryStatus } from '../src/core/recoveryStatus.ts';
import { startController } from '../src/core/controller.ts';
import { parseJournal } from '../src/core/ledgerRecords.ts';
import * as bounded from '../src/core/boundedFile.ts';
import * as bundles from '../src/core/bundle.ts';

const privateText = 'PRIVATE_RECOVERY_VALUE_6fb4';
const roots: string[] = [];
let original: Awaited<ReturnType<typeof runSample>>; let sourceState: string; let projectRoot: string;
function scratch() { const root = mkdtempSync(join(tmpdir(), 'tracegrove-recovery-status-')); roots.push(root); return root; }
function copyState() { const root = scratch(); const state = join(root, 'state'); cpSync(sourceState, state, { recursive: true }); return state; }
const journal = (state: string) => join(state, 'ledger/journal.jsonl');
function status(state: string, executionId = original.executionId) { return inspectRecoveryStatus({ stateDir: state, executionId, scope: localScope() }); }
function mutate(state: string, aggregate: string, edit: (data: Record<string, unknown>) => Record<string, unknown>, type?: string) {
  const ledger = LocalLedger.open(state);
  try { const row = ledger.current(aggregate)!; ledger.append(aggregate, row.version, type ?? row.type, edit(row.data)); }
  finally { ledger.close(); }
}
function childStatus(state: string) {
  const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'),
    'recovery-status', '--state-dir', state, '--execution', original.executionId, '--json'], { encoding: 'utf8', timeout: 20000 });
  expect(child.error).toBeUndefined(); expect(child.stderr).toBe('');
  const report = RecoveryStatusReport.parse(JSON.parse(child.stdout)); expect(child.status).toBe(report.exitCode);
  return report;
}
beforeAll(async () => {
  const copy = sampleCopy(); sourceState = copy.stateDir; const bundle = planSample(copy.configPath); projectRoot = bundle.projectRoot;
  original = await runSample(bundle, copy.stateDir); expect(original.outcome).toBe('passed');
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => { cleanupTemps(); for (const root of roots) rmSync(root, { recursive: true, force: true }); });

it('inspects actual committed native evidence through the CLI without leaking private inventory or cached summaries', () => {
  const state = copyState();
  mutate(state, `ownership:${original.executionId}`, data => {
    const resources = data.resources as Array<{ physicalIds: string[] }>;
    resources[0]!.physicalIds = [privateText]; return data;
  });
  mutate(state, `execution:${original.executionId}`, data => ({ ...data, summary: { outcome: 'assertion_failed', privateText } }));
  const before = readFileSync(journal(state));
  const report = childStatus(state);
  expect(report).toMatchObject({ code: 'finalized_evidence_verified', exitCode: 0, historicalOutcome: 'passed', bundle: 'verified_bound',
    writerLock: 'absent', actionAuthority: 'none', execution: 'not_started_by_inspection', verificationVerdict: 'not_evaluated' });
  expect(report.resources!.host.removed).toBeGreaterThan(0); expect(report.resources!.fixture.removed).toBeGreaterThan(0);
  expect(JSON.stringify(report)).not.toContain(privateText); expect(JSON.stringify(report)).not.toContain(state);
  expect(readFileSync(journal(state))).toEqual(before); expect(existsSync(join(state, 'ledger/lock.json'))).toBe(false);
});

it('reads a live controller checkpoint without writer acquisition, PID probes, new writes or token disclosure', async () => {
  const state = copyState(); const controller = await startController(state, projectRoot);
  try {
    const files = readdirSync(join(state, 'ledger')).sort();
    const before = Object.fromEntries(files.map(name => [name, readFileSync(join(state, 'ledger', name))]));
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('PID probing is forbidden'); });
    const report = status(state); expect(report.code).toBe('finalized_evidence_verified'); expect(kill).not.toHaveBeenCalled();
    kill.mockRestore();
    expect(childStatus(state).writerLock).toBe('present');
    expect(readdirSync(join(state, 'ledger')).sort()).toEqual(files);
    for (const name of files) expect(readFileSync(join(state, 'ledger', name))).toEqual(before[name]);
    expect(JSON.stringify(report)).not.toContain(readFileSync(join(state, 'ledger/controller.token'), 'utf8'));
  } finally { await controller.close(); }
});

it('keeps unresolved, foreign and missing inventories explicit without discharging resources', () => {
  const state = copyState(); const owner = `ownership:${original.executionId}`;
  mutate(state, owner, data => { (data.resources as Array<{ state: string }>)[0]!.state = 'cleanup_pending'; return data; });
  expect(status(state)).toMatchObject({ code: 'ownership_unresolved', exitCode: 2, historicalOutcome: 'passed', bundle: 'verified_bound' });
  mutate(state, `execution:${original.executionId}`, () => ({ reason: 'test interrupted fixture' }), 'interrupted');
  const before = readFileSync(journal(state));
  expect(status(state)).toMatchObject({ code: 'ownership_unresolved', exitCode: 2, bundle: 'not_checked', resources: { host: { cleanup_pending: 1 } } });
  const foreign = inspectRecoveryStatus({ stateDir: state, executionId: original.executionId, scope: { ...localScope(), ownerId: 'foreign' } });
  expect(foreign).toMatchObject({ code: 'ownership_invalid', resources: null });
  expect(readFileSync(journal(state))).toEqual(before);
  const missing = scratch(); const ledger = LocalLedger.open(missing);
  try { ledger.append(`execution:${original.executionId}`, 0, 'admitted', { requestDigest: 'a'.repeat(64), attemptId: 'test', generation: 1, attemptNumber: 1 }); }
  finally { ledger.close(); }
  expect(status(missing)).toMatchObject({ code: 'ownership_missing', exitCode: 2 });
});

it('keeps an interrupted unsealed attempt distinct from committed readback and never creates a manifest', () => {
  const state = copyState(); mutate(state, `execution:${original.executionId}`, () => ({}), 'interrupted');
  const manifest = join(state, 'executions', original.executionId, 'manifest.json'); rmSync(manifest);
  const before = readFileSync(journal(state));
  expect(status(state)).toMatchObject({ code: 'interrupted_without_manifest', exitCode: 2, bundle: 'absent', historicalOutcome: null });
  expect(readFileSync(journal(state))).toEqual(before); expect(existsSync(manifest)).toBe(false);
});

it('does not call stale-controller exit a recovered transition; reads a real crash only after normal writer reconciliation', async () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath); const file = join(copy.root, 'frozen.json'); writeFileSync(file, JSON.stringify(bundle));
  const owner = fork(new URL('./fixtures/seal-owner.ts', import.meta.url), [file, copy.stateDir], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    const [, signal] = await once(owner, 'exit'); expect(signal).toBe('SIGKILL');
    const executionId = JSON.parse(readFileSync(join(copy.stateDir, 'seal-crash-window.json'), 'utf8')).executionId as string;
    const before = readFileSync(journal(copy.stateDir)); const lock = readFileSync(join(copy.stateDir, 'ledger/lock.json'));
    expect(status(copy.stateDir, executionId)).toMatchObject({ code: 'execution_in_flight', writerLock: 'present' });
    expect(readFileSync(journal(copy.stateDir))).toEqual(before); expect(readFileSync(join(copy.stateDir, 'ledger/lock.json'))).toEqual(lock);
    // Explicit test setup invokes the existing writer recovery; inspection itself never does.
    const ledger = LocalLedger.open(copy.stateDir); ledger.close(); const recovered = readFileSync(journal(copy.stateDir));
    expect(status(copy.stateDir, executionId)).toMatchObject({ code: 'committed_readback_available', exitCode: 0, recordedPhase: 'interrupted', bundle: 'verified_bound', historicalOutcome: 'passed' });
    expect(readFileSync(journal(copy.stateDir))).toEqual(recovered);
  } finally { if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL'); }
}, 20000);

it.each(['corrupt', 'foreign', 'wrong_campaign', 'wrong_idempotency'] as const)('refuses %s evidence bindings without new effects', async mode => {
  const state = copyState(); const execution = join(state, 'executions', original.executionId);
  if (mode === 'corrupt') writeFileSync(join(execution, 'campaign.json'), '{}');
  if (mode === 'foreign') {
    const other = sampleCopy(); const result = await runSample(planSample(other.configPath), other.stateDir);
    rmSync(execution, { recursive: true }); cpSync(result.executionDir, execution, { recursive: true });
  }
  if (mode === 'wrong_campaign') mutate(state, `ownership:${original.executionId}`, data => {
    (data.binding as { campaignId: string }).campaignId = 'foreign_campaign'; return data;
  });
  if (mode === 'wrong_idempotency') {
    const request = bundles.readVerifiedBundle(execution).request;
    mutate(state, `idempotency:${request.idempotencyKey}`, data => ({ ...data, executionId: 'foreign_execution' }));
  }
  const before = readFileSync(journal(state));
  expect(status(state)).toMatchObject({ code: mode === 'corrupt' ? 'committed_evidence_invalid' : 'committed_binding_mismatch', exitCode: 2, bundle: 'invalid', historicalOutcome: null });
  expect(readFileSync(journal(state))).toEqual(before);
});

it.each(['partial', 'invalid_json', 'invalid_utf8', 'utf8_bom', 'noncontiguous'] as const)('never projects a clear state from a %s journal', mode => {
  const state = copyState(); const file = journal(state);
  if (mode === 'partial') appendFileSync(file, '{');
  if (mode === 'invalid_json') appendFileSync(file, `${privateText}\n`);
  if (mode === 'invalid_utf8') appendFileSync(file, Buffer.from([255, 10]));
  if (mode === 'utf8_bom') writeFileSync(file, Buffer.concat([Buffer.from([239, 187, 191]), readFileSync(file)]));
  if (mode === 'noncontiguous') writeFileSync(file, readFileSync(file, 'utf8').replace('"seq":1,', '"seq":2,'));
  const before = readFileSync(file); const report = status(state);
  expect(report).toMatchObject({ code: 'ledger_snapshot_invalid', resources: null, checkpoint: null, historicalOutcome: null, exitCode: 2 });
  expect(JSON.stringify(report)).not.toContain(privateText); expect(readFileSync(file)).toEqual(before);
});

it.each(['journal_link', 'parent_link', 'oversize', 'fifo'] as const)('refuses unsafe or unbounded snapshot input: %s', mode => {
  let state = copyState(); const file = journal(state);
  if (mode === 'journal_link') { rmSync(file); const outside = join(scratch(), 'private'); writeFileSync(outside, privateText); symlinkSync(outside, file); }
  if (mode === 'parent_link') { const alias = join(scratch(), 'linked-state'); symlinkSync(state, alias); state = alias; }
  if (mode === 'oversize') truncateSync(file, LEDGER_INSPECTION_LIMITS.journalBytes + 1);
  if (mode === 'fifo') { rmSync(file); execFileSync('mkfifo', [file]); }
  const began = performance.now();
  expect(status(state)).toMatchObject({ code: 'ledger_snapshot_unavailable', resources: null, checkpoint: null, exitCode: 2 });
  expect(performance.now() - began).toBeLessThan(2000);
  expect(existsSync(join(state, 'ledger/acquire.lock'))).toBe(false); expect(existsSync(join(state, 'ledger/lock.json'))).toBe(false);
});

it('detects journal and lock changes without projecting a stale clear disposition', () => {
  const state = copyState(); const view = inspectLedger(state); appendFileSync(journal(state), '\n');
  expect(() => view.assertUnchanged()).toThrow('ledger_snapshot_changed');
  const stable = inspectLedger(state); writeFileSync(join(state, 'ledger/lock.json'), privateText);
  expect(() => stable.assertUnchanged()).toThrow('ledger_snapshot_changed');
});

it('bounds parsed records and rejects actor overrides before reading even a nonexistent directory', () => {
  const line = (seq: number) => `${JSON.stringify({ seq, at: '2026-10-17T00:00:00Z', aggregateId: 'test', version: seq, type: 'test', data: {} })}\n`;
  expect(() => parseJournal(line(1) + line(2) + line(3), 2)).toThrow('ledger record limit exceeded');
  const missing = join(scratch(), 'missing');
  const traversal = status(missing, `../${privateText}`);
  expect(traversal).toMatchObject({ code: 'execution_binding_invalid', resources: null, checkpoint: null });
  expect(JSON.stringify(traversal)).not.toContain(privateText);
  const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'),
    'recovery-status', '--state-dir', missing, '--execution', 'test', '--actor', privateText, '--json'], { encoding: 'utf8', timeout: 20000 });
  expect(child.status).toBe(2); expect(child.stderr).toBe(''); expect(child.stdout).not.toContain(privateText);
  expect(CliErrorReport.parse(JSON.parse(child.stdout))).toMatchObject({ command: 'recovery-status', reasons: [{ code: 'unknown_flag' }] });
  expect(existsSync(missing)).toBe(false);
});

it('rejects a journal append during initial capture and during committed bundle verification', () => {
  const state = copyState(); const read = bounded.readBoundedFile; let first = true;
  const spy = vi.spyOn(bounded, 'readBoundedFile').mockImplementation((path, max, expected) => {
    const bytes = read(path, max, expected);
    if (path === journal(state) && first) { first = false; appendFileSync(path, '\n'); }
    return bytes;
  });
  expect(status(state)).toMatchObject({ code: 'ledger_snapshot_changed', checkpoint: null, resources: null }); spy.mockRestore();
  const verify = bundles.readVerifiedBundle;
  vi.spyOn(bundles, 'readVerifiedBundle').mockImplementation(dir => { const checked = verify(dir); appendFileSync(journal(state), '\n'); return checked; });
  expect(status(state)).toMatchObject({ code: 'ledger_snapshot_changed', checkpoint: null, resources: null, historicalOutcome: null });
});
