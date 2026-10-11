import { afterEach, expect, it } from 'vitest';
import { cleanupTemps, planSample, sampleCopy, runSample } from '../conformance/helpers.ts';
import { loadProject } from '../src/core/corpus.ts';
import { searchCases, getCase } from '../src/core/lookup.ts';
import { createRerun } from '../src/core/rerun.ts';
afterEach(cleanupTemps);
it('uses snapshot-bound pages and exact lookup without inference', () => {
  const copy = sampleCopy(); const project = loadProject(copy.configPath);
  const page = searchCases(project, { limit: 1 });
  expect(page.results).toHaveLength(1); expect(page.cursor).not.toBeNull();
  const next = searchCases(project, { limit: 1, cursor: page.cursor! });
  expect(next.results[0]!.ref.id).not.toBe(page.results[0]!.ref.id);
  expect(getCase(project, page.results[0]!.ref).spec.ref).toEqual(page.results[0]!.ref);
  expect(() => searchCases(project, { cursor: page.cursor!, text: 'different' })).toThrow(/foreign lookup/);
  expect(() => searchCases(project, { limit: 101 })).toThrow(/lookup_limit/);
  expect(() => getCase(project, { ...page.results[0]!.ref, digest: { algorithm: 'sha256', hex: '0'.repeat(64) } })).toThrow(/unresolved/);
});
it('reruns known cases with fresh campaigns/attempts and keeps the original request', async () => {
  const copy = sampleCopy(); const original = planSample(copy.configPath);
  const first = await runSample(original, copy.stateDir);
  const rerun = createRerun(original);
  expect(rerun.request!.caseRefs).toEqual(original.request!.caseRefs);
  expect(rerun.request!.replayOf).toEqual(original.request!.ref);
  const second = await runSample(rerun, copy.stateDir);
  expect(second.outcome).toBe('passed'); expect(second.redelivered).toBe(false);
  expect(second.attemptId).not.toBe(first.attemptId);
  expect(second.campaignId).not.toBe(first.campaignId);
  expect(second.receipts[0]!.accounting.inferenceCalls).toBe(0);
});
