/**
 * The summary `grow --json` adds for scripts and agents: the verdict the page shows, and for each failure the run, step and
 * check that broke with what it expected and got, read from the run's own sealed records. Nothing is guessed: what the run did
 * not record is null.
 */
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { readVerifiedBundle } from '../core/bundle.ts';
import { expGot } from './checkCompare.ts';
import { cellBundleName } from '../core/bundlePaths.ts';
import { MODES, growVerdict, growView, inMode, plainTitle, failReason, type GrowState, type Mode, type RunState, type VerdictFacts } from './growState.ts';
import { savedRunDirectory } from './runLocation.ts';
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
  failures: GrowFailure[]; unproven: Array<{ scenario: string; title: string; reason: string }>;
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
  try { runDir = savedRunDirectory(join(dir, dirname(s.flows?.config ?? '.')), run); } catch { return found; }
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
    const at = steps[i]!; out.step = i + 1; found.stepName = at.name;
    // The Run tab's own reading of the step's recorded check (checkCompare.ts), so both say the same; and the sentence the page
    // says, from those recorded fields. Without a recorded check, the reason the grow recorded stays.
    if (at.compared) Object.assign(out, { check: at.compared.check, expected: at.compared.expected, got: at.compared.got,
      says: `${expGot(at.compared)}. Step ${i + 1} (${at.name}) broke it.` });
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
  const facts = factsOf(readFailure(s, dir, first.id)); cache?.set(key, facts);
  return facts;
}
/** The page's view of a grow, with the verdict saying how its first failure broke. */
export const growViewAt = (s: GrowState, dir: string, cache?: Map<string, VerdictFacts>) => growView(s, verdictFacts(s, dir, cache));

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
