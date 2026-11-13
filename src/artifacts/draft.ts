/**
 * Drafting a check spec from a brief, before the work is made. The drafter (a model, or plain rules
 * with no model) proposes promises and invariants; this module decides what it is allowed to write.
 *
 * A drafted spec can never excuse anything: exclusions, extra seeded defects, a relaxed ship rule and
 * `gate` authority are a person's to add. When the piece already exists the draft is run against it,
 * so a check that matches nothing is reported while it is still cheap to fix.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { stringify } from 'yaml';
import { Blocked } from '../core/errors.ts';
import type { Ask } from '../authoring/judge.ts';
import { ArtifactSpec } from './spec.ts';
import { MAX_BYTES, isUrl, sha256 } from './read.ts';
import { runArtifactCheck, type Receipt } from './run.ts';

export type DraftOptions = {
  brief: string; artifact: string; out?: string; id?: string; kind?: string; sources?: string; ask?: Ask; by?: string; force?: boolean;
};
export type DraftResult = {
  spec: string; id: string; draftedBy: string; promises: number; checks: string[];
  /** What the drafter proposed that was removed, and why. */
  dropped: string[];
  /** Set when the piece already exists: the draft run against it, nothing written to the run history. */
  trial: { verdict: Receipt['verdict']; reasons: string[]; unprovenChecks: string[]; attention: Array<{ check: string; status: string; detail: string }> } | null;
  note: string;
};

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'piece';
const posixRel = (from: string, to: string): string => relative(from, to).replace(/\\/g, '/') || '.';

function readText(path: string, what: string): string {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Blocked([{ code: 'artifact_brief_missing', owner: 'agent', detail: `no ${what} at ${path}`, action: 'tracegrove artifact draft <brief.md> --artifact <piece>' }]);
  if (statSync(path).size > MAX_BYTES) throw new Blocked([{ code: 'artifact_brief_too_large', owner: 'agent', detail: `${path} is larger than ${MAX_BYTES} bytes`, action: 'pass a shorter brief' }]);
  return readFileSync(path, 'utf8');
}

/** Files the drafter may point checks at: name, and the start of each, so a number can be wired to its path. */
function listSources(dir: string, specDir: string): Array<{ ref: string; head: string }> {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Blocked([{ code: 'artifact_sources_missing', owner: 'agent', detail: `no folder at ${dir}`, action: 'pass --sources <folder>' }]);
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40)
    .map((e) => ({ ref: posixRel(specDir, join(dir, e.name)), head: statSync(join(dir, e.name)).size > MAX_BYTES ? '(large file)' : readFileSync(join(dir, e.name), 'utf8').slice(0, 600) }));
}

/** With no model: every bullet in the brief becomes a promise, and the checks that need no knowledge of the piece are on. */
export function draftByRules(brief: string): { promises: string[]; invariants: Record<string, unknown> } {
  const bullets = brief.split(/\r?\n/).map((line) => /^\s*(?:[-*]|\d+[.)])\s+(.{12,})$/.exec(line)?.[1]?.trim()).filter((line): line is string => !!line);
  return { promises: [...new Set(bullets)].slice(0, 20).map((line) => line.slice(0, 2000)), invariants: { claims: {}, links: {} } };
}

export function buildDraftPrompt(input: { brief: string; artifact: string; piece: string | null; sources: Array<{ ref: string; head: string }> }): string {
  return [
    'You are writing the acceptance check for one piece of work that is not code, from its brief, before or while it is made.',
    'The check is for this one piece. Do not describe what pieces of this type usually look like, and do not invent requirements the brief does not make.',
    '',
    'Reply with one JSON object and nothing else:',
    '{',
    '  "title": "<short name of the piece>",',
    '  "kind": "<optional label such as sales.send_plan>",',
    '  "afterlife": "once" | "living" | "hypothesis",   // once: sent or published one time. living: kept current. hypothesis: makes a prediction; then add "reviewDate": "YYYY-MM-DD"',
    '  "promises": ["<what the brief says this piece must do, one plain sentence each, judged by reading the piece>"],',
    '  "invariants": {',
    '    "contract": { "fields": ["<a label the brief requires the piece to state, such as Owner or Stop condition>"] },',
    '    "numbers": [{ "id": "<kebab-case>", "find": "<regular expression with ONE capture group around the number as the piece will write it>", "source": { "ref": "<a source listed below>", "path": "<dotted path into its JSON>" } }],',
    '    "claims": { "mustCite": ["<regular expression for wording that must carry a link, such as \\\\d+% of>"] },',
    '    "links": { "requireParams": ["<query parameter every external link must carry>"] },',
    '    "forbid": [{ "pattern": "<regular expression>", "example": "<text that matches it>", "reason": "<why, from the brief>" }],',
    '    "audience": { "recipients": "<a source listed below>", "noneIn": ["<a list nobody in recipients may be on>"] }',
    '  }',
    '}',
    '',
    'Rules:',
    '- Every part of "invariants" is optional. Leave out any part the brief gives no ground for. Include "claims": {} and "links": {} unless the piece will have neither quotes nor links.',
    '- A promise is something a careful reader could mark met or not met from the text alone. Put taste and judgement here, not in invariants. At most 12.',
    '- A number check needs a source listed below that actually holds the number. If no listed source holds it, write a mustCite pattern instead.',
    '- Use only the source references listed below, exactly as written. Never invent a file or URL.',
    '- Every forbid rule needs an example that matches its pattern.',
    '- Do not write exclusions, waivers, tolerances or anything that would let a failure pass.',
    '',
    `The piece will be at: ${input.artifact}`,
    '',
    'Sources available:',
    ...(input.sources.length ? input.sources.flatMap((s) => [`- ${s.ref}`, ...s.head.split('\n').slice(0, 12).map((line) => `    ${line.slice(0, 200)}`)]) : ['(none)']),
    '',
    'The brief:',
    input.brief,
    ...(input.piece === null ? [] : ['', 'The piece as it stands (use it only to write `find` patterns that match how it words its numbers; the brief decides what is required):', input.piece.slice(0, 60_000)]),
  ].join('\n');
}

function parseObject(text: string): Record<string, unknown> | null {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { const value: unknown = JSON.parse(json); return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; }
}

/** Keeps what a drafter may propose and removes the rest, saying what went. */
function restrict(raw: Record<string, unknown>, allowedRefs: Set<string> | null): { proposal: Record<string, unknown>; dropped: string[] } {
  const dropped: string[] = [];
  const proposal: Record<string, unknown> = {};
  for (const key of ['title', 'kind', 'afterlife', 'reviewDate'] as const) if (typeof raw[key] === 'string' && raw[key]) proposal[key] = raw[key];
  for (const key of Object.keys(raw)) if (!['title', 'kind', 'afterlife', 'reviewDate', 'promises', 'invariants'].includes(key)) dropped.push(`${key}: a drafted spec may not set this`);
  proposal.promises = (Array.isArray(raw.promises) ? raw.promises : []).map((p) => typeof p === 'string' ? p : typeof (p as { text?: unknown })?.text === 'string' ? (p as { text: string }).text : null)
    .filter((p): p is string => { if (p === null || !p.trim()) dropped.push('a promise that was not text'); return !!p?.trim(); }).slice(0, 20);
  if (Array.isArray(raw.promises) && raw.promises.some((p) => typeof p === 'object' && p !== null && (p as { authority?: unknown }).authority === 'gate')) dropped.push('authority: gate (only a person can let a judge block)');
  const inv = raw.invariants !== null && typeof raw.invariants === 'object' ? { ...(raw.invariants as Record<string, unknown>) } : {};
  const known = (ref: unknown): boolean => typeof ref === 'string' && (allowedRefs === null || allowedRefs.has(ref) || isUrl(ref));
  if (Array.isArray(inv.numbers)) inv.numbers = inv.numbers.filter((n) => { const ok = known((n as { source?: { ref?: unknown } })?.source?.ref); if (!ok) dropped.push(`number ${(n as { id?: unknown })?.id ?? '?'}: its source is not one of the listed sources`); return ok; });
  if (Array.isArray(inv.numbers) && !inv.numbers.length) delete inv.numbers;
  const audience = inv.audience as { recipients?: unknown; noneIn?: unknown } | undefined;
  if (audience && !(known(audience.recipients) && Array.isArray(audience.noneIn) && audience.noneIn.length && audience.noneIn.every(known))) { delete inv.audience; dropped.push('audience: its lists are not among the listed sources'); }
  for (const key of Object.keys(inv)) {
    if (!['contract', 'numbers', 'claims', 'links', 'forbid', 'audience'].includes(key)) { delete inv[key]; dropped.push(`invariants.${key}: not a check`); continue; }
    // Severity and tolerance stay at their strict defaults: a drafter does not get to soften a check.
    const strip = (rule: unknown): void => { if (rule !== null && typeof rule === 'object') for (const soft of ['severity', 'tolerance', 'resolve']) if (soft in (rule as object)) { delete (rule as Record<string, unknown>)[soft]; dropped.push(`${key}.${soft}: left at its default`); } };
    if (Array.isArray(inv[key])) (inv[key] as unknown[]).forEach(strip); else strip(inv[key]);
  }
  proposal.invariants = inv;
  return { proposal, dropped: [...new Set(dropped)] };
}

export async function draftSpec(options: DraftOptions): Promise<DraftResult> {
  const briefPath = resolve(options.brief);
  const brief = readText(briefPath, 'brief');
  const artifactIsUrl = isUrl(options.artifact);
  const artifactPath = artifactIsUrl ? null : resolve(options.artifact);
  const out = resolve(options.out ?? (artifactPath ? join(dirname(artifactPath), `${basename(artifactPath, extname(artifactPath))}.check.yaml`) : join(dirname(briefPath), `${slug(basename(briefPath, extname(briefPath)))}.check.yaml`)));
  if (!/\.check\.ya?ml$/.test(out)) throw new Blocked([{ code: 'invalid_argument', owner: 'agent', detail: `${out}: a spec is named *.check.yaml`, action: 'pass --out <name>.check.yaml' }]);
  if (existsSync(out) && options.force !== true) throw new Blocked([{ code: 'artifact_spec_exists', owner: 'operator', detail: `${out} already exists`, action: 'a spec is not redrafted to suit the work; pass --force if the brief itself changed' }]);
  const specDir = dirname(out);
  const artifactRef = artifactPath ? posixRel(specDir, artifactPath) : options.artifact;
  const piece = artifactPath && existsSync(artifactPath) && statSync(artifactPath).isFile() && statSync(artifactPath).size <= MAX_BYTES ? readFileSync(artifactPath, 'utf8') : null;
  const sources = options.sources ? listSources(resolve(options.sources), specDir) : [];
  const id = options.id ?? slug(basename(out).replace(/\.check\.ya?ml$/, ''));
  const fixed = { schemaVersion: 'tracegrove.artifact-check/v1', id, artifact: artifactRef, brief: { ref: posixRel(specDir, briefPath), sha256: sha256(brief) }, ...(options.kind ? { kind: options.kind } : {}) };

  let draftedBy = 'rules'; let dropped: string[] = []; let proposal: Record<string, unknown> = draftByRules(brief);
  if (options.ask) {
    draftedBy = options.by ?? 'model';
    const prompt = buildDraftPrompt({ brief, artifact: artifactRef, piece, sources });
    let answer = await options.ask(prompt);
    for (let round = 0; ; round++) {
      const raw = parseObject(answer);
      const restricted = raw ? restrict(raw, new Set(sources.map((s) => s.ref))) : null;
      const parsed = restricted ? ArtifactSpec.safeParse({ ...restricted.proposal, ...fixed, draftedBy }) : null;
      if (restricted && parsed?.success) { proposal = restricted.proposal; dropped = restricted.dropped; break; }
      const problem = !raw || !parsed || parsed.success ? 'the reply was not one JSON object' : parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'spec'}: ${i.message}`).join('; ');
      if (round >= 1) throw new Blocked([{ code: 'artifact_draft_invalid', owner: 'agent', detail: problem.slice(0, 400), action: 'run the draft again, pick another model with --agent, or draft with --no-agent and edit the spec' }]);
      answer = await options.ask(`${prompt}\n\nYour last reply could not be used: ${problem}\nReply again with the corrected JSON object only.`);
    }
  }
  const spec = ArtifactSpec.parse({ ...proposal, ...fixed, draftedBy });

  // Written from the proposal, not the parsed spec, so defaults stay out of the file and it reads as a person would write it.
  const body = { schemaVersion: fixed.schemaVersion, id, ...(spec.title ? { title: spec.title } : {}), artifact: artifactRef, ...(spec.kind ? { kind: spec.kind } : {}), brief: fixed.brief, draftedBy,
    afterlife: spec.afterlife, ...(spec.reviewDate ? { reviewDate: spec.reviewDate } : {}), promises: spec.promises.map((p) => p.text), invariants: proposal.invariants ?? {} };
  mkdirSync(specDir, { recursive: true });
  writeFileSync(out, [`# Drafted from ${fixed.brief.ref} by ${draftedBy}. Read it before the work starts: it decides what "ready" means.`,
    '# The maker does not edit this file to reach ready. Exclusions need a reason, an owner and an end date, and only a person adds them.', stringify(body, { lineWidth: 0 })].join('\n'));

  let trial: DraftResult['trial'] = null;
  if (piece !== null) {
    const receipt = await runArtifactCheck(out, { write: false, rerun: true });
    trial = { verdict: receipt.verdict, reasons: receipt.reasons, unprovenChecks: receipt.proofs.filter((p) => !p.proven).map((p) => p.check),
      attention: receipt.findings.filter((f) => f.status !== 'pass').slice(0, 40).map((f) => ({ check: f.check, status: f.status, detail: f.detail })) };
  }
  const checks = Object.keys(spec.invariants).filter((key) => { const value = (spec.invariants as Record<string, unknown>)[key]; return value !== undefined && !(Array.isArray(value) && !value.length); });
  return { spec: out, id, draftedBy, promises: spec.promises.length, checks, dropped, trial,
    note: piece === null ? 'the piece does not exist yet: hand this spec to the maker with the brief' : 'the piece exists: the draft was run against it once, and nothing was recorded' };
}

export function renderDraft(result: DraftResult): string {
  const lines = [`drafted ${result.spec}`, `  by ${result.draftedBy}: ${result.promises} promise${result.promises === 1 ? '' : 's'}, checks: ${result.checks.join(', ') || 'none'}`];
  for (const item of result.dropped) lines.push(`  removed  ${item}`);
  if (result.trial) {
    lines.push('', `  against the piece as it stands: ${result.trial.verdict.toUpperCase()}`);
    for (const reason of result.trial.reasons) lines.push(`    ${reason}`);
    for (const f of result.trial.attention.slice(0, 12)) lines.push(`    ${f.status.padEnd(8)} ${f.check}: ${f.detail}`);
  }
  lines.push('', `  ${result.note}`, `  next: read the spec, then \`tracegrove artifact check ${result.spec}\``);
  return lines.join('\n');
}
