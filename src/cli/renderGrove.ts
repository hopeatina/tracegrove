/**
 * The terminal view of `tracegrove grow`: a framed ASCII bonsai beside its ledger. Limbs are
 * polylines laid out for the character grid and rasterized into classic strokes (`_` along a row,
 * `/` and `\` on diagonals, `|` straight up); foliage is ampersands, one clump per scenario; gold
 * marks where a tracer is reading. Every mark comes from the event-folded state.
 */
import {
  LAYER_CODE, MODES, PHASE_SHORT, criterionStatus, depthOf, growSummary, inMode, modeCount,
  type DepthStatus, type GrowEvent, type GrowState, type GrowUnit, type Mode,
} from '../authoring/growState.ts';

export type Style = '' | 'frame' | 'dim' | 'bark' | 'root' | 'gold' | 'leaf' | 'moss' | 'fail' | 'b' | 'inv' | 'ital';
type Seg = [Style, string];
type Line = Seg[];
export type GroveView = { width: number; height?: number; elapsed: number; color: boolean; picking?: Mode | null; log?: string | null };

const PALETTE: Record<Exclude<Style, ''>, string> = {
  frame: '38;2;74;88;80', dim: '38;2;139;138;127', bark: '38;2;185;173;148', root: '38;2;216;178;94', gold: '1;38;2;240;200;104',
  leaf: '38;2;169;210;138', moss: '38;2;104;150;84', fail: '38;2;239;106;90', b: '1;38;2;236;230;216', inv: '7', ital: '3;38;2;139;138;127',
};
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const RANK: Record<string, number> = { frame: 0, dim: 1, bark: 2, root: 2, moss: 3, gold: 4, fail: 4, leaf: 5, b: 6 };

const chars = (s: string) => [...s];
const width = (l: Line) => l.reduce((n, [, t]) => n + chars(t).length, 0);
const cut = (s: string, n: number) => { const c = chars(s); return c.length > n ? `${c.slice(0, Math.max(0, n - 1)).join('')}…` : s; };
function fit(l: Line, n: number): Line {
  const out: Line = []; let used = 0;
  for (const [st, t] of l) {
    const c = chars(t);
    if (used + c.length <= n) { out.push([st, t]); used += c.length; continue; }
    if (n - used > 0) out.push([st, `${c.slice(0, Math.max(0, n - used - 1)).join('')}…`]);
    used = n; break;
  }
  if (used < n) out.push(['', ' '.repeat(n - used)]);
  return out;
}
const pad = (s: string, n: number) => cut(s, n).padEnd(n);
const paint = (l: Line, color: boolean) => l.map(([st, t]) => (color && st ? `\x1b[${PALETTE[st]}m${t}\x1b[0m` : t)).join('');

/* ---------- the tree ---------- */

export const CW = 56;
const TRUNK_X = 28;
type Pt = [number, number];
type Cell = { x: number; y: number; g: string; f: number; dx: number; dy: number };

/** Rasterize a polyline to grid cells, choosing the stroke from the move to the next cell. */
export function cellsOf(pts: Pt[]): Cell[] {
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    let [x0, y0] = pts[i - 1]!; const [x1, y1] = pts[i]!;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
    for (;;) {
      const last = out.at(-1);
      if (!last || last[0] !== x0 || last[1] !== y0) out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  return out.map(([x, y], i, a) => {
    const prev = a[i - 1]; const nextPt = a[i + 1] ?? [x + (x - (prev?.[0] ?? x)), y + (y - (prev?.[1] ?? y))] as Pt;
    const dr = nextPt[1] - y, dc = nextPt[0] - x;
    const g = dr === 0 ? '_' : dc === 0 ? '|' : (dr < 0) === (dc > 0) ? '/' : '\\';
    return { x, y, g, f: a.length > 1 ? i / (a.length - 1) : 1, dx: dc, dy: dr };
  });
}

export type Geometry = { ground: number; height: number; trunk: Cell[]; limbs: Map<string, Cell[]>; tips: Map<string, Pt>; dead: Map<string, Cell[]>; shown: GrowUnit[] };
const MAX_BRANCHES = 12; const MAX_ROOTS = 6;

/**
 * Lay out limbs for any number of units: branches fan from low and wide to high and upright, starting
 * lower on the trunk the wider they reach; roots fan below the soil. Deterministic for a given tree.
 */
export function layout(units: GrowUnit[]): Geometry {
  const branches = units.filter((u) => !u.root).slice(0, MAX_BRANCHES);
  const roots = units.filter((u) => u.root).slice(0, MAX_ROOTS);
  const ground = 13; const height = ground + (roots.length ? 8 : 2);
  const trunk = cellsOf([[TRUNK_X, ground], [TRUNK_X, ground - 3], [TRUNK_X + 1, ground - 4], [TRUNK_X, ground - 6], [TRUNK_X, ground - 7]]);
  const limbs = new Map<string, Cell[]>(); const tips = new Map<string, Pt>(); const dead = new Map<string, Cell[]>();
  const nb = branches.length;
  // Alternate sides so neighbors in the list land apart: left, right, left...
  const order = branches.map((_, i) => i).sort((a, b) => (a % 2) - (b % 2) || (a % 2 ? b - a : a - b));
  order.forEach((idx, k) => {
    const u = branches[idx]!;
    const deg = nb === 1 ? 96 : 166 - k * (152 / (nb - 1));
    const th = deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    const ys = Math.round(ground - 2 - s * 5), xs = TRUNK_X + (c > 0.25 ? 1 : c < -0.25 ? -1 : 0);
    const reach = 13 + Math.round(9 * Math.abs(c));
    const xt = Math.max(3, Math.min(CW - 4, Math.round(TRUNK_X + c * reach)));
    const yt = Math.max(1, Math.round(ys - 2 - s * (ys - 3)));
    const xm = Math.round(xs + (xt - xs) * 0.55), ym = Math.round(ys + (yt - ys) * 0.3);
    limbs.set(u.id, cellsOf([[xs, ys], [xm, ym], [xt, yt]]));
    tips.set(u.id, [xt + (c > 0.3 ? 2 : c < -0.3 ? -2 : 0), yt + (Math.abs(c) <= 0.3 ? -1 : 0)]);
  });
  const nr = roots.length;
  roots.forEach((u, j) => {
    const deg = nr === 1 ? 290 : 204 + j * (132 / (nr - 1));
    const th = deg * Math.PI / 180, c = Math.cos(th), s = Math.abs(Math.sin(th));
    const xs = TRUNK_X + (c < 0 ? -1 : 1), ys = ground + 1;
    const xt = Math.max(3, Math.min(CW - 4, Math.round(TRUNK_X + c * (10 + 9 * Math.abs(c))))), yt = Math.round(ground + 1 + s * 5);
    const cells = cellsOf([[xs, ys], [Math.round(xs + (xt - xs) * 0.45), Math.round(ys + (yt - ys) * 0.65)], [xt, yt]]);
    limbs.set(u.id, cells);
    tips.set(u.id, [xt + (c > 0.2 ? 2 : c < -0.2 ? -2 : 0), yt + (Math.abs(c) <= 0.2 ? 1 : 0)]);
    const dir = c >= 0 ? 1 : -1;
    dead.set(u.id, cellsOf([[xt, yt], [xt + dir * 3, Math.min(height - 1, yt + 1)], [xt + dir * 5, Math.min(height - 1, yt + 2)]]));
  });
  return { ground, height, trunk, limbs, tips, dead, shown: [...branches, ...roots] };
}

const ease = (g: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, g)), 3);
const ASPECT = 2.1;

export function tracing(s: GrowState): Set<string> {
  return new Set(s.agents.filter((a) => !a.done && a.unit && (s.phase === 2 || s.phase === 3 || s.phase === 5)).map((a) => a.unit!));
}

function canvas(s: GrowState, geo: Geometry, elapsed: number): Line[] {
  const ch = Array.from({ length: geo.height }, () => new Array<string>(CW).fill(' '));
  const col = Array.from({ length: geo.height }, () => new Array<Style>(CW).fill(''));
  const put = (x: number, y: number, c: string, st: Style) => {
    const r = Math.round(y), k = Math.round(x); if (r < 0 || r >= geo.height || k < 0 || k >= CW) return;
    if (ch[r]![k] === ' ' || (RANK[st] ?? 0) >= (RANK[col[r]![k]!] ?? -1)) { ch[r]![k] = c; col[r]![k] = st; }
  };
  const draw = (cells: Cell[], g: number, st: Style, dotted = false) => cells.forEach((p, i) => { if (p.f > g || (dotted && i % 2)) return; put(p.x, p.y, dotted ? (p.g === '_' ? '.' : p.g === '|' ? ':' : p.g) : p.g, st); });
  const at = (cells: Cell[], f: number) => cells[Math.min(cells.length - 1, Math.max(0, Math.round(f * (cells.length - 1))))]!;
  for (let k = 2; k < CW - 2; k++) put(k, geo.ground, k % 2 ? '~' : '-', 'frame');
  if (s.trunkAt !== null) {
    const g = ease((elapsed - s.trunkAt) / 900);
    draw(geo.trunk, g, 'bark');
    for (const p of geo.trunk) { if (p.f > g || p.f > 0.5) break; put(p.x + 1, p.y, '|', 'bark'); }
    if (g > 0.1) { put(TRUNK_X - 1, geo.ground, '/', 'bark'); put(TRUNK_X + 2, geo.ground, '\\', 'bark'); }
  }
  const busy = tracing(s); const grown = new Map<string, number>();
  for (const u of geo.shown) {
    const cells = geo.limbs.get(u.id)!;
    const g = ease((elapsed - u.foundAt) / 1100); grown.set(u.id, g);
    draw(cells, g, busy.has(u.id) ? 'gold' : u.root ? 'root' : 'bark');
    if (g >= 1 && s.stops.some((x) => x.unit === u.id) && geo.dead.has(u.id)) {
      const stopAt = s.stops.find((x) => x.unit === u.id) ? s.ms : elapsed;
      draw(geo.dead.get(u.id)!, ease((elapsed - Math.min(stopAt, elapsed)) / 900 + 0.4), 'fail', true);
    }
  }
  // Foliage: a clump per scenario, alternating sides along the outer part of its limb.
  const per = new Map<string, number>();
  for (const sc of s.scenarios) {
    const cells = geo.limbs.get(sc.unit); const g = grown.get(sc.unit);
    if (!cells || !g || g < 1) continue;
    const i = (per.get(sc.unit) ?? -1) + 1; per.set(sc.unit, i);
    const unit = geo.shown.find((u) => u.id === sc.unit)!;
    const p = at(cells, Math.min(1, 0.6 + i * 0.12)), side = i % 2 ? 1 : -1;
    const vx = p.dx, vy = p.dy * ASPECT, L = Math.hypot(vx, vy) || 1, nx = -vy / L * side, ny = vx / L * side / ASPECT;
    const lx = p.x + nx * 1.3, ly = p.y + ny * 1.3 - (unit.root ? 0 : 0.4);
    const r = s.run[sc.id]; const st = !inMode(s, sc) ? 'out' : r ? r.st : 'in';
    const color: Style = st === 'pass' ? 'leaf' : st === 'fail' ? 'fail' : st === 'run' ? 'gold' : 'moss';
    if (unit.root) { put(lx, ly, st === 'out' ? '·' : st === 'pass' || st === 'fail' ? '●' : '∘', color); continue; }
    if (st === 'out') { put(lx, ly, '·', 'frame'); continue; }
    const d = nx >= 0 ? 1 : -1;
    put(lx, ly, st === 'run' ? SPIN[Math.floor(elapsed / 90) % SPIN.length]! : '&', color); put(lx + d, ly, '&', color); put(lx + 2 * d, ly, '&', color); put(lx + d, ly - 1, '&', color);
  }
  geo.shown.forEach((u, i) => {
    if ((grown.get(u.id) ?? 0) < 1) return;
    const [x, y] = geo.tips.get(u.id)!; const label = String(i + 1);
    chars(label).forEach((c, k) => put(x + k - (x < TRUNK_X ? label.length - 1 : 0), y, c, busy.has(u.id) || s.focus === u.id ? 'gold' : 'b'));
  });
  for (const id of busy) {
    const cells = geo.limbs.get(id); if (!cells || (grown.get(id) ?? 0) < 1) continue;
    const p = at(cells, 0.15 + 0.85 * ((elapsed / 1500 + Number(id.slice(1)) * 0.27) % 1)); put(p.x, p.y, '◆', 'gold');
  }
  return ch.map((row, r) => { const line: Line = []; let cur: Style | null = null; let buf = '';
    row.forEach((c, k) => { const st = col[r]![k]!; if (st !== cur) { if (buf) line.push([cur ?? '', buf]); buf = ''; cur = st; } buf += c; });
    if (buf) line.push([cur ?? '', buf]); return line; });
}

/* ---------- the frame ---------- */

const PIP: Record<DepthStatus | 'wait', Seg> = { ok: ['leaf', '●'], none: ['leaf', '○'], stop: ['fail', '✕'], wait: ['frame', '·'] };
const CELL_MARK = { built: ['leaf', '✓'], indirect: ['root', '~'], missing: ['fail', '✕'] } as const;
const fmt = (ms: number) => { const sec = Math.max(0, ms) / 1000; return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${(sec % 60).toFixed(1).padStart(4, '0')}`; };
const secs = (ms: number | undefined) => `${((ms ?? 0) / 1000).toFixed(1)}s`;

/** One frame as plain or colored lines. `width` below 118 stacks the ledger under the tree. */
export function renderGrove(s: GrowState, view: GroveView): string[] {
  const wide = view.width >= 118;
  const TW = wide ? 118 : Math.max(62, Math.min(view.width, 100));
  const IN = TW - 4;
  const sp = SPIN[Math.floor(view.elapsed / 90) % SPIN.length]!;
  const L: Line[] = [];
  const F = (t: string): Seg => ['frame', t];
  const one = (l: Line): Line => [F('│ '), ...fit(l, IN), F(' │')];
  const LW = CW, RW = TW - LW - 7;
  const two = (a: Line, b: Line): Line => [F('│ '), ...fit(a, LW), F(' │ '), ...fit(b, RW), F(' │')];
  const rule = (l: string, mid: string | null, r: string): Line => [F(l + (mid && wide ? `${'─'.repeat(LW + 2)}${mid}${'─'.repeat(RW + 2)}` : '─'.repeat(TW - 2)) + r)];
  const mode = view.picking ?? s.mode;
  const modeLabel = MODES.find((m) => m.id === mode)!.label.toLowerCase();
  const c = s.change;

  // Title bar.
  const title: Line = [['', ' '], ['b', 'tracegrove grow'], ['dim', ' · '], ['', c ? c.branch : 'reading the branch'], ...(c ? [['dim', ' → '] as Seg, ['', c.base] as Seg] : []), ['', ' ']];
  const right: Line = [['', ' '], ['root', s.modeBy || view.picking ? modeLabel : 'choosing'], ['dim', ` ${fmt(view.elapsed)}`], ['', ' ']];
  const fill = TW - 4 - width(title) - width(right);
  L.push([F('╭─'), ...(fill >= 1 ? [...title, F('─'.repeat(fill)), ...right] : fit(title, TW - 4)), F('─╮')]);
  // The change and its spec.
  L.push(one(c ? [['b', cut(c.title, 60)], ['dim', `  ${c.pr ? `#${c.pr} · ` : ''}${c.files} files · `], ['leaf', `+${c.adds}`], ['dim', ' '], ['fail', `−${c.dels}`],
    ...(s.spec ? [['dim', '   spec '] as Seg, ['', s.spec.source] as Seg, ['dim', ` · ${s.criteria.length} criteria`] as Seg] : s.specMissing ? [['root', '   no spec'] as Seg] : [])]
    : [['root', sp], ['', ' reading the branch']]));
  // Phase rail.
  const seg = Math.floor((IN - 5) / 6);
  const rail: Line = [];
  PHASE_SHORT.forEach((name, i) => {
    const n = Math.max(1, seg - name.length - 2);
    if (i) rail.push(['', ' ']);
    if (i < s.phase || s.done) rail.push(['leaf', '━'.repeat(n)], ['dim', ` ${name}`]);
    else if (i === s.phase) rail.push(['root', '━'.repeat(n)], ['gold', ` ${name}`]);
    else rail.push(['frame', '┄'.repeat(n)], ['dim', ` ${name}`]);
  });
  L.push(one(rail));
  L.push(rule('├', '┬', '┤'));

  // Tree beside (or above) its ledger.
  const geo = layout(s.units);
  const rows = canvas(s, geo, view.elapsed);
  const busy = tracing(s);
  const led = (u: GrowUnit): Line => {
    const i = s.units.indexOf(u) + 1;
    const cells = (s.cells[u.id] ?? []).flatMap((x, k): Seg[] => [...(k ? [['', ' '] as Seg] : []), [CELL_MARK[x.status][0], `${LAYER_CODE[x.layer]}${CELL_MARK[x.status][1]}`]]);
    return [[busy.has(u.id) || s.focus === u.id ? 'gold' : 'b', String(i).padStart(2)], ['', ` ${pad(u.label, 25)} `], ...depthOf(s, u.id).map((d) => PIP[d]), ['', '  '], ...cells];
  };
  const ledger: Line[] = [[['dim', 'BRANCHES'], ['ital', '  what people use']]];
  const shownBranches = s.units.filter((u) => !u.root);
  shownBranches.slice(0, geo.ground - 2).forEach((u) => ledger.push(led(u)));
  if (shownBranches.length > geo.ground - 2) ledger.push([['dim', `   +${shownBranches.length - (geo.ground - 2)} more branches`]]);
  while (ledger.length < geo.ground) ledger.push([]);
  ledger.push([['frame', '─'.repeat(10)], ['dim', c ? ` ${c.pr ? `PR #${c.pr}` : c.head ?? c.branch}` : '']]);
  ledger.push([['root', 'ROOTS'], ['ital', '  what it depends on']]);
  s.units.filter((u) => u.root).forEach((u) => ledger.push(led(u)));
  if (!s.units.some((u) => u.root) && s.phase >= 2) ledger.push([['dim', '   none: no table, cache or third party in the change']]);
  ledger.push([]);
  ledger.push([['dim', 'depth '], ['leaf', '●'], ['dim', ' found '], ['leaf', '○'], ['dim', ' none '], ['fail', '✕'], ['dim', ' stopped '], ['gold', '◆'], ['dim', ' tracing']]);
  ledger.push([['dim', 'leaf  '], ['moss', '&'], ['dim', ' drafted '], ['leaf', '&'], ['dim', ' passed '], ['fail', '&'], ['dim', ' failed '], ['frame', '·'], ['dim', ' larger mode']]);
  if (wide) for (let r = 0; r < Math.max(rows.length, ledger.length); r++) L.push(two(rows[r] ?? [], ledger[r] ?? []));
  else { for (const r of rows) L.push(one([['', ' '.repeat(Math.max(0, Math.floor((IN - CW) / 2)))], ...r])); L.push(rule('├', null, '┤')); for (const r of ledger) L.push(one(r)); }
  L.push(rule('├', '┴', '┤'));

  // Tracers while they work: rules first, then an agent per lane.
  const live = s.agents.filter((a) => s.phase <= 3 || !a.done);
  if (live.length && !s.done) for (const a of live) L.push(one([[a.done ? (a.ok ? 'leaf' : 'fail') : 'root', a.done ? (a.ok ? '✓' : '✕') : sp], ['', ` ${pad(`${a.by === 'rules' ? 'rules' : a.by}${a.model ? ` ${a.model}` : ''} · ${a.brief}`, 44)} `], ['dim', a.note]]));
  // Honesty: what the spec missed, what is not built, where tracing stopped, what an agent wrote or got wrong.
  const notes: Line[] = [];
  for (const d of s.drift) notes.push([['root', '▲ not in spec   '], ['', pad(d.what, 40)], ['dim', ` ${d.loc}`]]);
  for (const [id, why] of Object.entries(s.unbuilt)) notes.push([['fail', '✕ not built     '], ['', `${id}: ${cut(s.criteria.find((x) => x.id === id)?.text ?? '', 54)}`], ['dim', `  ${cut(why, 40)}`]]);
  for (const x of s.stops) notes.push([['fail', '╌ stopped       '], ['', pad(s.units.find((u) => u.id === x.unit)?.label ?? x.unit, 18)], ['dim', ` ${x.why}`]]);
  for (const x of s.dropped.slice(0, 3)) notes.push([['fail', '✕ claim dropped '], ['dim', `${x.agent} ${x.why}`]]);
  if (s.dropped.length > 3) notes.push([['dim', `                 +${s.dropped.length - 3} more dropped claims`]]);
  for (const id of s.extOrder) { const x = s.ext[id]!; notes.push([['root', '✎ agent wrote   '], ['', pad(x.extKind, 20)], ['', ` ${pad(x.path.split('/').pop() ?? x.path, 34)} `], [x.state === 'proven' ? 'leaf' : x.state === 'review' ? 'root' : 'dim', x.state === 'proven' ? 'proven' : x.state === 'review' ? 'needs your review' : x.state === 'draft' ? 'draft, unused' : 'not proven yet']]); }
  if (s.specMissing && s.phase >= 1) notes.push([['root', '? no spec       '], ['dim', s.specMissing]]);
  const NOTE_MAX = 9;
  if (notes.length) { L.push(one([])); notes.slice(0, NOTE_MAX).forEach((n) => L.push(one(n))); if (notes.length > NOTE_MAX) L.push(one([['dim', `+${notes.length - NOTE_MAX} more notes in the log`]])); }
  // Spec criteria, both ways.
  if (s.criteria.length && s.phase >= 2) {
    L.push(one([]));
    for (const cr of s.criteria.slice(0, 10)) {
      const st = criterionStatus(s, cr.id);
      const tone: Style = st.cls === 'pass' ? 'leaf' : st.cls === 'warn' ? 'root' : st.cls === 'fail' || st.cls === 'miss' ? 'fail' : 'dim';
      L.push(one([['b', pad(cr.id, 4)], ['', pad(cr.text, IN - 24)], ['', ' '], [tone, st.text]]));
    }
    if (s.criteria.length > 10) L.push(one([['dim', `+${s.criteria.length - 10} more criteria`]]));
  }
  // How much to prove.
  if (s.counts && !s.done && (s.asked || view.picking)) {
    L.push(one([]));
    L.push(one([['dim', 'prove   '], ...MODES.flatMap((m, i): Seg[] => [[m.id === mode ? 'inv' : 'dim', ` ${i + 1} ${m.label.toLowerCase()} · ${modeCount(s, m.id)} `], ['', '  ']])]));
    L.push(one([['root', `↵ prove ${modeLabel}`], ['dim', ` · ${modeCount(s, mode)} scenarios · ${MODES.find((m) => m.id === mode)!.blurb}`]]));
  }
  // The scenarios in the chosen mode, with their mock and real lanes.
  if (s.modeBy) {
    const list = s.scenarios.filter((x) => inMode(s, x));
    const room = view.height ? Math.max(3, view.height - L.length - 8) : list.length;
    const TITLE = Math.max(20, IN - 51);
    L.push(one([]));
    L.push(one([['dim', `  ${'kind'.padEnd(11)}${'scenario'.padEnd(TITLE + 1)}${'spec'.padEnd(9)}${'mock'.padEnd(13)}real`]]));
    for (const x of list.slice(0, room)) {
      const r = s.run[x.id]; const v = s.real[x.id];
      const mk: Seg = !r ? ['dim', '○'] : r.st === 'run' ? ['root', sp] : r.st === 'pass' ? ['leaf', '✓'] : r.st === 'fail' ? ['fail', '✕'] : ['dim', '–'];
      const mock: Seg = !r ? ['dim', '·'] : r.st === 'run' ? ['root', 'running'] : r.st === 'pass' ? ['leaf', secs(r.ms)] : r.st === 'fail' ? ['fail', 'failed'] : ['dim', x.flow ? 'not run' : 'no flow yet'];
      const real: Seg = !x.variants.length ? ['', ''] : x.mockOnly ? ['dim', 'mock only'] : !v ? ['dim', '·'] : v.st === 'pass' ? ['leaf', `✓ ${secs(v.ms)} sandbox`] : ['root', v.na ? 'mock only' : 'skipped: no key'];
      const agentMade = x.ext.some((e) => s.ext[e] && s.ext[e]!.state !== 'proven');
      L.push(one([mk, ['dim', ` ${x.scenarioKind.padEnd(10)} `], ['', pad(x.title, TITLE - 2)], agentMade ? ['root', ' ✎'] : ['', '  '], ['dim', ` ${pad(x.criteria.join(' '), 8)} `], ...fit([mock], 12), ['', ' '], real]));
      if (r?.st === 'fail' && r.why) L.push(one([['fail', `    ${r.why}`]]));
    }
    if (list.length > room) L.push(one([['dim', `  +${list.length - room} more scenarios`]]));
  }
  // The result.
  if (s.blocked) { L.push(one([])); L.push(one([['fail', `✕ ${s.blocked.code}`], ['', ` ${s.blocked.detail}`]])); L.push(one([['dim', `  fix: ${s.blocked.action}`]])); }
  if (s.done) {
    const t = growSummary(s);
    L.push(one([]));
    L.push(one([['b', `${t.passed}/${t.scenarios} proved`], ['', '  '], [t.failed ? 'fail' : 'dim', `${t.failed} failed`], ['dim', `  ${t.notRun} not run`],
      ...(t.criteria ? [['dim', '  · spec '] as Seg, ['leaf', `${t.proved} proved`] as Seg, ['', ' '] as Seg, ['root', `${t.agentChecked} agent-checked`] as Seg, ['', ' '] as Seg, [t.needYou ? 'fail' : 'dim', `${t.needYou} need you`] as Seg] : []),
      ...(t.toReview ? [['dim', '  · '] as Seg, ['root', `${t.toReview} agent-written to review`] as Seg] : [])]));
    L.push(one([['dim', view.log ? `log ${view.log} · ` : ''], ['dim', 'open it in tracegrove ui → Discover']]));
  }
  L.push(rule('╰', null, '╯'));
  return L.map((l) => paint(l, view.color));
}

/** Plain progress lines for logs and pipes: one line per step that matters, no redraw. */
export function plainLine(s: GrowState, e: GrowEvent): string | null {
  const c = s.change;
  switch (e.kind) {
    case 'change.read': return c ? `grow ${c.branch} → ${c.base}: ${c.title} (${c.files} files, +${c.adds} −${c.dels})` : null;
    case 'spec.found': return `spec: ${s.spec!.source} via ${s.spec!.via}, ${s.spec!.criteria} criteria`;
    case 'spec.missing': return `spec: none (${s.specMissing})`;
    case 'unit.found': { const u = s.units.at(-1)!; return `${u.root ? 'root  ' : 'branch'} ${String(s.units.length).padStart(2)} ${u.label} (${u.unitKind}, ${u.loc})`; }
    case 'agent.done': { const a = s.agents.filter((x) => x.done).at(-1)!; return `traced ${a.brief} (${a.by}): ${a.note}`; }
    case 'mode.chosen': return `mode: ${s.mode} (${s.modeBy}) · ${modeCount(s, s.mode)} scenarios of ${s.scenarios.length} drafted`;
    case 'scenario.passed': case 'scenario.failed': { const x = s.scenarios.find((y) => y.id === e.scenario)!; return `${e.kind === 'scenario.passed' ? 'passed' : 'FAILED'} ${x.title} (${x.flow ?? 'agent-written flow'})${e.kind === 'scenario.failed' ? `: ${e.why}` : ''}`; }
    case 'discovery.finished': return `done: ${e.passed}/${e.ran + e.notRun} proved, ${e.failed} failed, ${e.notRun} not run`;
    case 'discovery.blocked': return `blocked: ${s.blocked!.code}: ${s.blocked!.detail}. Fix: ${s.blocked!.action}`;
    default: return null;
  }
}
