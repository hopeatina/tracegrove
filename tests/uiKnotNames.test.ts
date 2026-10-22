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
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-knots-')); temps.push(dir); return dir; };

/** A grow folded from a recorded discovery log: plotline-billing (two journeys, one scenario failed, Minimum) and tracegrove
 *  itself (two journeys through twelve parts, Max, nothing run yet). */
const folded = (name: string) => {
  const s = freshGrow();
  for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', name), 'utf8').split('\n')) if (line.trim()) applyGrow(s, JSON.parse(line) as GrowEvent);
  return s;
};
const recorded = [['plotline-seats.jsonl', 'plotline'], ['tracegrove-max.jsonl', 'tracegrove']] as const;

/** Opens the Grow page on a folded state, at a width, as a phone that cannot hover below 500px, and waits for the tree to
 *  finish growing in. Returns the page and when each name and its knot came in. */
async function treePage(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string, state: unknown, width: number) {
  const touch = width < 500;
  const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
  await page.goto(url);
  await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
  await page.getByTestId('grow').waitFor();
  await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.gw.tree = 'grove'; w.growPaint(); }, { s: state, v: growView(state as never) });
  await page.locator('[data-testid="grow"] svg.gb[role=group]').waitFor();
  // when each name fades in, and when its knot does, as the build queued them
  const timing = await page.evaluate(() => {
    const B = (0, eval)('gw').B, at = (el: Element) => B.anim.find((a: unknown[]) => a[0] === el) as [Element, number, number] | undefined;
    return Object.keys(B.klbl).map((id) => { const n = at(B.klbl[id].parentNode), k = at(B.knot[id]); return { id, name: n ? n[1] : null, knot: k ? k[1] + k[2] : null }; });
  });
  // (a loop, like a pulse, never ends; everything that grows in does)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().endTime === Infinity), undefined, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { page, timing };
}

describe('the names on the bonsai’s knots', () => {
  it('are placed once: rest, hovering or pinning a leaf, a root or a knot only light or fade a name where it stands, and a burl keeps its place for whichever file it leads with', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 1024, 768, 390]) {
          const { page } = await treePage(browser, server.url, state, width);
          const seen = await page.evaluate(() => {
            const w = (0, eval)('({ gw, gbHover, gbLight })'), B = w.gw.B, out: string[] = [];
            const ids = Object.keys(B.klbl);
            // where a name sits: its text's anchor point and end, its leader, and its pip's row in the key
            const where = () => Object.fromEntries(ids.map((id) => {
              const t = B.klbl[id] as SVGTextElement, kp = t.parentNode!.querySelector('.kpip.key circle')!;
              return [id, [t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('text-anchor'), t.parentNode!.querySelector('.kld')!.getAttribute('d'), t.classList.contains('nofit'), kp.getAttribute('cx'), kp.getAttribute('cy')].join(' | ')];
            }));
            const shown = (t: Element) => t.classList.contains('on') || t.classList.contains('kdim');
            w.gw.hov = null; w.gw.pinned = null; w.gbHover(null);
            const rest = where(), texts = Object.fromEntries(ids.map((id) => [id, B.klbl[id].textContent]));
            for (const id of ids) if (!B.klbl[id].classList.contains('on')) out.push('rest: ' + texts[id] + ' is not named');
            const visits: Array<[string, Element]> = [];
            for (const id of Object.keys(B.leaf)) if (!B.leaf[id].classList.contains('gone') && B.leaf[id].getBoundingClientRect().width) visits.push(['s:' + id, B.leaf[id]]);
            for (const id of Object.keys(B.root)) visits.push(['u:' + id, B.root[id]]);
            for (const id of ids) for (const u of B.knot[id].__ids) visits.push(['u:' + u, B.knot[id]]);
            let lit = 0, faded = 0;
            for (const [k, el] of visits) {
              for (const how of ['hover', 'pin'] as const) {
                if (how === 'hover') w.gbHover(k, el); else { w.gbHover(null); w.gw.pinned = k; w.gbLight(); }
                const now = where();
                for (const id of ids) {
                  const t = B.klbl[id] as SVGTextElement;
                  if (now[id] !== rest[id]) out.push(how + ' ' + k + ': ' + texts[id] + ' moved from ' + rest[id] + ' to ' + now[id]);
                  if (!shown(t)) out.push(how + ' ' + k + ': ' + texts[id] + ' went out');
                  // only a burl's text changes, to lead with the file that is lit
                  if (t.textContent !== texts[id] && B.knot[id].__ids.length < 2) out.push(how + ' ' + k + ': ' + texts[id] + ' now says ' + t.textContent);
                  if (t.classList.contains('on')) lit++; else faded++;
                }
                if (how === 'pin') { w.gw.pinned = null; w.gbLight(); }
              }
            }
            w.gbHover(null);
            const back = where();
            for (const id of ids) if (back[id] !== rest[id]) out.push('back at rest: ' + texts[id] + ' moved');
            return { names: ids.length, visits: visits.length, lit, faded, out };
          });
          expect(seen.names, name + ' ' + width).toBeGreaterThan(4);
          expect(seen.visits, name + ' ' + width).toBeGreaterThan(10);
          // a hover lights some names and fades the rest
          expect(seen.lit, name + ' ' + width).toBeGreaterThan(0);
          expect(seen.faded, name + ' ' + width).toBeGreaterThan(0);
          expect(seen.out, name + ' ' + width).toEqual([]);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  }, 240000);

  it('are placed once over everything Max grows: asked, a mode pointed at, a mode picked, the mode chosen and a leaf pinned under Max’s preview leave every name, leader and pip, the viewBox and the wood where they were, and no name or leader touches a shoot, a ghost leaf, a count or a graft bud', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    // where every name sits (its anchor point and end, its leader, the pip on its boss and its row in the key), the viewBox and every limb
    const where = () => {
      const B = (0, eval)('gw').B, o: Record<string, string> = {};
      for (const id of Object.keys(B.klbl)) {
        const t = B.klbl[id] as SVGTextElement, g = t.parentNode as SVGGElement, boss = g.querySelector('.kpip:not(.key) circle')!, key = g.querySelector('.kpip.key circle')!;
        o['name ' + id] = [t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('text-anchor'), g.querySelector('.kld')!.getAttribute('d'), t.classList.contains('nofit'), boss.getAttribute('cx'), boss.getAttribute('cy'), key.getAttribute('cx'), key.getAttribute('cy')].join(' | ');
      }
      o.viewBox = B.svg.getAttribute('viewBox');
      o.wood = (Array.from(B.svg.querySelectorAll('path.w')) as Array<SVGPathElement & { __pts?: unknown }>).filter((p) => p.__pts).map((p) => p.getAttribute('d')).join(' / ');
      return o;
    };
    // until every motion the tree set going has ended and no leaf is still falling
    const settled = (page: Awaited<ReturnType<typeof treePage>>['page']) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished' || a.effect?.getComputedTiming().endTime === Infinity) && !(0, eval)('gw').B.svg.querySelector('.gb-lf.cut'), undefined, { timeout: 30000 });
    try {
      for (const [file, width] of [['plotline-seats.jsonl', 1440], ['tracegrove-max.jsonl', 1440], ['tracegrove-max.jsonl', 390]] as const) {
        const at = file + ' ' + width;
        const asked = { ...folded(file), asked: true, modeBy: null, mode: 'min' as const };
        const { page } = await treePage(browser, server.url, asked, width);
        const seen: Record<string, Record<string, string>> = {};
        seen.asked = await page.evaluate(where);
        // Minimum pointed at, then picked
        await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); });
        seen.pointed = await page.evaluate(where);
        await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); });
        await settled(page);
        seen.picked = await page.evaluate(where);
        // the choice recorded
        const chosen = { ...asked, asked: false, modeBy: 'you' as const };
        await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.picking = null; w.gw.state = s; w.gw.view = v; w.growPaint(); }, { s: chosen, v: growView(chosen as never) });
        await settled(page);
        seen.chosen = await page.evaluate(where);
        // a leaf of the second journey pinned while Max is pointed at, its shoots, counts and graft buds there as ghosts
        await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'), M = w.gw.M, list = M.leaves[w.gw.order[1]]; const x = list.find((q: { mode: string }) => q.mode === 'min') ?? list[0]; w.gw.pinned = 's:' + x.id; w.gw.preview = 'max'; w.growPaint(); });
        await settled(page);
        seen.pinned = await page.evaluate(where);
        expect(Object.keys(seen.asked!).filter((k) => k.startsWith('name ')).length, at).toBeGreaterThan(4);
        for (const k of ['pointed', 'picked', 'chosen', 'pinned']) {
          const moved = Object.keys(seen.asked!).filter((n) => seen[k]![n] !== seen.asked![n]).map((n) => n + ': ' + seen.asked![n] + ' -> ' + seen[k]![n]);
          expect(moved, at + ' ' + k).toEqual([]);
        }
        // and with all that Max grows shown, every name and leader keeps 2 px clear of it
        const clear = await page.evaluate(() => {
          const B = (0, eval)('gw').B, svg = B.svg as SVGSVGElement, out: string[] = [];
          const vis = (e: Element) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0;
          const marks = (Array.from(svg.querySelectorAll('.shf > path.tw, .shf > path.tipbud, .gb-lf.bud:not(.gone) .blade, .gb-lf.pv-add:not(.gone) .blade, .shtag .sbud, .gb-gr:not(.gone) .gsw')) as SVGGraphicsElement[]).filter(vis)
            .map((e) => ({ e, r: e.getBoundingClientRect(), what: e.closest('.gb-gr') ? 'a graft bud' : e.closest('.shtag') ? 'a count' : e.closest('.gb-lf') ? 'a ghost leaf' : 'a shoot' }));
          const kinds = new Set(marks.map((m) => m.what));
          const scr = (el: SVGGraphicsElement, p: number[]) => { const m = el.getScreenCTM()!; return [m.a * p[0]! + m.c * p[1]! + m.e, m.b * p[0]! + m.d * p[1]! + m.f]; };
          for (const id of Object.keys(B.klbl)) {
            const t = B.klbl[id] as SVGTextElement, g = t.parentNode as SVGGElement, name = t.textContent;
            if (!vis(t)) continue;
            const r = t.getBoundingClientRect();
            for (const m of marks) if (Math.min(r.right, m.r.right + 2) - Math.max(r.left, m.r.left - 2) > 0 && Math.min(r.bottom, m.r.bottom + 2) - Math.max(r.top, m.r.top - 2) > 0) out.push(name + ' touches ' + m.what);
            // its leader, from the knot out: only its own knot's shoot may stand at its foot
            const ld = g.querySelector('.kld') as SVGPathElement, v = (ld.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number) || [];
            if (v.length < 4) continue;
            const A = scr(ld, [v[0]!, v[1]!]), R = scr(ld, [v[2]!, v[3]!]), len = Math.hypot(A[0]! - R[0]!, A[1]! - R[1]!);
            const mine = new Set((B.knot[id].__ids as string[]).map((u) => B.shoots && B.shoots[u] && B.shoots[u].g).filter(Boolean));
            const hit = new Set<string>();
            for (let d = 0; d <= len; d += .5) {
              const q = [R[0]! + (A[0]! - R[0]!) * d / len, R[1]! + (A[1]! - R[1]!) * d / len];
              for (const m of marks) if (q[0]! > m.r.left && q[0]! < m.r.right && q[1]! > m.r.top && q[1]! < m.r.bottom && !(d < 6 && mine.has(m.e.closest('.budg')))) hit.add(m.what);
            }
            for (const h of hit) out.push(name + ': its leader runs into ' + h);
          }
          return { out, kinds: [...kinds].sort() };
        });
        // (Max's shoots and their ghost leaves are there to keep clear of)
        expect(clear.kinds, at).toEqual(expect.arrayContaining(['a ghost leaf', 'a shoot']));
        expect(clear.out, at).toEqual([]);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 240000);

  it('keeps every leader short and clear: off its own limb for good, and across no cushion, leaf, shoot, other limb, name or leader, tested against the shapes drawn', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 1024, 768, 390]) {
          const { page } = await treePage(browser, server.url, state, width);
          const seen = await page.evaluate(() => {
            const B = (0, eval)('gw').B, svg = B.svg as SVGSVGElement, out: string[] = [];
            const vis = (e: Element) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0;
            // a point in screen space, and that point in a shape's own space
            const scr = (el: SVGGraphicsElement, p: number[]) => { const m = el.getScreenCTM()!; return [m.a * p[0]! + m.c * p[1]! + m.e, m.b * p[0]! + m.d * p[1]! + m.f]; };
            const inside = (el: SVGGeometryElement, q: number[]) => { const m = el.getScreenCTM()!.inverse(); return el.isPointInFill(new DOMPoint(m.a * q[0]! + m.c * q[1]! + m.e, m.b * q[0]! + m.d * q[1]! + m.f)); };
            const pts = (el: SVGGraphicsElement) => { const v = (el.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number) || []; const o: number[][] = []; for (let i = 0; i + 1 < v.length; i += 2) o.push(scr(el, [v[i]!, v[i + 1]!])); return o; };
            // does segment a-b pass through box r, shrunk by a pixel, or cross segment c-d?
            const thru = (a: number[], b: number[], r: DOMRect) => {
              let t0 = 0, t1 = 1; const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
              for (const [p, q] of [[-dx, a[0]! - r.left - 1], [dx, r.right - 1 - a[0]!], [-dy, a[1]! - r.top - 1], [dy, r.bottom - 1 - a[1]!]] as const) {
                if (p === 0) { if (q < 0) return false; continue; }
                const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
              }
              return t1 > t0;
            };
            const side = (p: number[], q: number[], r: number[]) => Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!));
            const meets = (a: number[], b: number[], c: number[], d: number[]) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
            const all = (sel: string) => (Array.from(svg.querySelectorAll(sel)) as SVGGeometryElement[]).filter(vis);
            const cushions = all('.pfill'), leaves = all('.gb-lf:not(.gone) .blade'), shoots = all('.shf > path.tw, .shf > path.tipbud');
            const wood = (Array.from(svg.querySelectorAll('path')) as Array<SVGGeometryElement & { __pts?: unknown }>).filter((p) => p.__pts && !p.closest('.stub') && vis(p));
            const lines = all('.kld, .leader, .shtie').map((el) => [el, pts(el)] as const).filter(([, p]) => p.length > 1);
            const boxes = (Array.from(svg.querySelectorAll('text, .shtag rect')) as SVGGraphicsElement[]).filter((e) => (e.tagName !== 'text' || (e.textContent || '').trim()) && vis(e));
            let leaders = 0, longest = 0;
            for (const id of Object.keys(B.klbl)) {
              const t = B.klbl[id] as SVGTextElement, g = t.parentNode as SVGGElement, ld = g.querySelector('.kld') as SVGPathElement, p = pts(ld);
              if (p.length < 2) continue;
              leaders++;
              const [A, R] = [p[0]!, p[1]!], len = Math.hypot(A[0]! - R[0]!, A[1]! - R[1]!), name = t.textContent;
              longest = Math.max(longest, len);
              // its own limb: the wood the knot's centre is on; its own shoot comes off the knot's boss
              const e = B.klq.find((q: { id: string }) => q.id === id), c = scr(ld, e.p);
              const own = wood.filter((wd) => inside(wd, c));
              const mine = new Set((B.knot[id].__ids as string[]).map((u) => B.shoots && B.shoots[u] && B.shoots[u].fl).filter(Boolean));
              if (!own.length) out.push(name + ': its knot is on no wood');
              let off = false, back = false;
              const hit = new Set<string>();
              for (let d = 0; d <= len; d += .5) {
                const q = [R[0]! + (A[0]! - R[0]!) * d / len, R[1]! + (A[1]! - R[1]!) * d / len];
                const onOwn = own.some((wd) => inside(wd, q));
                if (!onOwn) off = true; else if (off) back = true;
                for (const wd of wood) if (!own.includes(wd) && inside(wd, q)) hit.add('another limb');
                for (const s of cushions) if (inside(s, q)) hit.add('a cushion');
                for (const s of leaves) if (inside(s, q)) hit.add('a leaf');
                for (const s of shoots) if (inside(s, q) && !(d < 5 && mine.has(s.closest('.shf')))) hit.add('a shoot');
              }
              if (back) out.push(name + ': its leader goes back onto its own limb');
              for (const h of hit) out.push(name + ': its leader crosses ' + h);
              for (const b of boxes) if (b !== t && !g.contains(b) && thru(A, R, b.getBoundingClientRect())) out.push(name + ': its leader crosses "' + (b.textContent || 'a count') + '"');
              for (const [el, q] of lines) if (el !== ld) for (let i = 1; i < q.length; i++) if (meets(A, R, q[i - 1]!, q[i]!)) out.push(name + ': its leader crosses another leader');
            }
            return { leaders, longest, shapes: [cushions.length, leaves.length, wood.length, boxes.length], shoots: shoots.length, out };
          });
          expect(seen.leaders, name + ' ' + width).toBeGreaterThan(3);
          // (the shapes it is tested against are there: cushions, leaves, wood and names, and Max's shoots on tracegrove's tree)
          for (const n of seen.shapes) expect(n, name + ' ' + width).toBeGreaterThan(2);
          if (name === 'tracegrove') expect(seen.shoots, name + ' ' + width).toBeGreaterThan(2);
          // about 90px at most, on any screen
          expect(seen.longest, name + ' ' + width).toBeLessThanOrEqual(90);
          expect(seen.out, name + ' ' + width).toEqual([]);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  }, 240000);

  it('names every knot at rest, beside it or as a numbered pip with its name in the key, so no hop of the headline journey goes unnamed, with a journey’s start, then routes, then stores and jobs first for a place; the card numbers its path the same way; and a name comes in after its knot', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    let pips = 0;
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 1024, 768, 390]) {
          const { page, timing } = await treePage(browser, server.url, state, width);
          // a name, or its pip, fades in only once its knot is there
          expect(timing.filter((x) => x.name !== null).length, name + ' ' + width).toBeGreaterThan(0);
          for (const x of timing) if (x.name !== null) { expect(x.knot, name + ' ' + width + ' ' + x.id).not.toBeNull(); expect(x.name, name + ' ' + width + ' ' + x.id).toBeGreaterThanOrEqual(x.knot!); }
          const seen = await page.evaluate(() => {
            const w = (0, eval)('({ gw, gbHover, gbOrder, gbKTier })'), B = w.gw.B, M = w.gw.M, S = w.gw.state, out: string[] = [];
            const label = (u: string) => S.units.find((q: { id: string }) => q.id === u).label as string;
            const says = (text: string, l: string) => text.startsWith(l) || (text.includes('…') && l.startsWith(text.slice(0, text.indexOf('…'))));
            const vis = (e: Element) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0;
            const meet = (p: DOMRect, q: DOMRect) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > .5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > .5;
            w.gw.hov = null; w.gw.pinned = null; w.gbHover(null);
            const num = new Map<string, string>(), keyed: string[] = [];
            for (const id of Object.keys(B.klbl)) {
              const t = B.klbl[id] as SVGTextElement, g = t.parentNode as SVGGElement, ids = B.knot[id].__ids as string[];
              const boss = g.querySelector('.kpip:not(.key)')!, key = g.querySelector('.kpip.key')!, n = boss.textContent || '';
              if (!t.classList.contains('on') || !vis(t)) { out.push(label(ids[0]!) + ': no name at rest'); continue; }
              if (!says(t.textContent || '', label(ids[0]!)) && !ids.some((u) => says(t.textContent || '', label(u)))) out.push(label(ids[0]!) + ': named "' + t.textContent + '"');
              const lead = (g.querySelector('.kld')!.getAttribute('d') || '').length > 0;
              if (n) {
                // a pip on the boss, the same number in the key, and the name beside it there, with no leader
                if (!vis(boss) || !vis(key) || key.textContent !== n) out.push(label(ids[0]!) + ': pip ' + n + ' has no row in the key');
                if (lead) out.push(label(ids[0]!) + ': a pip and a leader both');
                const kr = key.getBoundingClientRect(), tr = t.getBoundingClientRect();
                if (Math.abs((kr.top + kr.bottom) / 2 - (tr.top + tr.bottom) / 2) > 4 || tr.left < kr.right - .5 || tr.left - kr.right > 12) out.push(label(ids[0]!) + ': its name is not on its row in the key');
                for (const u of ids) num.set(u, n);
                keyed.push(n);
              } else {
                if (!lead) out.push(label(ids[0]!) + ': named with no leader');
                if (vis(boss) || vis(key)) out.push(label(ids[0]!) + ': a pip as well as a leader');
              }
            }
            // the numbers count 1, 2, 3 … and no two names, nor a name and a key row, sit on one another
            if (keyed.slice().sort((a, b) => +a - +b).join(' ') !== keyed.map((_, i) => String(i + 1)).join(' ')) out.push('the pips are numbered ' + keyed.join(' '));
            const marks = (Array.from(B.svg.querySelectorAll('.klbl.on, .kpip.key')) as Element[]).filter(vis);
            for (let a = 0; a < marks.length; a++) for (let b = a + 1; b < marks.length; b++) if (marks[a]!.parentNode !== marks[b]!.parentNode && meet(marks[a]!.getBoundingClientRect(), marks[b]!.getBoundingClientRect())) out.push('"' + marks[a]!.textContent + '" and "' + marks[b]!.textContent + '" overlap');
            // every hop of the headline journey is named at rest
            const head = w.gbOrder(M)[0];
            // who gets open ground first when it runs short: where a journey starts, then HTTP routes, then stores and jobs, then helper files
            const tier = (u: string) => w.gbKTier(M, [u]) as number;
            for (const j of M.J) if (tier(j.entry) !== 0) out.push('the start of ' + j.title + ' is not first for a place');
            for (const u of Object.keys(M.U)) if (!M.J.some((j: { entry: string }) => j.entry === u) && M.U[u].unitKind === 'route' && tier(u) !== 1) out.push(label(u) + ' is not a route for a place');
            for (const u of Object.keys(M.U)) if (!M.J.some((j: { entry: string }) => j.entry === u) && ['job', 'table'].includes(M.U[u].unitKind) && tier(u) !== 2) out.push(label(u) + ' is not a store or a job for a place');
            for (const u of Object.keys(M.U)) if (!M.U[u].root && !M.J.some((j: { entry: string }) => j.entry === u) && M.U[u].unitKind === 'module' && M.U[u].layer === 'lib' && tier(u) !== 3) out.push(label(u) + ' is not a helper file for a place');
            for (const u of head.units as string[]) if (!S.units.find((q: { id: string }) => q.id === u).root && !Object.keys(B.klbl).some((id) => B.knot[id].__ids.includes(u) && B.klbl[id].classList.contains('on'))) out.push('headline hop ' + label(u) + ' is unnamed');
            // the card's path numbers each pipped hop as the key does
            let cards = 0;
            for (const id of Object.keys(B.leaf)) {
              const x = S.scenarios.find((q: { id: string }) => q.id === id), j = x && S.journeys.find((q: { id: string }) => q.id === x.journey);
              if (!j || B.leaf[id].classList.contains('gone') || !(j.units as string[]).some((u) => num.has(u))) continue;
              w.gbHover('s:' + id, B.leaf[id]);
              // each hop in the card, by the name it gives, and the number it carries
              const hops = new Map((Array.from((B.tip as HTMLElement).querySelectorAll('.path .gw-hop')) as HTMLElement[]).map((e) => {
                const c = e.cloneNode(true) as HTMLElement, pip = c.querySelector('.gb-kn'); if (pip) pip.remove();
                return [(c.textContent || '').replace(/\s*›\s*$/, ''), pip ? pip.textContent : null] as const;
              }));
              for (const u of j.units as string[]) {
                if (!hops.has(label(u))) { out.push('card for ' + x.title + ': no hop ' + label(u)); continue; }
                if (hops.get(label(u)) !== (num.get(u) ?? null)) out.push('card for ' + x.title + ': hop ' + label(u) + ' numbered ' + hops.get(label(u)) + ', key says ' + (num.get(u) || 'none'));
              }
              cards++;
              w.gbHover(null);
            }
            return { pips: keyed.length, cards, out };
          });
          expect(seen.out, name + ' ' + width).toEqual([]);
          if (seen.pips) expect(seen.cards, name + ' ' + width).toBeGreaterThan(0);
          pips += seen.pips;
          await page.close();
        }
      }
    } finally { await browser.close(); }
    // the trees are crowded enough somewhere that a pip is needed, so the key is tested too
    expect(pips).toBeGreaterThan(0);
  }, 240000);
});
