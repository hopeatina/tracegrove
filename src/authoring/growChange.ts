/**
 * What a change is made of, read from git: the files a branch changed against its base, the spec it
 * answers to, and the units the tree grows from (routes, commands, pages, jobs, modules as branches;
 * tables, caches and third-party services as roots). Everything here is read from the branch itself,
 * never from the working tree, so a discovery describes exactly what would merge.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, normalize, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { maskComments, scanSource } from './discover.ts';
import type { Layer } from './growState.ts';

export type FileRole = 'code' | 'test' | 'doc' | 'config' | 'asset';
export type AddedLine = { line: number; text: string };
export type FileChange = { path: string; adds: number; dels: number; role: FileRole; isNew: boolean; ranges: Array<[number, number]>; added: AddedLine[] };
export type ChangeUnit = {
  id: string; label: string; kind: string; layer: Layer; root: boolean; file: string; line: number; parent: string | null;
  /** search terms other code uses to reach this unit: an import path fragment, a URL prefix, a command name */
  needles: string[];
  /** the changed lines that belong to this unit */
  added: AddedLine[];
  method?: string; path?: string; provider?: Provider;
  /** files folded into this unit (a CLI file without a command of its own belongs to the command it serves) */
  also?: string[];
};
export type Provider = { name: string; keys: string[] };
export type Criterion = { id: string; text: string };
export type SpecSource = { source: string; via: string; criteria: Criterion[] } | { missing: string };
export type PullRequest = { number: number; title: string; body: string; url: string };

export function git(dir: string, args: string[], input?: string): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], ...(input === undefined ? {} : { input }) });
}

const ASSET = /\.(png|jpe?g|gif|svg|webp|ico|mp4|webm|mov|woff2?|ttf|otf|pdf|zip|gz)$/i;
// Test scaffolding counts as test: harnesses, fixtures and dogfood projects drive the code, they are not it.
const TEST = /(^|\/)(tests?|__tests__|spec|conformance|e2e|dogfood|fixtures|__fixtures__|harness)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
const DOC = /\.(md|mdx|rst|txt|adoc)$|(^|\/)docs?\//i;
const CODE = /\.(py|[cm]?js|[cm]?ts|jsx|tsx|vue|svelte|rb|go|rs|java|kt|php|sql|prisma|html|css|scss)$/;
/** `harness`: whether a code file is a harness beside the app (see `harnessOf`); a harness counts as test. */
export function roleOf(path: string, harness: (path: string) => boolean = () => false): FileRole {
  if (ASSET.test(path)) return 'asset';
  if (TEST.test(path)) return 'test';
  if (DOC.test(path)) return 'doc';
  if (!CODE.test(path)) return 'config';
  return harness(path) ? 'test' : 'code';
}
/** A test by its path; given `harness` (see `harnessOf`), a harness file beside the app is one too, as `roleOf` says. */
export const isTestFile = (path: string, harness?: (path: string) => boolean) => TEST.test(path) || (CODE.test(path) && !!harness?.(path));
const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|setup\.py|go\.mod|Cargo\.toml|Gemfile|pom\.xml|build\.gradle(\.kts)?)$/;
const CONFIG = /(^|\/)tracegrove\.config\.ya?ml$/;
/**
 * Folders below the root that hold their own tracegrove.config.yaml and no package manifest: a tracegrove project
 * beside the code. It may be a harness that drives the app from outside (a QA project) or the app itself (a service
 * of a monorepo with one root pyproject.toml or go.mod, a sample app), so `harnessOf` decides file by file.
 * A folder with its own manifest is a package of a monorepo, and its code stays code.
 */
export function scaffoldsOf(listing: readonly string[]): string[] {
  const packages = new Set(listing.filter((f) => MANIFEST.test(f)).map((f) => dirname(f)));
  return listing.filter((f) => f.includes('/') && CONFIG.test(f)).map((f) => dirname(f)).filter((d) => !packages.has(d));
}
const within = (folder: string, path: string) => path === folder || path.startsWith(`${folder}/`);
/** Whether a tracegrove config puts the app it tests in its own folder: its entry, or a source it watches, resolves there. */
function appInside(folder: string, config: string | null): boolean {
  let app: { root?: unknown; entry?: unknown; sources?: unknown } | undefined;
  try { app = (parseYaml(config ?? '') as { app?: typeof app } | null)?.app; } catch { return false; }
  if (!app || typeof app !== 'object') return false;
  const root = typeof app.root === 'string' ? app.root : '.';
  const named = [app.entry, ...(Array.isArray(app.sources) ? app.sources : [])].filter((x): x is string => typeof x === 'string');
  return named.some((x) => within(folder, normalize(join(folder, root, x.split(/[*?[{]/)[0]!))));
}
/** Whether a source file imports code by a relative path that leads out of `folder`: it drives code that lives elsewhere. */
export function reachesOutOf(folder: string, file: string, text: string): boolean {
  const masked = maskComments(file, text);
  if (file.endsWith('.py')) {
    for (const m of masked.matchAll(/^\s*from\s+(\.+)([\w.]*)\s+import\b/gm)) {
      let at = dirname(file); for (let i = 1; i < m[1]!.length; i++) at = dirname(at);
      if (!within(folder, normalize(join(at, m[2]!.replace(/\./g, '/'))))) return true;
    }
    return false;
  }
  for (const m of masked.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](\.{1,2}\/[^'"\n]*)['"]/g)) {
    if (!within(folder, normalize(join(dirname(file), m[1]!)))) return true;
  }
  return false;
}
/**
 * Which code files on the branch are a harness beside the app rather than the app: a file in a tracegrove project
 * folder (see `scaffoldsOf`) whose config does not put the app in that folder, and which itself imports code from
 * outside the folder. Without both, a file stays code, so a change to a service or a sample is never hidden.
 */
export function harnessOf(dir: string, branch: string): (path: string) => boolean {
  let listing: string[];
  try { listing = git(dir, ['ls-tree', '-r', '--name-only', branch]).split('\n').filter(Boolean); } catch { return () => false; }
  const folders = scaffoldsOf(listing).filter((d) => !appInside(d, readAt(dir, branch, listing.find((f) => dirname(f) === d && CONFIG.test(f))!)));
  if (!folders.length) return () => false;
  const memo = new Map<string, boolean>();
  return (path) => {
    if (!CODE.test(path)) return false;
    const folder = folders.filter((d) => path.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0];
    if (!folder) return false;
    if (!memo.has(path)) { const text = readAt(dir, branch, path); memo.set(path, text !== null && reachesOutOf(folder, path, text)); }
    return memo.get(path)!;
  };
}

/** Files and added lines of `base...branch`, with each hunk's new-side line range. */
export function readChange(dir: string, base: string, branch: string): FileChange[] {
  const harness = harnessOf(dir, branch);
  const role = (path: string) => roleOf(path, harness);
  const stats = new Map<string, { adds: number; dels: number }>();
  for (const line of git(dir, ['diff', '--numstat', '--relative', '--no-renames', `${base}...${branch}`]).split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (m) stats.set(m[3]!, { adds: m[1] === '-' ? 0 : Number(m[1]), dels: m[2] === '-' ? 0 : Number(m[2]) });
  }
  const files = new Map<string, FileChange>();
  let current: FileChange | null = null; let next = 0; let pendingNew = false; let header = false;
  for (const line of git(dir, ['diff', '-U0', '--no-color', '--no-ext-diff', '--relative', '--no-renames', `${base}...${branch}`]).split('\n')) {
    if (line.startsWith('diff --git ')) { current = null; pendingNew = false; header = true; continue; }
    if (header && line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '');
      if (path === '/dev/null') { current = null; continue; }
      const st = stats.get(path) ?? { adds: 0, dels: 0 };
      current = { path, ...st, role: role(path), isNew: pendingNew, ranges: [], added: [] }; files.set(path, current); continue;
    }
    if (header && line.startsWith('--- ')) { if (line === '--- /dev/null') pendingNew = true; continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) header = false;
    if (hunk && current) {
      next = Number(hunk[1]); const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) current.ranges.push([next, next + count - 1]); continue;
    }
    if (current && line.startsWith('+')) { if (current.added.length < 4000) current.added.push({ line: next, text: line.slice(1) }); next++; }
  }
  // Binary files and pure deletions have no hunk text; numstat still lists them.
  for (const [path, st] of stats) if (!files.has(path)) files.set(path, { path, ...st, role: role(path), isNew: false, ranges: [], added: [] });
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export function readAt(dir: string, branch: string, path: string): string | null {
  try { return git(dir, ['show', `${branch}:./${path}`]); } catch { return null; }
}

export type GrepHit = { file: string; line: number; text: string };
/** Fixed-string search of the whole branch (tracked files only), newest first is not implied. */
export function grepAt(dir: string, branch: string, needles: string[], limit = 200): GrepHit[] {
  const usable = needles.filter((n) => n.length >= 3);
  if (!usable.length) return [];
  let out = '';
  try { out = git(dir, ['grep', '-n', '-I', '-F', '--no-color', ...usable.flatMap((n) => ['-e', n]), branch, '--', '.']); } catch { return []; }
  const hits: GrepHit[] = [];
  for (const raw of out.split('\n')) {
    if (!raw.startsWith(`${branch}:`)) continue;
    const m = /^([^:]+):(\d+):(.*)$/.exec(raw.slice(branch.length + 1));
    if (m) hits.push({ file: m[1]!, line: Number(m[2]), text: m[3]!.trim().slice(0, 240) });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** The pull request for a branch, when the GitHub CLI is installed and signed in. Never required. */
const gh = (dir: string, args: string[]) => execFileSync('gh', args, { cwd: dir, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] });
/** The open PR for a branch: `gh pr view` first, then the REST API, for hosts where GraphQL is unavailable. */
export function pullRequestFor(dir: string, branch: string): PullRequest | null {
  const name = branch.replace(/^origin\//, '');
  const shape = (pr: Partial<PullRequest> & { html_url?: string } | undefined) => (pr && typeof pr.number === 'number' ? { number: pr.number, title: String(pr.title ?? ''), body: String(pr.body ?? ''), url: String(pr.url && !pr.url.includes('api.github.com') ? pr.url : pr.html_url ?? '') } : null);
  try { return shape(JSON.parse(gh(dir, ['pr', 'view', name, '--json', 'number,title,body,url'])) as Partial<PullRequest>); } catch { /* try REST */ }
  try { return shape((JSON.parse(gh(dir, ['api', `repos/{owner}/{repo}/pulls?head={owner}:${name}&state=all&per_page=1`])) as Array<Partial<PullRequest> & { html_url?: string }>)[0]); } catch { return null; }
}
function issueBody(dir: string, n: number): { title: string; body: string } | null {
  try { return JSON.parse(gh(dir, ['issue', 'view', String(n), '--json', 'title,body'])) as { title: string; body: string }; } catch { /* try REST */ }
  try { const i = JSON.parse(gh(dir, ['api', `repos/{owner}/{repo}/issues/${n}`])) as { title?: string; body?: string | null }; return { title: String(i.title ?? ''), body: String(i.body ?? '') }; } catch { return null; }
}

const CRITERIA_HEADING = /^#{1,6}\s*(acceptance|criteria|requirements|spec|done when|definition of done|what should be true|success)/i;
/**
 * Criteria from markdown: list items under an acceptance-style heading, or every checkbox item.
 * Prose is never turned into a criterion; a spec without list items yields none.
 */
export function criteriaFrom(markdown: string): string[] {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) { inSection = CRITERIA_HEADING.test(line); continue; }
    const item = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
    if (!item) continue;
    if (inSection || /^\s{0,3}[-*+]\s+\[[ xX]\]\s+/.test(line)) out.push(item[1]!.replace(/\*\*|__|`/g, '').trim());
  }
  return [...new Set(out.filter((c) => c.length >= 8))].slice(0, 24);
}

/** Where the change's spec comes from, best first: an explicit file, the PR, an issue it closes, the commit messages. */
export function findSpec(dir: string, base: string, branch: string, pr: PullRequest | null, specFile: string | null, useGh: boolean): SpecSource {
  const make = (source: string, via: string, texts: string[]): SpecSource => ({ source, via, criteria: texts.map((text, i) => ({ id: `C${i + 1}`, text })) });
  if (specFile) {
    const path = resolve(dir, specFile);
    if (!existsSync(path)) return { missing: `the spec file ${specFile} does not exist` };
    const found = criteriaFrom(readFileSync(path, 'utf8'));
    return found.length ? make(specFile, 'passed with --spec', found) : { missing: `${specFile} has no list items under an acceptance heading and no checkboxes` };
  }
  if (pr) {
    const found = criteriaFrom(pr.body);
    if (found.length) return make(`PR #${pr.number}`, 'its description', found);
    const linked = useGh ? /\b(?:closes|fixes|resolves)\s+#(\d+)/i.exec(pr.body) : null;
    const issue = linked ? issueBody(dir, Number(linked[1])) : null;
    if (issue) { const fromIssue = criteriaFrom(issue.body); if (fromIssue.length) return make(`issue #${linked![1]} “${issue.title}”`, `linked from PR #${pr.number}`, fromIssue); }
  }
  let messages = '';
  try { messages = git(dir, ['log', '--format=%B', `${base}..${branch}`]); } catch { messages = ''; }
  const fromCommits = criteriaFrom(messages);
  if (fromCommits.length) return make('the commit messages', `${base}..${branch}`, fromCommits);
  return { missing: pr ? `PR #${pr.number} has no acceptance criteria (list items under an "Acceptance criteria" heading, or checkboxes)` : 'no PR found and no spec in the commit messages; pass --spec <file>' };
}

export const PROVIDERS: Array<{ name: string; test: RegExp; keys: string[] }> = [
  { name: 'GitHub', test: /\b(?:execFile(?:Sync)?|spawn(?:Sync)?)\(\s*['"]gh['"]|@octokit\/|api\.github\.com/, keys: ['GH_TOKEN', 'GITHUB_TOKEN'] },
  { name: 'Stripe', test: /from\s+['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)|api\.stripe\.com|import stripe/, keys: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_KEY'] },
  { name: 'SendGrid', test: /@sendgrid\/|api\.sendgrid\.com|import sendgrid/, keys: ['SENDGRID_API_KEY'] },
  { name: 'Twilio', test: /from\s+['"]twilio['"]|require\(\s*['"]twilio['"]\s*\)|api\.twilio\.com|from twilio/, keys: ['TWILIO_AUTH_TOKEN'] },
  { name: 'Slack', test: /@slack\/|hooks\.slack\.com|slack\.com\/api|slack_sdk/, keys: ['SLACK_BOT_TOKEN'] },
  { name: 'OpenAI', test: /from\s+['"]openai['"]|api\.openai\.com|import openai/, keys: ['OPENAI_API_KEY'] },
  { name: 'Anthropic', test: /@anthropic-ai\/sdk|api\.anthropic\.com|import anthropic/, keys: ['ANTHROPIC_API_KEY'] },
  { name: 'Resend', test: /from\s+['"]resend['"]|api\.resend\.com/, keys: ['RESEND_API_KEY'] },
  { name: 'AWS', test: /@aws-sdk\/|import boto3|amazonaws\.com/, keys: ['AWS_ACCESS_KEY_ID'] },
  { name: 'Supabase', test: /@supabase\/|supabase\.co\b/, keys: ['SUPABASE_SERVICE_ROLE_KEY'] },
  { name: 'Clerk', test: /@clerk\/|clerk\.com\b/, keys: ['CLERK_SECRET_KEY'] },
];
const CACHE = /\b(?:redis|ioredis|memcached?|lru-cache)\b|\bcache\.(?:get|set|del)\(/i;
const DATA_FILE = /(^|\/)(migrations?|alembic|schema|models?)\/|\.sql$|\.prisma$|(^|\/)models\.py$/;
const JOB_FILE = /(^|\/)(jobs?|workers?|queues?|tasks|cron)\/|(?:worker|job|queue|cron)[^/]*\.[a-z]+$/i;
const JOB_CODE = /new Worker\(|@(?:shared_)?task\b|\.process\(\s*['"]|cron\.schedule\(|@Cron\(|@celery/;
const UI_FILE = /\.(tsx|jsx|vue|svelte|html|css|scss)$|(^|\/)(pages|components|views|screens|app)\/|(^|\/)ui[A-Z][^/]*\.[cm]?[jt]s$|(Page|View|Screen|Component)\.[cm]?[jt]sx?$/;
const CLI_FILE = /(^|\/)(cli|bin|commands?)\//;

function programName(dir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string; bin?: string | Record<string, string> };
    if (pkg.bin && typeof pkg.bin === 'object') return Object.keys(pkg.bin)[0] ?? pkg.name ?? basename(resolve(dir));
    return pkg.name ?? basename(resolve(dir));
  } catch { return basename(resolve(dir)); }
}
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
/**
 * Blank the text of every template literal that spans lines, keeping newlines and the code inside `${…}`.
 * Source a file writes out (`writeFileSync(app, `…url.pathname === '/x'…`)`) is text, not a route it serves.
 * A small lexer: comments, quotes, regex literals and nested templates are skipped so a backtick inside
 * them does not open a literal; anything it cannot read ends at the line and leaves the text as it was.
 * A quote that does not close on its line is text, not a string (an apostrophe in JSX: <p>Don't</p>), and
 * `</` closes a JSX tag rather than starting a regex, so neither hides a backtick that opens a template.
 */
export function maskTemplates(file: string, text: string): string {
  if (!/\.[cm]?[jt]sx?$/.test(file) || !text.includes('`')) return text;
  const out = text.split(''); const n = text.length;
  const ident = (c: string | undefined) => !!c && /[\w$]/.test(c);
  // The index after the closing quote, or -1 when the quote does not close on its line.
  const quoted = (i: number, q: string) => { for (let j = i + 1; j < n; j++) { const c = text[j]; if (c === '\\') j++; else if (c === q) return j + 1; else if (c === '\n') return -1; } return -1; };
  const regex = (i: number) => {
    let cls = false;
    for (let j = i + 1; j < n; j++) {
      const c = text[j];
      if (c === '\\') { j++; continue; }
      if (c === '\n') return i + 1; // not a regex after all: a division
      if (cls) { if (c === ']') cls = false; } else if (c === '[') cls = true;
      else if (c === '/') { j++; while (j < n && /[a-z]/i.test(text[j]!)) j++; return j; }
    }
    return i + 1;
  };
  // A run of code; inside `${…}` it ends at the brace that closes the expression.
  const code = (i: number, expr: boolean): number => {
    let depth = 0; let prev = ''; let word = '';
    while (i < n) {
      const c = text[i]!;
      if (c === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = e < 0 ? n : e; continue; }
      if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '\'' || c === '"') { const end = quoted(i, c); i = end < 0 ? i + 1 : end; prev = c; continue; }
      if (c === '`') { i = template(i); prev = c; continue; }
      if (c === '/' && (ident(prev) ? REGEX_AFTER.has(word) : !/[)\]'"`<]/.test(prev))) { i = regex(i); prev = '/'; continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (expr && depth === 0) return i + 1; depth--; }
      if (!/\s/.test(c)) { if (ident(c)) word = ident(text[i - 1]) ? word + c : c; prev = c; }
      i++;
    }
    return n;
  };
  const template = (i: number): number => {
    const parts: Array<[number, number]> = []; let from = i + 1;
    for (let j = i + 1; j < n; j++) {
      const c = text[j];
      if (c === '\\') { j++; continue; }
      if (c === '$' && text[j + 1] === '{') { parts.push([from, j]); j = code(j + 2, true) - 1; from = j + 1; continue; }
      if (c !== '`') continue;
      parts.push([from, j]);
      if (parts.some(([a, b]) => text.slice(a, b).includes('\n'))) for (const [a, b] of parts) for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' ';
      return j + 1;
    }
    return n;
  };
  code(0, false);
  return out.join('');
}
/** Routes a changed file declares, leaving out text inside multi-line template literals (generated source, fixtures). */
export const routesOf = (file: string, text: string) => scanSource(file, maskTemplates(file, text));

/** A line that holds a regular expression or a pattern table describes code; it does not call it. */
export const isPatternSource = (text: string) => /\\[.()/[\]sbdwS]|\/[^/\n]*\\\(|\/[^/\n]+\/[a-z]*\.(?:test|exec)\(/.test(text);
const stem = (file: string) => basename(file).replace(/\.[^.]+$/, '');
const inRanges = (line: number, ranges: Array<[number, number]>) => ranges.some(([a, b]) => line >= a && line <= b);

/**
 * Units in the order the tree grows them: branches (what people use) before roots (what it depends on).
 * At most `cap` units are traced; the rest are counted, never hidden.
 */
export function unitsOf(dir: string, branch: string, files: FileChange[], cap = 24): { units: ChangeUnit[]; untraced: number } {
  const prog = programName(dir);
  const branches: ChangeUnit[] = []; const roots: ChangeUnit[] = [];
  const rootKeys = new Set<string>();
  const folded: FileChange[] = [];
  for (const f of files.filter((x) => x.role === 'code' && x.added.length)) {
    const text = readAt(dir, branch, f.path);
    if (text === null) continue;
    const masked = maskComments(f.path, text).split('\n');
    const addedCode = f.added.filter((a) => (masked[a.line - 1] ?? '').trim().length > 0);
    const callsCode = addedCode.filter((a) => !isPatternSource(a.text));
    const own: ChangeUnit[] = [];
    // Routes whose declaration or handler body changed.
    const routes = /\.(py|[cm]?[jt]sx?)$/.test(f.path) ? routesOf(f.path, text).filter((r) => r.method !== 'ANY') : [];
    routes.sort((a, b) => a.line - b.line);
    routes.forEach((r, i) => {
      const end = routes[i + 1]?.line ?? r.line + 40;
      const body = addedCode.filter((a) => a.line >= r.line && a.line < end);
      if (!f.isNew && !inRanges(r.line, f.ranges) && body.length === 0) return;
      const prefix = r.path.split('{')[0]!.replace(/\/$/, '');
      own.push({ id: '', label: `${r.method} ${r.path}`, kind: 'route', layer: 'api', root: false, file: f.path, line: r.line, parent: null, needles: prefix.length >= 4 ? [prefix] : [], added: body, method: r.method, path: r.path });
    });
    // Commands a CLI added.
    if (CLI_FILE.test(f.path)) {
      for (const a of addedCode) {
        const m = /^\s*case\s+['"]([a-z][a-z0-9-]*)['"]\s*:/.exec(a.text) ?? /\.command\(\s*['"]([a-z][\w:-]*)/.exec(a.text);
        if (m && !own.some((u) => u.label === `${prog} ${m[1]}`)) own.push({ id: '', label: `${prog} ${m[1]}`, kind: 'command', layer: 'cli', root: false, file: f.path, line: a.line, parent: null,
          needles: [`${prog} ${m[1]}`, `['${m[1]}'`, `["${m[1]}"`], added: addedCode.filter((x) => x.line >= a.line && x.line < a.line + 60) });
      }
    }
    if (!own.length) {
      const first = addedCode[0]?.line ?? f.ranges[0]?.[0] ?? 1;
      const needles = [`/${stem(f.path)}.`, `/${stem(f.path)}'`, `/${stem(f.path)}"`];
      if (DATA_FILE.test(f.path)) {
        const table = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(\w+)/i.exec(addedCode.map((a) => a.text).join('\n'))?.[1];
        roots.push({ id: '', label: table ? `${table} table` : stem(f.path), kind: table ? 'table' : 'schema', layer: 'data', root: true, file: f.path, line: first, parent: null, needles: table ? [table] : needles, added: addedCode });
        continue;
      }
      if (CLI_FILE.test(f.path)) { folded.push(f); continue; }
      const kind = JOB_FILE.test(f.path) || callsCode.some((a) => JOB_CODE.test(a.text)) ? 'job' : UI_FILE.test(f.path) ? (/(^|\/)pages?\/|Page\b|Page\.|uiPage/.test(f.path) ? 'page' : 'component') : 'module';
      own.push({ id: '', label: basename(f.path), kind, layer: kind === 'job' ? 'jobs' : kind === 'module' ? 'lib' : 'ui', root: false, file: f.path, line: first, parent: null, needles, added: addedCode });
    }
    branches.push(...own);
    // Roots the changed lines reach: caches and third-party services, once each.
    const owner = own[0] ?? null;
    for (const a of callsCode) {
      const code = masked[a.line - 1] ?? '';
      for (const p of PROVIDERS) if (p.test.test(code) && !rootKeys.has(p.name)) {
        rootKeys.add(p.name);
        roots.push({ id: '', label: p.name, kind: 'third party', layer: 'ext', root: true, file: f.path, line: a.line, parent: owner ? owner.label : null, needles: [p.name.toLowerCase()], added: [a], provider: { name: p.name, keys: p.keys } });
      }
      if (CACHE.test(code) && !rootKeys.has('cache')) {
        rootKeys.add('cache');
        roots.push({ id: '', label: /redis/i.test(code) ? 'Redis' : 'cache', kind: 'cache', layer: 'cache', root: true, file: f.path, line: a.line, parent: owner ? owner.label : null, needles: [], added: [a] });
      }
    }
  }
  // A CLI file without a command of its own (argument parsing, rendering) belongs to the command it serves.
  const command = branches.find((u) => u.kind === 'command');
  for (const f of folded) {
    if (command) { command.added.push(...f.added); (command.also ??= []).push(f.path); continue; }
    branches.push({ id: '', label: basename(f.path), kind: 'module', layer: 'cli', root: false, file: f.path, line: f.added[0]?.line ?? 1, parent: null, needles: [`/${stem(f.path)}.`], added: f.added });
  }
  const order: Layer[] = ['ui', 'cli', 'api', 'jobs', 'lib'];
  branches.sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer) || b.added.length - a.added.length);
  const all = [...branches, ...roots];
  const kept = all.length > cap ? [...branches.slice(0, cap - Math.min(roots.length, Math.floor(cap / 3))), ...roots.slice(0, Math.floor(cap / 3))] : all;
  kept.forEach((u, i) => { u.id = `u${i + 1}`; });
  for (const u of kept) if (u.parent) u.parent = kept.find((x) => x.label === u.parent)?.id ?? null;
  return { units: kept, untraced: all.length - kept.length };
}

const STOP = new Set('this that with from into when then than they them their there have will would should could must been being were what which while where your about after before each every only also just more most other some such very none true false null undefined return const function export import default async await class type string number boolean value values item items data file files line lines text test tests'.split(' '));
/** A light stem so “notes”, “noted” and “note” meet, without cutting “notes” down to “not”. */
const wordStem = (w: string) => w.replace(/ies$/, 'y').replace(/(ss|x|ch|sh)es$/, '$1').replace(/(?<=..)(ing|ed)$/, '').replace(/(?<!s)s$/, '');
/** Words worth matching between a criterion and the code: lowercase, four letters or more, light stemming. */
export function termsOf(text: string): Set<string> {
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter((w) => w.length >= 4 && !STOP.has(w)).map(wordStem).filter((w) => w.length >= 4 && !STOP.has(w)));
}

/** Shared words between a criterion and a unit, strongest evidence first; empty when they do not meet. */
export function matchCriterion(criterion: string, unit: Pick<ChangeUnit, 'label' | 'file' | 'added'>): string[] {
  const want = termsOf(criterion);
  const name = termsOf(`${unit.label} ${unit.file}`);
  const counts = new Map<string, number>();
  for (const a of unit.added) for (const t of termsOf(a.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const named = [...want].filter((t) => name.has(t));
  const body = [...want].filter((t) => !name.has(t) && (counts.get(t) ?? 0) >= 1);
  return named.length >= 2 || (named.length >= 1 && named.length + body.length >= 3) ? [...named, ...body] : body.length >= 4 ? body : [];
}

export const dirOf = (path: string) => dirname(path);
