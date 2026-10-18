import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import type { TestRunReport } from '../src/authoring/run.ts';
import { compareReplays } from '../src/core/replayComparison.ts';
import { VerifiedBundleSnapshot } from '../src/core/bundle.ts';
import { ReplayComparison } from '../src/protocol/index.ts';
import { runCli } from './fixtures/cli.ts';
import { parseArgs } from '../src/cli/arguments.ts';
import { comparisonRunsFixture } from './fixtures/comparisonRuns.ts';

let passed: TestRunReport, failed: TestRunReport, edited: TestRunReport, contextChanged: TestRunReport, expanded: TestRunReport;
let foreign: VerifiedBundleSnapshot;
const captured = (report: TestRunReport) => VerifiedBundleSnapshot.open(join(report.runDir, 'bundle'));
beforeAll(async () => {
  const f = await comparisonRunsFixture(true);
  ({ passed, failed, edited, expanded, contextChanged } = f); foreign = f.foreign!;
}, 60000);
afterAll(cleanupTemps);

it('compares real recorded pass/failure transitions in both directions without granting qualification', () => {
  const forward = compareReplays(captured(passed), captured(failed));
  expect(ReplayComparison.parse(forward)).toMatchObject({ operation: 'read_only', qualification: 'not_evaluated', issuerTrust: 'not_authenticated',
    evidenceScope: 'provided_bundles_only', executionIdentityRelation: 'distinct_recorded_executions', rows: [{ change: 'passed_to_failed' }] });
  expect(forward.baseline.retainedReceipts).toBe(1); expect(forward.candidate.coverage.passed).toBe(0);
  expect(forward.rows[0]!.baseline[0]!.receiptRef).not.toEqual(forward.rows[0]!.candidate[0]!.receiptRef);
  expect(forward.rows[0]!.candidate[0]!.steps.some(step => step.result === 'failed')).toBe(true);
  expect(forward.rows[0]!.baseline[0]!.observedComponents).toEqual(forward.rows[0]!.candidate[0]!.observedComponents);
  expect(compareReplays(captured(failed), captured(passed)).rows[0]!.change).toBe('failed_to_passed');
  expect(JSON.stringify(forward)).not.toContain('controlled failure'); // No raw observations or configuration values.
});

it('does not describe a passing edited assertion as recovery under the original contract', () => {
  const comparison = compareReplays(captured(failed), captured(edited));
  expect(comparison.rows[0]).toMatchObject({ change: 'contract_changed', baseline: [{ outcome: 'assertion_failed' }], candidate: [{ outcome: 'passed' }] });
});

it('marks identical evidence as the same campaign and does not mistake a copy for another independent attempt', () => {
  const comparison = compareReplays(captured(passed), captured(passed));
  expect(comparison.executionIdentityRelation).toBe('same_campaign'); expect(comparison.rows[0]!.change).toBe('unchanged');
});

it('retains added and removed selection strata instead of comparing only their intersection', () => {
  const forward = compareReplays(captured(passed), captured(expanded));
  expect(forward.rows).toHaveLength(2);
  expect(forward.rows.find(row => row.dimensions.caseId === 'notes.list')!.change).toBe('context_changed'); // The full campaign has a different deadline.
  expect(forward.rows.find(row => row.dimensions.caseId !== 'notes.list')!.change).toBe('selection_added');
  expect(compareReplays(captured(expanded), captured(passed)).rows.some(row => row.change === 'selection_removed')).toBe(true);
  expect(forward.candidate.retainedReceipts).toBe(2);
});

it('reports changed host configuration separately even when both cases passed', () => {
  const result = compareReplays(captured(passed), captured(contextChanged));
  expect(result.rows[0]).toMatchObject({ change: 'context_changed', baseline: [{ outcome: 'passed' }], candidate: [{ outcome: 'passed' }] });
});

it('refuses cross-owner evidence instead of combining different scopes', () => {
  expect(() => compareReplays(captured(passed), foreign)).toThrow('same evidence scope');
});

it('uses the actual CLI and refuses freshly corrupted input without publishing a comparison', () => {
  const args = ['compare', '--baseline', join(passed.runDir, 'bundle'), '--candidate', join(failed.runDir, 'bundle')];
  const result = runCli(args); expect(result.status, result.stderr).toBe(0);
  expect(ReplayComparison.parse(JSON.parse(result.stdout)).rows[0]!.change).toBe('passed_to_failed');
  const campaign = join(edited.runDir, 'bundle/campaign.json'); const original = readFileSync(campaign);
  try {
    writeFileSync(campaign, '{}');
    const invalid = runCli(['compare', '--baseline', join(passed.runDir, 'bundle'), '--candidate', join(edited.runDir, 'bundle')]);
    expect(invalid.status, JSON.stringify({ stderr: invalid.stderr, stdout: invalid.stdout })).toBe(2); expect(JSON.parse(invalid.stdout).schemaVersion).toBe('tracegrove.cli-error/v1');
    expect(invalid.stdout).not.toContain('passed_to_failed');
  } finally { writeFileSync(campaign, original); }
});

it('keeps captured inputs stable after producer files disappear and returns defensive copies', () => {
  const baseline = captured(passed), candidate = captured(failed);
  const campaign = join(failed.runDir, 'bundle/campaign.json'); const original = readFileSync(campaign);
  try {
    unlinkSync(campaign);
    const first = compareReplays(baseline, candidate); first.rows[0]!.candidate[0]!.outcome = 'passed';
    expect(compareReplays(baseline, candidate).rows[0]!.change).toBe('passed_to_failed');
    expect(() => captured(failed)).toThrow();
  } finally { writeFileSync(campaign, original); }
});

it.each([['compare'], ['compare', '--baseline', '/missing'], ['compare', '--baseline', '/missing', '--candidate', '/missing', '--ignore-contracts']])
('rejects missing or unsupported comparison flags before evidence access: %j', (...args) => { expect(() => parseArgs(args)).toThrow(); });
