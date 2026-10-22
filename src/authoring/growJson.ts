/**
 * The summary `grow --json` adds for scripts and agents: the verdict the page shows, and for each failure the run, step and
 * check that broke with what it expected and got, read from the run's own sealed records. Nothing is guessed: what the run did
 * not record is null.
 */
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { readVerifiedBundle } from '../core/bundle.ts';
import { cellBundleName } from '../core/bundlePaths.ts';
import { CaseSpec, refKey, type PredicateT } from '../protocol/index.ts';
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

type Leaf = { p: Exclude<PredicateT, { kind: 'all' }>; actual: unknown };
/** Pair each leaf of a predicate with its recorded actual: an `all` records one actual per predicate, in order. */
function leaves(p: PredicateT, actual: unknown): Leaf[] {
  if (p.kind !== 'all') return [{ p, actual }];
  const list = Array.isArray(actual) ? actual : [];
  return p.predicates.flatMap((q, i) => leaves(q, i < list.length ? list[i] : null));
}
/** The leaf whose failure the reducer recorded as `reason` (src/core/reducer.ts says each one this way). */
function failedLeaf(all: Leaf[], reason: string): Leaf | undefined {
  return all.find(({ p, actual }) => {
    switch (p.kind) {
      case 'status_equals': return reason === `status ${actual ?? 'none'} != ${p.value}`;
      case 'json_path_equals': return reason === `${p.path} differs` || reason === `${p.path} absent`;
      case 'json_path_present': return reason === `${p.path} absent`;
      case 'json_path_absent': return reason === `${p.path} present`;
      case 'json_path_count': return reason === `count ${actual} != ${p.count}`;
      case 'json_path_includes': return reason === `${p.path} absent` || reason.startsWith(`${p.path} lacks `);
      case 'json_path_excludes': return reason.startsWith(`${p.path} contains `);
      case 'json_path_at_most': return reason.startsWith(`${p.path} `) && (reason.includes(' > ') || reason.endsWith(' is not a number'));
      case 'step_result': return reason === `step ${actual ?? 'unobserved'} != ${p.value}`;
    }
  });
}
/** What a leaf compared, named as the Run tab names it, and what it wanted. */
function compared(l: Leaf, reason: string, step: { method: string; path: string }): { check: string; expected: unknown; got: unknown } {
  const { p, actual } = l;
  switch (p.kind) {
    case 'status_equals': return { check: 'status', expected: p.value, got: actual };
    case 'json_path_equals': return { check: step.method === 'STANDIN' && p.path === 'body.count' ? `${step.path} call count` : p.path, expected: p.value, got: reason.endsWith(' absent') ? 'absent' : actual };
    case 'json_path_present': return { check: p.path, expected: 'present', got: 'absent' };
    case 'json_path_absent': return { check: p.path, expected: 'absent', got: actual };
    case 'json_path_count': return { check: `${p.path} count`, expected: p.count, got: actual };
    case 'json_path_includes': return { check: p.path, expected: p.values, got: actual };
    case 'json_path_excludes': return { check: p.path, expected: { without: p.values }, got: actual };
    case 'json_path_at_most': return { check: p.path, expected: { atMost: p.value }, got: actual };
    case 'step_result': return { check: 'step result', expected: p.value, got: actual };
  }
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
    const spec = CaseSpec.parse(bundle.documents[refKey(receipt.caseRef)]);
    const record = receipt.assertions.find((a) => a.assertionId.replace(/\.expect$/, '') === at.id && a.result === 'fail' && a.reasonCode);
    const declared = [...spec.preconditions, ...spec.assertions].find((a) => a.id === record?.assertionId);
    if (!record || !declared) return out;
    const leaf = failedLeaf(leaves(declared.predicate, record.actual), record.reasonCode!);
    if (leaf) Object.assign(out, compared(leaf, record.reasonCode!, at));
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
