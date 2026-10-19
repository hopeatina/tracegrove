import { BenchmarkReport, digestOfValue, sameRef,
  type BenchmarkAxis, type BenchmarkCohort, type BenchmarkTiming, type ExecutionReceipt,
  type TargetTuple } from '../protocol/index.ts';
import { ATTEMPT_EVIDENCE_BYTES, type readAttemptCheckpoint } from './attemptInventory.ts';

type Capture = ReturnType<typeof readAttemptCheckpoint>;
type Finding = BenchmarkReport['findings'][number];
type Timing = { report: BenchmarkTiming; values: number[] };
type Cohort = { report: BenchmarkCohort; timings: Map<string, Timing> };
const usageKeys = ['runnerSeconds', 'browserSeconds', 'inferenceCalls', 'inferenceTokens', 'artifactBytes', 'integrationOperations'] as const;
export const BENCHMARK_LIMITS = { receipts: 5000, points: 50000, groups: 1000,
  evidenceBytes: ATTEMPT_EVIDENCE_BYTES, reportBytes: 8 * 1024 * 1024 } as const;

function targetConditions(target: TargetTuple, axis: BenchmarkAxis) {
  if (axis === 'model') return target; // Opaque model-config digests stay bound; equality cannot be assumed across them.
  const { runner: _runner, ...conditions } = target;
  return conditions;
}

function cohortFor(receipt: ExecutionReceipt, axis: BenchmarkAxis, findings: Set<Finding>) {
  const observed = receipt.environment.observed;
  if (!observed || !sameRef(observed.runner, receipt.environment.expected.runner)) {
    findings.add('target_unobserved'); return null;
  }
  if (axis === 'model' && (receipt.accounting.inferenceCalls === 0 || !receipt.accounting.observedModel)) {
    findings.add('unknown_model'); return null;
  }
  return axis === 'runner' ? { runnerRef: observed.runner } : {
    requestedModel: receipt.accounting.requestedModel, observedModel: receipt.accounting.observedModel,
  };
}

function addTiming(cohort: Cohort, point: ExecutionReceipt['performance'][number]) {
  const temperature: BenchmarkTiming['temperature'] = point.warm === null ? 'unknown' : point.warm ? 'warm' : 'cold';
  const dimensions = { metric: point.metric, boundary: point.boundary, clock: point.clock,
    temperature, strataDigest: digestOfValue(point.strata) };
  const key = digestOfValue(dimensions).hex;
  const entry: Timing = cohort.timings.get(key) ?? { report: { ...dimensions, points: 0, censored: 0, missing: 0,
    numericUncensored: 0, minimumMs: null, medianMs: null, maximumMs: null }, values: [] };
  entry.report.points++;
  if (point.censored) entry.report.censored++;
  if (point.valueMs === null) entry.report.missing++;
  if (!point.censored && point.valueMs !== null) entry.values.push(point.valueMs);
  cohort.timings.set(key, entry);
}

function finishTiming(entry: Timing): BenchmarkTiming {
  const values = entry.values.sort((a, b) => a - b), middle = Math.floor(values.length / 2);
  return { ...entry.report, numericUncensored: values.length, minimumMs: values[0] ?? null,
    maximumMs: values.at(-1) ?? null,
    medianMs: !values.length ? null : values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2 };
}

function emptyCohort(receipt: ExecutionReceipt, key: BenchmarkCohort['key']): Cohort {
  return { report: { key, runnerRef: receipt.environment.observed!.runner,
    requestedModel: receipt.accounting.requestedModel, observedModel: receipt.accounting.observedModel, receipts: [], outcomes: [],
    usage: { runnerSeconds: 0, browserSeconds: 0, inferenceCalls: 0, inferenceTokens: 0, artifactBytes: 0, integrationOperations: 0 },
    pricing: { estimatedSubtotalCents: null, reconciledSubtotalCents: null, unpricedEstimates: 0, unreconciledReceipts: 0, unknownChargeCount: 0 },
    timings: [] }, timings: new Map() };
}

function timingCoverageMatches(cohorts: Cohort[]): boolean {
  const keys = cohorts.map(c => [...c.timings.keys()].sort());
  if (!keys[0]?.length || keys.some(k => digestOfValue(k).hex !== digestOfValue(keys[0]).hex)) return false;
  return cohorts.every(cohort => {
    const dimensions = new Map<string, Set<string>>();
    for (const { report, values } of cohort.timings.values()) {
      const { temperature, metric, boundary, clock, strataDigest } = report;
      if (!values.length || temperature === 'unknown') return false;
      const key = digestOfValue({ metric, boundary, clock, strataDigest }).hex;
      const temperatures = dimensions.get(key) ?? new Set<string>();
      temperatures.add(temperature); dimensions.set(key, temperatures);
    }
    return [...dimensions.values()].every(t => t.has('warm') && t.has('cold'));
  });
}

/** Shared pure reduction of already captured local bindings. Not an evidence authentication API. */
export function aggregateBenchmark(capture: Capture, axis: BenchmarkAxis): BenchmarkReport {
  const { report: inventory, evidence } = capture;
  const findings = new Set<Finding>();
  if (!inventory.evidenceComplete) findings.add('inventory_incomplete');
  const total = capture.evidenceLimitExceeded ? inventory.recordedUsageSubtotal?.receipts ?? 0 : evidence.reduce((n, item) => n + item.records.receipts.length, 0);
  const pointCount = evidence.reduce((n, item) => n + item.records.receipts.reduce((sum, r) => sum + r.performance.length, 0), 0);
  const groups = new Map<string, { conditionsDigest: BenchmarkCohort['key'];
    conditions: BenchmarkReport['groups'][number]['conditions']; cohorts: Map<string, Cohort> }>();
  const reservations = new Map<string, { kind: string; cents: number }>();
  let unassignedReceipts = capture.evidenceLimitExceeded ? total : 0, retainedCents = 0, warm = 0, cold = 0, unknown = 0;
  if (!total) findings.add('no_receipts');
  if (capture.evidenceLimitExceeded || total > BENCHMARK_LIMITS.receipts || pointCount > BENCHMARK_LIMITS.points) findings.add('evidence_limit_exceeded');
  else for (const { admissionSequence, records } of evidence) {
    const fidelity = records.fidelity;
    for (const receipt of records.receipts) {
      for (const reservation of receipt.accounting.reservations) {
        const existing = reservations.get(reservation.reservationId);
        if (existing && (existing.kind !== reservation.kind || existing.cents !== reservation.cents)) findings.add('reservation_conflict');
        if (!existing) { reservations.set(reservation.reservationId, reservation); retainedCents += reservation.cents; }
      }
      const identity = cohortFor(receipt, axis, findings);
      if (!identity) { unassignedReceipts++; continue; }
      const cell = records.selection.cells.find(c => c.selectionCellId === receipt.selectionCellId)!;
      const plan = fidelity.cells.find(c => c.selectionCellId === receipt.selectionCellId);
      const conditionsDigest = digestOfValue({ caseRef: cell.caseRef, personaRef: cell.personaRef,
        surfaceBindingRef: cell.surfaceBindingRef, variantRef: cell.variantRef, environmentRef: cell.environmentRef,
        hostRef: cell.executionHostRef, required: cell.required, selectionPolicy: records.selection.policyRef,
        limits: records.request.limits, intelligencePolicyRef: records.request.intelligencePolicyRef,
        expected: targetConditions(receipt.environment.expected, axis), observed: targetConditions(receipt.environment.observed!, axis),
        provenance: receipt.environment.provenance, network: receipt.environment.networkProfileRef, clock: receipt.environment.clockProfileRef,
        fidelity: plan ? { lane: plan.lane, boundaryProfileRef: plan.boundaryProfileRef, boundaries: plan.boundaries, claimBoundaryIds: plan.claimBoundaryIds } : null,
        models: axis === 'runner' ? { requested: receipt.accounting.requestedModel, observed: receipt.accounting.observedModel } : null,
      });
      const group = groups.get(conditionsDigest.hex) ?? { conditionsDigest, conditions: {
        caseRef: cell.caseRef, personaRef: cell.personaRef, surfaceBindingRef: cell.surfaceBindingRef, environmentRef: cell.environmentRef,
        variantRef: cell.variantRef, executionHostRef: cell.executionHostRef,
        expectedTargetDigest: digestOfValue(targetConditions(receipt.environment.expected, axis)),
        observedTargetDigest: digestOfValue(targetConditions(receipt.environment.observed!, axis)),
      }, cohorts: new Map<string, Cohort>() };
      const key = digestOfValue(identity), cohort = group.cohorts.get(key.hex) ?? emptyCohort(receipt, key);
      cohort.report.receipts.push({ admissionSequence, receiptRef: receipt.ref, executionId: receipt.executionId,
        attemptId: receipt.attemptId, selectionCellId: receipt.selectionCellId, outcome: receipt.outcome });
      const outcome = cohort.report.outcomes.find(o => o.outcome === receipt.outcome);
      if (outcome) outcome.count++; else cohort.report.outcomes.push({ outcome: receipt.outcome, count: 1 });
      for (const name of usageKeys) cohort.report.usage[name] += receipt.accounting[name];
      const a = receipt.accounting, pricing = cohort.report.pricing;
      if (a.estimatedCents === null) pricing.unpricedEstimates++;
      else pricing.estimatedSubtotalCents = (pricing.estimatedSubtotalCents ?? 0) + a.estimatedCents;
      if (a.reconciledCents === null) pricing.unreconciledReceipts++;
      else pricing.reconciledSubtotalCents = (pricing.reconciledSubtotalCents ?? 0) + a.reconciledCents;
      pricing.unknownChargeCount += a.unknownCharges.length;
      if (a.estimatedCents === null || a.reconciledCents === null || a.unknownCharges.length) findings.add('pricing_incomplete');
      for (const point of receipt.performance) {
        addTiming(cohort, point);
        if (point.warm === null) unknown++; else if (point.warm) warm++; else cold++;
      }
      group.cohorts.set(key.hex, cohort); groups.set(conditionsDigest.hex, group);
    }
  }
  if (groups.size > BENCHMARK_LIMITS.groups) findings.add('evidence_limit_exceeded');
  if (unknown || !warm || !cold) findings.add('temperature_unobserved');
  const groupsWithMultipleCohorts = [...groups.values()].filter(g => g.cohorts.size > 1).length;
  if (!groupsWithMultipleCohorts) findings.add('no_matching_cohorts');
  for (const group of groups.values()) {
    if (group.cohorts.size < 2) findings.add('conditions_unmatched');
    else if (!timingCoverageMatches([...group.cohorts.values()])) findings.add('timing_coverage_unmatched');
  }
  const report: BenchmarkReport = { schemaVersion: 'tracegrove.benchmark/v1', scope: inventory.scope, operation: 'read_only', axis,
    evidenceScope: 'execution_admissions_in_checkpoint', issuerTrust: 'not_authenticated', qualification: 'not_evaluated',
    statisticalInference: 'not_performed', controlledConditions: 'not_independently_proven',
    code: findings.size ? 'incomplete_evidence' : 'descriptive_evidence', exitCode: findings.size ? 2 : 0,
    inventory: { ...inventory, attempts: inventory.attempts.map(({ cells: _cells, ...row }) => row) },
    findings: [...findings].sort(), retainedReceipts: total, unassignedReceipts, groupsWithMultipleCohorts,
    reservations: { uniqueIds: findings.has('evidence_limit_exceeded') ? null : reservations.size,
      retainedCents: findings.has('reservation_conflict') || findings.has('evidence_limit_exceeded') ? null : retainedCents,
      basis: 'recorded_reservations_not_actual_charges' },
    groups: [...groups.values()].sort((a, b) => a.conditionsDigest.hex.localeCompare(b.conditionsDigest.hex)).map(group => ({
      conditionsDigest: group.conditionsDigest, conditions: group.conditions,
      cohorts: [...group.cohorts.values()].sort((a, b) => a.report.key.hex.localeCompare(b.report.key.hex)).map(c => ({ ...c.report,
        outcomes: c.report.outcomes.sort((a, b) => a.outcome.localeCompare(b.outcome)),
        timings: [...c.timings.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => finishTiming(value)) })),
    })),
  };
  if (findings.has('evidence_limit_exceeded')) report.groups = [];
  if (Buffer.byteLength(JSON.stringify(report)) > BENCHMARK_LIMITS.reportBytes) {
    report.groups = []; report.code = 'incomplete_evidence'; report.exitCode = 2; report.findings.push('report_limit_exceeded');
  }
  return BenchmarkReport.parse(report);
}
