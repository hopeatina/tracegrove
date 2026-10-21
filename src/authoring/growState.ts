/**
 * Live discovery of a change ("grow"): the event stream and the state every view renders from.
 * One stream, `tracegrove.discovery-event/v1`, drives the terminal, `--jsonl`, MCP and the UI. Views
 * never invent progress: each one folds the same events with `applyGrow` and draws the result.
 */

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
export const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  { id: 'min', label: 'Minimum', blurb: 'every spec criterion, plus the riskiest failure of each part' },
  { id: 'std', label: 'Standard', blurb: 'adds the remaining sad paths and edge cases' },
  { id: 'max', label: 'Max', blurb: 'adds regression of every existing flow the change reaches' },
];
export const MODE_RANK: Record<Mode, number> = { min: 0, std: 1, max: 2 };
export type ExtensionKind = 'breakdown' | 'action' | 'flow' | 'seed' | 'verification script' | 'adapter draft';
export type ExtensionState = 'proven' | 'unproven' | 'review' | 'draft';
export const EXTENSION_STATE: Record<ExtensionState, string> = { proven: 'proven', unproven: 'not proven yet', review: 'needs your review', draft: 'draft, unused' };
export type Tracer = 'rules' | 'claude' | 'codex';

type E<K extends string, T> = { kind: K } & T;
export type GrowEventBody =
  | E<'phase.started', { phase: number }>
  | E<'change.read', { branch: string; base: string; head: string | null; pr: number | null; title: string; url: string | null; files: number; adds: number; dels: number; untraced: number }>
  | E<'file.changed', { path: string; adds: number; dels: number; role: 'code' | 'test' | 'doc' | 'config' | 'asset' }>
  | E<'spec.found', { source: string; via: string; criteria: number }>
  | E<'spec.missing', { why: string }>
  | E<'criterion.found', { id: string; text: string }>
  | E<'trunk.grown', Record<never, never>>
  | E<'unit.found', { unit: string; label: string; unitKind: string; loc: string; root: boolean; layer: Layer; parent: string | null }>
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
  | E<'scenario.drafted', { scenario: string; unit: string; scenarioKind: ScenarioKind; mode: Mode; title: string; proves: string; criteria: string[]; layers: Layer[]; flow: string | null; variants: Array<'mock' | 'real'>; realKey: string | null; mockOnly: string | null; by: Tracer; ext: string[] }>
  | E<'mode.asked', { counts: Record<Mode, number> }>
  | E<'mode.chosen', { mode: Mode; by: 'flag' | 'you' | 'default' }>
  | E<'flows.checked', { scenarios: number; runnable: number; config: string | null }>
  | E<'scenario.running', { scenario: string; flow: string }>
  | E<'scenario.passed', { scenario: string; took: number; run: string | null }>
  | E<'scenario.failed', { scenario: string; took: number; run: string | null; why: string }>
  | E<'scenario.not_run', { scenario: string; why: string }>
  | E<'variant.passed', { scenario: string; took: number; note: string }>
  | E<'variant.skipped', { scenario: string; note: string }>
  | E<'variant.not_applicable', { scenario: string; note: string }>
  | E<'discovery.finished', { ran: number; passed: number; failed: number; notRun: number }>
  | E<'discovery.blocked', { code: string; detail: string; action: string }>;
export type GrowEvent = GrowEventBody & { v: typeof GROW_EVENT_VERSION; seq: number; ms: number };
export type GrowEventKind = GrowEvent['kind'];
type Of<K extends GrowEventKind> = Extract<GrowEvent, { kind: K }>;

export type GrowUnit = Omit<Of<'unit.found'>, 'kind' | 'v' | 'seq'> & { id: string; foundAt: number };
export type GrowAgent = { id: string; brief: string; by: Tracer; model: string | null; units: string[]; unit: string | null; note: string; done: boolean; ok: boolean; said: string[] };
export type GrowScenario = Omit<Of<'scenario.drafted'>, 'kind' | 'v' | 'seq' | 'scenario'> & { id: string };
export type RunState = { st: 'run' | 'pass' | 'fail' | 'not_run'; ms?: number; why?: string; run?: string | null };
export type GrowState = {
  phase: number; phaseAt: Record<number, number>; ms: number;
  change: Of<'change.read'> | null; files: Array<Of<'file.changed'>>;
  spec: Of<'spec.found'> | null; specMissing: string | null; criteria: Array<{ id: string; text: string }>;
  linked: Record<string, Array<{ unit: string; why: string }>>; unbuilt: Record<string, string>; drift: Array<Of<'drift.found'>>;
  trunkAt: number | null; units: GrowUnit[];
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
  return { phase: -1, phaseAt: {}, ms: 0, change: null, files: [], spec: null, specMissing: null, criteria: [], linked: {}, unbuilt: {}, drift: [], trunkAt: null, units: [],
    depth: {}, cells: {}, stops: [], dropped: [], agents: [], focus: null, ext: {}, extOrder: [], scenarios: [], counts: null, asked: false, mode: 'min', modeBy: null,
    flows: null, run: {}, real: {}, done: null, blocked: null, last: 0 };
}

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
    case 'scenario.running': s.run[e.scenario] = { st: 'run' }; s.focus = s.scenarios.find((x) => x.id === e.scenario)?.unit ?? s.focus; break;
    case 'scenario.passed': s.run[e.scenario] = { st: 'pass', ms: e.took, run: e.run }; break;
    case 'scenario.failed': s.run[e.scenario] = { st: 'fail', ms: e.took, run: e.run, why: e.why }; s.focus = s.scenarios.find((x) => x.id === e.scenario)?.unit ?? s.focus; break;
    case 'scenario.not_run': s.run[e.scenario] = { st: 'not_run', why: e.why }; break;
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

/** What the UI draws besides raw state: the same derived answers the terminal computes. */
export function growView(s: GrowState) {
  return {
    criteria: s.criteria.map((c) => ({ ...c, status: criterionStatus(s, c.id), units: (s.linked[c.id] ?? []).map((l) => l.unit) })),
    depth: Object.fromEntries(s.units.map((u) => [u.id, { pips: depthOf(s, u.id), score: depthScore(s, u.id) }])),
    gaps: Object.fromEntries(s.units.map((u) => [u.id, unitHasGap(s, u.id)])),
    counts: { min: modeCount(s, 'min'), std: modeCount(s, 'std'), max: modeCount(s, 'max') },
    summary: growSummary(s),
  };
}
export type GrowView = ReturnType<typeof growView>;
