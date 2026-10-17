import { fork } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { localScope } from '../src/core/corpus.ts';
import { executeBundle } from '../src/core/executor.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import * as files from '../src/core/atomicFiles.ts';

afterEach(() => { vi.restoreAllMocks(); cleanupTemps(); });
async function crashed() {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath);
  const bundlePath = join(copy.root, 'frozen.json'); writeFileSync(bundlePath, JSON.stringify(bundle));
  const owner = fork(new URL('./fixtures/seal-owner.ts', import.meta.url), [bundlePath, copy.stateDir], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let errors = ''; owner.stderr?.on('data', bytes => { errors += bytes.toString(); });
  try {
    const [, signal] = await once(owner, 'exit');
    expect(signal, errors).toBe('SIGKILL');
    const message = JSON.parse(readFileSync(join(copy.stateDir, 'seal-crash-window.json'), 'utf8'));
    expect(message.kind).toBe('committed_before_ledger_finalized');
    return { ...copy, bundle, executionId: String(message.executionId), executionDir: String(message.executionDir) };
  } finally { if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL'); }
}

it('recovers a fully verified source commit after actual controller SIGKILL without another acquisition', async () => {
  const copy = await crashed(); expect(verifyBundle(copy.executionDir).ok).toBe(true);
  const ledger = LocalLedger.open(copy.stateDir); const start = vi.fn(async () => { throw new Error('must not acquire again'); });
  try {
    expect(ledger.current(`execution:${copy.executionId}`)!.type).toBe('interrupted');
    const recovered = await executeBundle({ bundle: copy.bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } });
    expect(recovered).toMatchObject({ executionId: copy.executionId, redelivered: true, outcome: 'passed', exitCode: 0 });
    expect(recovered.receipts).not.toHaveLength(0); expect(start).not.toHaveBeenCalled();
    expect(ledger.current(`execution:${copy.executionId}`)!.data.recoveredFromCommittedBundle).toBe(true);
    expect(ledger.history(`execution:${copy.executionId}`).filter(row => row.type === 'admitted')).toHaveLength(1);
    const again = await executeBundle({ bundle: copy.bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } });
    expect(again.receipts).toEqual(recovered.receipts); expect(start).not.toHaveBeenCalled();
  } finally { ledger.close(); }
}, 20000);

it('does not recover a committed bundle before unresolved ownership is reconciled', async () => {
  const copy = await crashed(); const ledger = LocalLedger.open(copy.stateDir);
  const start = vi.fn(async () => { throw new Error('must not acquire again'); });
  try {
    const row = ledger.current(`ownership:${copy.executionId}`)!;
    const data = structuredClone(row.data); (data.resources as Array<{ state: string }>)[0]!.state = 'cleanup_pending';
    ledger.append(row.aggregateId, row.version, 'test.unresolved', data);
    await expect(executeBundle({ bundle: copy.bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } })).rejects.toThrow('ownership_reconciliation_required');
    expect(start).not.toHaveBeenCalled(); expect(ledger.current(`execution:${copy.executionId}`)!.type).toBe('interrupted');
  } finally { ledger.close(); }
}, 20000);

it('refuses a corrupt committed bundle after the commit-window crash without replay', async () => {
  const copy = await crashed(); writeFileSync(join(copy.executionDir, 'campaign.json'), '{}');
  const ledger = LocalLedger.open(copy.stateDir); const start = vi.fn(async () => { throw new Error('must not acquire again'); });
  try {
    await expect(executeBundle({ bundle: copy.bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } })).rejects.toThrow('committed_execution_evidence_invalid');
    expect(start).not.toHaveBeenCalled(); expect(ledger.current(`execution:${copy.executionId}`)!.type).toBe('interrupted');
  } finally { ledger.close(); }
}, 20000);

it('does not finalize recovered evidence when its commit directory cannot be synced', async () => {
  const copy = await crashed(); const ledger = LocalLedger.open(copy.stateDir);
  const start = vi.fn(async () => { throw new Error('must not acquire again'); });
  const sync = files.syncDirectory;
  vi.spyOn(files, 'syncDirectory').mockImplementation(path => { if (path === copy.executionDir) throw new Error('injected recovery fsync failure'); sync(path); });
  try {
    await expect(executeBundle({ bundle: copy.bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } })).rejects.toThrow('committed_execution_durability_unconfirmed');
    expect(start).not.toHaveBeenCalled(); expect(ledger.current(`execution:${copy.executionId}`)!.type).toBe('interrupted');
    expect(verifyBundle(copy.executionDir).ok).toBe(true);
  } finally { ledger.close(); }
}, 20000);

it.each(['missing', 'corrupt', 'foreign'])('fails closed for finalized redelivery with %s evidence and never trusts its cached summary', async mode => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath); const original = await runSample(bundle, copy.stateDir);
  if (mode === 'missing') rmSync(join(original.executionDir, 'manifest.json'));
  if (mode === 'corrupt') writeFileSync(join(original.executionDir, 'campaign.json'), '{}');
  if (mode === 'foreign') {
    const other = sampleCopy(); const second = await runSample(planSample(other.configPath), other.stateDir);
    rmSync(original.executionDir, { recursive: true }); cpSync(second.executionDir, original.executionDir, { recursive: true });
  }
  const ledger = LocalLedger.open(copy.stateDir); const start = vi.fn(async () => { throw new Error('must not acquire again'); });
  try {
    await expect(executeBundle({ bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } })).rejects.toThrow(mode === 'foreign' ? 'committed_execution_binding_mismatch' : 'committed_execution_evidence_invalid');
    expect(start).not.toHaveBeenCalled();
    expect(ledger.history(`execution:${original.executionId}`).filter(row => row.type === 'admitted')).toHaveLength(1);
  } finally { ledger.close(); }
}, 20000);

it('restores verified receipts and derives exit status despite a false cached finalized summary', async () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath); const original = await runSample(bundle, copy.stateDir);
  const ledger = LocalLedger.open(copy.stateDir); const start = vi.fn(async () => { throw new Error('must not acquire again'); });
  try {
    const row = ledger.current(`execution:${original.executionId}`)!;
    ledger.append(row.aggregateId, row.version, row.type, { ...row.data, summary: { outcome: 'assertion_failed', exitCode: 1, receipts: [] } });
    const restored = await executeBundle({ bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } });
    expect(restored).toMatchObject({ outcome: 'passed', exitCode: 0, executionId: original.executionId, redelivered: true });
    expect(restored.receipts).toEqual(original.receipts); expect(start).not.toHaveBeenCalled();
    expect(JSON.stringify(restored.receipts)).not.toMatch(/Bearer /);
  } finally { ledger.close(); }
});
