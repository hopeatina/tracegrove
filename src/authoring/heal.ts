/**
 * `tracegrove heal`: look at what went wrong, fix what is safe to fix, prove each fix by
 * re-running, and keep only fixes that verify. Setup mistakes (wrong health path, missing
 * interpreter) are fixed deterministically in the config. Failing assertions go to the coding
 * agent, which must decide per case whether the test drifted or the product is wrong; a product
 * bug is reported, never papered over. Guards reject edits that delete steps, drop expectations
 * or flip an expected success into a failure (or back). Every kept change is backed up so
 * `tracegrove heal --undo <id>` restores it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { parse as parseYaml, parseDocument } from 'yaml';
import { Blocked } from '../core/errors.ts';
import { CONFIG_FILE, STATE_DIR, compileProject, loadAuthoringConfig } from './compile.ts';
import { runTests, type CaseReport, type TestRunReport } from './run.ts';
import { checkProject, discoverProject, type CheckIssue } from './workspace.ts';
import { detectAgents, resolveAgentSettings, runAgent, tracegroveCommand, type AgentOverrides } from './agent.ts';
import type { AuthoringConfig } from './schema.ts';

export type FindingKind = 'setup' | 'authoring' | 'test_drift' | 'product_bug' | 'assertion' | 'evidence' | 'infrastructure';
export type HealFinding = {
  kind: FindingKind; caseId: string | null; file: string | null; step: string | null;
  detail: string; fix: string; status: 'fixed' | 'open' | 'reported';
};
export type HealChange = {
  file: string; reason: string; diff: string; status: 'kept' | 'reverted' | 'rejected';
  by: 'tracegrove' | 'agent'; note: string | null;
};
export type HealVerdict = { caseId: string; verdict: 'test_drift' | 'product_bug' | 'unsure'; reason: string };
export type HealSnapshot = { outcome: string; exitCode: number; runDir: string | null; totals: TestRunReport['totals'] | null; issues: number };
export type HealReport = {
  schemaVersion: 'tracegrove.heal/v1';
  id: string; root: string; startedAt: string; finishedAt: string;
  outcome: 'healthy' | 'healed' | 'partly_healed' | 'product_bugs' | 'needs_human';
  exitCode: number;
  before: HealSnapshot; after: HealSnapshot;
  findings: HealFinding[]; changes: HealChange[];
  agent: { provider: string; model: string | null; exitCode: number; verdicts: HealVerdict[]; summary: string } | null;
  next: Array<{ command: string; why: string }>;
  reportPath: string;
};
export type HealOptions = {
  dir: string;
  /** Start from this run report instead of running the suite first (tracegrove test --heal). */
  report?: TestRunReport | undefined;
  agent?: boolean | undefined;
  overrides?: AgentOverrides | undefined;
  dryRun?: boolean | undefined;
  onProgress?: ((phase: string, detail?: string) => void) | undefined;
  onAgentOutput?: ((chunk: string) => void) | undefined;
  /** Readable lines of what the agent is doing (reading, editing, saying). */
  onAgentActivity?: ((line: string) => void) | undefined;
  signal?: AbortSignal | undefined;
};

export const HEALS_DIR = 'heals';
const VERDICT_TAG = 'TRACEGROVE_VERDICT';
const HEALTH_WORDS = /^\/(?:api\/)?(?:health|healthz|healthcheck|ready|readyz|readiness|livez|live|liveness|status|ping|up)(?:\/[\w-]*)?$/;

function stamp(date: Date): string { return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-'); }
function sha(text: string): string { return createHash('sha256').update(text).digest('hex'); }
function readText(path: string): string | null { try { return readFileSync(path, 'utf8'); } catch { return null; } }

/** A small line diff (LCS) good enough for config and flow files. */
export function lineDiff(before: string, after: string, name: string): string {
  const a = before.split('\n'); const b = after.split('\n');
  const n = a.length; const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const rows: Array<[' ' | '-' | '+', string]> = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push([' ', a[i]!]); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) rows.push(['-', a[i++]!]);
    else rows.push(['+', b[j++]!]);
  }
  while (i < n) rows.push(['-', a[i++]!]);
  while (j < m) rows.push(['+', b[j++]!]);
  const keep = rows.map((row, index) => row[0] !== ' ' || rows.slice(Math.max(0, index - 2), index + 3).some((r) => r[0] !== ' '));
  const out = [`--- a/${name}`, `+++ b/${name}`];
  let skipped = false;
  rows.forEach((row, index) => {
    if (keep[index]) { out.push(`${row[0]}${row[1]}`); skipped = false; }
    else if (!skipped) { out.push('@@'); skipped = true; }
  });
  return out.join('\n');
}

/** Turn a run report (and compile issues) into findings a person or agent can act on. */
export function classify(report: TestRunReport | null, issues: CheckIssue[]): HealFinding[] {
  const findings: HealFinding[] = [];
  const open = (f: Omit<HealFinding, 'status'>): void => { findings.push({ ...f, status: 'open' }); };
  for (const issue of issues) {
    const interpreter = issue.code === 'launch_executable_missing' || issue.code === 'application_runtime_unrecognized';
    const file = issue.detail.match(/^(\S+\.(?:flow|fixture)\.yaml)/)?.[1] ?? (interpreter ? CONFIG_FILE : null);
    open({ kind: interpreter ? 'setup' : 'authoring', caseId: null, file, step: null, detail: `${issue.code}: ${issue.detail}`, fix: interpreter ? 'point app.python at an interpreter that has the app\'s dependencies' : issue.action });
  }
  if (!report) return findings;
  for (const b of report.blockers) open({ kind: 'setup', caseId: null, file: CONFIG_FILE, step: null, detail: `${b.code}: ${b.detail}`, fix: b.action });
  for (const c of report.cases) {
    if (c.outcome === 'passed' || !c.failure) continue;
    const ready = c.failure.message.match(/did not become ready at https?:\/\/[^/\s]+(\/\S*) within/);
    if (c.failure.step === '(app startup)') {
      open({ kind: 'setup', caseId: c.caseId, file: CONFIG_FILE, step: null, detail: c.failure.message,
        fix: ready ? `make app.health a GET path that answers 2xx once the app is up (now ${ready[1]})` : 'the app exited or failed to start; run it by hand with the same env to see why' });
    } else if (c.outcome === 'assertion_failed') {
      open({ kind: 'assertion', caseId: c.caseId, file: c.file, step: c.failure.step, detail: `${c.failure.message}${c.failure.observed ? `\n${c.failure.observed}` : ''}`, fix: 'decide whether the test drifted or the product regressed' });
    } else {
      open({ kind: c.outcome === 'infrastructure_failed' ? 'infrastructure' : 'setup', caseId: c.caseId, file: c.file, step: c.failure.step, detail: c.failure.message, fix: 'rerun; if it repeats, inspect the run folder' });
    }
  }
  if (report.bundleVerified === false) open({ kind: 'evidence', caseId: null, file: null, step: null, detail: 'the evidence bundle failed verification', fix: `read ${relative(report.runDir, join(report.runDir, 'bundle-problems.txt'))} in the run folder; evidence is never repaired, only re-recorded by a fresh run` });
  // One startup finding per distinct message is enough.
  const seen = new Set<string>();
  return findings.filter((f) => { if (f.kind !== 'setup') return true; const key = f.detail.replace(/127\.0\.0\.1:\d+/, 'HOST'); if (seen.has(key)) return false; seen.add(key); return true; });
}

type Ctx = { root: string; configPath: string; healDir: string; changes: HealChange[]; backups: Map<string, string>; progress: (phase: string, detail?: string) => void; signal: AbortSignal | undefined };

function backup(ctx: Ctx, abs: string): void {
  if (ctx.backups.has(abs)) return;
  const text = readText(abs);
  if (text !== null) ctx.backups.set(abs, text);
}

function editConfig(ctx: Ctx, set: (doc: ReturnType<typeof parseDocument>) => void): { before: string; after: string } {
  const before = readFileSync(ctx.configPath, 'utf8');
  const doc = parseDocument(before);
  set(doc);
  const after = doc.toString({ flowCollectionPadding: false });
  writeFileSync(ctx.configPath, after);
  return { before, after };
}

async function rerun(ctx: Ctx, grep?: string): Promise<{ report: TestRunReport | null; issues: CheckIssue[] }> {
  try {
    const { report } = await runTests({ configPath: ctx.configPath, ...(grep ? { grep } : {}), ...(ctx.signal ? { signal: ctx.signal } : {}) });
    return { report, issues: [] };
  } catch (error) {
    if (error instanceof Blocked) return { report: null, issues: error.reasons.map((r) => ({ code: r.code, detail: r.detail, action: r.action })) };
    throw error;
  }
}

function startupFailed(report: TestRunReport | null, caseId: string | null): boolean {
  if (!report) return true;
  return report.cases.some((c) => (caseId === null || c.caseId === caseId) && c.failure?.step === '(app startup)');
}

function walkFiles(dir: string, accept: (name: string) => boolean, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || !existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', STATE_DIR, '.venv', 'venv', '__pycache__', 'dist', 'build'].includes(name)) continue;
    const path = join(dir, name);
    let st; try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) walkFiles(path, accept, out, depth + 1);
    else if (accept(name) && st.size < 512_000) out.push(path);
  }
  return out;
}

/** Health paths the app plausibly serves: declared GET routes first, then string literals in its source. */
export function healthCandidates(root: string, config: AuthoringConfig, current: string): string[] {
  const found: string[] = [];
  const add = (path: string) => { if (path !== current && !found.includes(path)) found.push(path); };
  try { for (const r of discoverProject(root, null).routes) if (r.method === 'GET' && HEALTH_WORDS.test(r.path)) add(r.path); } catch { /* discovery is a hint */ }
  const appRoot = resolve(root, config.app.root);
  for (const file of walkFiles(appRoot, (n) => /\.(?:m?js|cjs|ts|py|go|rb|java|kt|rs)$/.test(n))) {
    const text = readText(file) ?? '';
    for (const m of text.matchAll(/["'`](\/(?:api\/)?[a-z][\w/-]{0,30})["'`]/g)) if (HEALTH_WORDS.test(m[1]!)) add(m[1]!);
  }
  return found.slice(0, 4);
}

/** Interpreters worth trying for fastapi/django, in the order a developer would expect. */
export function pythonCandidates(root: string, config: AuthoringConfig): string[] {
  const appRoot = resolve(root, config.app.root);
  const local = [appRoot, root].flatMap((dir) => ['.venv', 'venv', 'env', '.env'].map((v) => join(dir, v, 'bin', 'python')));
  const onPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((dir) => ['python3', 'python'].map((n) => join(dir, n)));
  const probe = config.app.adapter === 'django' ? 'import django' : 'import fastapi, uvicorn';
  const seen = new Set<string>();
  return [...local, ...onPath].filter((p) => { if (seen.has(p) || !existsSync(p) || p === config.app.python) return false; seen.add(p); return true; })
    .filter((p) => spawnSync(p, ['-c', probe], { timeout: 10_000, stdio: 'ignore' }).status === 0)
    .map((p) => (p.startsWith(`${root}/`) ? relative(resolve(root, config.app.root), p) || p : p))
    .slice(0, 3);
}

async function fixHealth(ctx: Ctx, finding: HealFinding, config: AuthoringConfig, dryRun: boolean): Promise<void> {
  const candidates = healthCandidates(ctx.root, config, config.app.health);
  if (candidates.length === 0) { finding.fix = `${finding.fix}. No health-like GET route was found in the app source; add one (e.g. GET /health returning 200) or set app.health`; return; }
  backup(ctx, ctx.configPath);
  for (const path of candidates) {
    ctx.progress('Trying a fix', `app.health: ${config.app.health} → ${path}`);
    const { before, after } = editConfig(ctx, (doc) => doc.setIn(['app', 'health'], path));
    const diff = lineDiff(before, after, CONFIG_FILE);
    if (dryRun) { writeFileSync(ctx.configPath, before); ctx.changes.push({ file: CONFIG_FILE, reason: `health check ${config.app.health} never answered; ${path} is served by the app`, diff, status: 'reverted', by: 'tracegrove', note: 'dry run: not applied' }); return; }
    const { report } = await rerun(ctx, finding.caseId ?? undefined);
    if (!startupFailed(report, finding.caseId)) {
      ctx.changes.push({ file: CONFIG_FILE, reason: `health check ${config.app.health} never answered; the app is ready at ${path}`, diff, status: 'kept', by: 'tracegrove', note: 'verified: the app now starts' });
      finding.status = 'fixed'; return;
    }
    writeFileSync(ctx.configPath, before);
    ctx.changes.push({ file: CONFIG_FILE, reason: `tried app.health ${path}`, diff, status: 'reverted', by: 'tracegrove', note: 'the app still did not become ready' });
  }
}

async function fixPython(ctx: Ctx, finding: HealFinding, config: AuthoringConfig, dryRun: boolean): Promise<void> {
  if (config.app.adapter !== 'fastapi' && config.app.adapter !== 'django') return;
  ctx.progress('Looking for a Python interpreter', `with ${config.app.adapter === 'django' ? 'django' : 'fastapi and uvicorn'} installed`);
  const candidates = pythonCandidates(ctx.root, config);
  if (candidates.length === 0) { finding.fix = `create a virtualenv with the app's dependencies (python3 -m venv .venv && .venv/bin/pip install -r requirements.txt), then rerun heal`; return; }
  backup(ctx, ctx.configPath);
  for (const python of candidates) {
    ctx.progress('Trying a fix', `app.python → ${python}`);
    const { before, after } = editConfig(ctx, (doc) => doc.setIn(['app', 'python'], python));
    const diff = lineDiff(before, after, CONFIG_FILE);
    if (dryRun) { writeFileSync(ctx.configPath, before); ctx.changes.push({ file: CONFIG_FILE, reason: `${config.app.python ?? 'the default interpreter'} is unusable; ${python} imports the app's framework`, diff, status: 'reverted', by: 'tracegrove', note: 'dry run: not applied' }); return; }
    const check = checkProject(ctx.root);
    if (!check.issues.some((i) => i.code === 'launch_executable_missing' || i.code === 'application_runtime_unrecognized')) {
      ctx.changes.push({ file: CONFIG_FILE, reason: `${config.app.python ?? 'the default interpreter'} is unusable; ${python} imports the app's framework`, diff, status: 'kept', by: 'tracegrove', note: 'verified: the interpreter is recognized' });
      finding.status = 'fixed'; return;
    }
    writeFileSync(ctx.configPath, before);
    ctx.changes.push({ file: CONFIG_FILE, reason: `tried app.python ${python}`, diff, status: 'reverted', by: 'tracegrove', note: 'still not recognized' });
  }
}

type FlowShape = { steps: Array<{ key: string; expect: unknown }> };
function flowShape(text: string): FlowShape | null {
  try {
    const doc = parseYaml(text) as { steps?: Array<Record<string, unknown>> } | null;
    if (!doc || !Array.isArray(doc.steps)) return null;
    return { steps: doc.steps.map((s, i) => ({ key: typeof s.name === 'string' ? s.name : `#${i}`, expect: s.expect })) };
  } catch { return null; }
}
function statusOf(expect: unknown): number | null {
  if (typeof expect === 'number') return expect;
  if (expect && typeof expect === 'object' && typeof (expect as { status?: unknown }).status === 'number') return (expect as { status: number }).status;
  return null;
}
function expectWeight(expect: unknown): number {
  if (expect === undefined || expect === null) return 0;
  if (typeof expect === 'number') return 1;
  const e = expect as Record<string, unknown>;
  return (e.status === undefined ? 0 : 1) + ['json', 'count'].reduce((n, k) => n + Object.keys((e[k] as object | undefined) ?? {}).length, 0) + ['present', 'absent'].reduce((n, k) => n + ((e[k] as unknown[] | undefined)?.length ?? 0), 0) + (e.text === undefined ? 0 : 1);
}

/** Why an agent's edit to a flow would weaken it, or null when it keeps the test's strength. */
export function guardFlowEdit(before: string, after: string): string | null {
  const a = flowShape(before); const b = flowShape(after);
  if (!b) return 'the edited flow no longer parses as a flow';
  if (!a) return null;
  if (b.steps.length < a.steps.length) return `steps were deleted (${a.steps.length} → ${b.steps.length})`;
  const byKey = new Map(b.steps.map((s) => [s.key, s]));
  for (const step of a.steps) {
    const next = byKey.get(step.key);
    if (!next) return `step "${step.key}" was removed or renamed`;
    if (expectWeight(next.expect) < expectWeight(step.expect)) return `step "${step.key}" checks less than before`;
    const was = statusOf(step.expect); const now = statusOf(next.expect);
    if (was !== null && now !== null && (was < 400) !== (now < 400)) return `step "${step.key}" flipped from expecting ${was} to ${now}; that changes what the product is allowed to do`;
  }
  return null;
}

export function parseVerdicts(output: string): HealVerdict[] {
  const line = output.split('\n').reverse().find((l) => l.includes(VERDICT_TAG));
  if (!line) return [];
  try {
    const parsed = JSON.parse(line.slice(line.indexOf('{'))) as { cases?: Array<Partial<HealVerdict>> };
    return (parsed.cases ?? []).filter((c): c is HealVerdict => typeof c.caseId === 'string' && ['test_drift', 'product_bug', 'unsure'].includes(String(c.verdict)))
      .map((c) => ({ caseId: c.caseId, verdict: c.verdict, reason: typeof c.reason === 'string' ? c.reason.slice(0, 400) : '' }));
  } catch { return []; }
}

export function buildHealPrompt(input: { root: string; failing: CaseReport[]; issues: CheckIssue[]; tracegrove?: string[] }): string {
  const tg = (input.tracegrove ?? tracegroveCommand()).join(' ');
  const cases = input.failing.map((c) => {
    const text = readText(join(input.root, c.file)) ?? '(file missing)';
    const steps = c.steps.map((s) => `    ${s.result.padEnd(9)} ${s.name}: ${s.method} ${s.path}${s.status !== null ? ` -> ${s.status}` : ''}`).join('\n');
    return [`### ${c.caseId} (${join(input.root, c.file)})`, `Failed at "${c.failure?.step}": ${c.failure?.message}`, c.failure?.observed ? `Observed: ${c.failure.observed}` : '', 'Steps:', steps, 'Flow file:', '```yaml', text.trim(), '```'].filter(Boolean).join('\n');
  });
  const issues = input.issues.map((i) => `- ${i.code}: ${i.detail} (fix: ${i.action})`);
  return [
    `Project folder: ${input.root}. Work only inside it; every path below is absolute.`,
    'You are repairing tracegrove behaviour tests. tracegrove drives the real app; a failing test means either the TEST drifted from intended behaviour, or the PRODUCT regressed.',
    'Your job is to tell those apart, honestly. Hiding a product bug by editing the test is the worst possible outcome.',
    '',
    ...(issues.length ? ['Authoring issues reported by `check` (fix these in the named flow files):', ...issues, ''] : []),
    ...(cases.length ? ['Failing cases:', ...cases, ''] : []),
    'Rules:',
    '1. Read the route handlers, recent changes (git log -p, git diff) and docs to learn the INTENDED behaviour before deciding.',
    '2. test_drift: the app\'s current behaviour is clearly intended (renamed field, new status code for the same outcome, changed route, new required field) and the flow is out of date. Edit only that flow file to match. Keep every step and every check; you may update values, paths, request bodies or add checks.',
    '3. product_bug: the app behaves wrongly (a denial now succeeds, data is lost, a 5xx, wrong data returned). Do NOT edit the flow. Explain the bug in one sentence.',
    '4. unsure: you cannot tell. Do not edit.',
    '5. Never create files, and never edit application code, the config, fixtures or flows not listed above. Never delete steps or expectations, never change an expected 2xx/3xx into a 4xx/5xx or back.',
    `6. After editing, run \`${tg} check --json\` until it reports ok. Do not run the tests yourself; tracegrove re-runs them and keeps only edits that pass.`,
    `7. Your LAST line must be exactly: ${VERDICT_TAG} {"cases":[{"caseId":"<id>","verdict":"test_drift|product_bug|unsure","reason":"<one sentence>"}]}`,
  ].join('\n');
}

function snapshot(files: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of files) { const t = readText(f); if (t !== null) map.set(f, t); }
  return map;
}

async function healWithAgent(ctx: Ctx, input: { failing: CaseReport[]; issues: CheckIssue[]; config: AuthoringConfig | null; overrides: AgentOverrides; onOutput?: ((chunk: string) => void) | undefined; onActivity?: ((line: string) => void) | undefined; findings: HealFinding[]; dryRun: boolean }): Promise<HealReport['agent']> {
  const settings = resolveAgentSettings(ctx.root, input.config, input.overrides);
  const testDir = resolve(ctx.root, input.config?.testDir ?? 'tracegrove');
  const allowed = new Set([...input.failing.map((c) => join(ctx.root, c.file)), ...input.issues.map((i) => i.detail.match(/^(\S+\.(?:flow|fixture)\.yaml)/)?.[1]).filter((f): f is string => !!f).map((f) => join(ctx.root, f))]);
  const appRoot = resolve(ctx.root, input.config?.app.root ?? '.');
  const watched = [...new Set([ctx.configPath, ...walkFiles(testDir, (n) => n.endsWith('.yaml')), ...walkFiles(appRoot, (n) => /\.(?:m?js|cjs|ts|tsx|py|json|ya?ml|html|css)$/.test(n))])];
  const before = snapshot(watched);
  const existed = new Set(walkFiles(ctx.root, () => true));
  ctx.progress('Asking the agent', `${settings.provider}${settings.model ? ` · ${settings.model}` : ''}: ${input.failing.length} failing case(s), ${input.issues.length} authoring issue(s)`);
  const result = await runAgent({ root: ctx.root, testDir, settings, prompt: buildHealPrompt({ root: ctx.root, failing: input.failing, issues: input.issues }), ...(input.onOutput ? { onOutput: input.onOutput } : {}), ...(input.onActivity ? { onActivity: input.onActivity } : {}), ...(ctx.signal ? { signal: ctx.signal } : {}) });
  const verdicts = parseVerdicts(result.output);
  const verdictFor = new Map(verdicts.map((v) => [v.caseId, v]));
  for (const f of input.findings) {
    if (f.kind !== 'assertion' || !f.caseId) continue;
    const v = verdictFor.get(f.caseId);
    if (v?.verdict === 'product_bug') { f.kind = 'product_bug'; f.status = 'reported'; f.fix = v.reason || 'the app regressed; fix the product, not the test'; }
    else if (v?.verdict === 'test_drift') { f.kind = 'test_drift'; f.fix = v.reason || f.fix; }
    else if (v) f.fix = `agent unsure: ${v.reason}`;
  }
  // Undo anything outside the allowed flow files, then guard what remains.
  const candidates: string[] = [];
  for (const [file, text] of before) {
    const now = readText(file);
    if (now === text) continue;
    const rel = relative(ctx.root, file);
    if (!allowed.has(file)) {
      writeFileSync(file, text);
      ctx.changes.push({ file: rel, reason: 'the agent edited a file it was not allowed to touch', diff: lineDiff(text, now ?? '', rel), status: 'rejected', by: 'agent', note: 'restored' });
      continue;
    }
    const caseId = input.failing.find((c) => join(ctx.root, c.file) === file)?.caseId;
    const v = caseId ? verdictFor.get(caseId) : undefined;
    const guard = v && v.verdict !== 'test_drift' ? `the agent judged this ${v.verdict.replace('_', ' ')} but still edited the test` : guardFlowEdit(text, now ?? '');
    if (guard || input.dryRun) {
      writeFileSync(file, text);
      ctx.changes.push({ file: rel, reason: v?.reason || 'agent repair', diff: lineDiff(text, now ?? '', rel), status: guard ? 'rejected' : 'reverted', by: 'agent', note: guard ?? 'dry run: not applied' });
      if (guard) { const f = input.findings.find((x) => x.caseId === caseId); if (f && f.kind === 'test_drift') { f.kind = 'assertion'; f.fix = `agent edit rejected: ${guard}`; } }
      continue;
    }
    ctx.backups.set(file, ctx.backups.get(file) ?? text);
    candidates.push(file);
  }
  // Files the agent created (scratch scripts, new flows) are outside the brief.
  for (const file of walkFiles(ctx.root, () => true)) {
    if (existed.has(file)) continue;
    const rel = relative(ctx.root, file);
    ctx.changes.push({ file: rel, reason: 'the agent created a new file during a repair', diff: lineDiff('', readText(file) ?? '', rel), status: 'rejected', by: 'agent', note: 'removed' });
    rmSync(file, { force: true });
  }
  if (candidates.length) {
    ctx.progress('Re-running to prove the repairs', candidates.map((f) => relative(ctx.root, f)).join(', '));
    const check = checkProject(ctx.root);
    const { report } = check.ok ? await rerun(ctx) : { report: null };
    for (const file of candidates) {
      const rel = relative(ctx.root, file);
      const original = before.get(file)!;
      const edited = readText(file) ?? '';
      const caseId = input.failing.find((c) => join(ctx.root, c.file) === file)?.caseId;
      const passes = check.ok && (caseId ? report?.cases.find((c) => c.caseId === caseId)?.outcome === 'passed' : true);
      const finding = input.findings.find((f) => (caseId ? f.caseId === caseId : f.file === rel));
      if (passes) {
        ctx.changes.push({ file: rel, reason: (caseId && verdictFor.get(caseId)?.reason) || 'repaired authoring issue', diff: lineDiff(original, edited, rel), status: 'kept', by: 'agent', note: caseId ? 'verified: the case now passes' : 'verified: check is clean' });
        if (finding) { finding.status = 'fixed'; if (finding.kind === 'assertion') finding.kind = 'test_drift'; }
      } else {
        writeFileSync(file, original);
        ctx.backups.delete(file);
        ctx.changes.push({ file: rel, reason: (caseId && verdictFor.get(caseId)?.reason) || 'agent repair', diff: lineDiff(original, edited, rel), status: 'reverted', by: 'agent', note: check.ok ? 'the case still fails with this edit' : 'the edit does not compile' });
      }
    }
  }
  return { provider: result.provider, model: result.model, exitCode: result.exitCode, verdicts, summary: result.output.split('\n').filter((l) => !l.includes(VERDICT_TAG)).join('\n').trim().slice(-2000) };
}

function snap(report: TestRunReport | null, issues: CheckIssue[]): HealSnapshot {
  return report ? { outcome: report.outcome, exitCode: report.exitCode, runDir: report.runDir, totals: report.totals, issues: issues.length }
    : { outcome: issues.length ? 'blocked' : 'not_run', exitCode: 2, runDir: null, totals: null, issues: issues.length };
}

/** Diagnose, repair what is safe, verify, and write .tracegrove/heals/<id>/report.json. */
export async function heal(options: HealOptions): Promise<HealReport> {
  const root = resolve(options.dir);
  const configPath = join(root, CONFIG_FILE);
  if (!existsSync(configPath)) throw new Blocked([{ code: 'config_not_found', detail: configPath, owner: 'operator', action: 'run tracegrove init first' }]);
  const startedAt = new Date();
  const id = stamp(startedAt);
  const healDir = join(root, STATE_DIR, HEALS_DIR, id);
  const progress = options.onProgress ?? (() => {});
  const ctx: Ctx = { root, configPath, healDir, changes: [], backups: new Map(), progress, signal: options.signal };
  const dryRun = options.dryRun === true;

  progress('Checking flows and config');
  let issues = checkProject(root).issues;
  let report: TestRunReport | null = options.report ?? null;
  if (!report && issues.length === 0) { progress('Running the suite to see what fails'); ({ report, issues } = await rerun(ctx)); }
  const before = snap(report, issues);
  const findings = classify(report, issues);

  let config: AuthoringConfig | null = null;
  try { config = loadAuthoringConfig(configPath); } catch { config = null; }
  if (config) {
    for (const f of findings.filter((x) => x.kind === 'setup' && x.status === 'open')) {
      if (/did not become ready at/.test(f.detail)) await fixHealth(ctx, f, config, dryRun);
      else if (/^(launch_executable_missing|application_runtime_unrecognized)/.test(f.detail)) await fixPython(ctx, f, config, dryRun);
      try { config = loadAuthoringConfig(configPath); } catch { /* keep previous */ }
    }
  }
  let after = before;
  // Once setup is repaired the real failures can show; look again before calling the agent.
  if (ctx.changes.some((c) => c.status === 'kept')) {
    progress('Re-running after setup fixes');
    issues = checkProject(root).issues;
    if (issues.length === 0) ({ report, issues } = await rerun(ctx));
    const fixed = findings.filter((f) => f.status === 'fixed');
    findings.splice(0, findings.length, ...fixed, ...classify(report, issues).filter((f) => !fixed.some((x) => x.detail === f.detail)));
    after = snap(report, issues);
  }

  let agent: HealReport['agent'] = null;
  const failing = (report?.cases ?? []).filter((c) => c.outcome === 'assertion_failed');
  const authoring = issues.filter((i) => !['launch_executable_missing', 'application_runtime_unrecognized'].includes(i.code));
  const settings = resolveAgentSettings(root, config, options.overrides ?? {});
  const installed = settings.provider !== 'none' && !!detectAgents()[settings.provider as 'claude' | 'codex'];
  if (options.agent !== false && (failing.length || authoring.length)) {
    if (installed) agent = await healWithAgent(ctx, { failing, issues: authoring, config, overrides: options.overrides ?? {}, onOutput: options.onAgentOutput, onActivity: options.onAgentActivity, findings, dryRun });
    else for (const f of findings.filter((x) => x.kind === 'assertion')) f.fix = `${f.fix}: ${settings.provider === 'none' ? 'enable an agent in tracegrove settings' : `${settings.provider} is not installed`}, or read the failure and edit ${f.file}`;
  }

  const kept = ctx.changes.filter((c) => c.status === 'kept');
  if (kept.some((c) => c.by === 'agent') && !dryRun) {
    progress('Final verification run');
    issues = checkProject(root).issues;
    if (issues.length === 0) ({ report, issues } = await rerun(ctx));
    after = snap(report, issues);
  }

  const bugs = findings.filter((f) => f.kind === 'product_bug');
  const openOnes = findings.filter((f) => f.status === 'open');
  const outcome: HealReport['outcome'] = findings.length === 0 ? 'healthy'
    : bugs.length ? 'product_bugs'
    : openOnes.length === 0 ? 'healed'
    : kept.length ? 'partly_healed' : 'needs_human';
  const next: HealReport['next'] = [];
  if (kept.length) next.push({ command: `tracegrove heal --undo ${id}`, why: 'put every kept change back the way it was' });
  if (bugs.length) next.push({ command: 'tracegrove show --run latest', why: `${bugs.length} product bug(s) to fix in the app; the tests stay red until then` });
  if (openOnes.some((f) => f.kind === 'assertion') && !installed) next.push({ command: 'tracegrove settings --agent claude', why: 'let a coding agent tell drift from regressions' });
  if (outcome === 'healed' || outcome === 'healthy') next.push({ command: 'tracegrove test', why: 'everything is green; run it in CI' });
  if (dryRun && ctx.changes.length) next.push({ command: 'tracegrove heal', why: 'apply the proposed fixes for real' });

  mkdirSync(healDir, { recursive: true });
  const backupDir = join(healDir, 'backup');
  for (const [abs, text] of ctx.backups) {
    const rel = relative(root, abs);
    if (!kept.some((c) => c.file === rel)) continue;
    mkdirSync(dirname(join(backupDir, rel)), { recursive: true });
    writeFileSync(join(backupDir, rel), text);
  }
  const result: HealReport = {
    schemaVersion: 'tracegrove.heal/v1', id, root, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    outcome, exitCode: outcome === 'healthy' || outcome === 'healed' ? 0 : bugs.length ? 1 : 2,
    before, after, findings, changes: ctx.changes, agent, next, reportPath: join(healDir, 'report.json'),
  };
  writeFileSync(result.reportPath, `${JSON.stringify(result, null, 2)}\n`);
  progress('Done', outcome);
  return result;
}

export function listHeals(root: string): HealReport[] {
  const dir = join(resolve(root), STATE_DIR, HEALS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().reverse().flatMap((name) => {
    try { return [JSON.parse(readFileSync(join(dir, name, 'report.json'), 'utf8')) as HealReport]; } catch { return []; }
  });
}

/** Restore every file a heal kept a change to. Refuses when the file changed again since. */
export function undoHeal(dir: string, id: string): { id: string; restored: string[]; skipped: Array<{ file: string; why: string }> } {
  const root = resolve(dir);
  const healDir = join(root, STATE_DIR, HEALS_DIR, id === 'latest' ? (listHeals(root)[0]?.id ?? '') : id);
  const path = join(healDir, 'report.json');
  if (!existsSync(path)) throw new Blocked([{ code: 'heal_not_found', detail: id, owner: 'operator', action: 'run tracegrove heal --json to list heal ids, or pass --undo latest' }]);
  const report = JSON.parse(readFileSync(path, 'utf8')) as HealReport;
  const restored: string[] = []; const skipped: Array<{ file: string; why: string }> = [];
  const files = [...new Set(report.changes.filter((c) => c.status === 'kept').map((c) => c.file))];
  for (const file of files) {
    const saved = readText(join(healDir, 'backup', file));
    if (saved === null) { skipped.push({ file, why: 'no backup was recorded' }); continue; }
    const lastDiff = report.changes.filter((c) => c.file === file && c.status === 'kept').at(-1)!.diff;
    const current = readText(join(root, file)) ?? '';
    const expectedLines = lastDiff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
    if (expectedLines.some((l) => l.trim() && !current.includes(l))) { skipped.push({ file, why: 'it changed again after the heal; undo by hand' }); continue; }
    writeFileSync(join(root, file), saved);
    restored.push(file);
  }
  writeFileSync(join(healDir, 'undone.json'), `${JSON.stringify({ at: new Date().toISOString(), restored, skipped, digest: sha(restored.join('\n')) }, null, 2)}\n`);
  return { id: report.id, restored, skipped };
}
