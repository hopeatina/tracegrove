import { afterEach, expect, it } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunActivity } from '../src/authoring/activity.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';

let root: string | undefined;
let server: UiServer | undefined;
afterEach(async () => { await server?.close(); if (root) rmSync(root, { recursive: true, force: true }); });

it('reports idle then the actual terminal run result without publishing raw event payloads', async () => {
  root = mkdtempSync(join(tmpdir(), 'tracegrove-activity-'));
  cpSync(join(import.meta.dirname, '../src/samples/notes-api'), root, { recursive: true });
  server = await startUi({ dir: root });
  const activity = async () => RunActivity.parse(await (await fetch(`${server!.url}api/activity`)).json());
  expect((await activity()).status).toBe('idle');
  const page = await (await fetch(server.url)).text();
  const token = /const TOKEN='([^']+)'/.exec(page)![1]!;
  const response = await fetch(`${server.url}api/test`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-tracegrove-token': token,
  }, body: JSON.stringify({ grep: 'list' }) });
  const report = await response.json() as { outcome: string; finishedAt: string; bundleVerified: boolean };
  expect(report.bundleVerified).toBe(true);
  expect(await activity()).toEqual({ status: 'finished', event: null, stepId: null,
    label: `Run finished: ${report.outcome}`, observedAt: report.finishedAt });
  const failure = await fetch(`${server.url}api/test`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-tracegrove-token': token,
  }, body: JSON.stringify({ grep: 'no-such-flow' }) });
  expect(failure.status).toBe(422);
  expect((await activity()).status).toBe('failed');
});
