/**
 * `tracegrove grow`: live discovery of a change. It reads the branch and its spec, grows the change's
 * tree, traces every unit five ways (rules first, then a coding agent in parallel lanes when one is
 * available), drafts happy, sad and edge scenarios, lets you choose how much to prove, and proves what
 * it can by running real flows. Every step is an event; nothing on screen moves without one.
 *
 * Honesty rules: an agent's claim counts only when the file and line it cites exist on the branch;
 * a criterion resting on agent-written pieces nobody reviewed is "agent-checked", never "proved"; a
 * scenario without a flow is "not proven yet", never green.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { STATE_DIR, compileProject, configInDirectory, loadAuthoringConfig, type CompiledFlowInfo } from './compile.ts';
import { gitInfo, safeRef } from './discover.ts';
import { riskOf } from './discoveryEvents.ts';
import { agentEnv, claudeResult, describeAgentLine, detectAgents, resolveAgentSettings, DEFAULT_MODELS, type AgentSettings } from './agent.ts';
import { matchesTemplate } from './traffic.ts';
import { runTests } from './run.ts';
import type { TestRunReport } from './runReport.ts';
import { draftWithAgent, latestObservedRun, type ProvedFlow } from './workspace.ts';
import { PROVIDERS, findSpec, git, grepAt, harnessOf, isPatternSource, isTestFile, matchCriterion, pullRequestFor, readAt, readChange, routesOf, termsOf, unitsOf, type ChangeUnit, type Criterion, type FileChange } from './growChange.ts';
import { journeysOf, reachGraph, words } from './growReach.ts';
import {
  GROW_EVENT_VERSION, MODE_RANK, applyGrow, couldNotRun, freshGrow, modeCount, type CellStatus, type DepthStatus, type DepthStep, type GrowEvent, type GrowEventBody,
  type GrowJourney, type GrowState, type Layer, type Mode, type Polarity, type ScenarioKind, type ScenarioLevel, type Tracer,
} from './growState.ts';

export type GrowOptions = {
  dir: string; branch?: string | null; base?: string | null; spec?: string | null;
  mode?: Mode | null; prove?: boolean; config?: string | null;
  agent?: { provider?: string | null; model?: string | null; off?: boolean };
  /** read the PR and linked issue with the GitHub CLI when it is installed (default true) */
  gh?: boolean; signal?: AbortSignal;
  /** asked once scenarios are drafted, unless a mode was passed; resolve null to keep the suggestion */
  chooseMode?: (counts: Record<Mode, number>) => Promise<Mode | null>;
  /** write the event log under .tracegrove/discovery/ (default true) */
  save?: boolean;
  /** how to turn proving on where this grow was started, for the reason a scenario was not run (default: the command line's) */
  proveOn?: string;
};
/** What the command line says to prove a scenario that was not run. */
export const PROVE_ON_CLI = 'Run grow without --no-prove';
export type GrowResult = { state: GrowState; events: GrowEvent[]; log: string | null };

type Ctx = {
  dir: string; branch: string; base: string; files: FileChange[]; units: ChangeUnit[]; criteria: Criterion[];
  state: GrowState; emit: (e: GrowEventBody) => void; signal: AbortSignal | undefined;
  callers: Map<string, string | null>; proposals: Map<string, Proposal[]>;
  /** whether a file on the branch is a test or a harness beside the app, as `roleOf` decides for the change's own files */
  isTest: (path: string) => boolean;
};
type Proposal = { kind: Exclude<ScenarioKind, 'regression'>; title: string; proves: string; criteria: string[] };

export async function grow(options: GrowOptions, onEvent: (event: GrowEvent, state: GrowState) => void = () => {}): Promise<GrowResult> {
  const dir = resolve(options.dir);
  const state = freshGrow(); const events: GrowEvent[] = []; const t0 = Date.now();
  const emit = (body: GrowEventBody) => {
    const event = { v: GROW_EVENT_VERSION, seq: events.length + 1, ms: Date.now() - t0, ...body } as GrowEvent;
    events.push(event); applyGrow(state, event); onEvent(event, state);
  };
  const finish = (): GrowResult => ({ state, events, log: options.save === false ? null : saveLog(dir, state.change?.branch ?? 'change', events) });
  try {
    await run(dir, options, state, emit);
  } catch (error) {
    if (!(error instanceof Blocked)) throw error;
    const r = error.reasons[0]!;
    emit({ kind: 'discovery.blocked', code: r.code, detail: r.detail, action: r.action });
  }
  return finish();
}

async function run(dir: string, options: GrowOptions, state: GrowState, emit: (e: GrowEventBody) => void): Promise<void> {
  const info = gitInfo(dir);
  if (!info.isRepo) throw new Blocked([{ code: 'not_a_git_repo', detail: dir, owner: 'operator', action: 'run grow inside a git checkout' }]);
  const branch = safeRef(options.branch ?? info.current ?? 'HEAD');
  const base = options.base ? safeRef(options.base) : info.base;
  if (!base) throw new Blocked([{ code: 'base_unknown', detail: 'no origin/HEAD, main or master to compare against', owner: 'operator', action: 'pass --base <branch>' }]);
  if (base === branch) throw new Blocked([{ code: 'nothing_to_compare', detail: `${branch} is the base branch`, owner: 'operator', action: 'check out a feature branch, or pass --branch and --base' }]);

  // Phase 0: the change and its spec.
  emit({ kind: 'phase.started', phase: 0 });
  let files: FileChange[];
  try { files = readChange(dir, base, branch); } catch { throw new Blocked([{ code: 'branch_unreadable', detail: `git could not diff ${base}...${branch}`, owner: 'operator', action: 'fetch both branches, or pass --base' }]); }
  if (!files.length) throw new Blocked([{ code: 'no_changes', detail: `${branch} has no commits that ${base} lacks`, owner: 'operator', action: 'commit the change first, or pass --base' }]);
  const useGh = options.gh !== false;
  const pr = useGh ? pullRequestFor(dir, branch) : null;
  let head: string | null = null; let subject = branch;
  try { head = execGit(dir, ['rev-parse', '--short', branch]); subject = execGit(dir, ['log', '-1', '--format=%s', branch]) || branch; } catch { /* unborn */ }
  const { units, untraced } = unitsOf(dir, branch, files);
  emit({ kind: 'change.read', branch, base, head, pr: pr?.number ?? null, title: pr?.title || subject, url: pr?.url ?? null, files: files.length,
    adds: files.reduce((n, f) => n + f.adds, 0), dels: files.reduce((n, f) => n + f.dels, 0), untraced });
  for (const f of files) emit({ kind: 'file.changed', path: f.path, adds: f.adds, dels: f.dels, role: f.role });
  const spec = findSpec(dir, base, branch, pr, options.spec ?? null, useGh);
  const criteria = 'missing' in spec ? [] : spec.criteria;
  if ('missing' in spec) emit({ kind: 'spec.missing', why: spec.missing });
  else { emit({ kind: 'spec.found', source: spec.source, via: spec.via, criteria: spec.criteria.length }); for (const c of spec.criteria) emit({ kind: 'criterion.found', id: c.id, text: c.text }); }
  // Agents and flows read files on disk, so a branch that is not checked out gets its own worktree:
  // what runs is the branch under review, not whatever happens to be in the working copy.
  const work = info.current === branch ? null : worktreeFor(dir, branch);
  try { await traceAndProve(dir, work, options, state, emit, { branch, base, files, units, criteria, onDisk: info.current === branch || work !== null }); } finally { if (work && !state.extOrder.some((x) => state.ext[x]!.extKind !== 'breakdown')) removeWorktree(dir, work); }
}

function worktreeFor(dir: string, branch: string): string | null {
  const path = join(mkdtempSync(join(realpathSync(tmpdir()), 'tracegrove-grow-')), 'tree');
  try { git(dir, ['worktree', 'add', '--detach', path, branch]); } catch { return null; }
  prepareWorktree(dir, path);
  return path;
}
/** A fresh worktree has the branch's sources and nothing else. Installed packages come from the checkout next door;
 *  a build script runs so what proves the branch is the branch's own build, not a stale one. A failed build is left for the flows to report. */
function prepareWorktree(home: string, work: string): void {
  for (const dep of ['node_modules', '.venv']) if (existsSync(join(home, dep)) && !existsSync(join(work, dep))) { try { symlinkSync(join(home, dep), join(work, dep), 'dir'); } catch { /* the flows will say what is missing */ } }
  let scripts: Record<string, unknown> = {};
  try { scripts = (JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }).scripts ?? {}; } catch { return; }
  if (typeof scripts.build !== 'string') return;
  spawnSync('npm', ['run', 'build', '--silent'], { cwd: work, stdio: 'ignore', timeout: 10 * 60_000, env: { ...process.env, CI: '1' } });
}
function removeWorktree(dir: string, path: string) {
  try { git(dir, ['worktree', 'remove', '--force', path]); } catch { /* already gone */ }
  rmSync(dirname(path), { recursive: true, force: true });
}

async function traceAndProve(home: string, work: string | null, options: GrowOptions, state: GrowState, emit: (e: GrowEventBody) => void,
  change: { branch: string; base: string; files: FileChange[]; units: ChangeUnit[]; criteria: Criterion[]; onDisk: boolean }): Promise<void> {
  const { branch, base, files, units, criteria } = change;
  const dir = work ?? home;
  const harness = harnessOf(dir, branch);
  const ctx: Ctx = { dir, branch, base, files, units, criteria, state, emit, signal: options.signal, callers: new Map(), proposals: new Map(), isTest: (path) => isTestFile(path, harness) };

  // Phase 1: the tree.
  emit({ kind: 'phase.started', phase: 1 });
  emit({ kind: 'trunk.grown' });
  for (const u of units) emit({ kind: 'unit.found', unit: u.id, label: u.label, unitKind: u.kind, loc: `${u.file}:${u.line}`, root: u.root, layer: u.layer, parent: u.parent });
  // Journeys: what a person or caller does end to end, read from which part requests or calls which.
  const { journeys } = journeysOf(units, reachGraph(dir, branch, units, PROVIDERS));
  for (const j of journeys) emit({ kind: 'journey.found', journey: j.id, title: j.title, entry: j.entry, units: j.units, surface: j.surface, why: j.why, loc: j.loc });
  aborted(ctx);

  // Phase 2: trace. The rules answer at once; an agent then deepens each lane in parallel.
  emit({ kind: 'phase.started', phase: 2 });
  const lanes = lanesOf(units);
  lanes.forEach((lane, i) => traceRules(ctx, `r${i + 1}`, lane));
  for (const c of criteria) if (!state.linked[c.id]?.length) emit({ kind: 'criterion.unbuilt', id: c.id, why: 'No changed code shares its words. An agent can check it by meaning.' });
  const agent = agentFor(dir, options, change.onDisk);
  if (agent.settings) {
    await Promise.all(lanes.map((lane, i) => traceWithAgent(ctx, `a${i + 1}`, lane, agent.settings!)));
    for (const c of criteria) if (!state.linked[c.id]?.length) emit({ kind: 'criterion.unbuilt', id: c.id, why: 'Neither the rules nor the agent found code that serves it in this change.' });
  } else if (agent.why) emit({ kind: 'agent.said', agent: 'r1', line: agent.why });
  aborted(ctx);

  // Phase 3: scenarios, from the agent's proposals where it made them, from templates elsewhere.
  emit({ kind: 'phase.started', phase: 3 });
  const explicit = options.config ? relative(home, resolve(home, options.config)) : null;
  const config = findConfig(dir, explicit && !explicit.startsWith('..') ? explicit : options.config ? resolve(home, options.config) : null);
  const flows = config ? loadFlows(config) : [];
  if (agent.settings && ctx.proposals.size) emit({ kind: 'extension.written', ext: 'x1', extKind: 'breakdown', name: 'Tree and scenario breakdown',
    path: `${STATE_DIR}/discovery/${slug(branch)}.jsonl`, why: 'Units come straight from the diff and every cited line was checked. Which scenarios matter is the agent’s judgment.',
    state: 'review', need: 'Skim the scenarios once. Each one counts only after a flow proves it.', unit: null });
  let seen: Map<string, Array<{ method: string; path: string }>> = new Map();
  if (config) { try { seen = new Map((latestObservedRun(dirname(config), null)?.cases ?? []).map((c) => [c.caseId, c.requests])); } catch { /* no saved runs */ } }
  draftScenarios(ctx, flows, config, seen);
  aborted(ctx);

  // Phase 4: how much to prove.
  emit({ kind: 'phase.started', phase: 4 });
  const counts = { min: modeCount(state, 'min'), std: modeCount(state, 'std'), max: modeCount(state, 'max') };
  emit({ kind: 'mode.asked', counts });
  let mode: Mode = options.mode ?? 'min'; let by: 'flag' | 'you' | 'default' = options.mode ? 'flag' : 'default';
  if (!options.mode && options.chooseMode) { const picked = await options.chooseMode(counts); if (picked) { mode = picked; by = 'you'; } }
  emit({ kind: 'mode.chosen', mode, by });
  aborted(ctx);

  // Phase 5: prove.
  emit({ kind: 'phase.started', phase: 5 });
  const t = Date.now();
  if (options.prove) await prove(ctx, config, agent.settings);
  const inRun = state.scenarios.filter((s) => MODE_RANK[s.mode] <= MODE_RANK[mode]);
  if (!options.prove) for (const s of inRun) emit({ kind: 'scenario.not_run', scenario: s.id, why: s.flow ? `${options.proveOn ?? PROVE_ON_CLI} to run ${s.flow}` : 'No flow proves this yet' });
  const res = (st: string) => inRun.filter((s) => state.run[s.id]?.st === st).length;
  emit({ kind: 'discovery.finished', ran: res('pass') + res('fail'), passed: res('pass'), failed: res('fail'), notRun: res('not_run') });
}

function aborted(ctx: Ctx) {
  if (ctx.signal?.aborted) throw new Blocked([{ code: 'discovery_cancelled', detail: 'stopped before it finished', owner: 'operator', action: 'start it again when ready' }]);
}
const execGit = (dir: string, args: string[]) => git(dir, args).trim();

export const slug = (branch: string) => branch.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'change';
/** The last saved grow of a branch, folded back into state, so a reload shows it instead of an empty start card. */
export function lastGrow(dir: string, branch: string): { state: GrowState; log: string; at: string } | null {
  const path = join(dir, STATE_DIR, 'discovery', `${slug(branch)}.jsonl`);
  try {
    const state = freshGrow();
    for (const line of readFileSync(path, 'utf8').split('\n')) if (line.trim()) applyGrow(state, JSON.parse(line) as GrowEvent);
    return state.change ? { state, log: relative(dir, path), at: statSync(path).mtime.toISOString() } : null;
  } catch { return null; }
}
function saveLog(dir: string, branch: string, events: GrowEvent[]): string | null {
  try {
    const folder = join(dir, STATE_DIR, 'discovery'); mkdirSync(folder, { recursive: true });
    const path = join(folder, `${slug(branch)}.jsonl`);
    writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return path;
  } catch { return null; }
}

/** Lanes trace in parallel: what people touch, the server side, supporting code, and the roots. */
function lanesOf(units: ChangeUnit[]): Array<{ brief: string; units: ChangeUnit[] }> {
  const groups: Array<{ brief: string; test: (u: ChangeUnit) => boolean }> = [
    { brief: 'screens and commands', test: (u) => u.layer === 'ui' || u.layer === 'cli' },
    { brief: 'routes and jobs', test: (u) => u.layer === 'api' || u.layer === 'jobs' },
    { brief: 'supporting code', test: (u) => u.layer === 'lib' },
    { brief: 'roots', test: (u) => u.root },
  ];
  return groups.map((g) => ({ brief: g.brief, units: units.filter(g.test) })).filter((g) => g.units.length);
}

/* ---------- rules tracer ---------- */

const EFFECTS: Array<{ test: RegExp; say: (m: RegExpExecArray) => string }> = [
  { test: /\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*['"]([\w.-]+)['"]/, say: (m) => `runs ${m[1]}` },
  { test: /\b(?:writeFileSync|writeFile|appendFileSync|mkdirSync|renameSync|rmSync|unlinkSync)\(/, say: () => 'writes files' },
  { test: /\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b|\.(?:insert|upsert|destroy)\(|prisma\.\w+\.(?:create|update|delete)/i, say: () => 'writes the database' },
  { test: /\bfetch\(|\baxios\.|\bhttps?\.request\(|\brequests\.(?:get|post)\(/, say: () => 'calls over the network' },
  { test: /text\/event-stream/, say: () => 'streams server-sent events' },
  { test: /\.enqueue\(|\bqueue\.add\(|\.delay\(/, say: () => 'enqueues work' },
  { test: /\bres\.writeHead\(|\breturn send\(|\bres\.(?:json|send)\(/, say: () => 'answers HTTP' },
  { test: /process\.stdout\.write\(|\bconsole\.log\(/, say: () => 'prints to the terminal' },
];

function traceRules(ctx: Ctx, agent: string, lane: { brief: string; units: ChangeUnit[] }) {
  const { emit } = ctx;
  emit({ kind: 'agent.started', agent, brief: lane.brief, by: 'rules', model: null, units: lane.units.map((u) => u.id) });
  const check = (u: ChangeUnit, step: DepthStep, status: DepthStatus, loc: string, note: string) => emit({ kind: 'depth.checked', agent, unit: u.id, step, status, loc, note, by: 'rules' });
  for (const u of lane.units) {
    const at = `${u.file}:${u.line}`;
    // read
    const adds = u.added.length;
    const names = [...new Set(u.added.map((a) => /(?:function|class|const|let|def|async function)\s+([A-Za-z_]\w*)/.exec(a.text)?.[1]).filter((x): x is string => !!x))].slice(0, 3);
    check(u, 'read', 'ok', at, `${adds} changed line${adds === 1 ? '' : 's'}${names.length ? `; declares ${names.join(', ')}` : ''}`);
    // callers
    const callers = callersOf(ctx, u);
    ctx.callers.set(u.id, callers.status === 'ok' ? callers.loc : null);
    check(u, 'callers', callers.status, callers.loc, callers.note);
    // effects
    const effects = new Map<string, number>();
    for (const a of u.added) if (!isPatternSource(a.text)) for (const e of EFFECTS) { const m = e.test.exec(a.text); if (m) { const what = e.say(m); if (!effects.has(what)) effects.set(what, a.line); } }
    if (u.layer === 'ext') {
      const why = `The call leaves this repo for ${u.label}. What ${u.label} does with it can’t be traced from here.`;
      check(u, 'effects', 'stop', at, why);
      emit({ kind: 'trace.stopped', unit: u.id, at, why });
    } else if (effects.size) {
      const list = [...effects].slice(0, 3);
      check(u, 'effects', 'ok', `${u.file}:${list.map(([, l]) => l).join(', :')}`, sentence(list.map(([w]) => w)));
    } else check(u, 'effects', 'none', '—', 'No side effects in the changed lines');
    for (const [layer, status, adapter, reason] of cellsFor(u, [...effects.keys()], callers.status === 'ok' ? callers.loc : null)) emit({ kind: 'layer.needed', unit: u.id, layer, status, adapter, reason });
    // tests
    const tests = testsOf(ctx, u);
    check(u, 'tests', tests.status, tests.loc, tests.note);
    // spec
    if (!ctx.criteria.length) check(u, 'spec', 'none', '—', 'No spec to match against');
    else {
      const hits = ctx.criteria.map((c) => ({ c, words: matchCriterion(c.text, u) })).filter((x) => x.words.length);
      if (hits.length) {
        check(u, 'spec', 'ok', hits.map((h) => h.c.id).join(', '), `Shares words with ${hits.map((h) => h.c.id).join(', ')}`);
        for (const h of hits) emit({ kind: 'criterion.linked', id: h.c.id, unit: u.id, why: `shares “${h.words.slice(0, 3).join('”, “')}”` });
      } else {
        check(u, 'spec', 'none', '—', 'Not named in the spec');
        if (u.layer !== 'lib') emit({ kind: 'drift.found', unit: u.id, loc: at, what: u.label, why: 'Changed here but not named in the spec. Confirm it’s intended, or add it to the spec.' });
      }
    }
  }
  emit({ kind: 'agent.done', agent, ok: true, note: `${lane.units.length} unit${lane.units.length === 1 ? '' : 's'}, ${lane.units.length * 5} checks` });
}

const sentence = (parts: string[]) => { const s = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? ''; return s.charAt(0).toUpperCase() + s.slice(1); };

function callersOf(ctx: Ctx, u: ChangeUnit): { status: DepthStatus; loc: string; note: string } {
  if (u.root && u.parent) { const p = ctx.units.find((x) => x.id === u.parent); return { status: 'ok', loc: `${u.file}:${u.line}`, note: `Called from ${p?.label ?? u.file}` }; }
  if (u.root) return { status: 'ok', loc: `${u.file}:${u.line}`, note: `Reached from ${u.file}` };
  const hits = grepAt(ctx.dir, ctx.branch, u.needles).filter((h) => h.file !== u.file && !ctx.isTest(h.file));
  const pick = u.kind === 'route' ? hits.find((h) => /fetch\(|api\(|EventSource|href|url|curl|GET|POST/.test(h.text)) ?? hits[0]
    : u.kind === 'command' ? hits.find((h) => /\.md$/.test(h.file)) ?? hits[0]
    : hits.find((h) => /\bimport\b|\brequire\(|\bfrom\s/.test(h.text));
  const n = new Set(hits.filter((h) => u.kind !== 'module' && u.kind !== 'component' && u.kind !== 'page' && u.kind !== 'job' || /\bimport\b|\brequire\(|\bfrom\s/.test(h.text)).map((h) => h.file)).size;
  if (!pick) return { status: 'none', loc: '—', note: u.kind === 'route' ? 'Nothing in the repo requests this path; only outside clients would' : u.kind === 'command' ? 'Not documented or referenced anywhere yet' : 'Nothing on the branch imports it yet' };
  const where = `${pick.file}:${pick.line}`;
  const note = u.kind === 'route' ? `Requested from ${pick.file}` : u.kind === 'command' ? (/\.md$/.test(pick.file) ? `Documented in ${pick.file}` : `Named in ${pick.file}`) : `Imported by ${n} file${n === 1 ? '' : 's'}, first ${pick.file}`;
  return { status: 'ok', loc: where, note };
}

function testsOf(ctx: Ctx, u: ChangeUnit): { status: DepthStatus; loc: string; note: string } {
  const needles = u.layer === 'ext' && u.provider?.name === 'GitHub' ? ['gh pr view', "'gh'"] : u.root ? [u.label] : u.needles;
  const hits = grepAt(ctx.dir, ctx.branch, needles).filter((h) => ctx.isTest(h.file) && h.file !== u.file);
  if (!hits.length) return { status: 'none', loc: '—', note: 'No test mentions it' };
  const changed = new Set(ctx.files.filter((f) => f.role === 'test').map((f) => f.path));
  const pick = hits.find((h) => changed.has(h.file)) ?? hits[0]!;
  const files = new Set(hits.map((h) => h.file)).size;
  return { status: 'ok', loc: `${pick.file}:${pick.line}`, note: `${files} test file${files === 1 ? ' mentions' : 's mention'} it${changed.has(pick.file) ? `; ${basename(pick.file)} changed in this branch` : ''}` };
}

function cellsFor(u: ChangeUnit, effects: string[], caller: string | null): Array<[Layer, CellStatus, string, string]> {
  const out: Array<[Layer, CellStatus, string, string]> = [];
  if (u.kind === 'route') out.push(['api', 'built', 'http', `${u.method} ${u.path} is called directly`]);
  if (u.kind === 'command') out.push(['cli', 'built', 'command', 'Run as a command; its exit code and output are checked']);
  if (u.layer === 'ui') out.push(['ui', 'built', 'browser', 'Driven in a real browser by role and label']);
  if (u.layer === 'jobs') out.push(['jobs', 'built', 'job', 'Observed as a native job run']);
  if (u.layer === 'lib' || (u.layer === 'cli' && u.kind !== 'command')) out.push([u.layer, 'indirect', 'none', caller ? `No surface of its own; proved through ${caller.split(':')[0]}` : 'No surface of its own, and nothing calls it yet']);
  if (u.layer === 'data') out.push(['data', 'indirect', 'http', 'No database adapter yet; read back through the app’s API']);
  if (u.layer === 'cache') out.push(['cache', 'indirect', 'http', 'Proved by behavior (limits, expiry), not by reading the cache']);
  if (u.layer === 'ext') out.push(['ext', 'built', 'stand-in', `${u.label} is replaced by a recording stand-in on every PR`]);
  if (!u.root && effects.includes('writes the database')) out.push(['data', 'indirect', 'http', 'No database adapter yet; read back through the API']);
  if (!u.root && effects.includes('writes files')) out.push(['data', 'indirect', u.kind === 'route' ? 'http' : 'none', 'Files it writes are checked by reading them back through the app']);
  return out;
}

/* ---------- agent tracer ---------- */

function agentFor(dir: string, options: GrowOptions, checkedOut: boolean): { settings: AgentSettings | null; why: string | null } {
  if (options.agent?.off) return { settings: null, why: null };
  let config = null;
  try { const path = configInDirectory(dir); config = path ? loadAuthoringConfig(path) : null; } catch { config = null; }
  let settings: AgentSettings;
  try { settings = resolveAgentSettings(dir, config, { provider: options.agent?.provider ?? null, model: options.agent?.model ?? null }); } catch (error) { return { settings: null, why: (error as Error).message }; }
  if (settings.provider === 'none') return { settings: null, why: 'No agent selected, so the rules traced everything. Choose Claude or Codex for a deeper trace.' };
  if (!detectAgents()[settings.provider]) return { settings: null, why: `${settings.provider === 'claude' ? 'Claude Code' : 'Codex'} is not installed, so the rules traced everything.` };
  if (!checkedOut) return { settings: null, why: 'The agent reads files on disk, and git could not check this branch out beside your working copy, so the rules traced everything.' };
  return { settings, why: null };
}

const Claim = z.object({ found: z.boolean(), loc: z.string().max(300).default(''), note: z.string().max(500).default('') });
const AgentAnswer = z.object({ units: z.array(z.object({
  unit: z.string(), journey: z.string().max(80).nullish(), read: Claim.nullish(), callers: Claim.nullish(), effects: Claim.extend({ stop: z.string().max(400).nullish() }).nullish(), tests: Claim.nullish(),
  spec: z.object({ criteria: z.array(z.string()).max(24).default([]), note: z.string().max(500).default('') }).nullish(),
  scenarios: z.array(z.object({ kind: z.enum(['happy', 'sad', 'edge']), title: z.string().min(3).max(160), proves: z.string().max(500).default(''), criteria: z.array(z.string()).max(24).default([]) })).max(6).default([]),
})).max(60) });

export function tracePrompt(input: { branch: string; base: string; brief: string; units: ChangeUnit[]; criteria: Criterion[] }): string {
  return [
    `You are tracing part of a code change for tracegrove, an end-to-end testing tool. The repository in the current folder has branch ${input.branch} checked out; the change is ${input.base}...${input.branch}.`,
    `Your lane: ${input.brief}. Work read-only (Read, Glob, Grep). Be quick: at most a few reads per unit.`,
    '', 'Units to trace (id, what, where it is declared, changed lines):',
    ...input.units.map((u) => `- ${u.id}: ${u.label} (${u.kind}) at ${u.file}:${u.line}; changed lines ${u.added.slice(0, 1).map((a) => a.line).join('')}${u.added.length > 1 ? `-${u.added.at(-1)!.line}` : ''}`),
    '', input.criteria.length ? 'Spec criteria:' : 'There is no spec for this change.', ...input.criteria.map((c) => `- ${c.id}: ${c.text}`),
    '', 'For every unit answer five checks. Each check is {"found": true|false, "loc": "path:line", "note": "one short sentence"}:',
    '- read: what the changed code does (loc = the line you read).',
    '- callers: who calls or reaches it (another file, not its own).',
    '- effects: what it writes, sends or runs. If the effect leaves this repo (a third-party service), set "stop" to one sentence saying where tracing has to stop.',
    '- tests: a test that exercises it (found=false if none).',
    '- spec: {"criteria": ["C1"], "note": "..."} with the criteria it serves by meaning; empty when it serves none.',
    'For a unit where a person or caller starts (a screen, a command, a job, a route called from outside), add "journey": what they do there, in 3 to 7 plain words (for example "Add a seat from the billing page").',
    'Then propose 1 to 4 scenarios per unit that would prove it end to end: {"kind": "happy"|"sad"|"edge", "title": "...", "proves": "what must be observably true", "criteria": ["C1"]}. Put the riskiest failure first among sad and edge.',
    '', 'Cite only lines you opened. tracegrove checks every path:line you cite against the branch and drops claims that do not exist.',
    'Reply with JSON only, no prose: {"units": [{"unit": "u1", "read": {...}, "callers": {...}, "effects": {...}, "tests": {...}, "spec": {...}, "scenarios": [...]}]}',
  ].join('\n');
}

function traceCommand(settings: AgentSettings, prompt: string): { bin: 'claude' | 'codex'; args: string[] } {
  if (settings.provider === 'codex') return { bin: 'codex', args: ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--model', settings.model ?? DEFAULT_MODELS.codex!, prompt] };
  return { bin: 'claude', args: ['-p', prompt, '--model', settings.model ?? DEFAULT_MODELS.claude!, '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Read,Glob,Grep',
    '--disallowedTools', 'Write,Edit,Bash,WebFetch,WebSearch', '--no-session-persistence', ...(settings.maxBudgetUsd ? ['--max-budget-usd', String(settings.maxBudgetUsd)] : [])] };
}

const AGENT_TIMEOUT_MS = 240_000;
async function traceWithAgent(ctx: Ctx, agent: string, lane: { brief: string; units: ChangeUnit[] }, settings: AgentSettings): Promise<void> {
  const { emit } = ctx;
  emit({ kind: 'agent.started', agent, brief: lane.brief, by: settings.provider as Tracer, model: settings.model, units: lane.units.map((u) => u.id) });
  const cmd = traceCommand(settings, tracePrompt({ branch: ctx.branch, base: ctx.base, brief: lane.brief, units: lane.units, criteria: ctx.criteria }));
  const bin = detectAgents()[cmd.bin]!;
  const out = await new Promise<{ code: number; text: string }>((done) => {
    const child = spawn(bin, cmd.args, { cwd: ctx.dir, env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; let pending = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), AGENT_TIMEOUT_MS); timer.unref();
    const stop = () => child.kill('SIGKILL');
    ctx.signal?.addEventListener('abort', stop, { once: true });
    const take = (chunk: Buffer) => {
      const piece = chunk.toString(); text = (text + piece).slice(-400_000); pending += piece;
      const lines = pending.split('\n'); pending = lines.pop() ?? '';
      for (const line of lines) for (const said of describeAgentLine(line)) emit({ kind: 'agent.said', agent, line: said.replaceAll(`${ctx.dir}/`, '') });
    };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('error', () => { clearTimeout(timer); done({ code: 127, text }); });
    child.on('close', (code) => { clearTimeout(timer); ctx.signal?.removeEventListener('abort', stop); done({ code: code ?? 1, text }); });
  });
  const answer = parseAnswer(settings.provider === 'claude' ? claudeResult(out.text) ?? out.text : out.text);
  if (!answer) { emit({ kind: 'agent.done', agent, ok: false, note: out.code === 0 ? 'Answered without the JSON tracegrove asked for; kept the rules’ answers' : `Exited ${out.code}; kept the rules’ answers` }); return; }
  let kept = 0; let dropped = 0;
  const lines = new Map<string, number | null>();
  const lineCount = (file: string) => { if (!lines.has(file)) { const text = readAt(ctx.dir, ctx.branch, file); lines.set(file, text === null ? null : text.split('\n').length); } return lines.get(file)!; };
  const verify = (unit: string, loc: string): string | null => {
    const m = /([\w./@+-]+\.[A-Za-z0-9]+):(\d+)/.exec(loc);
    if (!m) return `cited “${loc.slice(0, 80)}”, which is not a path:line`;
    const n = lineCount(m[1]!.replace(/^\.\//, ''));
    if (n === null) return `cited ${m[1]}, which is not on ${ctx.branch}`;
    if (Number(m[2]) < 1 || Number(m[2]) > n) return `cited ${m[1]}:${m[2]}, but the file has ${n} lines`;
    void unit; return null;
  };
  for (const a of answer.units) {
    const u = lane.units.find((x) => x.id === a.unit); if (!u) continue;
    const claim = (step: DepthStep, c: z.infer<typeof Claim> | null | undefined, stop?: string | null) => {
      if (!c) return;
      if (!c.found) { emit({ kind: 'depth.checked', agent, unit: u.id, step, status: 'none', loc: '—', note: c.note || 'None found', by: settings.provider as Tracer }); kept++; return; }
      const bad = verify(u.id, c.loc);
      if (bad) { emit({ kind: 'claim.dropped', agent, unit: u.id, loc: c.loc, why: bad }); dropped++; return; }
      emit({ kind: 'depth.checked', agent, unit: u.id, step, status: stop ? 'stop' : 'ok', loc: c.loc, note: stop || c.note, by: settings.provider as Tracer }); kept++;
      if (stop) emit({ kind: 'trace.stopped', unit: u.id, at: c.loc, why: stop });
    };
    const journey = a.journey?.trim() ? ctx.state.journeys.find((j) => j.entry === u.id) : undefined;
    if (journey && a.journey) emit({ kind: 'journey.named', journey: journey.id, title: a.journey.trim().replace(/[.]$/, ''), by: settings.provider as Tracer });
    claim('read', a.read); claim('callers', a.callers); claim('effects', a.effects, a.effects?.stop ?? null); claim('tests', a.tests);
    if (a.spec) {
      const ids = a.spec.criteria.filter((id) => ctx.criteria.some((c) => c.id === id));
      emit({ kind: 'depth.checked', agent, unit: u.id, step: 'spec', status: ids.length ? 'ok' : 'none', loc: ids.join(', ') || '—', note: a.spec.note || (ids.length ? `Serves ${ids.join(', ')}` : 'Serves no criterion'), by: settings.provider as Tracer });
      for (const id of ids) emit({ kind: 'criterion.linked', id, unit: u.id, why: a.spec.note || 'by meaning, per the agent' });
      kept++;
    }
    const proposals = a.scenarios.map((s) => ({ ...s, criteria: s.criteria.filter((id) => ctx.criteria.some((c) => c.id === id)) }));
    if (proposals.length) ctx.proposals.set(u.id, proposals);
  }
  emit({ kind: 'agent.done', agent, ok: true, note: `${kept} checks kept${dropped ? `, ${dropped} dropped for citing lines that don’t exist` : ''}` });
}

export function parseAnswer(text: string): z.infer<typeof AgentAnswer> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidates = [fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter((c): c is string => !!c && c.trim().startsWith('{'));
  for (const c of candidates) { try { const parsed = AgentAnswer.safeParse(JSON.parse(c)); if (parsed.success) return parsed.data; } catch { /* next */ } }
  return null;
}

/* ---------- scenarios ---------- */

type Template = { kind: Exclude<ScenarioKind, 'regression'>; title: string; proves: string; risk: number; mockOnly?: string; auth?: boolean };
function templates(u: ChangeUnit, effects: string[]): Template[] {
  if (u.kind === 'route') {
    const writes = u.method !== 'GET' && u.method !== 'HEAD';
    const risk = riskOf({ method: u.method!, path: u.path! }).score;
    const out: Template[] = writes
      ? [{ kind: 'happy', title: `${u.label} saves and reads back`, proves: 'Returns 2xx, and a readback through the API shows the change.', risk: 0 },
         { kind: 'sad', title: 'An invalid body is refused', proves: 'Returns 4xx with a reason, and nothing is written.', risk: 2 + risk },
         { kind: 'edge', title: 'Sending it twice does not duplicate', proves: 'The second identical request leaves one record.', risk: 1 + risk }]
      : [{ kind: 'happy', title: `${u.label} answers with what callers need`, proves: 'Returns 200 with the fields its callers read.', risk: 0 },
         { kind: 'sad', title: 'Bad input is refused', proves: 'An unknown id or malformed query returns 4xx and changes nothing.', risk: 2 }];
    out.push({ kind: 'edge', title: 'Without a session it is refused', proves: 'A caller with no token or session gets 401 or 403, never data.', risk: 3 + risk, auth: true });
    if (effects.includes('streams server-sent events')) out.push({ kind: 'edge', title: 'The client leaves mid-stream', proves: 'The server stops the work and frees its lock when the connection closes.', risk: 2 });
    return out;
  }
  if (u.kind === 'command') return [
    { kind: 'happy', title: `\`${u.label}\` runs and exits 0`, proves: 'Prints its result and exits 0 on a real checkout.', risk: 0 },
    { kind: 'sad', title: 'A bad flag exits 2 and names the problem', proves: 'Exit code 2 with the reason and the fix, and nothing is written.', risk: 2 },
    { kind: 'edge', title: 'Piped output stays plain', proves: 'Without a terminal it prints plain lines: no colors, no redraw.', risk: 1 }];
  if (u.layer === 'ui') return [
    { kind: 'happy', title: `${u.label} renders and its main action works`, proves: 'In a real browser the new part appears and its primary control does what it says.', risk: 0 },
    { kind: 'sad', title: 'When its API fails, it says so', proves: 'An error from the server shows as a readable message, not a blank view.', risk: 2 },
    { kind: 'edge', title: 'Works on a 375 px screen', proves: 'No horizontal scroll, and every control can be reached.', risk: 1 }];
  if (u.layer === 'jobs') return [
    { kind: 'happy', title: `${u.label} runs once and its effect lands`, proves: 'The job runs, and its effect can be read back.', risk: 0 },
    { kind: 'sad', title: 'When a dependency fails, it retries', proves: 'The job retries with backoff and records the failure.', risk: 2 },
    { kind: 'edge', title: 'Enqueued twice, the effect happens once', proves: 'A duplicate enqueue does not double the effect.', risk: 1 }];
  if (u.layer === 'data') return [{ kind: 'happy', title: `Rows in ${u.label} read back`, proves: 'What the change writes can be read back through the app.', risk: 0 },
    { kind: 'edge', title: 'Its constraints hold', proves: 'Duplicates and invalid rows are refused by the database.', risk: 2 }];
  if (u.layer === 'cache') return [{ kind: 'edge', title: 'The limit or expiry holds', proves: 'The cached behavior changes exactly when it should.', risk: 2 }];
  if (u.layer === 'ext') return [
    { kind: 'happy', title: `Calls ${u.label} and uses the answer`, proves: `The request ${u.label} receives is the one intended, and its answer is used.`, risk: 0 },
    { kind: 'sad', title: `${u.label} errors are surfaced`, proves: `An error from ${u.label} is reported, never swallowed.`, risk: 2 },
    { kind: 'edge', title: `${u.label} is slow or unreachable`, proves: 'The caller times out cleanly and says what happened.', risk: 1, mockOnly: `${u.label} can’t be made slow or unreachable on demand, so this fault runs against the stand-in only` }];
  return [{ kind: 'happy', title: `${u.label} gives its callers the right result`, proves: 'Proved through the commands and routes that call it.', risk: 0 },
    { kind: 'sad', title: 'Unexpected input does not escape as a crash', proves: 'Its callers report a clear error instead of a stack trace.', risk: 1 }];
}

type FlowRow = { caseId: string; title: string; file: string; risk: string; steps: CompiledFlowInfo['steps'] };
function findConfig(dir: string, explicit: string | null): string | null {
  if (explicit) { const path = resolve(dir, explicit); return existsSync(path) ? path : null; }
  const here = configInDirectory(dir);
  if (here) return here;
  // A config one folder down (a dogfood or e2e project beside the code).
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const found = configInDirectory(join(dir, entry.name)); if (found) return found;
    }
  } catch { /* unreadable */ }
  return null;
}
function loadFlows(configPath: string): FlowRow[] {
  try { return compileProject(configPath).flows.map((f) => ({ caseId: f.caseId, title: f.title, file: f.file, risk: f.risk, steps: f.steps })); } catch { return []; }
}
// A literal route (/notes/count) is reached only by that literal path; a flow step on /notes/{noteId} could be any note.
const sameRoute = (u: ChangeUnit, s: { method: string; path: string }) => s.method === u.method
  && (s.path === u.path || (u.path!.includes('{') && (matchesTemplate(u.path!, s.path) || matchesTemplate(s.path, u.path!))));
function flowFor(u: ChangeUnit, t: Template, flows: FlowRow[], taken: Set<string>): string | null {
  if (u.kind !== 'route') return null;
  const fits = (s: FlowRow['steps'][number]) => !sameRoute(u, s) ? false
    : t.kind === 'happy' ? (s.expectStatus === null || s.expectStatus < 400) && s.as !== 'none'
    : t.auth ? s.as === 'none' && (s.expectStatus === 401 || s.expectStatus === 403)
    : t.kind === 'sad' ? s.expectStatus !== null && s.expectStatus >= 400 && s.expectStatus < 500 && s.expectStatus !== 401 && s.expectStatus !== 403 : false;
  const f = flows.find((x) => !taken.has(`${x.caseId}:${t.kind}${t.auth ? ':auth' : ''}`) && x.steps.some(fits));
  if (!f) return null;
  taken.add(`${f.caseId}:${t.kind}${t.auth ? ':auth' : ''}`); return f.caseId;
}

const AUTH_WORDS = /\btoken|\bsession|sign(?:ed)?[ -]?(?:in|out)|log[ -]?in|\bauth|anonymous|unauthori|permission|forbidden/i;
const FAILURE_WORDS = /reject|refus|invalid|\berror|\bfail/i;
/** Which of the linked criteria a scenario speaks for: an auth edge those about tokens and sessions, a happy path the rest, a failure those phrased as a refusal. */
function speaksFor(ctx: Ctx, t: { kind: ScenarioKind; auth?: boolean }, linked: string[]): string[] {
  const text = (id: string) => ctx.criteria.find((c) => c.id === id)?.text ?? '';
  if (t.auth) return linked.filter((id) => AUTH_WORDS.test(text(id)));
  if (t.kind === 'happy') return linked.filter((id) => !AUTH_WORDS.test(text(id)) || !FAILURE_WORDS.test(text(id)));
  return linked.filter((id) => FAILURE_WORDS.test(text(id)) && !AUTH_WORDS.test(text(id)));
}
/** Which criteria a rules template can speak for: as `speaksFor`, except that a signed-out edge takes every criterion about tokens and sessions, and links it. */
function criteriaFor(ctx: Ctx, u: ChangeUnit, t: Template, linked: string[]): string[] {
  if (!t.auth) return speaksFor(ctx, t, linked);
  const ids = ctx.criteria.filter((c) => AUTH_WORDS.test(c.text)).map((c) => c.id);
  for (const id of ids) if (!ctx.state.linked[id]?.some((l) => l.unit === u.id)) ctx.emit({ kind: 'criterion.linked', id, unit: u.id, why: `${u.label} has a signed-out edge, which is what it describes` });
  return ids;
}

type Drafted = Template & { criteria: string[]; on?: ChangeUnit; polarity?: Polarity };
const AUTH_TITLE = /session|token|signed.out|unauth|forbidden|permission/i;
const SLOW = /time ?out|slow|unreachable|hang/i;
const GUARD = /refus|reject|invalid|\bbad (?:input|flag|body|request)|unauthori|forbid|denied|permission|signed.out|without a (?:session|token)|\bnever\b|outside|constraint|\blimit|not allowed|\b4(?:0\d|22|29)\b/i;
const FAULT = /\bwhen\b.*\b(?:fail|error|refuse|down)|slow|unreachable|time ?out|retr(?:y|ies)|crash|declin|hiccup/i;
/** Happy when the path works, including an edge it must still work at (a small screen, an empty list); guard when the app
 * refuses what it must (a session, a valid body); failure when it meets a fault. */
const polarityOf = (t: { kind: ScenarioKind; title: string; auth?: boolean }): Polarity =>
  t.kind === 'happy' ? 'happy' : t.auth || (GUARD.test(t.title) && !FAULT.test(t.title)) ? 'guard' : t.kind === 'sad' || FAULT.test(t.title) ? 'failure' : 'happy';
/** A flow's polarity, read from its steps: a stand-in fault is a failure, an expected 4xx a guard, otherwise the path works. */
const flowPolarity = (f: FlowRow): Polarity => (f.steps.some((st) => st.method === 'FAULT') ? 'failure' : f.steps.some((st) => st.expectStatus !== null && st.expectStatus >= 400) ? 'guard' : 'happy');
/** A flow title that restates a criterion: it shares at least three of the criterion's words, and half of them or more. */
const restates = (title: string, criterion: string) => { const want = termsOf(criterion); const shared = [...termsOf(title)].filter((t) => want.has(t)).length; return shared >= 3 && shared * 2 >= want.size; };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A journey's own scenarios, at the surface a person starts from: end to end first, then the ways it fails there. */
function journeyTemplates(entry: ChangeUnit, parts: ChangeUnit[], effects: string[]): Template[] {
  if (entry.layer !== 'ui') return templates(entry, effects);
  const routes = parts.filter((p) => p.kind === 'route');
  const names = routes.slice(0, 3).map((r) => r.label).join(', ') + (routes.length > 3 ? ` and ${routes.length - 3} more` : '');
  return [
    { kind: 'happy', title: `${words(entry.label)} works end to end in a real browser`, risk: 0,
      proves: routes.length ? `In a real browser, ${entry.label} calls ${names} and the page shows the result.` : `In a real browser, ${entry.label} renders and its main control does what it says.` },
    { kind: 'sad', title: 'When the server refuses, the page says so', proves: `An error from ${routes[0]?.label ?? 'its API'} shows as a readable message, not a blank view.`, risk: 2 },
    { kind: 'edge', title: 'Works on a 375 px screen', proves: 'No horizontal scroll, and every control can be reached.', risk: 1 },
  ];
}

/**
 * The browser flow that proves a browser journey, by evidence: its last verified run reached the journey's
 * routes, its steps drive a test id, label or role that the change's UI lines add, or its API steps reach the
 * journey's routes. The most evidence wins. A title sharing three words with the journey comes last, and only
 * when there is no saved run to go by.
 */
const GENERIC = new Set(['browser', 'page', 'terminal', 'works', 'real', 'screen']);
function browserFlowFor(j: GrowJourney, parts: ChangeUnit[], added: string, flows: FlowRow[], taken: Set<string>, seen: Map<string, Array<{ method: string; path: string }>>): string | null {
  const routes = parts.filter((u) => u.kind === 'route');
  const want = new Set([...termsOf([j.title, ...parts.map((u) => (u.kind === 'route' ? u.path ?? '' : words(u.label)))].join(' '))].filter((t) => !GENERIC.has(t)));
  // A control the added lines name: quoted or as element text, or built from a quoted prefix ('grow-mode-' + id).
  const prefixes = [...added.matchAll(/['"`]([\w-]{3,}[-_])['"`]\s*\+/g)].map((m) => m[1]!);
  const named = (name: string) => name.length >= 3 && (new RegExp(`['"\`>]${escapeRe(name)}['"\`<]`).test(added) || prefixes.some((p) => name.startsWith(p) && name.length > p.length));
  const best = flows.filter((f) => !taken.has(`${f.caseId}:happy`) && f.steps.some((st) => st.method === 'UI')).map((f) => {
    const hits = routes.filter((r) => (seen.get(f.caseId) ?? []).some((q) => sameRoute(r, q))).length;
    const marks = new Set(f.steps.filter((st) => st.method === 'UI' && !st.path.startsWith('navigate ')).map((st) => st.path.slice(st.path.indexOf(' ') + 1)).filter(named)).size;
    const reached = routes.filter((r) => f.steps.some((st) => st.method !== 'UI' && sameRoute(r, st))).length;
    const shared = [...termsOf(f.title)].filter((t) => want.has(t)).length;
    return { f, evidence: hits + marks + reached, shared };
  }).filter((m) => m.evidence > 0 || (!seen.size && m.shared >= 3)).sort((a, b) => b.evidence - a.evidence || b.shared - a.shared)[0];
  if (!best) return null;
  taken.add(`${best.f.caseId}:happy`); return best.f.caseId;
}

const CRITICAL_CAP = 3;
/**
 * The critical cut: the journeys whose own proof belongs in the minimum, never more than three. The journey that
 * holds the most of the change always; then, with a spec, the journeys that serve its criteria, the one serving
 * the most still unserved first; then any other journey holding a tenth of the change or more. A journey's weight
 * is the changed lines it owns (a part several share counts once, for the journey that ranks first) times the
 * layers it crosses. A criterion that only a journey outside the cut serves still joins the minimum, through one
 * scenario (see `draftScenarios`).
 */
function criticalJourneys(ctx: Ctx, linkedTo: (unit: string) => string[]): Set<string> {
  const js = ctx.state.journeys;
  const unit = (id: string) => ctx.units.find((u) => u.id === id);
  const layers = (j: GrowJourney) => new Set(j.units.map((id) => unit(id)?.layer)).size;
  const claimed = new Set<string>(); const ranked: Array<{ j: GrowJourney; weight: number }> = [];
  for (let left = [...js]; left.length;) {
    const top = left.map((j) => ({ j, weight: j.units.filter((id) => !claimed.has(id)).reduce((n, id) => n + (unit(id)?.added.length ?? 0), 0) * layers(j) }))
      .sort((a, b) => b.weight - a.weight)[0]!;
    ranked.push(top); top.j.units.forEach((id) => claimed.add(id)); left = left.filter((j) => j !== top.j);
  }
  if (!ranked.length) return new Set();
  const total = ranked.reduce((n, r) => n + r.weight, 0);
  const serves = (j: GrowJourney) => [...new Set(j.units.flatMap(linkedTo))];
  const picked = [ranked[0]!.j]; const served = new Set(serves(ranked[0]!.j));
  while (picked.length < CRITICAL_CAP) {
    const next = ranked.filter((r) => !picked.includes(r.j)).map((r) => ({ j: r.j, gain: serves(r.j).filter((c) => !served.has(c)).length }))
      .filter((x) => x.gain > 0).sort((a, b) => b.gain - a.gain)[0];
    if (!next) break;
    picked.push(next.j); serves(next.j).forEach((c) => served.add(c));
  }
  for (const r of ranked) if (picked.length < CRITICAL_CAP && !picked.includes(r.j) && r.weight >= total / 10) picked.push(r.j);
  return new Set(picked.map((j) => j.id));
}

/**
 * Scenarios by journey. A journey's own scenarios prove it end to end from where a person starts. The minimum
 * is a critical cut: each critical journey's happy path and its single riskiest guard or failure, plus, for each spec
 * criterion they leave unanswered, the one scenario that answers it; other journeys and the other ways each one
 * fails are standard. Max adds every part on its own (a route's contract, a module through its callers, a third
 * party's errors) and regressions. Every criterion linked to the change is carried by a scenario, and the
 * minimum carries each one, so the minimum answers the whole spec without proving any criterion twice over.
 */
function draftScenarios(ctx: Ctx, flows: FlowRow[], config: string | null, seen: Map<string, Array<{ method: string; path: string }>>) {
  const { emit, state } = ctx;
  let n = 0; const taken = new Set<string>();
  const unit = (id: string) => ctx.units.find((u) => u.id === id);
  const linkedTo = (id: string) => Object.entries(state.linked).filter(([, l]) => l.some((x) => x.unit === id)).map(([c]) => c);
  const effectsOf = (u: ChangeUnit) => { const e = (state.depth[u.id]?.effects?.note ?? '').toLowerCase(); return ['streams server-sent events', 'writes the database'].filter((x) => e.includes(x)); };
  const tracerOf = (u: ChangeUnit): Tracer => (ctx.proposals.has(u.id) ? state.agents.find((a) => a.by !== 'rules' && a.units.includes(u.id))?.by ?? 'rules' : 'rules');
  // A proposal that names no criteria speaks for those of the unit's that fit its kind: a sad path does not inherit the happy path's.
  const proposed = (u: ChangeUnit, crit: string[]): Drafted[] | null => ctx.proposals.get(u.id)?.map((p, i) => ({ kind: p.kind, title: p.title, proves: p.proves,
    criteria: p.criteria.length ? [...p.criteria] : speaksFor(ctx, { kind: p.kind, auth: AUTH_TITLE.test(p.title) }, crit), risk: p.kind === 'happy' ? 0 : 10 - i,
    ...(u.layer === 'ext' && SLOW.test(p.title) ? { mockOnly: `${u.label} can’t be made slow or unreachable on demand, so this fault runs against the stand-in only` } : {}),
    ...(AUTH_TITLE.test(p.title) ? { auth: true } : {}) })) ?? null;
  const carried = new Set<string>();
  const carries = (t: Drafted) => `carries ${t.criteria.join(', ')}`;
  const put = (u: ChangeUnit, t: Drafted, mode: Mode, why: string, journey: GrowJourney | null, level: ScenarioLevel, flow: string | null) => {
    const reach = journey && level === 'journey' ? journey.units.map(unit).filter((x): x is ChangeUnit => !!x) : [u];
    const provider = u.layer === 'ext' ? u : reach.find((r) => r.layer === 'ext') ?? ctx.units.find((r) => r.layer === 'ext' && r.parent === u.id);
    const ext = u.layer === 'ext' || (t.kind === 'happy' && !!provider);
    const layers = [...new Set([...reach.map((r) => r.layer), ...reach.flatMap((r) => (state.cells[r.id] ?? []).map((c) => c.layer)), ...(ext ? ['ext' as Layer] : [])])];
    if (mode === 'min') t.criteria.forEach((c) => carried.add(c));
    emit({ kind: 'scenario.drafted', scenario: `s${++n}`, unit: u.id, scenarioKind: t.kind, mode, title: t.title, proves: t.proves, criteria: t.criteria, layers,
      flow, variants: ext ? (t.mockOnly ? ['mock'] : ['mock', 'real']) : [], realKey: ext && provider?.provider ? provider.provider.keys.join(' or ') : null,
      mockOnly: t.mockOnly ?? null, by: tracerOf(u), ext: ctx.proposals.has(u.id) ? ['x1'] : [], journey: journey?.id ?? null, level, polarity: t.polarity ?? polarityOf(t), modeWhy: why });
  };

  // Spec words name a journey the rules could only call by its file: the first criterion its entry serves, or any of its parts.
  for (const j of state.journeys) {
    if (j.titleBy !== 'rules') continue;
    const happy = (id: string) => linkedTo(id).filter((c) => !FAILURE_WORDS.test(ctx.criteria.find((x) => x.id === c)?.text ?? ''));
    const pick = happy(j.entry)[0] ?? j.units.map(happy).flat()[0];
    const text = pick ? ctx.criteria.find((c) => c.id === pick)!.text.replace(/[.]$/, '') : null;
    if (text) emit({ kind: 'journey.named', journey: j.id, title: text.charAt(0).toUpperCase() + text.slice(1), by: 'spec' });
  }

  // Each journey's own scenarios, planned in full first so the minimum is cut across all of them.
  const critical = criticalJourneys(ctx, linkedTo);
  const textOf = (id: string) => ctx.criteria.find((c) => c.id === id)?.text ?? '';
  // Every criterion `crit` names is carried by one of `list`. One that no scenario speaks for (a template's words did
  // not fit it, or an agent named others) goes to the closest: a refusal to a failure path, a signed-out refusal to
  // the signed-out edge, anything else to the happy path.
  const carryAll = (list: Drafted[], crit: string[]) => {
    for (const c of crit) {
      if (list.some((t) => t.criteria.includes(c))) continue;
      const auth = AUTH_WORDS.test(textOf(c));
      const fails = list.filter((t) => t.kind !== 'happy');
      const home = FAILURE_WORDS.test(textOf(c)) ? fails.find((t) => !!t.auth === auth) ?? fails[0] ?? list[0] : list.find((t) => t.kind === 'happy') ?? list[0];
      home?.criteria.push(c);
    }
  };
  const authDone = new Set<string>();
  const plan: Array<{ j: GrowJourney; on: ChangeUnit; t: Drafted; flow: string | null; mode: Mode; why: string; critical: boolean }> = [];
  for (const j of state.journeys) {
    const entry = unit(j.entry); if (!entry) continue;
    const parts = j.units.map(unit).filter((x): x is ChangeUnit => !!x);
    const crit = [...new Set(parts.flatMap((p) => linkedTo(p.id)))];
    const browser = entry.layer === 'ui';
    // On a screen the happy path takes what the spec says works and the refusal what it says fails; the 375 px check speaks for neither.
    const list: Drafted[] = proposed(entry, crit) ?? journeyTemplates(entry, parts, effectsOf(entry)).map((t) => ({ ...t,
      criteria: !browser ? criteriaFor(ctx, entry, t, crit) : t.kind === 'happy' ? crit.filter((c) => !FAILURE_WORDS.test(textOf(c))) : t.kind === 'sad' ? criteriaFor(ctx, entry, t, crit) : [] }));
    // A screen's routes are still reachable without the screen: the riskiest one's signed-out edge belongs to the journey.
    if (browser) {
      const route = parts.filter((p) => p.kind === 'route' && !authDone.has(p.id)).sort((a, b) => riskOf({ method: b.method!, path: b.path! }).score - riskOf({ method: a.method!, path: a.path! }).score)[0];
      if (route) {
        const t: Template = { kind: 'edge', title: `Without a session, ${route.label} is refused`, proves: 'A caller with no token or session gets 401 or 403, never data.', risk: 3 + riskOf({ method: route.method!, path: route.path! }).score, auth: true };
        list.push({ ...t, criteria: criteriaFor(ctx, route, t, linkedTo(route.id)), on: route });
      }
    }
    // Every criterion the journey's parts serve is carried by one of its own scenarios.
    carryAll(list, crit);
    for (const t of list) if (t.auth) authDone.add((t.on ?? entry).id);
    const happy = list.find((t) => t.kind === 'happy');
    // The riskiest guard or failure: one the tree hangs or shoulders, before an edge the path must still work at.
    const polOf = (t: Drafted) => t.polarity ?? polarityOf(t);
    const byRisk = (a: Drafted, b: Drafted) => b.risk - a.risk;
    const riskiest = list.filter((t) => t.kind !== 'happy' && polOf(t) !== 'happy').sort(byRisk)[0] ?? list.filter((t) => t.kind !== 'happy').sort(byRisk)[0];
    const isCritical = critical.has(j.id);
    // The UI lines this journey's screens add, which a browser flow's controls are matched against.
    const added = browser ? ctx.files.filter((f) => parts.some((p) => p.layer === 'ui' && (p.file === f.path || p.also?.includes(f.path)))).flatMap((f) => f.added.map((a) => a.text)).join('\n') : '';
    for (const t of list) {
      const on = t.on ?? entry;
      const flow = browser && !t.on ? (t.kind === 'happy' ? browserFlowFor(j, parts, added, flows, taken, seen) : null) : flowFor(on, t, flows, taken);
      const [mode, why]: [Mode, string] = isCritical && (t === happy || t === riskiest)
        ? ['min', t.criteria.length ? carries(t) : t === happy ? 'happy path of a critical journey' : 'riskiest guard or failure of this journey']
        : ['std', polOf(t) === 'failure' ? 'another way it fails' : polOf(t) === 'guard' ? 'another guard' : isCritical ? 'another happy path' : 'happy path of a journey outside the critical cut'];
      plan.push({ j, on, t, flow, mode, why, critical: isCritical });
    }
  }
  // A criterion the cut leaves unanswered joins the minimum through one scenario: the one answering the most of what
  // is still open, from a critical journey first, then one a flow already proves. The rest stay where they are.
  const open = new Set(plan.flatMap((p) => p.t.criteria));
  for (const p of plan) if (p.mode === 'min') p.t.criteria.forEach((c) => open.delete(c));
  const gain = (p: (typeof plan)[number]) => p.t.criteria.filter((c) => open.has(c)).length;
  for (;;) {
    const best = plan.filter((p) => p.mode !== 'min' && gain(p) > 0)
      .sort((a, b) => gain(b) - gain(a) || Number(b.critical) - Number(a.critical) || Number(!!b.flow) - Number(!!a.flow))[0];
    if (!best) break;
    best.mode = 'min'; best.why = carries(best.t); best.t.criteria.forEach((c) => open.delete(c));
  }
  for (const p of plan) put(p.on, p.t, p.mode, p.why, p.j, 'journey', p.flow);

  // Flows this branch adds or changes are the author's own proof: each one that reaches a journey's routes is a scenario
  // of that journey. One already proving a journey's path or riskiest guard or failure is drafted above; the rest join the
  // minimum only when they restate a criterion, and are standard otherwise.
  const flowRoot = config ? relative(ctx.dir, dirname(config)) : '';
  const changed = new Set(ctx.files.map((f) => f.path));
  for (const f of flows) {
    if (!changed.has(join(flowRoot, f.file)) || state.scenarios.some((x) => x.flow === f.caseId)) continue;
    const j = state.journeys.find((x) => x.units.some((id) => { const u = unit(id); return u?.kind === 'route' && f.steps.some((st) => sameRoute(u, st)); }));
    if (!j) continue;
    const on = j.units.map(unit).find((u) => u?.kind === 'route' && f.steps.some((st) => sameRoute(u, st)))!;
    const refuses = f.steps.some((st) => st.expectStatus !== null && st.expectStatus >= 400);
    const criteria = ctx.criteria.filter((c) => restates(f.title, c.text)).map((c) => c.id);
    for (const id of criteria) if (!state.linked[id]?.some((l) => l.unit === on.id)) emit({ kind: 'criterion.linked', id, unit: on.id, why: `${f.caseId}, which this branch adds, says it and reaches ${on.label}` });
    // A flow that answers 200 can still be a guard: "never charges the card" is a rule the path must keep.
    const fp = flowPolarity(f), byTitle = polarityOf({ kind: refuses ? 'sad' : 'edge', title: f.title });
    const t: Drafted = { kind: refuses ? 'sad' : 'edge', title: f.title, proves: `${f.caseId}, which this branch adds, holds end to end.`, risk: 0, criteria, polarity: fp === 'happy' && byTitle === 'guard' ? 'guard' : fp };
    put(on, t, criteria.length ? 'min' : 'std', criteria.length ? carries(t) : 'a flow this branch adds', j, 'journey', f.caseId);
  }

  // Parts on their own (max): every part a journey passes through, then changed parts no journey reaches.
  // One that carries a criterion no journey scenario proves is lifted into the minimum.
  const inJourney = new Set(state.journeys.flatMap((j) => j.units));
  const done = new Set(state.journeys.map((j) => j.entry));
  const owner = (id: string) => state.journeys.find((j) => j.units.includes(id)) ?? null;
  for (const u of [...ctx.units.filter((x) => inJourney.has(x.id)), ...ctx.units.filter((x) => !inJourney.has(x.id))]) {
    if (done.has(u.id)) continue; done.add(u.id);
    const own = linkedTo(u.id);
    const list: Drafted[] = proposed(u, own) ?? templates(u, effectsOf(u)).map((t) => ({ ...t, criteria: criteriaFor(ctx, u, t, own) }));
    carryAll(list, own);
    for (const t of list) {
      if (t.auth && authDone.has(u.id)) continue;
      const lift = t.criteria.some((c) => !carried.has(c));
      put(u, t, lift ? 'min' : 'max', lift ? carries(t) : 'part on its own', owner(u.id), 'part', flowFor(u, t, flows, taken));
    }
  }

  // Max: regression of every existing flow that reaches a route declared in a changed file.
  const changedRoutes = ctx.files.filter((f) => f.role === 'code').flatMap((f) => { const text = readAt(ctx.dir, ctx.branch, f.path); return text ? routesOf(f.path, text).map((r) => ({ ...r, file: f.path })) : []; });
  const used = new Set(state.scenarios.map((x) => x.flow).filter(Boolean));
  let r = 0;
  for (const f of flows) {
    if (used.has(f.caseId)) continue;
    const hit = changedRoutes.find((cr) => f.steps.some((st) => (cr.method === 'ANY' || st.method === cr.method) && (matchesTemplate(cr.path, st.path) || st.path === cr.path)));
    if (!hit) continue;
    const u = ctx.units.find((x) => x.kind === 'route' && x.method === hit.method && x.path === hit.path) ?? ctx.units.find((x) => x.file === hit.file) ?? ctx.units.find((x) => !x.root);
    if (!u) continue;
    emit({ kind: 'scenario.drafted', scenario: `r${++r}`, unit: u.id, scenarioKind: 'regression', mode: 'max', title: f.title, proves: `${f.caseId} reaches ${hit.method} ${hit.path} in ${hit.file}, which this change edits.`,
      criteria: [], layers: ['api'], flow: f.caseId, variants: [], realKey: null, mockOnly: null, by: 'rules', ext: [], journey: owner(u.id)?.id ?? null, level: 'part', polarity: flowPolarity(f), modeWhy: 'regression' });
  }
  emit({ kind: 'flows.checked', scenarios: state.scenarios.length, runnable: state.scenarios.filter((x) => x.flow).length, config: config ? relative(ctx.dir, config) : null });
}

/* ---------- prove ---------- */

/**
 * What a flow an agent wrote proved for its scenario, read as a run of an existing flow is: passed; failed only when a check ran
 * and did not hold (the case outcome assertion_failed); otherwise not tested yet, with why, and the run that says so. A flow that
 * did not compile, an app that did not start, a run that was blocked, cancelled or inconclusive, or evidence that did not verify
 * proves nothing either way.
 */
export function writtenFlowResult(scenario: string, flow: Pick<ProvedFlow, 'outcome' | 'detail' | 'run' | 'caseOutcome' | 'failure' | 'verified'>): GrowEventBody {
  if (flow.outcome === 'proven') return { kind: 'scenario.passed', scenario, took: 0, run: flow.run };
  // A run whose evidence did not verify proves nothing either way, and its saved record keeps no case (runReport.ts): it is not
  // proven, though it ran. One that never ran (verified null) says why it could not run.
  const unverified = flow.detail === 'the run evidence did not verify' && flow.verified !== null;
  if (flow.caseOutcome === 'assertion_failed' && !unverified) return { kind: 'scenario.failed', scenario, took: 0, run: flow.run, why: flow.failure ?? flow.detail ?? flow.outcome, outcome: 'assertion_failed' };
  const why = unverified && (flow.caseOutcome === 'passed' || !flow.caseOutcome) ? 'Not proven: the run evidence did not verify'
    : couldNotRun(flow.failure ?? flow.detail ?? 'the run recorded no result for this flow');
  return { kind: 'scenario.not_run', scenario, why, ...(flow.run ? { run: flow.run } : {}), ...(flow.caseOutcome ? { outcome: flow.caseOutcome } : {}) };
}

/**
 * The scenario each flow an agent wrote speaks for, by file. A written flow speaks for a scenario when it says the same thing (two
 * or more terms shared with the scenario's title and claim) and either reached that scenario's route, or served nothing at all:
 * one that did not compile, whose run never reached its checks, or whose evidence did not verify leaves no request on record, so
 * it is the scenario its title says, read only as not tested yet, with why. Flows that reached a route are matched first, then
 * those that served nothing, only to the scenarios still open, so one that served nothing never takes a scenario from a later
 * flow that reached its route. Each scenario takes at most one flow.
 */
export function attributeWritten(written: Array<{ file: string; title: string; flow: ProvedFlow | undefined }>, open: GrowState['scenarios'], units: ChangeUnit[]): Map<string, GrowState['scenarios'][number]> {
  const out = new Map<string, GrowState['scenarios'][number]>(); const taken = new Set<string>();
  const unreached = (flow: ProvedFlow) => flow.served.length === 0 && writtenFlowResult('', flow).kind === 'scenario.not_run';
  for (const pass of ['reached', 'unreached'] as const) {
    for (const { file, title, flow } of written) {
      if (!flow || out.has(file) || (pass === 'unreached') !== unreached(flow)) continue;
      const said = termsOf(title);
      const target = open.map((s) => { const u = units.find((y) => y.id === s.unit);
        const reached = !!u && flow.served.some((sv) => sv.startsWith(`${u.method} `) && sameRoute(u, { method: u.method!, path: sv.slice(sv.indexOf(' ') + 1) }));
        const shared = [...termsOf(`${s.title} ${s.proves}`)].filter((t) => said.has(t)).length;
        return { s, score: !taken.has(s.id) && (pass === 'unreached' || reached) && shared >= 2 ? shared : 0 }; }).filter((q) => q.score).sort((a, b) => b.score - a.score)[0]?.s;
      if (target) { out.set(file, target); taken.add(target.id); }
    }
  }
  return out;
}

async function prove(ctx: Ctx, config: string | null, agent: AgentSettings | null) {
  const { emit, state } = ctx;
  const inRun = state.scenarios.filter((s) => MODE_RANK[s.mode] <= MODE_RANK[state.mode]);
  if (!config) { for (const s of inRun) emit({ kind: 'scenario.not_run', scenario: s.id, why: 'No tracegrove.config.yaml found; run tracegrove init, or pass --config' }); return; }
  const flows = loadFlows(config);
  /* `checked` is true when a check ran and did not hold: only that fails a scenario. A run that never reached its checks (the
     app did not start, a fixture could not be set up, it was blocked or cancelled), or whose evidence did not verify, proves
     nothing either way, and `why` says why it is not tested yet. */
  type Ran = { ok: boolean; checked: boolean; ms: number; run: string | null; why: string; outcome?: string; hop?: string; after?: boolean };
  const results = new Map<string, Ran>();
  /* Where a failed run broke, so the tree can mark that hop: the route whose step failed, or, when a check on other evidence
     failed (a stand-in's calls, say), the last route the flow called before it. */
  const hopOf = (c: TestRunReport['cases'][number]): { hop?: string; after?: boolean } => {
    const http = (x: { method: string }) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(x.method);
    const i = c.failure ? c.steps.findIndex((x) => x.name === c.failure!.step || x.id === c.failure!.step) : -1;
    const at = c.steps[i];
    if (!at) return {};
    if (http(at)) return { hop: `${at.method} ${at.path}` };
    const before = c.steps.slice(0, i).reverse().find(http);
    return before ? { hop: `${before.method} ${before.path}`, after: true } : {};
  };
  const runFlow = async (caseId: string) => {
    const cached = results.get(caseId); if (cached) return cached;
    const flow = flows.find((f) => f.caseId === caseId);
    const t = Date.now();
    let result: Ran;
    try {
      const { report } = await runTests({ configPath: config, grep: flow?.file ?? caseId, ...(ctx.signal ? { signal: ctx.signal } : {}) });
      const c = report.cases.find((x) => x.caseId === caseId);
      const ok = !!c && c.outcome === 'passed' && report.bundleVerified === true;
      const checked = !ok && c?.outcome === 'assertion_failed';
      const said = c?.failure ? `${c.failure.step}: ${c.failure.message}`.slice(0, 400) : report.blockers[0]?.detail ?? 'the run recorded no result for this flow';
      result = { ok, checked, ms: c?.durationMs ?? Date.now() - t, run: basename(report.runDir), outcome: c?.outcome ?? report.outcome,
        why: ok ? '' : checked ? said : c?.outcome === 'passed' || (!c && report.bundleVerified === false) ? 'Not proven: the run evidence did not verify' : couldNotRun(said),
        ...(checked ? hopOf(c) : {}) };
    } catch (error) {
      result = { ok: false, checked: false, ms: Date.now() - t, run: null, why: couldNotRun((error instanceof Blocked ? error.reasons.map((x) => x.detail).join('; ') : (error as Error).message).slice(0, 400)) };
    }
    results.set(caseId, result); return result;
  };
  const real = (s: GrowState['scenarios'][number]) => {
    if (!s.variants.includes('mock')) return;
    if (s.mockOnly) { emit({ kind: 'variant.not_applicable', scenario: s.id, note: s.mockOnly }); return; }
    const keys = (s.realKey ?? '').split(' or ').filter(Boolean);
    const present = keys.find((k) => !!process.env[k]);
    emit({ kind: 'variant.skipped', scenario: s.id, note: present ? `${present} is set, but the config has no sandbox environment to run the real variant against` : `Needs ${keys.join(' or ') || 'a sandbox key'}; none in this environment` });
  };
  for (const s of inRun.filter((x) => x.flow)) {
    if (ctx.signal?.aborted) break;
    emit({ kind: 'scenario.running', scenario: s.id, flow: s.flow! });
    const r = await runFlow(s.flow!);
    if (r.ok) { emit({ kind: 'scenario.passed', scenario: s.id, took: r.ms, run: r.run }); real(s); }
    else if (r.checked) emit({ kind: 'scenario.failed', scenario: s.id, took: r.ms, run: r.run, why: r.why, ...(r.hop ? { hop: r.hop, after: !!r.after } : {}), outcome: 'assertion_failed' });
    else emit({ kind: 'scenario.not_run', scenario: s.id, why: r.why, ...(r.run ? { run: r.run } : {}), ...(r.outcome ? { outcome: r.outcome } : {}) });
  }
  // Scenarios no flow proves: an agent may write flows for them, which tracegrove then runs.
  let open = inRun.filter((s) => !s.flow && !state.run[s.id]);
  const routeUnits = new Set(ctx.units.filter((u) => u.kind === 'route').map((u) => u.id));
  const draftable = open.filter((s) => routeUnits.has(s.unit));
  if (agent && draftable.length && !ctx.signal?.aborted) {
    const root = dirname(config);
    const intent = ['Write tracegrove flows that prove these scenarios for this change, one flow per scenario, titled after the scenario. Write nothing else: no flows for other routes.',
      ...draftable.map((s) => { const u = ctx.units.find((x) => x.id === s.unit)!; return `- ${u.label}: ${s.title}. Proves: ${s.proves}`; })].join('\n');
    emit({ kind: 'agent.started', agent: 'd1', brief: 'drafting flows', by: agent.provider as Tracer, model: agent.model, units: [...new Set(draftable.map((s) => s.unit))] });
    try {
      const drafted = await draftWithAgent({ dir: root, branch: null, intent, overrides: { provider: agent.provider, model: agent.model }, prove: true,
        onActivity: (line) => emit({ kind: 'agent.said', agent: 'd1', line }), ...(ctx.signal ? { signal: ctx.signal } : {}) });
      const written = drafted.agent.files.map((file) => ({ file, flow: drafted.prove?.flows.find((f) => f.file === file),
        title: (() => { try { return /^title:\s*(.+)$/m.exec(readFileSync(join(root, file), 'utf8'))?.[1] ?? ''; } catch { return ''; } })() }));
      const targets = attributeWritten(written, draftable.filter((s) => !state.run[s.id]), ctx.units);
      let x = 1;
      for (const { file, flow } of written) {
        const ext = `x${++x}`;
        const target = targets.get(file);
        emit({ kind: 'extension.written', ext, extKind: file.endsWith('.action.yaml') ? 'action' : 'flow', name: basename(file), path: relative(ctx.dir, join(root, file)),
          why: 'No existing flow proved this scenario.', state: 'unproven', need: 'Counts once its run passes end to end; review it before relying on it.', unit: target?.unit ?? null });
        if (!flow || !target) continue;
        const sc = state.scenarios.find((y) => y.id === target.id)!;
        sc.ext = [...new Set([...sc.ext, ext])];
        emit({ kind: 'scenario.running', scenario: target.id, flow: flow.caseIds[0] ?? file });
        emit(writtenFlowResult(target.id, flow));
        if (flow.outcome === 'proven') emit({ kind: 'extension.proven', ext, by: target.id });
      }
      emit({ kind: 'agent.done', agent: 'd1', ok: drafted.agent.exitCode === 0, note: `${drafted.agent.files.length} file${drafted.agent.files.length === 1 ? '' : 's'} written` });
    } catch (error) {
      emit({ kind: 'agent.done', agent: 'd1', ok: false, note: (error instanceof Blocked ? error.reasons[0]!.detail : (error as Error).message).slice(0, 200) });
    }
  }
  open = inRun.filter((s) => !state.run[s.id] || state.run[s.id]!.st === 'run');
  for (const s of open) emit({ kind: 'scenario.not_run', scenario: s.id, why: s.flow ? 'Stopped before it ran' : 'No flow proves this yet' });
}
