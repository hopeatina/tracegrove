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
import { expGot } from './checkCompare.ts';
import { cellBundleName } from '../core/bundlePaths.ts';
import { MODES, growVerdict, growView, inMode, plainTitle, failReason, type GrowState, type Mode, type RunState, type VerdictFacts } from './growState.ts';
import { configRunsRoot, savedRunDirectory } from './runLocation.ts';
import { readSavedRun } from './runSource.ts';

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
   *  start, say), which is not a failure */
  unproven: Array<{ scenario: string; title: string; reason: string; run?: string }>;
  /** why a grow stopped, and what to do: null unless it stopped or was cancelled */
  stopped: { code: string; detail: string; action: string } | null;
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

/** One failure, from the run the grow recorded for it. A run that is gone, or never made, leaves its fields null. */
function readFailure(s: GrowState, dir: string, id: string): { failure: GrowFailure; stepName: string | null } {
  const x = s.scenarios.find((y) => y.id === id)!; const r = s.run[id];
  const flow = r?.flow ?? x.flow ?? null; const run = r?.run ?? null;
  const out: GrowFailure = { scenario: id, title: plainTitle(x.title), promise: x.criteria.length ? x.criteria.join(', ') : null, flow, run, saved: false,
    step: null, check: null, expected: null, got: null, says: brokeLine(r), evidence: [] };
  const found = { failure: out, stepName: null as string | null };
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
    const receipt = bundle.receipts.find((q) => q.caseRef.id === flow) ?? (bundle.receipts.length === 1 ? bundle.receipts[0] : undefined);
    if (!receipt) return found;
    const cell = join(runDir, 'bundle', 'cells', cellBundleName(receipt.selectionCellId));
    for (const f of ['receipt.json', 'assertions.json', 'boundaries.json', 'events.jsonl']) if (existsSync(join(cell, f))) out.evidence.push(rel(join(cell, f)));
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
    if (at.compared) Object.assign(out, { check: at.compared.check, expected: at.compared.expected, got: at.compared.got,
      says: `${expGot(at.compared)}. Step ${i + 1} (${name}) broke it.` });
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
/** The page's view of a grow, with the verdict saying how its first failure broke, and how each failure broke (`said`). */
export const growViewAt = (s: GrowState, dir: string, cache?: Map<string, VerdictFacts>, words?: Map<string, string | null>) =>
  ({ ...growView(s, verdictFacts(s, dir, cache)), said: failureWords(s, dir, words) });

/** The summary `grow --json` prints beside the log and the state. */
export function growJsonSummary(s: GrowState, dir: string, opts: { allowUnproven?: boolean; mode?: Mode | null } = {}): GrowJsonSummary {
  const read = s.scenarios.filter((x) => inMode(s, x) && s.run[x.id]?.st === 'fail').map((x) => readFailure(s, dir, x.id));
  const v = growVerdict(s, { ...opts, broke: read[0] ? factsOf(read[0]) : null });
  return {
    verdict: v.verdict, exitCode: v.exitCode, exitMeaning: v.exitMeaning, mode: v.mode ?? MODES.find((m) => m.id === opts.mode)?.label ?? null, counts: v.counts, promises: v.promises,
    failures: read.map((f) => f.failure),
    unproven: v.unproven,
    stopped: s.blocked ? { code: s.blocked.code, detail: s.blocked.detail, action: s.blocked.action } : null,
  };
}
