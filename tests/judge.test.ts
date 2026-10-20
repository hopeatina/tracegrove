import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryExample } from '../src/cli/try.ts';
import { buildJudgePrompt, judge, parseJudgeAnswer } from '../src/authoring/judge.ts';
import { decide, readiness } from '../src/authoring/readiness.ts';
import { renderCard } from '../src/authoring/card.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('reads only cited verdicts and drops unknown items', () => {
  const items = parseJudgeAnswer('Sure! {"items":[{"item":1,"verdict":"met","lines":[2]},{"item":2,"verdict":"not_met","lines":[]},{"item":9,"verdict":"met","lines":[1]}]}', ['a', 'b', 'c'], 3);
  expect(items.map((i) => i.verdict)).toEqual(['met', 'unclear', 'unclear']);
  expect(items[1]!.why).toMatch(/^uncited/);
  expect(() => parseJudgeAnswer('no json here', ['a'], 1)).toThrow('judge_answer_unreadable');
});

it('grades a saved run against the rubric, feeds readiness and the card as advice, and tracks agreement', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-judge-')); roots.push(root);
  const out = join(root, 'vet');
  await tryExample({ example: 'vet-receptionist', bug: null, out, open: false, port: null, json: true, samplesRoot: join(import.meta.dirname, '../src/samples'), write: () => {} });
  const prompts: string[] = [];
  const result = await judge(out, { judge: { provider: 'test', model: null }, ask: async (prompt) => {
    prompts.push(prompt);
    const line = prompt.split('\n').find((l) => /agent: You're all set/.test(l))!.split(':')[0];
    return JSON.stringify({ items: [{ item: 1, verdict: 'met', lines: [Number(line)], why: 'says Tuesday at 10 AM' }, { item: 2, verdict: 'met', lines: [Number(line)], why: 'asked' },
      { item: 3, verdict: 'not_met', lines: [Number(line)], why: 'pretend the judge disagrees' }] });
  } });
  expect(result.judged.map((j) => j.caseId)).toEqual(['calls.books-a-visit']);
  expect(result.skipped.length).toBe(3);
  expect(prompts[0]).toContain('Repeats the day and time back');
  expect(buildJudgePrompt({ title: 't', rubric: ['x'], lines: ['a'] })).toContain('1: a');

  const claim = readiness(out).claims.find((c) => c.caseId === 'calls.books-a-visit')!;
  expect(claim).toMatchObject({ assessment: 'supported', judged: { met: 2, notMet: 1, total: 3 } });
  expect(claim.next?.why).toContain('the judge flagged 1 rubric item');
  const card = renderCard({ dirs: [out] });
  expect(card.verdict).toBe('holds');
  expect(card.markdown).toContain('the judge says 1 of 3 rubric items not met (advisory)');

  decide(out, { case: 'calls.books-a-visit', decision: 'rejected', by: 'Krittiya', reason: 'agreed with the judge' });
  expect((await judge(out, { grep: 'nothing', ask: async () => '{}' })).agreement).toEqual({ decided: 1, agreed: 1 });
}, 60_000);
