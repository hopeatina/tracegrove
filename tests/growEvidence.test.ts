import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { attributeWritten, grow, writtenFlowResult } from '../src/authoring/grow.ts';
import type { ChangeUnit } from '../src/authoring/growChange.ts';
import { draftWithAgent, type ProvedFlow } from '../src/authoring/workspace.ts';
import { expGot } from '../src/authoring/checkCompare.ts';
import { failureWords, growJsonSummary, verdictFacts } from '../src/authoring/growJson.ts';
import { applyGrow, freshGrow, growVerdict, growView, inMode, plainTitle, type GrowEvent, type GrowState, type VerdictFacts } from '../src/authoring/growState.ts';
import { configRunsRoot } from '../src/authoring/runLocation.ts';
import * as atomicFiles from '../src/core/atomicFiles.ts';
import { readSavedRun } from '../src/authoring/runSource.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { growCommand } from '../src/cli/grow.ts';
import { plainLine } from '../src/cli/renderGrove.ts';

/* The notes sample on main, and a branch, checked out, that adds GET /notes/count with two flows that prove it and three
   criteria in its commit. With `buggy`, the count forgets to filter by owner, so "another user counts none" fails at step 3.
   With `sub`, the project (its config, flows and app) sits in that subfolder of the repo, as a dogfood project does. */
const temps: string[] = [];
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'pipe' }).toString();
function notesCount(buggy: boolean, sub = ''): string {
  const repo = mkdtempSync(join(tmpdir(), 'tracegrove-evidence-')); temps.push(repo);
  const dir = sub ? join(repo, sub) : repo;
  cpSync(join(import.meta.dirname, '..', 'src', 'samples', 'notes-api'), dir, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main'); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'Notes sample');
  git(repo, 'checkout', '-qb', 'notes-count');
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
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', "Count notes\n\n## Acceptance criteria\n- [ ] GET /notes/count returns how many notes the caller owns\n- [ ] Another user's notes are never counted\n- [ ] Without a token the count is refused");
  return repo;
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
  /* What happened, in the drawer beside the tree, once it has read the run (or said why it could not) */
  const drawn = async (page: Page) => {
    await page.getByTestId('grow-happened-oneline').or(page.getByTestId('grow-happened-none')).or(page.locator('.gw-drerr')).waitFor();
    return page.evaluate(() => { const w = (0, eval)('({ gw, tab })'); return { tab: w.tab, sid: w.gw.dr?.sid, run: w.gw.dr?.run, step: w.gw.dr?.step, hash: location.hash }; });
  };

  it('records the flow each scenario ran, and the run its result came from', () => {
    expect(state.run[failed]).toMatchObject({ st: 'fail', flow: 'notes.count' });
    expect(state.run[passed]).toMatchObject({ st: 'pass', flow: 'notes.count-anonymous' });
    // The passing run is the newer one: "the latest run" would be the wrong one to show for the failure.
    const runs = readdirSync(join(dir, '.tracegrove', 'runs')).filter((n) => n !== 'latest').sort();
    expect(runs.at(-1)).toBe(passRun);
    expect(failRun).not.toBe(passRun);
  });

  it('opens what happened in the failed leaf’s own run, in the drawer on the step that broke, from its card; Run tab ↗ opens that run there', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    await page.locator(`[data-testid="grow"] svg [data-k="s:${failed}"]`).first().dispatchEvent('click');
    const link = page.locator(`.gw-insw [data-hap="${failed}"]`);
    await expect(link.textContent()).resolves.toBe('See what happened ›');
    await link.click();
    expect(await drawn(page)).toEqual({ tab: 'Discover', sid: failed, run: failRun, step: 2, hash: `#grow/${failed}/happened/step-3` });
    await expect(page.getByTestId('grow-happened-step-3').getAttribute('aria-pressed')).resolves.toBe('true');
    // From the drawer, the Run tab at the same run and step
    await page.getByTestId('grow-happened-runtab').click();
    expect(await landed(page)).toMatchObject({ tab: 'Run', run: failRun, sel: 'notes.count', step: 2, hash: `#grow/${failed}/run/step-3` });
    await expect(page.locator('aside[aria-label="Step detail"]').textContent()).resolves.toContain('notes.count › step 3 of 4');
    await page.close();
  });

  it('shows on the Run tab what the failed check expected and got, and what the app answered, and does not count that step as held', async () => {
    const run = readSavedRun(join(dir, '.tracegrove', 'runs', failRun));
    const steps = run.cases.find((c) => c.caseId === 'notes.count')!.steps;
    expect(steps.map((x) => [x.checks, x.compared ?? null])).toEqual([['pass', null], ['pass', null], ['fail', { check: 'body.count', expected: 0, got: 1 }], ['pass', null]]);
    expect(steps.map((x) => x.answer)).toEqual([expect.stringContaining('"title":"Counted"'), '{"count":1}', '{"count":1}', '{"count":1}']);
    const page = await open(`#grow/${failed}/run/step-3`);
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

  it('reads the first failure’s recorded check once per saved run, and again while its run is not here', () => {
    const cache = new Map<string, VerdictFacts>();
    const facts = verdictFacts(state, dir, cache);
    expect(facts).toMatchObject({ step: 3, stepName: 'another user counts none', check: 'body.count', expected: 0, got: 1 });
    expect(cache.size).toBe(1);
    expect(verdictFacts(state, dir, cache)).toBe(facts);
    const elsewhere = new Map<string, VerdictFacts>();
    expect(verdictFacts(state, mkdtempSync(join(tmpdir(), 'tracegrove-norun-')), elsewhere)).toMatchObject({ step: null, check: null });
    expect(elsewhere.size).toBe(0);
  });

  it('opens the same run in the drawer from the Outline row, and a passed scenario at its first step', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    await page.getByTestId('grow-view-outline').click();
    await page.locator(`.gb-ols[data-sid="${failed}"]`).first().click();
    await page.locator(`.gb-olin [data-hap="${failed}"]`).click();
    expect(await drawn(page)).toMatchObject({ tab: 'Discover', sid: failed, run: failRun, step: 2 });
    await page.getByTestId('grow-happened-close').click();
    await page.locator(`.gb-ols[data-sid="${passed}"]`).first().click();
    await page.locator(`.gb-olin [data-hap="${passed}"]`).click();
    expect(await drawn(page)).toEqual({ tab: 'Discover', sid: passed, run: passRun, step: 0, hash: `#grow/${passed}/happened/step-1` });
    await page.close();
  });

  it('offers each listed row that ran its run before the row is opened, beside the reason a failed one broke', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const list = page.getByTestId('grow-scenarios');
    // The failed row: its reason, then the way to its run, with nothing opened.
    const broke = list.locator(`.gb-ols[data-sid="${failed}"] + .err + .gb-hapr [data-hap="${failed}"]`);
    await expect(broke.textContent()).resolves.toBe('See what happened ›');
    await expect(list.locator(`.gb-ols[data-sid="${passed}"] + .gb-hapr [data-hap="${passed}"]`).count()).resolves.toBe(1);
    await broke.click();
    expect(await drawn(page)).toMatchObject({ tab: 'Discover', sid: failed, run: failRun, step: 2 });
    await page.close();
    // Opened in place, the row says it once, in its body.
    const again = await open();
    await again.getByTestId('grow-result').waitFor();
    await again.getByTestId('grow-scenarios').locator(`.gb-ols[data-sid="${passed}"]`).click();
    await expect(again.getByTestId('grow-scenarios').locator(`[data-hap="${passed}"]`).count()).resolves.toBe(1);
    await again.getByTestId('grow-scenarios').locator(`.gb-olin [data-hap="${passed}"]`).click();
    expect(await drawn(again)).toMatchObject({ tab: 'Discover', sid: passed, run: passRun, step: 0 });
    await again.close();
  });

  it('opens the run of a scenario that never reached its checks in the drawer from its card, to show why it is not tested yet', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    await page.evaluate(({ id, run }) => {
      const w = (0, eval)('({ gw, growPaint })');
      w.gw.state.run[id] = { st: 'not_run', why: 'Could not run: the app did not start (application exited before becoming ready)', run, flow: 'notes.count-anonymous' };
      w.gw.pinned = 's:' + id; w.growPaint();
    }, { id: passed, run: passRun });
    await page.locator(`.gw-insw [data-hap="${passed}"]`).click();
    expect(await drawn(page)).toEqual({ tab: 'Discover', sid: passed, run: passRun, step: 0, hash: `#grow/${passed}/happened/step-1` });
    await page.getByTestId('grow-happened-runtab').click();
    expect(await landed(page)).toMatchObject({ run: passRun, sel: 'notes.count-anonymous', step: 0, hash: `#grow/${passed}/run/step-1` });
    await page.close();
  });

  it('"Open the runs" opens the first failure’s run in the drawer, not the latest run', async () => {
    const page = await open();
    await expect(page.getByTestId('grow-open-runs').textContent()).resolves.toBe('Open the runs');
    await page.getByTestId('grow-open-runs').click();
    expect(await drawn(page)).toMatchObject({ tab: 'Discover', sid: failed, run: failRun, step: 2 });
    await page.close();
  });

  it('"Open the runs" is never a dead end: when the first failure’s run is not saved here the drawer says so and still offers to rerun it, and with no failure it opens the next run this grow saved', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    // The failure's run is gone (a grow that proved in a worktree of its own saves its runs there).
    await page.evaluate((id) => { const w = (0, eval)('({ gw })'); w.gw.state.run[id].run = '2026-10-22T00-00-00Z_fail_gone00'; }, failed);
    await page.getByTestId('grow-open-runs').click();
    expect(await drawn(page)).toMatchObject({ tab: 'Discover', sid: failed, run: '2026-10-22T00-00-00Z_fail_gone00' });
    await expect(page.locator('.gw-drerr').textContent()).resolves.toBe('The run 2026-10-22T00-00-00Z_fail_gone00 is not saved in this folder any more.');
    await expect(page.getByTestId('grow-happened-rerun').isDisabled()).resolves.toBe(false);
    await page.close();
    // With no failure, the newest run this grow saved, in the Run tab: when it is gone it says so and opens the next one.
    const next = await open();
    await next.getByTestId('grow-result').waitFor();
    await next.evaluate(({ f, p }) => { const w = (0, eval)('({ gw })'); w.gw.state.run[f].st = 'pass'; w.gw.state.run[p].run = '2026-12-31T00-00-00Z_pass_gone00'; }, { f: failed, p: passed });
    await next.getByTestId('grow-open-runs').click();
    expect(await landed(next)).toMatchObject({ tab: 'Run', run: failRun, sel: 'notes.count' });
    await expect(next.locator('.toast').textContent()).resolves.toBe('The run 2026-12-31T00-00-00Z_pass_gone00 is not saved in this folder any more.');
    await next.close();
    // With none of its runs here, it still opens the Run tab.
    const none = await open();
    await none.getByTestId('grow-result').waitFor();
    await none.evaluate(() => { const w = (0, eval)('({ gw })'); for (const k in w.gw.state.run) if (w.gw.state.run[k].run) { w.gw.state.run[k].st = 'pass'; w.gw.state.run[k].run = '2026-10-22T00-00-00Z_pass_gone' + k; } });
    await none.getByTestId('grow-open-runs').click();
    await none.waitForFunction(() => (0, eval)('tab') === 'Run');
    await none.close();
  });

  it('keeps the selection in the address and brings it back on load', async () => {
    const page = await open(`#grow/${failed}/happened/step-3`);
    expect(await drawn(page)).toEqual({ tab: 'Discover', sid: failed, run: failRun, step: 2, hash: `#grow/${failed}/happened/step-3` });
    // Another step chosen in the drawer moves the address with it.
    await page.getByTestId('grow-happened-step-2').click();
    expect((await where(page)).hash).toBe(`#grow/${failed}/happened/step-2`);
    await page.close();
    const again = await open(`#grow/${failed}/happened/step-2`);
    expect(await drawn(again)).toMatchObject({ sid: failed, run: failRun, step: 1 });
    await again.close();
    // The Run tab has its own address, and another step chosen there moves it.
    const run = await open(`#grow/${failed}/run/step-3`);
    expect(await landed(run)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2, hash: `#grow/${failed}/run/step-3` });
    await run.locator('button.step').nth(1).click();
    expect((await where(run)).hash).toBe(`#grow/${failed}/run/step-2`);
    await run.close();
    // A selection alone pins it on the grow page, and choosing another moves the address.
    const pinned = await open(`#grow/${passed}`);
    await pinned.waitForFunction((k) => (0, eval)('gw').pinned === k, `s:${passed}`);
    expect(await where(pinned)).toMatchObject({ tab: 'Discover', hash: `#grow/${passed}` });
    await pinned.locator(`[data-testid="grow"] svg [data-k="s:${failed}"]`).first().dispatchEvent('click');
    await pinned.waitForFunction((h) => location.hash === h, `#grow/${failed}`);
    await pinned.close();
  });

  it('says the verdict on its own block beside the tree, outside the result line and above it, its parts whole inside it, at 1440 px', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const v = page.getByTestId('grow-verdict');
    const title = plainTitle(state.scenarios.find((x) => x.id === failed)!.title);
    // It names the promise that failed and how, from the run's recorded check: never the title alone, which says the opposite.
    await expect(v.textContent()).resolves.toBe(`✗ Not ready“${title}” failed: expected body.count 0, got 1breaks: GET /notes/count return…; Another user's notes ar…`);
    // the chip is shortened; the promises it breaks are whole in its title
    await expect(v.locator('.gw-vc').getAttribute('title')).resolves.toBe("GET /notes/count returns how many notes the caller owns; Another user's notes are never counted");
    const fit = () => page.evaluate(() => {
      const v = document.querySelector('[data-testid="grow-verdict"]') as HTMLElement, r = v.getBoundingClientRect();
      const tree = document.querySelector('[data-testid="grow"] .gw-tree')!.getBoundingClientRect();
      const kids = Array.from(v.children).map((c) => c.getBoundingClientRect());
      const t = v.querySelector('.gw-vt') as HTMLElement, res = document.querySelector('[data-testid="grow-result"]')!.getBoundingClientRect();
      // at 1440 px the verdict heads the left column, level with the tree's top, and the result line is its quiet second line under it
      return { inBand: !!v.closest('[data-testid="grow-result"]') || !!v.querySelector('[data-testid="grow-result"]'), beside: r.right <= tree.left && r.top === tree.top, overResult: r.bottom <= res.top,
        inside: kids.every((k) => k.top >= r.top && k.bottom <= r.bottom && k.left >= r.left && k.right <= r.right), whole: t.scrollWidth <= t.clientWidth };
    });
    expect(await fit()).toEqual({ inBand: false, beside: true, overResult: true, inside: true, whole: true });
    // The plotline grow's verdict fits the same way.
    const plot = plotline();
    await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: plot, v: growView(plot) });
    await expect(v.textContent()).resolves.toBe('✗ Not ready“Removing a seat never charges the card” failed: expected 2 calls, got 3breaks: Removing a seat never charges…');
    expect(await fit()).toEqual({ inBand: false, beside: true, overResult: true, inside: true, whole: true });
    // With its run's recorded check, as the server reads it, the count is said in the route's own word.
    const facts = { step: 4, stepName: 'only the Team upgrade and the added seat were charged', check: 'payments POST /v1/charges call count', expected: 2, got: 3 };
    await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: plot, v: growView(plot, facts) });
    await expect(v.textContent()).resolves.toBe('✗ Not ready“Removing a seat never charges the card” failed: expected 2 charges, got 3breaks: Removing a seat never charges…');
    expect(await fit()).toEqual({ inBand: false, beside: true, overResult: true, inside: true, whole: true });
    await page.close();
  });

  it('opens the first failure’s run in the drawer at its failing step from the verdict', async () => {
    const page = await open();
    await page.getByTestId('grow-verdict-open').click();
    expect(await drawn(page)).toEqual({ tab: 'Discover', sid: failed, run: failRun, step: 2, hash: `#grow/${failed}/happened/step-3` });
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
    expect((await v.boundingBox())!.height).toBe(79);
    await show(plotline(noFailure));
    await expect(v.textContent()).resolves.toBe('◌ Not proven yet4 of 7 scenarios in Minimum not tested yet');
    expect(await v.getAttribute('class')).toBe('gw-call open');
    await show(plotline(passAll));
    await expect(v.textContent()).resolves.toBe('✓ Ready7 of 7 scenarios in Minimum passed');
    expect((await v.boundingBox())!.height).toBe(79);
    // A grow that stopped says so in its band; the verdict line stands aside.
    const stopped = plotline(); stop(stopped, 'git_unavailable');
    await show(stopped);
    expect(await v.count()).toBe(0);
    await page.close();
  });

  it('offers one next action beside Not proven yet that works where nothing failed: why a run could not run, Prove it, or Write this flow', async () => {
    const show = (page: Page, st: GrowState) => page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: st, v: growView(st) });
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const next = page.getByTestId('grow-verdict-next');
    // s10's run never reached its checks: the drawer says why, and the Not tested yet list words it could not run, not flow ready
    const crashed = plotline((e) => (e.kind === 'scenario.failed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: e.scenario, run: e.run, outcome: 'infrastructure_failed',
      why: 'Could not run: the app did not start (application exited before becoming ready)' } as GrowEvent : e));
    await show(page, crashed);
    await expect(page.getByTestId('grow-verdict').textContent()).resolves.toMatch(/^◌ Not proven yet/);
    await expect(next.count()).resolves.toBe(1);
    // beside the verdict line, never inside it
    expect(await next.evaluate((b) => !b.closest('[data-testid="grow-verdict"]'))).toBe(true);
    await expect(next.textContent()).resolves.toBe('See why it could not run ›');
    await expect(page.getByTestId('grow-result').textContent()).resolves.toBe('3 passed · 4 not tested yet · 1 of 5 promises hold · Open the runs');
    await expect(page.getByTestId('grow-untested').locator('li .w').allTextContents()).resolves.toEqual(['could not run', 'no flow yet', 'no flow yet', 'no flow yet']);
    await next.click();
    await page.locator('.gw-drerr').or(page.getByTestId('grow-happened-oneline')).waitFor();
    expect(await page.evaluate(() => (0, eval)('gw').dr.sid)).toBe('s10');
    await page.close();
    // a flow that has not run: grow again with proving on, in the mode it was grown in
    const prove = await open();
    await prove.getByTestId('grow-result').waitFor();
    const posted: unknown[] = [];
    await prove.route('**/api/grow', (r) => { if (r.request().method() !== 'POST') return r.fallback(); posted.push(r.request().postDataJSON()); return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'held by the test' }) }); });
    await show(prove, plotline(noFailure));
    await expect(prove.getByTestId('grow-verdict-next').textContent()).resolves.toBe('Prove it');
    await prove.getByTestId('grow-verdict-next').click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({ prove: true, mode: 'min', base: 'main' });
    await prove.close();
    // nothing left with a flow: write the first scenario's flow, its claim in the Intent box
    const write = await open();
    await write.getByTestId('grow-result').waitFor();
    const noFlow = plotline((e) => (e.kind === 'scenario.failed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.passed', scenario: e.scenario, took: 5, run: e.run } as GrowEvent : e));
    await show(write, noFlow);
    await expect(write.getByTestId('grow-verdict-next').textContent()).resolves.toBe('Write this flow');
    await write.getByTestId('grow-verdict-next').click();
    await write.waitForFunction(() => document.activeElement?.id === 'intent');
    const first = noFlow.scenarios.find((x) => inMode(noFlow, x) && !x.flow)!;
    expect(await write.evaluate(() => (document.getElementById('intent') as HTMLTextAreaElement).value)).toBe((first.proves ?? first.title).replaceAll('`', ''));
    // nothing ran: there is no run to open, so the band offers none, and the next action still works
    const idle = plotline((e) => (e.kind === 'scenario.failed' || e.kind === 'scenario.passed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: e.scenario, why: 'Stopped before it ran' } as GrowEvent : e));
    await show(write, idle);
    await expect(write.getByTestId('grow-open-runs').count()).resolves.toBe(0);
    await expect(write.getByTestId('grow-verdict-next').textContent()).resolves.toBe('Prove it');
    await expect(write.getByTestId('grow-verdict-next').isDisabled()).resolves.toBe(false);
    await write.close();
  });

  it('counts in the result line and words in the Not tested yet list why each scenario is not tested yet as the verdict and grow --json say it: could not run from its reason, and a flow an agent wrote as a flow', async () => {
    const show = (page: Page, st: GrowState) => page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: st, v: growView(st) });
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const big = () => page.getByTestId('grow-result').textContent();
    const words = () => page.getByTestId('grow-untested').locator('li .w').allTextContents();
    const reasons = (st: GrowState) => Object.fromEntries(growJsonSummary(st, mkdtempSync(join(tmpdir(), 'tracegrove-norun-'))).unproven.map((u) => [u.scenario, u.reason]));
    // s10's run checked what it should, but its evidence did not verify: it is not proven, and never "could not run"
    const unverified = plotline((e) => (e.kind === 'scenario.failed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: e.scenario, run: e.run, outcome: 'passed',
      why: 'Not proven: the run evidence did not verify' } as GrowEvent : e));
    expect(reasons(unverified).s10).toBe('Not proven: the run evidence did not verify');
    await show(page, unverified);
    await expect(big()).resolves.toBe('3 passed · 4 not tested yet · 1 of 5 promises hold · Open the runs');
    await expect(words()).resolves.toEqual(['flow ready (not run)', 'no flow yet', 'no flow yet', 'no flow yet']);
    // s1 has no flow of its own; an agent wrote one and ran it, and the app did not start: it could not run, as grow --json says
    const s1 = plotline().scenarios.find((x) => x.id === 's1')!;
    expect(s1.flow).toBeFalsy();
    const written = plotline((e) => (e.kind === 'scenario.not_run' && e.scenario === 's1' ? [
      { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.running', scenario: 's1', flow: 'discovered.seats-panel' } as GrowEvent,
      { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: 's1', run: '2026-10-22T01-41-00Z_error_s1', outcome: 'infrastructure_failed',
        why: 'Could not run: the app did not start (application exited before becoming ready)' } as GrowEvent] : e));
    expect(written.run.s1).toMatchObject({ st: 'not_run', flow: 'discovered.seats-panel' });
    expect(reasons(written).s1).toMatch(/^Could not run: the app did not start/);
    await show(page, written);
    await expect(big()).resolves.toBe('3 passed · 1 failed · 3 not tested yet · 1 of 5 promises hold · Open the runs');
    await expect(words()).resolves.toEqual(['could not run', 'no flow yet', 'no flow yet']);
    await page.close();
  });

  /* A scenario with no result, selected, as its row under Journeys, its card beside the tree, its leaf and the key say it */
  const said = (page: Page, sid: string) => page.evaluate((id) => {
    const t = (e: Element | null | undefined) => (e ? e.textContent!.replace(/\s+/g, ' ').trim() : null);
    const card = document.querySelector('[data-testid="grow-inspector"]'), leaf = document.querySelector(`[data-testid="grow"] svg [data-k="s:${id}"]`);
    return {
      band: t(document.querySelector('[data-testid="grow-result"]')),
      untested: Array.from(document.querySelectorAll('[data-testid="grow-untested"] li .w')).map((e) => t(e)),
      row: t(document.querySelector(`.gb-ols[data-sid="${id}"] .gw-badge`)),
      card: t(card?.querySelector('.sec .row .gw-badge')),
      why: t(card?.querySelector('[data-testid="grow-card-why"]')),
      write: !!card?.querySelector('[data-testid="grow-card-write"]'),
      proof: Array.from(card?.querySelectorAll('.gw-chip.built, .gw-chip.missing') ?? []).map((e) => t(e)),
      leaf: leaf?.getAttribute('aria-label')?.replace(/^Scenario: [^,]*, /, '') ?? null,
      mark: leaf ? ['idle', 'none'].find((c) => leaf.classList.contains(c)) ?? null : null,
      live: Array.from(document.querySelectorAll('[data-testid="grow-key"] li')).map((e) => t(e)),
      key: Array.from(document.querySelectorAll('.gw-legend .gw-li, .gb-olkey .gw-li')).map((e) => t(e)).filter((w) => /^flow ready/.test(w ?? '')),
    };
  }, sid);
  const pinned = (page: Page, st: GrowState, sid: string) => page.evaluate(({ s, v, id }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.pinned = 's:' + id; w.gw.dr = null; w.gw.howOpen = true; w.growPaint(); }, { s: st, v: growView(st), id: sid });
  const reasonsOf = (st: GrowState) => Object.fromEntries(growJsonSummary(st, mkdtempSync(join(tmpdir(), 'tracegrove-words-'))).unproven.map((u) => [u.scenario, u.reason]));
  const APP = 'Could not run: the app did not start (application exited before becoming ready)';

  it('names a scenario whose app did not start “could not run” in its row, its card, its leaf and the key, as the band does, with the reason grow --json gives under its card', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    // s10 has its own flow, and its run never reached its checks: tg's 15 scenarios read this way
    const crashed = plotline((e) => (e.kind === 'scenario.failed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: e.scenario, run: e.run, outcome: 'infrastructure_failed', why: APP } as GrowEvent : e));
    expect(reasonsOf(crashed).s10).toBe(APP);
    await pinned(page, crashed, 's10');
    expect(await said(page, 's10')).toEqual({ band: '3 passed · 4 not tested yet · 1 of 5 promises hold · Open the runs', untested: ['could not run', 'no flow yet', 'no flow yet', 'no flow yet'], row: 'could not run', card: 'could not run', why: `${APP}.`, write: false,
      proof: ['seats.remove-seat'], leaf: 'could not run: the app did not start (application exited before becoming ready)', mark: 'idle', key: ['flow ready (not run), or could not run'], live: ['1 could not run', '3 no flow yet', '3 passed'] });
    // one with no flow at all has none yet, everywhere, and offers to write it
    await pinned(page, crashed, 's5');
    expect(await said(page, 's5')).toMatchObject({ row: 'no flow yet', card: 'no flow yet', why: 'No flow proves this yet.', write: true, proof: ['no flow yet'], leaf: 'no flow yet', mark: 'none' });
    // a run whose evidence did not verify is still flow ready, with why; nothing could not run, so the key says only flow ready
    const unverified = plotline((e) => (e.kind === 'scenario.failed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: e.scenario, run: e.run, outcome: 'passed', why: 'Not proven: the run evidence did not verify' } as GrowEvent : e));
    await pinned(page, unverified, 's10');
    expect(await said(page, 's10')).toMatchObject({ band: '3 passed · 4 not tested yet · 1 of 5 promises hold · Open the runs', untested: ['flow ready (not run)', 'no flow yet', 'no flow yet', 'no flow yet'], row: 'flow ready (not run)', card: 'flow ready (not run)', why: 'Not proven: the run evidence did not verify.', write: false,
      leaf: 'flow ready (not run): Not proven: the run evidence did not verify', mark: 'idle', key: ['flow ready (not run)'], live: ['3 no flow yet', '1 flow ready (not run)', '3 passed'] });
    await page.close();
  });

  it('names a scenario whose flow an agent wrote and ran “could not run” when its app did not start, never “no flow yet”, and offers to rerun it, not to write it', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    const written = plotline((e) => (e.kind === 'scenario.not_run' && e.scenario === 's1' ? [
      { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.running', scenario: 's1', flow: 'discovered.seats-panel' } as GrowEvent,
      { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: 's1', run: '2026-10-22T01-41-00Z_error_s1', outcome: 'infrastructure_failed', why: APP } as GrowEvent] : e));
    expect(written.scenarios.find((x) => x.id === 's1')!.flow).toBeFalsy();
    expect(reasonsOf(written).s1).toBe(APP);
    await pinned(page, written, 's1');
    expect(await said(page, 's1')).toEqual({ band: '3 passed · 1 failed · 3 not tested yet · 1 of 5 promises hold · Open the runs', untested: ['could not run', 'no flow yet', 'no flow yet'], row: 'could not run', card: 'could not run', why: `${APP}.`, write: false,
      proof: ['discovered.seats-panel'], leaf: 'could not run: the app did not start (application exited before becoming ready)', mark: 'idle', key: ['flow ready (not run), or could not run'], live: ['1 failed', '1 could not run', '2 no flow yet', '3 passed'] });
    const acts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="grow-inspector"] [data-testid="grow-card-actions"] button')).map((b) => b.textContent));
    expect(acts).toEqual(['Rerun', 'Copy link']);
    // its row in the Outline says the same, with the same reason when it is opened
    await page.getByTestId('grow-view-outline').click();
    await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = 's:s1'; w.gw.pinList = 's:s1'; w.growPaint(); });
    await expect(page.locator('.gb-ols[data-sid="s1"] .gw-badge').first().textContent()).resolves.toBe('could not run');
    await expect(page.locator('.gb-olin [data-testid="grow-card-why"]').first().textContent()).resolves.toBe(`${APP}.`);
    await page.getByTestId('grow-view-grove').click();
    await page.close();
  });

  it('"Open the runs" on a grow not proven yet opens in the drawer the scenario its next action names, never the newest run of another scenario', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    // s10 could not run; s4 passed in the newest run this grow made
    const crashed = plotline((e) => (e.kind === 'scenario.failed' ? { v: e.v, seq: e.seq, ms: e.ms, kind: 'scenario.not_run', scenario: e.scenario, run: e.run, outcome: 'infrastructure_failed', why: APP } as GrowEvent
      : e.kind === 'scenario.passed' && e.scenario === 's4' ? { ...e, run: '2026-12-31T00-00-00Z_pass_newest' } as GrowEvent : e));
    await pinned(page, crashed, 's4');
    // a pinned leaf takes the Next block's place; Escape brings it back
    await expect(page.getByTestId('grow-verdict-next').count()).resolves.toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('grow-verdict-next').textContent()).resolves.toBe('See why it could not run ›');
    await page.getByTestId('grow-open-runs').click();
    expect(await drawn(page)).toMatchObject({ tab: 'Discover', sid: 's10' });
    await page.close();
  });
});

describe('A grow whose config is in a subfolder', () => {
  /* The project sits in svc/ of its repo, as tg's dogfood/ does: the grow finds svc/tracegrove.config.yaml and saves its runs
     in svc/.tracegrove/runs. The page's server runs over the repo, which has no config of its own. */
  let dir = '', state: GrowState, server: UiServer, browser: Browser;
  let failed = '', failRun = '';
  const errors: string[] = [];
  beforeAll(async () => {
    dir = notesCount(true, 'svc');
    ({ state } = await grow({ dir, branch: 'notes-count', base: 'main', mode: 'min', prove: true, gh: false, agent: { off: true } }));
    failed = state.scenarios.find((x) => state.run[x.id]?.st === 'fail')!.id;
    failRun = state.run[failed]!.run!;
    server = await startUi({ dir, branch: 'notes-count', port: 0, token: 'tk-0123456789abcdef' });
    browser = await chromium.launch({ headless: true });
  }, 120_000);
  afterAll(async () => { await browser?.close(); await server?.close(); cleanTemps(); expect(errors).toEqual([]); });
  async function open(hash = ''): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url + hash);
    return page;
  }
  const where = (page: Page) => page.evaluate(() => { const w = (0, eval)('({ ui, tab })'); return { tab: w.tab, run: w.ui.runName, sel: w.ui.sel, step: w.ui.step }; });
  const landed = async (page: Page) => { await page.waitForFunction(() => (0, eval)('tab') === 'Run' && !!(0, eval)('ui').run); return where(page); };
  const runTabShows = async (page: Page) => {
    await expect(page.getByText('No tracegrove.config.yaml in this folder yet.').count()).resolves.toBe(0);
    await expect(page.locator('aside[aria-label="Step detail"]').textContent()).resolves.toContain('notes.count › step 3 of 4');
  };
  /* the drawer read the failure's run from beside the config, on its failing step */
  const drawerShows = async (page: Page) => {
    await page.getByTestId('grow-happened-oneline').waitFor();
    expect(await page.evaluate(() => { const d = (0, eval)('gw').dr; return { sid: d.sid, run: d.run, step: d.step }; })).toEqual({ sid: failed, run: failRun, step: 2 });
  };

  it('saves its runs beside that config, and grow --json says so', () => {
    expect(state.flows?.config).toBe('svc/tracegrove.config.yaml');
    expect(existsSync(join(dir, 'svc', '.tracegrove', 'runs', failRun, 'summary.json'))).toBe(true);
    expect(existsSync(join(dir, '.tracegrove', 'runs', failRun))).toBe(false);
    const [f] = growJsonSummary(state, dir).failures;
    expect(f).toMatchObject({ run: failRun, saved: true, step: 3 });
    for (const p of f!.evidence) expect(p.startsWith(`svc/.tracegrove/runs/${failRun}/`)).toBe(true);
  });

  it('reads a run beside the config the page names, refuses a config outside the folder, and says not found only when it is not there', async () => {
    const get = (path: string) => fetch(new URL(path, server.url));
    const run = `/api/runs/${encodeURIComponent(failRun)}`;
    expect((await get(run)).status).toBe(404);
    const ok = await get(`${run}?config=${encodeURIComponent('svc/tracegrove.config.yaml')}`);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { cases: Array<{ caseId: string }> }).cases.map((c) => c.caseId)).toContain('notes.count');
    expect((await get(`/api/runs/2026-10-22T00-00-00Z_fail_gone00?config=${encodeURIComponent('svc/tracegrove.config.yaml')}`)).status).toBe(404);
    for (const bad of ['../elsewhere/tracegrove.config.yaml', '/etc/tracegrove.config.yaml', 'svc/../../tracegrove.config.yaml']) {
      expect((await get(`${run}?config=${encodeURIComponent(bad)}`)).status).toBe(400);
      expect((await get(`${run}/media/${'a'.repeat(64)}?case=notes.count&config=${encodeURIComponent(bad)}`)).status).toBe(400);
    }
  });

  it('places a grow’s runs beside its config, and refuses a path that leaves the folder or passes through a link', () => {
    expect(configRunsRoot(dir, 'tracegrove.config.yaml')).toBe(dir);
    expect(configRunsRoot(dir, 'svc/tracegrove.config.yaml')).toBe(join(dir, 'svc'));
    expect(configRunsRoot(dir, './svc/tracegrove.config.yaml')).toBe(join(dir, 'svc'));
    // A folder that is not there is still where its runs would be: they are simply not saved there.
    expect(configRunsRoot(dir, 'gone/tracegrove.config.yaml')).toBe(join(dir, 'gone'));
    for (const bad of ['', '../svc/tracegrove.config.yaml', '/etc/tracegrove.config.yaml', 'svc/../../x/tracegrove.config.yaml']) expect(configRunsRoot(dir, bad)).toBeNull();
    symlinkSync(join(dir, 'svc'), join(dir, 'linked'));
    expect(configRunsRoot(dir, 'linked/tracegrove.config.yaml')).toBeNull();
  });

  it('opens the failure’s run at its failing step from the verdict, the card and Open the runs, in the drawer and then the Run tab, never the Initialize card', async () => {
    const page = await open();
    await page.getByTestId('grow-verdict-open').click();
    await drawerShows(page);
    await page.getByTestId('grow-happened-runtab').click();
    expect(await landed(page)).toMatchObject({ tab: 'Run', run: failRun, sel: 'notes.count', step: 2 });
    await runTabShows(page);
    // The run picker offers the run the grow opened, though this folder's own list has none.
    await expect(page.locator('select[aria-label="Run"]').inputValue()).resolves.toBe(failRun);
    await page.close();
    const runs = await open();
    await runs.getByTestId('grow-open-runs').click();
    await drawerShows(runs);
    await runs.getByTestId('grow-happened-runtab').click();
    expect(await landed(runs)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2 });
    await runTabShows(runs);
    await runs.close();
    // The address alone brings each back, read from beside the config again.
    const again = await open(`#grow/${failed}/happened/step-3`);
    await drawerShows(again);
    await again.close();
    const tabbed = await open(`#grow/${failed}/run/step-3`);
    expect(await landed(tabbed)).toMatchObject({ run: failRun, sel: 'notes.count', step: 2 });
    await runTabShows(tabbed);
    await tabbed.close();
  });

  it('lists in grow --json the files of a run that never reached its checks, beside the config, as it does for a failure', () => {
    const s = structuredClone(state);
    s.run[failed] = { ...s.run[failed]!, st: 'not_run', why: 'Could not run: the app did not start (application exited before becoming ready)' };
    const u = growJsonSummary(s, dir).unproven.find((x) => x.scenario === failed)!;
    expect(u).toMatchObject({ run: failRun, saved: true });
    expect(u.evidence![0]).toBe(`svc/.tracegrove/runs/${failRun}/summary.json`);
    expect(u.evidence!.length).toBeGreaterThan(1);
    for (const p of u.evidence!) { expect(p.startsWith(`svc/.tracegrove/runs/${failRun}/`)).toBe(true); expect(existsSync(join(dir, p))).toBe(true); }
    // a run that is not saved here lists none
    s.run[failed]!.run = '2026-10-22T00-00-00Z_error_gone00';
    const gone = growJsonSummary(s, dir).unproven.find((x) => x.scenario === failed)!;
    expect(gone).toMatchObject({ run: '2026-10-22T00-00-00Z_error_gone00' });
    expect(gone).not.toHaveProperty('evidence');
    expect(gone).not.toHaveProperty('saved');
  });

  it('says a run is not saved there only when it is not, and then stays on the grow instead of offering to plant a config', async () => {
    const page = await open();
    await page.getByTestId('grow-result').waitFor();
    await page.evaluate(() => { const w = (0, eval)('({ gw })'); for (const k in w.gw.state.run) if (w.gw.state.run[k].run) w.gw.state.run[k].run = '2026-10-22T00-00-00Z_pass_gone' + k; });
    // the failure's run, in the drawer
    await page.getByTestId('grow-open-runs').click();
    await page.locator('.gw-drerr').waitFor();
    await expect(page.locator('.gw-drerr').textContent()).resolves.toBe(`The run 2026-10-22T00-00-00Z_pass_gone${failed} is not saved in svc any more.`);
    expect((await where(page)).tab).toBe('Discover');
    await page.getByTestId('grow-happened-close').click();
    // with no failure, the newest run this grow saved
    await page.evaluate(() => { const w = (0, eval)('({ gw })'); for (const k in w.gw.state.run) if (w.gw.state.run[k].st === 'fail') w.gw.state.run[k].st = 'pass'; });
    await page.getByTestId('grow-open-runs').click();
    await page.locator('.toast').waitFor();
    await expect(page.locator('.toast').textContent()).resolves.toMatch(/^The run 2026-10-22T00-00-00Z_pass_gone\w+ is not saved in svc any more\.$/);
    expect((await where(page)).tab).toBe('Discover');
    await expect(page.getByText('No tracegrove.config.yaml in this folder yet.').count()).resolves.toBe(0);
    await page.close();
  });
});

describe('One failure, worded one way everywhere', () => {
  /* plotline-billing (the saas-billing sample) on main, and a branch that charges the card a second time after an upgrade to
     Team: "the card was charged the Team price once" expected 1 payments charge and got 2. */
  let dir = '', state: GrowState, server: UiServer, browser: Browser, failed = '';
  const errors: string[] = [];
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tracegrove-wording-')); temps.push(dir);
    cpSync(join(import.meta.dirname, '..', 'src', 'samples', 'saas-billing'), dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Billing sample');
    git(dir, 'checkout', '-qb', 'seat-fee');
    const app = join(dir, 'app', 'billing.mjs');
    const before = readFileSync(app, 'utf8'), at = '    const result = await charge(account, amount, body.plan);\n';
    expect(before.includes(at)).toBe(true);
    writeFileSync(app, before.replace(at, `${at}    if (result.ok && body.plan === 'team') await charge(account, 900, 'team seat');\n`));
    git(dir, 'commit', '-qam', 'Charge the first Team seat with the upgrade');
    ({ state } = await grow({ dir, branch: 'seat-fee', base: 'main', mode: 'max', prove: true, gh: false, agent: { off: true } }));
    failed = state.scenarios.find((x) => state.run[x.id]?.st === 'fail' && state.run[x.id]?.flow === 'billing.upgrade-charges-once')!.id;
    server = await startUi({ dir, branch: 'seat-fee', port: 0, token: 'tk-0123456789abcdef' });
    browser = await chromium.launch({ headless: true });
  }, 180_000);
  afterAll(async () => { await browser?.close(); await server?.close(); cleanTemps(); expect(errors).toEqual([]); });

  it('says the count the same way in the grow’s recorded reason, the verdict, grow --json, the page’s rows and the Run tab', async () => {
    const words = 'expected 1 charge, got 2';
    // The reason the grow recorded, from the run's own failure message.
    expect(state.run[failed]!.why).toBe(`the card was charged the Team price once: ${words}`);
    // The verdict and grow --json, from the run's recorded check.
    const v = growVerdict(state, { broke: verdictFacts(state, dir) });
    expect(v.first?.scenario).toBe(failed);
    expect(v.text).toBe(`“${plainTitle(state.scenarios.find((x) => x.id === failed)!.title)}” failed: ${words}`);
    const f = growJsonSummary(state, dir).failures.find((x) => x.scenario === failed)!;
    expect(f.says).toBe('Expected 1 charge, got 2. Step 2 (the card was charged the Team price once) broke it.');
    // The page: the verdict, and the row's "Broke at check" line in the Outline.
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    await expect(page.getByTestId('grow-verdict').textContent()).resolves.toContain(`failed: ${words}`);
    await page.getByTestId('grow-view-outline').click();
    const row = (await page.locator(`.gb-ols[data-sid="${failed}"] + .err`).first().textContent())!;
    expect(row, row).toMatch(/^Step \d+ · /);
    expect(row.replace(/^Step \d+ · /, '').startsWith(`Broke at check “the card was charged the Team price once”: ${words}`)).toBe(true);
    // The drawer, on the step that broke.
    await page.getByTestId('grow-verdict-open').click();
    await page.getByTestId('grow-happened-oneline').waitFor();
    await expect(page.getByTestId('grow-happened-step-2').textContent()).resolves.toContain('Expected 1 charge, got 2');
    // The Run tab: its "Needs a fix" card and the recorded case failure on the step.
    await page.getByTestId('grow-happened-runtab').click();
    await page.waitForFunction(() => (0, eval)('tab') === 'Run' && !!(0, eval)('ui').run);
    const run = (await page.locator('#main').textContent())!;
    expect(run).toContain(words);
    expect(run).not.toMatch(/expected 1 call, got 2/);
    await page.close();
  });

  it('says each failure on the page in its run’s recorded words, even for a grow saved before its runs said them so', async () => {
    // The server reads how each failure broke from its run, once per saved run.
    const words = new Map<string, string | null>();
    expect(failureWords(state, dir, words)).toEqual({ [failed]: 'expected 1 charge, got 2' });
    expect(words.size).toBe(1);
    const last = await (await fetch(new URL(`/api/grow/last?branch=seat-fee`, server.url))).json() as { view: { said: Record<string, string> } };
    expect(last.view.said).toEqual({ [failed]: 'expected 1 charge, got 2' });
    // A grow whose recorded reason said "calls", as one saved before this wording did: its rows read as its verdict does.
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => { errors.push(String(e)); });
    await page.goto(server.url);
    await page.getByTestId('grow-result').waitFor();
    await page.getByTestId('grow-view-outline').click();
    await page.evaluate((id) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state.run[id].why = 'the card was charged the Team price once: expected 1 call, got 2'; w.growPaint(); }, failed);
    const row = (await page.locator(`.gb-ols[data-sid="${failed}"] + .err`).first().textContent())!;
    expect(row, row).toMatch(/^Step \d+ · /);
    expect(row.replace(/^Step \d+ · /, '').startsWith('Broke at check “the card was charged the Team price once”: expected 1 charge, got 2')).toBe(true);
    // With no run to read, the recorded reason stands.
    expect(failureWords(state, mkdtempSync(join(tmpdir(), 'tracegrove-norun-')))).toEqual({});
    await page.close();
  });

  it('names the step in grow --json as its flow declares it, and as its sealed id gives it when the saved name is not the one the id was made from', () => {
    const f = growJsonSummary(state, dir).failures.find((x) => x.scenario === failed)!;
    // The sealed id is the_card_was_charged_the_team_price_once; the flow, and the summary the run saved, say "Team".
    expect(f.says).toContain('Step 2 (the card was charged the Team price once)');
    const file = join(dir, f.evidence[0]!);
    const saved = readFileSync(file, 'utf8');
    try {
      writeFileSync(file, saved.replaceAll('the card was charged the Team price once', 'charged once, renamed after the run'));
      expect(growJsonSummary(state, dir).failures.find((x) => x.scenario === failed)!.says).toBe('Expected 1 charge, got 2. Step 2 (the card was charged the team price once) broke it.');
    } finally { writeFileSync(file, saved); }
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
    const long = plotline((e) => (e.kind === 'scenario.failed' ? { ...e, why: 'only the Team upgrade and the added seat were charged: expected 2 calls, got 3\n    at waitForCalls (stand-in)' } : e));
    expect(growVerdict(long).text).toBe('“Removing a seat never charges the card” failed: expected 2 calls, got 3');
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
    // A log saved before grow recorded the run's outcome says only the stage it broke at: it is read the same way.
    const s = plotline((e) => { if (e.kind !== 'scenario.failed') return e; const { hop: _h, after: _a, ...rest } = e; return { ...rest, why }; });
    const reason = 'Could not run: the app did not start (application exited before becoming ready)';
    expect(s.run.s10).toMatchObject({ st: 'not_run', why: reason, run: '2026-10-22T01-39-03Z_fail_504bf8', flow: 'seats.remove-seat' });
    const summary = growJsonSummary(s, mkdtempSync(join(tmpdir(), 'tracegrove-norun-')));
    expect(summary).toMatchObject({ verdict: 'not proven yet', exitCode: 3, exitMeaning: 'prove more', counts: { passed: 3, failed: 0, notTestedYet: 4 }, failures: [] });
    expect(summary.unproven.find((x) => x.scenario === 's10')).toEqual({ scenario: 's10', title: 'Removing a seat never charges the card', reason, run: '2026-10-22T01-39-03Z_fail_504bf8' });
    expect(growVerdict(s).line).toBe('◌ Not proven yet: 4 of 7 scenarios in Minimum not tested yet');
  });

  it('never counts a run that did not reach its checks as a failed check: it is not tested yet, with the reason it could not run', () => {
    const as = (outcome: string, why: string) => plotline((e) => (e.kind === 'scenario.failed' ? { ...e, why, outcome } : e));
    const cases: Array<[string, string, string]> = [
      ['infrastructure_failed', '(app startup): application exited before becoming ready', 'Could not run: the app did not start (application exited before becoming ready)'],
      ['blocked', '(before steps): persona_unavailable: no token for persona owner', 'Could not run: it was stopped before its first step (persona_unavailable: no token for persona owner)'],
      ['blocked', '(fixture seats): fixture_failed: seed refused', 'Could not run: fixture seats could not be set up (fixture_failed: seed refused)'],
      ['inconclusive', '(case): step_not_run', 'Could not run: step_not_run'],
      ['cancelled', 'the run was cancelled', 'Could not run: the run was cancelled'],
    ];
    for (const [outcome, why, reason] of cases) {
      const s = as(outcome, why);
      expect(s.run.s10).toMatchObject({ st: 'not_run', why: reason, run: '2026-10-22T01-39-03Z_fail_504bf8' });
      expect(growVerdict(s)).toMatchObject({ verdict: 'not proven yet', exitCode: 3, counts: { failed: 0, notTestedYet: 4 }, first: null });
      expect(growJsonSummary(s, mkdtempSync(join(tmpdir(), 'tracegrove-norun-'))).failures).toEqual([]);
    }
    // A check that did not hold stays a failure, whatever its step is named.
    const real = as('assertion_failed', '(setup): expected 2 calls, got 3');
    expect(real.run.s10).toMatchObject({ st: 'fail', why: '(setup): expected 2 calls, got 3' });
    expect(growVerdict(real)).toMatchObject({ verdict: 'not ready', exitCode: 1, counts: { failed: 1 } });
    // A run that never reached its checks is said as not run in the plain progress lines, and still names its run.
    const s = as('infrastructure_failed', '(app startup): application exited before becoming ready');
    const e = { v: 'tracegrove.discovery-event/v1', seq: 1, ms: 1, kind: 'scenario.not_run', scenario: 's10', why: 'Could not run: the app did not start (application exited before becoming ready)', run: s.run.s10!.run, outcome: 'infrastructure_failed' } as GrowEvent;
    expect(plainLine(applyGrow(s, e), e)).toBe('not run Removing a seat never charges the card (seats.remove-seat): Could not run: the app did not start (application exited before becoming ready)');
  });
});

describe('A flow an agent wrote that never reached its checks', () => {
  /* The agent proposes, tracegrove proves: a flow the agent writes runs like any other. When it did not compile, or its run never
     reached its checks (the app did not start), it proves nothing either way: its scenario is not tested yet, never failed. */
  const path0 = process.env.PATH;
  afterAll(() => { process.env.PATH = path0; cleanTemps(); });
  /** A `claude` on PATH that writes one flow file, `body`, where the draft prompt asks for flows. */
  function writingClaude(body: string): void {
    const bin = mkdtempSync(join(tmpdir(), 'tracegrove-agentbin-')); temps.push(bin);
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\nmkdir -p tracegrove/discovered/notes\ncat > tracegrove/discovered/notes/count-anonymous.flow.yaml <<'YAML'\n${body}YAML\necho '{"type":"result","result":"wrote it"}'\n`);
    chmodSync(join(bin, 'claude'), 0o755);
    process.env.PATH = `${bin}${delimiter}${path0}`;
  }
  const FLOW = ['title: Without a token the count is refused', 'tags: [discovered]', 'steps:', '  - name: anonymous is refused', '    GET: /notes/count', '    as: none', '    expect: 401', ''].join('\n');
  /** The plotline grow, with s10's run replaced by what the written flow proved. */
  const asWritten = (flow: Parameters<typeof writtenFlowResult>[1]) => plotline((e) => (e.kind === 'scenario.failed' && e.scenario === 's10' ? { v: e.v, seq: e.seq, ms: e.ms, ...writtenFlowResult('s10', flow) } as GrowEvent : e));

  it('gives a scenario to the written flow that reached its route before one that served nothing, whichever file came first', () => {
    const units = [{ id: 'u1', kind: 'route', method: 'GET', path: '/notes/count', label: 'GET /notes/count' }] as unknown as ChangeUnit[];
    const open = [{ id: 's2', unit: 'u1', title: 'Without a token the count is refused', proves: 'A caller with no token gets 401 or 403, never the count.' }] as unknown as GrowState['scenarios'];
    const flow = (file: string, more: Partial<ProvedFlow>): ProvedFlow => ({ file, caseIds: [], outcome: 'failed', repairs: 0, detail: null, served: [], run: null, caseOutcome: null, failure: null, verified: null, ...more });
    const title = 'Without a token the count is refused';
    // the first file did not compile, so it served nothing; the second reached GET /notes/count and passed. Both say the same thing.
    const broken = { file: 'a.flow.yaml', title, flow: flow('a.flow.yaml', { detail: 'unknown method FROB', failure: '(compile): unknown method FROB' }) };
    const good = { file: 'b.flow.yaml', title, flow: flow('b.flow.yaml', { outcome: 'proven', caseIds: ['discovered.count-anonymous'], served: ['GET /notes/count'], run: 'r1', caseOutcome: 'passed', verified: true }) };
    expect(writtenFlowResult('s2', broken.flow).kind).toBe('scenario.not_run');
    const ids = (m: Map<string, { id: string }>) => [...m].map(([f, x]) => [f, x.id]);
    expect(ids(attributeWritten([broken, good], open, units))).toEqual([['b.flow.yaml', 's2']]);
    expect(ids(attributeWritten([good, broken], open, units))).toEqual([['b.flow.yaml', 's2']]);
    // alone, the one that served nothing is still the scenario its title says, read as not tested yet
    expect(ids(attributeWritten([broken], open, units))).toEqual([['a.flow.yaml', 's2']]);
    // a flow that served another route never takes it, and neither does one whose title says something else
    const other = { file: 'c.flow.yaml', title, flow: flow('c.flow.yaml', { outcome: 'proven', caseIds: ['discovered.other'], served: ['GET /notes'], run: 'r2', caseOutcome: 'passed', verified: true }) };
    expect(ids(attributeWritten([other], open, units))).toEqual([]);
    expect(ids(attributeWritten([{ ...broken, title: 'Deleting a note' }], open, units))).toEqual([]);
  });

  it('reads an app that did not start as not tested yet, with the reason and the run that says so: exit 3, never 1', async () => {
    const dir = notesCount(false);
    const app = join(dir, 'app', 'app.mjs');
    writeFileSync(app, `import './settings.mjs';\n${readFileSync(app, 'utf8')}`);
    writingClaude(FLOW);
    const drafted = await draftWithAgent({ dir, branch: null, intent: 'Without a token the count is refused' });
    const flow = drafted.prove!.flows[0]!;
    expect(flow).toMatchObject({ outcome: 'failed', caseOutcome: 'infrastructure_failed', failure: expect.stringMatching(/^\(app startup\): /) });
    const e = writtenFlowResult('s10', flow);
    expect(e).toMatchObject({ kind: 'scenario.not_run', scenario: 's10', run: flow.run, outcome: 'infrastructure_failed', why: expect.stringMatching(/^Could not run: the app did not start \(.+\)$/) });
    const s = asWritten(flow);
    expect(s.run.s10).toMatchObject({ st: 'not_run', run: flow.run });
    expect(growVerdict(s)).toMatchObject({ verdict: 'not proven yet', exitCode: 3, exitMeaning: 'prove more', counts: { failed: 0, notTestedYet: 4 }, first: null });
    const summary = growJsonSummary(s, dir);
    expect(summary.failures).toEqual([]);
    expect(summary.unproven.find((x) => x.scenario === 's10')).toMatchObject({ reason: (e as { why: string }).why, run: flow.run });
    // the run that says why is saved here, and grow --json points at its files
    const u = summary.unproven.find((x) => x.scenario === 's10')!;
    expect(u.saved).toBe(true);
    expect(u.evidence![0]).toBe(`.tracegrove/runs/${flow.run}/summary.json`);
    for (const p of u.evidence!) expect(existsSync(join(dir, p))).toBe(true);
  }, 120_000);

  it('reads a flow that did not compile as not tested yet, and one whose check did not hold as failed', async () => {
    const dir = notesCount(false);
    writingClaude(['title: Without a token the count is refused', 'steps:', '  - name: anonymous is refused', '    FROB: /notes/count', ''].join('\n'));
    const drafted = await draftWithAgent({ dir, branch: null, intent: 'Without a token the count is refused' });
    const flow = drafted.prove!.flows[0]!;
    expect(flow).toMatchObject({ outcome: 'failed', caseOutcome: null, run: null });
    const e = writtenFlowResult('s10', flow);
    expect(e).toMatchObject({ kind: 'scenario.not_run', scenario: 's10', why: expect.stringMatching(/^Could not run: /) });
    expect(e).not.toHaveProperty('run');
    expect(growVerdict(asWritten(flow))).toMatchObject({ verdict: 'not proven yet', exitCode: 3, counts: { failed: 0 } });
    // A check that ran and did not hold is a failure, as for any flow; evidence that did not verify proves nothing.
    writingClaude(FLOW.replace('expect: 401', 'expect: 200'));
    const wrong = (await draftWithAgent({ dir, branch: null, intent: 'Without a token the count is refused' })).prove!.flows[0]!;
    expect(wrong).toMatchObject({ caseOutcome: 'assertion_failed', failure: 'anonymous is refused: expected status 200, got 401' });
    expect(writtenFlowResult('s10', wrong)).toMatchObject({ kind: 'scenario.failed', run: wrong.run, why: 'anonymous is refused: expected status 200, got 401', outcome: 'assertion_failed' });
    expect(growVerdict(asWritten(wrong))).toMatchObject({ verdict: 'not ready', exitCode: 1, counts: { failed: 1 } });
    expect(writtenFlowResult('s10', { outcome: 'failed', detail: 'the run evidence did not verify', run: wrong.run, caseOutcome: 'passed', failure: null }))
      .toEqual({ kind: 'scenario.not_run', scenario: 's10', why: 'Not proven: the run evidence did not verify', run: wrong.run, outcome: 'passed' });
    expect(writtenFlowResult('s10', { outcome: 'proven', detail: null, run: wrong.run, caseOutcome: 'passed', failure: null })).toEqual({ kind: 'scenario.passed', scenario: 's10', took: 0, run: wrong.run });
  }, 180_000);

  /* The same, through a whole grow: the notes branch without its anonymous flow, so "Without a session it is refused" has no flow
     and the agent writes one. A `claude` that writes only when asked to write flows (its trace answers nothing), so the flow is
     the one grow's proving asked for. */
  function draftingClaude(body: string): void {
    const bin = mkdtempSync(join(tmpdir(), 'tracegrove-agentbin-')); temps.push(bin);
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\ncase "$*" in *"Write tracegrove flows"*) ;; *) echo '{"type":"result","result":"nothing"}'; exit 0;; esac\nmkdir -p tracegrove/discovered/notes\ncat > tracegrove/discovered/notes/count-anonymous.flow.yaml <<'YAML'\n${body}YAML\necho '{"type":"result","result":"wrote it"}'\n`);
    chmodSync(join(bin, 'claude'), 0o755);
    process.env.PATH = `${bin}${delimiter}${path0}`;
  }
  const withoutAnonymousFlow = () => {
    const dir = notesCount(false);
    git(dir, 'rm', '-q', join('tracegrove', 'notes', 'count-anonymous.flow.yaml')); git(dir, 'commit', '-qm', 'No anonymous flow');
    return dir;
  };
  const grown = (dir: string) => growCommand({ dir, branch: 'notes-count', base: 'main', mode: 'min', 'no-gh': true, json: true }, () => {});
  const refused = (state: GrowState) => state.scenarios.find((x) => x.mode === 'min' && !x.flow && /refused/i.test(x.title))!;

  it('in a grow, gives the scenario a written flow was for the reason its app did not start, with its run and evidence: exit 3, never 1', async () => {
    const dir = withoutAnonymousFlow();
    const app = join(dir, 'app', 'app.mjs');
    writeFileSync(app, `import './settings.mjs';\n${readFileSync(app, 'utf8')}`);
    git(dir, 'commit', '-qam', 'Load the settings');
    draftingClaude(FLOW);
    const { code, state, events, summary } = await grown(dir);
    const x = refused(state);
    expect(x).toBeDefined();
    // The agent wrote it for that scenario, and grow ran it: the run never reached its checks.
    expect(events.find((e) => e.kind === 'extension.written' && e.extKind === 'flow')).toMatchObject({ name: 'count-anonymous.flow.yaml', unit: x.unit });
    expect(events.filter((e) => e.kind === 'scenario.failed')).toEqual([]);
    expect(state.run[x.id]).toMatchObject({ st: 'not_run', why: expect.stringMatching(/^Could not run: the app did not start \(.+\)$/), run: expect.any(String) });
    expect(code).toBe(3);
    expect(summary).toMatchObject({ verdict: 'not proven yet', exitCode: 3, exitMeaning: 'prove more', counts: { failed: 0 }, failures: [] });
    const u = summary!.unproven.find((y) => y.scenario === x.id)!;
    expect(u).toMatchObject({ reason: state.run[x.id]!.why, run: state.run[x.id]!.run, saved: true });
    expect(u.reason).not.toBe('No flow proves this yet');
    expect(u.evidence![0]).toBe(`.tracegrove/runs/${u.run}/summary.json`);
    expect(u.evidence!.some((p) => p.endsWith('/receipt.json'))).toBe(true);
    for (const p of u.evidence!) expect(existsSync(join(dir, p))).toBe(true);
  }, 180_000);

  it('in a grow, gives the scenario a written flow was for the reason it did not compile, with no run: exit 3', async () => {
    const dir = withoutAnonymousFlow();
    draftingClaude(['title: Without a token the count is refused', 'steps:', '  - name: anonymous is refused', '    FROB: /notes/count', ''].join('\n'));
    const { code, state, summary } = await grown(dir);
    const x = refused(state);
    expect(state.run[x.id]).toMatchObject({ st: 'not_run', why: expect.stringMatching(/^Could not run: /) });
    expect(state.run[x.id]!.why).not.toBe('No flow proves this yet');
    expect(code).toBe(3);
    expect(summary!.unproven.find((y) => y.scenario === x.id)).toEqual({ scenario: x.id, title: plainTitle(x.title), reason: state.run[x.id]!.why });
  }, 180_000);

  it('in a grow, reads a written flow whose check ran but whose evidence did not verify as not tested yet, never failed: exit 3, not 1', async () => {
    const dir = withoutAnonymousFlow();
    // Its check does not hold (the app refuses with 401), and the record of its run is spoiled as it is published.
    draftingClaude(FLOW.replace('expect: 401', 'expect: 200'));
    const write = atomicFiles.writeExclusiveDurable;
    const spoil = vi.spyOn(atomicFiles, 'writeExclusiveDurable').mockImplementation((path, bytes) => {
      write(path, bytes);
      if (path.includes('.tracegrove-publish-') && path.endsWith('/campaign.json') && Buffer.from(bytes).toString('utf8').includes('discovered.')) writeFileSync(path, '{}\n');
    });
    try {
      const { code, state, events, summary } = await grown(dir);
      const x = refused(state);
      expect(events.filter((e) => e.kind === 'scenario.failed')).toEqual([]);
      expect(state.run[x.id]).toMatchObject({ st: 'not_run', why: 'Not proven: the run evidence did not verify', run: expect.any(String) });
      expect(code).toBe(3);
      // The flow that proves the count still passed, on its own verified run.
      expect(summary).toMatchObject({ verdict: 'not proven yet', exitCode: 3, counts: { passed: 1, failed: 0, notTestedYet: 1 }, failures: [] });
      expect(summary!.unproven).toEqual([{ scenario: x.id, title: plainTitle(x.title), reason: 'Not proven: the run evidence did not verify', run: state.run[x.id]!.run, saved: true, evidence: [`.tracegrove/runs/${state.run[x.id]!.run}/summary.json`] }]);
    } finally { spoil.mockRestore(); }
  }, 180_000);
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

  it('exits 3, never 1, when the app did not start: no check ran, so each scenario is not tested yet and names the run that says why', async () => {
    const dir = notesCount(false);
    const app = join(dir, 'app', 'app.mjs');
    writeFileSync(app, `import './settings.mjs';\n${readFileSync(app, 'utf8')}`);
    git(dir, 'commit', '-qam', 'Load the settings');
    let out = '';
    const { code, state, events } = await growCommand(flags(dir), (t) => { out += t; });
    const min = state.scenarios.filter((x) => x.mode === 'min' && x.flow);
    expect(min.length).toBeGreaterThan(0);
    expect(code).toBe(3);
    // The events say it: not run, with the outcome the run recorded, never a failed scenario.
    expect(events.filter((e) => e.kind === 'scenario.failed')).toEqual([]);
    const notRun = events.filter((e): e is Extract<GrowEvent, { kind: 'scenario.not_run' }> => e.kind === 'scenario.not_run');
    expect(notRun.filter((e) => e.run).map((e) => [e.scenario, e.outcome])).toEqual(min.map((x) => [x.id, 'infrastructure_failed']));
    expect(out.trimEnd().split('\n').at(-1)).toMatch(/^◌ Not proven yet: \d+ of \d+ scenarios in Minimum not tested yet$/);
    const { summary } = await growCommand({ ...flags(dir), json: true }, () => {});
    expect(summary).toMatchObject({ verdict: 'not proven yet', exitCode: 3, exitMeaning: 'prove more', counts: { passed: 0, failed: 0 }, failures: [] });
    for (const x of min) {
      const u = summary!.unproven.find((y) => y.scenario === x.id)!;
      expect(u.reason).toMatch(/^Could not run: the app did not start \(.+\)$/);
      // Its run is saved, and records that it never reached its checks.
      const saved = JSON.parse(readFileSync(join(dir, '.tracegrove', 'runs', u.run!, 'summary.json'), 'utf8')) as { outcome: string; cases: Array<{ outcome: string; failure: { step: string } | null }> };
      expect(saved.outcome).toBe('infrastructure_failed');
      expect(saved.cases.map((c) => [c.outcome, c.failure?.step])).toEqual([['infrastructure_failed', '(app startup)']]);
    }
  }, 90_000);

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
