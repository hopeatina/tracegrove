import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, planSample, sampleCopy } from '../conformance/helpers.ts';
import { startController, delegateRun } from '../src/core/controller.ts';
import { LocalLedger } from '../src/core/ledger.ts';
afterEach(cleanupTemps);

it('delegates concurrent callers to one writer and reconciles redelivery', async () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath);
  const controller = await startController(copy.stateDir, bundle.projectRoot);
  try {
    expect(() => LocalLedger.open(copy.stateDir)).toThrow(/live process/);
    const [first, second] = await Promise.all([delegateRun(copy.stateDir, bundle), delegateRun(copy.stateDir, bundle)]);
    expect(first.outcome).toBe('passed'); expect(second.executionId).toBe(first.executionId);
    expect(second.redelivered).toBe(true);
    const journal = readFileSync(join(copy.stateDir, 'ledger', 'journal.jsonl'), 'utf8');
    expect(journal.split('\n').filter((line) => line.includes('"type":"admitted"'))).toHaveLength(1);
    const denied = await fetch(`${controller.endpoint}/run`, { method: 'POST', body: '{}' });
    expect(denied.status).toBe(403);
    await expect(delegateRun(copy.stateDir, { ...bundle, projectRoot: copy.root })).rejects.toThrow(/project_mismatch/);
  } finally { await controller.close(); }
  const recovered = LocalLedger.open(copy.stateDir); recovered.close();
});
