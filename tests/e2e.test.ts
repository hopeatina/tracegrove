import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { executeBundle } from '../src/core/executor.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { verifyBundle } from '../src/core/bundle.ts';

const SAMPLE = join(import.meta.dirname, '..', 'src', 'samples', 'notes-api', 'verification', 'workflow.yaml');
const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function stateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-'));
  temps.push(dir);
  return dir;
}

describe('end to end', () => {
  it('runs the real notes case: launch, seed, steps, cleanup, sealed receipt, verifiable bundle', async () => {
    const project = loadProject(SAMPLE);
    const bundle = plan({ project, profileName: 'native-real', scope: localScope() });
    expect(bundle.blockers).toEqual([]);
    const dir = stateDir();
    const ledger = LocalLedger.open(dir);
    const events: string[] = [];
    try {
      const summary = await executeBundle({ bundle, stateDir: dir, ledger, scope: localScope(), onEvent: (e) => events.push(e.kind) });
      expect(summary.reasonCodes).toEqual([]);
      expect(summary.outcome).toBe('passed');
      expect(summary.exitCode).toBe(0);
      const receipt = summary.receipts[0]!;
      expect(receipt.steps.map((s) => `${s.stepId}:${s.result}`)).toEqual(['create:completed', 'read_back:completed', 'intruder_read:completed', 'delete:completed', 'confirm_absent:completed', 'existing_intact:completed']);
      expect(receipt.assertions.every((a) => a.result === 'pass')).toBe(true);
      expect(receipt.environment.observed?.components[0]?.identity).toEqual(receipt.environment.expected.components[0]?.identity);
      expect(receipt.cleanup.confirmed).toContain('existing_note');
      expect(receipt.cleanup.confirmed).toContain('host.process');
      expect(receipt.proofEligible).toBe(true);
      expect(events).toContain('fixture.readback');
      // Credentials never appear in events or the receipt.
      const serialized = JSON.stringify(summary.receipts);
      expect(serialized).not.toMatch(/Bearer /);
      const verification = verifyBundle(summary.executionDir);
      expect(verification.problems).toEqual([]);
      expect(verification.ok).toBe(true);
      // Redelivery of the same frozen key reconciles the finished execution instead of running again.
      const again = await executeBundle({ bundle, stateDir: dir, ledger, scope: localScope() });
      expect(again.redelivered).toBe(true);
      expect(again.executionId).toBe(summary.executionId);
    } finally {
      ledger.close();
    }
  });

  it('runs the offline contract case under the mock lane with a stubbed boundary and a different claim', async () => {
    const project = loadProject(SAMPLE);
    const bundle = plan({ project, profileName: 'offline-contract', scope: localScope() });
    expect(bundle.blockers).toEqual([]);
    const dir = stateDir();
    const ledger = LocalLedger.open(dir);
    try {
      const summary = await executeBundle({ bundle, stateDir: dir, ledger, scope: localScope() });
      expect(summary.outcome).toBe('passed');
      const receipt = summary.receipts[0]!;
      expect(receipt.environment.provenance.runtime).toBe('mocked');
      expect(receipt.environment.provenance.interceptors).toHaveLength(1);
      expect(receipt.proofClaim).toMatch(/No live product claim/);
      const verification = verifyBundle(summary.executionDir);
      expect(verification.problems).toEqual([]);
    } finally {
      ledger.close();
    }
  });

  it('refuses a second live writer and recovers a stale lock', () => {
    const dir = stateDir();
    const first = LocalLedger.open(dir);
    expect(() => LocalLedger.open(dir)).toThrow(/live process/);
    first.close();
    expect(existsSync(join(dir, 'ledger', 'lock.json'))).toBe(false);
  });
});
