import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { chromium, type Browser } from 'playwright';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';
import { comparisonRunsFixture } from './fixtures/comparisonRuns.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { inspectBenchmark } from '../src/core/benchmark.ts';
import { localScope } from '../src/core/corpus.ts';
import { BenchmarkReport } from '../src/protocol/index.ts';

let f: Awaited<ReturnType<typeof comparisonRunsFixture>>, server: UiServer, browser: Browser, captures: string;
const url = (axis = 'runner') => new URL('api/benchmark?' + new URLSearchParams({ axis }), server.url);
const stateDir = () => join(f.root, '.tracegrove/state');
const report = (axis: 'runner' | 'model' = 'runner') => inspectBenchmark({ stateDir: stateDir(), scope: localScope(), axis });
beforeAll(async () => {
  f = await comparisonRunsFixture(); server = await startUi({ dir: f.root }); browser = await chromium.launch({ headless: true });
  mkdirSync(join(process.cwd(), 'artifacts/qa'), { recursive: true });
  captures = mkdtempSync(join(process.cwd(), 'artifacts/qa/benchmark-workbench-'));
}, 60000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await browser?.close(); await server?.close(); cleanupTemps(); });

it('returns the SDK checkpoint including actual failed attempts despite forged summaries or invalid current config', async () => {
  const metadata = join(f.failed.runDir, 'summary.json'), before = readFileSync(metadata), config = readFileSync(f.configPath);
  const journalPath = join(stateDir(), 'ledger/journal.jsonl'), journal = readFileSync(journalPath);
  try {
    writeFileSync(metadata, JSON.stringify({ outcome: 'passed', privateValue: 'BENCHMARK_PRIVATE_CACHE_SENTINEL' }));
    writeFileSync(f.configPath, 'invalid: [');
    const response = await fetch(url()); expect(response.status).toBe(200);
    const raw = await response.text(); const data = BenchmarkReport.parse(JSON.parse(raw));
    expect(data).toEqual(report()); expect(data.inventory.attempts).toHaveLength(5);
    expect(data.inventory.attempts.some(a => a.outcome === 'assertion_failed')).toBe(true);
    expect(data.findings).toContain('pricing_incomplete'); expect(raw).not.toContain('BENCHMARK_PRIVATE_CACHE_SENTINEL');
    expect(raw).not.toContain(f.root); expect(readFileSync(journalPath)).toEqual(journal);
  } finally { writeFileSync(metadata, before); writeFileSync(f.configPath, config); }
});

it('rejects arbitrary paths, scopes, duplicate/extra options and cross-origin access', async () => {
  for (const query of ['axis=fastest', 'axis=runner&axis=model', 'axis=runner&state-dir=../outside',
    'axis=model&scope=another-owner', 'axis=runner&only-passed=true', '']) {
    expect((await fetch(new URL('api/benchmark?' + query, server.url))).status).toBe(400);
  }
  expect((await fetch(url(), { headers: { origin: 'https://unrelated.invalid' } })).status).toBe(403);
  const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(url(), { headers: { host: 'unrelated.invalid' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  expect(hostileHost).toBe(421);
  expect((await fetch(url(), { method: 'PUT' })).status).toBe(405);
});

it('does not follow a linked project state directory', async () => {
  const held = stateDir() + '.held'; renameSync(stateDir(), held); symlinkSync(held, stateDir());
  try {
    const response = await fetch(url()), data = BenchmarkReport.parse(await response.json());
    expect(data.exitCode).toBe(2); expect(data.inventory.code).toBe('ledger_snapshot_unavailable'); expect(data.groups).toEqual([]);
  } finally { unlinkSync(stateDir()); renameSync(held, stateDir()); }
});

it.each([['desktop', 1440, 1000], ['mobile', 375, 900]] as const)('reads, changes axis, downloads and reloads evidence at %s width', async (label, width, height) => {
  const page = await browser.newPage({ viewport: { width, height } }); const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.method() + ' ' + request.url()); });
  await page.route('https://**/*', route => route.abort());
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.locator('.nav-tools > summary').click(); const nav = page.getByRole('button', { name: 'Benchmark', exact: true }); await nav.focus(); await nav.press('Enter');
    await page.getByRole('heading', { name: 'Timing and usage', exact: true }).waitFor();
    expect(await page.getByRole('combobox', { name: 'Comparison axis' }).evaluate(el => el === document.activeElement)).toBe(true);
    await page.getByRole('heading', { name: 'More runs needed for comparison', exact: true }).waitFor();
    expect(await page.locator('#benchmark-result').innerText()).not.toMatch(/\bnull\b/);
    await page.getByText('What is missing for a fair comparison', { exact: true }).click(); expect(await page.getByText('Some charges are unpriced, unreconciled or unknown.', { exact: true }).isVisible()).toBe(true);
    await page.screenshot({ path: join(captures, label + '-runner-viewport.png'), animations: 'disabled' });
    await page.getByText('All admissions (5)', { exact: true }).click();
    expect(await page.getByText('finalized · Assertion failed', { exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(captures, label + '-runner.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('heading', { name: 'Timing and usage', exact: true }).click();
    for (const key of ['r', 'R', 'h']) await page.keyboard.press(key);
    await page.getByRole('combobox', { name: 'Comparison axis' }).selectOption('model');
    await page.getByText('Observed model identity or recorded inference is missing.', { exact: true }).waitFor();
    expect(new URL(page.url()).searchParams.get('benchmark-axis')).toBe('model');
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download captured JSON', exact: true }).click();
    const download = await downloading, path = join(captures, label + '-captured.json'); await download.saveAs(path);
    expect(BenchmarkReport.parse(JSON.parse(readFileSync(path, 'utf8')))).toEqual(report('model'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('What is missing for a fair comparison', { exact: true }).click();
    await page.getByText('Observed model identity or recorded inference is missing.', { exact: true }).waitFor();
    expect(await page.getByRole('combobox', { name: 'Comparison axis' }).inputValue()).toBe('model');
    await page.screenshot({ path: join(captures, label + '-model.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    expect(new URL(page.url()).searchParams.has('benchmark-axis')).toBe(false);
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  } finally { await page.close(); }
}, 40000);

it('clears old evidence after connection failure, retries, and exposes corruption without relabeling it passed', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } }); await page.route('https://**/*', route => route.abort());
  const campaign = join(stateDir(), 'executions', f.failed.executionId!, 'campaign.json'), original = readFileSync(campaign);
  try {
    await page.goto(new URL('?benchmark-axis=runner', server.url).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'More runs needed for comparison', exact: true }).waitFor();
    await page.route('**/api/benchmark?*', route => route.abort());
    await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
    await page.getByRole('heading', { name: 'Benchmark evidence unavailable', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Download captured JSON', exact: true }).isEnabled()).toBe(false);
    expect(await page.getByRole('heading', { name: 'More runs needed for comparison', exact: true }).count()).toBe(0);
    await page.screenshot({ path: join(captures, 'mobile-disconnected.png'), fullPage: true, animations: 'disabled' });
    await page.unroute('**/api/benchmark?*');
    writeFileSync(campaign, '{}');
    await page.getByRole('button', { name: 'Retry benchmark evidence', exact: true }).click();
    if(!await page.getByText('Some admissions have incomplete or unavailable evidence.', { exact: true }).isVisible()) await page.getByText('What is missing for a fair comparison', { exact: true }).click(); await page.getByText('Some admissions have incomplete or unavailable evidence.', { exact: true }).waitFor();
    await page.getByText('All admissions (5)', { exact: true }).click();
    expect(await page.getByText('bundle invalid · No terminal outcome retained', { exact: true }).isVisible()).toBe(true);
    await page.screenshot({ path: join(captures, 'mobile-corrupt-admission.png'), fullPage: true, animations: 'disabled' });
  } finally { writeFileSync(campaign, original); await page.close(); }
}, 40000);

it('ignores a late old-axis response after the selection changes', async () => {
  const page = await browser.newPage(); await page.route('https://**/*', route => route.abort());
  let release!: () => void, began!: () => void; const hold = new Promise<void>(r => release = r), started = new Promise<void>(r => began = r);
  await page.route('**/api/benchmark?axis=runner', async route => { began(); await hold; await route.fulfill({ json: report() }); });
  try {
    await page.goto(new URL('?benchmark-axis=runner', server.url).href, { waitUntil: 'domcontentloaded' }); await started;
    await page.getByRole('combobox', { name: 'Comparison axis' }).selectOption('model');
    await page.getByText('What is missing for a fair comparison', { exact: true }).click();
    await page.getByText('Observed model identity or recorded inference is missing.', { exact: true }).waitFor();
    release(); await page.unroute('**/api/benchmark?axis=runner');
    expect(await page.getByRole('combobox', { name: 'Comparison axis' }).inputValue()).toBe('model');
    expect(new URL(page.url()).searchParams.get('benchmark-axis')).toBe('model');
    expect(await page.getByText('Observed model identity or recorded inference is missing.', { exact: true }).isVisible()).toBe(true);
  } finally { release(); await page.close(); }
});

it('renders a missing checkpoint as unavailable evidence without creating execution state', async () => {
  const held = stateDir() + '.held'; renameSync(stateDir(), held);
  const page = await browser.newPage(); await page.route('https://**/*', route => route.abort());
  try {
    await page.goto(new URL('?benchmark-axis=runner', server.url).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Run records unavailable', exact: true }).waitFor();
    expect(await page.getByText('Admission counts are unavailable until the checkpoint can be read.', { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText('All admissions (0)', { exact: true }).count()).toBe(0);
    expect((await fetch(url())).status).toBe(200);
    await page.screenshot({ path: join(captures, 'unavailable-checkpoint.png'), fullPage: true, animations: 'disabled' });
  } finally { await page.close(); renameSync(held, stateDir()); }
});

it('distinguishes a readable empty ledger from an unavailable checkpoint', async () => {
  const sample = sampleCopy(), emptyState = join(sample.root, '.tracegrove/state');
  mkdirSync(join(emptyState, 'ledger'), { recursive: true }); writeFileSync(join(emptyState, 'ledger/journal.jsonl'), '');
  const emptyServer = await startUi({ dir: sample.root });
  const page = await browser.newPage(); await page.route('https://**/*', route => route.abort());
  try {
    await page.goto(new URL('?benchmark-axis=runner', emptyServer.url).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'No runs recorded yet', exact: true }).waitFor();
    expect(await page.getByText('This readable checkpoint contains no execution admissions. Importing a native report does not create execution usage.', { exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole('heading', { name: 'Run records unavailable', exact: true }).count()).toBe(0);
    await page.screenshot({ path: join(captures, 'empty-readable-checkpoint.png'), fullPage: true, animations: 'disabled' });
  } finally { await page.close(); await emptyServer.close(); }
});

it('rejects wrong-axis and malformed responses without keeping earlier evidence or download access', async () => {
  const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**/*', route => route.abort());
  try {
    for (const value of [report('model'), { schemaVersion: 'unrecognized' },
      { schemaVersion: 'tracegrove.benchmark/v1', axis: 'runner', operation: 'read_only' }]) {
      await page.route('**/api/benchmark?*', route => route.fulfill({ json: value }));
      await page.goto(new URL('?benchmark-axis=runner', server.url).href, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Benchmark evidence unavailable', exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Download captured JSON', exact: true }).isEnabled()).toBe(false);
      expect(await page.getByText('All admissions (5)', { exact: true }).count()).toBe(0);
      await page.unroute('**/api/benchmark?*');
    }
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

it('keeps recorded provider labels as text rather than interpreting HTML', async () => {
  const page = await browser.newPage(); await page.route('https://**/*', route => route.abort());
  const value = report(); value.axis = 'model';
  const text = '<img data-benchmark-injected src="/injected" onerror="alert(1)">';
  value.groups[0]!.cohorts[0]!.observedModel = text;
  await page.route('**/api/benchmark?*', route => route.fulfill({ json: BenchmarkReport.parse(value) }));
  try {
    await page.goto(new URL('?benchmark-axis=model', server.url).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: text, exact: true }).waitFor();
    expect(await page.locator('img[data-benchmark-injected]').count()).toBe(0);
  } finally { await page.close(); }
});
