import { afterAll, beforeAll, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';
import { writeSample } from '../src/cli/samples/write.ts';
import { runTests, type TestRunReport } from '../src/authoring/run.ts';
import { startUi } from '../src/authoring/ui.ts';
import { readSavedRun } from '../src/authoring/savedRun.ts';

const temps: string[] = [];
let source: string, first: TestRunReport, second: TestRunReport;
const temp = () => { const root = mkdtempSync(join(tmpdir(), 'tracegrove-saved-evidence-')); temps.push(root); return root; };
beforeAll(async () => {
  source = temp(); writeSample(join(import.meta.dirname, '../src/samples'), 'notes-browser', source);
  first = (await runTests({ configPath: join(source, 'tracegrove.config.yaml'), grep: 'notes.browser' })).report;
  second = (await runTests({ configPath: join(source, 'tracegrove.config.yaml'), grep: 'notes.browser' })).report;
  expect(first.bundleVerified).toBe(true); expect(second.bundleVerified).toBe(true);
  expect(first.executionId).not.toBe(second.executionId);
}, 60000);
afterAll(() => { for (const root of temps) rmSync(root, { recursive: true, force: true }); });

function fixture(mode: 'verified' | 'missing' | 'invalid' | 'mismatch' | 'annotations' = 'verified') {
  const root = temp(); cpSync(source, root, { recursive: true, filter: path => !path.includes('.tracegrove') });
  const name = basename(first.runDir), runDir = join(root, '.tracegrove/runs', name);
  mkdirSync(join(root, '.tracegrove/runs'), { recursive: true }); cpSync(first.runDir, runDir, { recursive: true });
  if (mode === 'missing') rmSync(join(runDir, 'bundle'), { recursive: true });
  if (mode === 'invalid') {
    const manifest = JSON.parse(readFileSync(join(runDir, 'bundle/manifest.json'), 'utf8'));
    const events = manifest.files.find((entry: { path: string }) => entry.path.endsWith('/events.jsonl')).path;
    writeFileSync(join(runDir, 'bundle', events), 'corrupt owned copy');
  }
  if (mode === 'mismatch') { rmSync(join(runDir, 'bundle'), { recursive: true }); cpSync(join(second.runDir, 'bundle'), join(runDir, 'bundle'), { recursive: true }); }
  if (mode === 'annotations') {
    const report = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
    report.cases[0].file = 'tracegrove/unrelated.flow.yaml'; report.cases[0].steps[0].name = 'Saved human label';
    writeFileSync(join(runDir, 'summary.json'), JSON.stringify(report));
  }
  return { root, name, runDir };
}

it.each(['verified', 'missing', 'invalid', 'mismatch'] as const)('reconstructs %s evidence without trusting historical summary outcomes', async mode => {
  const { root, name } = fixture(mode); const ui = await startUi({ dir: root });
  try {
    const response = await fetch(`${ui.url}api/runs/${name}`); expect(response.status).toBe(200);
    const report = await response.json(); expect(report.evidenceStatus).toBe(mode === 'missing' || mode === 'invalid' ? 'invalid' : 'verified');
    expect(report.bundleVerified).toBe(mode === 'verified' || mode === 'mismatch'); expect(report.outcome).toBe(mode === 'missing' || mode === 'invalid' ? 'inconclusive' : 'passed');
    expect(report.executionId).toBe(mode === 'missing' || mode === 'invalid' ? null : mode === 'mismatch' ? second.executionId : first.executionId);
    const video = (mode === 'mismatch' ? second : first).cases[0]!.videos![0]!;
    const media = await fetch(`${ui.url}api/runs/${name}/media/${video.digest}?case=${first.cases[0]!.caseId}`, { method: 'HEAD' });
    expect(media.status).toBe(mode === 'verified' || mode === 'mismatch' ? 200 : 409);
    if (mode === 'verified') {
      expect(report.cases[0].steps[0].name).toBe(first.cases[0]!.steps[0]!.id.replaceAll('_', ' '));
      expect(report.cases[0].steps[0].expectStatus).toBeNull(); // UI navigation has no frozen HTTP status contract.
      expect(report.cases[0].file).toBe(first.cases[0]!.file);
    }
  } finally { await ui.close(); }
});

it('binds source, case, observed facts and media references rather than trusting saved metadata', () => {
  for (const mutate of [
    (report: TestRunReport) => { report.sourceDigest = '0'.repeat(64); },
    (report: TestRunReport) => { report.cases[0]!.caseId = 'foreign.case'; },
    (report: TestRunReport) => { report.cases[0]!.steps[0]!.status = 418; },
    (report: TestRunReport) => { report.cases[0]!.videos![0]!.digest = '0'.repeat(64); },
  ]) {
    const { root, name, runDir } = fixture(); const report = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8')) as TestRunReport;
    mutate(report); writeFileSync(join(runDir, 'summary.json'), JSON.stringify(report));
    expect(readSavedRun(root, name).evidenceStatus).toBe('verified');
  }
});

it('refuses linked evidence and linked or oversized saved summaries without using their flags', () => {
  const linked = fixture(); rmSync(join(linked.runDir, 'bundle'), { recursive: true });
  symlinkSync(join(first.runDir, 'bundle'), join(linked.runDir, 'bundle'), 'dir');
  expect(readSavedRun(linked.root, linked.name).evidenceStatus).toBe('invalid');
  const summaryLink = fixture(); rmSync(join(summaryLink.runDir, 'summary.json'));
  symlinkSync(join(first.runDir, 'summary.json'), join(summaryLink.runDir, 'summary.json'));
  expect(readSavedRun(summaryLink.root, summaryLink.name).evidenceStatus).toBe('verified');
  const large = fixture(); writeFileSync(join(large.runDir, 'summary.json'), Buffer.alloc(8 * 1024 * 1024 + 1));
  expect(readSavedRun(large.root, large.name).evidenceStatus).toBe('verified');
});

it('shows fresh status in the browser and uses current case mapping for mutations', async () => {
  const { root, name } = fixture('annotations'); const ui = await startUi({ dir: root });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.route('https://**/*', route => route.abort()); await page.goto(ui.url);
    await expect.poll(() => page.getByText('saved evidence freshly verified', { exact: true }).count()).toBe(1);
    expect(await page.getByRole('complementary', { name: 'Step detail' }).textContent()).not.toContain('Saved human label');
    expect(await page.getByRole('complementary', { name: 'Step detail' }).textContent()).not.toContain('tracegrove/unrelated.flow.yaml');
    let pruneFile: string | undefined;
    await page.route('**/api/prune', route => { pruneFile = route.request().postDataJSON().file; return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"review only"}' }); });
    await page.getByRole('button', { name: 'Prune current flow', exact: true }).click();
    await expect.poll(() => pruneFile).toBe(first.cases[0]!.file);
    writeFileSync(join(root, 'tracegrove.config.yaml'), 'invalid: ['); await page.reload();
    await expect.poll(() => page.getByText('saved evidence freshly verified', { exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Run all', exact: true }).isDisabled()).toBe(true);
    rmSync(join(root, 'tracegrove.config.yaml')); await page.reload();
    await expect.poll(() => page.getByText('saved evidence freshly verified', { exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Run all', exact: true }).isDisabled()).toBe(true);
    const evidence = join(process.cwd(), 'artifacts/qa/ui-saved-evidence'); mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'verified-config-unavailable.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 375, height: 812 }); await page.screenshot({ path: join(evidence, 'verified-375.png'), fullPage: true, animations: 'disabled' });
    // Same saved true flag, but the owned evidence disappears before a later view.
    rmSync(join(root, '.tracegrove/runs', name, 'bundle'), { recursive: true }); await page.reload();
    await expect.poll(() => page.getByText('saved evidence invalid', { exact: true }).count()).toBe(1);
    expect(await page.getByText('saved evidence freshly verified', { exact: true }).count()).toBe(0);
    await page.screenshot({ path: join(evidence, 'missing-375.png'), fullPage: true, animations: 'disabled' });
  } finally { await browser.close(); await ui.close(); }
}, 30000);
