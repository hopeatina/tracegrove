import { afterAll, beforeAll, expect, it } from 'vitest';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';
import { runTests } from '../src/authoring/run.ts';
import { localScope } from '../src/core/corpus.ts';
import { readAttemptCheckpoint } from '../src/core/attemptInventory.ts';
import { aggregateBenchmark, BENCHMARK_LIMITS } from '../src/core/benchmarkAggregation.ts';
import { inspectBenchmark } from '../src/core/benchmark.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { BenchmarkReport, freeze } from '../src/protocol/index.ts';
import { runCli } from './fixtures/cli.ts';
import { formatBenchmark } from '../src/cli/benchmark.ts';

let stateDir: string;
let captured: ReturnType<typeof readAttemptCheckpoint>;
beforeAll(async () => {
  const sample = sampleCopy(); stateDir = join(sample.root, '.tracegrove/state');
  expect((await runTests({ configPath: join(sample.root, 'tracegrove.config.yaml'), grep: 'notes.list' })).report.outcome).toBe('passed');
  const flow = join(sample.root, 'tracegrove/notes/list.flow.yaml');
  writeFileSync(flow, readFileSync(flow, 'utf8').replace('status: 200', 'status: 299'));
  expect((await runTests({ configPath: join(sample.root, 'tracegrove.config.yaml'), grep: 'notes.list' })).report.outcome).toBe('assertion_failed');
  captured = readAttemptCheckpoint({ stateDir, scope: localScope() });
  expect(captured.report.evidenceComplete).toBe(true);
});
afterAll(cleanupTemps);

// Pure aggregation unit inputs only. These edits are not resealed or passed to the public evidence reader.
function experimental() {
  const value = structuredClone(captured), first = value.evidence[0]!;
  const second = structuredClone(first); second.admissionSequence++;
  value.evidence = [first, second];
  for (const [index, item] of value.evidence.entries()) {
    const receipt = item.records.receipts[0]!;
    receipt.environment.expected.runner = freeze({ ref: { id: `runner-${index}`, revision: '1' }, value: index }).ref;
    receipt.environment.observed!.runner = receipt.environment.expected.runner;
    receipt.accounting.estimatedCents = 0; receipt.accounting.reconciledCents = 0; receipt.accounting.unknownCharges = [];
    receipt.performance = [false, true].map(warm => ({ metric: 'request.duration', boundary: 'http', clock: 'monotonic',
      cellId: receipt.selectionCellId, valueMs: warm ? 10 : 20, censored: false, warm, strata: { host: 'test' } }));
  }
  return value;
}

it('keeps all recorded outcomes, deduplicates shared reservation IDs, and splits only the selected experimental axis', () => {
  const evidence = experimental(); evidence.evidence[1]!.records.receipts[0]!.outcome = 'assertion_failed';
  const report = aggregateBenchmark(evidence, 'runner');
  expect(report.code).toBe('descriptive_evidence'); expect(report.exitCode).toBe(0);
  expect(report.retainedReceipts).toBe(2); expect(report.groupsWithMultipleCohorts).toBe(1);
  expect(report.groups[0]!.cohorts.flatMap(c => c.outcomes.map(o => o.outcome))).toContain('assertion_failed');
  expect(report.reservations.uniqueIds).toBe(1);
  expect(report.reservations.retainedCents).toBe(evidence.evidence[0]!.records.receipts[0]!.accounting.reservations[0]!.cents);
  expect(report).toMatchObject({ issuerTrust: 'not_authenticated', statisticalInference: 'not_performed', controlledConditions: 'not_independently_proven' });
  expect(BenchmarkReport.parse(report)).toEqual(report);
});

it('does not merge changed contracts, provenance, target components, limits, policies or opaque model configurations', () => {
  for (const edit of [
    (value: ReturnType<typeof experimental>) => { value.evidence[1]!.records.receipts[0]!.environment.observed!.backendRelease = 'changed'; },
    (value: ReturnType<typeof experimental>) => { value.evidence[1]!.records.receipts[0]!.environment.provenance.runtime = 'replay'; },
    (value: ReturnType<typeof experimental>) => { value.evidence[1]!.records.request.limits.maxProviderRequests++; },
    (value: ReturnType<typeof experimental>) => { value.evidence[1]!.records.selection.cells[0]!.required = false; },
  ]) {
    const value = experimental(); edit(value);
    const report = aggregateBenchmark(value, 'runner');
    expect(report.groups).toHaveLength(2); expect(report.groupsWithMultipleCohorts).toBe(0);
    expect(report.findings).toContain('no_matching_cohorts'); expect(report.exitCode).toBe(2);
  }
});

it('retains missing/censored/unknown-temperature points without treating them as uncensored samples', () => {
  const value = experimental(), receipt = value.evidence[0]!.records.receipts[0]!;
  const point = receipt.performance[0]!;
  receipt.performance = [{ ...point, valueMs: 900, censored: true }, { ...point, valueMs: null },
    { ...point, valueMs: 10 }, { ...point, valueMs: 30 }, { ...point, warm: null, valueMs: 50 }];
  const report = aggregateBenchmark(value, 'runner');
  const timings = report.groups.flatMap(g => g.cohorts).find(c => c.receipts[0]!.admissionSequence === value.evidence[0]!.admissionSequence)!.timings;
  expect(timings.find(t => t.temperature === 'cold')).toMatchObject({ points: 4, censored: 1, missing: 1,
    numericUncensored: 2, minimumMs: 10, medianMs: 20, maximumMs: 30 });
  expect(timings.find(t => t.temperature === 'unknown')?.points).toBe(1);
  expect(report.findings).toContain('temperature_unobserved');
});

it('preserves unknown pricing and reservation conflicts instead of inventing zero or a complete bill', () => {
  const value = experimental(); value.evidence[1]!.records.receipts[0]!.accounting.estimatedCents = null;
  value.evidence[1]!.records.receipts[0]!.accounting.unknownCharges = [{ route: 'host', reason: 'not measured' }];
  value.evidence[1]!.records.receipts[0]!.accounting.reservations[0]!.cents++;
  const report = aggregateBenchmark(value, 'runner');
  expect(report.findings).toEqual(expect.arrayContaining(['pricing_incomplete', 'reservation_conflict']));
  expect(report.reservations.retainedCents).toBe(null); expect(report.exitCode).toBe(2);
  expect(report.groups.flatMap(g => g.cohorts).some(c => c.pricing.estimatedSubtotalCents === null)).toBe(true);
});

it('does not mark unequal warm/cold coverage, clocks or missing numeric samples as a complete comparison', () => {
  for (const edit of [
    (receipt: ReturnType<typeof experimental>['evidence'][number]['records']['receipts'][number]) => { receipt.performance.pop(); },
    (receipt: ReturnType<typeof experimental>['evidence'][number]['records']['receipts'][number]) => { receipt.performance[0]!.clock = 'wall'; },
    (receipt: ReturnType<typeof experimental>['evidence'][number]['records']['receipts'][number]) => { receipt.performance[0]!.censored = true; },
  ]) {
    const value = experimental(); edit(value.evidence[1]!.records.receipts[0]!);
    const report = aggregateBenchmark(value, 'runner');
    expect(report.findings).toContain('timing_coverage_unmatched'); expect(report.exitCode).toBe(2);
  }
});

it('requires an observed matching runner and actual recorded inference before grouping model comparisons', () => {
  const value = experimental();
  expect(aggregateBenchmark(value, 'model').findings).toContain('unknown_model');
  value.evidence[1]!.records.receipts[0]!.environment.observed = null;
  const report = aggregateBenchmark(value, 'runner');
  expect(report.unassignedReceipts).toBe(1); expect(report.retainedReceipts).toBe(2);
  expect(report.findings).toContain('target_unobserved');
});

it('compares recorded cheap-model cohorts only within identical recorded conditions and keeps opaque configuration changes separate', () => {
  const value = experimental(), runner = value.evidence[0]!.records.receipts[0]!.environment.expected.runner;
  for (const [index, item] of value.evidence.entries()) {
    const receipt = item.records.receipts[0]!;
    receipt.environment.expected.runner = runner; receipt.environment.observed!.runner = runner;
    receipt.accounting.inferenceCalls = 1;
    receipt.accounting.requestedModel = receipt.accounting.observedModel = index ? 'claude-haiku-4.5' : 'gpt-6-luna';
  }
  const report = aggregateBenchmark(value, 'model');
  expect(report.groupsWithMultipleCohorts).toBe(1); expect(report.code).toBe('descriptive_evidence');
  value.evidence[1]!.records.receipts[0]!.environment.observed!.modelConfigDigest = { algorithm: 'sha256', hex: 'a'.repeat(64) };
  expect(aggregateBenchmark(value, 'model').groupsWithMultipleCohorts).toBe(0);
});

it('fails the evidence bound without silently benchmarking a passing subset', () => {
  const value = experimental(), record = value.evidence[0]!.records.receipts[0]!;
  value.evidence[0]!.records.receipts = Array.from({ length: BENCHMARK_LIMITS.receipts + 1 }, () => record);
  const report = aggregateBenchmark(value, 'runner');
  expect(report.retainedReceipts).toBe(BENCHMARK_LIMITS.receipts + 2);
  expect(report.groups).toEqual([]); expect(report.findings).toContain('evidence_limit_exceeded'); expect(report.exitCode).toBe(2);
});

it('keeps ordinary inventory reads streaming and fails aggregate capture bounds without retaining a subset', () => {
  const options = { stateDir, scope: localScope() };
  const inventoryOnly = readAttemptCheckpoint({ ...options, retainEvidence: false });
  expect(inventoryOnly.evidence).toEqual([]); expect(inventoryOnly.report.evidenceComplete).toBe(true);
  const bounded = readAttemptCheckpoint({ ...options, evidenceByteLimit: 1 });
  expect(bounded.evidence).toEqual([]); expect(bounded.evidenceLimitExceeded).toBe(true);
  expect(bounded.report.attempts).toHaveLength(2);
  const report = aggregateBenchmark(bounded, 'runner');
  expect(report.retainedReceipts).toBe(2); expect(report.unassignedReceipts).toBe(2);
  expect(report.groups).toEqual([]); expect(report.reservations.retainedCents).toBe(null);
  expect(report.reservations.uniqueIds).toBe(null);
  expect(report.findings).toContain('evidence_limit_exceeded'); expect(report.exitCode).toBe(2);
  expect(captured.evidence[0]!.records).not.toHaveProperty('documents');
});

it('reads real sealed admissions through the SDK and compiled-compatible CLI without writing or labeling unknowns warm', () => {
  const journal = join(stateDir, 'ledger/journal.jsonl'), before = readFileSync(journal);
  const report = inspectBenchmark({ stateDir, scope: localScope(), axis: 'runner' });
  expect(report.inventory.attempts).toHaveLength(2); expect(report.retainedReceipts).toBe(2);
  expect(report.inventory.attempts.map(a => a.outcome).sort()).toEqual(['assertion_failed', 'passed']);
  expect(report.findings).toEqual(expect.arrayContaining(['pricing_incomplete', 'temperature_unobserved', 'no_matching_cohorts']));
  const result = runCli(['benchmark', '--state-dir', stateDir, '--axis', 'runner']);
  expect(result.status, result.stderr).toBe(2); expect(JSON.parse(result.stdout)).toEqual(report);
  const prose = runCli(['benchmark', '--state-dir', stateDir, '--axis', 'runner'], false);
  expect(prose.stdout).toContain('statistical significance are not proven');
  expect(readFileSync(journal)).toEqual(before); expect(existsSync(join(stateDir, 'ledger/lock.json'))).toBe(false);
});

it('retains an unavailable admission and refuses a complete comparison instead of dropping it', () => {
  const copy = sampleCopy(), copiedState = join(copy.root, 'copied-state'); cpSync(stateDir, copiedState, { recursive: true });
  const ledger = LocalLedger.open(copiedState);
  try { ledger.append('execution:unsealed-attempt', 0, 'admitted', {
    executionId: 'unsealed-attempt', attemptId: 'unsealed-attempt', requestDigest: 'a'.repeat(64), generation: 1, attemptNumber: 1,
  }); } finally { ledger.close(); }
  const before = readFileSync(join(copiedState, 'ledger/journal.jsonl'));
  const report = inspectBenchmark({ stateDir: copiedState, scope: localScope(), axis: 'runner' });
  expect(report.inventory.attempts).toHaveLength(3); expect(report.retainedReceipts).toBe(2);
  expect(report.inventory.attempts.at(-1)).toMatchObject({ executionId: 'unsealed-attempt', status: 'binding_invalid', outcome: null });
  expect(report.findings).toContain('inventory_incomplete'); expect(report.exitCode).toBe(2);
  expect(readFileSync(join(copiedState, 'ledger/journal.jsonl'))).toEqual(before);
});

it('reports a missing ledger without creating it and validates the CLI axis', () => {
  const missing = join(stateDir, 'missing');
  const report = inspectBenchmark({ stateDir: missing, scope: localScope(), axis: 'runner' });
  expect(report.inventory.code).toBe('ledger_snapshot_unavailable'); expect(report.groups).toEqual([]);
  expect(report.findings).toContain('inventory_incomplete'); expect(existsSync(missing)).toBe(false);
  expect(runCli(['benchmark', '--state-dir', stateDir, '--axis', 'fastest']).status).toBe(2);
  expect(runCli(['benchmark', '--state-dir', stateDir, '--axis', 'runner', '--only-passed']).status).toBe(2);
});

it('bounds the terminal preview and escapes recorded model/metric labels without changing JSON evidence', () => {
  const report = aggregateBenchmark(experimental(), 'runner'); report.axis = 'model';
  report.groups[0]!.cohorts[0]!.observedModel = '\u001b[2J\nrecorded-model';
  report.groups = Array.from({ length: 12 }, () => report.groups[0]!);
  const prose = formatBenchmark(report);
  expect(prose).not.toContain('\u001b'); expect(prose).toContain('\\u001b[2J\\u000arecorded-model');
  expect(prose).toContain('2 additional condition groups in --json.');
  expect(report.groups[0]!.cohorts[0]!.observedModel).toBe('\u001b[2J\nrecorded-model');
});
