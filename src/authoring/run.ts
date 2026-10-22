/**
 * `tracegrove test`: compile, plan, run, then write a human-named run folder with
 * summary.md, summary.json, junit.xml, the frozen request and the verified evidence bundle.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { loadProject, localScope } from '../core/corpus.ts';
import { plan, type FrozenBundle } from '../core/planner.ts';
import { executeBundle, type RunSummary } from '../core/executor.ts';
import { LocalLedger } from '../core/ledger.ts';
import { delegateRun } from '../core/controller.ts';
import { exportVerifiedBundle, verifyBundle } from '../core/bundle.ts';
import { createDurableDirectory } from '../core/atomicFiles.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { Conflict } from '../core/errors.ts';
import { BrowserObservation, NativeJobObservation, McpToolObservation, ConversationObservation, StandInObservation, CaseSpec, type ExecutionReceipt } from '../protocol/index.ts';
import { getPath } from '../core/reducer.ts';
import { comparedOf, expGot } from './checkCompare.ts';
import { runVideos } from './media.ts';
import { verifiedObservedRequests, type ObservedRequest } from './traffic.ts';
import { describeBlock } from '../core/blockCodes.ts';
import { STATE_DIR, compileProject, type CompileOptions, type CompileResult, type CompiledFlowInfo } from './compile.ts';
import type { VerificationSourceBinding } from './sourceSelection.ts';
import { detectAgent, enforceAgentPolicy, type AgentIdentity, type PolicyDecision } from '../environments/agents.ts';

import type { StepReport, CaseReport, TestRunReport } from './runReport.ts';
import { SavedRunName, invalidateRunReport } from './runReport.ts';
import { isRunDirectory } from './runLocation.ts';
export type { StepReport, CaseReport, TestRunReport, RunEnvironment } from './runReport.ts';
import type { RunEnvironment } from './runReport.ts';

/** A badge for any run that is not an isolated candidate (staging, canary, production observation). */
export function environmentBadge(environment: RunEnvironment | undefined): string | null {
  if (!environment || environment.class === 'isolated_candidate') return environment && environment.name !== 'local' ? `${environment.name} · ${environment.kind}` : null;
  return `${environment.name.toUpperCase()} · ${environment.class}${environment.writes === 'none' ? ' · read-only' : ''}`;
}

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
  const conversation = ConversationObservation.safeParse(output);
  if (conversation.success) return conversationLine(conversation.data);
  const mcp = McpToolObservation.safeParse(output);
  if (mcp.success) return `MCP ${mcp.data.endpoint} ${mcp.data.tool} -> ${mcp.data.isError ? 'tool error' : 'result'} ${excerpt(mcp.data.structuredContent ?? mcp.data.content)}`;
  const standIn = StandInObservation.safeParse(output);
  if (standIn.success) return standInLine(standIn.data);
  const browser = BrowserObservation.safeParse(output);
  if (browser.success) return browser.data.text === null ? `${browser.data.kind} -> ${browser.data.status ?? 'completed'}` : excerpt(browser.data.text);
  const o = output as { method?: string; url?: string; status?: number; body?: unknown; bodyText?: string | null };
  const path = o.url ? o.url.replace(/^https?:\/\/[^/]+/, '') : '';
  return `${o.method ?? ''} ${path} -> ${o.status ?? '?'} ${excerpt(o.body ?? o.bodyText ?? '')}`.trim();
}

function conversationLine(observation: ConversationObservation): string {
  return observation.turns.map((turn) => {
    const tool = (call: ConversationObservation['turns'][number]['toolCalls'][number], when: string) => `  ${when}tool ${call.name}(${excerpt(call.arguments, 160)}) -> ${excerpt(call.result, 160)}`;
    // Where the agent's speech and its tool calls interleave is evidence too: "booked" said before the booking answered is a bug.
    const before = turn.toolCalls.filter((call) => call.spokenBefore === 0);
    const after = turn.toolCalls.filter((call) => call.spokenBefore !== 0);
    return [`caller: ${turn.say}`, ...before.map((call) => tool(call, 'before replying, ')),
      `agent: ${turn.reply || '(no reply)'}${turn.firstReplyMs !== null ? `  [${turn.firstReplyMs} ms]` : ''}`,
      ...after.map((call) => tool(call, call.spokenBefore === undefined ? 'during this turn, ' : `after saying "${excerpt(turn.reply.slice(Math.max(0, call.spokenBefore - 40), call.spokenBefore), 60)}", `))].join('\n');
  }).join('\n');
}

function standInLine(o: StandInObservation): string {
  const where = o.route ? ` ${o.route.method} ${o.route.path}` : '';
  return [`${o.standIn}${where} received ${o.count} call${o.count === 1 ? '' : 's'}`,
    ...o.calls.slice(0, 5).map((c, i) => `  ${i + 1}. ${c.method} ${c.path} ${excerpt(c.json ?? c.text ?? '', 90)} -> ${c.status === 0 ? 'dropped' : c.status}${c.faulted ? ' (fault)' : ''}`),
    ...(o.calls.length > 5 ? [`  … ${o.calls.length - 5} more`] : [])].join('\n');
}

type Assertions = CaseSpec['assertions'];
const brief = (value: unknown) => { const text = JSON.stringify(value) ?? 'nothing'; return text.length > 80 ? `${text.slice(0, 77)}…` : text; };

/** "body.x differs" says where, not what: add the observed and expected values from the sealed spec and evidence. */
function explainDiffers(message: string, output: unknown, assertions: Assertions, stepId: string): string {
  const m = message.match(/^(\S+) differs$/);
  if (!m) return message;
  type P = Assertions[number]['predicate'];
  const flat = (p: P): P[] => p.kind === 'all' ? p.predicates.flatMap(flat) : [p];
  const predicate = assertions.filter((a) => a.stepId === stepId).flatMap((a) => flat(a.predicate)).find((p) => p.kind === 'json_path_equals' && p.path === m[1]);
  if (!predicate || predicate.kind !== 'json_path_equals') return message;
  const o = output as { status?: unknown; body?: unknown } | null;
  const got = [getPath({ body: output }, m[1]!), getPath({ status: o?.status, body: o?.body }, m[1]!)].find((g) => g.present);
  return `${m[1]} is ${got ? brief(got.value) : 'missing'}, expected ${brief(predicate.value)}`;
}

export function caseReport(receipt: ExecutionReceipt, flow: CompiledFlowInfo | undefined, assertions: Assertions = []): CaseReport {
  const stepInfo = new Map((flow?.steps ?? []).map((s) => [s.id, s]));
  const steps: StepReport[] = receipt.steps.map((s) => {
    const info = stepInfo.get(s.stepId);
    const output = s.output as { status?: number } | null;
    const browser = BrowserObservation.safeParse(s.output);
    const job = NativeJobObservation.safeParse(s.output);
    const mcp = McpToolObservation.safeParse(s.output);
    const conversation = ConversationObservation.safeParse(s.output);
    const standIn = StandInObservation.safeParse(s.output);
    const own = receipt.assertions.filter((a) => a.assertionId.replace(/\.expect$/, '') === s.stepId);
    // The check that failed here, as the run recorded it against its declared predicate: what it expected, and what it got.
    const failed = own.find((a) => a.result === 'fail' && a.reasonCode);
    const declared = failed && assertions.find((a) => a.id === failed.assertionId);
    const compared = failed && declared ? comparedOf(declared.predicate, failed, { method: info?.method ?? '', path: info?.path ?? '' }) : null;
    // What the app answered an HTTP step, as recorded.
    const http = output && !standIn.success && !conversation.success && !mcp.success && !browser.success && !job.success && typeof output.status === 'number' ? output as { body?: unknown; bodyText?: string | null } : null;
    const body = http ? http.body ?? http.bodyText ?? null : null;
    return { id: s.stepId, name: info?.name ?? s.stepId, method: info?.method ?? '', path: info?.path ?? '', result: s.result, status: typeof output?.status === 'number' ? output.status : null, durationMs: s.timing?.durationMs ?? null, reason: s.reasonCode,
      declared: !!info, expectStatus: info?.expectStatus ?? null, ...(info?.expectation ? { expectation: info.expectation } : {}),
      ...(own.length && s.result === 'completed' ? { checks: own.every((a) => a.result === 'pass') ? 'pass' as const : 'fail' as const } : {}),
      ...(compared ? { compared } : {}), ...(body !== null && body !== '' ? { answer: excerpt(body, 4096) } : {}),
      ...(standIn.success ? { observedText: standInLine(standIn.data) } : conversation.success ? { observedText: conversationLine(conversation.data) } : mcp.success ? { observedText: observedLine(mcp.data) } : browser.success ? { observedText: browser.data.text === null ? null : excerpt(browser.data.text, 500) } : job.success ? { observedText: `${job.data.action}: ${job.data.status}\n${excerpt(JSON.stringify(job.data.output, null, 2), 800)}` } : {}) };
  });
  let failure: CaseReport['failure'] = null;
  const order = new Map(receipt.steps.map((s, index) => [s.stepId, index]));
  const failedAssertion = receipt.assertions.filter((a) => a.result !== 'pass')
    .sort((a, b) => (order.get(a.assertionId.replace(/\.expect$/, '')) ?? 1e9) - (order.get(b.assertionId.replace(/\.expect$/, '')) ?? 1e9))[0];
  const firstFailedStep = receipt.steps.find((s) => s.result === 'failed' || s.result === 'cancelled');
  // A readback that completed but disagreed comes before a later step that then failed because of it.
  const failedStep = firstFailedStep && failedAssertion && (order.get(failedAssertion.assertionId.replace(/\.expect$/, '')) ?? 1e9) < (order.get(firstFailedStep.stepId) ?? 0) ? undefined : firstFailedStep;
  if (receipt.outcome === 'blocked' && receipt.steps.every(step => step.result === 'not_run')) {
    failure = { step: '(before steps)', message: receipt.reasonCodes.join(', ') || 'blocked before steps', observed: null };
  } else if (failedStep) {
    const name = stepInfo.get(failedStep.stepId)?.name ?? failedStep.stepId;
    const status = failedStep.reasonCode?.match(/^unexpected_status:(\d+)$/);
    const expected = receipt.assertions.find((a) => a.assertionId === `${failedStep.stepId}.expect`);
    const want = stepInfo.get(failedStep.stepId)?.expectStatus;
    failure = { step: name, message: status ? `expected status ${want ?? '?'}, got ${status[1]}` : failedStep.reasonCode ? explainDiffers(failedStep.reasonCode, failedStep.output, assertions, failedStep.stepId) : 'failed', observed: observedLine(failedStep.output) };
    if (!status && expected?.reasonCode && expected.reasonCode !== failedStep.reasonCode) failure.message = `${failure.message} (${expected.reasonCode})`;
    const caseLevel = receipt.reasonCodes.filter(code => code !== failedStep.reasonCode && !code.startsWith('unexpected_status') && !code.startsWith('assertion_'));
    if (caseLevel.length) failure.message = `${failure.message}\nalso: ${caseLevel.join(', ')}`;
  } else if (failedAssertion) {
    const stepId = failedAssertion.assertionId.replace(/\.expect$/, '');
    const step = receipt.steps.find((s) => s.stepId === stepId);
    const standIn = StandInObservation.safeParse(step?.output);
    // A count it can compare is said in the one wording the verdict, grow --json and the page use (checkCompare's expGot:
    // "expected 2 charges, got 3"); with no recorded check to read, the compiled expectation ("2 calls received").
    const compared = steps.find((x) => x.id === stepId)?.compared;
    const said = compared ? expGot(compared) : null;
    const counted = !standIn.success || !/^body\.count\b/.test(failedAssertion.reasonCode ?? '') ? null
      : said ? said.charAt(0).toLowerCase() + said.slice(1)
      : `expected ${(stepInfo.get(stepId)?.expectation ?? 'a different call count').replace(/ received$/, '')}, got ${standIn.data.count}`;
    const message = counted ?? (failedAssertion.reasonCode ? explainDiffers(failedAssertion.reasonCode, step?.output, assertions, stepId) : `assertion ${failedAssertion.result}`);
    failure = { step: stepInfo.get(stepId)?.name ?? stepId, message, observed: observedLine(step?.output) };
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
  const planningBlocked = report.cases.length === 0 && report.blockers.length > 0 && report.bundleVerified !== false;
  const errors = report.cases.filter((c) => c.outcome !== 'passed' && c.outcome !== 'assertion_failed').length + (planningBlocked ? 1 : 0) + (report.bundleVerified === false ? 1 : 0);
  const body = report.cases.map((c) => {
    const time = (c.durationMs / 1000).toFixed(3);
    const head = `    <testcase classname="${xml(report.project)}" name="${xml(c.caseId)}" file="${xml(c.file)}" time="${time}">`;
    if (c.outcome === 'passed') return `${head}</testcase>`;
    const tag = c.outcome === 'assertion_failed' ? 'failure' : 'error';
    const message = c.failure ? `${c.failure.step}: ${c.failure.message}` : c.outcome;
    return `${head}\n      <${tag} message="${xml(message)}" type="${xml(c.outcome)}">${xml(c.failure?.observed ?? '')}</${tag}>\n    </testcase>`;
  });
  if (planningBlocked) {
    body.push(`    <testcase classname="${xml(report.project)}" name="plan"><error message="blocked" type="blocked">${xml(report.blockers.map((b) => `${b.code}: ${b.detail}`).join('\n'))}</error></testcase>`);
  }
  if (report.bundleVerified === false) body.push(`    <testcase classname="${xml(report.project)}" name="evidence-integrity"><error message="Evidence bundle verification failed" type="inconclusive">See bundle-problems.txt in this run.</error></testcase>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="tracegrove" tests="${Math.max(report.cases.length, body.length)}" failures="${failures}" errors="${errors}">\n  <testsuite name="${xml(report.project)}" tests="${body.length}" failures="${failures}" errors="${errors}" timestamp="${report.startedAt}">\n${body.join('\n')}\n  </testsuite>\n</testsuites>\n`;
}

export function renderText(report: TestRunReport, root: string): string {
  const badge = environmentBadge(report.environment);
  const lines = [`tracegrove · ${report.project} · ${report.environment && report.environment.kind !== 'launch' ? 'target' : 'app'} sha ${report.sourceDigest.slice(0, 12)}${badge ? ` · [${badge}]` : ''}`, `input request: ${sourceLabel(report.sourceBinding)}`, ''];
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
  if (report.executionId) lines.push(`execution ${report.executionId}${report.stateDir ? ` · state ${report.stateDir}` : ' · state directory not recorded'}`);
  return lines.join('\n');
}

export function renderMarkdown(report: TestRunReport): string {
  const lines = [`# tracegrove run: ${report.outcome}`, '', `- Project: \`${report.project}\``,
    ...(report.environment ? [`- Environment: \`${report.environment.name}\` (${report.environment.class}, writes ${report.environment.writes}${report.environment.origin ? `, ${report.environment.origin}` : ''})`] : []), `- Started: ${report.startedAt}`, `- App source digest: \`${report.sourceDigest}\``, `- Execution: \`${report.executionId ?? 'none'}\``, `- Evidence bundle verified: ${report.bundleVerified === null ? 'n/a' : report.bundleVerified ? 'yes' : '**no**'}`, ''];
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
  /** Who is running: detected from the process environment unless given (see environments/agents.ts). */
  agent?: AgentIdentity;
  signal?: AbortSignal;
  onEvent?: (event: { kind: string; stepId: string | null; redactedPayload: Record<string, unknown>; at: string }) => void;
};

export async function runTests(options: TestOptions): Promise<{ report: TestRunReport; compiled: CompileResult }> {
  const startedAt = new Date();
  const compiled = compileProject(options.configPath, { grep: options.grep, tags: options.tags, sourceSnapshot: options.sourceSnapshot, sourceRepositoryRole: options.sourceRepositoryRole, env: options.env });
  const policy = enforceAgentPolicy(compiled.root, compiled.environment, options.agent ?? detectAgent(process.env));
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
  const envPart = compiled.environment.name === 'local' ? '' : `${compiled.environment.name.replace(/[^A-Za-z0-9-]/g, '')}_`;
  const runPath = (result: string) => join(runsDir, `${stamp(startedAt)}_${OUTCOME_LABEL[result] ?? result}_${envPart}${(summary?.executionId ?? 'plan').replace(/[^A-Za-z0-9]/g, '').slice(-6)}`);
  let runDir = runPath(outcome);
  createDurableDirectory(runDir);
  writeFileSync(join(runDir, 'request.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  let bundleVerified: boolean | null = null;
  if (summary) {
    const target = join(runDir, 'bundle');
    try {
      const publication = exportVerifiedBundle(summary.executionDir, target);
      const verification = publication.ok ? verifyBundle(target) : publication;
      bundleVerified = verification.ok;
      if (!verification.ok) writeFileSync(join(runDir, 'bundle-problems.txt'), `${verification.problems.join('\n')}\n`);
    } catch {
      bundleVerified = false;
      writeFileSync(join(runDir, 'bundle-problems.txt'), 'Evidence publication failed; preserve and inspect the original execution and publication state before retrying.\n');
    }
  }
  if (bundleVerified === false && outcome === 'passed') {
    outcome = 'inconclusive';
    const destination = runPath(outcome);
    renameSync(runDir, destination);
    runDir = destination;
  }
  const flowsById = new Map(compiled.flows.map((f) => [f.caseId, f]));
  const cases = (summary?.receipts ?? []).map((r) => {
    const spec = project.suiteCases.map((entry) => project.corpus.getAs(CaseSpec, entry.ref)).find((c) => c.ref.id === r.caseRef.id);
    const report = caseReport(r, flowsById.get(r.caseRef.id), spec?.assertions ?? []);
    // A host that never started explains every not_run step; surface its sealed message.
    const events = join(runDir, 'bundle', 'cells', r.selectionCellId, 'events.jsonl');
    if (bundleVerified && existsSync(events)) report.requests = verifiedObservedRequests(r, readFileSync(events));
    if (report.outcome !== 'passed' && existsSync(events)) {
      const parsed = readFileSync(events, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { kind: string; stepId?: string | null; redactedPayload: { error?: string; reasons?: Array<{ code: string; detail: string }>; entityKey?: string; code?: string; message?: string } });
      const hostFailed = parsed.find((e) => e.kind === 'host.failed');
      const hostBlocked = parsed.find((e) => e.kind === 'host.blocked');
      const fixtureFailed = parsed.find((e) => e.kind === 'fixture.failed');
      if (hostFailed) report.failure = { step: '(app startup)', message: hostFailed.redactedPayload.error ?? 'host failed', observed: null, code: hostFailed.redactedPayload.code ?? 'infrastructure' };
      else if (hostBlocked?.redactedPayload.reasons?.length) {
        const reasons = hostBlocked.redactedPayload.reasons;
        report.failure = { step: '(before steps)', message: reasons.map(r => `${r.code}: ${r.detail}`).join('\n'), observed: null,
          fix: describeBlock(reasons[0]!.code, { env: compiled.environment.name, persona: reasons[0]!.detail.match(/persona (\w+)/)?.[1] }).fix };
      } else if (fixtureFailed && report.steps.every(step => step.result === 'not_run')) {
        const code = fixtureFailed.redactedPayload.code ?? 'fixture_failed';
        report.failure = { step: `(fixture ${fixtureFailed.redactedPayload.entityKey ?? ''})`.replace(' )', ')'), message: `${code}: ${fixtureFailed.redactedPayload.message ?? ''}`, observed: null,
          fix: describeBlock(code, { env: compiled.environment.name }).fix ?? 'tracegrove show --run latest --json' };
        const others = r.reasonCodes.filter(c => c !== code && c !== 'step_not_run');
        if (others.length) report.failure.message += `\nalso: ${others.join(', ')}`;
      } else if (report.failure) {
        // A failed step with no observation (the request never produced one) keeps its sealed message.
        const failed = report.steps.find(step => step.name === report.failure!.step && step.reason);
        const finished = failed && parsed.find((e) => e.kind === 'step.finished' && e.stepId === failed.id && e.redactedPayload.message);
        if (finished && !report.failure.observed) report.failure.observed = String(finished.redactedPayload.message).slice(0, 500);
        const code = r.reasonCodes.find(c => describeBlock(c).fix !== null);
        if (code) report.failure.fix = describeBlock(code, { env: compiled.environment.name }).fix;
      }
    }
    return report;
  });
  const report: TestRunReport = {
    schemaVersion: 'tracegrove.run-summary/v1',
    project: compiled.config.project, outcome, exitCode: summary?.exitCode ?? 2,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    executionId: summary?.executionId ?? null, sourceDigest: compiled.sourceDigest, runDir, stateDir, bundleVerified,
    sourceBinding: compiled.sourceBinding,
    environment: { name: compiled.environment.name, class: compiled.environment.class, kind: compiled.environment.kind, origin: compiled.target?.origin ?? null, writes: compiled.environment.writes,
      expectedRelease: compiled.target?.expectedRelease ?? null, agent: policy.agent ? { name: policy.agent, policy: policy.policy, decision: policy.decision, ...(policy.approval ? { approvedBy: policy.approval.approvedBy, approvedAt: policy.approval.approvedAt } : {}) } : null },
    blockers: bundle.blockers.map((b) => { const described = describeBlock(b.code, { env: compiled.environment.name }, b.action); return { code: b.code, detail: b.detail, action: b.action, owner: described.owner, fix: described.fix, docs: described.docs }; }),
    cases,
    totals: { passed: cases.filter((c) => c.outcome === 'passed').length, failed: cases.filter((c) => c.outcome === 'assertion_failed').length, other: cases.filter((c) => c.outcome !== 'passed' && c.outcome !== 'assertion_failed').length },
  };
  if (bundleVerified === false) Object.assign(report, invalidateRunReport(report, 'Evidence could not be exported with matching sealed bytes.'));
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
    const target = resolve(runsDir, lstatSync(latest).isSymbolicLink() ? readlinkSync(latest) : readBoundedFile(latest, 2048).toString('utf8').trim());
    const name = relative(runsDir, target);
    return SavedRunName.safeParse(name).success && name !== 'latest' && isRunDirectory(target) ? target : null;
  }
  if (!SavedRunName.safeParse(name).success) return null;
  const match = readdirSync(runsDir).filter((entry) => entry !== 'latest' && entry.includes(name) && SavedRunName.safeParse(entry).success &&
    isRunDirectory(join(runsDir, entry))).sort().at(-1);
  return match ? join(runsDir, match) : null;
}
