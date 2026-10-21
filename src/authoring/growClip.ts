/**
 * The shareable clip of `tracegrove grow`: the change's tree growing from a seed, buds for every
 * drafted scenario, and leaves that turn green only where a real flow run passed (red and falling
 * where one failed, pale where nothing ran). Built from the saved event stream, so the clip shows
 * exactly what happened, on a fixed ~10 s storyboard sized for a 9:16 vertical video.
 *
 * `clipTimeline` lays the tree out and schedules every part. `FRAME_JS` draws one frame as SVG at any
 * time point; it is plain JavaScript in a string so the same code runs in Node (SVG still, MP4 frames)
 * and in the self-contained HTML player.
 */
import { applyGrow, freshGrow, inMode, type GrowEvent, type GrowState, type Layer } from './growState.ts';

export const CLIP_VERSION = 'tracegrove.grow-clip/v1';
export const CLIP_W = 1080;
export const CLIP_H = 1920;
export type LeafEnd = 'pass' | 'fail' | 'pale';
export type ClipBranch = { id: string; label: string; layer: Layer; root: boolean; d: string; tip: [number, number]; at: number; dur: number; labelAt: [number, number]; anchor: 'start' | 'end' | 'middle'; width: number; pad: [number, number] | null };
export type ClipPad = { x: number; y: number; rx: number; ry: number; at: number };
export type ClipLeaf = { id: string; title: string; x: number; y: number; rot: number; budAt: number; endAt: number; end: LeafEnd };
export type ClipTimeline = {
  v: typeof CLIP_VERSION; w: number; h: number; duration: number; ground: number;
  title: string; branch: string; meta: string; trunk: string; trunkAt: number; trunkDur: number;
  branches: ClipBranch[]; pads: ClipPad[]; leaves: ClipLeaf[]; summaryAt: number;
  totals: { scenarios: number; proved: number; failed: number; pale: number };
};

const MAX_BRANCHES = 14;
const T = { sprout: 250, trunk: 1000, branchesFrom: 1050, branchesSpan: 1700, branchDur: 700, budsFrom: 2900, budsSpan: 1500, endsFrom: 4700, endsSpan: 2500, summary: 7500, duration: 10500 };

/** A stable 0..1 number per string, so the same change always grows the same tree. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export function foldEvents(events: GrowEvent[]): GrowState {
  const s = freshGrow();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) applyGrow(s, e);
  return s;
}

/** Parse a saved `.tracegrove/discovery/<branch>.jsonl` log, skipping blank lines and anything that is not a discovery event. */
export function parseEventLog(text: string): GrowEvent[] {
  const events: GrowEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    if (value && typeof value === 'object' && (value as { v?: unknown }).v === 'tracegrove.discovery-event/v1') events.push(value as GrowEvent);
  }
  return events;
}

export function clipTimeline(events: GrowEvent[]): ClipTimeline {
  const s = foldEvents(events);
  const W = CLIP_W, H = CLIP_H, G = 1360, cx = W / 2;
  const change = s.change;
  const branchName = change?.branch ?? 'change';
  const inRun = s.scenarios.filter((x) => inMode(s, x));
  const limbs = s.units.filter((u) => !u.root).slice(0, MAX_BRANCHES);
  const roots = s.units.filter((u) => u.root).slice(0, 6);
  // An S-curved trunk; limbs leave it at points along the same curve.
  const P = [[cx, G], [cx - 80, G - 190], [cx + 110, G - 400], [cx + 20, 700]] as const;
  const at = (u: number): [number, number] => {
    const m = 1 - u;
    const f = (i: 0 | 1) => m * m * m * P[0][i] + 3 * m * m * u * P[1][i] + 3 * m * u * u * P[2][i] + u * u * u * P[3][i];
    return [f(0), f(1)];
  };
  const trunk = `M${P[0].join(',')} C${P[1].join(',')} ${P[2].join(',')} ${P[3].join(',')}`;
  const leafCount = new Map<string, number>();
  for (const x of inRun) leafCount.set(x.unit, (leafCount.get(x.unit) ?? 0) + 1);
  const labelX = (x: number, text: string) => { const half = (Math.min(text.length, 22) * 16.3) / 2 + 8; return r1(Math.min(W - half, Math.max(half, x))); };
  const branches: ClipBranch[] = [];
  const tipOf = new Map<string, { x: number; y: number; rx: number; ry: number }>();

  // Lower limbs reach wide and nearly level, upper ones shorter and steeper: a shaped bonsai.
  limbs.forEach((u, i) => {
    const n = limbs.length;
    const k = n === 1 ? 0.6 : i / (n - 1);
    const crown = i === n - 1 && n % 2 === 1 && n > 2;
    const side = i % 2 === 0 ? -1 : 1;
    const [sx, sy] = at(crown ? 0.97 : 0.3 + k * 0.62);
    const reach = (430 - 230 * k) * (0.88 + hash(`${u.id}r`) * 0.24);
    const leaves = leafCount.get(u.id) ?? 0;
    const rx = leaves ? 62 + Math.sqrt(leaves) * 30 : 0;
    const ry = leaves ? rx * 0.56 : 0;
    const edge = Math.max(110, rx + 24);
    const tx = crown ? sx + (hash(u.id) - 0.5) * 80 : Math.min(W - edge, Math.max(edge, sx + side * reach));
    const ty = crown ? 470 : sy - 70 - 150 * k - hash(`${u.id}l`) * 50;
    const d = crown
      ? `M${r1(sx)},${r1(sy)} C${r1(sx)},${r1(sy - 100)} ${r1(tx)},${r1(ty + 120)} ${r1(tx)},${r1(ty)}`
      : `M${r1(sx)},${r1(sy)} C${r1(sx + side * reach * 0.4)},${r1(sy + 26)} ${r1(sx + side * reach * 0.8)},${r1(ty + 50)} ${r1(tx)},${r1(ty)}`;
    const t0 = T.branchesFrom + (n > 1 ? (i / (n - 1)) * T.branchesSpan : 0);
    const label = u.label.length > 22 ? `${u.label.slice(0, 21)}…` : u.label;
    branches.push({ id: u.id, label, layer: u.layer, root: false, d, tip: [r1(tx), r1(ty)], at: t0, dur: T.branchDur,
      labelAt: [labelX(tx, label), r1(ty - (ry || 20) - 16)], anchor: 'middle', width: r1(19 - 9 * k), pad: leaves ? [r1(rx), r1(ry)] : null });
    tipOf.set(u.id, { x: tx, y: ty, rx, ry });
  });
  // Roots spread wide under the soil line, in gold: what the change depends on.
  roots.forEach((u, i) => {
    const n = roots.length;
    const k = n === 1 ? 0.25 : i / (n - 1);
    const tx = cx - 380 + k * 760;
    const ty = G + 120 + hash(u.id) * 70;
    const d = `M${cx},${G} C${r1(cx + (tx - cx) * 0.2)},${G + 70} ${r1(cx + (tx - cx) * 0.7)},${r1(ty - 50)} ${r1(tx)},${r1(ty)}`;
    const label = u.label.length > 22 ? `${u.label.slice(0, 21)}…` : u.label;
    branches.push({ id: u.id, label, layer: u.layer, root: true, d, tip: [r1(tx), r1(ty)], at: T.branchesFrom + 400 + i * 240, dur: T.branchDur + 200,
      labelAt: [labelX(tx, label), r1(ty + 46)], anchor: 'middle', width: 9, pad: null });
  });

  // One leaf per scenario in the chosen mode, inside its limb's pad. Scenarios on roots or on units
  // past the limb cap gather in a crown pad at the top of the trunk.
  const crownCount = inRun.filter((x) => !tipOf.has(x.unit)).length;
  const crown = { x: P[3][0], y: 560, rx: 62 + Math.sqrt(crownCount) * 30, ry: (62 + Math.sqrt(crownCount) * 30) * 0.56 };
  const perTip = new Map<string, number>();
  const runOrder = new Map<string, number>();
  let order = 0;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) if ((e.kind === 'scenario.passed' || e.kind === 'scenario.failed') && !runOrder.has(e.scenario)) runOrder.set(e.scenario, order++);
  const ranCount = Math.max(1, runOrder.size);
  const leaves: ClipLeaf[] = inRun.map((x, j) => {
    const key = tipOf.has(x.unit) ? x.unit : '__crown';
    const tip = tipOf.get(x.unit) ?? crown;
    const idx = perTip.get(key) ?? 0; perTip.set(key, idx + 1);
    const count = key === '__crown' ? crownCount : leafCount.get(x.unit) ?? 1;
    // A sunflower spiral inside the pad, so many leaves never stack on one point.
    const a = idx * 2.39996 + hash(x.id) * 0.4;
    const rad = count === 1 ? 0 : Math.sqrt((idx + 0.5) / count) * 0.78;
    const lx = Math.min(W - 30, Math.max(30, tip.x + Math.cos(a) * tip.rx * rad));
    const ly = Math.min(G - 40, tip.y + Math.sin(a) * tip.ry * rad);
    const st = s.run[x.id]?.st;
    const end: LeafEnd = st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : 'pale';
    const limb = branches.find((b) => b.id === x.unit);
    const budAt = Math.max(T.budsFrom + (inRun.length > 1 ? (j / (inRun.length - 1)) * T.budsSpan : 0), limb ? limb.at + limb.dur : 0);
    const ro = runOrder.get(x.id);
    const endAt = ro === undefined ? T.endsFrom + T.endsSpan : T.endsFrom + (ranCount > 1 ? (ro / (ranCount - 1)) * T.endsSpan : 0);
    return { id: x.id, title: x.title, x: r1(lx), y: r1(ly), rot: r1(-30 + hash(`${x.id}a`) * 60), budAt: Math.round(budAt), endAt: Math.round(Math.max(endAt, budAt + 300)), end };
  });
  const firstBud = (unit: string | null) => Math.min(...leaves.filter((l) => (unit ? inRun.find((x) => x.id === l.id)?.unit === unit : !tipOf.has(inRun.find((x) => x.id === l.id)!.unit))).map((l) => l.budAt), Infinity);
  const pads = branches.filter((b) => b.pad).map((b) => ({ x: b.tip[0], y: b.tip[1], rx: b.pad![0], ry: b.pad![1], at: firstBud(b.id) - 150 }));
  if (crownCount) pads.push({ x: r1(crown.x), y: crown.y, rx: r1(crown.rx), ry: r1(crown.ry), at: firstBud(null) - 150 });
  const proved = leaves.filter((l) => l.end === 'pass').length;
  const failed = leaves.filter((l) => l.end === 'fail').length;
  const meta = change ? `${change.files} file${change.files === 1 ? '' : 's'} · +${change.adds} −${change.dels}${change.pr ? ` · #${change.pr}` : ''}` : '';
  return {
    v: CLIP_VERSION, w: W, h: H, duration: T.duration, ground: G,
    title: change?.title ?? branchName, branch: branchName, meta, trunk, trunkAt: T.sprout, trunkDur: T.trunk,
    branches, pads: pads.filter((p) => Number.isFinite(p.at)), leaves, summaryAt: T.summary,
    totals: { scenarios: leaves.length, proved, failed, pale: leaves.length - proved - failed },
  };
}

/**
 * `frame(tl, t)` returns one SVG frame at `t` milliseconds. Dark brand palette, fixed so the clip
 * looks the same wherever it is posted. No dependencies, no DOM: Node and the browser both call it.
 */
export const FRAME_JS = String.raw`
function frame(tl, t) {
  var C = { bg:'#0c1210', bark:'#b9a888', leaf:'#a9d28a', bud:'#8fa596', root:'#d8b25e', fail:'#ef6a5a', run:'#d8b25e', fg:'#ece6d8', muted:'#9aa79f', line:'#25312c', soil:'#141c18', pad:'#1b2a20', padEdge:'#2b4030' };
  var clamp = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var ease = function (x) { x = clamp(x); return 1 - Math.pow(1 - x, 3); };
  var pop = function (x) { x = clamp(x); var s = 1.70158; x = x - 1; return x * x * ((s + 1) * x + s) + 1; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var cut = function (s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  var W = tl.w, H = tl.h, G = tl.ground, cx = W / 2, o = [];
  o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
  o.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');
  o.push('<rect y="' + G + '" width="' + W + '" height="' + (H - G) + '" fill="' + C.soil + '"/>');
  o.push('<line x1="60" x2="' + (W - 60) + '" y1="' + G + '" y2="' + G + '" stroke="' + C.line + '" stroke-width="3"/>');
  // Header: what grew.
  var hp = ease(t / 500);
  o.push('<g opacity="' + hp.toFixed(3) + '" font-family="IBM Plex Mono,ui-monospace,Menlo,monospace">');
  o.push('<text x="' + cx + '" y="190" text-anchor="middle" font-size="30" letter-spacing="5" fill="' + C.root + '">TRACEGROVE GROW</text>');
  o.push('<text x="' + cx + '" y="262" text-anchor="middle" font-size="44" font-weight="500" fill="' + C.fg + '">' + esc(cut(tl.branch, 34)) + '</text>');
  if (tl.meta) o.push('<text x="' + cx + '" y="316" text-anchor="middle" font-size="28" fill="' + C.muted + '">' + esc(tl.meta) + '</text>');
  o.push('</g>');
  // Seed, then the trunk drawing itself upward.
  var tp = ease((t - tl.trunkAt) / tl.trunkDur);
  if (tp < 1) { var sp = 1 - clamp((t - tl.trunkAt) / 400); o.push('<ellipse cx="' + cx + '" cy="' + (G - 8) + '" rx="' + (22 * (0.6 + 0.4 * sp)).toFixed(1) + '" ry="14" fill="' + C.root + '" opacity="' + (0.35 + 0.65 * sp).toFixed(3) + '"/>'); }
  var stroke = function (d, color, width, p, dash) {
    if (p <= 0) return '';
    return '<path d="' + d + '" pathLength="1" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-dasharray="' + (dash || '1 1') + '" stroke-dashoffset="' + (dash ? 0 : (1 - p)).toFixed(4) + '"/>';
  };
  o.push(stroke(tl.trunk, C.bark, 36, tp));
  // Roots under the soil, limbs above.
  for (var i = 0; i < tl.branches.length; i++) {
    var b = tl.branches[i], p = ease((t - b.at) / b.dur);
    o.push(stroke(b.d, b.root ? C.root : C.bark, b.width, p));
  }
  // Foliage pads fade in behind the leaves of each limb.
  for (var q = 0; q < tl.pads.length; q++) { var pd = tl.pads[q], pp = ease((t - pd.at) / 700); if (pp <= 0) continue; o.push('<ellipse cx="' + pd.x + '" cy="' + pd.y + '" rx="' + (pd.rx * (0.5 + 0.5 * pp)).toFixed(1) + '" ry="' + (pd.ry * (0.5 + 0.5 * pp)).toFixed(1) + '" fill="' + C.pad + '" stroke="' + C.padEdge + '" stroke-width="2" opacity="' + pp.toFixed(3) + '"/>'); }
  // Leaves: a pale bud for every scenario, green only where a real run passed, red and falling where one failed.
  for (var j = 0; j < tl.leaves.length; j++) {
    var l = tl.leaves[j];
    if (t < l.budAt) continue;
    var sc = pop((t - l.budAt) / 380), x = l.x, y = l.y, fill = 'none', st = C.bud, sw = 3.5, op = 1, rot = l.rot;
    var since = t - l.endAt;
    if (l.end !== 'pale' && since > -260 && since < 0) { fill = C.run; st = C.run; }
    if (l.end === 'pass' && since >= 0) { fill = C.leaf; st = C.leaf; sc = sc * (1 + 0.28 * Math.max(0, 1 - since / 260)); }
    if (l.end === 'fail' && since >= 0) {
      fill = C.fail; st = C.fail;
      var f = clamp((since - 250) / 900);
      y = l.y + (G - 14 - l.y) * (f * f); x = l.x + Math.sin(f * 6) * 18; rot = l.rot + f * 160;
    }
    if (l.end === 'pale' && t > tl.summaryAt) op = 0.75;
    o.push('<ellipse cx="0" cy="0" rx="22" ry="12.5" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ') scale(' + sc.toFixed(3) + ')" fill="' + fill + '" stroke="' + st + '" stroke-width="' + sw + '" opacity="' + op + '"/>');
  }
  // Labels last, with a halo, so pads and leaves never hide them.
  for (var m = 0; m < tl.branches.length; m++) {
    var bl = tl.branches[m], lp = ease((t - bl.at - bl.dur * 0.6) / 400);
    if (lp > 0) o.push('<text x="' + bl.labelAt[0] + '" y="' + bl.labelAt[1] + '" text-anchor="' + bl.anchor + '" font-family="IBM Plex Mono,ui-monospace,Menlo,monospace" font-size="27" fill="' + (bl.root ? C.root : C.fg) + '" stroke="' + C.bg + '" stroke-width="7" stroke-linejoin="round" paint-order="stroke" opacity="' + (lp * 0.95).toFixed(3) + '">' + esc(cut(bl.label, 24)) + '</text>');
  }
  // Closing card: the honest count and how to grow your own.
  var cp = ease((t - tl.summaryAt) / 600);
  if (cp > 0) {
    var tot = tl.totals, y0 = H - 250 + (1 - cp) * 30;
    o.push('<g opacity="' + cp.toFixed(3) + '" font-family="IBM Plex Mono,ui-monospace,Menlo,monospace" text-anchor="middle">');
    var parts = [[tot.proved, 'proved', C.leaf], [tot.failed, 'failed', C.fail], [tot.pale, 'not run yet', C.muted]].filter(function (p) { return p[0] > 0 || p[1] === 'proved'; });
    var step = W / (parts.length + 1);
    for (var k = 0; k < parts.length; k++) {
      o.push('<text x="' + (step * (k + 1)).toFixed(0) + '" y="' + y0.toFixed(0) + '" font-size="88" font-weight="500" fill="' + parts[k][2] + '">' + parts[k][0] + '</text>');
      o.push('<text x="' + (step * (k + 1)).toFixed(0) + '" y="' + (y0 + 52).toFixed(0) + '" font-size="28" fill="' + C.muted + '">' + parts[k][1] + '</text>');
    }
    o.push('<text x="' + cx + '" y="' + (H - 90) + '" font-size="40" fill="' + C.fg + '">npx tracegrove grow</text>');
    o.push('</g>');
  }
  o.push('</svg>');
  return o.join('');
}`;

type FrameFn = (tl: ClipTimeline, t: number) => string;
let frameFn: FrameFn | null = null;
/** The same frame function the player runs, evaluated once in Node. */
export function clipFrame(tl: ClipTimeline, t: number): string {
  frameFn ??= new Function(`${FRAME_JS}\nreturn frame;`)() as FrameFn;
  return frameFn(tl, t);
}

/** A self-contained page that plays the clip on a loop: open it, screen-record it, or post the MP4. */
export function clipPlayerHtml(tl: ClipTimeline): string {
  const data = JSON.stringify(tl).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${tl.branch.replace(/[<>&"]/g, '')} · tracegrove grow</title>
<style>html,body{margin:0;height:100%;background:#0c1210;color:#9aa79f;font:14px/1.4 ui-monospace,Menlo,monospace}
main{height:100%;display:grid;place-items:center;gap:10px;grid-template-rows:1fr auto;padding:12px;box-sizing:border-box}
#stage{height:100%;max-height:calc(100vh - 64px);aspect-ratio:9/16;max-width:100%}#stage svg{width:100%;height:100%;display:block}
button{font:inherit;color:#ece6d8;background:none;border:1px solid #25312c;border-radius:999px;padding:6px 14px;cursor:pointer}button:focus-visible{outline:2px solid #d8b25e}</style></head>
<body><main><div id="stage" role="img" aria-label="The change ${tl.branch.replace(/[<>&"]/g, '')} growing as a bonsai: ${tl.totals.proved} of ${tl.totals.scenarios} scenarios proved"></div>
<div><button id="replay" type="button">Replay</button> <span id="clock">0.0 s</span></div></main>
<script>${FRAME_JS}
var tl=${data},stage=document.getElementById('stage'),clock=document.getElementById('clock'),t0=null,hold=1500;
var still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(ts){if(t0===null)t0=ts;var t=ts-t0;if(t>tl.duration+hold){t0=ts;t=0}var at=Math.min(t,tl.duration);stage.innerHTML=frame(tl,at);clock.textContent=(at/1000).toFixed(1)+' s';requestAnimationFrame(tick)}
document.getElementById('replay').onclick=function(){t0=null;if(still)stage.innerHTML=frame(tl,tl.duration)};
if(still){stage.innerHTML=frame(tl,tl.duration)}else requestAnimationFrame(tick);
</script></body></html>
`;
}
