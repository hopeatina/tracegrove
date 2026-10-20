/**
 * The project-level operations shared by the CLI and `tracegrove ui`: discover routes against
 * the compiled flows, check authoring files without launching the application, and draft flows with a
 * coding agent followed by tracegrove's own check.
 */
import { readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { CONFIG_FILE, compileProject, configInDirectory, loadAuthoringConfig, type CompiledFlowInfo } from './compile.ts';
import { discover, templateOfObserved, type Discovery, type ObservedRun } from './discover.ts';
import { resolveRun, runTests, type TestRunReport } from './run.ts';
import { readSavedRun } from './savedRun.ts';
import { buildDraftPrompt, buildRepairPrompt, resolveAgentSettings, runAgent, type AgentOverrides, type AgentRunResult, type ProveFailure } from './agent.ts';
import type { AuthoringConfig } from './schema.ts';

export type CheckIssue = { code: string; detail: string; action: string };
export type CheckResult = { ok: boolean; flows: Array<Pick<CompiledFlowInfo, 'caseId' | 'file' | 'title'>>; issues: CheckIssue[] };

export function checkProject(dir: string): CheckResult {
  try {
    const configPath = configInDirectory(resolve(dir));
    if (!configPath) return { ok: false, flows: [], issues: [{ code: 'config_not_found', detail: join(resolve(dir), CONFIG_FILE), action: 'run tracegrove init' }] };
    const compiled = compileProject(configPath);
    return { ok: true, flows: compiled.flows.map((f) => ({ caseId: f.caseId, file: f.file, title: f.title })), issues: [] };
  } catch (error) {
    if (error instanceof Blocked) return { ok: false, flows: [], issues: error.reasons.map((r) => ({ code: r.code, detail: r.detail, action: r.action })) };
    throw error;
  }
}

export function discoverProject(dir: string, branch: string | null): Discovery {
  const root = resolve(dir);
  let flows: Array<{ caseId: string; method: string; path: string }> = [];
  let scanRoot = root;
  let globs: string[] | undefined;
  let observed: ObservedRun | null = null;
  try {
    const configPath = configInDirectory(root);
    if (configPath) {
      const compiled = compileProject(configPath);
      flows = compiled.flows.flatMap((f) => f.steps.map((s) => ({ caseId: f.caseId, method: s.method, path: s.path })));
      flows.push({ caseId: '(readiness check)', method: 'GET', path: compiled.config.app.health });
      // Scan the app the config launches, limited to its sources, not the folder the config sits in.
      scanRoot = compiled.sourceRoot;
      globs = compiled.config.app.sources ?? undefined;
      observed = latestObservedRun(root, compiled.sourceDigest);
    }
  } catch { /* uncompilable flows cover nothing; check reports why */ }
  return discover(scanRoot, flows, branch, globs, observed);
}

/**
 * Requests from recent runs whose evidence verifies; unverified summaries never count as observed.
 * A partial run (one flow, from draft or heal) would otherwise hide every other scenario's traffic, so
 * each case comes from the newest of the last few verified runs of the same source that ran it.
 */
export function latestObservedRun(root: string, sourceDigest: string | null, depth = 6): ObservedRun | null {
  const latest = resolveRun(root, 'latest');
  if (!latest) return null;
  const runsDir = dirname(latest);
  let names: string[];
  try { names = readdirSync(runsDir).filter((n) => n !== 'latest').sort().reverse(); } catch { return null; }
  const newest = basename(latest);
  names = [newest, ...names.filter((n) => n !== newest)].slice(0, depth);
  const cases = new Map<string, ObservedRun['cases'][number]>();
  let anchor: { run: string; digest: string } | null = null;
  for (const name of names) {
    let saved: ReturnType<typeof readSavedRun>;
    try { saved = readSavedRun(root, name); } catch { continue; }
    if (saved.savedEvidence.status !== 'verified') continue;
    if (anchor && saved.sourceDigest !== anchor.digest) continue;
    anchor ??= { run: name, digest: saved.sourceDigest };
    for (const c of saved.cases) if (!cases.has(c.caseId)) cases.set(c.caseId, { caseId: c.caseId, requests: c.requests ?? [] });
  }
  if (!anchor) return null;
  return { run: anchor.run, stale: sourceDigest !== null && anchor.digest !== sourceDigest, cases: [...cases.values()] };
}

function configOrNull(root: string): AuthoringConfig | null {
  try { const path = configInDirectory(root); return path ? loadAuthoringConfig(path) : null; } catch { return null; }
}

export type ProvedFlow = {
  file: string;
  caseIds: string[];
  /** proven: every case in the file passed end to end with verified evidence. */
  outcome: 'proven' | 'failed' | 'product_bug' | 'not_run';
  /** repair rounds the agent took on this file */
  repairs: number;
  detail: string | null;
  /** distinct METHOD path pairs the app served while this file ran */
  served: string[];
  run: string | null;
};
export type DraftResult = {
  agent: AgentRunResult; check: CheckResult;
  discovery: { source: string; routes: number; uncovered: number; ambiguities: number };
  /** null when proving was skipped (--no-prove) */
  prove: { rounds: number; flows: ProvedFlow[] } | null;
};

export const DRAFT_REPAIR_ROUNDS = 2;

type DraftInput = { dir: string; branch: string | null; intent: string | null; overrides?: AgentOverrides; prove?: boolean; onOutput?: (chunk: string) => void; onActivity?: (line: string) => void; onProve?: (line: string) => void; signal?: AbortSignal };

/**
 * The agent proposes, tracegrove proves: the agent drafts flows, then each new flow file runs end to
 * end against the real app. Failures go back to the agent for up to DRAFT_REPAIR_ROUNDS repairs, with
 * the rule that a failure the code shows is a product bug stays failing rather than being edited away.
 */
export async function draftWithAgent(input: DraftInput): Promise<DraftResult> {
  const root = resolve(input.dir);
  const config = configOrNull(root);
  const testDir = resolve(root, config?.testDir ?? 'tracegrove');
  const settings = resolveAgentSettings(root, config, input.overrides ?? {});
  const discovery = discoverProject(root, input.branch);
  const prompt = buildDraftPrompt({ root, testDir, discovery, intent: input.intent, config });
  const relay = { ...(input.onOutput ? { onOutput: input.onOutput } : {}), ...(input.onActivity ? { onActivity: input.onActivity } : {}), ...(input.signal ? { signal: input.signal } : {}) };
  const agent = await runAgent({ root, testDir, settings, prompt, ...relay });
  const summary = { source: discovery.source, routes: discovery.routes.length, uncovered: discovery.uncovered, ambiguities: discovery.ambiguities.length };
  let check = checkProject(root);
  if (input.prove === false || agent.exitCode !== 0 || input.signal?.aborted) return { agent, check, discovery: summary, prove: null };
  const configPath = configInDirectory(root);
  const files = agent.files.filter((f) => f.endsWith('.flow.yaml'));
  const flows: ProvedFlow[] = files.map((file) => ({ file, caseIds: [], outcome: 'not_run', repairs: 0, detail: null, served: [], run: null }));
  if (!configPath || flows.length === 0) return { agent, check, discovery: summary, prove: { rounds: 0, flows } };
  let rounds = 0;
  for (;;) {
    const failures: ProveFailure[] = [];
    for (const flow of flows.filter((f) => f.outcome === 'not_run' || f.outcome === 'failed')) {
      if (input.signal?.aborted) break;
      input.onProve?.(`running ${flow.file}`);
      const ran = await proveFile(configPath, root, flow.file, input.signal);
      Object.assign(flow, ran.flow, { repairs: flow.repairs });
      failures.push(...ran.failures);
      input.onProve?.(`${flow.file}: ${flow.outcome}${flow.detail ? ` (${flow.detail})` : ''}`);
    }
    if (failures.length === 0 || rounds >= DRAFT_REPAIR_ROUNDS || input.signal?.aborted) break;
    rounds++;
    const failing = new Set(failures.map((f) => f.file));
    for (const flow of flows) if (failing.has(flow.file)) flow.repairs++;
    input.onProve?.(`asking ${settings.provider} to repair ${failing.size} flow file(s), round ${rounds} of ${DRAFT_REPAIR_ROUNDS}`);
    const repair = await runAgent({ root, testDir, settings, prompt: buildRepairPrompt({ failures, round: rounds, rounds: DRAFT_REPAIR_ROUNDS }), ...relay });
    // A file the agent left unchanged and called a product bug stays failing, labeled as the agent judged it.
    for (const flow of flows) {
      if (!failing.has(flow.file)) continue;
      const said = repair.output.split('\n').find((line) => line.includes(flow.file) || line.includes(basename(flow.file)));
      if (!repair.files.includes(flow.file) && said && /product bug/i.test(said)) { flow.outcome = 'product_bug'; flow.detail = said.replace(/^[-*\s]+/, '').slice(0, 400); }
    }
    if (repair.exitCode !== 0) break;
    check = checkProject(root);
    if (!check.ok) break;
  }
  return { agent, check: checkProject(root), discovery: summary, prove: { rounds, flows } };
}

async function proveFile(configPath: string, root: string, file: string, signal?: AbortSignal): Promise<{ flow: Omit<ProvedFlow, 'repairs'>; failures: ProveFailure[] }> {
  const base = { file, caseIds: [] as string[], served: [] as string[], run: null as string | null };
  let report: TestRunReport;
  try { ({ report } = await runTests({ configPath, grep: file, ...(signal ? { signal } : {}) })); }
  catch (error) {
    const detail = error instanceof Blocked ? error.reasons.map((r) => r.detail).join('; ') : (error as Error).message;
    return { flow: { ...base, outcome: 'failed', detail: detail.slice(0, 400) }, failures: [{ file, caseId: '(compile)', step: '(compile)', message: detail.slice(0, 1000), observed: null }] };
  }
  const cases = report.cases.filter((c) => c.file === file || c.file.endsWith(file));
  const served = [...new Set(cases.flatMap((c) => (c.requests ?? []).filter((r) => r.step !== null).map((r) => `${r.method} ${templateOfObserved(r.path)}`)))].sort();
  const flow = { ...base, caseIds: cases.map((c) => c.caseId), served, run: basename(report.runDir) };
  if (report.bundleVerified !== true) return { flow: { ...flow, outcome: 'failed', detail: 'the run evidence did not verify' }, failures: [] };
  const failed = cases.filter((c) => c.outcome !== 'passed');
  if (cases.length > 0 && failed.length === 0) return { flow: { ...flow, outcome: 'proven', detail: null }, failures: [] };
  const failures = failed.map((c) => ({ file, caseId: c.caseId, step: c.failure?.step ?? '(setup)', message: c.failure?.message ?? c.outcome, observed: c.failure?.observed ?? null }));
  const blocker = report.blockers[0];
  return { flow: { ...flow, outcome: 'failed', detail: failures[0]?.message.slice(0, 400) ?? blocker?.detail ?? 'no case ran' }, failures: failures.length ? failures : [{ file, caseId: '(run)', step: '(run)', message: blocker ? `${blocker.detail}; ${blocker.action}` : 'no case from this file ran', observed: null }] };
}
