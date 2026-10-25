/**
 * A change to an AI agent's prompt, read from the branch: what the change touches when it changed no code. A prompt is a file
 * an agent reads as its instructions (prompts/*.md, *.prompt, a system-prompt file) or a prompt string a module declares
 * (`const SYSTEM_PROMPT = ...`). Its unit is the prompt; the code that reads it is the agent; and the screens, routes, commands
 * and jobs that reach that agent through imports are where its journeys start. The agent and the entries are not changed
 * themselves: they are what the prompt reaches, so the tree can show the journeys that depend on the agent.
 */
import { basename, dirname } from 'node:path';
import { git, grepAt, readAt, routesOf, type AddedLine, type ChangeUnit, type FileChange } from './growChange.ts';
import { importsOf, resolveImport } from './growReach.ts';
import { maskComments } from './discover.ts';

/** A file an agent reads as its prompt: in a prompts folder, named *.prompt, or named for a system or agent prompt. */
export const PROMPT_FILE = /(^|\/)prompts?\/(?:[^/]+\/)*[^/]+\.(?:md|mdx|txt|ya?ml|json|j2|jinja2?|hbs|mustache|tmpl|tpl|prompt)$|\.prompt(?:\.(?:md|txt|ya?ml|json))?$|(^|\/)[^/]*(?:system|agent|assistant)[-_.]?prompts?[^/]*\.(?:md|txt|ya?ml|json|tmpl)$/i;
export const isPromptFile = (path: string) => PROMPT_FILE.test(path) && !/(^|\/)(tests?|__tests__|fixtures|e2e|spec)\//.test(path);
/** The kind of a prompt's unit, and of the code that reads it. */
export const PROMPT_KIND = "agent's prompt";
export const AGENT_KIND = 'agent';

const SOURCE = /\.(?:[cm]?[jt]sx?|py)$/;
const JOB_FILE = /(^|\/)(jobs?|workers?|queues?|tasks|cron)\/|(?:worker|job|queue|cron)[^/]*\.[a-z]+$/i;
const UI_FILE = /\.(tsx|jsx|vue|svelte|html)$|(^|\/)(pages|components|views|screens)\/|(Page|View|Screen)\.[cm]?[jt]sx?$/;
const CLI_FILE = /(^|\/)(cli|bin|commands?)\//;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The prompt strings a code file declares, with the lines each spans: `const SYSTEM_PROMPT = \`...\``, `prompt: "..."`,
 * Python's `SYSTEM_PROMPT = """..."""`. A change whose added lines all sit inside them changed a prompt, not code.
 */
export function promptBlocks(file: string, text: string): Array<{ name: string; from: number; to: number }> {
  const lines = text.split('\n'); const out: Array<{ name: string; from: number; to: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*prompt[\w$]*|[A-Za-z_$]*PROMPT[A-Z_]*)\s*[:=]\s*(?:[\w$.]+\()?\s*(`|"""|'''|"|')/i.exec(lines[i]!);
    if (!m) continue;
    const q = m[2]!; const open = lines[i]!.indexOf(q, m.index + m[0].length - q.length) + q.length;
    let end = i;
    if (lines[i]!.slice(open).includes(q)) end = i;
    else if (q === '"' || q === "'") end = i;
    else { for (let k = i + 1; k < lines.length; k++) if (lines[k]!.includes(q)) { end = k; break; } }
    out.push({ name: m[1]!, from: i + 1, to: end + 1 });
    i = end;
  }
  return out;
}

/** Whether every added line of a code file is inside a prompt string it declares; the prompt's name when so. */
export function promptOnlyChange(f: Pick<FileChange, 'path' | 'added'>, text: string): string | null {
  if (!SOURCE.test(f.path) || !f.added.length) return null;
  const blocks = promptBlocks(f.path, text);
  if (!blocks.length) return null;
  const hit = new Set<string>();
  for (const a of f.added) {
    if (!a.text.trim()) continue;
    const b = blocks.find((x) => a.line >= x.from && a.line <= x.to);
    if (!b) return null;
    hit.add(b.name);
  }
  return hit.size ? [...hit][0]! : null;
}

type Reach = { units: ChangeUnit[] };
/**
 * The units a changed prompt adds to a change: the prompt itself, the agent code that reads a prompt file (not for a prompt
 * string: its own file is the agent), and the entries that reach that agent through imports, up to three hops. `taken` is the
 * files the change already has a unit for; those are not added again.
 */
export function promptUnits(dir: string, branch: string, files: FileChange[], taken: ReadonlySet<string>): Reach {
  const units: ChangeUnit[] = [];
  let listing: string[] = [];
  try { listing = git(dir, ['ls-tree', '-r', '--name-only', branch]).split('\n').filter(Boolean); } catch { return { units }; }
  const all = new Set(listing);
  const texts = new Map<string, string | null>();
  const text = (f: string) => { if (!texts.has(f)) texts.set(f, readAt(dir, branch, f)); return texts.get(f) ?? null; };
  const have = new Set(taken);
  const added = (f: FileChange): AddedLine[] => f.added.filter((a) => a.text.trim());

  // the prompts: prompt files, and code files whose only change is inside a prompt string
  const prompts: Array<{ unit: ChangeUnit; agents: string[] }> = [];
  for (const f of files) {
    if (isPromptFile(f.path) && f.role !== 'test' && f.role !== 'asset') {
      const unit: ChangeUnit = { id: '', label: f.path, kind: PROMPT_KIND, layer: 'lib', root: false, file: f.path, line: added(f)[0]?.line ?? f.ranges[0]?.[0] ?? 1, parent: null,
        needles: [f.path, basename(f.path), f.path.replace(/\.[^./]+$/, '')], added: added(f) };
      // the code that reads it: a source file that names it (its path, or its file name next to a prompts folder)
      const hits = grepAt(dir, branch, [basename(f.path)], 400).filter((h) => SOURCE.test(h.file) && h.file !== f.path && !/(^|\/)(tests?|__tests__|fixtures)\//.test(h.file));
      const agents = [...new Set(hits.filter((h) => namesPrompt(h.text, f.path)).map((h) => h.file))];
      prompts.push({ unit, agents });
    }
  }
  for (const p of prompts) {
    units.push(p.unit); have.add(p.unit.file);
    for (const a of p.agents) {
      if (have.has(a)) continue; have.add(a);
      const t = text(a) ?? ''; const line = t.split('\n').findIndex((l) => l.includes(basename(p.unit.file))) + 1 || 1;
      units.push({ id: '', label: basename(a), kind: AGENT_KIND, layer: 'lib', root: false, file: a, line, parent: null, needles: [`/${basename(a).replace(/\.[^.]+$/, '')}.`], added: [] });
    }
  }
  // the agents' own files, for a prompt string; and every agent, to walk up from
  const starts = units.filter((u) => u.kind === AGENT_KIND).map((u) => u.file);
  for (const f of files) if (taken.has(f.path) && SOURCE.test(f.path)) { const t = text(f.path); if (t && promptOnlyChange(f, t)) starts.push(f.path); }
  // up the imports to the entries: routes whose handler uses what the agent's chain exports, pages, commands and jobs
  const importers = (target: string) => {
    const stemName = basename(target).replace(/\.[^.]+$/, '');
    const cands = [...new Set(grepAt(dir, branch, [stemName], 1000).map((h) => h.file))].filter((f) => SOURCE.test(f) && f !== target && all.has(f) && !/(^|\/)(tests?|__tests__|fixtures)\//.test(f));
    const out: Array<{ file: string; names: string[] }> = [];
    for (const c of cands) { const t = text(c); if (!t) continue; for (const imp of importsOf(c, t)) if (resolveImport(c, imp.spec, all) === target) out.push({ file: c, names: imp.names }); }
    return out;
  };
  const seen = new Set<string>(starts);
  let frontier = starts.map((f) => ({ file: f, depth: 0 }));
  while (frontier.length) {
    const nextFrontier: typeof frontier = [];
    for (const { file, depth } of frontier) {
      for (const imp of importers(file)) {
        if (seen.has(imp.file)) continue; seen.add(imp.file);
        const t = text(imp.file) ?? '';
        const routes = /\.(py|[cm]?[jt]sx?)$/.test(imp.file) ? routesOf(imp.file, t).filter((r) => r.method !== 'ANY').sort((a, b) => a.line - b.line) : [];
        if (routes.length) {
          const masked = maskComments(imp.file, t).split('\n');
          routes.forEach((r, i) => {
            const end = routes[i + 1]?.line ?? r.line + 40;
            const body = masked.slice(r.line - 1, end - 1).join('\n');
            if (!imp.names.length || !imp.names.some((n) => new RegExp(`(?<![\\w$])${escape(n)}(?![\\w$])`).test(body))) return;
            const label = `${r.method} ${r.path}`;
            if (units.some((u) => u.label === label) || have.has(`${imp.file}#${label}`)) return;
            have.add(`${imp.file}#${label}`);
            const prefix = r.path.split('{')[0]!.replace(/\/$/, '');
            units.push({ id: '', label, kind: 'route', layer: 'api', root: false, file: imp.file, line: r.line, parent: null, needles: prefix.length >= 4 ? [prefix] : [], added: [], method: r.method, path: r.path });
          });
          continue;
        }
        if (have.has(imp.file)) continue;
        const kind = JOB_FILE.test(imp.file) ? 'job' : UI_FILE.test(imp.file) ? 'page' : CLI_FILE.test(imp.file) ? 'module' : null;
        if (kind) {
          have.add(imp.file);
          units.push({ id: '', label: basename(imp.file), kind, layer: kind === 'job' ? 'jobs' : kind === 'page' ? 'ui' : 'cli', root: false, file: imp.file, line: 1, parent: null, needles: [`/${basename(imp.file).replace(/\.[^.]+$/, '')}.`], added: [] });
          continue;
        }
        if (depth < 3) nextFrontier.push({ file: imp.file, depth: depth + 1 });
      }
    }
    frontier = nextFrontier;
  }
  void dirname;
  return { units };
}

/** Whether a line of code names a prompt file: its path, or its file name in a string (as in `prompts/triage.md` or
 *  `join(PROMPTS, 'triage.md')`). */
export function namesPrompt(line: string, path: string): boolean {
  const name = basename(path);
  return new RegExp(`['"\`/]${escape(name)}['"\`]`).test(line) || line.includes(path);
}
