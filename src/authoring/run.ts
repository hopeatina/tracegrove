/**
 * `tracegrove test`: compile, plan, run, then write a human-named run folder with
 * summary.md, summary.json, junit.xml, the frozen request and the verified evidence bundle.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadProject, localScope } from '../core/corpus.ts';
import { plan, type FrozenBundle } from '../core/planner.ts';
import { executeBundle, type RunSummary } from '../core/executor.ts';
import { LocalLedger } from '../core/ledger.ts';
import { delegateRun } from '../core/controller.ts';
import { verifyBundle } from '../core/bundle.ts';
import { Conflict } from '../core/errors.ts';
import { BrowserObservation, NativeJobObservation, McpToolObservation, type ExecutionReceipt } from '../protocol/index.ts';
import { runVideos } from './media.ts';
import type { RunVideo } from './schema.ts';
import { STATE_DIR, compileProject, type CompileOptions, type CompileResult, type CompiledFlowInfo } from './compile.ts';
import type { VerificationSourceBinding } from './sourceSelection.ts';

export type StepReport = { id: string; name: string; method: string; path: string; result: string; status: number | null; durationMs: number | null; reason: string | null; observedText?: string | null };
export type CaseReport = {
  caseId: string; file: string; title: string; outcome: string; durationMs: number;
  steps: StepReport[]; failure: { step: string; message: string; observed: string | null } | null;
  videos?: RunVideo[];
};
export type TestRunReport = {
  schemaVersion: 'tracegrove.run-summary/v1';
  project: string; outcome: string; exitCode: number; startedAt: string; finishedAt: string;
  executionId: string | null; sourceDigest: string; runDir: string; bundleVerified: boolean | null;
  blockers: Array<{ code: string; detail: string; action: string }>;
  cases: CaseReport[];
  totals: { passed: number; failed: number; other: number };
  sourceBinding?: VerificationSourceBinding | null;
};

const OUTCOME_LABEL: Record<string, string> = { passed: 'pass', assertion_failed: 'fail', blocked: 'blocked', infrastructure_failed: 'error', inconclusive: 'inconclusive', cancelled: 'cancelled' };

function sourceLabel(source: TestRunReport['sourceBinding']): string {
  if (!source) return 'not recorded';
  return source.kind === 'working_tree' ? 'working tree' : `local snapshot ${source.commit} · ${source.files} files · sha256:${source.ref.digest.hex}`;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

function excerpt(value: unknown, max = 240): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text && text.length > max ? `${text.slice(0, max)}…` : text ?? '';
}

function observedLine(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const mcp = McpToolObservation.safeParse(output);
  if (mcp.success) return `MCP ${mcp.data.endpoint} ${mcp.data.tool} -> ${mcp.data.isError ? 'tool error' : 'result'} ${excerpt(mcp.data.structuredContent ?? mcp.data.content)}`;
  const o = output as { method?: string; url?: string; status?: number; body?: unknown; bodyText?: string | null };
  const path = o.url ? o.url.replace(/^https?:\/\/[^/]+/, '') : '';
  return `${o.method ?? ''} ${path} -> ${o.status ?? '?'} ${excerpt(o.body ?? o.bodyText ?? '')}`.trim();
}

function caseReport(receipt: ExecutionReceipt, flow: CompiledFlowInfo | undefined): CaseReport {
  const stepInfo = new Map((flow?.steps ?? []).map((s) => [s.id, s]));
  const steps: StepReport[] = receipt.steps.map((s) => {
    const info = stepInfo.get(s.stepId);
    const output = s.output as { status?: number } | null;
    const browser = BrowserObservation.safeParse(s.output);
    const job = NativeJobObservation.safeParse(s.output);
    const mcp = McpToolObservation.safeParse(s.output);
    return { id: s.stepId, name: info?.name ?? s.stepId, method: info?.method ?? '', path: info?.path ?? '', result: s.result, status: typeof output?.status === 'number' ? output.status : null, durationMs: s.timing?.durationMs ?? null, reason: s.reasonCode,
      ...(mcp.success ? { observedText: observedLine(mcp.data) } : browser.success ? { observedText: browser.data.text === null ? null : excerpt(browser.data.text, 500) } : job.success ? { observedText: `${job.data.action}: ${job.data.status}\n${excerpt(JSON.stringify(job.data.output, null, 2), 800)}` } : {}) };
  });
  let failure: CaseReport['failure'] = null;
  const failedStep = receipt.steps.find((s) => s.result === 'failed' || s.result === 'cancelled');
  const failedAssertion = receipt.assertions.find((a) => a.result !== 'pass');
  if (receipt.outcome === 'blocked' && receipt.steps.every(step => step.result === 'not_run')) {
    failure = { step: '(before steps)', message: receipt.reasonCodes.join(', ') || 'blocked before steps', observed: null };
  } else if (failedStep) {
    const name = stepInfo.get(failedStep.stepId)?.name ?? failedStep.stepId;
    const status = failedStep.reasonCode?.match(/^unexpected_status:(\d+)$/);
    const expected = receipt.assertions.find((a) => a.assertionId === `${failedStep.stepId}.expect`);
    const want = stepInfo.get(failedStep.stepId)?.expectStatus;
    failure = { step: name, message: status ? `expected status ${want ?? '?'}, got ${status[1]}` : failedStep.reasonCode ?? 'failed', observed: observedLine(failedStep.output) };
    if (!status && expected?.reasonCode) failure.message = `${failure.message} (${expected.reasonCode})`;
  } else if (failedAssertion) {
    const stepId = failedAssertion.assertionId.replace(/\.expect$/, '');
    const step = receipt.steps.find((s) => s.stepId === stepId);
    failure = { step: stepInfo.get(stepId)?.name ?? stepId, message: failedAssertion.reasonCode ?? `assertion ${failedAssertion.result}`, observed: observedLine(step?.output) };
  } else if (receipt.outcome !== 'passed') {
    failure = { step: '(case)', message: receipt.reasonCodes.join(', ') || receipt.outcome, observed: null };
  }
  const durationMs = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  return { caseId: receipt.caseRef.id, file: flow?.file ?? '', title: flow?.title ?? receipt.caseRef.id, outcome: receipt.outcome, durationMs, steps, failure, videos: runVideos(receipt) };
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderJunit(report: TestRunReport): string {
  const failures = report.cases.filter((c) => c.outcome === 'assertion_failed').length;
  const errors = report.cases.filter((c) => c.outcome !== 'passed' && c.outcome !== 'assertion_failed').length + (report.cases.length === 0 && report.blockers.length ? 1 : 0) + (report.bundleVerified === false ? 1 : 0);
  const body = report.cases.map((c) => {
    const time = (c.durationMs / 1000).toFixed(3);
    const head = `    <testcase classname="${xml(report.project)}" name="${xml(c.caseId)}" file="${xml(c.file)}" time="${time}">`;
    if (c.outcome === 'passed') return `${head}</testcase>`;
    const tag = c.outcome === 'assertion_failed' ? 'failure' : 'error';
    const message = c.failure ? `${c.failure.step}: ${c.failure.message}` : c.outcome;
    return `${head}\n      <${tag} message="${xml(message)}" type="${xml(c.outcome)}">${xml(c.failure?.observed ?? '')}</${tag}>\n    </testcase>`;
  });
  if (report.cases.length === 0 && report.blockers.length) {
    body.push(`    <testcase classname="${xml(report.project)}" name="plan"><error message="blocked" type="blocked">${xml(report.blockers.map((b) => `${b.code}: ${b.detail}`).join('\n'))}</error></testcase>`);
  }
  if (report.bundleVerified === false) body.push(`    <testcase classname="${xml(report.project)}" name="evidence-integrity"><error message="Evidence bundle verification failed" type="inconclusive">See bundle-problems.txt in this run.</error></testcase>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="tracegrove" tests="${Math.max(report.cases.length, body.length)}" failures="${failures}" errors="${errors}">\n  <testsuite name="${xml(report.project)}" tests="${body.length}" failures="${failures}" errors="${errors}" timestamp="${report.startedAt}">\n${body.join('\n')}\n  </testsuite>\n</testsuites>\n`;
}

export function renderText(report: TestRunReport, root: string): string {
  const lines = [`tracegrove · ${report.project} · app sha ${report.sourceDigest.slice(0, 12)}`, `input request: ${sourceLabel(report.sourceBinding)}`, ''];
  for (const b of report.blockers) lines.push(`  BLOCKED  ${b.code}: ${b.detail}`, `           fix: ${b.action}`);
  for (const c of report.cases) {
    const label = (OUTCOME_LABEL[c.outcome] ?? c.outcome).toUpperCase().padEnd(7);
    lines.push(`  ${label} ${c.caseId.padEnd(36)} ${String(c.steps.length).padStart(2)} steps  ${c.durationMs} ms`);
    if (c.failure) {
      const [first, ...rest] = c.failure.message.split('\n');
      lines.push(`          ${c.failure.step.startsWith('(') ? c.failure.step : `step "${c.failure.step}"`}: ${first}`, ...rest.map((line) => `          | ${line}`));
      if (c.failure.observed) lines.push(`          ${c.failure.observed}`);
    }
  }
  const t = report.totals;
  lines.push('', `${t.passed} passed, ${t.failed} failed${t.other ? `, ${t.other} other` : ''} · run ${relative(root, report.runDir) || report.runDir}${report.bundleVerified === false ? ' · BUNDLE INVALID' : ''}`);
  return lines.join('\n');
}

export function renderMarkdown(report: TestRunReport): string {
  const lines = [`# tracegrove run: ${report.outcome}`, '', `- Project: \`${report.project}\``, `- Started: ${report.startedAt}`, `- App source digest: \`${report.sourceDigest}\``, `- Execution: \`${report.executionId ?? 'none'}\``, `- Evidence bundle verified: ${report.bundleVerified === null ? 'n/a' : report.bundleVerified ? 'yes' : '**no**'}`, ''];
  lines.push(`Input request: ${sourceLabel(report.sourceBinding)}`, '');
  if (report.blockers.length) {
    lines.push('## Blocked', '', ...report.blockers.map((b) => `- **${b.code}**: ${b.detail}. Fix: ${b.action}`), '');
  }
  if (report.cases.length) {
    lines.push('| Result | Flow | File | Steps | ms |', '| --- | --- | --- | --- | --- |');
    for (const c of report.cases) lines.push(`| ${OUTCOME_LABEL[c.outcome] ?? c.outcome} | ${c.caseId} | \`${c.file}\` | ${c.steps.length} | ${c.durationMs} |`);
    for (const c of report.cases) {
      lines.push('', `## ${c.caseId}`, '', c.title, '');
      if (c.failure) lines.push(`**Failed at "${c.failure.step}"**: ${c.failure.message}`, '', ...(c.failure.observed ? ['```text', c.failure.observed, '```', ''] : []));
      lines.push('| Step | Request | Result | Status | ms |', '| --- | --- | --- | --- | --- |');
      for (const s of c.steps) lines.push(`| ${s.name} | \`${s.method} ${s.path}\` | ${s.result}${s.reason ? ` (${s.reason})` : ''} | ${s.status ?? ''} | ${s.durationMs ?? ''} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export type TestOptions = CompileOptions & {
  configPath: string;
  signal?: AbortSignal;
  onEvent?: (event: { kind: string; stepId: string | null; redactedPayload: Record<string, unknown>; at: string }) => void;
};

export async function runTests(options: TestOptions): Promise<{ report: TestRunReport; compiled: CompileResult }> {
  const startedAt = new Date();
  const compiled = compileProject(options.configPath, { grep: options.grep, tags: options.tags, sourceSnapshot: options.sourceSnapshot });
  const project = loadProject(compiled.workflowConfigPath);
  const scope = localScope();
  const bundle: FrozenBundle = plan({ project, profileName: 'real', scope });
  const runsDir = join(compiled.root, STATE_DIR, 'runs');
  const stateDir = join(compiled.root, STATE_DIR, 'state');
  let summary: RunSummary | null = null;
  if (bundle.request) {
    let ledger: LocalLedger | null = null;
    try { ledger = LocalLedger.open(stateDir); } catch (error) { if (!(error instanceof Conflict)) throw error; }
    try {
      summary = ledger
        ? await executeBundle({ bundle, stateDir, ledger, scope, ...(options.signal ? { signal: options.signal } : {}), ...(options.onEvent ? { onEvent: options.onEvent } : {}) })
        : await delegateRun(stateDir, bundle, options.signal ?? new AbortController().signal);
    } finally { ledger?.close(); }
  }
  let outcome = summary?.outcome ?? 'blocked';
  const runPath = (result: string) => join(runsDir, `${stamp(startedAt)}_${OUTCOME_LABEL[result] ?? result}_${(summary?.executionId ?? 'plan').replace(/[^A-Za-z0-9]/g, '').slice(-6)}`);
  let runDir = runPath(outcome);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'request.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  let bundleVerified: boolean | null = null;
  if (summary) {
    const target = join(runDir, 'bundle');
    cpSync(summary.executionDir, target, { recursive: true, filter: (src) => !relative(summary!.executionDir, src).startsWith('host') });
    const verification = verifyBundle(target);
    bundleVerified = verification.ok;
    if (!verification.ok) writeFileSync(join(runDir, 'bundle-problems.txt'), `${verification.problems.join('\n')}\n`);
  }
  if (bundleVerified === false && outcome === 'passed') {
    outcome = 'inconclusive';
    const destination = runPath(outcome);
    renameSync(runDir, destination);
    runDir = destination;
  }
  const flowsById = new Map(compiled.flows.map((f) => [f.caseId, f]));
  const cases = (summary?.receipts ?? []).map((r) => {
    const report = caseReport(r, flowsById.get(r.caseRef.id));
    // A host that never started explains every not_run step; surface its sealed message.
    const events = join(runDir, 'bundle', 'cells', r.selectionCellId, 'events.jsonl');
    if (report.outcome !== 'passed' && existsSync(events)) {
      const hostFailed = readFileSync(events, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { kind: string; redactedPayload: { error?: string } }).find((e) => e.kind === 'host.failed');
      if (hostFailed) report.failure = { step: '(app startup)', message: hostFailed.redactedPayload.error ?? 'host failed', observed: null };
    }
    return report;
  });
  const report: TestRunReport = {
    schemaVersion: 'tracegrove.run-summary/v1',
    project: compiled.config.project, outcome, exitCode: summary?.exitCode ?? 2,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    executionId: summary?.executionId ?? null, sourceDigest: compiled.sourceDigest, runDir, bundleVerified,
    sourceBinding: compiled.sourceBinding,
    blockers: bundle.blockers.map((b) => ({ code: b.code, detail: b.detail, action: b.action })),
    cases,
    totals: { passed: cases.filter((c) => c.outcome === 'passed').length, failed: cases.filter((c) => c.outcome === 'assertion_failed').length, other: cases.filter((c) => c.outcome !== 'passed' && c.outcome !== 'assertion_failed').length },
  };
  if (bundleVerified === false && report.exitCode === 0) report.exitCode = 2;
  writeFileSync(join(runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(runDir, 'summary.md'), renderMarkdown(report));
  writeFileSync(join(runDir, 'junit.xml'), renderJunit(report));
  const latest = join(runsDir, 'latest');
  rmSync(latest, { force: true, recursive: true });
  try { symlinkSync(relative(runsDir, runDir), latest); } catch { writeFileSync(latest, `${relative(runsDir, runDir)}\n`); }
  return { report, compiled };
}

/** Resolve `latest` (symlink or pointer file) or a run folder name to its absolute path. */
export function resolveRun(root: string, name: string): string | null {
  const runsDir = join(root, STATE_DIR, 'runs');
  if (!existsSync(runsDir)) return null;
  if (name === 'latest') {
    const latest = join(runsDir, 'latest');
    if (!existsSync(latest)) return null;
    return join(runsDir, lstatSync(latest).isSymbolicLink() ? readlinkSync(latest) : readFileSync(latest, 'utf8').trim());
  }
  const match = readdirSync(runsDir).filter((entry) => entry !== 'latest' && entry.includes(name)).sort().at(-1);
  return match ? join(runsDir, match) : null;
}
