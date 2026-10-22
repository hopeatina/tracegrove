import { describe, expect, it } from 'vitest';
import { comparedOf, expGot } from '../src/authoring/checkCompare.ts';
import type { CompiledFlowInfo } from '../src/authoring/compile.ts';
import { caseReport } from '../src/authoring/run.ts';
import type { CaseSpec, ExecutionReceipt } from '../src/protocol/index.ts';

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/* A check the run recorded, read back the way the reducer (src/core/reducer.ts) words its failures. */
describe('What a failed check compared', () => {
  const http = { method: 'GET', path: '/notes/count' };
  it('finds the failing leaf of an `all` and pairs it with its own recorded actual', () => {
    const p = { kind: 'all' as const, predicates: [{ kind: 'status_equals' as const, value: 200 }, { kind: 'json_path_equals' as const, path: 'body.count', value: 0 }] };
    expect(comparedOf(p, { reasonCode: 'body.count differs', actual: [200, 1] }, http)).toEqual({ check: 'body.count', expected: 0, got: 1 });
    expect(comparedOf(p, { reasonCode: 'status 500 != 200', actual: [500, null] }, http)).toEqual({ check: 'status', expected: 200, got: 500 });
  });
  it('names a stand-in count by its route, and says nothing when the record names no check of the predicate', () => {
    const p = { kind: 'json_path_equals' as const, path: 'body.count', value: 2 };
    expect(comparedOf(p, { reasonCode: 'body.count differs', actual: 3 }, { method: 'STANDIN', path: 'payments POST /v1/charges' })).toEqual({ check: 'payments POST /v1/charges call count', expected: 2, got: 3 });
    expect(comparedOf(p, { reasonCode: 'body.other differs', actual: 3 }, http)).toBeNull();
    expect(comparedOf(p, { reasonCode: null, actual: 3 }, http)).toBeNull();
  });
});

describe('A saved run’s steps', () => {
  /* The plotline failure, as its receipt records it: three HTTP steps held, then the stand-in counted 3 charges where 2 were declared. */
  const stand = { kind: 'stand_in', standIn: 'payments', route: { method: 'POST', path: '/v1/charges' }, count: 3, calls: [], attempts: 1 };
  const answer = (body: unknown) => ({ status: 200, headers: {}, body, bodyText: null, method: 'POST', url: 'http://127.0.0.1:1/seats', durationMs: 5, attempts: 1 });
  const receipt = {
    caseRef: { id: 'seats.remove-seat' }, outcome: 'assertion_failed', reasonCodes: [], artifacts: [],
    steps: [
      { stepId: 'owner_adds_a_seat', result: 'completed', reasonCode: null, timing: { durationMs: 6 }, output: answer({ seats: 2, charged: 900 }) },
      { stepId: 'owner_removes_it_again', result: 'completed', reasonCode: null, timing: { durationMs: 9 }, output: answer({ seats: 1, charged: 0 }) },
      { stepId: 'only_the_added_seat_was_charged', result: 'completed', reasonCode: null, timing: { durationMs: 4991 }, output: stand },
    ],
    assertions: [
      { assertionId: 'owner_adds_a_seat.expect', result: 'pass', reasonCode: null, actual: 200 },
      { assertionId: 'owner_removes_it_again.expect', result: 'pass', reasonCode: null, actual: [200, 1, 0] },
      { assertionId: 'only_the_added_seat_was_charged.expect', result: 'fail', reasonCode: 'body.count differs', actual: 3 },
    ],
  } as unknown as ExecutionReceipt;
  const flow = { caseId: 'seats.remove-seat', file: '', title: 'Removing a seat never charges the card', tags: [], risk: 'high', fixtures: [], steps: [
    { id: 'owner_adds_a_seat', name: 'owner adds a seat', as: 'owner', method: 'POST', path: '/seats', expectStatus: 200, expectation: 'Status 200' },
    { id: 'owner_removes_it_again', name: 'owner removes it again', as: 'owner', method: 'POST', path: '/seats', expectStatus: 200, expectation: 'Status 200' },
    { id: 'only_the_added_seat_was_charged', name: 'only the added seat was charged', as: 'owner', method: 'STANDIN', path: 'payments POST /v1/charges', expectStatus: null },
  ] } as unknown as CompiledFlowInfo;
  const assertions = [
    { id: 'owner_adds_a_seat.expect', stepId: 'owner_adds_a_seat', predicate: { kind: 'status_equals', value: 200 } },
    { id: 'owner_removes_it_again.expect', stepId: 'owner_removes_it_again', predicate: { kind: 'all', predicates: [{ kind: 'status_equals', value: 200 }, { kind: 'json_path_equals', path: 'body.seats', value: 1 }, { kind: 'json_path_equals', path: 'body.charged', value: 0 }] } },
    { id: 'only_the_added_seat_was_charged.expect', stepId: 'only_the_added_seat_was_charged', predicate: { kind: 'json_path_equals', path: 'body.count', value: 2 } },
  ] as unknown as CaseSpec['assertions'];

  it('carry the failed check’s expected and got, and what the app answered each HTTP step', () => {
    const c = caseReport(receipt, flow, assertions);
    expect(c.steps.map((s) => [s.checks, s.compared ?? null, s.answer ?? null])).toEqual([
      ['pass', null, '{"seats":2,"charged":900}'],
      ['pass', null, '{"seats":1,"charged":0}'],
      ['fail', { check: 'payments POST /v1/charges call count', expected: 2, got: 3 }, null],
    ]);
  });

  it('say the count a stand-in wanted when its step has no compiled expectation, as a saved run read back has none', () => {
    // In the one wording the verdict and grow --json use (expGot), whether the run is read back or just compiled.
    expect(caseReport(receipt, flow, assertions).failure).toMatchObject({ step: 'only the added seat was charged', message: 'expected 2 charges, got 3' });
    const compiled: CompiledFlowInfo = { ...flow, steps: flow.steps.map((s) => (s.method === 'STANDIN' ? { ...s, expectation: '2 calls received' } : s)) };
    expect(caseReport(receipt, compiled, assertions).failure!.message).toBe('expected 2 charges, got 3');
    expect(caseReport(receipt, compiled, assertions).failure!.message).toBe(lowerFirst(expGot(caseReport(receipt, compiled, assertions).steps[2]!.compared!)));
    // With no recorded check to read, the compiled expectation; with neither, it still says it plainly.
    expect(caseReport(receipt, compiled, []).failure!.message).toBe('expected 2 calls, got 3');
    expect(caseReport(receipt, flow, []).failure!.message).toBe('expected a different call count, got 3');
  });

  it('cut what the app answered at 4 KB', () => {
    const big = { ...receipt, steps: [{ ...receipt.steps[0]!, output: answer({ text: 'x'.repeat(9000) }) }], assertions: [] } as unknown as ExecutionReceipt;
    const a = caseReport(big, flow, assertions).steps[0]!.answer!;
    expect(a.length).toBe(4097);
    expect(a.endsWith('…')).toBe(true);
  });
});
