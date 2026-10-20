import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';
import { comparisonRunsFixture } from './fixtures/comparisonRuns.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { compareSavedRuns } from '../src/authoring/runComparison.ts';
import { VerifiedBundleSnapshot } from '../src/core/bundle.ts';
import { ReplayComparison } from '../src/protocol/index.ts';

let f: Awaited<ReturnType<typeof comparisonRunsFixture>>, server: UiServer, browser: Browser, captures: string;
const name = (report: { runDir: string }) => basename(report.runDir);
const pair = () => ({ baseline: name(f.passed), candidate: name(f.failed) });
const url = (values: Record<string, string>) => new URL('api/compare?' + new URLSearchParams(values), server.url);
const deepLink = () => new URL('?' + new URLSearchParams({ 'compare-baseline': name(f.passed), 'compare-candidate': name(f.failed) }), server.url).href;
beforeAll(async () => {
  f = await comparisonRunsFixture(); server = await startUi({ dir: f.root }); browser = await chromium.launch({ headless: true });
  mkdirSync(join(process.cwd(), 'artifacts/qa'), { recursive: true }); captures = mkdtempSync(join(process.cwd(), 'artifacts/qa/comparison-workbench-'));
}, 60000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await browser?.close(); await server?.close(); cleanupTemps(); });

it('returns actual verified failure facts despite forged summaries and does not require current configuration', async () => {
  const metadata = join(f.failed.runDir, 'summary.json'); const before = readFileSync(metadata); const config = readFileSync(f.configPath);
  const journalPath = join(f.failed.stateDir!, 'ledger/journal.jsonl'); const journal = readFileSync(journalPath);
  try {
    writeFileSync(metadata, JSON.stringify({ outcome: 'passed', totals: { passed: 999 } })); writeFileSync(f.configPath, 'invalid: [');
    const response = await fetch(url(pair())); expect(response.status).toBe(200);
    const report = ReplayComparison.parse(await response.json());
    expect(report.rows[0]).toMatchObject({ change: 'passed_to_failed', candidate: [{ outcome: 'assertion_failed' }] });
    expect(report.candidate.manifestDigest).toEqual(compareSavedRuns(f.root, pair()).candidate.manifestDigest);
    expect(readFileSync(metadata)).toEqual(Buffer.from(JSON.stringify({ outcome: 'passed', totals: { passed: 999 } })));
    expect(readFileSync(journalPath)).toEqual(journal);
  } finally { writeFileSync(metadata, before); writeFileSync(f.configPath, config); }
});

it('rejects traversal, aliases, duplicate/extra query fields and linked run directories', async () => {
  const open = vi.spyOn(VerifiedBundleSnapshot, 'open');
  for (const values of [{ baseline: '../outside', candidate: name(f.failed) }, { baseline: 'latest', candidate: name(f.failed) },
    { ...pair(), actor: 'override' }]) expect((await fetch(url(values))).status).toBe(400);
  expect((await fetch(new URL(url(pair()).href + '&baseline=' + name(f.edited)))).status).toBe(400);
  expect(open).not.toHaveBeenCalled();
  symlinkSync(f.passed.runDir, join(f.root, '.tracegrove/runs/linked'));
  expect((await fetch(url({ baseline: 'linked', candidate: name(f.failed) }))).status).toBe(409);
});

it.each([['desktop', 1440, 1000], ['mobile', 375, 900]] as const)('compares, swaps, inspects and reloads recorded runs at %s width', async (label, width, height) => {
  const page = await browser.newPage({ viewport: { width, height } }); const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.method() === 'POST') writes.push(request.url()); });
  await page.route('https://**/*', route => route.abort());
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('button', { name: 'Compare', exact: true }); await nav.focus(); await nav.press('Enter');
    await page.getByRole('heading', { name: 'Compare retained runs', exact: true }).waitFor();
    expect(await page.getByRole('combobox', { name: 'Baseline run' }).evaluate(el => el === document.activeElement)).toBe(true);
    await page.getByRole('combobox', { name: 'Baseline run' }).selectOption(name(f.passed));
    await page.getByRole('combobox', { name: 'Candidate run' }).selectOption(name(f.failed));
    await page.getByRole('button', { name: 'Compare runs', exact: true }).click();
    await page.getByText('Passed → assertion failed', { exact: true }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(captures, label + '-comparison.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Swap runs', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Compare runs', exact: true }).click();
    await page.getByText('Assertion failed → passed', { exact: true }).waitFor();
    expect(new URL(page.url()).searchParams.get('compare-baseline')).toBe(name(f.failed));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('Assertion failed → passed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Inspect baseline', exact: true }).click();
    await page.getByRole('complementary', { name: 'Step detail' }).getByText('Status 200', { exact: true }).waitFor();
    expect(await page.getByRole('complementary', { name: 'Step detail' }).textContent()).toContain('299');
    expect(new URL(page.url()).searchParams.has('compare-baseline')).toBe(false);
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByText('Assertion failed → passed', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Candidate run' }).selectOption(name(f.edited));
    await page.getByRole('button', { name: 'Compare runs', exact: true }).click(); await page.getByText('Contract changed', { exact: true }).waitFor();
    expect(await page.getByText('Assertion failed → passed', { exact: true }).count()).toBe(0);
    await page.screenshot({ path: join(captures, label + '-changed-contract.png'), fullPage: true, animations: 'disabled' });
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  } finally { await page.close(); }
}, 40000);

it('clears stale successful comparisons on corruption/reload and recovers after a connection failure', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } }); await page.route('https://**/*', route => route.abort());
  const campaignPath = join(f.failed.runDir, 'bundle/campaign.json'); const original = readFileSync(campaignPath);
  try {
    await page.goto(deepLink(), { waitUntil: 'domcontentloaded' }); await page.getByText('Passed → assertion failed', { exact: true }).waitFor();
    writeFileSync(campaignPath, '{}'); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Comparison unavailable', exact: true }).waitFor();
    expect(await page.getByRole('list', { name: 'Recorded selection differences' }).count()).toBe(0);
    await page.screenshot({ path: join(captures, 'mobile-unavailable.png'), fullPage: true, animations: 'disabled' });
    writeFileSync(campaignPath, original);
    await page.route('**/api/compare?**', route => route.abort('failed'));
    await page.getByRole('button', { name: 'Compare runs', exact: true }).click();
    await page.getByText('Check the local connection and try again.', { exact: true }).waitFor();
    expect(await page.getByText('Passed → assertion failed', { exact: true }).count()).toBe(0);
    await page.unroute('**/api/compare?**'); await page.getByRole('button', { name: 'Compare runs', exact: true }).click();
    await page.getByText('Passed → assertion failed', { exact: true }).waitFor();
  } finally { writeFileSync(campaignPath, original); await page.close(); }
});

it('ignores an older delayed response after a different pair has finished comparison', async () => {
  const page = await browser.newPage(); await page.route('https://**/*', route => route.abort());
  let held = false, release!: () => void, settled!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const done = new Promise<void>(resolve => { settled = resolve; });
  await page.route('**/api/compare?**', async route => {
    if (held) return route.continue(); held = true;
    try { const response = await route.fetch(); await gate; await route.fulfill({ response }); } finally { settled(); }
  });
  try {
    await page.goto(deepLink(), { waitUntil: 'domcontentloaded' }); await page.getByText('Checking both retained evidence bundles…', { exact: true }).waitFor();
    await page.screenshot({ path: join(captures, 'desktop-loading.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('combobox', { name: 'Baseline run' }).selectOption(name(f.failed));
    await page.getByRole('combobox', { name: 'Candidate run' }).selectOption(name(f.edited));
    await page.getByRole('button', { name: 'Compare runs', exact: true }).click(); await page.getByText('Contract changed', { exact: true }).waitFor();
    const delivered = page.waitForResponse(response => new URL(response.url()).searchParams.get('baseline') === name(f.passed));
    release(); await done; await (await delivered).finished();
    // Let the delivered response settle before asserting the visible result.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.getByText('Contract changed', { exact: true }).count()).toBe(1);
    expect(await page.getByText('Passed → assertion failed', { exact: true }).count()).toBe(0);
  } finally { release(); if (held) await done; await page.close(); }
});

it('has an accessible empty state and exposes comparison in the keyboard command palette', async () => {
  const sample = sampleCopy(); const empty = await startUi({ dir: sample.root }); const page = await browser.newPage();
  await page.route('https://**/*', route => route.abort());
  try {
    await page.goto(empty.url, { waitUntil: 'domcontentloaded' }); await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' }); await dialog.getByRole('combobox').fill('Open Compare');
    await dialog.getByRole('combobox').press('Enter'); await page.getByRole('heading', { name: 'Two retained runs are needed', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Compare runs', exact: true }).count()).toBe(0);
    await page.screenshot({ path: join(captures, 'desktop-empty.png'), fullPage: true, animations: 'disabled' });
  } finally { await page.close(); await empty.close(); }
});
