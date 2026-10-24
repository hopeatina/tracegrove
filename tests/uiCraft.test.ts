import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { applyGrow, freshGrow, growView, type GrowEvent } from '../src/authoring/growState.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';

const temps: string[] = [];
const servers: UiServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-craft-')); temps.push(dir); return dir; };
const folded = (name: string) => {
  const s = freshGrow();
  for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', name), 'utf8').split('\n')) if (line.trim()) applyGrow(s, JSON.parse(line) as GrowEvent);
  return s;
};
/** The grow page at a width, painted from a folded log, its growth settled. */
const grown = async (browser: Browser, url: string, state: ReturnType<typeof folded>, width: number) => {
  const touch = width < 500;
  const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
  await page.goto(url);
  await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
  await page.getByTestId('grow').waitFor();
  await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.gw.tree = 'grove'; w.growPaint(); }, { s: state, v: growView(state as never) });
  await page.locator('[data-testid="grow"] svg.gb[role=group]').waitFor();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished' || a.effect?.getComputedTiming().endTime === Infinity), undefined, { timeout: 30000 });
  return page;
};

describe('the bonsai as drawn', () => {
  it('hangs every scenario whose run failed under its cushion, on a twig that shows, never among the leaves that passed', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const state = { ...folded('plotline-seats.jsonl'), mode: 'min' as const, modeBy: 'you' as const };
      for (const width of [1440, 1024, 390]) {
        const page = await grown(browser, server.url, state, width);
        const seen = await page.evaluate(() => {
          const B = (0, eval)('gw').B, out: string[] = [];
          const fails = Array.from(B.svg.querySelectorAll('.gb-lf.fail:not(.gone)') as NodeListOf<Element>).filter((e) => e.getBoundingClientRect().width);
          for (const e of fails) {
            // (the blade as drawn, not the hit area round it, which on a phone is 44 px across)
            const bl = Array.from(e.querySelectorAll('.blade, .halo') as NodeListOf<Element>).map((b) => b.getBoundingClientRect()).filter((q) => q.width);
            const r = { top: Math.min(...bl.map((q) => q.top)), left: Math.min(...bl.map((q) => q.left)), right: Math.max(...bl.map((q) => q.right)) }, id = e.getAttribute('data-k'), cx = (r.left + r.right) / 2;
            if (!e.classList.contains('hang')) out.push(id + ': does not hang');
            // under the cushion it grew in: its top at or below that cushion's underside, inside the cushion's ends
            const cu = Array.from((e.closest('[data-pad]') || B.svg).querySelectorAll('.pfill') as NodeListOf<Element>).map((f) => f.getBoundingClientRect()).filter((q) => q.width && cx > q.left && cx < q.right);
            if (!cu.length) out.push(id + ': under no cushion');
            else if (r.top < Math.max(...cu.map((q) => q.bottom)) - 1.5) out.push(id + ': inside its cushion, ' + (Math.max(...cu.map((q) => q.bottom)) - r.top).toFixed(1) + ' px up');
            // from a twig that shows: its stalk a few pixels long at least
            const pet = e.querySelector('.pet') as SVGGeometryElement | null, m = pet?.getScreenCTM(), n = pet && m ? pet.getTotalLength() * Math.hypot(m.a, m.b) : 0;
            if (n < 3) out.push(id + ': its stalk is ' + n.toFixed(1) + ' px');
          }
          return { n: fails.length, out };
        });
        expect(seen.n, String(width)).toBeGreaterThan(0);
        expect(seen.out, String(width)).toEqual([]);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 120000);

  it('draws the canopy as a scalene triangle: the lowest pad the widest, none wider than a pad under it, and the crown\u2019s crest the smallest cushion, on plotline, tracegrove and notes', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const file of ['plotline-seats.jsonl', 'tracegrove-max.jsonl', 'notes-count.jsonl']) {
        for (const width of [1440, 1024]) {
          const page = await grown(browser, server.url, folded(file), width);
          const r = await page.evaluate(() => {
            const B = (0, eval)('gw').B, out: string[] = [], ratios: number[] = [];
            for (const T of B.L.trees) {
              // the pads by height, lowest first, each as wide as its cushions span as drawn
              const pads = (T.padList as Array<{ id: string; crown: boolean }>).map((pd) => {
                const cs = Array.from(B.svg.querySelectorAll('[data-pad="' + pd.id + '"] .pfill') as NodeListOf<Element>).map((e) => e.getBoundingClientRect()).filter((q) => q.width);
                return { id: pd.id, crown: pd.crown, cs, w: cs.length ? Math.max(...cs.map((q) => q.right)) - Math.min(...cs.map((q) => q.left)) : 0, y: cs.length ? Math.max(...cs.map((q) => q.bottom)) : 0 };
              }).filter((pd) => pd.w);
              pads.sort((a, b) => b.y - a.y);
              for (let i = 1; i < pads.length; i++) for (let j = 0; j < i; j++) if (pads[i]!.w > pads[j]!.w * 1.05) out.push(pads[i]!.id + ' (' + Math.round(pads[i]!.w) + ' px) wider than ' + pads[j]!.id + ' under it (' + Math.round(pads[j]!.w) + ' px)');
              const crown = pads.find((pd) => pd.crown);
              if (crown && pads.length > 1) ratios.push(pads[0]!.w / crown.w);
              // the crest: the crown's highest cushion, narrower than every other cushion on the tree
              if (crown) {
                const crest = crown.cs.reduce((a, q) => q.top < a.top ? q : a), others = pads.flatMap((pd) => pd.cs).filter((q) => q !== crest);
                for (const q of others) { const k = crest.width / q.width; ratios.push(k); if (k > 0.9) out.push('the crest ' + Math.round(crest.width) + ' px against a cushion of ' + Math.round(q.width) + ' px'); }
              }
            }
            return { out, ratios };
          });
          expect(r.ratios.length, file + ' ' + width).toBeGreaterThan(0);
          expect(r.out, file + ' ' + width).toEqual([]);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  }, 180000);
});
