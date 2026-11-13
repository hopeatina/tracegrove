/**
 * One artifact check run: read the spec and the artifact, run the invariant checks, prove each check
 * can fail by planting a defect, apply exclusions, optionally ask a judge about the promises, and
 * write a receipt that pins exactly what was read.
 *
 * Exit codes match `tracegrove grow`: 0 ready, 1 fix, 2 blocked, 3 unproven.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Blocked } from '../core/errors.ts';
import { parseJudgeAnswer, type Ask } from '../authoring/judge.ts';
import { projectRoot } from '../authoring/status.ts';
import { ArtifactSpec, familiesIn, type CheckFamily, type Exclusion } from './spec.ts';
import { defaultFetcher, isUrl, parseArtifact, parseList, sha256, Sources, type Fetcher } from './read.ts';
import { findField, runFamily, type CheckEnv, type Finding } from './checks.ts';

export const RECEIPT_VERSION = 'tracegrove.artifact-receipt/v1';
export const RUNS_DIR = join('.tracegrove', 'artifact-runs');
export const DECISIONS_FILE = join('.tracegrove', 'artifact-decisions.jsonl');
/** A link no page answers. The runner answers it itself with "gone", so proving the links check needs no network. */
export const DEAD_LINK = 'https://tracegrove.invalid/seeded-dead-link';
/** Sign-offs a judge needs before a promise marked `gate` may block, and how often it must have agreed with people. */
export const GATE_MIN_DECISIONS = 30;
export const GATE_MIN_AGREEMENT = 0.9;

export type Verdict = 'ready' | 'fix' | 'blocked' | 'unproven';
export const EXIT: Record<Verdict, number> = { ready: 0, fix: 1, blocked: 2, unproven: 3 };

export type Proof = { check: CheckFamily; proven: boolean; defects: Array<{ what: string; caught: boolean; origin: 'automatic' | 'spec' }>; note: string | null };
export type PromiseResult = { text: string; authority: 'advice' | 'gate'; verdict: 'met' | 'not_met' | 'unclear' | 'not_judged'; lines: number[]; why: string };
export type Receipt = {
  schemaVersion: typeof RECEIPT_VERSION;
  at: string;
  spec: { id: string; path: string; sha256: string; title: string | null; kind: string | null };
  /** A pointer and the hash of the bytes read. The artifact itself is never copied. */
  artifact: { ref: string; sha256: string; bytes: number };
  afterlife: 'once' | 'living' | 'hypothesis'; reviewDate: string | null;
  verdict: Verdict; exitCode: number; reasons: string[];
  counts: Record<Finding['status'], number>;
  findings: Finding[];
  proofs: Proof[];
  promises: PromiseResult[];
  judge: { asked: boolean; decisions: number; agreement: number | null; gateEarned: boolean };
  exclusions: Array<Exclusion & { state: 'active' | 'expired'; applied: number }>;
  sources: Array<{ ref: string; sha256: string | null; bytes: number | null; problem: string | null }>;
  fixList: Array<{ check: string; line: number | null; do: string; why: string }>;
  /** The hash of the run before this one for the same spec, so the history cannot be quietly rewritten. */
  previous: string | null;
  receiptHash: string;
  /** True when a `once` artifact was already ready with these exact bytes and spec, so nothing ran again. */
  reused: boolean;
  path: string | null;
};

export type RunOptions = {
  fetcher?: Fetcher; ask?: Ask; prove?: boolean; allowUnproven?: boolean; rerun?: boolean; write?: boolean; now?: Date;
  /** Where `.tracegrove/` lives. Default: the Tracegrove project around the spec, or the spec's folder. */
  stateRoot?: string;
};

const today = (now: Date): string => now.toISOString().slice(0, 10);
const key = (f: Finding): string => `${f.status}\u0000${f.subject}\u0000${f.detail}`;
const plain = (pattern: string): boolean => /^[\w\s'’,-]+$/.test(pattern);

export function loadSpec(path: string): { spec: ArtifactSpec; raw: string; path: string } {
  const file = resolve(path);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Blocked([{ code: 'artifact_spec_missing', owner: 'agent', detail: `no check spec at ${path}`, action: 'pass the path to a *.check.yaml file' }]);
  const raw = readFileSync(file, 'utf8');
  let data: unknown;
  try { data = parseYaml(raw); } catch (error) { throw new Blocked([{ code: 'artifact_spec_invalid', owner: 'agent', detail: `${path}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400), action: 'fix the YAML' }]); }
  const parsed = ArtifactSpec.safeParse(data);
  if (!parsed.success) throw new Blocked([{ code: 'artifact_spec_invalid', owner: 'agent', detail: `${path}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'spec'}: ${i.message}`).join('; ')}`.slice(0, 500), action: 'fix the spec; see docs/artifact-checks.md' }]);
  return { spec: parsed.data, raw, path: file };
}

/** Specs under a folder: every *.check.yaml, depth first, in name order. */
export function findSpecs(dir: string): string[] {
  const root = resolve(dir);
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return [root];
  const found: string[] = [];
  const walk = (at: string, depth: number): void => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = join(at, entry.name);
      if (entry.isDirectory()) { if (depth < 6) walk(path, depth + 1); } else if (/\.check\.ya?ml$/.test(entry.name)) found.push(path);
    }
  };
  walk(root, 0);
  return found;
}

function stateRootFor(specPath: string, given: string | undefined): string {
  return given ? resolve(given) : projectRoot(dirname(specPath)) ?? dirname(specPath);
}

function lastReceipt(stateRoot: string, id: string): Receipt | null {
  const dir = join(stateRoot, RUNS_DIR, id);
  if (!existsSync(dir)) return null;
  const latest = readdirSync(dir).filter((name) => name.endsWith('.json')).sort().at(-1);
  if (!latest) return null;
  try { const receipt = JSON.parse(readFileSync(join(dir, latest), 'utf8')) as Receipt; return receipt.schemaVersion === RECEIPT_VERSION ? { ...receipt, path: join(dir, latest) } : null; } catch { return null; }
}

type Decision = { at: string; spec: string; kind: string | null; receiptHash: string; decision: 'accept' | 'reject'; reason: string; by: string | null; judgeNotMet: number | null; agreed: boolean | null };

function decisions(stateRoot: string): Decision[] {
  const file = join(stateRoot, DECISIONS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as Decision]; } catch { return []; } });
}

/** How far the judge has earned the right to block: only sign-offs on judged runs of the same kind count. */
export function judgeAuthority(stateRoot: string, kind: string | null): { decisions: number; agreement: number | null; gateEarned: boolean } {
  const counted = decisions(stateRoot).filter((d) => d.agreed !== null && d.kind === kind);
  const agreement = counted.length ? counted.filter((d) => d.agreed).length / counted.length : null;
  return { decisions: counted.length, agreement, gateEarned: counted.length >= GATE_MIN_DECISIONS && agreement !== null && agreement >= GATE_MIN_AGREEMENT };
}

/** A person's sign-off on the latest run. It is also the only thing that moves a judge from advice toward gate. */
export function recordDecision(specPath: string, decision: 'accept' | 'reject', options: { reason?: string | null; by?: string | null; stateRoot?: string; now?: Date } = {}): Decision {
  const { spec, path } = loadSpec(specPath);
  const stateRoot = stateRootFor(path, options.stateRoot);
  const receipt = lastReceipt(stateRoot, spec.id);
  if (!receipt) throw new Blocked([{ code: 'artifact_no_run', owner: 'agent', detail: `${spec.id} has no check run to sign off`, action: `run \`tracegrove artifact check ${specPath}\` first` }]);
  if (decision === 'reject' && !options.reason) throw new Blocked([{ code: 'artifact_reason_required', owner: 'operator', detail: 'a rejection needs a reason the maker can act on', action: 'pass --reason "<what is wrong>"' }]);
  const judged = receipt.promises.filter((p) => p.verdict !== 'not_judged');
  const notMet = judged.length ? judged.filter((p) => p.verdict === 'not_met').length : null;
  const row: Decision = { at: (options.now ?? new Date()).toISOString(), spec: spec.id, kind: spec.kind ?? null, receiptHash: receipt.receiptHash, decision, reason: options.reason ?? '', by: options.by ?? null,
    judgeNotMet: notMet, agreed: notMet === null ? null : (decision === 'accept') === (notMet === 0) };
  mkdirSync(join(stateRoot, '.tracegrove'), { recursive: true });
  appendFileSync(join(stateRoot, DECISIONS_FILE), `${JSON.stringify(row)}\n`);
  return row;
}

type Seed = { what: string; origin: 'automatic' | 'spec'; text: string; extraRecipients?: string[] } | { what: string; origin: 'automatic' | 'spec'; impossible: string };

/** The defects planted for one family. Each is the smallest change that the check exists to catch. */
async function seedsFor(family: CheckFamily, spec: ArtifactSpec, text: string, baseline: Finding[], sources: Sources): Promise<Seed[]> {
  const lines = text.split(/\r?\n/);
  const without = (index: number): string => lines.filter((_, i) => i !== index).join('\n');
  const seeds: Seed[] = [];
  const auto = 'automatic' as const;
  if (family === 'contract') {
    const field = spec.invariants.contract!.fields.find((name) => findField(lines, name));
    if (field) seeds.push({ what: `removed "${field}"`, origin: auto, text: without(findField(lines, field)!.line - 1) });
    else seeds.push({ what: 'remove a stated field', origin: auto, impossible: 'no declared field is stated yet, so there is nothing to remove' });
  }
  if (family === 'forbid') for (const rule of spec.invariants.forbid!) {
    const sample = rule.example ?? (plain(rule.pattern) ? rule.pattern : null);
    seeds.push(sample === null
      ? { what: `add text matching ${rule.pattern}`, origin: auto, impossible: `give this rule an \`example\` so the check can be shown to fail (${rule.pattern})` }
      : { what: `added "${sample}"`, origin: auto, text: `${text}\n\n${sample}\n` });
  }
  if (family === 'audience') for (const ref of spec.invariants.audience!.noneIn) {
    const list = await sources.get(ref);
    const first = list.ok ? parseList(list.text)[0] : undefined;
    seeds.push(first === undefined
      ? { what: `add a recipient from ${ref}`, origin: auto, impossible: `${ref} is empty or unreadable, so nobody from it can be planted` }
      : { what: `added a recipient who is in ${ref}`, origin: auto, text, extraRecipients: [first] });
  }
  if (family === 'numbers') for (const rule of spec.invariants.numbers!) {
    const pattern = new RegExp(rule.find, 'id');
    const at = lines.findIndex((line) => pattern.test(line));
    const match = at < 0 ? null : pattern.exec(lines[at]!);
    const span = match?.indices?.[1];
    const passed = baseline.find((f) => f.subject === rule.id)?.status === 'pass';
    if (!match || !span || !passed) { seeds.push({ what: `change ${rule.id}`, origin: auto, impossible: `${rule.id} does not match its source yet, so a wrong value cannot be told from the real one` }); continue; }
    const wrong = `${Math.round((Number(match[1]!.replace(/[^\d.-]/g, '')) || 0) + rule.tolerance + 1)}`;
    const line = lines[at]!;
    seeds.push({ what: `changed ${rule.id} from ${match[1]} to ${wrong}`, origin: auto, text: lines.map((l, i) => i === at ? `${line.slice(0, span[0])}${wrong}${line.slice(span[1])}` : l).join('\n') });
  }
  if (family === 'claims') {
    const artifact = parseArtifact(text, spec.invariants.claims!.minQuoteLength);
    const verified = artifact.quotes.find((quote) => baseline.some((f) => f.status === 'pass' && f.line === quote.line && f.source !== null));
    if (verified) seeds.push({ what: 'changed the wording of a verified quote', origin: auto, text: text.replace(verified.text, `${verified.text.split(' ').slice(0, 2).join(' ')} (words the source never said) ${verified.text.split(' ').slice(2).join(' ')}`) });
    seeds.push({ what: 'added a quote with no source', origin: auto, text: `${text}\n\n"A quotation planted by the check that no source contains."\n` });
  }
  if (family === 'links') {
    const rule = spec.invariants.links!;
    const url = rule.resolve || rule.requireParams.length ? DEAD_LINK : 'https://[seeded';
    seeds.push({ what: rule.resolve ? 'added a link to a page that is gone' : rule.requireParams.length ? `added a link without ${rule.requireParams.join(', ')}` : 'added a malformed link', origin: auto, text: `${text}\n\n[planted](${url})\n` });
  }
  for (const defect of spec.seededDefects.filter((d) => d.check === family)) {
    if (defect.addRecipient !== undefined) seeds.push({ what: `added recipient ${defect.addRecipient}`, origin: 'spec', text, extraRecipients: [defect.addRecipient] });
    else if (!text.includes(defect.replace!.find)) seeds.push({ what: `replace "${defect.replace!.find.slice(0, 60)}"`, origin: 'spec', impossible: 'the text to replace is no longer in the artifact; update this seeded defect' });
    else seeds.push({ what: `replaced "${defect.replace!.find.slice(0, 60)}"`, origin: 'spec', text: text.replace(defect.replace!.find, defect.replace!.with) });
  }
  return seeds;
}

function buildPromisePrompt(spec: ArtifactSpec, promises: string[], lines: string[]): string {
  return [
    'You are checking one piece of work against the promises its brief made. The piece is not code.',
    'Judge only from the numbered lines below. Do not assume anything that is not in them, and do not reward polish.',
    '',
    `Piece: ${spec.title ?? spec.id}${spec.kind ? ` (${spec.kind})` : ''}`,
    '',
    'Promises:',
    ...promises.map((item, i) => `${i + 1}. ${item}`),
    '',
    'The piece:',
    ...lines.map((line, i) => `${i + 1}: ${line}`),
    '',
    'For every promise answer "met", "not_met" or "unclear", cite the line numbers that show it, and say why in one sentence a maker could act on.',
    'Use "unclear" when the lines do not show it either way. "met" and "not_met" must cite at least one line.',
    'Reply with JSON only, no prose: {"items":[{"item":<promise number>,"verdict":"met|not_met|unclear","lines":[<numbers>],"why":"..."}]}',
  ].join('\n');
}

export async function runArtifactCheck(specPath: string, options: RunOptions = {}): Promise<Receipt> {
  const { spec, raw, path } = loadSpec(specPath);
  const now = options.now ?? new Date();
  const stateRoot = stateRootFor(path, options.stateRoot);
  const base = options.fetcher ?? defaultFetcher(dirname(path));
  const fetcher: Fetcher = async (ref) => ref === DEAD_LINK ? { ok: false, why: 'planted dead link', status: 404 } : base(ref);

  const got = await fetcher(spec.artifact);
  if (!got.ok) throw new Blocked([{ code: 'artifact_unreadable', owner: 'agent', detail: `${spec.artifact}: ${got.why}`, action: 'check the `artifact` path or URL in the spec' }]);
  const specHash = sha256(raw);
  const previous = lastReceipt(stateRoot, spec.id);
  // A piece that shipped once is not checked again, unless that verdict leaned on an exclusion that has since run out.
  const day = today(now);
  if (spec.afterlife === 'once' && options.rerun !== true && previous && previous.verdict === 'ready' && previous.artifact.sha256 === got.sha256 && previous.spec.sha256 === specHash
    && spec.exclusions.every((e) => e.expires >= day)) return { ...previous, reused: true };

  const sources = new Sources(fetcher);
  const artifactDir = isUrl(spec.artifact) ? null : posix.dirname(spec.artifact.replace(/\\/g, '/'));
  const localLink = (link: string): string | null => {
    if (!link || link.startsWith('#')) return null;
    if (isUrl(spec.artifact)) { try { return new URL(link, spec.artifact).href; } catch { return null; } }
    return isAbsolute(link) ? null : posix.normalize(posix.join(artifactDir ?? '.', link));
  };
  const env: CheckEnv = { sources, localLink };

  const families = familiesIn(spec);
  const raws = new Map<CheckFamily, Finding[]>();
  for (const family of families) raws.set(family, await runFamily(family, spec, got.text, env));

  const proofs: Proof[] = [];
  if (options.prove !== false) for (const family of families) {
    const baseline = raws.get(family)!;
    const known = new Set(baseline.map(key));
    const defects: Proof['defects'] = []; const notes: string[] = [];
    for (const seed of await seedsFor(family, spec, got.text, baseline, sources)) {
      if ('impossible' in seed) { defects.push({ what: seed.what, caught: false, origin: seed.origin }); notes.push(seed.impossible); continue; }
      const after = await runFamily(family, spec, seed.text, { ...env, ...(seed.extraRecipients ? { extraRecipients: seed.extraRecipients } : {}) });
      const caught = after.some((f) => (f.status === 'fail' || f.status === 'unproven') && !known.has(key(f)));
      defects.push({ what: seed.what, caught, origin: seed.origin });
      if (!caught) notes.push(`the check did not notice: ${seed.what}`);
    }
    proofs.push({ check: family, proven: defects.length > 0 && defects.every((d) => d.caught), defects, note: notes.length ? notes.join('; ') : null });
  }

  const exclusions = spec.exclusions.map((exclusion) => ({ ...exclusion, state: exclusion.expires >= day ? 'active' as const : 'expired' as const, applied: 0 }));
  const findings = families.flatMap((family) => raws.get(family)!).map((finding): Finding => {
    if (finding.status === 'pass') return finding;
    const hit = exclusions.find((e) => e.state === 'active' && e.check === finding.check && (e.match === undefined || finding.subject.includes(e.match)));
    if (!hit) return finding;
    hit.applied++;
    return { ...finding, status: 'excluded', excluded: { was: finding.status as Exclude<Finding['status'], 'excluded'>, reason: hit.reason, owner: hit.owner, expires: hit.expires } };
  });

  const authority = judgeAuthority(stateRoot, spec.kind ?? null);
  let promises: PromiseResult[] = spec.promises.map((p) => ({ text: p.text, authority: p.authority === 'gate' && authority.gateEarned ? 'gate' : 'advice', verdict: 'not_judged', lines: [], why: '' }));
  if (options.ask && spec.promises.length) {
    const lines = got.text.split(/\r?\n/).slice(0, 1500).map((line) => line.slice(0, 600));
    const rubric = spec.promises.map((p) => p.text);
    const items = parseJudgeAnswer(await options.ask(buildPromisePrompt(spec, rubric, lines)), rubric, lines.length);
    promises = promises.map((p, i) => ({ ...p, verdict: items[i]?.verdict ?? 'unclear', lines: items[i]?.lines ?? [], why: items[i]?.why ?? '' }));
  }

  const blocking = (status: Finding['status']): Finding[] => findings.filter((f) => f.status === status && f.severity === 'block');
  const reasons: string[] = [];
  const failed = blocking('fail'); const gated = promises.filter((p) => p.authority === 'gate' && p.verdict === 'not_met');
  const blockedOn = blocking('blocked'); const unproven = blocking('unproven');
  const unprovenChecks = options.prove === false ? families : proofs.filter((p) => !p.proven).map((p) => p.check);
  let verdict: Verdict = 'ready';
  if (failed.length || gated.length) {
    verdict = 'fix';
    if (failed.length) reasons.push(`${failed.length} check${failed.length === 1 ? '' : 's'} failed`);
    if (gated.length) reasons.push(`${gated.length} promise${gated.length === 1 ? '' : 's'} not met, judged by a judge that has earned the right to block`);
  } else if (blockedOn.length) {
    verdict = 'blocked'; reasons.push(`${blockedOn.length} thing${blockedOn.length === 1 ? '' : 's'} could not be read`);
  } else {
    if (unproven.length > spec.shipRule.maxUnproven) reasons.push(`${unproven.length} claim${unproven.length === 1 ? '' : 's'} with nothing to check ${unproven.length === 1 ? 'it' : 'them'} against (allowed: ${spec.shipRule.maxUnproven})`);
    if (spec.shipRule.requireProvenChecks && unprovenChecks.length) reasons.push(options.prove === false ? 'the checks were not shown to fail on a planted defect (--no-prove)' : `not shown to fail on a planted defect: ${unprovenChecks.join(', ')}`);
    if (reasons.length && options.allowUnproven !== true) verdict = 'unproven';
    else if (reasons.length) reasons.push('accepted with --allow-unproven');
  }
  for (const e of exclusions) if (e.state === 'expired') reasons.push(`the exclusion on ${e.check}${e.match ? ` ("${e.match}")` : ''} expired on ${e.expires}, so that check counts again`);
  if (spec.afterlife === 'hypothesis' && spec.reviewDate && spec.reviewDate <= day) reasons.push(`the review date ${spec.reviewDate} has arrived: check what this piece predicted against what happened`);

  const order = { block: 0, warn: 1, note: 2 } as const;
  const fixList: Receipt['fixList'] = findings.filter((f) => (f.status === 'fail' || f.status === 'unproven') && f.fix).sort((a, b) => order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0))
    .map((f): Receipt['fixList'][number] => ({ check: f.check, line: f.line, do: f.fix!, why: f.detail }))
    .concat(promises.filter((p) => p.verdict === 'not_met').map((p) => ({ check: p.authority === 'gate' ? 'promise' : 'promise (advice)', line: p.lines[0] ?? null, do: `meet the promise: ${p.text}`, why: p.why })));

  const counts = { pass: 0, fail: 0, unproven: 0, blocked: 0, excluded: 0 };
  for (const f of findings) counts[f.status]++;
  const body = {
    schemaVersion: RECEIPT_VERSION, at: now.toISOString(),
    spec: { id: spec.id, path: relative(stateRoot, path).replace(/\\/g, '/'), sha256: specHash, title: spec.title ?? null, kind: spec.kind ?? null },
    artifact: { ref: spec.artifact, sha256: got.sha256, bytes: got.bytes },
    afterlife: spec.afterlife, reviewDate: spec.reviewDate ?? null,
    verdict, exitCode: EXIT[verdict], reasons, counts, findings, proofs, promises,
    judge: { asked: options.ask !== undefined && spec.promises.length > 0, ...authority },
    exclusions, sources: (await sources.record()).filter((s) => s.ref !== DEAD_LINK), fixList,
    previous: previous?.receiptHash ?? null,
  } as const;
  const receiptHash = sha256(JSON.stringify(body));
  let written: string | null = null;
  if (options.write !== false) {
    const dir = join(stateRoot, RUNS_DIR, spec.id);
    mkdirSync(dir, { recursive: true });
    written = join(dir, `${now.toISOString().replace(/[:.]/g, '-')}-${receiptHash.slice(0, 8)}.json`);
    writeFileSync(written, `${JSON.stringify({ ...body, receiptHash, reused: false }, null, 2)}\n`);
  }
  return { ...body, receiptHash, reused: false, path: written };
}

const MARK: Record<Finding['status'], string> = { pass: 'ok      ', fail: 'FAIL    ', unproven: 'unproven', blocked: 'blocked ', excluded: 'excluded' };

/** The run as a person reads it: verdict first, then only what needs attention, then the fix list. */
export function renderReceipt(receipt: Receipt): string {
  const out: string[] = [];
  const name = receipt.spec.title ?? receipt.spec.id;
  out.push(`${receipt.verdict.toUpperCase()}  ${name}${receipt.reused ? '  (shipped once and unchanged: not checked again)' : ''}`);
  for (const reason of receipt.reasons) out.push(`  ${reason}`);
  out.push(`  ${receipt.artifact.ref}  sha256 ${receipt.artifact.sha256.slice(0, 12)}  ${receipt.counts.pass} ok, ${receipt.counts.fail} failed, ${receipt.counts.unproven} unproven, ${receipt.counts.blocked} blocked, ${receipt.counts.excluded} excluded`);
  const attention = receipt.findings.filter((f) => f.status !== 'pass');
  if (attention.length) out.push('');
  for (const f of attention) {
    out.push(`  ${MARK[f.status]} ${f.check}${f.line ? ` line ${f.line}` : ''}: ${f.detail}${f.severity === 'block' ? '' : ` (${f.severity})`}`);
    if (f.excluded) out.push(`             set aside by ${f.excluded.owner} until ${f.excluded.expires}: ${f.excluded.reason}`);
  }
  if (receipt.proofs.length) {
    out.push('', '  Can each check fail?');
    for (const p of receipt.proofs) out.push(`  ${p.proven ? 'yes' : 'NO '}  ${p.check}: ${p.defects.filter((d) => d.caught).length} of ${p.defects.length} planted defects caught${p.note ? `. ${p.note}` : ''}`);
  }
  if (receipt.promises.length) {
    out.push('', receipt.judge.asked ? `  Promises (judge: ${receipt.judge.gateEarned ? 'may block' : `advice only, ${receipt.judge.decisions} of ${GATE_MIN_DECISIONS} sign-offs`})` : '  Promises (not judged; pass --judge)');
    for (const p of receipt.promises) out.push(`  ${p.verdict.padEnd(10)} ${p.text}${p.lines.length ? ` [lines ${p.lines.join(', ')}]` : ''}${p.why ? `: ${p.why}` : ''}`);
  }
  if (receipt.fixList.length) {
    out.push('', '  Fix list');
    receipt.fixList.forEach((fix, i) => out.push(`  ${i + 1}. ${fix.line ? `line ${fix.line}: ` : ''}${fix.do}`));
  }
  if (receipt.path) out.push('', `  receipt ${receipt.path}`);
  return out.join('\n');
}
