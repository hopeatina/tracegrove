/**
 * One vocabulary for a grow: the words the page, the terminal and `grow --json` use for a scenario's state, a promise's state and
 * a mode. The page's table of states (uiGrove.ts, GW_ST) words a scenario from the same rules; this is that table for code that
 * is not the page, so a reader of the json sees the page's words. The table is S/r15/WORDS.md.
 */
import { MODES, criterionStatus, inMode, type CriterionStatus, type GrowScenario, type GrowState, type Mode } from './growState.ts';

/** A scenario's state, worst first: failed, running, or passed, or one of the three reasons it is not tested yet. */
export type StateKey = 'fail' | 'run' | 'could' | 'nf' | 'ready' | 'pass';
export const STATE_WORDS: Record<StateKey, string> = {
  fail: 'failed', run: 'running', could: 'could not run', nf: 'no flow yet', ready: 'flow ready (not run)', pass: 'passed',
};
/** The order the page lists them in: worst first. */
export const STATE_ORDER: StateKey[] = ['fail', 'run', 'could', 'nf', 'ready', 'pass'];
/** The parent of could not run, no flow yet and flow ready (not run). */
export const NOT_TESTED_YET = 'not tested yet';
export const OPEN_STATES: StateKey[] = ['could', 'nf', 'ready'];

/** The flow that proves a scenario: the one the grow ran for it, else its own. */
export const flowOf = (s: GrowState, x: GrowScenario): string | null => s.run[x.id]?.flow ?? x.flow ?? null;

/**
 * A scenario's state key, as the page decides it: a result when it has one; else a run that never reached its checks could not
 * run; else one with a flow is ready to run and one without has no flow yet.
 */
export function stateKey(s: GrowState, x: GrowScenario): StateKey {
  const r = s.run[x.id];
  if (r?.st === 'pass') return 'pass';
  if (r?.st === 'fail') return 'fail';
  if (r?.st === 'run') return 'run';
  if (r?.st === 'not_run' && /^Could not run/.test(String(r.why ?? ''))) return 'could';
  return flowOf(s, x) ? 'ready' : 'nf';
}
export const stateWord = (s: GrowState, x: GrowScenario): string => STATE_WORDS[stateKey(s, x)];

export const MODE_NAMES: Record<Mode, string> = Object.fromEntries(MODES.map((m) => [m.id, m.label])) as Record<Mode, string>;

/** A promise's state, from criterionStatus, as the page words it (one word for each bucket; plural where it counts). */
export type PromiseKey = 'holds' | 'agent' | 'part' | 'run' | 'failed' | 'open' | 'wait' | 'needs';
export const PROMISE_WORDS: Record<PromiseKey, string> = {
  holds: 'holds', agent: 'agent-checked', part: 'partly holds', run: 'running', failed: 'broken', open: NOT_TESTED_YET, wait: 'not traced yet', needs: 'needs you',
};
export function promiseKey(st: CriterionStatus): PromiseKey {
  switch (st.cls) {
    case 'pass': return 'holds';
    case 'warn': return 'agent';
    case 'fail': return 'failed';
    case 'miss': return 'needs';
    case 'run': return 'run';
    case 'cov': return / of /.test(st.text) ? 'part' : 'open';
    case 'open': case 'code': return 'open';
    default: return 'wait';
  }
}
export const promiseWord = (st: CriterionStatus): string => PROMISE_WORDS[promiseKey(st)];

/** The counts line in the page's words: "3 passed · 1 failed · 3 not tested yet". */
export function countsLine(s: GrowState): string {
  const inRun = s.scenarios.filter((x) => inMode(s, x));
  const n = (k: StateKey) => inRun.filter((x) => stateKey(s, x) === k).length;
  const open = OPEN_STATES.reduce((a, k) => a + n(k), 0);
  return [[n('pass'), STATE_WORDS.pass], [n('fail'), STATE_WORDS.fail], [n('run'), STATE_WORDS.run], [open, NOT_TESTED_YET]]
    .filter(([c]) => c).map(([c, w]) => `${c} ${w}`).join(' · ');
}

/** What `grow --json` adds so its reader sees the page's words: each scenario's state word and mode name, counts by state
 *  word, each promise's word, and the vocabulary itself. */
export function jsonWords(s: GrowState) {
  const inRun = s.scenarios.filter((x) => inMode(s, x));
  const states: Record<string, number> = {};
  for (const k of STATE_ORDER) { const c = inRun.filter((x) => stateKey(s, x) === k).length; if (c) states[STATE_WORDS[k]] = c; }
  return {
    modeName: s.modeBy ? MODE_NAMES[s.mode] : null,
    countsLine: countsLine(s),
    states,
    scenarios: s.scenarios.map((x) => ({ scenario: x.id, mode: x.mode, modeName: MODE_NAMES[x.mode], inMode: inMode(s, x), st: s.run[x.id]?.st ?? null, word: stateWord(s, x) })),
    promiseWords: s.criteria.map((c) => ({ id: c.id, word: promiseWord(criterionStatus(s, c.id)) })),
    vocabulary: { states: STATE_ORDER.map((k) => STATE_WORDS[k]), notTestedYet: NOT_TESTED_YET, promises: Object.values(PROMISE_WORDS), modes: MODES.map((m) => m.label) },
  };
}

/** The state `grow --json` prints, with the page's words beside its codes: `word` beside each run's `st`, `modeName` beside
 *  each scenario's `mode` and beside the state's own. Nothing is renamed or removed. */
export function jsonState(s: GrowState) {
  const scen = new Map(s.scenarios.map((x) => [x.id, x]));
  return {
    ...s,
    modeName: MODE_NAMES[s.mode],
    scenarios: s.scenarios.map((x) => ({ ...x, modeName: MODE_NAMES[x.mode] })),
    run: Object.fromEntries(Object.entries(s.run).map(([id, r]) => [id, { ...r, word: scen.has(id) ? stateWord(s, scen.get(id)!) : r.st === 'pass' ? STATE_WORDS.pass : r.st === 'fail' ? STATE_WORDS.fail : r.st === 'run' ? STATE_WORDS.run : NOT_TESTED_YET }])),
  };
}
