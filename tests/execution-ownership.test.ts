import { afterEach, expect, it, vi } from 'vitest';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy, planSample, runSample, editFile, rematerializePayload } from '../conformance/helpers.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { ExecutionOwnership, assertInterruptedOwnershipResolved } from '../src/core/executionOwnership.ts';
import { executeBundle } from '../src/core/executor.ts';
import { digestOfBytes } from '../src/protocol/index.ts';
import { localScope } from '../src/core/corpus.ts';
import { HttpDriver } from '../src/adapters/http/driver.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
afterEach(cleanupTemps);
const binding = { executionId: 'exec', attemptId: 'attempt', generation: 1, campaignId: 'campaign', requestDigest: digestOfBytes('request').hex, scope: localScope() };
const ref = { id: 'plan', revision: '1', digest: digestOfBytes('plan') };
it('persists reservation before acknowledgement and requires observed cleanup before recovery', () => {
  const copy = sampleCopy(); let ledger = LocalLedger.open(copy.stateDir);
  const writer = new ExecutionOwnership(ledger, binding); writer.initialize(); writer.reserve('fixture', 'fixture', 'cell', ref);
  ledger.close(); ledger = LocalLedger.open(copy.stateDir);
  try {
    expect(() => assertInterruptedOwnershipResolved(ledger, binding)).toThrow('ownership_reconciliation_required');
    const recovered = new ExecutionOwnership(ledger, binding);
    expect(() => recovered.removed('fixture')).toThrow('ownership_cleanup_acknowledgement_invalid');
    recovered.observed('fixture', ['owned-id']); recovered.cleaning('fixture');
    expect(() => assertInterruptedOwnershipResolved(ledger, binding)).toThrow('ownership_reconciliation_required');
    recovered.removed('fixture'); expect(() => assertInterruptedOwnershipResolved(ledger, binding)).not.toThrow();
    expect(() => assertInterruptedOwnershipResolved(ledger, { ...binding, generation: 2 })).toThrow('ownership_binding_mismatch');
    expect(() => new ExecutionOwnership(ledger, { ...binding, scope: { ...binding.scope, ownerId: 'foreign' } }).reserve('another', 'host', 'cell', ref)).toThrow('ownership_binding_mismatch');
  } finally { ledger.close(); }
});
it('fails closed for legacy interrupted attempts without a durable inventory', () => {
  const copy = sampleCopy(); const ledger = LocalLedger.open(copy.stateDir);
  try { expect(() => assertInterruptedOwnershipResolved(ledger, binding)).toThrow('ownership_inventory_missing'); } finally { ledger.close(); }
});
it('integrates native and fixture acquisition and acknowledged cleanup into the actual executor ledger', async () => {
  const copy = sampleCopy(); const result = await runSample(planSample(copy.configPath), copy.stateDir);
  const ledger = LocalLedger.open(copy.stateDir);
  try {
    const history = ledger.history(`ownership:${result.executionId}`);
    const resources = ledger.current(`ownership:${result.executionId}`)!.data.resources as Array<{state: string; kind: string}>;
    expect(result.outcome).toBe('passed'); expect(resources.some(r => r.kind === 'fixture')).toBe(true);
    expect(resources.some(r => r.kind === 'host')).toBe(true); expect(resources.every(r => r.state === 'removed')).toBe(true);
    expect(history.map(r => r.type)).toContain('ownership.cleanup_pending');
    expect(JSON.stringify(history)).not.toMatch(/Bearer |tokenMap|credentialsEnv/);
  } finally { ledger.close(); }
}, 15000);
it.each(['host', 'fixture'])('blocks actual controller-crash redelivery after %s acquisition but before acknowledgement; never launches again', async mode => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath); const bundlePath = join(copy.root, 'frozen.json');
  writeFileSync(bundlePath, JSON.stringify(bundle));
  const owner = fork(new URL('./fixtures/recovery-owner.ts', import.meta.url), [bundlePath, copy.stateDir, mode], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let errors = ''; owner.stderr?.on('data', bytes => { errors += bytes.toString(); });
  try {
    const [message] = await Promise.race([once(owner, 'message'), once(owner, 'exit').then(() => { throw new Error(`owner exited before acquisition: ${errors}`); })]);
    expect(message.kind).toBe('acquired_before_ack');
    const exited = once(owner, 'exit'); owner.kill('SIGKILL'); await exited;
    const ledger = LocalLedger.open(copy.stateDir);
    const start = vi.fn(async () => { throw new Error('must not replay'); });
    try {
      await expect(executeBundle({ bundle, stateDir: copy.stateDir, ledger, scope: localScope(), hosts: { local: { start } } })).rejects.toThrow('ownership_reconciliation_required');
      expect(start).not.toHaveBeenCalled();
      const executionId = String(ledger.current(`idempotency:${bundle.request!.idempotencyKey}`)!.data.executionId);
      expect(ledger.history(`execution:${executionId}`).filter(r => r.type === 'admitted')).toHaveLength(1);
      const resources = ledger.current(`ownership:${executionId}`)!.data.resources as Array<{state: string}>;
      expect(resources.some(r => r.state === 'reserved')).toBe(true);
      expect(resources).toHaveLength(mode === 'host' ? 1 : 2);
    } finally { ledger.close(); }
  } finally { if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL'); }
}, 20000);

it('still stops the actual host and starts no fixture after ownership acknowledgement persistence fails', async () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath); const stop = vi.fn();
  const append = LocalLedger.prototype.append; let injected = false; let fixtureStarted = false;
  const fault = vi.spyOn(LocalLedger.prototype, 'append').mockImplementation(function (this: LocalLedger, ...args) {
    if (!injected && args[2] === 'ownership.observed') { injected = true; throw new Error('injected ownership acknowledgement write failure'); }
    return append.apply(this, args);
  });
  try {
    await expect(runSample(bundle, copy.stateDir, {
      onEvent(event) { if (event.kind === 'fixture.allocating') fixtureStarted = true; },
      hosts: { local: { async start(context) {
        const session = await new LocalProcessHost().start(context); const originalStop = session.stop;
        session.stop = async reason => { stop(); return originalStop(reason); }; return session;
      } } },
    })).rejects.toThrow('ownership_cleanup_not_observed');
    expect(injected).toBe(true); expect(stop).toHaveBeenCalledOnce(); expect(fixtureStarted).toBe(false);
    const ledger = LocalLedger.open(copy.stateDir);
    try {
      const executionId = String(ledger.current(`idempotency:${bundle.request!.idempotencyKey}`)!.data.executionId);
      expect(ledger.current(`ownership:${executionId}`)!.data.resources).toMatchObject([{ state: 'reserved' }]);
    } finally { ledger.close(); }
  } finally { fault.mockRestore(); }
}, 15000);

it.each(['host.process', 'host.workspace'])('does not discharge failed fixture cleanup named %s using the successful native host acknowledgement', async entityKey => {
  const copy = sampleCopy(root => {
    for (const path of ['verification/fixtures/existing-note.recipe.yaml', 'verification/cases/notes.create.yaml']) {
      editFile(join(root, path), text => text.replaceAll('existing_note', entityKey));
    }
  });
  rematerializePayload(copy.root); const bundle = planSample(copy.configPath);
  expect(bundle.blockers).toEqual([]);
  const original = HttpDriver.prototype.request;
  const fault = vi.spyOn(HttpDriver.prototype, 'request').mockImplementation(function (this: HttpDriver, request) {
    if (request.method === 'DELETE' && request.variables.title === 'Existing note') throw new Error('injected fixture cleanup failure');
    return original.call(this, request);
  });
  try {
    const result = await runSample(bundle, copy.stateDir); const cleanup = result.receipts[0]!.cleanup;
    expect(cleanup.remainingUnknownMutations).toBe(1); expect(cleanup.reasonCodes).toContain('fixture_cleanup_unconfirmed');
    // Legacy display-key overlap remains possible; it must never discharge typed ownership.
    expect(cleanup.confirmed).toContain(entityKey); expect(result.outcome).not.toBe('passed');
    const ledger = LocalLedger.open(copy.stateDir);
    try {
      const resources = ledger.current(`ownership:${result.executionId}`)!.data.resources as Array<{kind: string; state: string}>;
      expect(resources.find(r => r.kind === 'fixture')!.state).toBe('cleanup_pending');
      expect(resources.find(r => r.kind === 'host')!.state).toBe('removed');
    } finally { ledger.close(); }
  } finally { fault.mockRestore(); }
}, 15000);
