/**
 * Trusted reducer: derives expected assertion instances from the frozen case, evaluates them
 * against recorded step observations, computes coverage and the per-cell/campaign outcomes.
 * Producer flags are redundant checks, never authority.
 */
import {
  AssertionObservation, BrowserObservation, NativeJobObservation, McpToolObservation, ConversationObservation, CampaignResult, Coverage, digestOfValue, freeze, parseAs,
  type Assertion, type CaseSpec, type EnvironmentBinding, type ExecutionReceipt, type Outcome,
  type PredicateT, type Ref, type SelectionManifest, type StepObservation, type TargetTuple, type Scope,
} from '../protocol/index.ts';
import { nowIso } from './clock.ts';
import { isInfrastructureStepFailure } from './errors.ts';

export const REDUCER_REF: Ref = (() => {
  const base = { id: 'tracegrove.reducer', revision: '0.1.0' };
  return { ...base, digest: digestOfValue(base) };
})();

export function getPath(value: unknown, path: string): { present: boolean; value: unknown } {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    const match = segment.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\[([0-9]+)\])?$/);
    if (!match) return { present: false, value: undefined };
    const key = match[1] as string;
    if (!current || typeof current !== 'object' || !(key in (current as object))) return { present: false, value: undefined };
    current = (current as Record<string, unknown>)[key];
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) return { present: false, value: undefined };
      const index = Number(match[2]);
      if (index >= current.length) return { present: false, value: undefined };
      current = current[index];
    }
  }
  return { present: current !== undefined, value: current };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return digestOfValue(a).hex === digestOfValue(b).hex;
}

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
/** Case- and whitespace-insensitive: substring of a string, or equal to an element of a list. */
function textHas(haystack: unknown, needle: string): boolean {
  const want = normalizeText(needle);
  if (typeof haystack === 'string') return normalizeText(haystack).includes(want);
  if (Array.isArray(haystack)) return haystack.some((item) => typeof item === 'string' ? normalizeText(item) === want : textHas(item, needle));
  return false;
}

export type ObservationView = { status?: number | undefined; body?: unknown; browser?: BrowserObservation; stepResult?: StepObservation['result'] | undefined };

export function evaluatePredicate(predicate: PredicateT, view: ObservationView): { pass: boolean; actual: unknown; reason: string | null } {
  switch (predicate.kind) {
    case 'status_equals': return { pass: view.status === predicate.value, actual: view.status ?? null, reason: view.status === predicate.value ? null : `status ${view.status ?? 'none'} != ${predicate.value}` };
    case 'json_path_equals': {
      const got = getPath(view, predicate.path);
      const pass = got.present && jsonEqual(got.value, predicate.value);
      return { pass, actual: got.present ? got.value : null, reason: pass ? null : `${predicate.path} ${got.present ? 'differs' : 'absent'}` };
    }
    case 'json_path_present': { const got = getPath(view, predicate.path); return { pass: got.present, actual: got.present ? got.value : null, reason: got.present ? null : `${predicate.path} absent` }; }
    case 'json_path_absent': { const got = getPath(view, predicate.path); return { pass: !got.present, actual: got.present ? got.value : null, reason: got.present ? null : `${predicate.path} present` }; }
    case 'json_path_count': {
      const got = getPath(view, predicate.path);
      const count = Array.isArray(got.value) ? got.value.length : got.present ? 1 : 0;
      return { pass: count === predicate.count, actual: count, reason: count === predicate.count ? null : `count ${count} != ${predicate.count}` };
    }
    case 'json_path_includes':
    case 'json_path_excludes': {
      const got = getPath(view, predicate.path);
      const found = predicate.values.filter((value) => textHas(got.value, value));
      const pass = predicate.kind === 'json_path_includes' ? got.present && found.length === predicate.values.length : found.length === 0;
      const missing = predicate.values.filter((value) => !found.includes(value));
      return { pass, actual: got.present ? got.value : null, reason: pass ? null : !got.present && predicate.kind === 'json_path_includes' ? `${predicate.path} absent`
        : predicate.kind === 'json_path_includes' ? `${predicate.path} lacks ${missing.map((v) => JSON.stringify(v)).join(', ')}` : `${predicate.path} contains ${found.map((v) => JSON.stringify(v)).join(', ')}` };
    }
    case 'json_path_at_most': {
      const got = getPath(view, predicate.path);
      const pass = typeof got.value === 'number' && got.value <= predicate.value;
      return { pass, actual: got.present ? got.value : null, reason: pass ? null : typeof got.value === 'number' ? `${predicate.path} ${got.value} > ${predicate.value}` : `${predicate.path} is not a number` };
    }
    case 'step_result': return { pass: view.stepResult === predicate.value, actual: view.stepResult ?? null, reason: view.stepResult === predicate.value ? null : `step ${view.stepResult ?? 'unobserved'} != ${predicate.value}` };
    case 'all': {
      const results = predicate.predicates.map((p) => evaluatePredicate(p, view));
      const failed = results.find((r) => !r.pass);
      return { pass: !failed, actual: results.map((r) => r.actual), reason: failed ? failed.reason : null };
    }
  }
}

export function evaluateAssertions(spec: CaseSpec, environmentClass: EnvironmentBinding['class'], steps: StepObservation[], producerRef: Ref, from: string, to: string): AssertionObservation[] {
  const byStep = new Map(steps.map((s) => [s.stepId, s]));
  const expected: Assertion[] = [...spec.preconditions, ...spec.assertions];
  return expected.map((assertion) => {
    const oracleRef: Ref = { id: assertion.oracle.name, revision: assertion.oracle.version, digest: digestOfValue(assertion.oracle) };
    const applicable = assertion.environmentClasses.includes(environmentClass);
    const step = byStep.get(assertion.stepId);
    let result: AssertionObservation['result'];
    let reasonCode: string | null = null;
    let actual: unknown = null;
    if (!applicable) {
      result = 'not_applicable';
    } else if (!step || step.result === 'not_run' || step.result === 'cancelled') {
      result = 'not_observed'; reasonCode = step ? `step_${step.result}` : 'step_missing';
    } else if (step.result === 'failed' && isInfrastructureStepFailure(step.reasonCode)) {
      result = 'not_observed'; reasonCode = step.reasonCode;
    } else if (assertion.oracle.name === 'step.result') {
      const evaluation = evaluatePredicate(assertion.predicate, { stepResult: step.result });
      result = evaluation.pass ? 'pass' : 'fail'; actual = evaluation.actual; reasonCode = evaluation.reason;
    } else if (assertion.oracle.name === 'browser.observation') {
      const browser = BrowserObservation.safeParse(step.output);
      if (!browser.success || browser.data.textTruncated) { result = 'not_observed'; reasonCode = 'invalid_or_truncated_browser_observation'; }
      else {
        const evaluation = evaluatePredicate(assertion.predicate, { browser: browser.data });
        result = evaluation.pass ? 'pass' : 'fail'; actual = evaluation.actual; reasonCode = evaluation.reason;
      }
    } else if (assertion.oracle.name === 'mcp.observation') {
      const mcp = McpToolObservation.safeParse(step.output);
      const expected = spec.steps.find(item => item.id === assertion.stepId);
      if (!mcp.success || expected?.kind !== 'mcp.call' || mcp.data.tool !== expected.command.tool || mcp.data.endpoint !== expected.command.endpoint) { result = 'not_observed'; reasonCode = 'invalid_mcp_observation'; }
      else { const evaluation = evaluatePredicate(assertion.predicate, { body: mcp.data }); result = evaluation.pass ? 'pass' : 'fail'; actual = evaluation.actual; reasonCode = evaluation.reason; }
    } else if (assertion.oracle.name === 'conversation.observation') {
      const conversation = ConversationObservation.safeParse(step.output);
      const expected = spec.steps.find(item => item.id === assertion.stepId);
      if (!conversation.success || expected?.kind !== 'conversation.run' || conversation.data.endpoint !== expected.command.endpoint) { result = 'not_observed'; reasonCode = 'invalid_conversation_observation'; }
      else { const evaluation = evaluatePredicate(assertion.predicate, { body: conversation.data }); result = evaluation.pass ? 'pass' : 'fail'; actual = evaluation.actual; reasonCode = evaluation.reason; }
    } else if (assertion.oracle.name === 'job.observation') {
      const job = NativeJobObservation.safeParse(step.output);
      if (!job.success) { result = 'not_observed'; reasonCode = 'invalid_native_job_observation'; }
      else { const evaluation = evaluatePredicate(assertion.predicate, { body: job.data }); result = evaluation.pass ? 'pass' : 'fail'; actual = evaluation.actual; reasonCode = evaluation.reason; }
    } else {
      const output = (step.output ?? null) as { status?: number; body?: unknown } | null;
      if (!output) { result = 'not_observed'; reasonCode = 'no_observation_recorded'; }
      else {
        const evaluation = evaluatePredicate(assertion.predicate, { status: output.status, body: output.body });
        result = evaluation.pass ? 'pass' : 'fail'; actual = evaluation.actual; reasonCode = evaluation.reason;
      }
    }
    return parseAs(AssertionObservation, {
      assertionId: assertion.id,
      required: assertion.required,
      oracleRef,
      result,
      reasonCode,
      actual: actual ?? null,
      evidenceRefs: [],
      producerRef,
      inputDigest: digestOfValue({ assertion, stepOutput: step?.outputDigest ?? null }),
      observedFrom: from,
      observedTo: to,
      judge: null,
    }, `assertion ${assertion.id}`);
  });
}

export type CellReductionInput = {
  spec: CaseSpec;
  expectedStepIds: string[];
  steps: StepObservation[];
  assertions: AssertionObservation[];
  cancelled: boolean;
  fixtureState: 'verified' | 'failed' | 'blocked' | 'cancelled' | 'unknown' | 'not_required';
  identityMatched: boolean | null; // null = unknown required identity
  fidelityMatched: boolean;
  requiredCapabilitiesObserved: boolean;
  artifactsVerified: boolean;
  unknownMutations: number;
  criticalCleanupConfirmed: boolean;
  infrastructureFailure: boolean;
  blockedReasons: string[];
  /** Additive: deployed classes treat unconfirmed cleanup as a failed run, not an inconclusive one. */
  environmentClass?: EnvironmentBinding['class'];
};

/** Classes whose cleanup must be confirmed or the run fails (the run touched a shared deployment). */
export const CLEANUP_FAILS_RUN: ReadonlySet<string> = new Set(['deployed_preview', 'deployed_canary']);

export function reduceCell(input: CellReductionInput): { outcome: Outcome; reasonCodes: string[]; proofEligible: boolean; coverage: Coverage } {
  const reasons: string[] = [...input.blockedReasons];
  const observedSteps = new Set(input.steps.map((s) => s.stepId));
  const missingSteps = input.expectedStepIds.filter((id) => !observedSteps.has(id));
  const completedSteps = input.steps.filter((s) => s.result === 'completed').length;
  const requiredAssertions = input.assertions.filter((a) => a.required && a.result !== 'not_applicable');
  const passedRequired = requiredAssertions.filter((a) => a.result === 'pass').length;
  const failedRequired = requiredAssertions.filter((a) => a.result === 'fail');
  const unobservedRequired = requiredAssertions.filter((a) => a.result === 'not_observed');
  if (missingSteps.length > 0) reasons.push(`missing_step_observation:${missingSteps.join('/')}`);
  if (requiredAssertions.length === 0) reasons.push('zero_required_assertions');

  const deployedCleanupUnconfirmed = !!input.environmentClass && CLEANUP_FAILS_RUN.has(input.environmentClass) && (input.unknownMutations > 0 || !input.criticalCleanupConfirmed);
  let outcome: Outcome;
  if (failedRequired.length > 0) {
    outcome = 'assertion_failed';
    reasons.push(...failedRequired.map((a) => `assertion_failed:${a.assertionId}`));
  } else if (deployedCleanupUnconfirmed) {
    outcome = 'assertion_failed';
    reasons.push('deployed_cleanup_unconfirmed', input.unknownMutations > 0 ? 'unknown_mutations_remain' : 'critical_cleanup_unconfirmed');
  } else if (input.blockedReasons.length > 0) {
    outcome = 'blocked';
  } else if (input.cancelled) {
    outcome = 'cancelled';
    reasons.push('cancelled_before_completion');
  } else if (input.fixtureState !== 'verified' && input.fixtureState !== 'not_required') {
    outcome = 'blocked';
    reasons.push(`fixture_${input.fixtureState}`);
  } else if (input.infrastructureFailure) {
    outcome = 'infrastructure_failed';
  } else if (unobservedRequired.length > 0 || missingSteps.length > 0 || completedSteps !== input.expectedStepIds.length) {
    outcome = 'inconclusive';
    reasons.push(...unobservedRequired.map((a) => `required_not_observed:${a.assertionId}`));
  } else if (input.identityMatched !== true) {
    outcome = 'inconclusive';
    reasons.push(input.identityMatched === null ? 'required_identity_unknown' : 'identity_mismatch');
  } else if (!input.fidelityMatched) {
    outcome = 'inconclusive';
    reasons.push('boundary_fidelity_mismatch');
  } else if (!input.requiredCapabilitiesObserved) {
    outcome = 'blocked';
    reasons.push('required_capability_not_observed');
  } else if (!input.artifactsVerified) {
    outcome = 'inconclusive';
    reasons.push('required_artifacts_unverified');
  } else if (input.unknownMutations > 0 || !input.criticalCleanupConfirmed) {
    outcome = 'inconclusive';
    reasons.push(input.unknownMutations > 0 ? 'unknown_mutations_remain' : 'critical_cleanup_unconfirmed');
  } else if (requiredAssertions.length === 0) {
    outcome = 'inconclusive';
  } else {
    outcome = 'passed';
  }
  // Evidence/cleanup failures stay recorded even on assertion failure.
  if (outcome === 'assertion_failed') {
    if (!input.artifactsVerified) reasons.push('required_artifacts_unverified');
    if (!input.criticalCleanupConfirmed) reasons.push('critical_cleanup_unconfirmed');
  }
  const proofEligible = outcome === 'passed';
  const coverage = parseAs(Coverage, {
    selected: 1, required: 1, attempted: 1, observed: 1,
    passed: outcome === 'passed' ? 1 : 0, blocked: outcome === 'blocked' ? 1 : 0, excluded: 0,
    requiredCells: [],
    expectedSteps: input.expectedStepIds.length,
    completedSteps,
    requiredAssertions: requiredAssertions.length,
    passedRequiredAssertions: passedRequired,
  }, 'coverage');
  return { outcome, reasonCodes: [...new Set(reasons)], proofEligible, coverage };
}

export function reduceCampaign(input: { scope: Scope; campaignId: string; requestRef: Ref; selection: SelectionManifest; receipts: ExecutionReceipt[] }): CampaignResult {
  const byCell = new Map<string, ExecutionReceipt[]>();
  for (const receipt of input.receipts) {
    const list = byCell.get(receipt.selectionCellId) ?? [];
    list.push(receipt);
    byCell.set(receipt.selectionCellId, list);
  }
  const missing: string[] = [];
  const cellReceiptRefs: Array<{ selectionCellId: string; receiptRef: Ref }> = [];
  const requiredCells: Array<{ selectionCellId: string; outcome: string }> = [];
  const outcomes: Outcome[] = [];
  let duplicate = false;
  for (const cell of input.selection.cells) {
    const list = byCell.get(cell.selectionCellId) ?? [];
    if (list.length === 0) { missing.push(cell.selectionCellId); if (cell.required) requiredCells.push({ selectionCellId: cell.selectionCellId, outcome: 'missing' }); continue; }
    if (list.length > 1) duplicate = true;
    const receipt = list[0]!;
    // The receipt must bind its own cell's case/persona/binding, never another cell's defaults.
    const bound = receipt.caseRef.digest.hex === cell.caseRef.digest.hex && receipt.personaRef.digest.hex === cell.personaRef.digest.hex && receipt.surfaceBindingRef.digest.hex === cell.surfaceBindingRef.digest.hex;
    const outcome: Outcome = bound ? receipt.outcome : 'inconclusive';
    cellReceiptRefs.push({ selectionCellId: cell.selectionCellId, receiptRef: receipt.ref });
    if (cell.required) { requiredCells.push({ selectionCellId: cell.selectionCellId, outcome: bound ? outcome : 'relabeled_receipt' }); outcomes.push(outcome); }
  }
  const unknownCells = [...byCell.keys()].filter((id) => !input.selection.cells.some((cell) => cell.selectionCellId === id));
  const requiredCount = input.selection.cells.filter((c) => c.required).length;
  let outcome: Outcome;
  if (requiredCount === 0) outcome = 'inconclusive';
  else if (duplicate || unknownCells.length > 0) outcome = 'inconclusive';
  else if (outcomes.some((o) => o === 'assertion_failed')) outcome = 'assertion_failed';
  else if (missing.length > 0 && requiredCells.some((c) => c.outcome === 'missing')) outcome = 'inconclusive';
  else if (outcomes.some((o) => o === 'blocked')) outcome = 'blocked';
  else if (outcomes.some((o) => o === 'infrastructure_failed')) outcome = 'infrastructure_failed';
  else if (outcomes.some((o) => o === 'cancelled')) outcome = 'cancelled';
  else if (outcomes.some((o) => o === 'inconclusive')) outcome = 'inconclusive';
  else outcome = 'passed';
  const receiptsForCoverage = input.receipts;
  const coverage = parseAs(Coverage, {
    selected: input.selection.cells.length,
    required: requiredCount,
    attempted: cellReceiptRefs.length,
    observed: cellReceiptRefs.length,
    passed: receiptsForCoverage.filter((r) => r.outcome === 'passed').length,
    blocked: receiptsForCoverage.filter((r) => r.outcome === 'blocked').length,
    excluded: input.selection.excludedCells.length,
    requiredCells,
    expectedSteps: receiptsForCoverage.reduce((n, r) => n + r.coverage.expectedSteps, 0),
    completedSteps: receiptsForCoverage.reduce((n, r) => n + r.coverage.completedSteps, 0),
    requiredAssertions: receiptsForCoverage.reduce((n, r) => n + r.coverage.requiredAssertions, 0),
    passedRequiredAssertions: receiptsForCoverage.reduce((n, r) => n + r.coverage.passedRequiredAssertions, 0),
  }, 'campaign coverage');
  const result = freeze({
    schemaVersion: 'workflow.campaign-result/v1' as const,
    ref: { id: `${input.campaignId}.result`, revision: '1' },
    scope: input.scope,
    campaignId: input.campaignId,
    requestRef: input.requestRef,
    selectionManifestRef: input.selection.ref,
    cellReceiptRefs,
    missingCellIds: missing,
    coverage,
    outcome,
    proofEligible: outcome === 'passed',
    finalizedAt: nowIso(),
  });
  return parseAs(CampaignResult, result, 'campaign result');
}

export function compareTargets(expected: TargetTuple, observed: TargetTuple | null): { matched: boolean | null; mismatches: string[] } {
  if (!observed) return { matched: null, mismatches: ['no observed target'] };
  const mismatches: string[] = [];
  for (const field of Object.keys(expected) as Array<keyof TargetTuple>) {
    if (field !== 'components' && !jsonEqual(expected[field], observed[field])) mismatches.push(`${field}: identity differs`);
  }
  for (const componentId of expected.requiredComponents) {
    const exp = expected.components.find((c) => c.componentId === componentId);
    const obs = observed.components.find((c) => c.componentId === componentId);
    if (!exp || !exp.identity) { mismatches.push(`${componentId}: expected identity missing`); continue; }
    if (!obs || !obs.identity) { mismatches.push(`${componentId}: not observed`); continue; }
    if (exp.kind !== obs.kind) mismatches.push(`${componentId}: component kind differs`);
    if (digestOfValue(exp.identity).hex !== digestOfValue(obs.identity).hex) mismatches.push(`${componentId}: identity differs`);
  }
  if (mismatches.some((m) => m.endsWith('not observed'))) return { matched: null, mismatches };
  return { matched: mismatches.length === 0, mismatches };
}
