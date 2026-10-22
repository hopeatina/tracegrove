import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { grow } from '../src/authoring/grow.ts';
import type { GrowState } from '../src/authoring/growState.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';

/* The notes sample on main, and a branch, checked out, that adds GET /notes/count with two flows that prove it and three
   criteria in its commit. With `buggy`, the count forgets to filter by owner, so "another user counts none" fails at step 3. */
const temps: string[] = [];
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'pipe' }).toString();
export function notesCount(buggy: boolean): string {
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
export const cleanTemps = () => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); };

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
});
