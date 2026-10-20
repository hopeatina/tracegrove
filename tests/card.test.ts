import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { tryExample } from '../src/cli/try.ts';
import { CARD_MARKER, renderCard } from '../src/authoring/card.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function example(root: string, name: string, bug: string | null = null) {
  const out = join(root, bug ?? name);
  await tryExample({ example: name, bug, out, open: false, port: null, json: true, samplesRoot: join(import.meta.dirname, '../src/samples'), write: () => {} });
  return out;
}

it('says every claim holds, or names the failing one with a repository path, from saved runs only', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-card-')); roots.push(root);
  const good = await example(root, 'notes-api');
  const held = renderCard({ dirs: [good], commit: '0123456789abcdef' });
  expect(held).toMatchObject({ verdict: 'holds', commit: '0123456789ab', failures: [], totals: { claims: 2, supported: 2, awaitingSignOff: 1 } });
  expect(held.markdown.startsWith(CARD_MARKER)).toBe(true);
  expect(held.markdown).toContain('2 of 2 claims hold on `0123456789ab`');

  const bad = await example(root, 'notes-api', 'keep_on_delete');
  const failed = renderCard({ dirs: [good, bad], link: 'https://example.com/report' });
  expect(failed.verdict).toBe('fails');
  expect(failed.failures).toEqual([expect.objectContaining({ project: 'notes (keep_on_delete)', failure: expect.stringContaining('gone: status 200 != 404'),
    file: relative(process.cwd(), join(bad, 'tracegrove/notes/create-read-delete.flow.yaml')) })]);
  expect(failed.markdown).toContain('| notes (notes-api) | 2 | ✅ all hold |');
  expect(failed.markdown).toContain('[Full report](https://example.com/report)');
}, 60_000);
