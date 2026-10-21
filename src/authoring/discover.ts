/**
 * Discovery: find HTTP routes in a folder (or at a git branch) and match them against flows.
 * Two sources, each labeled: a static scan of source text (FastAPI, Django, Express-style routers,
 * plain node:http dispatch), which is a hint, and the requests the app actually served in the last
 * verified run, which is evidence. Where the scan can see routing it cannot read, it says so as an
 * ambiguity a person or a coding agent can resolve.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { globToRegExp } from './sources.ts';
import { matchesTemplate, type ObservedRequest } from './traffic.ts';

export type Route = { method: string; path: string; file: string; line: number; framework: 'fastapi' | 'django' | 'express' | 'node' };
export type FlowRef = { caseId: string; method: string; path: string };
/** static: read from source text (a hint). traffic: only seen in requests the app served (evidence, no source location). */
export type RouteProvenance = 'static' | 'traffic' | 'catalog';
export type CoveredRoute = Omit<Route, 'framework' | 'file' | 'line'> & {
  framework: Route['framework'] | 'observed'; file: string | null; line: number | null; provenance: RouteProvenance;
  /** flows whose steps declare this route */
  coveredBy: string[];
  /** scenarios whose requests reached this route in the last verified run */
  observedBy: string[];
  /** reusable actions that exercise this route */
  actions: string[];
  /** an earlier verified run recorded in the catalog, when no recent run reached the route */
  confirmedEarlier: { run: string; cases: string[] } | null;
  changed: boolean;
};
/** What earlier discovery and agents left behind: the committed catalog and the action library. */
export type Knowledge = {
  catalog: import('./schema.ts').Catalog | null;
  actions: Array<{ id: string; title: string; file: string; routes: string[]; sources: string[]; inputs: string[]; outputs: string[]; usedBy: string[] }>;
};
export type Ambiguity = {
  id: string;
  kind: 'unreadable_routing' | 'unlisted_traffic';
  file: string | null; line: number | null;
  /** what tracegrove saw, in a sentence */
  detail: string;
  /** the question a coding agent is asked to answer, with evidence tracegrove can then check */
  ask: string;
};
export type ObservedRun = { run: string; stale: boolean; cases: Array<{ caseId: string; requests: ObservedRequest[] }> };
export type GitInfo = { isRepo: boolean; current: string | null; base: string | null; branches: string[] };
export type Discovery = {
  source: string; branch: string | null; base: string | null; files: number; changedFiles: string[];
  routes: CoveredRoute[];
  /** routes with neither a declaring flow nor an observed request */
  uncovered: number;
  /** the verified run the observed coverage comes from, if any */
  observed: { run: string; stale: boolean; requests: number } | null;
  ambiguities: Ambiguity[];
  /** the reusable action library, with the routes each one exercises */
  actions: Knowledge['actions'];
};

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.tracegrove', 'dist', 'build', '.next', 'coverage', 'migrations']);
const EXT = /\.(py|js|mjs|cjs|ts|mts|jsx|tsx)$/;
const MAX_FILES = 5000;
const MAX_BYTES = 512 * 1024;

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

export function safeRef(name: string): string {
  if (!/^[A-Za-z0-9._\/-]+$/.test(name) || name.startsWith('-') || name.includes('..')) throw new Blocked([{ code: 'invalid_branch', detail: name, owner: 'operator', action: 'pick a branch from the list' }]);
  return name;
}

export function gitInfo(dir: string): GitInfo {
  try {
    if (git(dir, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') throw new Error('not a repo');
  } catch { return { isRepo: false, current: null, base: null, branches: [] }; }
  const branches = git(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']).split('\n').map((b) => b.trim()).filter((b) => b && !b.endsWith('/HEAD'));
  let current: string | null = null;
  try { current = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { /* unborn */ }
  let base: string | null = null;
  try { base = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim(); } catch { /* no remote head */ }
  base ??= ['main', 'master', 'origin/main', 'origin/master'].find((b) => branches.includes(b)) ?? null;
  return { isRepo: true, current, base, branches };
}

type Source = { files: string[]; read: (file: string) => string };

function workingTree(dir: string): Source {
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!SKIP.has(entry.name)) walk(path); }
      else if (entry.isFile() && EXT.test(entry.name) && statSync(join(dir, path)).size <= MAX_BYTES) files.push(path);
    }
  };
  walk('');
  return { files, read: (file) => readFileSync(join(dir, file), 'utf8') };
}

function atBranch(dir: string, branch: string): Source {
  // ls-tree lists paths relative to dir; `rev:./path` reads them relative to dir too.
  const files = git(dir, ['ls-tree', '-r', '--name-only', branch]).split('\n')
    .filter((f) => f && EXT.test(f) && !f.split('/').some((part) => SKIP.has(part))).slice(0, MAX_FILES);
  return { files, read: (file) => git(dir, ['show', `${branch}:./${file}`]) };
}

function normalizePath(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.replace(/<(?:\w+:)?(\w+)>/g, '{$1}').replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}').replace(/\/+$/, '') || '/';
}

/** Blank out comments (keeping offsets and newlines) so prose about routes is not read as routes. */
export function maskComments(file: string, text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  if (file.endsWith('.py')) return text.replace(/(^|[ \t])#[^\n]*/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
  return text.replace(/\/\*[\s\S]*?\*\/|(^|[ \t;{}(),])\/\/[^\n]*/gm, (m, lead: string | undefined) => (lead ?? '') + blank(m.slice((lead ?? '').length)));
}

export function scanSource(file: string, source: string): Route[] {
  const text = maskComments(file, source);
  const routes: Route[] = [];
  const lineOf = (index: number) => text.slice(0, index).split('\n').length;
  if (file.endsWith('.py')) {
    for (const m of text.matchAll(/@\w+\.(get|post|put|patch|delete|head)\(\s*[rf]?["']([^"']*)["']/g)) routes.push({ method: m[1]!.toUpperCase(), path: normalizePath(m[2]!), file, line: lineOf(m.index), framework: 'fastapi' });
    for (const m of text.matchAll(/\bpath\(\s*["']([^"']*)["']/g)) routes.push({ method: 'ANY', path: normalizePath(m[1]!), file, line: lineOf(m.index), framework: 'django' });
  } else {
    for (const m of text.matchAll(/\b(?:app|router|server|fastify|api|routes)\.(get|post|put|patch|delete|head)\(\s*["'`]([^"'`]+)["'`]/g)) routes.push({ method: m[1]!.toUpperCase(), path: normalizePath(m[2]!), file, line: lineOf(m.index), framework: 'express' });
    // Plain node:http dispatch: `req.method === 'GET' && url.pathname === '/x'`, in either order.
    // A prefix match (`pathname.startsWith('/runs/')`) is read as one parameterized route.
    for (const m of text.matchAll(/\bpathname\s*(?:===\s*|\.startsWith\(\s*)["'`](\/[^"'`$]*)["'`]/g)) {
      const start = text.lastIndexOf('\n', m.index) + 1;
      const end = text.indexOf('\n', m.index);
      const method = /\bmethod\s*===\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`]/.exec(text.slice(start, end < 0 ? undefined : end));
      const prefix = m[0].includes('startsWith');
      const path = prefix ? `${m[1]!.replace(/\/?$/, '/')}{id}` : m[1]!;
      routes.push({ method: method?.[1] ?? 'ANY', path: normalizePath(path), file, line: lineOf(m.index), framework: 'node' });
    }
  }
  return routes.filter((r) => !r.path.includes('${'));
}

/**
 * Routing the static scan sees but cannot read. Each one is reported, never silently skipped, so
 * Discover's counts say what they leave out.
 */
const BLIND_SPOTS: Array<{ test: RegExp; what: string; py?: boolean }> = [
  { test: /\b\w+\.use\(\s*["'`]\/[^"'`]*["'`]\s*,/, what: 'a router mounted under a path prefix' },
  { test: /\.route\(\s*["'`]/, what: 'chained .route() handlers' },
  { test: /\bexpress\.Router\(|\bRouter\(\)/, what: 'a separately declared router' },
  { test: /@(?:Controller|Get|Post|Put|Patch|Delete)\(/, what: 'decorator routes (NestJS style)' },
  { test: /\bpathname\.match\(|switch\s*\(\s*\w+\.pathname\s*\)|\.exec\(\s*\w+\.pathname\s*\)/, what: 'pattern-matched node:http paths' },
  { test: /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/, what: 'file-based route handlers (Next.js style)' },
  { test: /APIRouter\([^)]*prefix\s*=/, what: 'an APIRouter with a prefix', py: true },
  { test: /\binclude_router\(|\binclude\(\s*["']/, what: 'included routers or URL modules', py: true },
  { test: /@\w+\.(?:route|api_route|websocket)\(/, what: '.route()/api_route decorators', py: true },
  { test: /\bre_path\(|\.register\(\s*r?["']/, what: 'regex URL patterns or DRF routers', py: true },
];

export function blindSpots(file: string, source: string): Array<{ line: number; what: string }> {
  const text = maskComments(file, source);
  const py = file.endsWith('.py');
  const found: Array<{ line: number; what: string }> = [];
  for (const spot of BLIND_SPOTS) {
    if (Boolean(spot.py) !== py) continue;
    const m = spot.test.exec(text);
    if (m) found.push({ line: text.slice(0, m.index).split('\n').length, what: spot.what });
  }
  return found;
}

/** Collapse id-like segments of an observed path so repeated requests group as one route. */
export function templateOfObserved(path: string): string {
  return normalizePath(path).split('/').map((seg) =>
    /^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) || /^[0-9a-f]{12,}$/i.test(seg) || (/^[A-Za-z0-9_-]{16,}$/.test(seg) && /\d/.test(seg)) ? '{id}' : seg).join('/') || '/';
}

const shape = (path: string) => normalizePath(path).replace(/\{[^}]*\}/g, '{}');

export function discover(dir: string, flows: FlowRef[], branch: string | null, globs?: string[], observed?: ObservedRun | null, knowledge?: Knowledge): Discovery {
  const info = gitInfo(dir);
  const ref = branch ? safeRef(branch) : null;
  if (ref && !info.isRepo) throw new Blocked([{ code: 'not_a_git_repo', detail: dir, owner: 'operator', action: 'drop --branch, or point at a git checkout' }]);
  const source = ref ? atBranch(dir, ref) : workingTree(dir);
  let changedFiles: string[] = [];
  if (ref && info.base && info.base !== ref) {
    try { changedFiles = git(dir, ['diff', '--name-only', '--relative', `${safeRef(info.base)}...${ref}`]).split('\n').filter(Boolean); } catch { changedFiles = []; }
  }
  const changed = new Set(changedFiles);
  const routes: CoveredRoute[] = [];
  const ambiguities: Ambiguity[] = [];
  const seen = new Set<string>();
  const patterns = globs?.map(globToRegExp);
  const requests = (observed?.cases ?? []).flatMap((c) => c.requests.filter((r) => r.status !== null).map((r) => ({ ...r, caseId: c.caseId })));
  const observedBy = (method: string, path: string) => [...new Set(requests.filter((r) => (method === 'ANY' || r.method === method) && matchesTemplate(path, r.path)).map((r) => r.caseId))];
  for (const file of source.files) {
    if (patterns && !patterns.some((pattern) => pattern.test(file))) continue;
    let text: string;
    try { text = source.read(file); } catch { continue; }
    if (!/(get|post|put|patch|delete|path|route|use|register|include)\(|pathname|@(?:Controller|Get|Post)|function\s+(?:GET|POST)/.test(text)) continue;
    for (const spot of blindSpots(file, text)) {
      ambiguities.push({ id: `unreadable:${file}:${spot.line}`, kind: 'unreadable_routing', file, line: spot.line,
        detail: `${file}:${spot.line} uses ${spot.what}, which the static scan cannot read.`,
        ask: `List every HTTP route ${file} defines, with its full path including any mount prefix, and write a flow that calls each one so a run can confirm it.` });
    }
    for (const route of scanSource(file, text)) {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const coveredBy = [...new Set(flows.filter((f) => shape(f.path) === shape(route.path) && (route.method === 'ANY' || f.method === route.method)).map((f) => f.caseId))];
      routes.push({ ...route, provenance: 'static', coveredBy, observedBy: observedBy(route.method, route.path), actions: [], confirmedEarlier: null, changed: changed.has(route.file) });
    }
  }
  // Requests the app served that match no scanned route: real routes the scan missed.
  const unlisted = new Map<string, { method: string; path: string; cases: Set<string> }>();
  for (const r of requests) {
    if (routes.some((route) => route.provenance === 'static' && (route.method === 'ANY' || route.method === r.method) && matchesTemplate(route.path, r.path))) continue;
    if (r.status === 404 || r.status === 405) continue; // the app itself said no such route
    const template = templateOfObserved(r.path);
    const key = `${r.method} ${template}`;
    const entry = unlisted.get(key) ?? { method: r.method, path: template, cases: new Set<string>() };
    entry.cases.add(r.caseId); unlisted.set(key, entry);
  }
  for (const u of unlisted.values()) {
    const coveredBy = [...new Set(flows.filter((f) => shape(f.path) === shape(u.path) && f.method === u.method).map((f) => f.caseId))];
    routes.push({ method: u.method, path: u.path, file: null, line: null, framework: 'observed', provenance: 'traffic', coveredBy, observedBy: [...u.cases], actions: [], confirmedEarlier: null, changed: false });
    // A flow that names the route, plus the app serving it, leaves nothing to decide; only its source location is unknown.
    if (coveredBy.length === 0 && !knows(knowledge, u.method, u.path)) ambiguities.push({ id: `unlisted:${u.method} ${u.path}`, kind: 'unlisted_traffic', file: null, line: null,
      detail: `The app served ${u.method} ${u.path} during ${[...u.cases].join(', ')}, but the static scan found no such route.`,
      ask: `Find the handler that serves ${u.method} ${u.path}, and say which file defines it and what the path's parameters are.` });
  }
  const resolved = applyKnowledge(routes, ambiguities, knowledge, flows);
  const tested = (r: CoveredRoute) => r.coveredBy.length + r.observedBy.length;
  routes.sort((a, b) => Number(b.changed) - Number(a.changed) || Number(tested(a) > 0) - Number(tested(b) > 0) || a.path.localeCompare(b.path));
  return { source: ref ? `branch ${ref}` : 'working tree', branch: ref, base: info.base, files: source.files.length, changedFiles, routes,
    uncovered: routes.filter((r) => tested(r) === 0).length,
    observed: observed ? { run: observed.run, stale: observed.stale, requests: requests.length } : null,
    ambiguities: resolved.slice(0, 50), actions: knowledge?.actions ?? [] };
}

const splitRoute = (route: string) => { const at = route.indexOf(' '); return { method: route.slice(0, at), path: route.slice(at + 1) }; };
const sameRoute = (a: { method: string; path: string }, b: { method: string; path: string }) =>
  (a.method === b.method || a.method === 'ANY' || b.method === 'ANY') && (shape(a.path) === shape(b.path) || matchesTemplate(a.path, b.path) || matchesTemplate(b.path, a.path));

/** A route the catalog or an action already accounts for is known, not a question. */
function knows(knowledge: Knowledge | undefined, method: string, path: string): boolean {
  if (!knowledge) return false;
  return knowledge.actions.some((a) => a.routes.some((r) => sameRoute(splitRoute(r), { method, path })))
    || (knowledge.catalog?.routes ?? []).some((r) => r.file !== null && sameRoute(splitRoute(r.route), { method, path }));
}

/**
 * Fold in what earlier discovery learned: catalog routes the scan cannot see come back with their
 * handler file, routes gain the actions that exercise them, and a file whose routing the scan cannot
 * read stops being a question once a confirmed route is known to live there.
 */
function applyKnowledge(routes: CoveredRoute[], ambiguities: Ambiguity[], knowledge: Knowledge | undefined, flows: FlowRef[]): Ambiguity[] {
  if (!knowledge) return ambiguities;
  for (const entry of knowledge.catalog?.routes ?? []) {
    const { method, path } = splitRoute(entry.route);
    const existing = routes.find((r) => sameRoute(r, { method, path }));
    if (existing) {
      if (existing.file === null && entry.file) { existing.file = entry.file; existing.line = entry.line; }
      if (existing.observedBy.length === 0 && entry.confirmed) existing.confirmedEarlier = { run: entry.confirmed.run, cases: entry.confirmed.cases };
      continue;
    }
    const coveredBy = [...new Set(flows.filter((f) => sameRoute({ method: f.method, path: f.path }, { method, path })).map((f) => f.caseId))];
    routes.push({ method, path, file: entry.file, line: entry.line, framework: 'observed', provenance: 'catalog', coveredBy, observedBy: [], actions: [],
      confirmedEarlier: entry.confirmed ? { run: entry.confirmed.run, cases: entry.confirmed.cases } : null, changed: false });
  }
  for (const route of routes) {
    route.actions = knowledge.actions.filter((a) => a.routes.some((r) => sameRoute(splitRoute(r), route))).map((a) => a.id);
    // An action that names its handler file, plus traffic confirming the route, says where the route lives.
    if (route.file === null && route.observedBy.length) {
      const source = knowledge.actions.find((a) => route.actions.includes(a.id) && a.sources.length)?.sources[0];
      if (source) route.file = source;
    }
  }
  const confirmedFiles = new Set(routes.filter((r) => r.file && r.provenance !== 'static' && (r.observedBy.length || r.confirmedEarlier)).map((r) => r.file!));
  return ambiguities.filter((a) => !(a.kind === 'unreadable_routing' && a.file && confirmedFiles.has(a.file)));
}

/** A starting flow for one route; placeholders the author must fill are marked TODO. */
export function draftFlow(route: { method: string; path: string }): { file: string; yaml: string } {
  const method = route.method === 'ANY' ? 'GET' : route.method;
  const params = [...route.path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]!);
  const segments = route.path.split('/').filter((s) => s && !s.startsWith('{'));
  const area = (segments[0] ?? 'root').replace(/[^A-Za-z0-9-]/g, '-').toLowerCase();
  const behavior = `${method.toLowerCase()}-${segments.slice(1).join('-') || (params.length ? 'by-id' : 'collection')}`.replace(/[^A-Za-z0-9-]/g, '-').toLowerCase();
  const lines = [`title: ${method} ${route.path} behaves as intended  # TODO: say what should be true`, 'tags: [discovered]', 'steps:'];
  if (params.length) {
    lines.push('  # TODO: create the resource first and save its id, e.g.', `  # - name: create`, `  #   POST: /${segments[0] ?? ''}`, '  #   json: { }', '  #   expect: 201', `  #   save: { ${params[0]}: id }`);
  }
  lines.push(`  - name: ${method.toLowerCase()} ${route.path}`, `    ${method}: ${route.path}`);
  if (['POST', 'PUT', 'PATCH'].includes(method)) lines.push('    json: { }  # TODO: request body');
  lines.push(`    expect: ${method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200}`);
  if (method !== 'DELETE') lines.push('  - name: stranger is denied  # TODO: keep if the route is per-user', `    ${method === 'POST' ? 'GET' : method}: ${route.path}`, '    as: none', '    expect: 401');
  return { file: `${area}/${behavior}.flow.yaml`, yaml: `${lines.join('\n')}\n` };
}

export function hasConfig(dir: string): boolean {
  return existsSync(join(dir, 'tracegrove.config.yaml'));
}
