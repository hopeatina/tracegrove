/**
 * What a failed check compared, read from the run's own sealed records: the leaf of the declared predicate whose failure the
 * reducer recorded, named as the Run tab names it, with what it expected and what it got. The Run tab shows it on the step,
 * and grow says it in its verdict and `grow --json`. Nothing is guessed: a record that does not say gives no comparison.
 */
import type { PredicateT } from '../protocol/index.ts';

export type Compared = { check: string; expected: unknown; got: unknown };

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
function compared(l: Leaf, reason: string, step: { method: string; path: string }): Compared {
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

/** The check that failed, from the declared predicate and the assertion the run recorded for it; null when the record does
 *  not name one of the predicate's own checks. `step` is the step as the Run tab names it (its method and path). */
export function comparedOf(predicate: PredicateT, record: { reasonCode: string | null; actual: unknown }, step: { method: string; path: string }): Compared | null {
  if (!record.reasonCode) return null;
  const leaf = failedLeaf(leaves(predicate, record.actual), record.reasonCode);
  return leaf ? compared(leaf, record.reasonCode, step) : null;
}
