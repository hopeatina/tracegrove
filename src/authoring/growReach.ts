/**
 * What reaches what in a change, read from the branch's code: a screen or job that requests a route,
 * a route or command whose handler calls into a changed module, a part whose lines call a third party
 * or name a table. Every edge carries the line that proves it, so the journeys built on it can be checked.
 */
import { dirname, join, normalize } from 'node:path';
import { maskComments } from './discover.ts';
import { git, readAt, routesOf, type ChangeUnit } from './growChange.ts';
import type { Surface } from './growState.ts';

export type ReachHow = 'requests' | 'imports' | 'calls' | 'reads';
export type ReachEdge = { from: string; to: string; how: ReachHow; loc: string };

const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte|py|rb|go|html)$/;
const EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.py'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

type Import = { spec: string; names: string[]; line: number };
/** Import statements of a file: ES modules, CommonJS, dynamic import and Python. Names are the local bindings. */
export function importsOf(file: string, text: string): Import[] {
  const masked = maskComments(file, text);
  const out: Import[] = [];
  const add = (spec: string, names: string[], index: number) => out.push({ spec, names: names.map((n) => n.trim()).filter(Boolean), line: lineAt(masked, index) });
  if (file.endsWith('.py')) {
    for (const m of masked.matchAll(/^\s*from\s+([.\w]+)\s+import\s+\(?([\w\s,*]+?)\)?\s*$/gm)) add(m[1]!, m[2]!.split(',').map((x) => x.trim().split(/\s+as\s+/).pop()!), m.index);
    for (const m of masked.matchAll(/^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?\s*$/gm)) add(m[1]!, [m[2] ?? m[1]!.split('.')[0]!], m.index);
    return out;
  }
  for (const m of masked.matchAll(/\bimport\s+(?:type\s+)?([\w$*{}\s,]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = m[1]!;
    const names: string[] = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) for (const part of braces[1]!.split(',')) { const local = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop(); if (local) names.push(local); }
    const star = /\*\s+as\s+([\w$]+)/.exec(clause); if (star) names.push(star[1]!);
    const def = /^\s*([\w$]+)\s*(?:,|$)/.exec(clause); if (def) names.push(def[1]!);
    add(m[2]!, names, m.index);
  }
  for (const m of masked.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) add(m[1]!, [], m.index);
  for (const m of masked.matchAll(/(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[2]!, m[1]!.replace(/[{}]/g, '').split(',').map((x) => x.split(':').pop()!), m.index);
  for (const m of masked.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1]!, ['*'], m.index);
  return out;
}

/** The file a relative import points at on the branch, trying the extensions a bundler or Node would. */
export function resolveImport(from: string, spec: string, files: ReadonlySet<string>): string | null {
  let base: string;
  if (from.endsWith('.py')) {
    if (!spec.startsWith('.')) { const p = spec.replace(/\./g, '/'); return [`${p}.py`, `${p}/__init__.py`].find((c) => files.has(c)) ?? null; }
    const dots = /^\.+/.exec(spec)![0].length;
    let dir = dirname(from); for (let i = 1; i < dots; i++) dir = dirname(dir);
    const rest = spec.slice(dots).replace(/\./g, '/');
    base = rest ? join(dir, rest) : dir;
    return [`${base}.py`, `${base}/__init__.py`].map((c) => normalize(c)).find((c) => files.has(c)) ?? null;
  }
  if (!spec.startsWith('.')) return null;
  base = normalize(join(dirname(from), spec));
  const stem = base.replace(/\.(?:[cm]?[jt]sx?)$/, '');
  const candidates = [base, ...EXTS.map((e) => stem + e), ...EXTS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => files.has(c)) ?? null;
}

/** A route's path written as a request: the literal itself, or its fixed prefix followed by a parameter. */
export function requestPattern(path: string): RegExp {
  const parts = path.split(/\{[^}]+\}|:[A-Za-z_]\w*|<[^>]+>/);
  if (parts.length === 1) return new RegExp(`['"\`]${escape(path)}(?:['"\`?#]|\\$\\{)`);
  const head = escape(parts[0]!);
  return new RegExp(`['"\`]${head}(?:\\$\\{|['"\`]\\s*\\+)`);
}

const SQL_TABLE = (name: string) => new RegExp(`\\b(?:from|into|update|join|table)\\s+["\`]?${escape(name)}\\b`, 'i');

/**
 * Every edge between the units of a change. `region` narrows a route or command to its own handler, so
 * one route in a big file does not inherit what its neighbours import.
 */
export function reachGraph(dir: string, branch: string, units: ChangeUnit[], providers: Array<{ name: string; test: RegExp }> = []): ReachEdge[] {
  let listing: string[] = [];
  try { listing = git(dir, ['ls-tree', '-r', '--name-only', branch]).split('\n').filter(Boolean); } catch { listing = []; }
  const files = new Set(listing);
  const texts = new Map<string, string | null>();
  const text = (f: string) => { if (!texts.has(f)) texts.set(f, readAt(dir, branch, f)); return texts.get(f) ?? null; };
  const routeLines = new Map<string, number[]>();
  const routesIn = (f: string) => {
    if (!routeLines.has(f)) { const t = text(f); routeLines.set(f, t && /\.(py|[cm]?[jt]sx?)$/.test(f) ? routesOf(f, t).map((r) => r.line).sort((a, b) => a - b) : []); }
    return routeLines.get(f)!;
  };
  /** The lines that belong to a unit: a route's handler up to the next route, a command's case, otherwise the whole file. */
  const region = (u: ChangeUnit): { text: string; from: number } => {
    const t = text(u.file) ?? '';
    const lines = maskComments(u.file, t).split('\n');
    if (u.kind === 'route') { const next = routesIn(u.file).find((l) => l > u.line) ?? u.line + 80; return { text: lines.slice(u.line - 1, next - 1).join('\n'), from: u.line }; }
    if (u.kind === 'command') {
      let end = u.line + 80;
      for (let i = u.line; i < Math.min(lines.length, u.line + 400); i++) if (/^\s*case\s+['"]/.test(lines[i]!)) { end = i + 1; break; }
      return { text: lines.slice(u.line - 1, end - 1).join('\n'), from: u.line };
    }
    return { text: lines.join('\n'), from: 1 };
  };
  const owners = new Map<string, ChangeUnit>();
  for (const u of units) if (!u.root && u.kind !== 'route' && u.kind !== 'command') owners.set(u.file, u);
  const edges: ReachEdge[] = [];
  const seen = new Set<string>();
  const push = (e: ReachEdge) => { const k = `${e.from}>${e.to}`; if (e.from === e.to || seen.has(k)) return; seen.add(k); edges.push(e); };

  for (const u of units) {
    if (u.root) continue;
    const own = region(u);
    // Requests: a quoted path of another changed route.
    for (const r of units) {
      if (r === u || r.kind !== 'route' || !r.path || u.kind === 'route') continue;
      const m = requestPattern(r.path).exec(own.text);
      if (m) push({ from: u.id, to: r.id, how: 'requests', loc: `${u.file}:${own.from + lineAt(own.text, m.index) - 1}` });
    }
    // Imports, followed through unchanged files (up to three hops) to the changed modules they lead to.
    const startFiles = [u.file, ...(u.also ?? [])];
    for (const start of startFiles) {
      const t = text(start); if (t === null) continue;
      const scoped = start === u.file && (u.kind === 'route' || u.kind === 'command');
      for (const imp of importsOf(start, t)) {
        // A dynamic import counts only inside the handler; a static one when the handler uses a name it brings in.
        const inside = imp.line >= own.from && imp.line < own.from + own.text.split('\n').length;
        if (scoped && !inside && (!imp.names.length || imp.names.includes('*') || !imp.names.some((n) => new RegExp(`(?<![\\w$])${escape(n)}(?![\\w$])`).test(own.text)))) continue;
        const target = resolveImport(start, imp.spec, files); if (!target) continue;
        const loc = `${start}:${imp.line}`;
        const queue: Array<[string, number]> = [[target, 0]]; const visited = new Set<string>([start]);
        while (queue.length) {
          const [f, depth] = queue.shift()!;
          if (visited.has(f)) continue; visited.add(f);
          const hit = owners.get(f);
          if (hit) { push({ from: u.id, to: hit.id, how: 'imports', loc }); continue; }
          if (depth >= 3 || !SOURCE.test(f)) continue;
          const ft = text(f); if (ft === null) continue;
          for (const next of importsOf(f, ft)) { const g = resolveImport(f, next.spec, files); if (g && !visited.has(g)) queue.push([g, depth + 1]); }
        }
      }
    }
  }
  // An agent's prompt file: the part whose code names the file reads it.
  for (const p of units.filter((x) => x.kind === "agent's prompt" && !SOURCE.test(x.file))) {
    const name = p.file.split('/').pop()!;
    for (const u of units) {
      if (u.root || u === p) continue;
      const own = region(u); const m = new RegExp(`['"\`/]${escape(name)}['"\`]`).exec(own.text);
      if (m) push({ from: u.id, to: p.id, how: 'reads', loc: `${u.file}:${own.from + lineAt(own.text, m.index) - 1}` });
    }
  }
  // Roots: the part whose changed lines call a service, or whose code names a table or a cache.
  for (const root of units.filter((x) => x.root)) {
    if (root.parent) { push({ from: root.parent, to: root.id, how: 'calls', loc: `${root.file}:${root.line}` }); }
    for (const u of units) {
      if (u.root) continue;
      const own = region(u);
      const test = root.layer === 'data' && root.kind === 'table' ? SQL_TABLE(root.label.replace(/ table$/, ''))
        : root.layer === 'ext' ? providers.find((p) => p.name === root.label)?.test ?? null
        : root.layer === 'cache' ? /\b(?:redis|ioredis|memcached?|lru-cache)\b|\bcache\.(?:get|set|del)\(/i : null;
      const m = test ? test.exec(own.text) : null;
      if (m) push({ from: u.id, to: root.id, how: root.layer === 'ext' ? 'calls' : 'reads', loc: `${u.file}:${own.from + lineAt(own.text, m.index) - 1}` });
    }
  }
  return edges;
}

/* ---------- journeys ---------- */

export type JourneyDraft = { id: string; title: string; entry: string; units: string[]; surface: Surface; why: string; loc: string };
const ENTRY_KINDS = new Set(['route', 'command', 'page', 'component', 'job']);
export const surfaceOf = (u: Pick<ChangeUnit, 'kind' | 'layer'>): Surface => u.layer === 'ui' ? 'browser' : u.kind === 'command' || u.layer === 'cli' ? 'terminal' : u.layer === 'jobs' ? 'job' : 'http';
const SURFACE_RANK: Record<Surface, number> = { browser: 0, terminal: 1, job: 2, http: 3 };
const isEntry = (u: ChangeUnit) => !u.root && (ENTRY_KINDS.has(u.kind) || u.layer === 'ui');
/** "SeatsPanel.jsx" → "Seats panel", "uiPage.ts" → "UI page", "seat-audit.mjs" → "Seat audit". */
export function words(label: string): string {
  const w = label.replace(/\.[A-Za-z0-9]+$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase().replace(/^ui\b/, 'UI');
  return w.charAt(0).toUpperCase() + w.slice(1);
}
export function ruleTitle(u: ChangeUnit): string {
  const s = surfaceOf(u);
  return s === 'browser' ? `${words(u.label)} in the browser` : s === 'terminal' ? (u.kind === 'command' ? `\`${u.label}\` in a terminal` : `${words(u.label)} in a terminal`)
    : s === 'job' ? `${words(u.label)} job` : u.label;
}

/**
 * End-to-end journeys: one per outermost entry (a screen, command, job or route that no other changed
 * entry reaches), holding everything it reaches. A part several journeys reach is shared wood; a changed
 * part no journey reaches is loose, and is checked on its own only in max.
 */
export function journeysOf(units: ChangeUnit[], edges: ReachEdge[]): { journeys: JourneyDraft[]; loose: string[] } {
  const byId = new Map(units.map((u) => [u.id, u]));
  const out = new Map<string, ReachEdge[]>();
  for (const e of edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);
  const entries = units.filter(isEntry).sort((a, b) => SURFACE_RANK[surfaceOf(a)] - SURFACE_RANK[surfaceOf(b)]);
  const entryIds = new Set(entries.map((u) => u.id));
  const inner = new Set(edges.filter((e) => entryIds.has(e.from) && entryIds.has(e.to)).map((e) => e.to));
  const reach = (start: string) => {
    const order: string[] = [start]; const seen = new Set(order);
    for (let i = 0; i < order.length; i++) for (const e of out.get(order[i]!) ?? []) if (!seen.has(e.to)) { seen.add(e.to); order.push(e.to); }
    return order;
  };
  const journeys: JourneyDraft[] = [];
  const covered = new Set<string>();
  const add = (u: ChangeUnit) => {
    const ids = reach(u.id); ids.forEach((x) => covered.add(x));
    const first = (out.get(u.id) ?? [])[0];
    const reached = ids.length - 1;
    // a journey that reaches an agent's prompt says so: the prompt is what changed, the code on the way only reads it
    const prompt = ids.map((x) => byId.get(x)!).find((x) => x.kind === "agent's prompt");
    const agent = prompt ? ids.map((x) => byId.get(x)!).find((x) => x.kind === 'agent') : undefined;
    journeys.push({ id: `j${journeys.length + 1}`, title: ruleTitle(u), entry: u.id, units: ids, surface: surfaceOf(u),
      why: prompt ? `${u.label}${agent ? ` runs the agent in ${agent.label}, so it` : ''} touches the agent's prompt ${prompt.kind === "agent's prompt" && !SOURCE.test(prompt.file) ? prompt.file : prompt.label}` : reached ? `${u.label} ${first!.how === 'requests' ? 'requests' : first!.how === 'imports' ? 'calls into' : 'calls'} ${byId.get(first!.to)!.label}${reached > 1 ? ` and ${reached - 1} more part${reached > 2 ? 's' : ''}` : ''}` : `${u.label} is where it starts; no other changed part is reached from it`,
      loc: first?.loc ?? `${u.file}:${u.line}` });
  };
  for (const u of entries) if (!inner.has(u.id)) add(u);
  // Entries that only reach each other in a circle: the one people touch first starts the journey.
  for (const u of entries) if (!covered.has(u.id)) add(u);
  const loose = units.filter((u) => !u.root && !covered.has(u.id)).map((u) => u.id);
  return { journeys, loose };
}
