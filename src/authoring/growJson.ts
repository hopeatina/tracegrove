/**
 * The summary `grow --json` adds for scripts and agents: the verdict the page shows, and for each failure the run, step and
 * check that broke with what it expected and got, read from the run's own sealed records. Nothing is guessed: what the run did
 * not record is null.
 */
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { readVerifiedBundle } from '../core/bundle.ts';
import { cellBundleName } from '../core/bundlePaths.ts';
import { growVerdict, inMode, plainTitle, type GrowState, type RunState } from './growState.ts';
import { savedRunDirectory } from './runLocation.ts';
import { readSavedRun } from './runSource.ts';

export type GrowFailure = {
  scenario: string; title: string; promise: string | null; flow: string | null; run: string | null;
  step: number | null; check: string | null; expected: unknown; got: unknown; says: string; evidence: string[];
};
export type GrowJsonSummary = {
  verdict: string; exitCode: number; exitMeaning: string; mode: string;
  counts: { passed: number; failed: number; notTestedYet: number }; promises: { hold: number; of: number };
  failures: GrowFailure[]; unproven: Array<{ scenario: string; title: string; reason: string }>;
};

/** A failure in the run's own words, as the page says it: the check that broke and its message, then the route. */
export function brokeLine(r: RunState | undefined): string {
  const why = String(r?.why ?? '').trim(); const i = why.indexOf(': ');
  const dot = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  const route = r?.hop ? ` On the route: ${r.after ? 'after' : 'at'} ${r.hop}.` : '';
  if (!why) return `Failed, with no reason recorded.${route}`;
  return (i <= 0 ? `Broke: ${dot(why)}` : `Broke at check “${why.slice(0, i)}”: ${dot(why.slice(i + 2))}`) + route;
}

/** One failure, from the run the grow recorded for it. A run that is gone, or never made, leaves its fields null. */
function failureOf(s: GrowState, dir: string, id: string): GrowFailure {
  const x = s.scenarios.find((y) => y.id === id)!; const r = s.run[id];
  const flow = r?.flow ?? x.flow ?? null; const run = r?.run ?? null;
  const out: GrowFailure = { scenario: id, title: plainTitle(x.title), promise: x.criteria.length ? x.criteria.join(', ') : null, flow, run,
    step: null, check: null, expected: null, got: null, says: brokeLine(r), evidence: [] };
  if (!run) return out;
  let runDir: string;
  try { runDir = savedRunDirectory(join(dir, dirname(s.flows?.config ?? '.')), run); } catch { return out; }
  const rel = (p: string) => relative(dir, p);
  if (existsSync(join(runDir, 'summary.json'))) out.evidence.push(rel(join(runDir, 'summary.json')));
  try {
    const bundle = readVerifiedBundle(join(runDir, 'bundle'));
    const receipt = bundle.receipts.find((q) => q.caseRef.id === flow) ?? (bundle.receipts.length === 1 ? bundle.receipts[0] : undefined);
    if (!receipt) return out;
    const cell = join(runDir, 'bundle', 'cells', cellBundleName(receipt.selectionCellId));
    for (const f of ['receipt.json', 'assertions.json', 'boundaries.json', 'events.jsonl']) if (existsSync(join(cell, f))) out.evidence.push(rel(join(cell, f)));
    const c = readSavedRun(runDir).cases.find((q) => q.caseId === receipt.caseRef.id);
    if (!c) return out;
    const steps = c.steps.filter((q) => q.declared !== false);
    const bad = (q: (typeof steps)[number] | undefined) => !!q && (q.result === 'failed' || q.result === 'cancelled' || (q.checks === 'fail' && q.result === 'completed'));
    let i = c.failure ? steps.findIndex((q) => q.name === c.failure!.step || q.id === c.failure!.step) : -1;
    if (i < 0 || !bad(steps[i])) i = steps.findIndex(bad);
    if (i < 0) return out;
    const at = steps[i]!; out.step = i + 1;
    // The Run tab's own reading of the step's recorded check (checkCompare.ts), so both say the same.
    if (at.compared) Object.assign(out, { check: at.compared.check, expected: at.compared.expected, got: at.compared.got });
  } catch { /* evidence that does not verify gives no expected or got */ }
  return out;
}

/** The summary `grow --json` prints beside the log and the state. */
export function growJsonSummary(s: GrowState, dir: string, opts: { allowUnproven?: boolean } = {}): GrowJsonSummary {
  const v = growVerdict(s, opts);
  return {
    verdict: v.verdict, exitCode: v.exitCode, exitMeaning: v.exitMeaning, mode: v.mode, counts: v.counts, promises: v.promises,
    failures: s.scenarios.filter((x) => inMode(s, x) && s.run[x.id]?.st === 'fail').map((x) => failureOf(s, dir, x.id)),
    unproven: v.unproven,
  };
}
