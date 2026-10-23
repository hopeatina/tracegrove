import { afterAll, beforeAll, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page, type Route } from 'playwright';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { runTests } from '../src/authoring/run.ts';

let root: string, server: UiServer, browser: Browser;
const errors: string[] = [];
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'tracegrove-navigation-'));
  cpSync(join(import.meta.dirname, '../src/samples/voice-receptionist'), root, { recursive: true });
  const result = await runTests({ configPath: join(root, 'tracegrove.config.yaml') });
  expect(result.report.outcome).toBe('passed');
  server = await startUi({ dir: root, example: 'voice-receptionist' });
  browser = await chromium.launch({ headless: true });
}, 60000);
afterAll(async () => { await browser?.close(); await server?.close(); if (root) rmSync(root, { recursive: true, force: true }); expect(errors).toEqual([]); });
async function pageFor(view = 'Run', width = 1440): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**/*', route => route.abort());
  await page.goto(server.url + '?view=' + view);
  await page.locator('nav button').first().waitFor();
  return page;
}
it.each([1440, 375])('keeps every page reachable without a navigation wall or overflow at %s px', async width => {
  const page = await pageFor('Run', width);
  try {
    expect(await page.locator('nav > button').allTextContents()).toEqual(['Run', 'Discover', 'Readiness', 'History']);
    for (const name of ['Heal', 'Compare', 'Imports', 'Map', 'Benchmark', 'Environments', 'Settings']) {
      await page.locator('.nav-tools > summary').click();
      await page.getByRole('button', { name, exact: true }).first().click();
      expect(new URL(page.url()).searchParams.get('view')).toBe(name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.reload();
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await page.goBack();
    await page.getByRole('heading', { name: 'Where your tests run.', exact: true }).waitFor();
  } finally { await page.close(); }
});
it('opens the recorded scenario and a real step from readiness', async () => {
  const page = await pageFor('Readiness');
  try {
    await page.getByRole('button', { name: 'Open scenario', exact: true }).first().click();
    await page.getByRole('complementary', { name: 'Step detail' }).waitFor();
    expect(await page.getByRole('complementary', { name: 'Step detail' }).textContent()).not.toContain('No steps.');
    expect(await page.locator('[data-step][aria-pressed=true]').count()).toBe(1);
  } finally { await page.close(); }
});
it('serves the shared bonsai favicon and supports keyboard selection on tree branches', async () => {
  const icon = await fetch(new URL('favicon.svg', server.url));
  expect(icon.status).toBe(200); expect(icon.headers.get('content-type')).toBe('image/svg+xml');
  expect(await icon.text()).toContain('brand-leaf');
  const page = await pageFor();
  try {
    expect(await page.locator('link[rel=icon]').getAttribute('href')).toBe('/favicon.svg');
    const branch = page.getByRole('button', { name: 'calls.books-a-cleaning · held', exact: true });
    await branch.focus(); await branch.press('Enter');
    expect(await branch.getAttribute('aria-pressed')).toBe('true');
    expect(await branch.evaluate(el => el === document.activeElement)).toBe(true);
    expect(await page.locator('.grove [data-leaf]').count()).toBe(10);
    expect(await page.getByRole('complementary', { name: 'Step detail' }).textContent()).toContain('calls.books-a-cleaning');
  } finally { await page.close(); }
});
it('keeps dense recorded-tree geometry finite and inside its scene', async () => {
  const page = await pageFor();
  try {
    const result = await page.evaluate(() => {
      const cases = Array.from({ length: 12 }, (_, i) => ({ id: 'scenario.' + i, title: 'Scenario ' + i, state: i % 3 ? 'pass' : 'fail', requests: [], steps: Array.from({ length: [1, 6, 24, 48][i % 4]! }, (_, j) => ({ id: 'step_' + i + '_' + j, result: j % 5 ? 'pass' : 'fail', name: 'Step ' + j, method: 'GET', path: '/api/' + i })) }));
      const svg = (window as unknown as { grove(cases: unknown[]): SVGSVGElement }).grove(cases);
      document.body.append(svg); const box = svg.viewBox.baseVal;
      const pads = Array.from(svg.querySelectorAll('[data-pad]')).map(el => (el as SVGGraphicsElement).getBBox());
      const result = { leaves: svg.querySelectorAll('[data-leaf]').length, expected: cases.reduce((sum, c) => sum + c.steps.length, 0), invalid: Array.from(svg.querySelectorAll('path')).some(el => /NaN|Infinity|undefined/.test(el.getAttribute('d') || '')), contained: pads.every(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= box.width && r.y + r.height <= box.height) };
      svg.remove(); return result;
    });
    expect(result.leaves).toBe(result.expected); expect(result.invalid).toBe(false); expect(result.contained).toBe(true);
  } finally { await page.close(); }
});
it('keeps each review disclosure independent across a refresh', async () => {
  const page = await pageFor('Readiness');
  try {
    await page.getByText('3 ready for handoff', { exact: true }).click();
    await page.getByText('Evidence and review options', { exact: true }).nth(1).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Accept', exact: true }).waitFor();
    expect(await page.locator('article details').evaluateAll(nodes => nodes.map(node => node.hasAttribute('open')))).toEqual([false, true, false, false]);
  } finally { await page.close(); }
});
it('identifies a bundled example without inheriting enclosing repository branches', async () => {
  const overview = await (await fetch(new URL('api/overview', server.url))).json();
  expect(overview.example).toBe('voice-receptionist'); expect(overview.git.isRepo).toBe(false); expect(overview.git.branches).toEqual([]);
  const page = await pageFor('Discover');
  try {
    await page.getByRole('heading', { name: 'A small example. A real result.' }).waitFor();
    expect(await page.getByTestId('grow-go').count()).toBe(0);
    await page.getByRole('button', { name: 'Explore this run' }).click();
    await page.getByRole('heading', { name: 'Every scenario held on this run.' }).waitFor();
  } finally { await page.close(); }
});
it('connects passing runs to outstanding review and retains evidence during refresh', async () => {
  const page = await pageFor();
  try {
    await page.getByRole('button', { name: '1 awaiting sign-off', exact: true }).click();
    await page.getByText(/Checks passed · ran .* · evidence current/).first().waitFor();
    let pending: Route | undefined;
    const received = new Promise<void>(resolve => {
      void page.route('**/api/readiness', route => { pending = route; resolve(); });
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await received;
    expect(await page.getByText(/Checks passed · ran .* · evidence current/).first().isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Accept', exact: true }).isDisabled()).toBe(true);
    await pending!.continue();
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Accept', exact: true }).isEnabled()).toBe(true);
  } finally { await page.close(); }
});
it('brings selected phone step evidence into view and returns to the selected step', async () => {
  const page = await pageFor('Run', 375);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const step = page.locator('[data-step]').nth(1); await step.click();
    const detail = page.getByRole('complementary', { name: 'Step detail' });
    expect(await detail.locator('h2').evaluate(el => el === document.activeElement)).toBe(true);
    expect(await detail.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })).toBe(true);
    await page.getByRole('button', { name: 'Back to steps', exact: true }).click();
    expect(await page.locator('[data-step][aria-pressed=true]').evaluate(el => el === document.activeElement)).toBe(true);
  } finally { await page.close(); }
});
it('keeps a review reason and a failed save visible, then returns focus on cancel', async () => {
  const page = await pageFor('Readiness', 375);
  try {
    await page.getByText('Evidence and review options', { exact: true }).first().click();
    const launch = page.getByRole('button', { name: 'Challenge check', exact: true }).first(); await launch.click();
    const reason = page.getByLabel('What is wrong with this check?', { exact: true });
    expect(await reason.evaluate(el => el === document.activeElement)).toBe(true);
    const record = page.getByRole('button', { name: 'Record challenge', exact: true });
    expect(await record.isDisabled()).toBe(true);
    await reason.fill('The check needs to cover cancellation by name.');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    expect(await reason.inputValue()).toBe('The check needs to cover cancellation by name.');
    await page.route('**/api/decide', route => route.fulfill({ status: 503, json: { error: 'Review store unavailable' } }));
    await record.click(); await page.getByText('Review store unavailable', { exact: true }).waitFor();
    expect(await reason.inputValue()).toBe('The check needs to cover cancellation by name.');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await launch.evaluate(el => el === document.activeElement)).toBe(true);
    expect(await reason.count()).toBe(0);
  } finally { await page.close(); }
});
it('distinguishes changed checks, missing evidence and waivers from sign-off', async () => {
  const page = await pageFor('Readiness');
  try {
    await page.route('**/api/readiness', async route => {
      const response = await route.fetch(); const report = await response.json();
      const pending = report.claims.find((c: { ready: boolean }) => !c.ready);
      pending.validity = 'superseded'; pending.next = { why: 'the check changed since its last run' };
      const waived = report.claims.find((c: { ready: boolean }) => c.ready);
      waived.decision = 'waived'; waived.reason = 'Approved temporary exception';
      await route.fulfill({ json: report });
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByText(/out of date since the check changed/).waitFor();
    expect(await page.getByText('Needs sign-off', { exact: true }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Accept', exact: true }).count()).toBe(0);
    await page.getByText('3 ready for handoff', { exact: true }).click();
    await page.getByText('Waived', { exact: true }).waitFor();
    await page.getByText('Waiver: Approved temporary exception', { exact: true }).waitFor();
  } finally { await page.close(); }
});
it('preserves typing focus and selection when a background review update completes', async () => {
  const page = await pageFor('Readiness');
  try {
    await page.getByText('Evidence and review options', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Challenge check', exact: true }).first().click();
    const reason = page.getByLabel('What is wrong with this check?', { exact: true }); await reason.fill('Keep the cursor here');
    let pending: Route | undefined;
    const received = new Promise<void>(resolve => { void page.route('**/api/readiness', route => { pending = route; resolve(); }); });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await received;
    expect(await reason.isEnabled()).toBe(true);
    await reason.press('Home'); await reason.press('ArrowRight');
    const selection = await reason.evaluate(el => (el as HTMLTextAreaElement).selectionStart);
    await pending!.continue(); await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    expect(await reason.evaluate(el => el === document.activeElement)).toBe(true);
    expect(await reason.evaluate(el => (el as HTMLTextAreaElement).selectionStart)).toBe(selection);
  } finally { await page.close(); }
});
it('preserves another row draft and scopes errors to the decision that failed', async () => {
  const page = await pageFor('Readiness');
  try {
    await page.route('**/api/readiness', async route => {
      const response = await route.fetch(); const report = await response.json();
      const second = report.claims.find((c: { ready: boolean }) => c.ready); second.ready = false; second.decision = 'pending';
      await route.fulfill({ json: report });
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Accept', exact: true }).nth(1).waitFor();
    await page.getByText('Evidence and review options', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Challenge check', exact: true }).first().click();
    const reason = page.getByLabel('What is wrong with this check?', { exact: true }); await reason.fill('Keep this independent draft');
    await page.route('**/api/decide', route => route.fulfill({ status: 503, json: { error: 'Second row failed to save' } }));
    await page.getByRole('button', { name: 'Accept', exact: true }).nth(1).click();
    await page.getByText('Second row failed to save', { exact: true }).waitFor();
    expect(await page.locator('.review-form').getByText('Second row failed to save', { exact: true }).count()).toBe(0);
    expect(await reason.inputValue()).toBe('Keep this independent draft');
    await page.unroute('**/api/decide');
    await page.route('**/api/decide', route => route.fulfill({ json: { decision: 'accepted' } }));
    await page.getByRole('button', { name: 'Accept', exact: true }).nth(1).click();
    await page.getByText(/Recorded: accepted/).waitFor();
    expect(await reason.inputValue()).toBe('Keep this independent draft');
  } finally { await page.close(); }
});
it('describes a waived handoff without claiming its evidence is complete', async () => {
  const page = await pageFor('Readiness');
  try {
    await page.route('**/api/readiness', async route => {
      const response = await route.fetch(); const report = await response.json();
      for (const c of report.claims) if (!c.ready) { c.ready = true; c.decision = 'waived'; c.reason = 'Temporary exception'; }
      report.ready = true; report.counts.waived = 1;
      await route.fulfill({ json: report });
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('heading', { name: 'Ready for handoff, with 1 waived.', exact: true }).waitFor();
    expect(await page.getByText('The recorded evidence and required sign-offs are complete.', { exact: true }).count()).toBe(0);
  } finally { await page.close(); }
});
it('contains a late scan failure to Discover and offers a working retry', async () => {
  const page = await pageFor();
  let pending: Route | undefined;
  const received = new Promise<void>(resolve => {
    void page.route('**/api/discover?*', route => { pending = route; resolve(); });
  });
  try {
    await page.getByRole('button', { name: 'Discover', exact: true }).click(); await received;
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await pending!.fulfill({ status: 503, json: { error: 'Temporary route scan outage' } });
    await page.getByRole('heading', { name: '1 run of the grove' }).waitFor();
    expect(new URL(page.url()).searchParams.get('view')).toBe('History');
    await page.getByRole('button', { name: 'Discover', exact: true }).click();
    await page.getByText('Explore routes and existing tests', { exact: true }).click();
    await page.getByText('Routes could not be loaded.', { exact: true }).waitFor();
    await page.unroute('**/api/discover?*');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByTestId('route-summary').waitFor();
    expect(await page.locator('details').filter({ has: page.getByText('Explore routes and existing tests', { exact: true }) }).getAttribute('open')).not.toBeNull();
  } finally { await page.close(); }
});
it('restores palette focus and gives a clear empty search state', async () => {
  const page = await pageFor();
  try {
    const launch = page.getByRole('button', { name: 'Open the command palette' }); await launch.click();
    const input = page.getByRole('combobox', { name: 'Command', exact: true }); await input.fill('not-a-real-command-zzzz');
    await page.getByText('No matching command. Try a page or scenario name.').waitFor();
    await input.press('Tab');
    expect(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); expect(await launch.evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press('?');const close=page.getByRole('button',{name:'Close shortcuts',exact:true});await close.waitFor();expect(await close.evaluate(el=>el===document.activeElement)).toBe(true);await page.keyboard.press('Shift+Tab');expect(await close.evaluate(el=>el===document.activeElement)).toBe(true);await page.keyboard.press('Escape');expect(await launch.evaluate(el=>el===document.activeElement)).toBe(true);
  } finally { await page.close(); }
});
it('makes the no-run journey state actionable', async () => {
  const empty = join(root, 'empty-project'); mkdirSync(empty); const fresh = await startUi({ dir: empty });
  const page = await browser.newPage();
  try {
    await page.goto(fresh.url + '?view=Map'); await page.getByRole('button', { name: 'Go to Run', exact: true }).click();
    await page.getByRole('button', { name: 'Initialize', exact: true }).waitFor();
  } finally { await page.close(); await fresh.close(); }
});
