import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeSample } from '../src/cli/samples/write.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { runTests } from '../src/authoring/run.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { readRunVideo, videoRange } from '../src/authoring/media.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { videoBundlePath } from '../src/core/bundlePaths.ts';
import { Blocked } from '../src/core/errors.ts';

const roots: string[] = []; const servers: UiServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-browser-authoring-')); roots.push(root);
  writeSample(join(import.meta.dirname, '../src/samples'), 'notes-browser', root);
  return root;
}

it('runs a short browser flow and serves only its verified recording with native byte ranges', async () => {
  const root = project();
  const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml'), grep: 'notes.browser' });
  expect(report.outcome).toBe('passed'); expect(report.bundleVerified).toBe(true);
  const scenario = report.cases[0]!; const video = scenario.videos![0]!;
  expect(scenario.steps.filter(step => step.method === 'UI')).toHaveLength(3);
  expect(scenario.steps.find(step => step.observedText === 'Existing note')).toBeDefined();
  const runName = basename(report.runDir);
  const bytes = readRunVideo(root, runName, video.digest, scenario.caseId);
  expect(bytes.length).toBe(video.byteCount);
  expect(() => readRunVideo(root, runName, video.digest, 'another.scenario')).toThrow(/not bound/);
  expect(() => readRunVideo(root, '..', video.digest, scenario.caseId)).toThrow(/invalid recording reference/);
  symlinkSync(report.runDir, join(root, '.tracegrove/runs/alias'), 'dir');
  expect(() => readRunVideo(root, 'alias', video.digest, scenario.caseId)).toThrow(/not owned/);
  const server = await startUi({ dir: root }); servers.push(server);
  const url = `${server.url}api/runs/${runName}/media/${video.digest}?case=${scenario.caseId}`;
  const partial = await fetch(url, { headers: { range: 'bytes=0-3' } });
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe(`bytes 0-3/${video.byteCount}`);
  expect(partial.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  expect(Buffer.from(await partial.arrayBuffer()).toString('hex')).toBe('1a45dfa3');
  const suffix = await fetch(url, { headers: { range: 'bytes=-4' } });
  expect(suffix.status).toBe(206); expect(Buffer.from(await suffix.arrayBuffer())).toEqual(bytes.subarray(-4));
  const invalid = await fetch(url, { headers: { range: `bytes=${video.byteCount}-` } });
  expect(invalid.status).toBe(416);
  const head = await fetch(url, { method: 'HEAD' });
  expect(head.status).toBe(200); expect(head.headers.get('content-length')).toBe(String(video.byteCount));
  expect((await head.arrayBuffer()).byteLength).toBe(0);
  const receipt = readVerifiedBundle(join(report.runDir, 'bundle')).receipts[0]!;
  writeFileSync(join(report.runDir, 'bundle', videoBundlePath(receipt.selectionCellId, video.digest)), 'corrupt');
  expect((await fetch(url)).status).toBe(409);
});

it('reports missing browser authority and invalid read expectations at their authoring file', () => {
  const root = project(); const path = join(root, 'tracegrove/notes/browser.flow.yaml');
  const source = readFileSync(path, 'utf8');
  const reasons = () => {
    try { compileProject(join(root, 'tracegrove.config.yaml'), { grep: 'notes.browser' }); throw new Error('expected block'); }
    catch (error) { if (!(error instanceof Blocked)) throw error; return error.reasons.map(reason => reason.detail).join(' '); }
  };
  writeFileSync(path, source.replace(/browser:\n  allowPaths:[^\n]+\n  allowMethods:[^\n]+\n/, ''));
  expect(reasons()).toMatch(/browser\.flow\.yaml.*browser\.allowPaths/s);
  writeFileSync(path, source.replace('expect: { text: Existing note }', 'expect: { status: 200 }'));
  expect(reasons()).toMatch(/browser\.flow\.yaml.*expect\.text/s);
});

it('handles suffix, open-ended and invalid video ranges without accepting multiple ranges', () => {
  expect(videoRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 });
  expect(videoRange('bytes=3-', 10)).toEqual({ start: 3, end: 9 });
  for (const header of ['bytes=0-1,3-4', 'bytes=-0', 'bytes=10-', 'bytes=5-2', 'bytes=9007199254740992-']) expect(videoRange(header, 10)).toBeNull();
});
