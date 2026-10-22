/**
 * Live discovery of a change ("grow"): the event stream and the state every view renders from.
 * One stream, `tracegrove.discovery-event/v1`, drives the terminal, `--jsonl`, MCP and the UI. Views
 * never invent progress: each one folds the same events with `applyGrow` and draws the result.
 */
import { expGot } from './checkCompare.ts';

export const GROW_EVENT_VERSION = 'tracegrove.discovery-event/v1';
export const PHASES = ['Read the change and its spec', 'Grow the tree', 'Trace each branch', 'Draft scenarios', 'Choose how much', 'Prove it'] as const;
export const PHASE_SHORT = ['read', 'grow', 'trace', 'draft', 'choose', 'prove'] as const;
/** The five things a tracer checks for every unit, in order. */
export const DEPTH_STEPS = [['read', 'Read the code'], ['callers', 'Found its callers'], ['effects', 'Followed its effects'], ['tests', 'Looked for tests'], ['spec', 'Matched it to the spec']] as const;
export type DepthStep = typeof DEPTH_STEPS[number][0];
export type DepthStatus = 'ok' | 'none' | 'stop';
export type Layer = 'ui' | 'api' | 'cli' | 'jobs' | 'lib' | 'data' | 'cache' | 'ext';
export const ROOT_LAYERS: ReadonlySet<Layer> = new Set(['data', 'cache', 'ext']);
export const LAYER_LABEL: Record<Layer, string> = { ui: 'UI', api: 'API', cli: 'CLI', jobs: 'Jobs', lib: 'Library', data: 'Data', cache: 'Cache', ext: '3rd party' };
export const LAYER_CODE: Record<Layer, string> = { ui: 'ui', api: 'api', cli: 'cli', jobs: 'job', lib: 'lib', data: 'db', cache: 'kv', ext: '3p' };
export type CellStatus = 'built' | 'indirect' | 'missing';
export type ScenarioKind = 'happy' | 'sad' | 'edge' | 'regression';
export type Mode = 'min' | 'std' | 'max';
/** Where a person or caller starts a journey. */
export type Surface = 'browser' | 'terminal' | 'http' | 'job';
/** A journey scenario proves the path end to end; a part scenario checks one part on its own (max). */
export type ScenarioLevel = 'journey' | 'part';
/** What a scenario shows: the path works, the app refuses what it must (auth, validation), or it survives a fault. */
export type Polarity = 'happy' | 'guard' | 'failure';
export const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  { id: 'min', label: 'Minimum', blurb: 'each critical journey end to end, its riskiest guard or failure, and every spec criterion' },
  { id: 'std', label: 'Standard', blurb: 'adds the other journeys, and the other ways each one can fail' },
  { id: 'max', label: 'Max', blurb: 'adds every part on its own, and regression of the flows the change reaches' },
];
export const MODE_RANK: Record<Mode, number> = { min: 0, std: 1, max: 2 };
export type ExtensionKind = 'breakdown' | 'action' | 'flow' | 'seed' | 'verification script' | 'adapter draft';
export type ExtensionState = 'proven' | 'unproven' | 'review' | 'draft';
export const EXTENSION_STATE: Record<ExtensionState, string> = { proven: 'proven', unproven: 'not proven yet', review: 'needs your review', draft: 'draft, unused' };
export type Tracer = 'rules' | 'claude' | 'codex';

type E<K extends string, T> = { kind: K } & T;
// Fields added after v1 shipped are optional (a scenario's journey, level, polarity and modeWhy), so older logs still load.
export type GrowEventBody =
  | E<'phase.started', { phase: number }>
  | E<'change.read', { branch: string; base: string; head: string | null; pr: number | null; title: string; url: string | null; files: number; adds: number; dels: number; untraced: number }>
  | E<'file.changed', { path: string; adds: number; dels: number; role: 'code' | 'test' | 'doc' | 'config' | 'asset' }>
  | E<'spec.found', { source: string; via: string; criteria: number }>
  | E<'spec.missing', { why: string }>
  | E<'criterion.found', { id: string; text: string }>
  | E<'trunk.grown', Record<never, never>>
  | E<'unit.found', { unit: string; label: string; unitKind: string; loc: string; root: boolean; layer: Layer; parent: string | null }>
  | E<'journey.found', { journey: string; title: string; entry: string; units: string[]; surface: Surface; why: string; loc: string }>
  | E<'journey.named', { journey: string; title: string; by: Tracer | 'spec' }>
  | E<'agent.started', { agent: string; brief: string; by: Tracer; model: string | null; units: string[] }>
  | E<'agent.said', { agent: string; line: string }>
  | E<'depth.checked', { agent: string; unit: string; step: DepthStep; status: DepthStatus; loc: string; note: string; by: Tracer }>
  | E<'claim.dropped', { agent: string; unit: string; loc: string; why: string }>
  | E<'layer.needed', { unit: string; layer: Layer; status: CellStatus; adapter: string; reason: string }>
  | E<'trace.stopped', { unit: string; at: string; why: string }>
  | E<'criterion.linked', { id: string; unit: string; why: string }>
  | E<'criterion.unbuilt', { id: string; why: string }>
  | E<'drift.found', { unit: string; loc: string; what: string; why: string }>
  | E<'agent.done', { agent: string; ok: boolean; note: string }>
  | E<'extension.written', { ext: string; extKind: ExtensionKind; name: string; path: string; why: string; state: ExtensionState; need: string; unit: string | null }>
  | E<'extension.proven', { ext: string; by: string }>
  | E<'scenario.drafted', { scenario: string; unit: string; scenarioKind: ScenarioKind; mode: Mode; title: string; proves: string; criteria: string[]; layers: Layer[]; flow: string | null; variants: Array<'mock' | 'real'>; realKey: string | null; mockOnly: string | null; by: Tracer; ext: string[]; journey?: string | null; level?: ScenarioLevel; polarity?: Polarity; modeWhy?: string }>
  | E<'mode.asked', { counts: Record<Mode, number> }>
  | E<'mode.chosen', { mode: Mode; by: 'flag' | 'you' | 'default' }>
  | E<'flows.checked', { scenarios: number; runnable: number; config: string | null }>
  | E<'scenario.running', { scenario: string; flow: string }>
  | E<'scenario.passed', { scenario: string; took: number; run: string | null }>
  /* `outcome` is the case outcome the run recorded: assertion_failed for a check that did not hold. A run that never reached its
     checks (infrastructure_failed, blocked, inconclusive, cancelled) is a scenario.not_run that names its run. */
  | E<'scenario.failed', { scenario: string; took: number; run: string | null; why: string; hop?: string; after?: boolean; outcome?: string }>
  | E<'scenario.not_run', { scenario: string; why: string; run?: string | null; outcome?: string }>
  | E<'variant.passed', { scenario: string; took: number; note: string }>
  | E<'variant.skipped', { scenario: string; note: string }>
  | E<'variant.not_applicable', { scenario: string; note: string }>
  | E<'discovery.finished', { ran: number; passed: number; failed: number; notRun: number }>
  | E<'discovery.blocked', { code: string; detail: string; action: string }>;
export type GrowEvent = GrowEventBody & { v: typeof GROW_EVENT_VERSION; seq: number; ms: number };
export type GrowEventKind = GrowEvent['kind'];
type Of<K extends GrowEventKind> = Extract<GrowEvent, { kind: K }>;

export type GrowUnit = Omit<Of<'unit.found'>, 'kind' | 'v' | 'seq'> & { id: string; foundAt: number };
export type GrowJourney = Omit<Of<'journey.found'>, 'kind' | 'v' | 'seq' | 'journey'> & { id: string; titleBy: Tracer | 'spec' | 'rules' };
export type GrowAgent = { id: string; brief: string; by: Tracer; model: string | null; units: string[]; unit: string | null; note: string; done: boolean; ok: boolean; said: string[] };
export type GrowScenario = Omit<Of<'scenario.drafted'>, 'kind' | 'v' | 'seq' | 'scenario'> & { id: string };
/** A failed run's hop: the route whose step broke, or (after) the last route called before a failed check on other evidence. */
/** `flow` is the flow the grow ran for the scenario (from scenario.running), so its run opens at the right case. */
export type RunState = { st: 'run' | 'pass' | 'fail' | 'not_run'; ms?: number; why?: string; run?: string | null; hop?: string; after?: boolean; flow?: string };
export type GrowState = {
  phase: number; phaseAt: Record<number, number>; ms: number;
  change: Of<'change.read'> | null; files: Array<Of<'file.changed'>>;
  spec: Of<'spec.found'> | null; specMissing: string | null; criteria: Array<{ id: string; text: string }>;
  linked: Record<string, Array<{ unit: string; why: string }>>; unbuilt: Record<string, string>; drift: Array<Of<'drift.found'>>;
  trunkAt: number | null; units: GrowUnit[]; journeys: GrowJourney[];
  depth: Record<string, Partial<Record<DepthStep, Of<'depth.checked'>>>>;
  cells: Record<string, Array<Of<'layer.needed'>>>;
  stops: Array<Of<'trace.stopped'>>; dropped: Array<Of<'claim.dropped'>>;
  agents: GrowAgent[]; focus: string | null;
  ext: Record<string, Of<'extension.written'> & { provenBy: string | null }>; extOrder: string[];
  scenarios: GrowScenario[];
  counts: Record<Mode, number> | null; asked: boolean; mode: Mode; modeBy: Of<'mode.chosen'>['by'] | null;
  flows: Of<'flows.checked'> | null;
  run: Record<string, RunState>; real: Record<string, RunState & { note?: string; na?: boolean }>;
  done: Of<'discovery.finished'> | null; blocked: Of<'discovery.blocked'> | null; last: number;
};

export function freshGrow(): GrowState {
  return { phase: -1, phaseAt: {}, ms: 0, change: null, files: [], spec: null, specMissing: null, criteria: [], linked: {}, unbuilt: {}, drift: [], trunkAt: null, units: [], journeys: [],
    depth: {}, cells: {}, stops: [], dropped: [], agents: [], focus: null, ext: {}, extOrder: [], scenarios: [], counts: null, asked: false, mode: 'min', modeBy: null,
    flows: null, run: {}, real: {}, done: null, blocked: null, last: 0 };
}

/** Logs saved before grow said how to prove a scenario it did not run told the reader to pass --prove, a flag grow has never
 *  taken: they read as the instruction that works. */
const runnable = (why: string) => why.replace(/^Run with --prove to run /, 'Run grow without --no-prove to run ');
/** The flow a scenario was started with, kept when its result lands. */
const ranFlow = (s: GrowState, id: string) => (s.run[id]?.flow ? { flow: s.run[id]!.flow } : {});
const strip = <T extends { kind: string; v?: string; seq?: number }>(e: T) => { const { kind: _k, v: _v, seq: _s, ...rest } = e; return rest; };

/** Fold one event into the state. Pure apart from mutating `s`, so every view gets the same answer. */
export function applyGrow(s: GrowState, e: GrowEvent): GrowState {
  s.ms = Math.max(s.ms, e.ms); s.last = e.seq;
  const agent = (id: string) => s.agents.find((a) => a.id === id);
  switch (e.kind) {
    case 'phase.started': s.phase = e.phase; s.phaseAt[e.phase] = e.ms; break;
    case 'change.read': s.change = e; break;
    case 'file.changed': s.files.push(e); break;
    case 'spec.found': s.spec = e; break;
    case 'spec.missing': s.specMissing = e.why; break;
    case 'criterion.found': s.criteria.push({ id: e.id, text: e.text }); break;
    case 'trunk.grown': s.trunkAt = e.ms; break;
    case 'unit.found': s.units.push({ ...strip(e), id: e.unit, foundAt: e.ms }); break;
    case 'journey.found': { const { journey: _j, ...rest } = strip(e); s.journeys.push({ ...rest, id: e.journey, titleBy: 'rules' }); break; }
    case 'journey.named': { const j = s.journeys.find((x) => x.id === e.journey); if (j) { j.title = e.title; j.titleBy = e.by; } break; }
    case 'agent.started': s.agents.push({ id: e.agent, brief: e.brief, by: e.by, model: e.model, units: e.units, unit: null, note: 'starting', done: false, ok: true, said: [] }); break;
    case 'agent.said': { const a = agent(e.agent); if (a) { a.note = e.line; a.said.push(e.line); if (a.said.length > 40) a.said.shift(); } break; }
    case 'depth.checked': {
      const prev = s.depth[e.unit]?.[e.step];
      // A deeper look wins: an agent's evidence replaces the rules' "none found", never the reverse.
      if (!prev || prev.status !== 'ok' || e.status === 'ok' || e.status === 'stop') (s.depth[e.unit] ??= {})[e.step] = e;
      const a = agent(e.agent); if (a) { a.unit = e.unit; a.note = `${DEPTH_STEPS.find(([k]) => k === e.step)![1].toLowerCase()}: ${e.loc}`; }
      s.focus = e.unit; break;
    }
    case 'claim.dropped': s.dropped.push(e); break;
    case 'layer.needed': { const list = (s.cells[e.unit] ??= []); const i = list.findIndex((c) => c.layer === e.layer); if (i >= 0) list[i] = e; else list.push(e); break; }
    case 'trace.stopped': s.stops.push(e); break;
    case 'criterion.linked': { const list = (s.linked[e.id] ??= []); if (!list.some((l) => l.unit === e.unit)) list.push({ unit: e.unit, why: e.why }); delete s.unbuilt[e.id]; s.drift = s.drift.filter((d) => d.unit !== e.unit); break; }
    case 'criterion.unbuilt': if (!s.linked[e.id]?.length) s.unbuilt[e.id] = e.why; break;
    case 'drift.found': if (!s.drift.some((d) => d.unit === e.unit) && !Object.values(s.linked).some((l) => l.some((x) => x.unit === e.unit))) s.drift.push(e); break;
    case 'agent.done': { const a = agent(e.agent); if (a) Object.assign(a, { done: true, ok: e.ok, unit: null, note: e.note }); break; }
    case 'extension.written': s.ext[e.ext] = { ...e, provenBy: null }; if (!s.extOrder.includes(e.ext)) s.extOrder.push(e.ext); break;
    case 'extension.proven': { const x = s.ext[e.ext]; if (x) { x.state = 'proven'; x.provenBy = e.by; } break; }
    case 'scenario.drafted': {
      const sc: GrowScenario = { ...strip(e), id: e.scenario }; delete (sc as Partial<Of<'scenario.drafted'>>).scenario;
      const i = s.scenarios.findIndex((x) => x.id === sc.id); if (i >= 0) s.scenarios[i] = sc; else s.scenarios.push(sc);
      const a = s.agents.find((x) => x.units.includes(e.unit) && !x.done); if (a) { a.unit = e.unit; a.note = `drafted “${e.title}”`; }
      s.focus = e.unit; break;
    }
    case 'mode.asked': s.asked = true; s.counts = e.counts; break;
    case 'mode.chosen': s.asked = false; s.mode = e.mode; s.modeBy = e.by; break;
    case 'flows.checked': s.flows = e; break;
    case 'scenario.running': s.run[e.scenario] = { st: 'run', ...(e.flow ? { flow: e.flow } : {}) }; s.focus = s.scenarios.find((x) => x.id === e.scenario)?.unit ?? s.focus; break;
    case 'scenario.passed': s.run[e.scenario] = { st: 'pass', ms: e.took, run: e.run, ...ranFlow(s, e.scenario) }; break;
    case 'scenario.failed':
      // A run that never reached its checks is not a failed check: it proved nothing, so its scenario is not tested yet.
      if (neverChecked(e)) { s.run[e.scenario] = { st: 'not_run', why: couldNotRun(e.why), ...(e.run ? { run: e.run } : {}), ...ranFlow(s, e.scenario) }; break; }
      s.run[e.scenario] = { st: 'fail', ms: e.took, run: e.run, why: e.why, ...(e.hop ? { hop: e.hop, after: !!e.after } : {}), ...ranFlow(s, e.scenario) }; s.focus = s.scenarios.find((x) => x.id === e.scenario)?.unit ?? s.focus; break;
    case 'scenario.not_run': s.run[e.scenario] = { st: 'not_run', why: runnable(e.why), ...(e.run ? { run: e.run } : {}), ...ranFlow(s, e.scenario) }; break;
    case 'variant.passed': s.real[e.scenario] = { st: 'pass', ms: e.took, note: e.note }; break;
    case 'variant.skipped': s.real[e.scenario] = { st: 'not_run', note: e.note }; break;
    case 'variant.not_applicable': s.real[e.scenario] = { st: 'not_run', note: e.note, na: true }; break;
    case 'discovery.finished': s.done = e; s.focus = null; break;
    case 'discovery.blocked': s.blocked = e; break;
  }
  return s;
}

export const inMode = (s: GrowState, sc: Pick<GrowScenario, 'mode'>) => MODE_RANK[sc.mode] <= MODE_RANK[s.mode];
export const modeCount = (s: GrowState, m: Mode) => s.scenarios.filter((x) => MODE_RANK[x.mode] <= MODE_RANK[m]).length;
export const depthOf = (s: GrowState, unit: string): Array<DepthStatus | 'wait'> => DEPTH_STEPS.map(([k]) => s.depth[unit]?.[k]?.status ?? 'wait');
/** Checks that reached an answer: evidence found, or a confirmed absence. A stop is not depth. */
export const depthScore = (s: GrowState, unit: string) => depthOf(s, unit).filter((x) => x === 'ok' || x === 'none').length;

export type CriterionStatus = { cls: 'pass' | 'warn' | 'fail' | 'miss' | 'run' | 'cov' | 'code' | 'wait' | 'open'; text: string };
/**
 * Where one spec criterion stands. "proved" needs every scenario serving it to pass with nothing
 * resting on an agent-written piece a person has not reviewed; otherwise it is "agent-checked".
 */
export function criterionStatus(s: GrowState, id: string): CriterionStatus {
  if (s.unbuilt[id]) return { cls: 'miss', text: 'not found' };
  const sc = s.scenarios.filter((x) => x.criteria.includes(id) && inMode(s, x));
  const ran = sc.filter((x) => s.run[x.id] && s.run[x.id]!.st !== 'not_run');
  if (sc.some((x) => s.run[x.id]?.st === 'fail')) return { cls: 'fail', text: 'failed' };
  if (ran.length && ran.every((x) => s.run[x.id]?.st === 'pass') && ran.length === sc.length) {
    const unreviewed = sc.some((x) => x.ext.some((e) => s.ext[e] && s.ext[e]!.state !== 'proven'));
    return unreviewed ? { cls: 'warn', text: 'agent-checked' } : { cls: 'pass', text: 'proved' };
  }
  if (sc.some((x) => s.run[x.id]?.st === 'run')) return { cls: 'run', text: 'running' };
  if (ran.length) return { cls: 'cov', text: `${ran.length} of ${sc.length} proved` };
  if (s.done && sc.length) return { cls: 'open', text: 'not proven yet' };
  if (sc.length) return { cls: 'cov', text: `${sc.length} scenario${sc.length > 1 ? 's' : ''}` };
  if (s.linked[id]?.length) return { cls: 'code', text: 'found in code' };
  return { cls: 'wait', text: s.phase >= 2 ? 'tracing' : 'listed' };
}

/** A unit is a gap when tracing stopped, a layer cannot be proved directly, a scenario failed, or the spec never asked for it. */
export function unitHasGap(s: GrowState, unit: string): boolean {
  return depthOf(s, unit).includes('stop') || (s.cells[unit] ?? []).some((c) => c.status !== 'built')
    || s.scenarios.some((x) => x.unit === unit && s.run[x.id]?.st === 'fail') || s.drift.some((d) => d.unit === unit)
    || s.depth[unit]?.tests?.status === 'none';
}

/** Totals for the closing line and the result banner. */
export function growSummary(s: GrowState) {
  const crit = s.criteria.map((c) => criterionStatus(s, c.id));
  const inRun = s.scenarios.filter((x) => inMode(s, x));
  return {
    proved: crit.filter((c) => c.cls === 'pass').length, agentChecked: crit.filter((c) => c.cls === 'warn').length,
    needYou: crit.filter((c) => c.cls === 'miss' || c.cls === 'fail').length, notProven: crit.filter((c) => c.cls === 'open').length, criteria: crit.length,
    scenarios: inRun.length, passed: inRun.filter((x) => s.run[x.id]?.st === 'pass').length, failed: inRun.filter((x) => s.run[x.id]?.st === 'fail').length,
    notRun: inRun.filter((x) => s.run[x.id]?.st === 'not_run').length, realPassed: Object.values(s.real).filter((v) => v.st === 'pass').length,
    toReview: s.extOrder.filter((x) => s.ext[x]!.state !== 'proven').length,
  };
}

/** What the UI draws besides raw state: the same derived answers the terminal computes. `broke` is what the first failure's
 *  run recorded (growJson's verdictFacts reads it), so the verdict can say how it failed. */
export function growView(s: GrowState, broke: VerdictFacts | null = null) {
  return {
    criteria: s.criteria.map((c) => ({ ...c, status: criterionStatus(s, c.id), units: (s.linked[c.id] ?? []).map((l) => l.unit) })),
    depth: Object.fromEntries(s.units.map((u) => [u.id, { pips: depthOf(s, u.id), score: depthScore(s, u.id) }])),
    gaps: Object.fromEntries(s.units.map((u) => [u.id, unitHasGap(s, u.id)])),
    counts: { min: modeCount(s, 'min'), std: modeCount(s, 'std'), max: modeCount(s, 'max') },
    summary: growSummary(s),
    verdict: growVerdict(s, { broke }),
  };
}
export type GrowView = ReturnType<typeof growView>;

/** A scenario's title in plain words: no backticks, and no "METHOD /path: " it is sent through. */
export function plainTitle(t: string): string {
  const flat = String(t ?? '').split('`').join('');
  const m = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+: (.+)$/s.exec(flat);
  return m ? m[1]! : flat;
}

export type VerdictKind = 'not ready' | 'not proven yet' | 'ready' | 'stopped' | 'cancelled';
/** What each exit code tells a script or an agent to do next. */
export const EXIT_MEANING: Record<VerdictKind, string> = { 'not ready': 'fix', 'not proven yet': 'prove more', ready: 'ready', stopped: 'blocked', cancelled: 'cancelled' };
const VERDICT_WORD: Record<VerdictKind, string> = { 'not ready': 'Not ready', 'not proven yet': 'Not proven yet', ready: 'Ready', stopped: 'Stopped', cancelled: 'Cancelled' };
const VERDICT_MARK: Record<VerdictKind, string> = { 'not ready': '✗', 'not proven yet': '◌', ready: '✓', stopped: '✕', cancelled: '✕' };
const VERDICT_CODE: Record<VerdictKind, number> = { 'not ready': 1, 'not proven yet': 3, ready: 0, stopped: 2, cancelled: 4 };

/** What the first failure's run recorded: the step that broke, and the check there with what it expected and got. Null
 *  fields were not recorded (the run is gone, or its evidence does not say). */
export type VerdictFacts = { step: number | null; stepName: string | null; check: string | null; expected: unknown; got: unknown };
/**
 * A failed result's reason as a sentence can carry it: where it broke (the check, or a stage such as "(app startup)") and the
 * first line of what it said, without a trailing "last app output:" whose lines were cut. A stack trace is never a reason.
 */
export function failReason(why: string | undefined): { where: string | null; said: string } {
  const w = String(why ?? '').trim(); const i = w.indexOf(': ');
  const said = (i > 0 ? w.slice(i + 2) : w).split('\n')[0]!.trim().replace(/;[^;]*:$/, '').trim();
  return { where: i > 0 ? w.slice(0, i) : null, said };
}
/** The stages a run names (src/authoring/run.ts) when it broke before any check compared anything: the app did not start, it
 *  was stopped before its first step, a fixture could not be set up, or the case ended with no step or check failing. */
const STAGE = /^\((app startup|before steps|fixture[^)]*|case)\)$/;
/** A failed result that never reached its checks. A log says so with the run's `outcome`; one saved before it did, only by the
 *  stage its reason names, such as "(app startup): application exited before becoming ready". */
function neverChecked(e: { why: string; outcome?: string }): boolean {
  return e.outcome ? e.outcome !== 'assertion_failed' : STAGE.test(failReason(e.why).where ?? '');
}
/**
 * Why a run that never reached its checks proves nothing, in words: "Could not run: the app did not start (application exited
 * before becoming ready)". Only the first line of what it said, as for a failure.
 */
export function couldNotRun(why: string): string {
  const { where, said } = failReason(why);
  const stage = STAGE.exec(where ?? '')?.[1] ?? null;
  const what = stage === 'app startup' ? 'the app did not start' : stage === 'before steps' ? 'it was stopped before its first step'
    : stage?.startsWith('fixture') ? `${stage} could not be set up` : null;
  const line = what || stage ? said : String(why ?? '').trim().split('\n')[0]!.trim().replace(/;[^;]*:$/, '').trim();
  if (!line) return what ? `Could not run: ${what}` : 'Could not run, with no reason recorded';
  return what ? `Could not run: ${what} (${line})` : `Could not run: ${line}`;
}
/** How a failure broke, in words: what its check expected and got when the run recorded it, else the reason its result gave. */
function howItBroke(r: RunState | undefined, broke: VerdictFacts | null | undefined): string | null {
  if (broke?.check) { const t = expGot({ check: broke.check, expected: broke.expected, got: broke.got }); return t.charAt(0).toLowerCase() + t.slice(1); }
  return failReason(r?.why).said || null;
}

/**
 * The one verdict on a grow, from the counts in its state. The page, `grow --json` and the exit code all read it:
 * "Not ready" when a check failed, "Not proven yet" when nothing failed but a scenario in the chosen mode has no result or
 * the mode holds no scenario at all, "Ready" when at least one passed and every one did. Exit codes: 1 fix, 3 prove more
 * (0 with `allowUnproven`), 0 ready; a grow that stopped (2) or was cancelled (4) keeps its own code. `broke` is what the
 * first failure's run recorded, so the verdict can say how it failed.
 */
export function growVerdict(s: GrowState, opts: { allowUnproven?: boolean; broke?: VerdictFacts | null } = {}) {
  const inRun = s.scenarios.filter((x) => inMode(s, x));
  const passed = inRun.filter((x) => s.run[x.id]?.st === 'pass');
  const failed = inRun.filter((x) => s.run[x.id]?.st === 'fail');
  const open = inRun.filter((x) => s.run[x.id]?.st !== 'pass' && s.run[x.id]?.st !== 'fail');
  // Ready needs a scenario that passed: a mode with none proved nothing, which is not the same as nothing failing.
  const kind: VerdictKind = s.blocked ? (s.blocked.code === 'discovery_cancelled' ? 'cancelled' : 'stopped')
    : failed.length ? 'not ready' : open.length || !passed.length ? 'not proven yet' : 'ready';
  const promise = (x: GrowScenario) => (x.criteria.length ? x.criteria.join(', ') : null);
  const first = failed[0];
  const reasonOf = (x: GrowScenario) => { const r = s.run[x.id]; return r?.st === 'not_run' ? r.why ?? 'No reason was recorded' : r?.st === 'run' ? 'It was still running when the grow stopped' : 'No result was recorded'; };
  // The mode the grow chose; none yet (null) when it stopped before choosing.
  const mode = s.modeBy ? MODES.find((m) => m.id === s.mode)!.label : null;
  const n = inRun.length, scen = (k: number) => `${k} scenario${k === 1 ? '' : 's'}`;
  const promiseWords = (p: string | null) => (p ? ` (promise${p.includes(',') ? 's' : ''} ${p})` : '');
  // A failure is named by the promise its scenario makes, then how it broke: "“Removing a seat never charges the card” failed:
  // expected 2 charges, got 3". The title alone would say the opposite of what happened.
  const how = first ? howItBroke(s.run[first.id], opts.broke) : null;
  const text = kind === 'not ready' ? `“${plainTitle(first!.title)}” failed${how ? `: ${how}` : ', with no reason recorded'}`
    : kind === 'not proven yet' ? (n ? `${open.length} of ${scen(n)} in ${mode} not tested yet` : `nothing in this change was traced to a scenario${s.scenarios.length ? ` in ${mode}` : ''}`)
    : kind === 'ready' ? `${passed.length} of ${scen(n)} in ${mode} passed`
    : `${s.blocked!.code}: ${s.blocked!.detail}`;
  const detail = kind === 'not ready' ? `${text}${promiseWords(promise(first!))}${failed.length > 1 ? `, and ${failed.length - 1} more failed` : ''}` : text;
  return {
    verdict: kind, word: VERDICT_WORD[kind], mark: VERDICT_MARK[kind], exitCode: kind === 'not proven yet' && opts.allowUnproven ? 0 : VERDICT_CODE[kind], exitMeaning: EXIT_MEANING[kind], mode,
    counts: { passed: passed.length, failed: failed.length, notTestedYet: open.length },
    promises: { hold: s.criteria.filter((c) => criterionStatus(s, c.id).cls === 'pass').length, of: s.criteria.length },
    first: first ? { scenario: first.id, title: plainTitle(first.title), promise: promise(first), flow: s.run[first.id]?.flow ?? first.flow ?? null, run: s.run[first.id]?.run ?? null,
      step: opts.broke?.step ?? null, check: opts.broke?.check ?? null, expected: opts.broke?.check ? opts.broke.expected : null, got: opts.broke?.check ? opts.broke.got : null } : null,
    failed: failed.map((x) => x.id), more: Math.max(0, failed.length - 1),
    /** each scenario not tested yet, with its reason; one whose run never reached its checks names that run */
    unproven: open.map((x) => ({ scenario: x.id, title: plainTitle(x.title), reason: reasonOf(x), ...(s.run[x.id]?.run ? { run: s.run[x.id]!.run! } : {}) })),
    /** What the page says beside the mark and the word; `detail` adds the promise and how many more failed, and with the mark
     *  and the word it is the line the terminal prints. */
    text, detail, line: `${VERDICT_MARK[kind]} ${VERDICT_WORD[kind]}: ${detail}`,
  };
}
export type GrowVerdict = ReturnType<typeof growVerdict>;
