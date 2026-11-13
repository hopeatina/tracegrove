/**
 * Several pieces released together: a campaign's email, landing page, ad image and video. Each piece
 * keeps its own spec and its own verdict. The set adds what no single piece can show: that a value
 * (a price, a date, a code, a link) is the same wherever it appears, and that the pieces do together
 * what the brief asked. The set is ready only when every member is.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Blocked } from '../core/errors.ts';
import { parseJudgeAnswer } from '../authoring/judge.ts';
import { projectRoot } from '../authoring/status.ts';
import { ArtifactSet } from './spec.ts';
import { defaultFetcher, normalize, parseNumber, sha256 } from './read.ts';
import { EXIT, describeMedia, loadSpec, readPiece, runArtifactCheck, type Piece, type PromiseResult, type Receipt, type RunOptions, type Verdict } from './run.ts';

export const SET_RECEIPT_VERSION = 'tracegrove.artifact-set-receipt/v1' as const;

export type AgreeResult = {
  id: string; status: 'pass' | 'fail' | 'unproven'; severity: 'block' | 'warn' | 'note'; detail: string;
  /** What each member says, with the line it says it on. */
  says: Array<{ member: string; value: string; line: number }>;
  /** Whether the check noticed when one member's value was changed. */
  proven: boolean;
};
export type SetReceipt = {
  schemaVersion: typeof SET_RECEIPT_VERSION;
  at: string;
  set: { id: string; path: string; sha256: string; title: string | null; kind: string | null };
  verdict: Verdict; exitCode: number; reasons: string[];
  members: Array<{ id: string; title: string | null; spec: string; artifact: string; sha256: string | null; verdict: Verdict | 'blocked'; receiptHash: string | null; what: string; problem: string | null }>;
  agree: AgreeResult[];
  promises: PromiseResult[];
  fixList: Array<{ member: string | null; do: string; why: string }>;
  receipts: Receipt[];
  /** Why the promises about the whole were not judged, when they were not. */
  promisesNote: string | null;
  receiptHash: string;
  path: string | null;
};

export function isSetSpec(path: string): boolean {
  try { return (parseYaml(readFileSync(path, 'utf8')) as { schemaVersion?: unknown } | null)?.schemaVersion === 'tracegrove.artifact-set/v1'; } catch { return false; }
}

export function loadSet(path: string): { set: ArtifactSet; raw: string; path: string } {
  const file = resolve(path);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Blocked([{ code: 'artifact_spec_missing', owner: 'agent', detail: `no set at ${path}`, action: 'pass the path to the set file' }]);
  const raw = readFileSync(file, 'utf8');
  let data: unknown;
  try { data = parseYaml(raw); } catch (error) { throw new Blocked([{ code: 'artifact_spec_invalid', owner: 'agent', detail: `${path}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400), action: 'fix the YAML' }]); }
  const parsed = ArtifactSet.safeParse(data);
  if (!parsed.success) throw new Blocked([{ code: 'artifact_spec_invalid', owner: 'agent', detail: `${path}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'set'}: ${i.message}`).join('; ')}`.slice(0, 500), action: 'fix the set; see docs/artifact-checks.md' }]);
  return { set: parsed.data, raw, path: file };
}

/** The spec files a set runs, so a folder run does not check them a second time on their own. */
export function setMembers(path: string): string[] {
  try { const { set, path: file } = loadSet(path); return set.members.map((member) => resolve(dirname(file), member)); } catch { return []; }
}

const same = (value: string): string => { const n = parseNumber(value); return n === null ? normalize(value) : String(n); };

type Text = { member: string; text: string | null };

/** What each member says for one rule, and whether they agree. */
function agreeOne(rule: ArtifactSet['agree'][number], texts: Text[]): Omit<AgreeResult, 'proven'> {
  const base = { id: rule.id, severity: rule.severity };
  const says: AgreeResult['says'] = []; const unread: string[] = [];
  for (const { member, text } of texts.filter((t) => rule.in === undefined || rule.in.includes(t.member))) {
    if (text === null) { unread.push(member); continue; }
    text.split(/\r?\n/).forEach((line, index) => { for (const match of line.matchAll(new RegExp(rule.find, 'gi'))) if (match[1] !== undefined) says.push({ member, value: match[1].trim(), line: index + 1 }); });
  }
  const unknown = (rule.in ?? []).filter((member) => !texts.some((t) => t.member === member));
  if (unknown.length) return { ...base, status: 'fail', says, detail: `not a member of this set: ${unknown.join(', ')}` };
  const values = [...new Set(says.map((s) => same(s.value)))];
  if (values.length > 1) {
    const by = values.map((value) => `${says.find((s) => same(s.value) === value)!.value} (${[...new Set(says.filter((s) => same(s.value) === value).map((s) => s.member))].join(', ')})`);
    return { ...base, status: 'fail', says, detail: `the pieces disagree: ${by.join(' but ')}` };
  }
  const stating = new Set(says.map((s) => s.member));
  const silent = (rule.in ?? []).filter((member) => !stating.has(member) && !unread.includes(member));
  if (silent.length) return { ...base, status: 'fail', says, detail: `${silent.join(', ')} ${silent.length === 1 ? 'does' : 'do'} not state it` };
  if (unread.length) return { ...base, status: 'unproven', says, detail: `the words in ${unread.join(', ')} have not been read (pass --judge, or give ${unread.length === 1 ? 'it' : 'them'} a transcript)` };
  if (stating.size < 2) return { ...base, status: 'unproven', says, detail: stating.size === 0 ? 'no piece states it, so there is nothing to compare' : `only ${[...stating][0]} states it, so there is nothing to compare it with` };
  return { ...base, status: 'pass', says, detail: `${says[0]!.value} in ${[...stating].join(', ')}` };
}

function agree(rule: ArtifactSet['agree'][number], texts: Text[]): AgreeResult {
  const result = agreeOne(rule, texts);
  // Plant the defect this check exists to catch: one member says something else.
  const first = result.says[0];
  let proven = false;
  if (result.status === 'pass' && first) {
    const planted = texts.map((t) => t.member !== first.member || t.text === null ? t : { member: t.member, text: t.text.split(/\r?\n/).map((line, index) => index === first.line - 1 ? line.replace(first.value, /\d/.test(first.value) ? first.value.replace(/\d/g, (d) => String((Number(d) + 1) % 10)) : `${first.value} (changed)`) : line).join('\n') });
    proven = agreeOne(rule, planted).status === 'fail';
  }
  return { ...result, proven };
}

function buildSetPrompt(title: string, promises: string[], lines: string[], pictures: boolean): string {
  return [
    'You are checking several pieces of work that will be released together against what their brief asked of them as a whole. They are not code.',
    pictures ? 'Some pieces are images or video stills, attached. Look at them before answering. You cannot hear a video.' : '',
    'Judge only from the numbered lines below and what you can see in the attached files. Do not assume anything that is not there, and do not reward polish.',
    '',
    `Set: ${title}`,
    '',
    'Promises:',
    ...promises.map((item, i) => `${i + 1}. ${item}`),
    '',
    'The pieces. A line starting with "== " opens a piece; cite that line for anything you can see in its picture that is not written in words.',
    ...lines.map((line, i) => `${i + 1}: ${line}`),
    '',
    'For every promise answer "met", "not_met" or "unclear", cite the line numbers that show it, and say why in one sentence a maker could act on, naming the piece.',
    'Use "unclear" when you cannot tell either way. "met" and "not_met" must cite at least one line.',
    'Reply with JSON only, no prose: {"items":[{"item":<promise number>,"verdict":"met|not_met|unclear","lines":[<numbers>],"why":"..."}]}',
  ].filter((line, i) => line !== '' || i > 1).join('\n');
}

const WORST: Verdict[] = ['fix', 'blocked', 'unproven', 'ready'];

export async function runArtifactSet(setPath: string, options: RunOptions = {}): Promise<SetReceipt> {
  const { set, raw, path } = loadSet(setPath);
  const now = options.now ?? new Date();
  const stateRoot = options.stateRoot ? resolve(options.stateRoot) : projectRoot(dirname(path)) ?? dirname(path);
  const receipts: Receipt[] = []; const members: SetReceipt['members'] = []; const pieces: Array<{ id: string; piece: Piece | null }> = [];
  const { artifact: _handedOver, ...memberOptions } = options;
  for (const ref of set.members) {
    const specPath = resolve(dirname(path), ref);
    const shown = relative(dirname(path), specPath).replace(/\\/g, '/');
    try {
      const { spec } = loadSpec(specPath);
      const receipt = await runArtifactCheck(specPath, { ...memberOptions, stateRoot });
      const piece = await readPiece(spec, specPath, options.fetcher ?? defaultFetcher(dirname(specPath)), memberOptions, stateRoot);
      receipts.push(receipt); pieces.push({ id: spec.id, piece });
      members.push({ id: spec.id, title: spec.title ?? null, spec: shown, artifact: receipt.artifact.ref, sha256: receipt.artifact.sha256, verdict: receipt.verdict, receiptHash: receipt.receiptHash, what: piece.media ? describeMedia(piece.media) : 'text', problem: null });
    } catch (error) {
      if (!(error instanceof Blocked)) throw error;
      const id = shown.replace(/\.check\.ya?ml$/, '');
      pieces.push({ id, piece: null });
      members.push({ id, title: null, spec: shown, artifact: '', sha256: null, verdict: 'blocked', receiptHash: null, what: 'not read', problem: error.reasons.map((b) => `${b.code}: ${b.detail}`).join('; ').slice(0, 400) });
    }
  }
  const ids = members.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new Blocked([{ code: 'artifact_spec_invalid', owner: 'agent', detail: `${setPath}: two members share an id (${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')})`, action: 'give each member spec its own id' }]);

  const texts: Text[] = pieces.map(({ id, piece }) => ({ member: id, text: piece?.text ?? null }));
  const agreed = set.agree.map((rule) => agree(rule, texts));

  let promises: PromiseResult[] = set.promises.map((p) => ({ text: p.text, authority: 'advice', verdict: 'not_judged', lines: [], why: '' }));
  const files = pieces.flatMap(({ piece }) => piece?.files ?? []).slice(0, 20);
  const readAll = pieces.every(({ piece }) => piece !== null && (piece.media === null || piece.files.length > 0));
  const canJudge = files.length ? options.look !== undefined : options.ask !== undefined;
  const notShown = pieces.filter(({ piece }) => piece === null || (piece.media !== null && piece.files.length === 0)).map(({ id }) => id);
  if (set.promises.length && canJudge && readAll) {
    const lines = pieces.flatMap(({ id, piece }) => [`== ${id}${piece!.media ? ` (${piece!.media.kind}: ${describeMedia(piece!.media)}; file ${piece!.files.map((f) => f.split('/').pop()).join(', ')})` : ' (text)'}`, ...(piece!.text ?? '').split(/\r?\n/).slice(0, 400).map((line) => line.slice(0, 400))]);
    const rubric = set.promises.map((p) => p.text);
    const prompt = buildSetPrompt(set.title ?? set.id, rubric, lines, files.length > 0);
    const items = parseJudgeAnswer(files.length ? await options.look!(prompt, files) : await options.ask!(prompt), rubric, lines.length);
    promises = promises.map((p, i) => ({ ...p, verdict: items[i]?.verdict ?? 'unclear', lines: items[i]?.lines ?? [], why: items[i]?.why ?? '' }));
  }

  const notJudgedWhy = !canJudge ? 'pass --judge' : `${notShown.join(', ')} could not be shown to the judge: a video needs ffmpeg for stills, an SVG or page needs a browser`;
  const reasons: string[] = [];
  const memberWorst = WORST.find((verdict) => members.some((m) => m.verdict === verdict)) ?? 'ready';
  const blocking = (status: AgreeResult['status']): AgreeResult[] => agreed.filter((a) => a.status === status && a.severity === 'block');
  let verdict: Verdict = memberWorst;
  for (const verdictName of ['fix', 'blocked', 'unproven'] as const) { const which = members.filter((m) => m.verdict === verdictName); if (which.length) reasons.push(`${which.map((m) => m.id).join(', ')}: ${verdictName === 'fix' ? 'needs fixing' : verdictName}`); }
  if (blocking('fail').length) { verdict = 'fix'; reasons.push(`${blocking('fail').length} value${blocking('fail').length === 1 ? '' : 's'} the pieces do not agree on`); }
  else if (verdict === 'ready') {
    const loose = blocking('unproven'); const unshown = agreed.filter((a) => a.status === 'pass' && !a.proven && a.severity === 'block');
    if (loose.length) reasons.push(`${loose.length} value${loose.length === 1 ? '' : 's'} that could not be compared: ${loose.map((a) => a.id).join(', ')}`);
    if (unshown.length) reasons.push(`not shown to fail when one piece is changed: ${unshown.map((a) => a.id).join(', ')}`);
    // The set's own promises are its only view of the whole. As with one piece, a judge's doubt is not a pass when no check compared anything.
    const judged = promises.length > 0 && promises.every((p) => p.verdict !== 'not_judged');
    if (!agreed.some((a) => a.status === 'pass') && promises.length && !(judged && promises.every((p) => p.verdict === 'met')))
      reasons.push(judged ? `nothing compares the pieces, and the judge did not find every promise met (${promises.filter((p) => p.verdict !== 'met').length} of ${promises.length} not met or unclear)`
        : `nothing compares the pieces, and the promises about the whole were not judged (${notJudgedWhy})`);
    if (reasons.length) { if (options.allowUnproven === true) reasons.push('accepted with --allow-unproven'); else verdict = 'unproven'; }
  }

  const fixList: SetReceipt['fixList'] = [
    ...agreed.filter((a) => a.status === 'fail').map((a) => ({ member: null, do: `make ${a.id} the same everywhere`, why: a.detail })),
    ...receipts.flatMap((r) => r.fixList.map((fix) => ({ member: r.spec.id, do: `${fix.line ? `line ${fix.line}: ` : ''}${fix.do}`, why: fix.why }))),
    ...promises.filter((p) => p.verdict === 'not_met').map((p) => ({ member: null, do: `meet the promise: ${p.text}`, why: p.why })),
  ];
  const body = { schemaVersion: SET_RECEIPT_VERSION, at: now.toISOString(), set: { id: set.id, path: relative(stateRoot, path).replace(/\\/g, '/'), sha256: sha256(raw), title: set.title ?? null, kind: set.kind ?? null },
    verdict, exitCode: EXIT[verdict], reasons, members, agree: agreed, promises, fixList } as const;
  const receiptHash = sha256(JSON.stringify(body));
  let written: string | null = null;
  if (options.write !== false) {
    const dir = join(stateRoot, '.tracegrove', 'artifact-runs', set.id);
    mkdirSync(dir, { recursive: true });
    written = join(dir, `${now.toISOString().replace(/[:.]/g, '-')}-${receiptHash.slice(0, 8)}.json`);
    writeFileSync(written, `${JSON.stringify({ ...body, receiptHash }, null, 2)}\n`);
  }
  return { ...body, receipts, receiptHash, path: written, promisesNote: set.promises.length && promises.every((p) => p.verdict === 'not_judged') ? notJudgedWhy : null };
}

export function renderSet(receipt: SetReceipt): string {
  const out = [`${receipt.verdict.toUpperCase()}  ${receipt.set.title ?? receipt.set.id}  (${receipt.members.length} pieces)`];
  for (const reason of receipt.reasons) out.push(`  ${reason}`);
  out.push('');
  for (const m of receipt.members) out.push(`  ${m.verdict.toUpperCase().padEnd(9)} ${m.id}  ${m.what}${m.problem ? `  ${m.problem}` : ''}`);
  if (receipt.agree.length) {
    out.push('', '  Do the pieces agree?');
    for (const a of receipt.agree) out.push(`  ${a.status === 'pass' ? (a.proven ? 'yes     ' : 'yes?    ') : a.status === 'fail' ? 'NO      ' : 'unproven'} ${a.id}: ${a.detail}${a.status === 'pass' && !a.proven ? ' (the check did not notice a planted change)' : ''}`);
  }
  if (receipt.promises.length) {
    out.push('', receipt.promises.some((p) => p.verdict !== 'not_judged') ? '  Promises about the whole (judge: advice only)' : `  Promises about the whole (not judged: ${receipt.promisesNote ?? 'pass --judge'})`);
    for (const p of receipt.promises) out.push(`  ${p.verdict.padEnd(10)} ${p.text}${p.why ? `: ${p.why}` : ''}`);
  }
  if (receipt.fixList.length) {
    out.push('', '  Fix list');
    receipt.fixList.slice(0, 30).forEach((fix, i) => out.push(`  ${i + 1}. ${fix.member ? `${fix.member}: ` : ''}${fix.do}`));
  }
  if (receipt.path) out.push('', `  receipt ${receipt.path}`);
  return out.join('\n');
}
