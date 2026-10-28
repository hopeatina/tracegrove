import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { checksOf } from '../src/authoring/checkCompare.ts';
import { grow } from '../src/authoring/grow.ts';
import { extraCall, happenedIn, historyLine } from '../src/authoring/happened.ts';
import type { StepReport } from '../src/authoring/runReport.ts';
import { couldNotRun, growVerdict, type GrowState } from '../src/authoring/growState.ts';
import { runTests } from '../src/authoring/run.ts';
import type { PredicateT } from '../src/protocol/index.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { growJsonSummary } from '../src/authoring/growJson.ts';

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

/* A failed stand-in count: payments expected 2 charges and got 3, the third during the step that removed a seat. Whether that
   step's answer is contradicted depends on what the answer said and what the run checked of it, never on a name's first letters. */
describe('The answer an extra stand-in call contradicts', () => {
  const call = (n: number, during: string) => ({ standIn: 'payments', method: 'POST', path: '/v1/charges', status: 200, at: `2026-10-22T19:12:19.9${n}0Z`, key: `k${n}`, repeat: false,
    faulted: false, amount: 900, currency: 'usd', description: null, during });
  const step = (id: string, extra: Partial<StepReport> = {}): StepReport => ({ id, name: id.replaceAll('_', ' '), method: 'POST', path: '/seats', result: 'completed', status: 200, durationMs: 5, reason: null, ...extra });
  const run = (answer: string, checked: StepReport['checked'] = []) => {
    const watch = step('only_two_were_charged', { method: 'STANDIN', path: 'payments POST /v1/charges', checks: 'fail', compared: { check: 'payments POST /v1/charges call count', expected: 2, got: 3 },
      calls: [call(1, 'owner_moves_to_team'), call(2, 'owner_adds_a_seat'), call(3, 'owner_removes_it_again')] });
    const steps = [step('owner_moves_to_team'), step('owner_adds_a_seat'), step('owner_removes_it_again', { answer, checked }), watch];
    return extraCall(steps, watch)!;
  };
  it('reads "charged": 0 as saying nothing was charged, as its own name says, or as the step’s held check compared it', () => {
    expect(run('{"seats":1,"charged":0}')).toMatchObject({ at: 2, field: 'charged', nth: 3 });
    const held = [{ check: 'body.chargeCount', expected: 0, got: 0, held: true, says: 'Expected body.chargeCount 0, got 0' }];
    expect(run('{"seats":1,"chargeCount":0}', held)).toMatchObject({ at: 2, field: 'chargeCount' });
  });
  it('does not read a field that only starts like the counted word as a contradiction, and still places the call on its step', () => {
    for (const answer of ['{"seats":1,"chargesPending":0}', '{"seats":1,"chargeable":false}', '{"seats":1,"chargeCount":0}']) expect(run(answer), answer).toMatchObject({ at: 2, field: null });
    // a check on the field that did not hold, or compared another value, is no ground either
    expect(run('{"seats":1,"chargeCount":0}', [{ check: 'body.chargeCount', expected: 1, got: 0, held: false, says: 'Expected body.chargeCount 1, got 0' }])).toMatchObject({ field: null });
    expect(run('{"seats":1,"chargeCount":0}', [{ check: 'body.seats', expected: 1, got: 1, held: true, says: 'Expected body.seats 1, got 1' }])).toMatchObject({ field: null });
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
  /** whether the drawer's head, and the step it is on (with no run, its buttons), are inside the window */
  const inView = (page: Page) => page.evaluate(() => {
    const whole = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
    return { head: whole('[data-testid="grow-happened"] .gw-drh'), step: whole('[data-testid="grow-happened"] .gw-drs [aria-pressed=true]') ?? whole('[data-testid="grow-happened"] .gw-dra') };
  });
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
    expect(d.oneLine).toBe('Step 3 ("owner removes it again") answered {"seats":1,"charged":0}, yet payments received a 900 charge during step 3, under a new idempotency key.');
    // the services as recorded: never "all real", and a stand-in no step watched says its calls were not recorded
    expect(d.chips.map((c) => c.t)).toEqual([`run ${failRun}`, `verified · source ${d.source}`, 'application real', 'storage real', 'payments stand-in', 'email stand-in · calls not recorded']);
    expect(d.source).toMatch(/^[0-9a-f]{6}$/);
    expect(d.foot).toEqual(['No step watched email, so its calls are not recorded (only a watch step records a stand-in’s calls).', 'No step drives a screen, so there are no screenshots, video or transcript.']);
    expect(d.history).toEqual({ saved: 1, passed: 0, failed: 1, lastPass: null });
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
    // the flow is named, never guessed: this run holds one flow, and asking it for another, or for none, is refused
    expect(happenedIn(dir, failRun, 'billing.card-declined')).toBeNull();
    const other = await get(url(failRun, 'case=billing.card-declined'));
    expect(other.status).toBe(404); expect(await other.json()).toEqual({ error: 'the run has no record of that flow' });
    for (const q of ['case=', '', 'config=tracegrove.config.yaml']) expect((await get(url(failRun, q))).status, q).toBe(400);
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
    const tree = () => page.evaluate(() => { const w = (0, eval)('gw'), r = (w.svg as SVGSVGElement).getBoundingClientRect(); return { rect: [r.left, r.top, r.width, r.height].map(Math.round), narrow: w.B.L.narrow }; });
    const was = await tree();
    await page.locator(`.gw-insw [data-dr="${failed}"]`).click();
    const d = await opened(page);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('grow-happened-title');
    await expect(page.getByTestId('grow-happened-title').textContent()).resolves.toBe('Removing a seat never charges the card');
    const box = await page.evaluate(() => {
      const w = (0, eval)('gw'), ins = document.querySelector('.gw-insw')!.getBoundingClientRect(), svg = (w.svg as SVGSVGElement).getBoundingClientRect();
      return { ins: Math.round(ins.width), svg: svg.width > 200 && svg.left < ins.left, over: getComputedStyle(document.querySelector('.gw-insw')!).position === 'fixed' && Math.round(ins.right) === innerWidth, pinned: w.pinned, lit: !!(w.svg as SVGSVGElement).querySelector('.pad.hl') };
    });
    expect(box.ins).toBeGreaterThanOrEqual(600); expect(box.ins).toBeLessThanOrEqual(660);
    expect(box).toMatchObject({ svg: true, over: true, pinned: `s:${failed}`, lit: true });
    // the drawer lies over the page at the right: the tree is not laid out again, every name stays where it was
    expect(await tree()).toEqual(was); expect(was.narrow).toBe(false);
    // the tree keeps no card of its own for it beside the drawer, which says it once
    expect(await page.evaluate(() => { const B = (0, eval)('gw').B; return { narrow: B.L.narrow, card: !B.tip.hidden }; })).toEqual({ narrow: false, card: false });
    await expect(page.getByTestId('grow-happened-step-4').getAttribute('aria-pressed')).resolves.toBe('true');
    const step = (n: number) => page.getByTestId(`grow-happened-step-${n}`).textContent();
    await expect(step(4)).resolves.toContain('Expected 2 charges, got 3');
    await expect(step(4)).resolves.toMatch(/waited \d+ ms of its 5000 ms deadline, polling every 50 ms \(not app time\)/);
    await expect(step(3)).resolves.toContain('answered {"seats":1,"charged":0}payments ← 900◀ contradicts its answer');
    await expect(step(2)).resolves.toContain('payments ← 900');
    await expect(step(1)).resolves.toContain('payments ← 4900');
    await expect(d.getByTestId('grow-happened-oneline').textContent()).resolves.toBe('In one lineStep 3 ("owner removes it again") answered {"seats":1,"charged":0}, yet payments received a 900 charge during step 3, under a new idempotency key.');
    // whether it held before, in the saved runs, and that no run of the base branch is recorded to set it against
    await expect(d.locator('.gw-drhist').textContent()).resolves.toBe('Failed in its 1 saved run; no run on main is recorded.');
    const chips = await d.getByTestId('grow-happened-chips').locator('.gw-chip').allTextContents();
    expect(chips).toContain('payments stand-in'); expect(chips).toContain('email stand-in · calls not recorded');
    expect(chips.join(' ')).not.toMatch(/all real/);
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/happened/step-4`);
    await page.close();
  });

  it('shows the answer and the extra call on the step it came in, and marks the answer contradicted only when the run says so', async () => {
    const page = await open(`#grow/${failed}/steps`);
    await opened(page);
    expect(await page.evaluate(() => { const d = (0, eval)('gw').dr.data; return [d.extraAt, d.contradicts]; })).toEqual([2, { at: 2, field: 'charged' }]);
    // the same run read with no contradiction: the step keeps its answer and the call, without the verdict
    await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.dr.data.contradicts = null; w.growPaint(); });
    const three = (await page.getByTestId('grow-happened-step-3').textContent())!;
    expect(three).toContain('answered {"seats":1,"charged":0}payments ← 900');
    expect(three).not.toContain('contradicts');
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
    // a watch step counts its polls; an HTTP step says the app's own time was not recorded, never a number it does not have
    await expect(panel()).resolves.toMatch(/watch payments POST \/v1\/charges · every 50 ms, up to 5000 ms · \d+ polls/);
    await expect(panel()).resolves.toMatch(/step \d+ ms · HTTP \d+ ms · app time not recorded · answered 200/);
    await expect(panel()).resolves.not.toMatch(/polled \d+ times/);
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
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/happened/step-3`);
    await page.getByTestId('grow-happened-step-2').click();
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/happened/step-2`);
    await page.reload(); await page.getByTestId('grow-result').waitFor(); await opened(page);
    await expect(page.getByTestId('grow-happened-step-2').getAttribute('aria-pressed')).resolves.toBe('true');
    // brought back from the address, it takes focus on its heading and shows its head and that step
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
    expect(await inView(page)).toEqual({ head: true, step: true });
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

  it('opened from a link at 1440 × 900, comes into view on its step with focus on its heading, and Escape closes it from the page body', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(`${server.url}#grow/${failed}/steps/step-4`);
    await opened(page);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
    await expect(page.getByTestId('grow-happened-step-4').getAttribute('aria-pressed')).resolves.toBe('true');
    expect(await inView(page)).toEqual({ head: true, step: true });
    // it keeps focus when the page redraws around it later
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('grow-happened-title');
    expect(await inView(page)).toEqual({ head: true, step: true });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(drawer(page).count()).resolves.toBe(0);
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}`);
    // one with no run, opened from its panel, shows its head and its Write this flow button
    await page.evaluate((id) => { location.hash = `#grow/${id}`; }, none);
    await page.locator(`.gw-insw [data-dr="${none}"]`).click();
    await page.getByTestId('grow-happened-none').waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
    await page.waitForTimeout(100);
    expect(await inView(page)).toEqual({ head: true, step: true });
    await page.close();
  });

  it('opens on the first failure’s broken step from Open the runs in the Journeys card, and gives focus back there', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    const go = page.getByTestId('grow-open-runs');
    await go.waitFor();
    await expect(go.textContent()).resolves.toBe('Open the runs');
    // it sits in the head of the Journeys card, beside the runs it opens (the first screen keeps See what happened in the verdict)
    expect(await go.evaluate((b) => !!b.closest('[data-testid="grow-scenarios"]'))).toBe(true);
    await go.scrollIntoViewIfNeeded();
    expect(await go.evaluate((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
    await go.click();
    await opened(page);
    await expect(page.getByTestId('grow-happened-title').textContent()).resolves.toBe('Removing a seat never charges the card');
    await expect(page.getByTestId('grow-happened-step-4').getAttribute('aria-pressed')).resolves.toBe('true');
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${failed}/happened/step-4`);
    expect(await inView(page)).toEqual({ head: true, step: true });
    await page.keyboard.press('Escape');
    await expect(drawer(page).count()).resolves.toBe(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('grow-open-runs');
    await page.close();
  });

  it('opened from the verdict at 1440 × 900, shows the step that broke, the answer in one line and Rerun, Heal and Run tab right under it, all on screen', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    await page.getByTestId('grow-verdict-open').click();
    await opened(page);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
    await page.waitForTimeout(100);
    await expect(page.getByTestId('grow-happened-step-4').getAttribute('aria-pressed')).resolves.toBe('true');
    const seen = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="grow-happened"]')!;
      const whole = (e: Element | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; };
      const at = (id: string) => whole(d.querySelector(`[data-testid="${id}"]`));
      const after = (x: Element, y: Element) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      const one = d.querySelector('[data-testid="grow-happened-oneline"]')!, rerun = d.querySelector('[data-testid="grow-happened-rerun"]')!;
      const steps = d.querySelector('.gw-drs')!, tabs = d.querySelector('[role="tablist"]')!;
      return { head: whole(d.querySelector('.gw-drh')), step: whole(d.querySelector('.gw-drs [aria-pressed=true]')), oneline: at('grow-happened-oneline'),
        rerun: at('grow-happened-rerun'), heal: at('grow-happened-heal'), runtab: at('grow-happened-runtab'),
        // the steps, then the answer, then what to do about it, then the evidence, and the link to this step last
        order: after(steps, one) && after(one, rerun) && after(rerun, tabs) && after(tabs, d.querySelector('[data-testid="grow-happened-copy"]')!),
        under: rerun.closest('.gw-dra')!.previousElementSibling === one, copies: d.querySelectorAll('[data-testid="grow-happened-copy"]').length };
    });
    expect(seen).toEqual({ head: true, step: true, oneline: true, rerun: true, heal: true, runtab: true, order: true, under: true, copies: 1 });
    await page.close();
  });

  it('does not preview a mode under a pointer that has not moved while the drawer opened over the page', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    // the verdict's See what happened opens the drawer from the left column, over the mode cards' x
    const go = page.getByTestId('grow-verdict-open');
    await go.waitFor();
    // a repaint can replace the link between the wait and the read (the run's evidence arrives after the page shows), so read
    // its box once it is on the page again rather than from the node that was swapped out
    let box: { x: number; y: number; width: number; height: number } | null = null;
    for (let i = 0; i < 20 && !box; i++) { await go.scrollIntoViewIfNeeded().catch(() => {}); box = await go.boundingBox(); if (!box) await page.waitForTimeout(100); }
    if (!box) throw new Error('See what happened never settled on the page');
    await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.down(); await page.mouse.up();
    await opened(page);
    await page.waitForTimeout(400);
    // the drawer opens over the page at the right, so the page does not scroll under the pointer
    expect(await page.evaluate(() => scrollY)).toBe(before);
    // the page itself moves, as a reader's scroll moves it, until a mode lies under the pointer that has not moved
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const under = await page.evaluate(({ x, y }) => {
      const b = Array.from(document.querySelectorAll('[data-testid="grow-modes"] [data-m]')).find((e) => { const r = e.getBoundingClientRect(); return r.left <= x && x <= r.right; });
      if (!b) return null;
      const r = b.getBoundingClientRect(); window.scrollBy({ top: Math.round((r.top + r.bottom) / 2 - y), behavior: 'instant' });
      return document.elementFromPoint(x, y)?.closest('[data-testid="grow-modes"] [data-m]')?.getAttribute('data-m') ?? 'nothing';
    }, at);
    expect(under).toMatch(/^(min|std|max)$/);
    expect(await page.evaluate(() => scrollY)).not.toBe(before);
    await page.waitForTimeout(400);
    const said = () => page.evaluate(() => ({ preview: (0, eval)('gw').preview, line: document.querySelector('[data-testid="grow-mode-preview"]')?.textContent ?? '' }));
    expect(await said()).toEqual({ preview: null, line: expect.not.stringMatching(/^Preview/) });
    // a real move of the pointer previews the mode it rests on
    await page.mouse.move(at.x + 2, at.y + 1);
    await page.waitForFunction((m) => (0, eval)('gw').preview === m, under);
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
    expect(await page.evaluate(() => location.hash)).toBe(`#grow/${none}/happened`);
    // one that reaches a third party says which key a real run needs
    const keyed = state.scenarios.find((x) => !x.flow && x.realKey && state.run[x.id]?.st === 'not_run')!;
    expect(keyed.realKey).toBe('STRIPE_SECRET_KEY or STRIPE_TEST_KEY');
    await page.evaluate((id) => { location.hash = `#grow/${id}/steps`; }, keyed.id);
    await expect(page.getByTestId('grow-happened-realkey').textContent()).resolves.toBe('To run it for realA real run needs STRIPE_SECRET_KEY or STRIPE_TEST_KEY.');
    await page.close();
  });

  it('offers Write this flow on the card of a scenario no flow proves, beside why it is not tested yet, and only there', async () => {
    const page = await open(`#grow/${none}`);
    const card = page.locator('.gw-insw');
    await expect(card.locator(`[data-dr="${none}"]`).textContent()).resolves.toBe('Why not tested yet ›');
    const write = card.getByTestId('grow-card-write');
    await expect(write.textContent()).resolves.toBe('Write this flow');
    const claim = state.scenarios.find((x) => x.id === none)!.proves!;
    await write.click();
    await page.waitForFunction(() => document.activeElement?.id === 'intent');
    expect(await page.evaluate(() => (document.getElementById('intent') as HTMLTextAreaElement).value)).toBe(claim.replaceAll('`', ''));
    // a scenario a flow proves has none
    await page.evaluate((id) => { location.hash = `#grow/${id}`; }, failed);
    await page.locator(`.gw-insw [data-dr="${failed}"]`).waitFor();
    await expect(page.locator('.gw-insw [data-testid="grow-card-write"]').count()).resolves.toBe(0);
    await page.close();
  });

  it('offers Write this flow on a phone’s card too, 44 px tall, and it puts the claim in the Intent box', async () => {
    const page = await open(`#grow/${none}`, 390);
    const write = page.locator('[data-testid="grow-card-write"]:visible');
    await expect(write.count()).resolves.toBe(1);
    await expect(write.textContent()).resolves.toBe('Write this flow');
    expect(await write.evaluate((b) => b.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await write.tap();
    await page.waitForFunction(() => document.activeElement?.id === 'intent');
    expect(await page.evaluate(() => (document.getElementById('intent') as HTMLTextAreaElement).value)).toBe(state.scenarios.find((x) => x.id === none)!.proves!.replaceAll('`', ''));
    await page.close();
  });

  it('says the run holds no record of the flow the grow recorded, instead of reading the run’s only flow as that one', async () => {
    const page = await open();
    await page.evaluate((id) => { (0, eval)('gw').state.run[id].flow = 'billing.card-declined'; location.hash = `#grow/${id}/steps`; }, failed);
    const err = drawer(page).locator('.gw-drerr');
    await err.waitFor();
    await expect(err.textContent()).resolves.toBe(`The run ${failRun} has no record of billing.card-declined.`);
    await expect(page.getByTestId('grow-happened-oneline').count()).resolves.toBe(0);
    await page.close();
  });

  it('opens the Run tab from the drawer only at the flow the grow recorded, and grow --json reads no other flow’s step or cell', async () => {
    const page = await open();
    await page.evaluate((id) => { (0, eval)('gw').state.run[id].flow = 'billing.card-declined'; location.hash = `#grow/${id}/happened`; }, failed);
    await drawer(page).locator('.gw-drerr').waitFor();
    await page.getByTestId('grow-happened-runtab').click();
    await expect(page.locator('.toast').textContent()).resolves.toBe(`The run ${failRun} has no record of billing.card-declined.`);
    expect(await page.evaluate(() => (0, eval)('tab'))).toBe('Discover');
    await page.close();
    const s = structuredClone(state); s.run[failed]!.flow = 'billing.card-declined';
    const f = growJsonSummary(s, dir).failures.find((x) => x.scenario === failed)!;
    expect(f).toMatchObject({ run: failRun, saved: true, step: null, check: null, expected: null, got: null });
    expect(f.evidence).toEqual([`.tracegrove/runs/${failRun}/summary.json`]);
  });

  it('says how the failure broke in the same words in grow --json, the verdict, the selected card and the drawer, with where the extra charge came from', async () => {
    const more = 'The extra 900 charge came during step 3 (owner removes it again); step 4 counted them.';
    const f = growJsonSummary(state, dir).failures.find((x) => x.scenario === failed)!;
    expect(f).toMatchObject({ step: 4, check: 'payments POST /v1/charges call count', expected: 2, got: 3, says: `Expected 2 charges, got 3. ${more}` });
    const last = await (await fetch(new URL('/api/grow/last?branch=seats', server.url))).json() as { view: { more: Record<string, string> } };
    expect(last.view.more).toEqual({ [failed]: more });
    const page = await open(`#grow/${failed}`);
    await expect(page.getByTestId('grow-verdict').textContent()).resolves.toContain('“Removing a seat never charges the card” failedStep 4 · expected 2 charges, got 3');
    const card = page.locator('.gw-insw');
    await expect(card.locator('.gw-broke > span').first().textContent()).resolves.toContain('were charged”: expected 2 charges, got 3');
    await expect(card.getByTestId('grow-card-more').textContent()).resolves.toBe(more);
    await card.locator(`[data-hap="${failed}"]`).click();
    await opened(page);
    await expect(page.getByTestId('grow-happened-step-4').textContent()).resolves.toContain('Expected 2 charges, got 3');
    await page.close();
  });

  it('offers Rerun, Heal and Copy link beside the answer on the selected failing scenario’s card, and Rerun and Copy link on a passed one', async () => {
    const page = await open(`#grow/${failed}`);
    const card = page.locator('.gw-insw'), acts = card.getByTestId('grow-card-actions');
    await expect(acts.locator('button').allTextContents()).resolves.toEqual(['Rerun', 'Heal', 'Copy link']);
    // right under the answer, beside the way to what happened, before what the scenario checks
    expect(await card.evaluate((c) => {
      const a = c.querySelector('[data-testid="grow-card-actions"]')!, hap = c.querySelector('[data-hap]')!, broke = c.querySelector('.gw-broke')!;
      const after = (x: Element, y: Element) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      const checks = Array.from(c.querySelectorAll('*')).find((e) => e.childElementCount === 0 && e.textContent === 'What it checks')!;
      return { order: after(broke, a) && after(a, hap) && after(hap, checks), gap: Math.round(hap.getBoundingClientRect().top - a.getBoundingClientRect().bottom) <= 16 };
    })).toEqual({ order: true, gap: true });
    await expect(acts.getByTestId('grow-card-rerun').isDisabled()).resolves.toBe(false);
    await acts.getByTestId('grow-card-copy').click();
    await expect(page.locator('.toast').textContent()).resolves.toMatch(new RegExp(`^(Copied the link to this scenario\\.|Link: .*#grow/${failed})$`));
    await acts.getByTestId('grow-card-heal').click();
    await page.waitForFunction(() => (0, eval)('tab') === 'Heal');
    await page.close();
    const ok = await open(`#grow/${passed}`);
    await ok.locator(`.gw-insw [data-hap="${passed}"]`).waitFor();
    await expect(ok.locator('.gw-insw [data-testid="grow-card-actions"] button').allTextContents()).resolves.toEqual(['Rerun', 'Copy link']);
    await ok.close();
  });

  it('keeps what broke readable in the verdict at 1024 and 768 px: it wraps in words, never cut short to a tooltip', async () => {
    for (const width of [1024, 768]) {
      const page = await open('', width);
      const v = page.getByTestId('grow-verdict');
      await expect(v.textContent()).resolves.toContain('“Removing a seat never charges the card” failedStep 4 · expected 2 charges, got 3');
      const m = await v.evaluate((el) => {
        const t = el.querySelector('.gw-vt') as HTMLElement, r = el.getBoundingClientRect(), cs = getComputedStyle(t), go = document.querySelector('[data-testid="grow-verdict-open"]')!.getBoundingClientRect();
        return { whole: t.scrollWidth <= t.clientWidth && t.scrollHeight <= t.clientHeight + 1, cut: cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap',
          inside: r.left >= 0 && r.right <= innerWidth && go.right <= innerWidth, page: document.documentElement.scrollWidth <= innerWidth, tooltip: t.hasAttribute('title') || el.hasAttribute('title') };
      });
      expect({ width, ...m }).toEqual({ width, whole: true, cut: false, inside: true, page: true, tooltip: false });
      await page.close();
    }
  });

  it('as a sheet over the page at 1000 px, is a dialog that keeps Tab inside it, and is not one beside the tree', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(`${server.url}#grow/${failed}/steps`);
    await opened(page);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
    expect(await page.evaluate(() => { const d = document.querySelector('[data-testid="grow-happened"]')!; return [d.getAttribute('role'), d.getAttribute('aria-modal'), getComputedStyle(document.querySelector('.gw-insw')!).position]; }))
      .toEqual(['dialog', 'true', 'fixed']);
    const inside = () => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('[data-testid="grow-happened"]') ? a.getAttribute('data-testid') ?? a.textContent : `OUT ${a?.tagName} ${a?.textContent?.slice(0, 20)}`; });
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); seen.push(String(await inside())); }
    expect(seen.filter((x) => x.startsWith('OUT'))).toEqual([]);
    // round it goes: past its last control Tab comes back to the first, and Shift+Tab from the first goes to the last
    expect(seen).toContain('grow-happened-close'); expect(seen).toContain('grow-happened-copy');
    await page.getByTestId('grow-happened-close').focus();
    await page.keyboard.press('Shift+Tab');
    expect(await inside()).toBe('grow-happened-copy');
    await page.keyboard.press('Tab');
    expect(await inside()).toBe('grow-happened-close');
    // focus sent behind the sheet comes back to its heading
    await page.evaluate(() => (document.querySelector('[data-testid="grow-view-outline"]') as HTMLElement).focus());
    expect(await inside()).toBe('grow-happened-title');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('grow-happened-step-1').click();
    expect(await page.evaluate(() => [document.querySelector('[data-testid="grow-happened"]')!.getAttribute('role'), document.querySelector('[data-testid="grow-happened"]')!.getAttribute('aria-modal')])).toEqual([null, null]);
    await page.close();
  });

  it('leaves the command palette and the keyboard list their own focus and Escape, as a sheet at 1000 px and beside the tree at 1440', async () => {
    for (const width of [1000, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      page.on('pageerror', (e) => { errors.push(String(e)); });
      await page.goto(`${server.url}#grow/${failed}/steps`);
      await opened(page);
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
      // the palette opens over the drawer and keeps the caret: what is typed goes into it
      await page.keyboard.press('Control+k');
      await page.locator('.pal-back input').waitFor();
      await page.keyboard.type('Run');
      const where = () => page.evaluate(() => ({ palette: !!document.querySelector('.pal-back'), drawer: !!document.querySelector('[data-testid="grow-happened"]'),
        focus: document.activeElement?.closest('.pal-back') ? 'palette' : document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName }));
      expect(await where(), `${width}`).toEqual({ palette: true, drawer: true, focus: 'palette' });
      expect(await page.locator('.pal-back input').inputValue()).toBe('Run');
      // one Escape closes the palette only; the next closes the drawer
      await page.keyboard.press('Escape');
      expect(await where(), `${width}`).toMatchObject({ palette: false, drawer: true });
      // the keyboard list, opened from the drawer's heading, is closed by Escape before the drawer is
      await page.getByTestId('grow-happened-title').focus();
      await page.keyboard.press('?');
      await page.locator('.pal-back').waitFor();
      await page.keyboard.press('Escape');
      expect(await where(), `${width}`).toMatchObject({ palette: false, drawer: true });
      await page.keyboard.press('Escape');
      expect(await where(), `${width}`).toMatchObject({ palette: false, drawer: false });
      await page.close();
    }
  });

  it('gives every button in the result band and the verdict, and Open the runs, at least 44 px on a phone', async () => {
    const page = await open(`#grow/${failed}`, 390);
    const sizes = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="grow-result"] button, [data-testid="grow-verdict"] button, [data-testid="grow-open-runs"]')).filter((b) => (b as HTMLElement).offsetParent)
      .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: r.height }; }));
    expect(sizes.map((q) => q.t)).toContain('Open the runs');
    expect(sizes.map((q) => q.t)).toContain('See what happened');
    expect(sizes.filter((q) => q.h < 44)).toEqual([]);
    await page.close();
  });

  it('is a full-screen sheet on a phone, every target at least 44 px', async () => {
    // the ways into it, on the card under the tree and on the rows, in the Grove and the Outline
    const before = await open(`#grow/${failed}`, 390);
    const ways = () => before.evaluate(() => Array.from(document.querySelectorAll('[data-dr],[data-hap]')).filter((b) => (b as HTMLElement).offsetParent && b.getBoundingClientRect().width > 0)
      .map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, w: q.width, h: q.height }; }));
    expect(await before.getByTestId('grow-open-runs').evaluate((b) => b.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const grove = await ways();
    expect(grove.length).toBeGreaterThan(0);
    expect(grove.filter((q) => q.w < 44 || q.h < 44)).toEqual([]);
    await before.getByTestId('grow-view-outline').tap();
    const outline = await ways();
    expect(outline.length).toBeGreaterThan(0);
    expect(outline.filter((q) => q.w < 44 || q.h < 44)).toEqual([]);
    await before.close();
    const page = await open(`#grow/${failed}/steps`, 390);
    await opened(page);
    const m = await page.evaluate(() => {
      const r = document.querySelector('.gw-insw')!.getBoundingClientRect();
      const small = Array.from(document.querySelectorAll('[data-testid="grow-happened"] button, [data-dr], [data-hap]')).filter((b) => (b as HTMLElement).offsetParent)
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

/* A run that never reached its checks, as tg's grow of browser.grow did: the app exited before it was ready, so every step is
   not_run. The drawer says why in the words grow says it, from what the host sealed, and never a reason code. */
describe('What happened in a run that never reached its checks', () => {
  const mine: string[] = [];
  afterAll(() => { for (const d of mine.splice(0)) rmSync(d, { recursive: true, force: true }); });
  it('says why it could not run as the host sealed it, and calls a service it did not record "not recorded", never a stand-in', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tracegrove-drawer-norun-')); mine.push(dir);
    cpSync(join(import.meta.dirname, '..', 'src', 'samples', 'saas-billing'), dir, { recursive: true });
    const app = join(dir, 'app', 'billing.mjs');
    writeFileSync(app, `console.error('billing is down');\nprocess.exit(3);\n${readFileSync(app, 'utf8')}`);
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Plotline billing that never starts');
    const { report } = await runTests({ configPath: join(dir, 'tracegrove.config.yaml'), grep: 'card-declined' });
    const c = report.cases[0]!;
    expect(c.outcome).toBe('infrastructure_failed');
    const d = happenedIn(dir, basename(report.runDir), c.caseId)!;
    expect(d.steps.length).toBeGreaterThan(0);
    expect(d.steps.every((x) => x.result === 'not_run')).toBe(true);
    // the same words grow records as why it is not tested yet, from the summary's failure
    expect(d.oneLine).toBe(`${couldNotRun(`${c.failure!.step}: ${c.failure!.message}`)}.`);
    expect(d.oneLine).toBe('Could not run: the app did not start (application exited before becoming ready).');
    expect(d.oneLine).not.toMatch(/step_not_run|halted_by_prior_failure|Broke at/);
    // a service the run did not record is greyed as not recorded, not coloured as a stand-in
    const unrecorded = d.chips.filter((x) => / not recorded$/.test(x.t));
    expect(unrecorded.length).toBeGreaterThan(0);
    expect(unrecorded.map((x) => x.tone)).toEqual(unrecorded.map(() => 'none'));
    // in the flow's history a run that never reached its checks is said so, never counted as a failure
    expect(d.history).toMatchObject({ saved: 1, passed: 0, failed: 0 });
    expect(d.unfinished).toEqual({ notReached: 1, cancelled: 0, inconclusive: 0 });
    expect(d.historyLine).toBe('Never reached its checks in its 1 saved run.');
    // once the app starts again and the flow passes, the line says both
    writeFileSync(app, readFileSync(app, 'utf8').replace("console.error('billing is down');\nprocess.exit(3);\n", ''));
    const again = await runTests({ configPath: join(dir, 'tracegrove.config.yaml'), grep: 'card-declined' });
    expect(again.report.cases.map((x) => x.outcome)).toEqual(['passed']);
    const e = happenedIn(dir, basename(again.report.runDir), c.caseId)!;
    expect([e.history.saved, e.history.passed, e.history.failed, e.unfinished.notReached]).toEqual([2, 1, 0, 1]);
    expect(e.historyLine).toBe('Passed 1 of 2 saved runs; 1 never reached its checks.');
  }, 120_000);

  it('opened from Not proven yet’s next action, says why it could not run on screen, above the steps it never ran, at 1440 × 900 and on a phone', async () => {
    // the seats branch, whose app exits before it is ready: every flow's run never reaches its checks
    const dir = plotlineSeats(); mine.push(dir);
    const app = join(dir, 'app', 'billing.mjs');
    writeFileSync(app, `console.error('billing is down');\nprocess.exit(3);\n${readFileSync(app, 'utf8')}`);
    git(dir, 'commit', '-qam', 'Billing that never starts');
    const { state } = await grow({ dir, branch: 'seats', base: 'main', mode: 'min', prove: true, gh: false, agent: { off: true } });
    expect(growVerdict(state)).toMatchObject({ verdict: 'not proven yet', exitCode: 3 });
    const server = await startUi({ dir, branch: 'seats', port: 0, token: TOKEN });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      for (const [width, height] of [[1440, 900], [390, 844]] as const) {
        const phone = width < 500;
        const page = await browser.newPage({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
        page.on('pageerror', (e) => { errors.push(String(e)); });
        await page.goto(server.url);
        const next = page.getByTestId('grow-verdict-next');
        await expect(next.textContent()).resolves.toBe('See why it could not run ›');
        await next.click();
        await page.getByTestId('grow-happened-oneline').waitFor();
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
        await page.waitForTimeout(100);
        const seen = await page.evaluate(() => {
          const d = document.querySelector('[data-testid="grow-happened"]')!;
          const whole = (e: Element | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; };
          const one = d.querySelector('[data-testid="grow-happened-oneline"]')!, steps = d.querySelector('.gw-drs')!, rerun = d.querySelector('[data-testid="grow-happened-rerun"]')!;
          const after = (x: Element, y: Element) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
          return { text: one.textContent, oneline: whole(one), rerun: whole(rerun), head: whole(d.querySelector('.gw-drh')), order: after(one, rerun) && after(rerun, steps),
            notRun: Array.from(d.querySelectorAll('.gw-drs li')).every((li) => /not run/.test(li.textContent ?? '')) };
        });
        expect(seen, `${width}`).toEqual({ text: 'In one lineCould not run: the app did not start (application exited before becoming ready).', oneline: true, rerun: true, head: true, order: true, notRun: true });
        await page.close();
      }
    } finally { await browser.close(); await server.close(); }
    expect(errors).toEqual([]);
  }, 180_000);

  it('says the saved runs as they went: failures, runs that never reached their checks, cancelled and inconclusive ones', () => {
    const none = { notReached: 0, cancelled: 0, inconclusive: 0 };
    expect(historyLine({ saved: 0, passed: 0, failed: 0, lastPass: null }, none, 'main')).toBeNull();
    expect(historyLine({ saved: 6, passed: 0, failed: 0, lastPass: null }, { ...none, notReached: 6 }, 'main')).toBe('Never reached its checks in all 6 saved runs; no run on main is recorded.');
    expect(historyLine({ saved: 6, passed: 0, failed: 2, lastPass: null }, { ...none, notReached: 4 }, 'main')).toBe('Passed 0 of 6 saved runs; 4 never reached their checks; no run on main is recorded.');
    expect(historyLine({ saved: 6, passed: 1, failed: 1, lastPass: 'r' }, { notReached: 1, cancelled: 2, inconclusive: 1 }, null)).toBe('Passed 1 of 6 saved runs; 1 never reached its checks; 2 were cancelled; 1 was inconclusive.');
    expect(historyLine({ saved: 3, passed: 2, failed: 1, lastPass: 'r' }, none, null)).toBe('Passed 2 of 3 saved runs.');
    expect(historyLine({ saved: 1, passed: 0, failed: 1, lastPass: null }, none, 'main')).toBe('Failed in its 1 saved run; no run on main is recorded.');
  });
});

/* The seats branch with a second break: a seat count out of range is refused with another error than the flow expects, so
   seats.bad-seats fails beside seats.remove-seat. */
describe('What happened, with several failures', () => {
  let dir = '', state: GrowState, server: UiServer, browser: Browser;
  const errors: string[] = [];
  beforeAll(async () => {
    dir = plotlineSeats();
    const app = join(dir, 'app', 'billing.mjs'), text = readFileSync(app, 'utf8');
    expect(text).toContain("error: 'bad_seats'");
    writeFileSync(app, text.replaceAll("error: 'bad_seats'", "error: 'seats_out_of_range'"));
    git(dir, 'commit', '-qam', 'Name the seats error after its range');
    ({ state } = await grow({ dir, branch: 'seats', base: 'main', mode: 'min', prove: true, gh: false, agent: { off: true } }));
    server = await startUi({ dir, branch: 'seats', port: 0, token: TOKEN });
    browser = await chromium.launch({ headless: true });
  }, 180_000);
  afterAll(async () => { await browser?.close(); await server?.close(); rmSync(dir, { recursive: true, force: true }); expect(errors).toEqual([]); });

  it('pages from one failure to the next in the order the verdict counts them, its buttons 44 px on a sheet', async () => {
    const fails = state.scenarios.filter((x) => state.run[x.id]?.st === 'fail').map((x) => x.id);
    expect(fails.map((id) => state.run[id]!.flow).sort()).toEqual(['seats.bad-seats', 'seats.remove-seat']);
    expect(growVerdict(state).first?.scenario).toBe(fails[0]);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(`${server.url}#grow/${fails[0]}/steps`);
    await page.getByTestId('grow-happened-oneline').waitFor();
    const pager = () => page.evaluate(() => ({ text: document.querySelector('[data-testid="grow-happened-pager"] span')?.textContent,
      prev: (document.querySelector('[data-testid="grow-happened-prev"]') as HTMLButtonElement | null)?.disabled, next: (document.querySelector('[data-testid="grow-happened-next"]') as HTMLButtonElement | null)?.disabled, hash: location.hash }));
    expect(await pager()).toMatchObject({ text: 'Failure 1 of 2', prev: true, next: false });
    await page.getByTestId('grow-happened-next').click();
    await page.waitForFunction((id) => location.hash.startsWith(`#grow/${id}/happened`), fails[1]);
    await page.getByTestId('grow-happened-oneline').waitFor();
    expect(await pager()).toMatchObject({ text: 'Failure 2 of 2', prev: false, next: true });
    await expect(page.getByTestId('grow-happened-title').textContent()).resolves.toBe(state.scenarios.find((x) => x.id === fails[1])!.title.replaceAll('`', ''));
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'grow-happened-title');
    await page.getByTestId('grow-happened-prev').click();
    await page.waitForFunction((id) => location.hash.startsWith(`#grow/${id}/happened`), fails[0]);
    expect(await pager()).toMatchObject({ text: 'Failure 1 of 2' });
    // a scenario that passed has no pager
    const passed = state.scenarios.find((x) => state.run[x.id]?.st === 'pass')!.id;
    await page.evaluate((id) => { location.hash = `#grow/${id}/steps`; }, passed);
    await page.waitForFunction((id) => location.hash.startsWith(`#grow/${id}/happened`), passed);
    await page.getByTestId('grow-happened-oneline').waitFor();
    await expect(page.getByTestId('grow-happened-pager').count()).resolves.toBe(0);
    await page.close();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (e) => { errors.push(String(e)); });
    await phone.goto(`${server.url}#grow/${fails[1]}/steps`);
    await phone.getByTestId('grow-happened-oneline').waitFor();
    const sizes = await phone.evaluate(() => Array.from(document.querySelectorAll('[data-testid="grow-happened-pager"] button')).map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
    expect(sizes).toEqual([[44, 44], [44, 44]]);
    await phone.close();
  });

  it('counts a saved run in the flow’s history once it is whole, even when it was read while still being written', () => {
    const failRun = state.run[state.scenarios.find((x) => state.run[x.id]?.flow === 'seats.remove-seat')!.id]!.run!;
    const runs = join(dir, '.tracegrove', 'runs'), late = join(runs, '2026-01-01T00-00-02Z_fail_c0ffee');
    const before = happenedIn(dir, failRun, 'seats.remove-seat')!.history;
    // its summary is written, its evidence not yet: it is not counted
    cpSync(join(runs, failRun, 'summary.json'), join(late, 'summary.json'));
    expect(happenedIn(dir, failRun, 'seats.remove-seat')!.history).toEqual(before);
    // once its evidence is there and verifies, it is
    for (const name of readdirSync(join(runs, failRun))) if (name !== 'summary.json') cpSync(join(runs, failRun, name), join(late, name), { recursive: true });
    expect(happenedIn(dir, failRun, 'seats.remove-seat')!.history).toEqual({ ...before, saved: before.saved + 1, failed: before.failed + 1 });
    rmSync(late, { recursive: true, force: true });
  });

  it('says the path a step sent as the run recorded it, and calls only a stand-in watch’s wait not app time', async () => {
    const { report } = await runTests({ configPath: join(dir, 'tracegrove.config.yaml'), grep: 'tracegrove/billing/upgrade-charges-once.flow.yaml' });
    expect(report.cases.map((c) => c.caseId)).toEqual(['billing.upgrade-charges-once']);
    const run = basename(report.runDir);
    const d = happenedIn(dir, run, 'billing.upgrade-charges-once')!;
    const [upgrade, charged, onTeam, other] = d.steps;
    // the flow declares GET /invoices/{invoiceId}; the run sent the invoice the first step saved
    expect(other!.path).toBe('/invoices/{invoiceId}');
    const invoice = (JSON.parse(upgrade!.answer!) as { invoice: { id: string } }).invoice.id;
    expect(other!.request).toMatchObject({ path: `/invoices/${invoice}`, as: 'credential other_tenant_token' });
    expect(upgrade!.request).toMatchObject({ path: '/subscription', as: 'owner' });
    expect(upgrade!.request!.declared).toBeUndefined();
    expect(charged!.method).toBe('STANDIN'); expect(onTeam!.watch).toBeTruthy(); expect(onTeam!.method).toBe('GET');
    const passed = state.scenarios.find((x) => state.run[x.id]?.st === 'pass')!.id;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    await page.getByTestId('grow-result').waitFor();
    await page.evaluate(([id, name]) => { const g = (0, eval)('gw'); g.state.run[id!].run = name; g.state.run[id!].flow = 'billing.upgrade-charges-once'; location.hash = `#grow/${id}/steps`; }, [passed, run]);
    await page.getByTestId('grow-happened-oneline').waitFor();
    // a stand-in watch waits on the stand-in, not the app; a polled read of the app is the app's own time
    await expect(page.getByTestId('grow-happened-step-2').textContent()).resolves.toMatch(/deadline, polling every \d+ ms \(not app time\)/);
    await expect(page.getByTestId('grow-happened-step-3').textContent()).resolves.toMatch(/waited \d+ ms of its \d+ ms deadline/);
    await expect(page.getByTestId('grow-happened-step-3').textContent()).resolves.not.toContain('not app time');
    await page.getByTestId('grow-happened-tab-requests').click();
    const req = (await page.getByTestId('grow-happened-panel').textContent()) ?? '';
    expect(req).toContain(`GET /invoices/${invoice} · as credential other_tenant_token`);
    expect(req).not.toContain('{invoiceId}');
    await page.getByTestId('grow-happened-tab-answered').click();
    await expect(page.getByTestId('grow-happened-panel').textContent()).resolves.toContain(`GET /invoices/${invoice} → 404`);
    // a body that names a saved value is said as its flow declares it, since the body sent is not recorded
    writeFileSync(join(dir, 'tracegrove', 'seats', 'noted.flow.yaml'), ['title: A seat change can carry the invoice it follows', 'risk: critical', 'tags: [billing, seats]', 'steps:',
      '  - name: owner moves to Team', '    POST: /subscription', '    json: { plan: team }', '    expect: 200', '    save: { invoiceId: invoice.id }',
      '  - name: owner adds a seat with a note', '    POST: /seats', '    json: { seats: 2, daysLeft: 30, note: "{invoiceId}" }', '    expect: 200', ''].join('\n'));
    const noted = await runTests({ configPath: join(dir, 'tracegrove.config.yaml'), grep: 'tracegrove/seats/noted.flow.yaml' });
    const n = happenedIn(dir, basename(noted.report.runDir), 'seats.noted')!;
    expect(n.steps.map((x) => x.request?.declared ?? false)).toEqual([false, true]);
    await page.evaluate(([id, name]) => { const g = (0, eval)('gw'); g.state.run[id!].run = name; g.state.run[id!].flow = 'seats.noted'; location.hash = `#grow/${id}/steps`; }, [passed, basename(noted.report.runDir)]);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="grow-happened"] .gw-drs li').length === 2);
    await page.getByTestId('grow-happened-tab-requests').click();
    const said = (await page.getByTestId('grow-happened-panel').textContent()) ?? '';
    expect(said).toContain('POST /seats {"seats":2,"daysLeft":30,"note":"{invoiceId}"} (body as declared) · as owner');
    expect(said).toContain('POST /subscription {"plan":"team"} · as owner');
    await page.close();
  }, 120_000);

  it('counts only the steps a run reached as requests, and says a step it never reached sent nothing', async () => {
    writeFileSync(join(dir, 'tracegrove', 'seats', 'halted.flow.yaml'), ['title: The plan is read back after an upgrade', 'risk: critical', 'tags: [billing, seats]', 'steps:',
      '  - name: owner moves to Team', '    POST: /subscription', '    json: { plan: team }', '    expect: 418',
      '  - name: owner reads the plan', '    GET: /subscription', '    expect: 200', ''].join('\n'));
    const { report } = await runTests({ configPath: join(dir, 'tracegrove.config.yaml'), grep: 'tracegrove/seats/halted.flow.yaml' });
    expect(report.cases.map((c) => c.steps.map((x) => x.result))).toEqual([['failed', 'not_run']]);
    const passed = state.scenarios.find((x) => state.run[x.id]?.st === 'pass')!.id;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    await page.getByTestId('grow-result').waitFor();
    await page.evaluate(([id, name]) => { const g = (0, eval)('gw'); g.state.run[id!].run = name; g.state.run[id!].flow = 'seats.halted'; location.hash = `#grow/${id}/steps`; }, [passed, basename(report.runDir)]);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="grow-happened"] .gw-drs li').length === 2);
    await expect(page.getByTestId('grow-happened-tab-requests').textContent()).resolves.toBe('Requests 1');
    await page.getByTestId('grow-happened-tab-requests').click();
    const groups = await page.locator('[data-testid="grow-happened-panel"] .gw-drg').allTextContents();
    expect(groups[0]).toContain('POST /subscription {"plan":"team"} · as owner');
    expect(groups[1]).toBe('Step 2 · owner reads the plannot sent: the run stopped before this step');
    await page.close();
  }, 120_000);

  it('lists each stand-in call once when two watch steps read the same route', async () => {
    writeFileSync(join(dir, 'tracegrove', 'seats', 'twice.flow.yaml'), ['title: Each charge is counted as it lands', 'risk: critical', 'tags: [billing, seats]', 'steps:',
      '  - name: owner moves to Team', '    POST: /subscription', '    json: { plan: team }', '    expect: 200',
      '  - name: the upgrade was charged', '    standin: payments', '    received: POST /v1/charges', '    expect: { calls: 1 }',
      '  - name: owner adds a seat', '    POST: /seats', '    json: { seats: 2, daysLeft: 30 }', '    expect: 200',
      '  - name: the seat was charged too', '    standin: payments', '    received: POST /v1/charges', '    expect: { calls: 2 }', ''].join('\n'));
    const { report } = await runTests({ configPath: join(dir, 'tracegrove.config.yaml'), grep: 'tracegrove/seats/twice.flow.yaml' });
    expect(report.cases.map((c) => [c.caseId, c.outcome])).toEqual([['seats.twice', 'passed']]);
    const run = basename(report.runDir);
    // the second watch step holds the first one's call as well as its own
    const d = happenedIn(dir, run, 'seats.twice')!;
    expect(d.steps.map((x) => (x.calls ?? []).map((c) => c.amount))).toEqual([[], [4900], [], [4900, 900]]);
    expect(d.foot.join(' ')).not.toMatch(/outside every step/);
    // the drawer lists each call once, on the step it came in, and counts it once
    const passed = state.scenarios.find((x) => state.run[x.id]?.st === 'pass')!.id;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    await page.getByTestId('grow-result').waitFor();
    await page.evaluate(([id, name]) => { const g = (0, eval)('gw'); g.state.run[id!].run = name; g.state.run[id!].flow = 'seats.twice'; location.hash = `#grow/${id}/steps`; }, [passed, run]);
    await page.getByTestId('grow-happened-oneline').waitFor();
    await expect(page.getByTestId('grow-happened-tab-called').textContent()).resolves.toBe('Called out 2');
    const rows = await page.locator('[data-testid="grow-happened"] .gw-drs li').allTextContents();
    expect(rows.map((t) => (t.match(/payments ← \d+/g) ?? []))).toEqual([['payments ← 4900'], [], ['payments ← 900'], []]);
    await page.getByTestId('grow-happened-tab-called').click();
    expect(((await page.getByTestId('grow-happened-panel').textContent()) ?? '').match(/payments POST \/v1\/charges · \d+ usd/g)).toEqual(['payments POST /v1/charges · 4900 usd', 'payments POST /v1/charges · 900 usd']);
    await page.close();
  }, 120_000);
});

/* The seats branch and its base, main: a flow that both have, run once on each. A run counts as made on main only when its app's
   source is main's, by the source digest its launch attested set against the files main's commit holds. */
describe('Whether a flow held on the base branch', () => {
  const mine: string[] = [];
  afterAll(() => { for (const d of mine.splice(0)) rmSync(d, { recursive: true, force: true }); });
  it('counts the saved runs made on the base branch’s source and says how they went, and no other run as one of them', async () => {
    const dir = plotlineSeats(); mine.push(dir);
    const flow = 'billing.upgrade-charges-once', grep = 'tracegrove/billing/upgrade-charges-once.flow.yaml', configPath = join(dir, 'tracegrove.config.yaml');
    const seats = await runTests({ configPath, grep });
    git(dir, 'checkout', '-q', 'main');
    const main = await runTests({ configPath, grep });
    // a branch off main that only adds a source file: a run of main lacks it, so it is not a run of this branch either
    git(dir, 'checkout', '-qb', 'more');
    writeFileSync(join(dir, 'app', 'unused.mjs'), 'export const unused = 1;\n');
    git(dir, 'add', 'app/unused.mjs'); git(dir, 'commit', '-qm', 'An unused module');
    git(dir, 'checkout', '-q', 'seats');
    const [a, b] = [seats.report.cases[0]!.outcome, main.report.cases[0]!.outcome];
    expect([a, b].every((o) => o === 'passed' || o === 'assertion_failed')).toBe(true);
    const d = happenedIn(dir, basename(seats.report.runDir), flow, { base: 'main' })!;
    expect(d.history.saved).toBe(2);
    expect(d.base).toEqual({ branch: 'main', runs: 1, passed: b === 'passed' ? 1 : 0, failed: b === 'passed' ? 0 : 1, notReached: 0 });
    expect(d.historyLine).toBe(`${a === b ? `${a === 'passed' ? 'Passed' : 'Failed'} in all 2 saved runs` : 'Passed 1 of 2 saved runs'}; the 1 made on main ${b === 'passed' ? 'passed' : 'failed'}.`);
    // the run of seats is the one made on seats
    expect(happenedIn(dir, basename(seats.report.runDir), flow, { base: 'seats' })!.base).toMatchObject({ runs: 1, passed: a === 'passed' ? 1 : 0 });
    expect(happenedIn(dir, basename(seats.report.runDir), flow, { base: 'more' })!.base).toMatchObject({ branch: 'more', runs: 0 });
    // a base git cannot read has no run recorded
    const none = happenedIn(dir, basename(seats.report.runDir), flow, { base: 'gone' })!;
    expect(none.base).toEqual({ branch: 'gone', runs: 0, passed: 0, failed: 0, notReached: 0 });
    expect(none.historyLine).toMatch(/; no run on gone is recorded\.$/);
    // the drawer's route takes the base the grow names, and only as a branch name
    const server = await startUi({ dir, branch: 'seats', port: 0, token: TOKEN });
    try {
      const get = (q: string) => fetch(`http://127.0.0.1:${server.port}/api/runs/${basename(seats.report.runDir)}/happened?case=${flow}${q}`, { headers: { 'x-tracegrove-token': TOKEN } });
      const ok = await get('&base=main'); expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ base: { branch: 'main', runs: 1 }, historyLine: d.historyLine });
      expect(await (await get('')).json()).toMatchObject({ base: null });
      for (const bad of ['--output=x', 'main..seats', 'a b']) expect((await get(`&base=${encodeURIComponent(bad)}`)).status, bad).toBe(400);
    } finally { await server.close(); }
  }, 180_000);
});
