import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { grow } from '../src/authoring/grow.ts';
import { expGot } from '../src/authoring/checkCompare.ts';
import { growJsonSummary } from '../src/authoring/growJson.ts';
import { applyGrow, freshGrow, growVerdict, growView, plainTitle, type GrowEvent, type GrowState } from '../src/authoring/growState.ts';
import { readSavedRun } from '../src/authoring/runSource.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { growCommand } from '../src/cli/grow.ts';

/* The notes sample on main, and a branch, checked out, that adds GET /notes/count with two flows that prove it and three
   criteria in its commit. With `buggy`, the count forgets to filter by owner, so "another user counts none" fails at step 3. */
const temps: string[] = [];
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'pipe' }).toString();
function notesCount(buggy: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-evidence-')); temps.push(dir);
  cpSync(join(import.meta.dirname, '..', 'src', 'samples', 'notes-api'), dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Notes sample');
  git(dir, 'checkout', '-qb', 'notes-count');
  const app = join(dir, 'app', 'app.mjs');
  writeFileSync(app, readFileSync(app, 'utf8').replace('  const match = url.pathname.match(', [
    "  if (req.method === 'GET' && url.pathname === '/notes/count') {",
    "    const count = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))" + (buggy ? '' : '.filter((n) => n.ownerId === userId)') + '.length;',
    '    return send(res, 200, { count });',
    '  }',
    '  const match = url.pathname.match('].join('\n')));
  writeFileSync(join(dir, 'tracegrove', 'notes', 'count.flow.yaml'), [
    "title: The note count is the caller's own notes", 'tags: [notes]', 'steps:',
    '  - name: create', '    POST: /notes', '    json: { title: Counted, body: one }', '    expect: 201',
    '  - name: owner counts one', '    GET: /notes/count', '    expect: { status: 200, json: { count: 1 } }',
    '  - name: another user counts none', '    GET: /notes/count', '    as: intruder', '    expect: { status: 200, json: { count: 0 } }',
    '  - name: the owner still counts one', '    GET: /notes/count', '    expect: { status: 200, json: { count: 1 } }', ''].join('\n'));
  writeFileSync(join(dir, 'tracegrove', 'notes', 'count-anonymous.flow.yaml'), [
    'title: Without a token the count is refused', 'tags: [notes]', 'steps:',
    '  - name: anonymous is refused', '    GET: /notes/count', '    as: none', '    expect: 401', ''].join('\n'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', "Count notes\n\n## Acceptance criteria\n- [ ] GET /notes/count returns how many notes the caller owns\n- [ ] Another user's notes are never counted\n- [ ] Without a token the count is refused");
  return dir;
}
const cleanTemps = () => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); };

/* The plotline grow, as saved: s10 failed at its stand-in check, three passed, three have no flow. `edit` may swap or drop events. */
const PLOTLINE = join(import.meta.dirname, 'fixtures', 'grow-logs', 'plotline-seats.jsonl');
function plotline(edit: (e: GrowEvent) => GrowEvent | GrowEvent[] = (e) => e): GrowState {
  const s = freshGrow();
  for (const line of readFileSync(PLOTLINE, 'utf8').split('\n')) if (line.trim()) for (const e of [edit(JSON.parse(line) as GrowEvent)].flat()) applyGrow(s, e);
  return s;
}
const passAll = (e: GrowEvent): GrowEvent => (e.kind === 'scenario.failed' || e.kind === 'scenario.not_run' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.passed', scenario: e.scenario, took: 5, run: `2026-10-22T01-40-00Z_pass_${e.scenario}` } : e);
const noFailure = (e: GrowEvent): GrowEvent[] => (e.kind === 'scenario.failed' ? [] : [e]);
const stop = (s: GrowState, code: string) => applyGrow(s, { v: 'tracegrove.discovery-event/v1', seq: s.last + 1, ms: s.ms, kind: 'discovery.blocked', code, detail: 'stopped', action: 'start it again' });

describe('From a grown scenario to its run', () => {
  let dir = '', state: GrowState, server: UiServer, browser: Browser;
  let failed = '', passed = '', failRun = '', passRun = '';
  const errors: string[] = [];
  beforeAll(async () => {
    dir = notesCount(true);
    ({ state } = await grow({ dir, branch: 'notes-count', base: 'main', mode: 'min', prove: true, gh: false, agent: { off: true } }));
    failed = state.scenarios.find((x) => state.run[x.id]?.st === 'fail')!.id;
    passed = state.scenarios.find((x) => state.run[x.id]?.st === 'pass')!.id;
    failRun = state.run[failed]!.run!; passRun = state.run[passed]!.run!;
    server = await startUi({ dir, branch: 'notes-count', port: 0, token: 'tk-0123456789abcdef' });
    browser = await chromium.launch({ headless: true });
  }, 120_000);
  afterAll(async () => { await browser?.close(); await server?.close(); cleanTemps(); expect(errors).toEqual([]); });

  async function open(hash = '', width = 1440): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url + hash);
    return page;
  }
  const where = (page: Page) => page.evaluate(() => { const w = (0, eval)('({ ui, tab, gw })'); return { tab: w.tab, run: w.ui.runName, sel: w.ui.sel, step: w.ui.step, pinned: w.gw.pinned, hash: location.hash }; });
  const landed = async (page: Page) => { await page.waitForFunction(() => (0, eval)('tab') === 'Run' && !!(0, eval)('ui').run); return where(page); };

  it('records the flow each scenario ran, and the run its result came from', () => {
    expect(state.run[failed]).toMatchObject({ st: 'fail', flow: 'notes.count' });
    expect(state.run[passed]).toMatchObject({ st: 'pass', flow: 'notes.count-anonymous' });
    // The passing run is the newer one: "the latest run" would be the wrong one to show for the failure.
    const runs = readdirSync(join(dir, '.tracegrove', 'runs')).filter((n) => n !== 'latest').sort();
    expect(runs.at(-1)).toBe(passRun);
    expect(failRun).not.toBe(passRun);
  });

  it('opens the failed leaf’s own run at the step that broke, from its card', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    await page.locator(`[data-testid="grow"] svg [data-k="s:${failed}"]`).first().dispatchEvent('click');
    const link = page.locator(`.gw-insw [data-hap="${failed}"]`);
    await expect(link.textContent()).resolves.toBe('See what happened ›');
    await link.click();
    expect(await landed(page)).toMatchObject({ tab: 'Run', run: failRun, sel: 'notes.count', step: 2, hash: `#grow/${failed}/happened/step-3` });
    await expect(page.locator('aside[aria-label="Step detail"]').textContent()).resolves.toContain('notes.count › step 3 of 4');
    await page.close();
  });

  it('shows on the Run tab what the failed check expected and got, and what the app answered, and does not count that step as held', async () => {
    const run = readSavedRun(join(dir, '.tracegrove', 'runs', failRun));
    const steps = run.cases.find((c) => c.caseId === 'notes.count')!.steps;
    expect(steps.map((x) => [x.checks, x.compared ?? null])).toEqual([['pass', null], ['pass', null], ['fail', { check: 'body.count', expected: 0, got: 1 }], ['pass', null]]);
    expect(steps.map((x) => x.answer)).toEqual([expect.stringContaining('"title":"Counted"'), '{"count":1}', '{"count":1}', '{"count":1}']);
    const page = await open(`#grow/${failed}/happened/step-3`);
    await landed(page);
    const detail = page.locator('aside[aria-label="Step detail"]');
    await expect(detail.getByTestId('step-expected').textContent()).resolves.toBe('body.count: 0');
    await expect(detail.getByTestId('step-observed').textContent()).resolves.toBe('body.count: 1');
    await expect(detail.getByTestId('step-answer').textContent()).resolves.toBe('{"count":1}');
    await expect(page.locator('.kpi', { hasText: 'steps held' }).textContent()).resolves.toBe('3 / 4steps held');
    // A step whose check held keeps its own expectation, and says what the app answered.
    await page.locator('button.step').nth(1).click();
    await expect(detail.getByTestId('step-expected').textContent()).resolves.toBe('Status 200');
    await expect(detail.getByTestId('step-answer').textContent()).resolves.toBe('{"count":1}');
    await page.close();
  });

  it('opens the same run from the Outline row, and a passed scenario at its first step', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    await page.getByTestId('grow-view-outline').click();
    await page.locator(`.gb-ols[data-sid="${failed}"]`).first().click();
    await page.locator(`.gb-olin [data-hap="${failed}"]`).click();
    expect(await landed(page)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2 });
    await page.evaluate(() => { (0, eval)('tab="Discover";render()'); });
    await page.locator(`.gb-ols[data-sid="${passed}"]`).first().click();
    await page.locator(`.gb-olin [data-hap="${passed}"]`).click();
    expect(await landed(page)).toMatchObject({ run: passRun, sel: 'notes.count-anonymous', step: 0, hash: `#grow/${passed}/happened/step-1` });
    await page.close();
  });

  it('"Open the runs" opens the first failure’s run, not the latest run', async () => {
    const page = await open();
    await expect(page.getByTestId('grow-open-runs').textContent()).resolves.toBe('Open the runs');
    await page.getByTestId('grow-open-runs').click();
    expect(await landed(page)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2 });
    await page.close();
  });

  it('"Open the runs" is never a dead end: when the first failure’s run is not saved here it says so and opens the next run this grow saved', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    // The failure's run is gone (a grow that proved in a worktree of its own saves its runs there).
    await page.evaluate((id) => { const w = (0, eval)('({ gw })'); w.gw.state.run[id].run = '2026-10-22T00-00-00Z_fail_gone00'; }, failed);
    await page.getByTestId('grow-open-runs').click();
    expect(await landed(page)).toMatchObject({ tab: 'Run', run: passRun, sel: 'notes.count-anonymous' });
    await expect(page.locator('.toast').textContent()).resolves.toBe('The run 2026-10-22T00-00-00Z_fail_gone00 is not saved in this folder any more.');
    await page.close();
    // With none of its runs here, it still opens the Run tab.
    const none = await open();
    await none.getByTestId('grow-result').waitFor();
    await none.evaluate(() => { const w = (0, eval)('({ gw })'); for (const k in w.gw.state.run) if (w.gw.state.run[k].run) w.gw.state.run[k].run = '2026-10-22T00-00-00Z_pass_gone' + k; });
    await none.getByTestId('grow-open-runs').click();
    await none.waitForFunction(() => (0, eval)('tab') === 'Run');
    await none.close();
  });

  it('keeps the selection in the address and brings it back on load', async () => {
    const page = await open(`#grow/${failed}/happened/step-3`);
    expect(await landed(page)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2, hash: `#grow/${failed}/happened/step-3` });
    // Another step chosen in the Run tab moves the address with it.
    await page.locator('button.step').nth(1).click();
    expect((await where(page)).hash).toBe(`#grow/${failed}/happened/step-2`);
    await page.close();
    const again = await open(`#grow/${failed}/happened/step-2`);
    expect(await landed(again)).toMatchObject({ run: failRun, step: 1 });
    await again.close();
    // A selection alone pins it on the grow page, and choosing another moves the address.
    const pinned = await open(`#grow/${passed}`);
    await pinned.waitForFunction((k) => (0, eval)('gw').pinned === k, `s:${passed}`);
    expect(await where(pinned)).toMatchObject({ tab: 'Discover', hash: `#grow/${passed}` });
    await pinned.locator(`[data-testid="grow"] svg [data-k="s:${failed}"]`).first().dispatchEvent('click');
    await pinned.waitForFunction((h) => location.hash === h, `#grow/${failed}`);
    await pinned.close();
  });

  it('says the verdict on its own line above the tree, outside the result band, on one line at 1440 px', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const v = page.getByTestId('grow-verdict');
    const title = plainTitle(state.scenarios.find((x) => x.id === failed)!.title);
    // It names the promise that failed and how, from the run's recorded check: never the title alone, which says the opposite.
    await expect(v.textContent()).resolves.toBe(`✗ Not ready“${title}” failed: expected body.count 0, got 1promises C1, C2See what happened ›`);
    const fit = () => page.evaluate(() => {
      const v = document.querySelector('[data-testid="grow-verdict"]') as HTMLElement, r = v.getBoundingClientRect();
      const tree = document.querySelector('[data-testid="grow"] .gw-tree')!.getBoundingClientRect();
      const kids = Array.from(v.children).map((c) => c.getBoundingClientRect());
      const t = v.querySelector('.gw-vt') as HTMLElement;
      return { inBand: !!v.closest('[data-testid="grow-result"]') || !!v.querySelector('[data-testid="grow-result"]'), above: r.bottom <= tree.top, height: r.height,
        oneLine: kids.every((k) => k.top >= r.top && k.bottom <= r.bottom && k.height <= 44), whole: t.scrollWidth <= t.clientWidth };
    });
    expect(await fit()).toEqual({ inBand: false, above: true, height: 44, oneLine: true, whole: true });
    // The plotline grow's verdict fits the same way.
    const plot = plotline();
    await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: plot, v: growView(plot) });
    await expect(v.textContent()).resolves.toBe('✗ Not ready“Removing a seat never charges the card” failed: expected 2 calls, got 3promise C2See what happened ›');
    expect(await fit()).toEqual({ inBand: false, above: true, height: 44, oneLine: true, whole: true });
    // With its run's recorded check, as the server reads it, the count is said in the route's own word.
    const facts = { step: 4, stepName: 'only the Team upgrade and the added seat were charged', check: 'payments POST /v1/charges call count', expected: 2, got: 3 };
    await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: plot, v: growView(plot, facts) });
    await expect(v.textContent()).resolves.toBe('✗ Not ready“Removing a seat never charges the card” failed: expected 2 charges, got 3promise C2See what happened ›');
    expect(await fit()).toEqual({ inBand: false, above: true, height: 44, oneLine: true, whole: true });
    await page.close();
  });

  it('opens the first failure’s run at its failing step from the verdict', async () => {
    const page = await open();
    await page.getByTestId('grow-verdict-open').click();
    expect(await landed(page)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2, hash: `#grow/${failed}/happened/step-3` });
    await page.close();
  });

  it('keeps the verdict’s place until the scenarios have run, then says Not proven yet or Ready from the same counts', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const v = page.getByTestId('grow-verdict');
    const show = (st: GrowState) => page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: st, v: growView(st) });
    const running = plotline((e) => (e.kind === 'scenario.failed' || e.kind === 'scenario.not_run' || e.kind === 'discovery.finished' ? [] : [e]));
    await show(running);
    await expect(v.textContent()).resolves.toBe('◌ No verdict yetIt comes once the scenarios have run.');
    expect((await v.boundingBox())!.height).toBe(44);
    await show(plotline(noFailure));
    await expect(v.textContent()).resolves.toBe('◌ Not proven yet4 of 7 scenarios in Minimum not tested yet');
    expect(await v.getAttribute('class')).toBe('gw-call open');
    await show(plotline(passAll));
    await expect(v.textContent()).resolves.toBe('✓ Ready7 of 7 scenarios in Minimum passed');
    expect((await v.boundingBox())!.height).toBe(44);
    // A grow that stopped says so in its band; the verdict line stands aside.
    const stopped = plotline(); stop(stopped, 'git_unavailable');
    await show(stopped);
    expect(await v.count()).toBe(0);
    await page.close();
  });
});

describe('The verdict', () => {
  it('is Not ready when a check failed, naming the first failure in plain words with its promise', () => {
    const s = plotline();
    const v = growVerdict(s);
    expect(v).toMatchObject({ verdict: 'not ready', word: 'Not ready', mark: '✗', exitCode: 1, exitMeaning: 'fix', mode: 'Minimum',
      counts: { passed: 3, failed: 1, notTestedYet: 3 }, promises: { hold: 1, of: 5 }, failed: ['s10'], more: 0,
      first: { scenario: 's10', title: 'Removing a seat never charges the card', promise: 'C2', flow: 'seats.remove-seat', run: '2026-10-22T01-39-03Z_fail_504bf8' } });
    expect(v.unproven).toEqual(['s1', 's5', 's6'].map((id) => ({ scenario: id, title: plainTitle(s.scenarios.find((x) => x.id === id)!.title), reason: 'No flow proves this yet' })));
    // It says the promise failed, and how, from what the grow recorded: the title alone would say the opposite of what happened.
    expect(v.text).toBe('“Removing a seat never charges the card” failed: expected 2 calls, got 3');
    expect(v.line).toBe('✗ Not ready: “Removing a seat never charges the card” failed: expected 2 calls, got 3 (promise C2)');
    // The page reads the very same answer.
    expect(growView(s).verdict).toEqual(v);
  });

  it('says how the first failure broke from its run’s recorded check when there is one, in the same words as the page', () => {
    const s = plotline();
    const facts = { step: 4, stepName: 'only the Team upgrade and the added seat were charged', check: 'payments POST /v1/charges call count', expected: 2, got: 3 };
    const v = growVerdict(s, { broke: facts });
    expect(v.first).toMatchObject({ scenario: 's10', step: 4, check: 'payments POST /v1/charges call count', expected: 2, got: 3 });
    expect(v.line).toBe('✗ Not ready: “Removing a seat never charges the card” failed: expected 2 charges, got 3 (promise C2)');
    expect(growView(s, facts).verdict).toEqual(v);
    // Without a recorded check, the first failure's own reason; without that either, it says so.
    expect(growVerdict(s).first).toMatchObject({ step: null, check: null, expected: null, got: null });
    const silent = plotline((e) => (e.kind === 'scenario.failed' ? { ...e, why: '' } : e));
    expect(growVerdict(silent).text).toBe('“Removing a seat never charges the card” failed, with no reason recorded');
    // Only the first line of a long reason.
    const long = plotline((e) => (e.kind === 'scenario.failed' ? { ...e, why: '(app startup): application exited before becoming ready\n    at ModuleLoader.resolve' } : e));
    expect(growVerdict(long).text).toBe('“Removing a seat never charges the card” failed: application exited before becoming ready');
  });

  it('words every expected and got one way: a stand-in count in its route’s word, any other check by its name', () => {
    expect(expGot({ check: 'payments POST /v1/charges call count', expected: 2, got: 3 })).toBe('Expected 2 charges, got 3');
    expect(expGot({ check: 'payments POST /v1/charges call count', expected: 1, got: 2 })).toBe('Expected 1 charge, got 2');
    expect(expGot({ check: 'mail POST /v3/mail/send call count', expected: 1, got: 0 })).toBe('Expected 1 call, got 0');
    expect(expGot({ check: 'billing POST /v1/addresses call count', expected: 1, got: 2 })).toBe('Expected 1 address, got 2');
    expect(expGot({ check: 'body.count', expected: 0, got: 1 })).toBe('Expected body.count 0, got 1');
    expect(expGot({ check: 'body.state', expected: 'open', got: 'closed' })).toBe('Expected body.state "open", got "closed"');
  });

  it('is Not proven yet when nothing failed but a scenario in the mode has no result, and says why for each', () => {
    const v = growVerdict(plotline(noFailure));
    expect(v).toMatchObject({ verdict: 'not proven yet', word: 'Not proven yet', mark: '◌', exitCode: 3, exitMeaning: 'prove more', counts: { passed: 3, failed: 0, notTestedYet: 4 }, first: null });
    // --allow-unproven lets it pass the shell, and changes nothing else.
    expect(growVerdict(plotline(noFailure), { allowUnproven: true })).toEqual({ ...v, exitCode: 0 });
    // It never hides a failure, nor a grow that stopped.
    expect(growVerdict(plotline(), { allowUnproven: true }).exitCode).toBe(1);
    const stopped = plotline(noFailure); stop(stopped, 'git_unavailable');
    expect(growVerdict(stopped, { allowUnproven: true }).exitCode).toBe(2);
    expect(v.unproven.map((x) => [x.scenario, x.reason])).toEqual([['s1', 'No flow proves this yet'], ['s5', 'No flow proves this yet'], ['s6', 'No flow proves this yet'], ['s10', 'It was still running when the grow stopped']]);
    expect(v.line).toBe('◌ Not proven yet: 4 of 7 scenarios in Minimum not tested yet');
  });

  it('is Ready when every scenario in the mode passed', () => {
    const v = growVerdict(plotline(passAll));
    expect(v).toMatchObject({ verdict: 'ready', word: 'Ready', mark: '✓', exitCode: 0, exitMeaning: 'ready', counts: { passed: 7, failed: 0, notTestedYet: 0 }, unproven: [], first: null });
    expect(v.line).toBe('✓ Ready: 7 of 7 scenarios in Minimum passed');
  });

  it('is Not proven yet, never Ready, when the mode holds no scenario: nothing was proved', () => {
    const none = plotline((e) => (e.kind.startsWith('scenario.') ? [] : [e]));
    expect(none.scenarios).toEqual([]);
    const v = growVerdict(none);
    expect(v).toMatchObject({ verdict: 'not proven yet', mark: '◌', exitCode: 3, exitMeaning: 'prove more', counts: { passed: 0, failed: 0, notTestedYet: 0 }, unproven: [], first: null });
    expect(v.line).toBe('◌ Not proven yet: nothing in this change was traced to a scenario');
    // Scenarios only another mode holds do not count for this one.
    const later = plotline((e) => (e.kind === 'scenario.drafted' ? [{ ...e, mode: 'max' }] : [e]));
    expect(growVerdict(later).line).toBe('◌ Not proven yet: nothing in this change was traced to a scenario in Minimum');
    expect(growVerdict(none, { allowUnproven: true }).exitCode).toBe(0);
  });

  it('keeps the codes of a grow that stopped (2) or was cancelled (4), whatever had failed', () => {
    const blocked = plotline(); stop(blocked, 'git_unavailable');
    expect(growVerdict(blocked)).toMatchObject({ verdict: 'stopped', word: 'Stopped', exitCode: 2, exitMeaning: 'blocked' });
    const cancelled = plotline(); stop(cancelled, 'discovery_cancelled');
    expect(growVerdict(cancelled)).toMatchObject({ verdict: 'cancelled', word: 'Cancelled', exitCode: 4, exitMeaning: 'cancelled' });
  });

  it('says titles in plain words: no backticks, and no route a scenario is sent through', () => {
    expect(plainTitle('POST /api/grow: Reader leaves `mid-grow`')).toBe('Reader leaves mid-grow');
    expect(plainTitle('GET /notes/count answers with what callers need')).toBe('GET /notes/count answers with what callers need');
  });

  it('leaves what a run did not record as null in the summary, and lists no evidence for a run that is not here', () => {
    const summary = growJsonSummary(plotline(), mkdtempSync(join(tmpdir(), 'tracegrove-norun-')));
    expect(summary.failures).toEqual([{ scenario: 's10', title: 'Removing a seat never charges the card', promise: 'C2', flow: 'seats.remove-seat', run: '2026-10-22T01-39-03Z_fail_504bf8', saved: false,
      step: null, check: null, expected: null, got: null, says: 'Broke at check “only the Team upgrade and the added seat were charged”: expected 2 calls, got 3. On the route: after POST /seats.', evidence: [] }]);
  });

  it('says a run that could not start in one line, at its stage, never as a failed check or a stack trace', () => {
    const why = "(app startup): application exited before becoming ready; last app output:\n    at ModuleLoader.resolve (node:internal/modules/esm/loader:1)\n  code: 'ERR_MODULE_NOT_FOUND'";
    const s = plotline((e) => { if (e.kind !== 'scenario.failed') return e; const { hop: _h, after: _a, ...rest } = e; return { ...rest, why }; });
    const [f] = growJsonSummary(s, mkdtempSync(join(tmpdir(), 'tracegrove-norun-'))).failures;
    expect(f!.says).toBe('Broke at app startup: application exited before becoming ready.');
    expect(growVerdict(s).text).toBe('“Removing a seat never charges the card” failed: application exited before becoming ready');
  });
});

describe('grow --json and the exit code', () => {
  afterAll(cleanTemps);
  const flags = (dir: string) => ({ dir, branch: 'notes-count', base: 'main', mode: 'min', 'no-gh': true, 'no-agent': true }) as const;

  it('exits 1 when a check failed, and the summary names its run, step and check, what it expected and got, and the evidence files', async () => {
    const dir = notesCount(true);
    const { code, state, summary } = await growCommand({ ...flags(dir), json: true }, () => {});
    expect(code).toBe(1);
    expect(Object.keys(summary!)).toEqual(['verdict', 'exitCode', 'exitMeaning', 'mode', 'counts', 'promises', 'failures', 'unproven', 'stopped']);
    expect(summary).toMatchObject({ verdict: 'not ready', exitCode: 1, exitMeaning: 'fix', mode: 'Minimum', counts: { passed: 1, failed: 1, notTestedYet: 0 }, promises: { hold: 1, of: 3 }, unproven: [], stopped: null });
    const x = state.scenarios.find((y) => y.flow === 'notes.count')!;
    const f = summary!.failures[0]!;
    expect(summary!.failures).toHaveLength(1);
    expect(Object.keys(f)).toEqual(['scenario', 'title', 'promise', 'flow', 'run', 'saved', 'step', 'check', 'expected', 'got', 'says', 'evidence']);
    expect(f).toMatchObject({ scenario: x.id, title: plainTitle(x.title), promise: 'C1, C2', flow: 'notes.count', run: state.run[x.id]!.run, saved: true, step: 3, check: 'body.count', expected: 0, got: 1 });
    // The sentence is built from those recorded fields, in the page's words.
    expect(f.says).toBe('Expected body.count 0, got 1. Step 3 (another user counts none) broke it.');
    expect(f.evidence.map((p) => p.split('/').pop())).toEqual(['summary.json', 'receipt.json', 'assertions.json', 'boundaries.json', 'events.jsonl']);
    for (const p of f.evidence) { expect(p.startsWith(`.tracegrove/runs/${f.run}/`)).toBe(true); expect(existsSync(join(dir, p))).toBe(true); }
    // What it got is the run's own recorded value: the failing check recorded [status, body.count].
    const recorded = (JSON.parse(readFileSync(join(dir, f.evidence[2]!), 'utf8')) as Array<{ result: string; reasonCode: string; actual: unknown }>).filter((a) => a.result === 'fail');
    expect(recorded.map((a) => [a.reasonCode, a.actual])).toEqual([['body.count differs', [200, 1]]]);
  }, 60_000);

  it('prints the log, the state and the summary with --json from the command line, and exits with the verdict’s code', () => {
    const dir = notesCount(true);
    const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'), 'grow', '--dir', dir, '--branch', 'notes-count', '--base', 'main', '--mode', 'min', '--no-gh', '--no-agent', '--json'],
      { encoding: 'utf8', timeout: 60_000 });
    expect(child.status).toBe(1);
    const printed = JSON.parse(child.stdout) as { log: string; state: GrowState; summary: { verdict: string; exitCode: number; failures: Array<{ step: number }> } };
    expect(Object.keys(printed)).toEqual(['log', 'state', 'summary']);
    expect(printed.log).toBe('.tracegrove/discovery/notes-count.jsonl');
    expect(printed.state.done).toBeTruthy();
    expect(printed.summary).toMatchObject({ verdict: 'not ready', exitCode: 1, failures: [{ step: 3 }] });
  }, 90_000);

  it('prints a failure’s verdict as its last line: the promise that failed, and what its check expected and got', async () => {
    const dir = notesCount(true);
    let out = '';
    const { code, state } = await growCommand(flags(dir), (t) => { out += t; });
    expect(code).toBe(1);
    const x = state.scenarios.find((y) => y.flow === 'notes.count')!;
    expect(out.trimEnd().split('\n').at(-1)).toBe(`✗ Not ready: “${plainTitle(x.title)}” failed: expected body.count 0, got 1 (promises C1, C2)`);
  }, 60_000);

  it('exits 0 and says Ready when every scenario in the mode passed, and prints the verdict as the last line', async () => {
    const dir = notesCount(false);
    let out = '';
    const { code } = await growCommand(flags(dir), (t) => { out += t; });
    expect(code).toBe(0);
    expect(out.trimEnd().split('\n').at(-1)).toBe('✓ Ready: 2 of 2 scenarios in Minimum passed');
    const { summary } = await growCommand({ ...flags(dir), json: true }, () => {});
    expect(summary).toMatchObject({ verdict: 'ready', exitCode: 0, exitMeaning: 'ready', counts: { passed: 2, failed: 0, notTestedYet: 0 }, failures: [], unproven: [] });
  }, 60_000);

  it('exits 3 and says Not proven yet when the scenarios were not run, with the reason for each; --allow-unproven exits 0', async () => {
    const dir = notesCount(false);
    let out = '';
    const { code, state, summary } = await growCommand({ ...flags(dir), 'no-prove': true, json: true }, (t) => { out += t; });
    expect(code).toBe(3);
    expect(out).toBe('');
    const min = state.scenarios.filter((x) => x.mode === 'min');
    expect(summary).toMatchObject({ verdict: 'not proven yet', exitCode: 3, exitMeaning: 'prove more', counts: { passed: 0, failed: 0, notTestedYet: min.length }, failures: [] });
    // Each reason is an instruction grow takes: there is no --prove flag, only --no-prove to leave out.
    expect(summary!.unproven).toEqual(min.map((x) => ({ scenario: x.id, title: plainTitle(x.title), reason: `Run grow without --no-prove to run ${x.flow}` })));
    let said = '';
    const allowed = await growCommand({ ...flags(dir), 'no-prove': true, 'allow-unproven': true }, (t) => { said += t; });
    expect(allowed.code).toBe(0);
    expect(said.trimEnd().split('\n').at(-1)).toBe(`◌ Not proven yet: ${min.length} of ${min.length} scenarios in Minimum not tested yet`);
    expect((await growCommand({ ...flags(dir), 'no-prove': true, 'allow-unproven': true, json: true }, () => {})).summary).toMatchObject({ verdict: 'not proven yet', exitCode: 0, exitMeaning: 'prove more' });
  }, 60_000);

  it('exits 3 and says Not proven yet when the change grows no scenario, as a change to only its docs does', async () => {
    const dir = notesCount(false);
    git(dir, 'checkout', '-qb', 'docs-only', 'main');
    writeFileSync(join(dir, 'README.md'), '# Notes\n\nA small notes API.\n'); writeFileSync(join(dir, 'NOTES.md'), 'Release notes.\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Docs');
    let out = '';
    const { code, state } = await growCommand({ ...flags(dir), branch: 'docs-only' }, (t) => { out += t; });
    expect(state.blocked).toBeNull();
    expect(state.scenarios.filter((x) => x.mode === 'min')).toEqual([]);
    expect(code).toBe(3);
    expect(out.trimEnd().split('\n').at(-1)).toMatch(/^◌ Not proven yet: nothing in this change was traced to a scenario/);
    const { summary } = await growCommand({ ...flags(dir), branch: 'docs-only', json: true }, () => {});
    expect(summary).toMatchObject({ verdict: 'not proven yet', exitCode: 3, exitMeaning: 'prove more', counts: { passed: 0, failed: 0, notTestedYet: 0 }, failures: [], unproven: [] });
  }, 60_000);

  it('tells the page’s reader to turn proving on with the page’s own control, and reads old logs’ --prove as the flag grow takes', async () => {
    const dir = notesCount(false);
    const { state } = await grow({ dir, branch: 'notes-count', base: 'main', mode: 'min', prove: false, gh: false, agent: { off: true }, save: false, proveOn: 'Grow again with “Prove with real flows” on' });
    const min = state.scenarios.filter((x) => x.mode === 'min');
    expect(min.map((x) => state.run[x.id]!.why)).toEqual(min.map((x) => `Grow again with “Prove with real flows” on to run ${x.flow}`));
    // The page's server says it that way.
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' });
    try {
      const r = await fetch(`${server.url}api/grow`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tracegrove-token': 'tk-0123456789abcdef' }, body: JSON.stringify({ branch: 'notes-count', base: 'main', prove: false, agent: false, mode: 'min' }) });
      const text = await r.text();
      const notRun = text.split('\n').filter((l) => l.startsWith('data: ') && l.includes('"scenario.not_run"')).map((l) => (JSON.parse(l.slice(6)) as { why: string }).why);
      expect(notRun.length).toBeGreaterThan(0);
      for (const why of notRun) expect(why).toMatch(/^(Grow again with “Prove with real flows” on to run \S+|No flow proves this yet)$/);
    } finally { await server.close(); }
    // A log saved before this read "Run with --prove", a flag grow never took.
    const old = freshGrow();
    for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', 'tracegrove-max.jsonl'), 'utf8').split('\n')) if (line.trim()) applyGrow(old, JSON.parse(line) as GrowEvent);
    const reasons = growVerdict(old).unproven.map((x) => x.reason);
    expect(reasons).toContain('Run grow without --no-prove to run browser.grow');
    expect(reasons.filter((x) => x.includes('--prove ') || x.startsWith('Run with'))).toEqual([]);
  }, 60_000);

  it('says why a grow stopped and what to do, and the mode asked for, so an agent can act on the summary alone', async () => {
    const dir = notesCount(false);
    const { code, summary } = await growCommand({ ...flags(dir), branch: 'main', mode: 'max', json: true }, () => {});
    expect(code).toBe(2);
    expect(summary).toMatchObject({ verdict: 'stopped', exitCode: 2, exitMeaning: 'blocked', mode: 'Max', failures: [], unproven: [] });
    expect(summary!.stopped).toEqual({ code: expect.any(String), detail: expect.any(String), action: expect.any(String) });
    // Stopped before choosing, with no mode asked for, it names none.
    const early = plotline((e) => (e.kind === 'mode.chosen' || e.kind === 'discovery.finished' || e.kind.startsWith('scenario.') && e.kind !== 'scenario.drafted' ? [] : [e]));
    stop(early, 'no_changes');
    const none = growJsonSummary(early, dir);
    expect(none).toMatchObject({ verdict: 'stopped', mode: null, stopped: { code: 'no_changes', detail: 'stopped', action: 'start it again' } });
    expect(growJsonSummary(early, dir, { mode: 'std' }).mode).toBe('Standard');
    // Once it chose, the mode it chose.
    const chosen = plotline(); stop(chosen, 'git_unavailable');
    expect(growJsonSummary(chosen, dir, { mode: 'max' }).mode).toBe('Minimum');
  }, 60_000);

  it('still exits 1 for a failed check with --allow-unproven, and takes the flag from the command line', () => {
    const dir = notesCount(true);
    const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'), 'grow', '--dir', dir, '--branch', 'notes-count', '--base', 'main', '--mode', 'min', '--no-gh', '--no-agent', '--allow-unproven', '--json'],
      { encoding: 'utf8', timeout: 60_000 });
    expect(child.status).toBe(1);
    expect((JSON.parse(child.stdout) as { summary: { exitCode: number } }).summary.exitCode).toBe(1);
    const unproved = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'), 'grow', '--dir', dir, '--branch', 'notes-count', '--base', 'main', '--mode', 'min', '--no-gh', '--no-agent', '--no-prove'],
      { encoding: 'utf8', timeout: 60_000 });
    expect(unproved.status).toBe(3);
    expect(unproved.stdout.trimEnd().split('\n').at(-1)).toMatch(/^◌ Not proven yet: \d+ of \d+ scenarios in Minimum not tested yet$/);
  }, 120_000);
});
