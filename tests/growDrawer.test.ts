import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { checksOf } from '../src/authoring/checkCompare.ts';
import { grow } from '../src/authoring/grow.ts';
import { happenedIn } from '../src/authoring/happened.ts';
import type { GrowState } from '../src/authoring/growState.ts';
import type { PredicateT } from '../src/protocol/index.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';

/* What a recorded check compared, each comparison with whether it held, worded as the verdict words a failure. */
describe('Every comparison a check made', () => {
  const http = { method: 'POST', path: '/seats' };
  it('says each comparison of a check that held', () => {
    const p: PredicateT = { kind: 'all', predicates: [{ kind: 'status_equals', value: 200 }, { kind: 'json_path_equals', path: 'body.charged', value: 0 }] };
    expect(checksOf(p, { result: 'pass', reasonCode: null, actual: [200, 0] }, http)).toEqual([
      { check: 'status', expected: 200, got: 200, held: true, says: 'Expected status 200, got 200' },
      { check: 'body.charged', expected: 0, got: 0, held: true, says: 'Expected body.charged 0, got 0' }]);
  });
  it('marks the comparison the reducer recorded as broken, and keeps the ones that held', () => {
    const p: PredicateT = { kind: 'all', predicates: [{ kind: 'status_equals', value: 200 }, { kind: 'json_path_equals', path: 'body.count', value: 0 }] };
    expect(checksOf(p, { result: 'fail', reasonCode: 'body.count differs', actual: [200, 1] }, http).map((c) => [c.held, c.says]))
      .toEqual([[true, 'Expected status 200, got 200'], [false, 'Expected body.count 0, got 1']]);
  });
  it('never says a comparison held when its record cannot tell', () => {
    const p: PredicateT = { kind: 'all', predicates: [{ kind: 'json_path_equals', path: 'body.plan', value: 'team' }, { kind: 'status_equals', value: 200 }] };
    const out = checksOf(p, { result: 'fail', reasonCode: 'status 500 != 200', actual: [null, 500] }, http);
    expect(out.map((c) => c.held)).toEqual([null, false]);
    expect(out[1]!.says).toBe('Expected status 200, got 500');
  });
  it('counts a stand-in’s calls in the route’s own word', () => {
    const p: PredicateT = { kind: 'json_path_equals', path: 'body.count', value: 2 };
    expect(checksOf(p, { result: 'fail', reasonCode: 'body.count differs', actual: 3 }, { method: 'STANDIN', path: 'payments POST /v1/charges' }))
      .toEqual([{ check: 'payments POST /v1/charges call count', expected: 2, got: 3, held: false, says: 'Expected 2 charges, got 3' }]);
  });
  it('has nothing to say for a check the run never evaluated', () => {
    expect(checksOf({ kind: 'status_equals', value: 200 }, { result: 'not_evaluated', reasonCode: null, actual: null }, http)).toEqual([]);
  });
});

/* The plotline billing sample on main, and its seats branch (tests/fixtures/plotline-seats.patch): removing a seat charges the
   card a second 900, so "only the Team upgrade and the added seat were charged" expects 2 payments charges and gets 3. */
const temps: string[] = [];
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'pipe' }).toString();
function plotlineSeats(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-drawer-')); temps.push(dir);
  cpSync(join(import.meta.dirname, '..', 'src', 'samples', 'saas-billing'), dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Plotline billing');
  git(dir, 'checkout', '-qb', 'seats');
  git(dir, 'am', '-q', '--committer-date-is-author-date', join(import.meta.dirname, 'fixtures', 'plotline-seats.patch'));
  return dir;
}
const TOKEN = 'tk-0123456789abcdef';

describe('What happened, step by step', () => {
  let dir = '', state: GrowState, server: UiServer, browser: Browser;
  let failed = '', passed = '', none = '', failRun = '';
  const errors: string[] = [];
  beforeAll(async () => {
    dir = plotlineSeats();
    ({ state } = await grow({ dir, branch: 'seats', base: 'main', mode: 'min', prove: true, gh: false, agent: { off: true } }));
    failed = state.scenarios.find((x) => state.run[x.id]?.st === 'fail')!.id;
    passed = state.scenarios.find((x) => state.run[x.id]?.st === 'pass')!.id;
    none = state.scenarios.find((x) => state.run[x.id]?.st === 'not_run' && !x.flow)!.id;
    failRun = state.run[failed]!.run!;
    server = await startUi({ dir, branch: 'seats', port: 0, token: TOKEN });
    browser = await chromium.launch({ headless: true });
  }, 180_000);
  afterAll(async () => { await browser?.close(); await server?.close(); for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); expect(errors).toEqual([]); });

  async function open(hash = '', width = 1440): Promise<Page> {
    const phone = width < 500;
    const page = await browser.newPage({ viewport: { width, height: phone ? 844 : 1000 }, isMobile: phone, hasTouch: phone });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url + hash);
    await page.getByTestId('grow-result').waitFor();
    return page;
  }
  const drawer = (page: Page) => page.getByTestId('grow-happened');
  const opened = async (page: Page) => { await page.getByTestId('grow-happened-oneline').or(page.getByTestId('grow-happened-none')).waitFor(); return drawer(page); };

  it('reads the failing run from its verified bundle, each stand-in call on the step its own timestamp falls in', () => {
    expect(state.run[failed]).toMatchObject({ st: 'fail', flow: 'seats.remove-seat' });
    const d = happenedIn(dir, failRun, 'seats.remove-seat')!;
    expect(d).toMatchObject({ run: failRun, verified: true, caseId: 'seats.remove-seat', at: 3, contradicts: { at: 2, field: 'charged' } });
    expect(d.steps.map((x) => x.name)).toEqual(['owner moves to Team', 'owner adds a seat', 'owner removes it again', 'only the Team upgrade and the added seat were charged']);
    expect(d.steps[3]!.checked).toEqual([{ check: 'payments POST /v1/charges call count', expected: 2, got: 3, held: false, says: 'Expected 2 charges, got 3' }]);
    expect(d.steps[2]!.answer).toBe('{"seats":1,"charged":0}');
    // every call is placed by its own timestamp, inside the recorded start and finish of the step it names
    const calls = d.steps[3]!.calls!;
    expect(calls.map((c) => [c.amount, c.during])).toEqual([[4900, 'owner_moves_to_team'], [900, 'owner_adds_a_seat'], [900, 'owner_removes_it_again']]);
    for (const c of calls) {
      const s = d.steps.find((x) => x.id === c.during)!, at = Date.parse(c.at);
      expect(at).toBeGreaterThanOrEqual(Date.parse(s.startedAt!)); expect(at).toBeLessThanOrEqual(Date.parse(s.finishedAt!));
    }
    expect(calls.every((c) => c.key && c.repeat === false)).toBe(true);
    expect(d.steps[3]!.watch).toMatchObject({ deadlineMs: 5000, everyMs: 50 });
    expect(d.oneLine).toBe('Step 3 (owner removes it again) answered charged 0, yet payments got a 900 charge during step 3, under a new idempotency key.');
    // the services as recorded: never "all real", and a stand-in no step watched says its calls were not recorded
    expect(d.chips.map((c) => c.t)).toEqual([`run ${failRun}`, `verified · source ${d.source}`, 'application real', 'storage real', 'payments stand-in', 'email stand-in · calls not recorded']);
    expect(d.source).toMatch(/^[0-9a-f]{6}$/);
    expect(d.foot).toEqual(['No step watched email, so its calls are not recorded (only a watch step records a stand-in’s calls).', 'No step drives a screen, so there are no screenshots, video or transcript.']);
    expect(d.history).toEqual({ saved: 1, passed: 0, lastPass: null });
  });

  it('serves it only with the session token, and only from runs saved inside the project’s .tracegrove folder', async () => {
    const url = (name: string, q = 'case=seats.remove-seat') => `http://127.0.0.1:${server.port}/api/runs/${name}/happened?${q}`;
    const get = (u: string, token: string | null = TOKEN) => fetch(u, { headers: token ? { 'x-tracegrove-token': token } : {} });
    expect((await get(url(failRun), null)).status).toBe(403);
    expect((await get(url(failRun), 'tk-not-the-session-token')).status).toBe(403);
    const ok = await get(url(failRun)); expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ run: failRun, at: 3 });
    expect((await fetch(url(failRun), { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
    for (const bad of ['..%2F..%2Fetc', '..%5C..%5Cetc', '.tracegrove', 'latest']) expect((await get(url(bad))).status, bad).toBe(400);
    // a ".." (encoded or not) is a dot segment to the URL itself, so the request never names a run at all
    for (const dots of ['..', '%2E%2E']) expect((await get(url(dots))).status, dots).toBe(404);
    expect((await get(url(failRun, 'case=seats.remove-seat&config=..%2F..%2Fetc%2Ftracegrove.config.yaml'))).status).toBe(400);
    expect((await get(url(failRun, 'case=seats.remove-seat&config=%2Fetc%2Ftracegrove.config.yaml'))).status).toBe(400);
    expect((await get(url('2026-01-01T00-00-00Z_fail_000000'))).status).toBe(404);
    // a run that is a link to a folder elsewhere is refused, not followed
    const outside = mkdtempSync(join(tmpdir(), 'tracegrove-drawer-outside-')); temps.push(outside);
    cpSync(join(dir, '.tracegrove', 'runs', failRun), join(outside, failRun), { recursive: true });
    symlinkSync(join(outside, failRun), join(dir, '.tracegrove', 'runs', '2026-01-01T00-00-01Z_fail_linked'));
    expect((await get(url('2026-01-01T00-00-01Z_fail_linked'))).status).toBe(404);
    expect(readdirSync(join(dir, '.tracegrove', 'runs'))).toContain('2026-01-01T00-00-01Z_fail_linked');
    rmSync(join(dir, '.tracegrove', 'runs', '2026-01-01T00-00-01Z_fail_linked'));
  });

  it('opens beside the tree on the step that broke, the panel wider and the tree still drawn and lit', async () => {
    const page = await open(`#grow/${failed}`);
    await page.locator(`.gw-insw [data-dr="${failed}"]`).click();
    const d = await opened(page);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('grow-happened-title');
    await expect(page.getByTestId('grow-happened-title').textContent()).resolves.toBe('Removing a seat never charges the card');
    const box = await page.evaluate(() => {
      const w = (0, eval)('gw'), ins = document.querySelector('.gw-insw')!.getBoundingClientRect(), svg = (w.svg as SVGSVGElement).getBoundingClientRect();
      return { ins: Math.round(ins.width), svg: svg.width > 200 && svg.right <= ins.left, pinned: w.pinned, lit: !!(w.svg as SVGSVGElement).querySelector('.pad.hl') };
    });
    expect(box.ins).toBeGreaterThanOrEqual(600); expect(box.ins).toBeLessThanOrEqual(660);
    expect(box).toMatchObject({ svg: true, pinned: `s:${failed}`, lit: true });
    await expect(page.getByTestId('grow-happened-step-4').getAttribute('aria-pressed')).resolves.toBe('true');
    const step = (n: number) => page.getByTestId(`grow-happened-step-${n}`).textContent();
    await expect(step(4)).resolves.toContain('Expected 2 charges, got 3');
    await expect(step(4)).resolves.toMatch(/waited \d+ ms of its 5000 ms deadline, polling every 50 ms \(not app time\)/);
    await expect(step(3)).resolves.toContain('answered {"seats":1,"charged":0}payments ← 900◀ contradicts its answer');
    await expect(step(2)).resolves.toContain('payments ← 900');
    await expect(step(1)).resolves.toContain('payments ← 4900');
    await expect(d.getByTestId('grow-happened-oneline').textContent()).resolves.toBe('In one lineStep 3 (owner removes it again) answered charged 0, yet payments got a 900 charge during step 3, under a new idempotency key.');
    const chips = await d.getByTestId('grow-happened-chips').locator('.gw-chip').allTextContents();
    expect(chips).toContain('payments stand-in'); expect(chips).toContain('email stand-in · calls not recorded');
    expect(chips.join(' ')).not.toMatch(/all real/);
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/steps/step-4`);
    await page.close();
  });

  it('shows its evidence in tabs that appear only with data, moved through with the arrow keys', async () => {
    const page = await open(`#grow/${failed}/steps`);
    const d = await opened(page);
    const tabs = d.getByRole('tab');
    await expect(tabs.allTextContents()).resolves.toEqual(['We checked 4', 'App answered 3', 'Called out 3', 'Requests 4']);
    const panel = () => d.getByTestId('grow-happened-panel').textContent();
    await expect(panel()).resolves.toContain('Expected 2 charges, got 3');
    await expect(panel()).resolves.toContain('Expected body.charged 0, got 0');
    await d.getByTestId('grow-happened-tab-checked').focus();
    const sel = () => page.evaluate(() => ({ focus: document.activeElement?.getAttribute('data-testid'), on: document.querySelector('[role=tab][aria-selected=true]')?.getAttribute('data-testid'), stops: Array.from(document.querySelectorAll('[role=tab]')).filter((t) => t.getAttribute('tabindex') === '0').length }));
    await page.keyboard.press('ArrowRight');
    await expect(sel()).resolves.toEqual({ focus: 'grow-happened-tab-answered', on: 'grow-happened-tab-answered', stops: 1 });
    await expect(panel()).resolves.toContain('"charged": 0');
    await page.keyboard.press('End');
    await expect(sel()).resolves.toEqual({ focus: 'grow-happened-tab-requests', on: 'grow-happened-tab-requests', stops: 1 });
    await expect(panel()).resolves.toContain('POST /seats {"seats":1,"daysLeft":30} · as owner');
    await page.keyboard.press('ArrowRight');
    await expect(sel()).resolves.toEqual({ focus: 'grow-happened-tab-checked', on: 'grow-happened-tab-checked', stops: 1 });
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await expect(sel()).resolves.toEqual({ focus: 'grow-happened-tab-called', on: 'grow-happened-tab-called', stops: 1 });
    const called = (await panel()) ?? '';
    expect(called.match(/payments POST \/v1\/charges · \d+ usd/g)).toEqual(['payments POST /v1/charges · 4900 usd', 'payments POST /v1/charges · 900 usd', 'payments POST /v1/charges · 900 usd']);
    expect(called.match(/idempotency key [0-9a-f-]{36}/g)).toHaveLength(3);
    // what was not recorded is said, and comparing with a pass is offered only when there was one
    await expect(d.getByTestId('grow-happened-foot').textContent()).resolves.toContain('No step drives a screen, so there are no screenshots, video or transcript.');
    await expect(d.getByTestId('grow-happened-compare').isDisabled()).resolves.toBe(true);
    await expect(d.getByTestId('grow-happened-why').textContent()).resolves.toBe('Compare with last pass: it never passed in its 1 saved run.');
    await page.close();
  });

  it('keeps its place in the address, comes back from it, and closes with Escape', async () => {
    const page = await open(`#grow/${failed}/steps/step-3`);
    const d = await opened(page);
    await expect(page.getByTestId('grow-happened-step-3').getAttribute('aria-pressed')).resolves.toBe('true');
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/steps/step-3`);
    await page.getByTestId('grow-happened-step-2').click();
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/steps/step-2`);
    await page.reload(); await page.getByTestId('grow-result').waitFor(); await opened(page);
    await expect(page.getByTestId('grow-happened-step-2').getAttribute('aria-pressed')).resolves.toBe('true');
    // (the pointer is moved off the tree first: a card it points at docks in the panel and takes its place)
    await page.mouse.move(1, 1);
    await page.getByTestId('grow-happened-step-2').focus();
    await page.keyboard.press('Escape');
    await expect(d.count()).resolves.toBe(0);
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}`);
    // the panel is back, with focus on the link that opens the drawer again
    await expect(page.getByTestId('grow-inspector').count()).resolves.toBe(1);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-dr'))).toBe(failed);
    await page.close();
  });

  it('opens the Run tab at that run and step, where the step lists what it checked and the calls it read', async () => {
    const page = await open(`#grow/${failed}/steps`);
    await opened(page);
    await page.getByTestId('grow-happened-runtab').click();
    await page.waitForFunction(() => (0, eval)('tab') === 'Run' && !!(0, eval)('ui').run);
    expect(await page.evaluate(() => { const ui = (0, eval)('ui'); return { run: ui.runName, sel: ui.sel, step: ui.step }; })).toEqual({ run: failRun, sel: 'seats.remove-seat', step: 3 });
    await expect(page.getByTestId('step-checked').textContent()).resolves.toBe('we checked✗ failedpayments POST /v1/charges call countExpected 2 charges, got 3');
    await expect(page.getByTestId('step-calls').locator('.call').count()).resolves.toBe(3);
    await page.close();
  });

  it('shows a passed scenario’s checks that held, and a scenario with no flow why it has none', async () => {
    const page = await open(`#grow/${passed}/steps`);
    const d = await opened(page);
    await expect(d.getByTestId('grow-happened-oneline').textContent()).resolves.toMatch(/^In one line(All \d+ checks held|Its 1 check held).*, in \d+ ms\.$/);
    const marks = await d.getByTestId('grow-happened-panel').locator('.ck .m').allTextContents();
    expect(marks.length).toBeGreaterThan(0); expect(marks.every((m) => m.startsWith('✓'))).toBe(true);
    await expect(d.getByTestId('grow-happened-compare').count()).resolves.toBe(0);
    await page.evaluate((id) => { location.hash = `#grow/${id}/steps`; }, none);
    await page.getByTestId('grow-happened-none').waitFor();
    await expect(page.getByTestId('grow-happened-none').textContent()).resolves.toBe('No flow proves this yet.Nothing has run, so there are no steps, checks or calls to show.');
    await expect(drawer(page).textContent()).resolves.toContain('It would prove');
    await expect(drawer(page).textContent()).resolves.toContain('Where it starts');
    await expect(page.getByTestId('grow-happened-write').textContent()).resolves.toBe('Write this flow');
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${none}/steps`);
    await page.close();
  });

  it('is a full-screen sheet on a phone, every target at least 44 px', async () => {
    const page = await open(`#grow/${failed}/steps`, 390);
    await opened(page);
    const m = await page.evaluate(() => {
      const r = document.querySelector('.gw-insw')!.getBoundingClientRect();
      const small = Array.from(document.querySelectorAll('[data-testid="grow-happened"] button')).filter((b) => (b as HTMLElement).offsetParent)
        .map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, w: q.width, h: q.height }; }).filter((q) => q.w < 44 || q.h < 44);
      return { sheet: [r.left, r.top, r.width, r.height], small, view: [innerWidth, innerHeight] };
    });
    expect(m.sheet).toEqual([0, 0, ...m.view]);
    expect(m.small).toEqual([]);
    await page.getByTestId('grow-happened-close').tap();
    await expect(drawer(page).count()).resolves.toBe(0);
    await page.close();
  });
});
