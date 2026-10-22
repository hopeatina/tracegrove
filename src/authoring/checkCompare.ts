/**
 * What a failed check compared, read from the run's own sealed records: the leaf of the declared predicate whose failure the
 * reducer recorded, named as the Run tab names it, with what it expected and what it got. The Run tab shows it on the step,
 * and grow says it in its verdict and `grow --json`. Nothing is guessed: a record that does not say gives no comparison.
 */
import { textHas } from '../core/reducer.ts';
import { digestOfValue, type PredicateT } from '../protocol/index.ts';

export type Compared = { check: string; expected: unknown; got: unknown };

type Leaf = { p: Exclude<PredicateT, { kind: 'all' }>; actual: unknown };
/** Pair each leaf of a predicate with its recorded actual: an `all` records one actual per predicate, in order. */
function leaves(p: PredicateT, actual: unknown): Leaf[] {
  if (p.kind !== 'all') return [{ p, actual }];
  const list = Array.isArray(actual) ? actual : [];
  return p.predicates.flatMap((q, i) => leaves(q, i < list.length ? list[i] : null));
}
const quoted = (values: string[]) => values.map((v) => JSON.stringify(v)).join(', ');
/**
 * The reasons the reducer could have recorded for a leaf on its own recorded actual, rebuilt the way src/core/reducer.ts says
 * each one: none when the leaf held. A recorded actual of null leaves it open whether the path was absent or held null, so
 * both readings are kept.
 */
function reasonsOf({ p, actual }: Leaf): string[] {
  switch (p.kind) {
    case 'status_equals': return actual === p.value ? [] : [`status ${actual ?? 'none'} != ${p.value}`];
    case 'json_path_equals': return actual === null ? [`${p.path} absent`, ...(p.value === null ? [] : [`${p.path} differs`])]
      : digestOfValue(actual).hex === digestOfValue(p.value).hex ? [] : [`${p.path} differs`];
    case 'json_path_present': return actual === null ? [`${p.path} absent`] : [];
    case 'json_path_absent': return [`${p.path} present`];
    case 'json_path_count': return actual === p.count ? [] : [`count ${actual} != ${p.count}`];
    case 'json_path_includes': {
      const missing = p.values.filter((v) => !textHas(actual, v));
      return [...(actual === null ? [`${p.path} absent`] : []), ...(missing.length ? [`${p.path} lacks ${quoted(missing)}`] : [])];
    }
    case 'json_path_excludes': { const found = p.values.filter((v) => textHas(actual, v)); return found.length ? [`${p.path} contains ${quoted(found)}`] : []; }
    case 'json_path_at_most': return typeof actual !== 'number' ? [`${p.path} is not a number`] : actual <= p.value ? [] : [`${p.path} ${actual} > ${p.value}`];
    case 'step_result': return actual === p.value ? [] : [`step ${actual ?? 'unobserved'} != ${p.value}`];
  }
}
/** The leaf whose failure the reducer recorded as `reason`: the one whose own recorded actual gives exactly that reason. */
function failedLeaf(all: Leaf[], reason: string): Leaf | undefined {
  return all.find((l) => reasonsOf(l).includes(reason));
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

/** A value as the page writes it: text quoted, everything else as JSON. */
const shown = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v) ?? String(v));
/**
 * The thing a stand-in route's calls are, in its own word: "charges" for POST /v1/charges, else "calls". The word is the
 * route's last segment only when it is plainly a plural whose singular is sure: never a word that only ends in s (status,
 * analysis, news, aliases, companies), which counts in calls instead, the unit the run recorded.
 */
function nounOf(check: string, n: unknown): string {
  const route = / call count$/.test(check) ? check.replace(/ call count$/, '') : null;
  if (route === null) return '';
  const last = (route.split(' ').pop() ?? '').split('?')[0]!.split('/').filter(Boolean).pop() ?? '';
  const one = /^[a-z]{3,}s$/.test(last) ? singular(last) : null;
  return one === null ? (n === 1 ? 'call' : 'calls') : n === 1 ? one : last;
}
/** The singular of a plural that has only one: "charges" → "charge", "addresses" → "address", "batches" → "batch"; null
 *  when the word is not plainly a plural or its singular is not sure ("status", "aliases", "entries", "heroes", "leaves"). */
function singular(word: string): string | null {
  if (/(?:ss|us|is|ws)$/.test(word)) return null;
  if (/(?:sses|xes|tches|nches|rches|shes)$/.test(word)) return word.slice(0, -2);
  if (/(?:ses|ies|oes|ches|zzes|ves)$/.test(word)) return null;
  return word.slice(0, -1);
}
/**
 * One wording for every expected-and-got line, on the page and in `grow --json`: "Expected 2 charges, got 3" for a stand-in's
 * call count (counted in the route's own word), "Expected body.count 0, got 1" for any other check, which it names.
 */
export function expGot(c: Compared): string {
  const noun = nounOf(c.check, c.expected);
  return noun ? `Expected ${shown(c.expected)} ${noun}, got ${shown(c.got)}` : `Expected ${c.check} ${shown(c.expected)}, got ${shown(c.got)}`;
}
