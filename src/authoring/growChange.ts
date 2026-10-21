/**
 * What a change is made of, read from git: the files a branch changed against its base, the spec it
 * answers to, and the units the tree grows from (routes, commands, pages, jobs, modules as branches;
 * tables, caches and third-party services as roots). Everything here is read from the branch itself,
 * never from the working tree, so a discovery describes exactly what would merge.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
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
};
export type Provider = { name: string; keys: string[] };
export type Criterion = { id: string; text: string };
export type SpecSource = { source: string; via: string; criteria: Criterion[] } | { missing: string };
export type PullRequest = { number: number; title: string; body: string; url: string };

export function git(dir: string, args: string[], input?: string): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], ...(input === undefined ? {} : { input }) });
}

const ASSET = /\.(png|jpe?g|gif|svg|webp|ico|mp4|webm|mov|woff2?|ttf|otf|pdf|zip|gz)$/i;
const TEST = /(^|\/)(tests?|__tests__|spec|conformance|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
const DOC = /\.(md|mdx|rst|txt|adoc)$|(^|\/)docs?\//i;
const CODE = /\.(py|[cm]?js|[cm]?ts|jsx|tsx|vue|svelte|rb|go|rs|java|kt|php|sql|prisma|html|css|scss)$/;
export function roleOf(path: string): FileRole {
  if (ASSET.test(path)) return 'asset';
  if (TEST.test(path)) return 'test';
  if (DOC.test(path)) return 'doc';
  return CODE.test(path) ? 'code' : 'config';
}
export const isTestFile = (path: string) => TEST.test(path);

/** Files and added lines of `base...branch`, with each hunk's new-side line range. */
export function readChange(dir: string, base: string, branch: string): FileChange[] {
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
      current = { path, ...st, role: roleOf(path), isNew: pendingNew, ranges: [], added: [] }; files.set(path, current); continue;
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
  for (const [path, st] of stats) if (!files.has(path)) files.set(path, { path, ...st, role: roleOf(path), isNew: false, ranges: [], added: [] });
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
export function pullRequestFor(dir: string, branch: string): PullRequest | null {
  try {
    const out = execFileSync('gh', ['pr', 'view', branch.replace(/^origin\//, ''), '--json', 'number,title,body,url'], { cwd: dir, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] });
    const pr = JSON.parse(out) as Partial<PullRequest>;
    return typeof pr.number === 'number' ? { number: pr.number, title: String(pr.title ?? ''), body: String(pr.body ?? ''), url: String(pr.url ?? '') } : null;
  } catch { return null; }
}
function issueBody(dir: string, n: number): { title: string; body: string } | null {
  try { return JSON.parse(execFileSync('gh', ['issue', 'view', String(n), '--json', 'title,body'], { cwd: dir, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] })) as { title: string; body: string }; } catch { return null; }
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

const PROVIDERS: Array<{ name: string; test: RegExp; keys: string[] }> = [
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
/** A line that holds a regular expression or a pattern table describes code; it does not call it. */
export const isPatternSource = (text: string) => /\\[.()/[\]sbdwS]|\/[^/\n]*\\\(/.test(text);
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
    const routes = /\.(py|[cm]?[jt]sx?)$/.test(f.path) ? scanSource(f.path, text).filter((r) => r.method !== 'ANY') : [];
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
    if (command) { command.added.push(...f.added); continue; }
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
/** Words worth matching between a criterion and the code: lowercase, four letters or more, light stemming. */
export function termsOf(text: string): Set<string> {
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '')).filter((w) => w.length >= 4));
}

/** Shared words between a criterion and a unit, strongest evidence first; empty when they do not meet. */
export function matchCriterion(criterion: string, unit: Pick<ChangeUnit, 'label' | 'file' | 'added'>): string[] {
  const want = termsOf(criterion);
  const name = termsOf(`${unit.label} ${unit.file}`);
  const counts = new Map<string, number>();
  for (const a of unit.added) for (const t of termsOf(a.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const named = [...want].filter((t) => name.has(t));
  const body = [...want].filter((t) => !name.has(t) && (counts.get(t) ?? 0) >= 1);
  return named.length >= 1 && named.length + body.length >= 2 ? [...named, ...body] : body.length >= 3 ? body : [];
}

export const dirOf = (path: string) => dirname(path);
