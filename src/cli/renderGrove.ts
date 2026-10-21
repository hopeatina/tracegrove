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
export type GroveView = { width: number; height?: number; elapsed: number; clock?: number; color: boolean; picking?: Mode | null; log?: string | null };

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
/** One drawn cell of a limb, in growth order: `f` is how far along the limb it sits (0 at the trunk, 1 at the tip). */
type Cell = { x: number; y: number; g: string; f: number };
const along = (pts: Array<[number, number, string]>): Cell[] => pts.map(([x, y, g], i) => ({ x, y, g, f: pts.length > 1 ? i / (pts.length - 1) : 1 }));

export type Geometry = { ground: number; height: number; top: number; limbs: Map<string, Cell[]>; tips: Map<string, Pt>; pads: Map<string, { y: number; from: number; dir: number }>; dead: Map<string, Cell[]>; joins: Map<number, string>; shown: GrowUnit[] };
const MAX_BRANCHES = 12; const MAX_ROOTS = 6;

/**
 * A tiered bonsai for any number of units. Each branch gets its own row, left and right alternating, so
 * limbs never cross; the lowest reach widest and the highest are short, which gives the tree its taper.
 * A limb leaves the trunk, turns up once with a rounded elbow, and runs out to a foliage pad that holds
 * one leaf per scenario. Roots mirror it below the soil, in gold.
 */
export function layout(units: GrowUnit[]): Geometry {
  const branches = units.filter((u) => !u.root).slice(0, MAX_BRANCHES);
  const roots = units.filter((u) => u.root).slice(0, MAX_ROOTS);
  const crown = branches.length % 2 === 1 && branches.length > 2 ? branches.at(-1)! : null;
  const sides = branches.filter((u) => u !== crown);
  const perSide = [sides.filter((_, i) => i % 2 === 0), sides.filter((_, i) => i % 2 === 1)];
  const most = Math.max(1, perSide[0]!.length, perSide[1]!.length);
  const top = crown ? 3 : 1;
  const ground = top + 2 * most + 3;
  const height = ground + 1 + (roots.length ? 2 * Math.ceil(roots.length / 2) + 1 : 0);
  const limbs = new Map<string, Cell[]>(); const tips = new Map<string, Pt>(); const pads = new Map<string, { y: number; from: number; dir: number }>();
  const dead = new Map<string, Cell[]>(); const joins = new Map<number, string>();
  perSide.forEach((list, side) => {
    const dir = side === 0 ? -1 : 1;
    list.forEach((u, j) => {
      const n = list.length; const lift = n > 1 ? j / (n - 1) : 0.5;
      const y = ground - 3 - side - j * 2;
      const reach = Math.round(22 - lift * 12);
      // Out from the trunk along its own row, the tip curling up into the pad above it.
      const pts: Array<[number, number, string]> = [];
      for (let x = TRUNK_X + dir; Math.abs(x - TRUNK_X) < reach; x += dir) pts.push([x, y, lift > 0.6 ? '─' : '━']);
      const end = TRUNK_X + dir * reach;
      pts.push([end, y, dir < 0 ? '╰' : '╯']);
      limbs.set(u.id, along(pts)); joins.set(y, (joins.get(y) ?? '') + (dir < 0 ? 'L' : 'R'));
      pads.set(u.id, { y: y - 1, from: end, dir: -dir });
      tips.set(u.id, [end + 2 * dir, y]);
    });
  });
  if (crown) {
    limbs.set(crown.id, along([[TRUNK_X, top + 2, '│'], [TRUNK_X, top + 1, '│']]));
    pads.set(crown.id, { y: top, from: TRUNK_X - 2, dir: 1 });
    tips.set(crown.id, [TRUNK_X + 4, top]);
  }
  roots.forEach((u, j) => {
    const dir = j % 2 === 0 ? -1 : 1; const k = Math.floor(j / 2);
    const y = ground + 2 + k * 2;
    const reach = Math.round(20 - k * 5);
    const pts: Array<[number, number, string]> = [];
    for (let x = TRUNK_X + dir; Math.abs(x - TRUNK_X) <= reach; x += dir) pts.push([x, y, '─']);
    limbs.set(u.id, along(pts)); joins.set(y, (joins.get(y) ?? '') + (dir < 0 ? 'l' : 'r'));
    const end = TRUNK_X + dir * (reach + 1);
    dead.set(u.id, along([[end, y, '╌'], [end + dir, y, '╌'], [end + 2 * dir, y, '✕']]));
    pads.set(u.id, { y, from: end - dir, dir });
    tips.set(u.id, [end + 4 * dir, y]);
  });
  return { ground, height, top, limbs, tips, pads, dead, joins, shown: [...branches, ...roots] };
}

const ease = (g: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, g)), 3);

export function tracing(s: GrowState): Set<string> {
  // An agent between reports is still reading one of its units; show it moving through them.
  return new Set(s.agents.filter((a) => !a.done && (a.unit || a.units.length) && (s.phase === 2 || s.phase === 3 || s.phase === 5)).map((a) => a.unit ?? a.units[Math.floor(s.ms / 1600) % a.units.length]!));
}

function canvas(s: GrowState, geo: Geometry, elapsed: number): Line[] {
  const ch = Array.from({ length: geo.height }, () => new Array<string>(CW).fill(' '));
  const col = Array.from({ length: geo.height }, () => new Array<Style>(CW).fill(''));
  const put = (x: number, y: number, c: string, st: Style) => {
    if (y < 0 || y >= geo.height || x < 0 || x >= CW) return;
    if (ch[y]![x] === ' ' || (RANK[st] ?? 0) >= (RANK[col[y]![x]!] ?? -1)) { ch[y]![x] = c; col[y]![x] = st; }
  };
  const busy = tracing(s);
  const highest = Math.min(geo.ground - 1, ...[...geo.joins.keys()].filter((y) => y < geo.ground));
  // Soil, then the trunk: thick and flared at the base, with a joint wherever a limb leaves it.
  for (let k = 2; k < CW - 2; k++) put(k, geo.ground, k % 3 ? '─' : '┈', 'frame');
  if (s.trunkAt !== null) {
    const g = ease((elapsed - s.trunkAt) / 900);
    const crownTop = geo.shown.some((u) => !u.root) && geo.limbs.get(geo.shown.filter((u) => !u.root).at(-1)!.id)?.[0]?.x === TRUNK_X ? geo.top + 3 : highest;
    const span = geo.ground - crownTop;
    for (let y = geo.ground - 1; y >= crownTop; y--) {
      if ((geo.ground - y) / Math.max(1, span) > g) break;
      const j = geo.joins.get(y) ?? '';
      put(TRUNK_X, y, j.includes('L') && j.includes('R') ? '╋' : j.includes('L') ? '┫' : j.includes('R') ? '┣' : '┃', 'bark');
    }
    if (g > 0.05) { put(TRUNK_X - 1, geo.ground, '╱', 'bark'); put(TRUNK_X, geo.ground, '┻', 'bark'); put(TRUNK_X + 1, geo.ground, '╲', 'bark'); }
    const rootRows = [...geo.joins.keys()].filter((y) => y > geo.ground);
    if (rootRows.length && g >= 1) for (let y = geo.ground + 1; y <= Math.max(...rootRows); y++) {
      const j = geo.joins.get(y) ?? '';
      put(TRUNK_X, y, j.includes('l') && j.includes('r') ? '┼' : j.includes('l') ? '┤' : j.includes('r') ? '├' : '│', 'root');
    }
  }
  const grown = new Map<string, number>();
  for (const u of geo.shown) {
    const g = ease((elapsed - u.foundAt) / 1100); grown.set(u.id, g);
    const tone: Style = busy.has(u.id) ? 'gold' : u.root ? 'root' : 'bark';
    for (const p of geo.limbs.get(u.id)!) if (p.f <= g) put(p.x, p.y, p.g, tone);
    if (g >= 1 && geo.dead.has(u.id) && s.stops.some((x) => x.unit === u.id)) for (const p of geo.dead.get(u.id)!) put(p.x, p.y, p.g, 'fail');
  }
  // Foliage: one leaf per scenario on the pad above the limb's end, drafted in moss, then green or red once it runs.
  const per = new Map<string, number>();
  for (const sc of s.scenarios) {
    const pad = geo.pads.get(sc.unit); if (!pad || (grown.get(sc.unit) ?? 0) < 1) continue;
    const unit = geo.shown.find((u) => u.id === sc.unit)!;
    const i = (per.get(sc.unit) ?? -1) + 1; per.set(sc.unit, i);
    const r = s.run[sc.id]; const st = !inMode(s, sc) ? 'out' : r ? r.st : 'in';
    const tone: Style = st === 'pass' ? 'leaf' : st === 'fail' ? 'fail' : st === 'run' ? 'gold' : st === 'out' ? 'frame' : 'moss';
    const glyph = st === 'run' ? SPIN[Math.floor(elapsed / 90) % SPIN.length]! : st === 'out' ? '·' : unit.root ? (st === 'pass' ? '●' : st === 'fail' ? '✕' : '∘') : '&';
    if (unit.root) { put(pad.from - pad.dir * i, pad.y + 1, glyph, tone); continue; }
    put(pad.from + pad.dir * i, pad.y, glyph, tone);
  }
  // Numbers at the tips, matching the ledger.
  geo.shown.forEach((u, i) => {
    if ((grown.get(u.id) ?? 0) < 1) return;
    const [x, y] = geo.tips.get(u.id)!; const label = String(i + 1);
    chars(label).forEach((c, k) => put(x + k - (x < TRUNK_X ? label.length - 1 : 0), y, c, busy.has(u.id) || s.focus === u.id ? 'gold' : 'b'));
  });
  // A tracer is a gold diamond running out along the limb it is reading.
  for (const id of busy) {
    const cells = geo.limbs.get(id); if (!cells || (grown.get(id) ?? 0) < 1) continue;
    const f = 0.15 + 0.85 * ((elapsed / 1500 + Number(id.slice(1)) * 0.27) % 1);
    const p = cells[Math.min(cells.length - 1, Math.round(f * (cells.length - 1)))]!; put(p.x, p.y, '◆', 'gold');
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
  const right: Line = [['', ' '], ['root', s.modeBy || view.picking ? modeLabel : 'choosing'], ['dim', ` ${fmt(view.clock ?? view.elapsed)}`], ['', ' ']];
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
  ledger.push([['frame', '┈'.repeat(RW)]]);
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
  for (const [id, why] of Object.entries(s.unbuilt)) notes.push([['fail', '✕ not found     '], ['', `${id}: ${cut(s.criteria.find((x) => x.id === id)?.text ?? '', 54)}`], ['dim', `  ${cut(why, 40)}`]]);
  const stopSeen = new Set<string>();
  for (const x of s.stops) if (!stopSeen.has(x.unit) && stopSeen.add(x.unit)) notes.push([['fail', '╌ stopped       '], ['', pad(s.units.find((u) => u.id === x.unit)?.label ?? x.unit, 18)], ['dim', ` ${x.why}`]]);
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
    const room = view.height ? Math.max(3, view.height - L.length - 8) : list.length * 2;
    const TITLE = Math.max(20, IN - 51);
    L.push(one([]));
    L.push(one([['dim', `     ${'kind'.padEnd(8)}${'scenario'.padEnd(TITLE + 1)}${'spec'.padEnd(9)}${'mock'.padEnd(13)}real`]]));
    let shown = 0, drawn = 0, lastUnit: string | null = null;
    for (const x of list) {
      if (shown >= room) break;
      if (x.unit !== lastUnit) { const u = s.units.find((y) => y.id === x.unit); lastUnit = x.unit; if (u) { L.push(one([['b', String(s.units.indexOf(u) + 1).padStart(2)], ['', ` ${u.label}`], ['dim', `  ${u.unitKind} · ${u.loc}`]])); shown++; } }
      shown++; drawn++;
      const r = s.run[x.id]; const v = s.real[x.id];
      const mk: Seg = !r ? ['dim', '○'] : r.st === 'run' ? ['root', sp] : r.st === 'pass' ? ['leaf', '✓'] : r.st === 'fail' ? ['fail', '✕'] : ['dim', '–'];
      const mock: Seg = !r ? ['dim', '·'] : r.st === 'run' ? ['root', 'running'] : r.st === 'pass' ? ['leaf', secs(r.ms)] : r.st === 'fail' ? ['fail', 'failed'] : ['dim', x.flow ? 'not run' : 'no flow yet'];
      const real: Seg = !x.variants.length ? ['', ''] : x.mockOnly ? ['dim', 'mock only'] : !v ? ['dim', 'after mock'] : v.st === 'pass' ? ['leaf', `✓ ${secs(v.ms)} sandbox`] : ['root', v.na ? 'mock only' : 'skipped: no key'];
      const agentMade = x.ext.some((e) => s.ext[e] && s.ext[e]!.state !== 'proven');
      L.push(one([['', '   '], mk, ['dim', ` ${x.scenarioKind.padEnd(7)} `], ['', pad(x.title, TITLE - 2)], agentMade ? ['dim', ' ✎'] : ['', '  '], ['dim', ` ${pad(x.criteria.join(' '), 8)} `], ...fit([mock], 12), ['', ' '], real]));
      if (r?.st === 'fail' && r.why) L.push(one([['fail', `    ${r.why}`]]));
    }
    if (drawn < list.length) L.push(one([['dim', `  +${list.length - drawn} more scenarios in the log`]]));
  }
  // The result.
  if (s.blocked) { L.push(one([])); L.push(one([['fail', `✕ ${s.blocked.code}`], ['', ` ${s.blocked.detail}`]])); L.push(one([['dim', `  fix: ${s.blocked.action}`]])); }
  if (s.done) {
    const t = growSummary(s);
    L.push(one([]));
    L.push(one([['b', `${t.passed}/${t.scenarios} proved`], ['', '  '], [t.failed ? 'fail' : 'dim', `${t.failed} failed`], ['dim', `  ${t.notRun} not run`],
      ...(t.criteria ? [['dim', '  · spec '] as Seg, ['leaf', `${t.proved} proved`] as Seg, ['', ' '] as Seg, ['root', `${t.agentChecked} agent-checked`] as Seg, ['dim', ` ${t.notProven} not proven yet `] as Seg, [t.needYou ? 'fail' : 'dim', `${t.needYou} need you`] as Seg] : []),
      ...(t.toReview ? [['dim', '  · '] as Seg, ['root', `${t.toReview} to review`] as Seg] : [])]));
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
