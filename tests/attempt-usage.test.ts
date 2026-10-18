import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleCopy, cleanupTemps } from '../conformance/helpers.ts';
import { runTests } from '../src/authoring/run.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { cellBundleName } from '../src/core/bundlePaths.ts';
import { stepPerformance } from '../src/core/attemptUsage.ts';
import { CostObservation, PerformanceObservation, StepObservation, verifySelfDigest, type Step } from '../src/protocol/index.ts';

afterEach(cleanupTemps);
it.each([false, true])('retains measured usage and unknown price for a native attempt (fails=%s)', async fails => {
  const { root } = sampleCopy(); const configPath = join(root, 'tracegrove.config.yaml');
  if (fails) {
    const flow = join(root, 'tracegrove/notes/list.flow.yaml'); writeFileSync(flow, readFileSync(flow, 'utf8').replace('status: 200', 'status: 299'));
  }
  const { report } = await runTests({ configPath, grep: 'notes.list' });
  expect(report.outcome).toBe(fails ? 'assertion_failed' : 'passed'); expect(report.bundleVerified).toBe(true);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle')); const receipt = bundle.receipts[0]!;
  expect(receipt.accounting).toMatchObject({ estimatedCents: null, reconciledCents: null, rateCardDigest: null,
    inferenceCalls: 0, inferenceTokens: 0, unknownCharges: [{ route: 'host_minutes' }] });
  expect(receipt.accounting.runnerSeconds).toBeGreaterThan(0);
  expect(receipt.accounting.artifactBytes).toBeGreaterThan(0);
  expect(receipt.performance.length).toBeGreaterThan(0); expect(receipt.performance.every(value => value.warm === null && value.boundary === 'http')).toBe(true);
  const stored = JSON.parse(readFileSync(join(report.runDir, 'bundle/cells', cellBundleName(receipt.selectionCellId), 'accounting.json'), 'utf8'));
  const cost = CostObservation.parse(stored.costs[0]); expect(verifySelfDigest(cost)).toBe(true);
  expect(cost).toMatchObject({ amount: null, reconciliation: 'unknown', rateSnapshotRef: null, quantity: { unit: 'runner_wall_seconds' } });
  expect(receipt.accounting.costObservationRefs).toEqual([cost.ref]);
  expect(stored.accounting).toEqual(receipt.accounting);
});

const step = (stepId: string, result: StepObservation['result'] = 'completed', reasonCode: string | null = null) => StepObservation.parse({
  stepId, result, reasonCode, eventIds: [], evidenceRefs: [], inputDigest: { algorithm: 'sha256', hex: '0'.repeat(64) }, outputDigest: null, output: null,
  timing: { startedAt: '2026-10-18T10:00:00Z', finishedAt: '2026-10-18T10:00:01Z', durationMs: 1000 },
});
it('keeps browser, native job, MCP and HTTP timing strata distinct without inventing cold observations', () => {
  const kinds = new Map<string, Step['kind']>([['http', 'http.request'], ['observe', 'observe'], ['browser', 'ui.navigate'], ['job', 'job.submit'], ['mcp', 'mcp.call']]);
  const observed = stepPerformance([...kinds.keys(), 'unknown'].map(id => step(id)), kinds, 'cell', 'local_process');
  expect(observed.map(value => value.boundary)).toEqual(['http', 'http', 'browser', 'native_job', 'mcp', 'unknown']);
  expect(observed.every(value => value.warm === null && !value.censored && value.valueMs === 1000)).toBe(true);
  expect(PerformanceObservation.parse({ ...observed[0]!, warm: false }).warm).toBe(false); // Existing explicitly labeled records remain readable.
});
it('marks timeout/cancellation durations as censored but preserves complete observed status failures', () => {
  const observations = [step('timeout', 'failed', 'deadline_exceeded'), step('browser', 'failed', 'browser_timeout'),
    step('cancelled', 'cancelled', 'cancelled'), step('status', 'failed', 'unexpected_status:500'), { ...step('not-run', 'not_run'), timing: null }];
  const metrics = stepPerformance(observations, new Map(), 'cell', 'local_process');
  expect(metrics).toHaveLength(4); expect(metrics.map(value => value.censored)).toEqual([true, true, true, false]);
});
