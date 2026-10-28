import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { applyGrow, freshGrow, growView, type GrowEvent } from '../src/authoring/growState.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';

const temps: string[] = [];
const servers: UiServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-still-')); temps.push(dir); return dir; };
const folded = (name: string) => {
  const s = freshGrow();
  for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', name), 'utf8').split('\n')) if (line.trim()) applyGrow(s, JSON.parse(line) as GrowEvent);
  return s;
};

/** Where the pot, every name on the tree and the key row sit, in page pixels from the tree card's corner: the pot and each
 *  knot, root and journey name whole, a pad's state line by where it starts (its words change with the state), the key row by
 *  its top and the caption by its box. */
const where = () => {
  const B = (0, eval)('gw').B, svg = B.svg as SVGSVGElement, card = svg.closest('.gw-tree')!.getBoundingClientRect(), o: Record<string, number[]> = {};
  const box = (e: Element) => { const r = e.getBoundingClientRect(); return [r.left - card.left, r.top - card.top, r.width, r.height]; };
  // (a line of words is held by its anchor point on its baseline, where the drawing puts it on the page: a lit name is set
  // bolder, which only widens it, and the box of a name still fading in can measure a pixel off)
  const words = (e: SVGTextElement) => { const m = e.getScreenCTM()!, x = Number(e.getAttribute('x')), y = Number(e.getAttribute('y')); return [m.a * x + m.c * y + m.e - card.left, m.b * x + m.d * y + m.f - card.top]; };
  // (a name not yet shown, still waiting to fade in as the tree grows, has no place to hold yet)
  const shown = (e: Element) => e.checkVisibility({ visibilityProperty: true });
  const pot = svg.querySelector('.pot-b'); if (pot) o.pot = box(pot);
  for (const id of Object.keys(B.klbl)) if ((B.klbl[id].textContent || '').trim() && shown(B.klbl[id])) o['knot ' + id] = words(B.klbl[id]);
  (Array.from(svg.querySelectorAll('text.rlbl')) as SVGTextElement[]).forEach((t, i) => { if (shown(t)) o['root ' + i + ' ' + t.textContent] = words(t); });
  for (const pid of Object.keys(B.lbl)) {
    const l = B.lbl[pid];
    if (!shown(l.el)) continue;
    if (l.badge) { o['badge ' + pid] = box(l.el.querySelector('circle')); continue; }
    if ((l.eb.textContent || '').trim()) o['eyebrow ' + pid] = box(l.eb).slice(1, 2);
    (l.tl as SVGTextElement[]).forEach((t, i) => { o['name ' + pid + ' ' + i] = words(t); });
    o['state ' + pid] = [Number(l.t2.getAttribute('y'))];
  }
  const key = document.querySelector('[data-testid="grow-key"]'), cap = document.querySelector('[data-testid="grow-caption"]');
  if (key) o.key = [box(key)[1]!];
  // (a caption under the drawing holds still with it; the sentence that names the drawing now heads the page, above the verdict)
  if (cap && cap.closest('.gw-tree')) o.caption = box(cap);
  o.svg = box(svg);
  return o;
};

describe('the bonsai holds still', () => {
  it('keeps the pot, every name and the key row where they were, under a pixel, growing, asked, a mode pointed at, the cut, the choice recorded, a leaf hovered and a leaf pinned', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, width] of [['plotline-seats.jsonl', 1440], ['plotline-seats.jsonl', 1024], ['plotline-seats.jsonl', 390], ['tracegrove-max.jsonl', 1440]] as const) {
        const at = file + ' ' + width, touch = width < 500;
        const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
        await page.goto(server.url);
        await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
        await page.getByTestId('grow').waitFor();
        // (the page's fonts in, so a name's box is its own and not a fallback face's)
        await page.evaluate(async () => { await document.fonts.ready; });
        const asked = { ...folded(file), asked: true, modeBy: null, mode: 'min' as const, done: false };
        const seen: Record<string, Record<string, number[]>> = {};
        // growing: the first paint, the wood still coming up
        await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.gw.tree = 'grove'; w.growPaint(); }, { s: asked, v: growView(asked as never) });
        await page.locator('[data-testid="grow"] svg.gb[role=group]').waitFor();
        seen.growing = await page.evaluate(where);
        const settled = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished' || a.effect?.getComputedTiming().endTime === Infinity) && !(0, eval)('gw').B.svg.querySelector('.gb-lf.cut'), undefined, { timeout: 30000 });
        await settled();
        seen.asked = await page.evaluate(where);
        await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); });
        seen.pointed = await page.evaluate(where);
        // the cut: what Minimum drops falls, sampled while it falls
        await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); });
        await page.waitForTimeout(250);
        seen.pruning = await page.evaluate(where);
        await settled();
        const chosen = { ...folded(file), asked: false, modeBy: 'you' as const, mode: 'min' as const };
        await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.picking = null; w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: chosen, v: growView(chosen as never) });
        await settled();
        seen.done = await page.evaluate(where);
        const leaf = page.locator('.gb-lf:not(.gone):not(.bud)').first();
        await leaf.hover({ force: true });
        await page.waitForTimeout(300);
        seen.hover = await page.evaluate(where);
        await leaf.click({ force: true });
        await page.waitForTimeout(300);
        seen.pinned = await page.evaluate(where);
        expect(Object.keys(seen.asked!).filter((k) => k.startsWith('knot ')).length, at).toBeGreaterThan(2);
        expect(seen.asked!.pot, at).toBeTruthy();
        expect(seen.asked!.key, at).toBeTruthy();
        for (const k of ['growing', 'pointed', 'pruning', 'done', 'hover', 'pinned']) {
          const moved: string[] = [];
          for (const n of Object.keys(seen.asked!)) {
            const a = seen.asked![n]!, b = seen[k]![n];
            if (!b) { if (k !== 'growing') moved.push(n + ' went'); continue; }
            if (a.some((v, i) => Math.abs(v - b[i]!) >= 1)) moved.push(n + ': ' + a.map((v) => v.toFixed(1)).join(',') + ' -> ' + b.map((v) => v.toFixed(1)).join(','));
          }
          expect(moved, at + ' ' + k).toEqual([]);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 240000);
});
