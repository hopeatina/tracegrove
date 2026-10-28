/**
 * The summary `grow --json` adds for scripts and agents: the verdict the page shows, and for each failure the run, step and
 * check that broke with what it expected and got, read from the run's own sealed records. Nothing is guessed: what the run did
 * not record is null.
 */
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readVerifiedBundle } from '../core/bundle.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { snake } from './compile.ts';
import { countNoun, expGot } from './checkCompare.ts';
import { extraCall } from './happened.ts';
import { cellBundleName } from '../core/bundlePaths.ts';
import { MODES, growVerdict, growView, inMode, plainTitle, failReason, type GrowState, type Mode, type RunState, type VerdictFacts } from './growState.ts';
import { configRunsRoot, savedRunDirectory } from './runLocation.ts';
import { readSavedRun } from './runSource.ts';
import { jsonWords } from './growWords.ts';

export type GrowFailure = {
  scenario: string; title: string; promise: string | null; flow: string | null; run: string | null;
  /** false when `run` is not saved in this folder (a grow that proved in a worktree of its own): its evidence is not here. */
  saved: boolean; step: number | null; check: string | null; expected: unknown; got: unknown; says: string; evidence: string[];
};
export type GrowJsonSummary = {
  verdict: string; exitCode: number; exitMeaning: string;
  /** the mode the grow chose; before it chose, the one asked for with --mode; else null */
  mode: string | null;
  counts: { passed: number; failed: number; notTestedYet: number }; promises: { hold: number; of: number };
  failures: GrowFailure[];
  /** each scenario not tested yet, with its reason; `run` names the run of one that never reached its checks (the app did not
   *  start, say), which is not a failure. When that run is saved here, `saved` is true and `evidence` lists its files, relative
   *  to the folder grow ran in, as for a failure. */
  unproven: Array<{ scenario: string; title: string; reason: string; run?: string; saved?: true; evidence?: string[] }>;
  /** why a grow stopped, and what to do: null unless it stopped or was cancelled */
  stopped: { code: string; detail: string; action: string } | null;
  /** the page's words for what the codes above say: each scenario's state word beside its `st` and its mode's name beside
   *  `mode`, counts by state word, each promise's word, and the vocabulary (growWords.ts, S/r15/WORDS.md) */
  words: ReturnType<typeof jsonWords>;
};

/** A failure in the grow's own words, when its run recorded no check to read: where it broke and the first line of its
 *  message, then the route. A stage in parentheses, such as "(app startup)", is where it broke, not a check. */
export function brokeLine(r: RunState | undefined): string {
  const { where, said } = failReason(r?.why);
  const dot = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  const route = r?.hop ? ` On the route: ${r.after ? 'after' : 'at'} ${r.hop}.` : '';
  if (!said) return `Failed, with no reason recorded.${route}`;
  const stage = where && /^\(.+\)$/.test(where) ? where.slice(1, -1) : null;
  return (!where ? `Broke: ${dot(said)}` : stage ? `Broke at ${stage}: ${dot(said)}` : `Broke at check “${where}”: ${dot(said)}`) + route;
}

/**
 * A step's name as its flow declares it ("only the Team upgrade …"), which the run's summary.json recorded, when it is the
 * name the step's sealed id was made from; else the name the sealed id gives ("only the team upgrade …").
 */
function declaredName(runDir: string, caseId: string, step: { id: string; name: string }): string {
  try {
    const summary = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(join(runDir, 'summary.json'), 16 * 1024 * 1024))) as
      { cases?: Array<{ caseId?: unknown; steps?: Array<{ id?: unknown; name?: unknown }> }> };
    const named = summary.cases?.find((c) => c.caseId === caseId)?.steps?.find((x) => x.id === step.id)?.name;
    return typeof named === 'string' && snake(named) === step.id ? named : step.name;
  } catch { return step.name; }
}

/** The files of one case's cell in a saved run that say what happened: its receipt, its checks, its stand-ins and its events. */
const cellEvidence = (runDir: string, cellId: string) => {
  const cell = join(runDir, 'bundle', 'cells', cellBundleName(cellId));
  return ['receipt.json', 'assertions.json', 'boundaries.json', 'events.jsonl'].map((f) => join(cell, f)).filter((f) => existsSync(f));
};
/** Where a scenario not tested yet has a run saved here (one that never reached its checks), the files that say why: the run's
 *  summary.json and its flow's cell, relative to the folder grow ran in. Null when its run is not saved here. */
function unprovenEvidence(s: GrowState, dir: string, id: string): string[] | null {
  const r = s.run[id]; const x = s.scenarios.find((y) => y.id === id);
  if (!r?.run) return null;
  const root = s.flows?.config ? configRunsRoot(dir, s.flows.config) : dir;
  let runDir: string;
  try { if (!root) return null; runDir = savedRunDirectory(root, r.run); } catch { return null; }
  const out = [join(runDir, 'summary.json')].filter((f) => existsSync(f));
  const flow = r.flow ?? x?.flow ?? null;
  try {
    const receipt = flow ? readVerifiedBundle(join(runDir, 'bundle')).receipts.find((q) => q.caseRef.id === flow) : undefined;
    if (receipt) out.push(...cellEvidence(runDir, receipt.selectionCellId));
  } catch { /* evidence that does not verify: its summary is still there to read */ }
  return out.map((p) => relative(dir, p));
}

/**
 * One failure, from the run the grow recorded for it. A run that is gone, or never made, leaves its fields null. Only the flow
 * the grow recorded is read: a run that holds no record of it is never read as that flow, even when it holds only one other.
 * `more` says where a stand-in count's extra call came from, when the run contradicts that step's own answer, as the prototype
 * words it: "The extra 900 charge came during step 3 (owner removes it again); step 4 counted them."
 */
function readFailure(s: GrowState, dir: string, id: string): { failure: GrowFailure; stepName: string | null; more: string | null } {
  const x = s.scenarios.find((y) => y.id === id)!; const r = s.run[id];
  const flow = r?.flow ?? x.flow ?? null; const run = r?.run ?? null;
  const out: GrowFailure = { scenario: id, title: plainTitle(x.title), promise: x.criteria.length ? x.criteria.join(', ') : null, flow, run, saved: false,
    step: null, check: null, expected: null, got: null, says: brokeLine(r), evidence: [] };
  const found = { failure: out, stepName: null as string | null, more: null as string | null };
  if (!run) return found;
  let runDir: string;
  // A run that is not saved in this folder leaves `saved` false, and nothing to point at.
  const root = s.flows?.config ? configRunsRoot(dir, s.flows.config) : dir;
  try { if (!root) return found; runDir = savedRunDirectory(root, run); } catch { return found; }
  out.saved = true;
  const rel = (p: string) => relative(dir, p);
  if (existsSync(join(runDir, 'summary.json'))) out.evidence.push(rel(join(runDir, 'summary.json')));
  try {
    const bundle = readVerifiedBundle(join(runDir, 'bundle'));
    const receipt = flow ? bundle.receipts.find((q) => q.caseRef.id === flow) : undefined;
    if (!receipt) return found;
    out.evidence.push(...cellEvidence(runDir, receipt.selectionCellId).map(rel));
    const c = readSavedRun(runDir).cases.find((q) => q.caseId === receipt.caseRef.id);
    if (!c) return found;
    const steps = c.steps.filter((q) => q.declared !== false);
    const bad = (q: (typeof steps)[number] | undefined) => !!q && (q.result === 'failed' || q.result === 'cancelled' || (q.checks === 'fail' && q.result === 'completed'));
    let i = c.failure ? steps.findIndex((q) => q.name === c.failure!.step || q.id === c.failure!.step) : -1;
    if (i < 0 || !bad(steps[i])) i = steps.findIndex(bad);
    if (i < 0) return found;
    const at = steps[i]!; const name = declaredName(runDir, c.caseId, at); out.step = i + 1; found.stepName = name;
    // The Run tab's own reading of the step's recorded check (checkCompare.ts), so both say the same; and the sentence the page
    // says, from those recorded fields. Without a recorded check, the reason the grow recorded stays.
    // A stand-in count whose extra call came during a step that answered that none happened names that step, and the one that
    // counted; any other says the step that broke it.
    const x = at.compared ? extraCall(steps, at) : null;
    if (x?.field) found.more = `The extra ${x.call.amount !== null ? `${x.call.amount} ` : ''}${countNoun(at.compared!.check, 1)} came during step ${x.at + 1} (${declaredName(runDir, c.caseId, steps[x.at]!)}); step ${i + 1} counted them.`;
    if (at.compared) Object.assign(out, { check: at.compared.check, expected: at.compared.expected, got: at.compared.got,
      says: `${expGot(at.compared)}. ${found.more ?? `Step ${i + 1} (${name}) broke it.`}` });
  } catch { /* evidence that does not verify gives no expected or got */ }
  return found;
}

const factsOf = (f: { failure: GrowFailure; stepName: string | null }): VerdictFacts =>
  ({ step: f.failure.step, stepName: f.stepName, check: f.failure.check, expected: f.failure.expected, got: f.failure.got });
/**
 * What the first failure's run recorded, for the verdict to say how it failed. Runs never change once saved, so a `cache`
 * (kept by the page's server across a live grow's many paints) reads each one once.
 */
export function verdictFacts(s: GrowState, dir: string, cache?: Map<string, VerdictFacts>): VerdictFacts | null {
  const first = s.scenarios.find((x) => inMode(s, x) && s.run[x.id]?.st === 'fail');
  const run = first && s.run[first.id]?.run;
  if (!first || !run) return null;
  const key = `${first.id} ${run}`; const known = cache?.get(key);
  if (known) return known;
  // A run not saved (yet) is read again next time.
  const read = readFailure(s, dir, first.id); const facts = factsOf(read);
  if (read.failure.saved) cache?.set(key, facts);
  return facts;
}
/**
 * How each failure in the mode broke, from the check its run recorded, in the verdict's words ("expected 2 charges, got 3"),
 * so the page's rows and cards say it as the verdict does, even for a grow saved before its runs' own messages did. A failure
 * whose run recorded no check to compare is left out: its recorded reason stands. Runs never change once saved, so a `cache`
 * reads each one once.
 */
export function failureWords(s: GrowState, dir: string, cache?: Map<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of s.scenarios) {
    const run = inMode(s, x) && s.run[x.id]?.st === 'fail' ? s.run[x.id]!.run : null;
    if (!run) continue;
    const key = `${x.id} ${run}`;
    let said = cache?.get(key);
    if (said === undefined) {
      const { failure: f } = readFailure(s, dir, x.id);
      said = f.check ? expGot({ check: f.check, expected: f.expected, got: f.got }) : null;
      if (f.saved) cache?.set(key, said);
    }
    if (said) out[x.id] = said.charAt(0).toLowerCase() + said.slice(1);
  }
  return out;
}
/**
 * Where each failure's extra stand-in call came from, in the words grow --json says it ("The extra 900 charge came during step 3
 * (owner removes it again); step 4 counted them."), for the failures whose run says so. Runs never change once saved, so a
 * `cache` reads each one once.
 */
export function failureMore(s: GrowState, dir: string, cache?: Map<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of s.scenarios) {
    const run = inMode(s, x) && s.run[x.id]?.st === 'fail' ? s.run[x.id]!.run : null;
    if (!run) continue;
    const key = `${x.id} ${run}`;
    let more = cache?.get(key);
    if (more === undefined) { const read = readFailure(s, dir, x.id); more = read.more; if (read.failure.saved) cache?.set(key, more); }
    if (more) out[x.id] = more;
  }
  return out;
}
/** The page's view of a grow, with the verdict saying how its first failure broke, how each failure broke (`said`), and where a
 *  failure's extra call came from (`more`). */
export const growViewAt = (s: GrowState, dir: string, cache?: Map<string, VerdictFacts>, words?: Map<string, string | null>, more?: Map<string, string | null>) =>
  ({ ...growView(s, verdictFacts(s, dir, cache)), said: failureWords(s, dir, words), more: failureMore(s, dir, more) });

/** The summary `grow --json` prints beside the log and the state. */
export function growJsonSummary(s: GrowState, dir: string, opts: { allowUnproven?: boolean; mode?: Mode | null } = {}): GrowJsonSummary {
  const read = s.scenarios.filter((x) => inMode(s, x) && s.run[x.id]?.st === 'fail').map((x) => readFailure(s, dir, x.id));
  const v = growVerdict(s, { ...opts, broke: read[0] ? factsOf(read[0]) : null });
  return {
    verdict: v.verdict, exitCode: v.exitCode, exitMeaning: v.exitMeaning, mode: v.mode ?? MODES.find((m) => m.id === opts.mode)?.label ?? null, counts: v.counts, promises: v.promises,
    failures: read.map((f) => f.failure),
    unproven: v.unproven.map((u) => { const evidence = u.run ? unprovenEvidence(s, dir, u.scenario) : null; return evidence ? { ...u, saved: true as const, evidence } : u; }),
    stopped: s.blocked ? { code: s.blocked.code, detail: s.blocked.detail, action: s.blocked.action } : null,
    words: jsonWords(s),
  };
}
