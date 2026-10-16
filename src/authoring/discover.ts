/**
 * Discovery: find HTTP routes in a folder (or at a git branch) and match them against flows.
 * Heuristic static scan for FastAPI, Django and Express-style routers; it proposes what to test
 * and drafts flow skeletons. It is not evidence and never runs the app.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Blocked } from '../core/errors.ts';

export type Route = { method: string; path: string; file: string; line: number; framework: 'fastapi' | 'django' | 'express' };
export type FlowRef = { caseId: string; method: string; path: string };
export type CoveredRoute = Route & { coveredBy: string[]; changed: boolean };
export type GitInfo = { isRepo: boolean; current: string | null; base: string | null; branches: string[] };
export type Discovery = { source: string; branch: string | null; base: string | null; files: number; changedFiles: string[]; routes: CoveredRoute[]; uncovered: number };

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.tracegrove', 'dist', 'build', '.next', 'coverage', 'migrations']);
const EXT = /\.(py|js|mjs|cjs|ts|mts|jsx|tsx)$/;
const MAX_FILES = 5000;
const MAX_BYTES = 512 * 1024;

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function safeRef(name: string): string {
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
  const files = git(dir, ['ls-tree', '-r', '--name-only', branch]).split('\n')
    .filter((f) => f && EXT.test(f) && !f.split('/').some((part) => SKIP.has(part))).slice(0, MAX_FILES);
  return { files, read: (file) => git(dir, ['show', `${branch}:${file}`]) };
}

function normalizePath(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.replace(/<(?:\w+:)?(\w+)>/g, '{$1}').replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}').replace(/\/+$/, '') || '/';
}

export function scanSource(file: string, text: string): Route[] {
  const routes: Route[] = [];
  const lineOf = (index: number) => text.slice(0, index).split('\n').length;
  if (file.endsWith('.py')) {
    for (const m of text.matchAll(/@\w+\.(get|post|put|patch|delete|head)\(\s*[rf]?["']([^"']*)["']/g)) routes.push({ method: m[1]!.toUpperCase(), path: normalizePath(m[2]!), file, line: lineOf(m.index), framework: 'fastapi' });
    for (const m of text.matchAll(/\bpath\(\s*["']([^"']*)["']/g)) routes.push({ method: 'ANY', path: normalizePath(m[1]!), file, line: lineOf(m.index), framework: 'django' });
  } else {
    for (const m of text.matchAll(/\b(?:app|router|server|fastify|api|routes)\.(get|post|put|patch|delete|head)\(\s*["'`]([^"'`]+)["'`]/g)) routes.push({ method: m[1]!.toUpperCase(), path: normalizePath(m[2]!), file, line: lineOf(m.index), framework: 'express' });
  }
  return routes.filter((r) => !r.path.includes('${'));
}

const shape = (path: string) => normalizePath(path).replace(/\{[^}]*\}/g, '{}');

export function discover(dir: string, flows: FlowRef[], branch: string | null): Discovery {
  const info = gitInfo(dir);
  const ref = branch ? safeRef(branch) : null;
  if (ref && !info.isRepo) throw new Blocked([{ code: 'not_a_git_repo', detail: dir, owner: 'operator', action: 'drop --branch, or point at a git checkout' }]);
  const source = ref ? atBranch(dir, ref) : workingTree(dir);
  let changedFiles: string[] = [];
  if (ref && info.base && info.base !== ref) {
    try { changedFiles = git(dir, ['diff', '--name-only', `${safeRef(info.base)}...${ref}`]).split('\n').filter(Boolean); } catch { changedFiles = []; }
  }
  const changed = new Set(changedFiles);
  const routes: CoveredRoute[] = [];
  const seen = new Set<string>();
  for (const file of source.files) {
    let text: string;
    try { text = source.read(file); } catch { continue; }
    if (!/(get|post|put|patch|delete|path)\(/.test(text)) continue;
    for (const route of scanSource(file, text)) {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const coveredBy = [...new Set(flows.filter((f) => shape(f.path) === shape(route.path) && (route.method === 'ANY' || f.method === route.method)).map((f) => f.caseId))];
      routes.push({ ...route, coveredBy, changed: changed.has(route.file) });
    }
  }
  routes.sort((a, b) => Number(b.changed) - Number(a.changed) || a.coveredBy.length - b.coveredBy.length || a.path.localeCompare(b.path));
  return { source: ref ? `branch ${ref}` : 'working tree', branch: ref, base: info.base, files: source.files.length, changedFiles, routes, uncovered: routes.filter((r) => r.coveredBy.length === 0).length };
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
