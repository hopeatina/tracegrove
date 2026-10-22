/**
 * What happened in one scenario's run, for the grow page's drawer: its steps as the Run tab reads them (StepReport), the sentence
 * that says how it broke, the chips that say what was real, what was not recorded, and whether it ever passed. Everything is read
 * from the run's verified bundle and the runs saved beside it; nothing is guessed, and what was not recorded is said so.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { STATE_DIR, loadAuthoringConfig, snake } from './compile.ts';
import { MAX_SOURCE_FILES, defaultSourceGlobs, sourcesAmong } from './sources.ts';
import type { VerificationSourceBinding } from './sourceSelection.ts';
import { identityFromEntries } from '../hosts/sourceIdentity.ts';
import { HostPlan, refKey, sha256Hex } from '../protocol/index.ts';
import { countNoun } from './checkCompare.ts';
import { readSavedRun, type CheckedRunReport } from './runSource.ts';
import { SavedRunName, type CaseReport, type StepReport } from './runReport.ts';
import { isRunDirectory, savedRunDirectory } from './runLocation.ts';
import { couldNotRun } from './growState.ts';
import { readVerifiedBundle } from '../core/bundle.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { cellBundleName } from '../core/bundlePaths.ts';
import { digestOfBytes } from '../protocol/index.ts';

export type HappenedChip = { t: string; tone: 'ok' | 'bad' | 'standin' | 'none' | '' };
export type Happened = {
  run: string; verified: boolean; source: string | null; startedAt: string; caseId: string; title: string; outcome: string; ms: number;
  /** the case's steps as the Run tab reads them, each with the name its flow declares */
  steps: StepReport[];
  /** the step the drawer opens on, counted from 0: the one that broke, else the first */
  at: number;
  /** the step whose answer the run's own records contradict, counted from 0, and with what */
  contradicts: { at: number; field: string | null } | null;
  oneLine: string; chips: HappenedChip[];
  /** what the run did not record, in plain sentences */
  foot: string[];
  /** the saved runs beside this one that ran the flow: how many, how many passed and failed a check, the newest that passed */
  history: { saved: number; passed: number; failed: number; lastPass: string | null };
  /** those saved runs that ended with no result from their checks: never reached them (blocked, or the app did not start),
   *  cancelled, or inconclusive */
  unfinished: { notReached: number; cancelled: number; inconclusive: number };
  /** those saved runs made on the base branch's source, when a base was named: a snapshot of its commit, or a working tree whose
   *  source digest is the one its commit's files make; how many, and how they went */
  base: { branch: string; runs: number; passed: number; failed: number; notReached: number } | null;
  /** whether the flow held before, in one sentence from the counts above; null when no saved run ran it */
  historyLine: string | null;
};

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** "a 900 charge", "an 800 charge": the article a number takes when it is said aloud. */
const article = (n: number) => (/^8/.test(String(n)) || /^1[18](\d{3})*$/.test(String(n)) ? 'an' : 'a');
const listed = (xs: string[], and = 'and') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);

/** A step's name as its flow declares it ("owner moves to Team"), which the run's summary.json kept, when it is the name the
 *  step's sealed id was made from; else the name the sealed id gives. */
function declaredNames(runDir: string, caseId: string): Map<string, string> {
  try {
    const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8')) as { cases?: Array<{ caseId?: unknown; steps?: Array<{ id?: unknown; name?: unknown }> }> };
    const steps = summary.cases?.find((c) => c.caseId === caseId)?.steps ?? [];
    return new Map(steps.flatMap((x) => typeof x.id === 'string' && typeof x.name === 'string' && snake(x.name) === x.id ? [[x.id, x.name] as [string, string]] : []));
  } catch { return new Map(); }
}

const bad = (x: StepReport) => x.result === 'failed' || x.result === 'cancelled' || (x.checks === 'fail' && x.result === 'completed');

/**
 * The step a failed stand-in count says the app got wrong, from the calls the watch step recorded: the first call past the count
 * it expected, on the step whose recorded start and finish hold that call's timestamp. When that step's answer has a field named
 * for what was counted ("charged" for charges) that says none happened (0, false or null), the run contradicts the answer.
 */
function extraCall(steps: StepReport[], failing: StepReport) {
  const c = failing.compared;
  if (!c || !/ call count$/.test(c.check) || typeof c.expected !== 'number' || typeof c.got !== 'number' || c.got <= c.expected) return null;
  const calls = [...(failing.calls ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const call = calls[c.expected];
  const at = call?.during ? steps.findIndex((x) => x.id === call.during) : -1;
  if (!call || at < 0) return null;
  const one = countNoun(c.check, 1);
  let field: string | null = null;
  try {
    const answer = steps[at]!.answer ? JSON.parse(steps[at]!.answer!) as unknown : null;
    const stem = one.length >= 4 && one !== 'call' ? one.replace(/e$/, '') : null;
    if (stem && answer && typeof answer === 'object' && !Array.isArray(answer)) {
      field = Object.entries(answer as Record<string, unknown>).find(([k, v]) => k.toLowerCase().startsWith(stem) && (v === 0 || v === false || v === null))?.[0] ?? null;
    }
  } catch { field = null; }
  return { call, at, field, one, nth: c.expected + 1, expected: c.expected, answer: steps[at]!.answer ?? null };
}

/**
 * Why a run never reached its checks, as its host sealed it in the case's events: the app did not start, the run was blocked
 * before its first step, or a fixture could not be set up. These are the events run.ts reads into the summary's failure, which
 * grow says as why a scenario is not tested yet; they are read here only when they match the digest their receipt sealed.
 * Null when the events say none of these.
 */
function sealedCause(runDir: string, caseId: string): string | null {
  try {
    const bundle = readVerifiedBundle(join(runDir, 'bundle'));
    const receipt = bundle.receipts.find((x) => x.caseRef.id === caseId);
    if (!receipt) return null;
    const bytes = readBoundedFile(join(runDir, 'bundle', 'cells', cellBundleName(receipt.selectionCellId), 'events.jsonl'), 16 * 1024 * 1024);
    if (digestOfBytes(bytes).hex !== receipt.eventsDigest.hex) return null;
    type Said = { error?: string; reasons?: Array<{ code: string; detail: string }>; entityKey?: string; code?: string; message?: string };
    const events = bytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string; redactedPayload?: Said });
    const said = (kind: string) => { const e = events.find((x) => x.kind === kind); return e ? e.redactedPayload ?? {} : null; };
    const host = said('host.failed'), blocked = said('host.blocked'), fixture = said('fixture.failed');
    if (host) return `(app startup): ${host.error ?? 'host failed'}`;
    if (blocked?.reasons?.length) return `(before steps): ${blocked.reasons.map((r) => `${r.code}: ${r.detail}`).join('\n')}`;
    if (fixture) return `${`(fixture ${fixture.entityKey ?? ''})`.replace(' )', ')')}: ${fixture.code ?? 'fixture_failed'}: ${fixture.message ?? ''}`;
    return null;
  } catch { return null; }
}

/** One sentence for what broke, from the records: the answer a stand-in's calls contradict, or what the failing check expected
 *  and got, and the step that broke it; for a run that never reached its checks, why, as its host sealed it (never a reason
 *  code); or, for a run that held, how many checks held. */
function oneLineOf(c: CaseReport, steps: StepReport[], name: (x: StepReport) => string, cause: () => string | null): { line: string; contradicts: Happened['contradicts'] } {
  const i = steps.findIndex(bad);
  if (c.outcome === 'passed' || (i < 0 && !c.failure)) {
    const checks = steps.filter((x) => (x.checked ?? []).length).length, cmp = steps.reduce((a, x) => a + (x.checked ?? []).length, 0);
    const held = checks === 1 ? 'Its 1 check held' : `All ${checks} checks held`;
    return { line: `${held}${cmp > checks ? ` (${cmp} comparisons)` : ''}, in ${c.durationMs} ms.`, contradicts: null };
  }
  if (c.outcome === 'infrastructure_failed' || (steps.length > 0 && steps.every((x) => x.result === 'not_run'))) {
    return { line: `${couldNotRun(cause() ?? '')}.`.replace(/\.\.$/, '.'), contradicts: null };
  }
  if (i < 0) {
    const where = c.failure!.step.replace(/^\((.+)\)$/, '$1');
    return { line: `Broke at ${where}: ${c.failure!.message.split('\n')[0]}`.replace(/([^.!?])$/, '$1.'), contradicts: null };
  }
  const f = steps[i]!; const x = extraCall(steps, f);
  if (x) {
    // the step as its flow names it, in quotes, and its answer as the run recorded it
    const k = x.at + 1, step = `Step ${k} ("${name(steps[x.at]!)}")`;
    const what = x.call.amount !== null ? `${article(x.call.amount)} ${x.call.amount} ${x.one}` : `${/^[aeiou]/.test(x.one) ? 'an' : 'a'} ${x.one}`;
    const key = x.call.key && x.call.repeat === false ? ', under a new idempotency key' : '';
    if (x.field) return { line: `${step} answered ${cut(x.answer!, 120)}, yet ${x.call.standIn} received ${what} during step ${k}${key}.`, contradicts: { at: x.at, field: x.field } };
    return { line: `${x.call.standIn} received its ${ordinal(x.nth)} ${x.one}, one more than the ${x.expected} expected, during step ${k} ("${name(steps[x.at]!)}")${key}.`.replace(/^./, (m) => m.toUpperCase()), contradicts: null };
  }
  const said = (f.checked ?? []).find((q) => q.held === false)?.says;
  const answered = f.answer ? ` It answered ${cut(f.answer, 120)}.` : '';
  if (said) return { line: `${said}. Step ${i + 1} (${name(f)}) broke it.${answered}`, contradicts: null };
  const why = c.failure && (c.failure.step === f.name || c.failure.step === name(f) || c.failure.step === f.id) ? c.failure.message.split('\n')[0]! : f.reason ?? f.result;
  return { line: `Step ${i + 1} (${name(f)}) ${f.result === 'not_run' ? 'did not run' : 'failed'}: ${why}`.replace(/([^.!?])$/, '$1.'), contradicts: null };
}

/** Each service as recorded, real or a stand-in, and a stand-in whose calls no step recorded said so; never "all real". */
function chipsOf(r: CheckedRunReport, c: CaseReport, run: string): HappenedChip[] {
  const verified = r.evidenceStatus === 'verified';
  return [{ t: `run ${run}`, tone: '' }, { t: verified ? `verified · source ${r.sourceDigest.slice(0, 6) || 'not recorded'}` : 'not verified', tone: verified ? 'ok' : 'bad' },
    ...(c.services ?? []).map((s) => ({ t: s.mode === 'stand-in' && s.calls === 'not recorded' ? `${s.name} stand-in · calls not recorded` : `${s.name} ${s.mode}`,
      tone: (s.mode === 'real' ? '' : s.calls === 'not recorded' || s.mode === 'not recorded' ? 'none' : 'standin') as HappenedChip['tone'] }))];
}

/** What the run did not record, in plain sentences: a stand-in no step watched, a call outside every step, no screen. */
function footOf(c: CaseReport, steps: StepReport[]): string[] {
  const out: string[] = [];
  const unwatched = (c.services ?? []).filter((s) => s.calls === 'not recorded').map((s) => s.name);
  if (unwatched.length) out.push(`No step watched ${listed(unwatched, 'or')}, so ${unwatched.length === 1 ? 'its' : 'their'} calls are not recorded (only a watch step records a stand-in’s calls).`);
  // each call once: a watch step reads every call its stand-in has had so far, so two on one route hold the same call
  const loose = new Set(steps.flatMap((x) => x.calls ?? []).filter((q) => !q.during).map((q) => JSON.stringify([q.standIn, q.method, q.path, q.at, q.key]))).size;
  if (loose) out.push(`${loose} stand-in call${loose === 1 ? '' : 's'} came outside every step’s recorded time.`);
  const screen = steps.some((x) => x.method === 'UI'), talk = steps.some((x) => x.method === 'VOICE' || x.method === 'CHAT');
  if (!screen && !talk && !(c.videos ?? []).length) out.push('No step drives a screen, so there are no screenshots, video or transcript.');
  else if (screen && !(c.videos ?? []).length) out.push('No video of the screen was recorded.');
  return out;
}

/* ---------- The base branch's source, to tell a saved run made on it ---------- */
type BaseTree = { branch: string; top: string; commit: string; globs: string[]; testDir: string | null };
const git = (cwd: string, args: string[], input?: string) => execFileSync('git', ['-C', cwd, ...args], { input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
/** The base branch's commit and the sources the app attests (its config's, else the default), or null when git cannot name it. */
function baseTree(root: string, branch: string, configPath: string): BaseTree | null {
  if (!/^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/.test(branch)) return null;
  let top: string, commit: string;
  try { top = git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim(); commit = git(root, ['rev-parse', '--verify', '--quiet', `${branch}^{commit}`]).toString('utf8').trim(); } catch { return null; }
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(commit) || !top) return null;
  let globs = defaultSourceGlobs(), testDir: string | null = null;
  try { const config = loadAuthoringConfig(configPath); globs = config.app.sources ?? globs; testDir = resolve(dirname(configPath), config.testDir); } catch { /* the default sources */ }
  return { branch, top, commit, globs, testDir };
}
/**
 * The source digest a run of the base branch's app, launched from `cwd`, attests: its sources among the regular files of the base
 * commit's tree under that folder, each hashed as the launcher hashes the file it reads. Null when that tree cannot be read.
 * Worked out once per commit and folder.
 */
const baseDigests = new Map<string, string | null>();
function baseDigest(t: BaseTree, cwd: string): string | null {
  const rel = relative(t.top, cwd).split(sep).join('/');
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  const tests = t.testDir ? relative(cwd, t.testDir).split(sep).join('/') : '';
  const skip = tests && !tests.startsWith('..') ? [tests] : [];
  const key = JSON.stringify([t.top, t.commit, rel, t.globs, skip]);
  if (baseDigests.has(key)) return baseDigests.get(key)!;
  let hex: string | null = null;
  try {
    const listed = git(t.top, ['ls-tree', '-r', '-z', t.commit, ...(rel ? ['--', `${rel}/`] : [])]).toString('utf8').split('\0').filter(Boolean);
    const files = listed.flatMap((line) => { const m = /^(?:100644|100755) blob [0-9a-f]+\t(.+)$/s.exec(line); return m && !m[1]!.includes('\n') ? [rel ? m[1]!.slice(rel.length + 1) : m[1]!] : []; });
    const mine = sourcesAmong(files, t.globs, skip);
    if (mine.length && mine.length <= MAX_SOURCE_FILES) {
      const out = git(t.top, ['cat-file', '--batch'], mine.map((f) => `${t.commit}:${rel ? `${rel}/` : ''}${f}`).join('\n') + '\n');
      let at = 0;
      const entries = mine.map((path) => {
        const nl = out.indexOf(10, at); const head = /^[0-9a-f]+ blob (\d+)$/.exec(out.subarray(at, nl).toString('utf8'));
        if (!head) throw new Error('not a blob');
        const size = Number(head[1]); const bytes = out.subarray(nl + 1, nl + 1 + size); at = nl + 1 + size + 1;
        return { path, sha256: sha256Hex(bytes) };
      });
      hex = identityFromEntries(entries).hex;
    }
  } catch { hex = null; }
  baseDigests.set(key, hex);
  return hex;
}
/** The folder a saved run launched its app from, as its sealed host plan says it (relative to the compiled folder beside it). */
function launchedFrom(root: string, dir: string): string | null {
  try {
    const bundle = readVerifiedBundle(join(dir, 'bundle'));
    const cell = bundle.selection.cells[0];
    const host = cell ? HostPlan.parse(bundle.documents[refKey(cell.executionHostRef)]) : null;
    return host?.launch ? resolve(root, STATE_DIR, 'compiled', host.launch.cwd) : null;
  } catch { return null; }
}

/** The saved runs beside this one that ran the flow, newest first, as their verified evidence says; read once each once it
 *  verifies. A run that does not verify yet (one still being written, say) is read again next time, never kept as unreadable. */
type SavedRead = { cases: Array<{ caseId: string; outcome: string }>; binding: VerificationSourceBinding | null; digest: string; cwd?: string | null };
const outcomes = new Map<string, SavedRead>();
/** Whether a saved run was made on the base branch's source: a snapshot of its commit, or a working tree whose app source digest
 *  is the one the base commit's files make. */
function madeOn(t: BaseTree, root: string, dir: string, run: SavedRead): boolean {
  if (run.binding?.kind === 'snapshot') return run.binding.commit.toLowerCase() === t.commit;
  if (run.binding?.kind !== 'working_tree' || !run.digest) return false;
  if (run.cwd === undefined) run.cwd = launchedFrom(root, dir);
  return !!run.cwd && baseDigest(t, run.cwd) === run.digest;
}
function historyOf(root: string, caseId: string, current: string, base: BaseTree | null = null): Pick<Happened, 'history' | 'unfinished' | 'base'> {
  let names: string[] = [];
  try { names = readdirSync(join(root, '.tracegrove', 'runs')).filter((n) => n !== 'latest' && SavedRunName.safeParse(n).success).sort().reverse(); } catch { names = []; }
  let saved = 0, passed = 0, failed = 0, lastPass: string | null = null;
  const unfinished = { notReached: 0, cancelled: 0, inconclusive: 0 };
  const onBase = base ? { branch: base.branch, runs: 0, passed: 0, failed: 0, notReached: 0 } : null;
  for (const name of names) {
    let dir: string;
    try { dir = savedRunDirectory(root, name); } catch { continue; }
    // A run's summary names the flows it ran; one that does not name this flow is passed over unread.
    try { if (!readFileSync(join(dir, 'summary.json'), 'utf8').includes(JSON.stringify(caseId))) continue; } catch { /* no summary: read its evidence */ }
    let read = outcomes.get(dir) ?? null;
    if (!read) {
      const r = isRunDirectory(dir) ? readSavedRun(dir) : null;
      read = r && r.evidenceStatus === 'verified' ? { cases: r.cases.map((q) => ({ caseId: q.caseId, outcome: q.outcome })), binding: r.sourceBinding ?? null, digest: r.sourceDigest } : null;
      if (read) outcomes.set(dir, read);
    }
    const mine = read?.cases.find((q) => q.caseId === caseId);
    if (!mine) continue;
    saved++;
    if (onBase && base && madeOn(base, root, dir, read!)) {
      onBase.runs++;
      if (mine.outcome === 'passed') onBase.passed++; else if (mine.outcome === 'assertion_failed') onBase.failed++;
      else if (mine.outcome === 'blocked' || mine.outcome === 'infrastructure_failed') onBase.notReached++;
    }
    if (mine.outcome === 'passed') { passed++; if (!lastPass && name !== current) lastPass = name; }
    else if (mine.outcome === 'assertion_failed') failed++;
    else if (mine.outcome === 'blocked' || mine.outcome === 'infrastructure_failed') unfinished.notReached++;
    else if (mine.outcome === 'cancelled') unfinished.cancelled++;
    else if (mine.outcome === 'inconclusive') unfinished.inconclusive++;
  }
  return { history: { saved, passed, failed, lastPass }, unfinished, base: onBase };
}

/** Whether the flow held before, in the saved runs: how they went, the runs that never reached their checks named as such
 *  (never read as failures), and how the ones made on the base branch went, or that none is recorded. */
export function historyLine(h: Happened['history'], u: Happened['unfinished'], base: string | Happened['base']): string | null {
  if (!h.saved) return null;
  const all = h.saved === 1 ? 'its 1 saved run' : `all ${h.saved} saved runs`;
  const were = (n: number) => (n === 1 ? 'was' : 'were');
  const head = h.failed === h.saved ? `Failed in ${all}` : h.passed === h.saved ? `Passed in ${all}` : u.notReached === h.saved ? `Never reached its checks in ${all}`
    : [`Passed ${h.passed} of ${h.saved} saved runs`, u.notReached ? `${u.notReached} never reached ${u.notReached === 1 ? 'its' : 'their'} checks` : '',
      u.cancelled ? `${u.cancelled} ${were(u.cancelled)} cancelled` : '', u.inconclusive ? `${u.inconclusive} ${were(u.inconclusive)} inconclusive` : ''].filter(Boolean).join('; ');
  const b = typeof base === 'string' ? { branch: base, runs: 0, passed: 0, failed: 0, notReached: 0 } : base;
  const the = b ? (b.runs === 1 ? `the 1 made on ${b.branch}` : `all ${b.runs} made on ${b.branch}`) : '';
  const onBase = !b ? '' : !b.runs ? `; no run on ${b.branch} is recorded` : b.passed === b.runs ? `; ${the} passed` : b.failed === b.runs ? `; ${the} failed`
    : b.notReached === b.runs ? `; ${b.runs === 1 ? the : `none of the ${b.runs} made on ${b.branch}`} ${b.runs === 1 ? 'never reached its' : 'reached their'} checks`
    : `; ${b.passed} of the ${b.runs} made on ${b.branch} passed`;
  return `${head}${onBase}.`;
}

/** The drawer's reading of `caseId` in the run `name` saved under `root` (the folder whose .tracegrove holds it). */
export function happenedIn(root: string, name: string, caseId: string, opts: { base?: string | null; config?: string } = {}): Happened | null {
  const dir = savedRunDirectory(root, name);
  const r = readSavedRun(dir);
  // Only the flow asked for: a run that holds one other flow is not read as this one.
  const c = r.cases.find((q) => q.caseId === caseId);
  const verified = r.evidenceStatus === 'verified';
  // the base branch, named by the grow, as git has it now; a name git cannot read still says no run of it is recorded
  const tree = opts.base ? baseTree(root, opts.base, opts.config ?? join(root, 'tracegrove.config.yaml')) : null;
  const { history, unfinished, base } = historyOf(root, caseId, name, tree);
  const onBase = base ?? (opts.base ? { branch: opts.base, runs: 0, passed: 0, failed: 0, notReached: 0 } : null);
  const said = { history, unfinished, base: onBase, historyLine: historyLine(history, unfinished, onBase) };
  if (!c) return verified ? null : { run: name, verified, source: null, startedAt: r.startedAt, caseId, title: caseId, outcome: r.outcome, ms: 0, steps: [], at: 0, contradicts: null,
    oneLine: 'This run’s evidence could not be verified, so its steps are not shown.', chips: [{ t: `run ${name}`, tone: '' }, { t: 'not verified', tone: 'bad' }], foot: [], ...said };
  const names = declaredNames(dir, c.caseId);
  const steps = c.steps.filter((x) => x.declared !== false).map((x) => ({ ...x, name: names.get(x.id) ?? x.name }));
  const name1 = (x: StepReport) => x.name;
  const { line, contradicts } = oneLineOf(c, steps, name1, () => sealedCause(dir, c.caseId));
  const at = Math.max(0, steps.findIndex(bad));
  return { run: name, verified, source: verified ? r.sourceDigest.slice(0, 6) : null, startedAt: r.startedAt, caseId: c.caseId, title: c.title, outcome: c.outcome, ms: c.durationMs,
    steps, at, contradicts, oneLine: line, chips: chipsOf(r, c, name), foot: footOf(c, steps), ...said };
}
