/**
 * What happened in one scenario's run, for the grow page's drawer: its steps as the Run tab reads them (StepReport), the sentence
 * that says how it broke, the chips that say what was real, what was not recorded, and whether it ever passed. Everything is read
 * from the run's verified bundle and the runs saved beside it; nothing is guessed, and what was not recorded is said so.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { snake } from './compile.ts';
import { countNoun } from './checkCompare.ts';
import { readSavedRun, type CheckedRunReport } from './runSource.ts';
import { SavedRunName, type CaseReport, type StepReport } from './runReport.ts';
import { isRunDirectory, savedRunDirectory } from './runLocation.ts';

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
  history: { saved: number; passed: number; lastPass: string | null };
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

/** One sentence for what broke, from the records: the answer a stand-in's calls contradict, or what the failing check expected
 *  and got, and the step that broke it; or, for a run that held, how many checks held. */
function oneLineOf(c: CaseReport, steps: StepReport[], name: (x: StepReport) => string): { line: string; contradicts: Happened['contradicts'] } {
  const i = steps.findIndex(bad);
  if (c.outcome === 'passed' || (i < 0 && !c.failure)) {
    const checks = steps.filter((x) => (x.checked ?? []).length).length, cmp = steps.reduce((a, x) => a + (x.checked ?? []).length, 0);
    const held = checks === 1 ? 'Its 1 check held' : `All ${checks} checks held`;
    return { line: `${held}${cmp > checks ? ` (${cmp} comparisons)` : ''}, in ${c.durationMs} ms.`, contradicts: null };
  }
  if (i < 0) {
    const where = c.failure!.step.replace(/^\((.+)\)$/, '$1');
    return { line: `Broke at ${where}: ${c.failure!.message.split('\n')[0]}`.replace(/([^.!?])$/, '$1.'), contradicts: null };
  }
  const f = steps[i]!; const x = extraCall(steps, f);
  if (x) {
    const k = x.at + 1, step = `Step ${k} (${name(steps[x.at]!)})`;
    const what = x.call.amount !== null ? `${article(x.call.amount)} ${x.call.amount} ${x.one}` : `${/^[aeiou]/.test(x.one) ? 'an' : 'a'} ${x.one}`;
    const key = x.call.key && x.call.repeat === false ? ', under a new idempotency key' : '';
    if (x.field) {
      const said = JSON.stringify((JSON.parse(x.answer!) as Record<string, unknown>)[x.field]);
      return { line: `${step} answered ${x.field} ${said}, yet ${x.call.standIn} got ${what} during step ${k}${key}.`, contradicts: { at: x.at, field: x.field } };
    }
    return { line: `${x.call.standIn} got its ${ordinal(x.nth)} ${x.one}, one more than the ${x.expected} expected, during step ${k} (${name(steps[x.at]!)})${key}.`.replace(/^./, (m) => m.toUpperCase()), contradicts: null };
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
      tone: (s.mode === 'real' ? '' : s.calls === 'not recorded' ? 'none' : 'standin') as HappenedChip['tone'] }))];
}

/** What the run did not record, in plain sentences: a stand-in no step watched, a call outside every step, no screen. */
function footOf(c: CaseReport, steps: StepReport[]): string[] {
  const out: string[] = [];
  const unwatched = (c.services ?? []).filter((s) => s.calls === 'not recorded').map((s) => s.name);
  if (unwatched.length) out.push(`No step watched ${listed(unwatched, 'or')}, so ${unwatched.length === 1 ? 'its' : 'their'} calls are not recorded (only a watch step records a stand-in’s calls).`);
  const loose = steps.flatMap((x) => x.calls ?? []).filter((q) => !q.during).length;
  if (loose) out.push(`${loose} stand-in call${loose === 1 ? '' : 's'} came outside every step’s recorded time.`);
  const screen = steps.some((x) => x.method === 'UI'), talk = steps.some((x) => x.method === 'VOICE' || x.method === 'CHAT');
  if (!screen && !talk && !(c.videos ?? []).length) out.push('No step drives a screen, so there are no screenshots, video or transcript.');
  else if (screen && !(c.videos ?? []).length) out.push('No video of the screen was recorded.');
  return out;
}

/** The saved runs beside this one that ran the flow, newest first, as their verified evidence says; read once each. */
const outcomes = new Map<string, Array<{ caseId: string; outcome: string }> | null>();
function historyOf(root: string, caseId: string, current: string): Happened['history'] {
  let names: string[] = [];
  try { names = readdirSync(join(root, '.tracegrove', 'runs')).filter((n) => n !== 'latest' && SavedRunName.safeParse(n).success).sort().reverse(); } catch { names = []; }
  let saved = 0, passed = 0, lastPass: string | null = null;
  for (const name of names) {
    let dir: string;
    try { dir = savedRunDirectory(root, name); } catch { continue; }
    // A run's summary names the flows it ran; one that does not name this flow is passed over unread.
    try { if (!readFileSync(join(dir, 'summary.json'), 'utf8').includes(JSON.stringify(caseId))) continue; } catch { /* no summary: read its evidence */ }
    let cases = outcomes.get(dir);
    if (cases === undefined) {
      const r = isRunDirectory(dir) ? readSavedRun(dir) : null;
      cases = r && r.evidenceStatus === 'verified' ? r.cases.map((q) => ({ caseId: q.caseId, outcome: q.outcome })) : null;
      outcomes.set(dir, cases);
    }
    const mine = cases?.find((q) => q.caseId === caseId);
    if (!mine) continue;
    saved++;
    if (mine.outcome === 'passed') { passed++; if (!lastPass && name !== current) lastPass = name; }
  }
  return { saved, passed, lastPass };
}

/** The drawer's reading of `caseId` in the run `name` saved under `root` (the folder whose .tracegrove holds it). */
export function happenedIn(root: string, name: string, caseId: string): Happened | null {
  const dir = savedRunDirectory(root, name);
  const r = readSavedRun(dir);
  const c = r.cases.find((q) => q.caseId === caseId) ?? (r.cases.length === 1 ? r.cases[0] : undefined);
  const verified = r.evidenceStatus === 'verified';
  const history = historyOf(root, c?.caseId ?? caseId, name);
  if (!c) return verified ? null : { run: name, verified, source: null, startedAt: r.startedAt, caseId, title: caseId, outcome: r.outcome, ms: 0, steps: [], at: 0, contradicts: null,
    oneLine: 'This run’s evidence could not be verified, so its steps are not shown.', chips: [{ t: `run ${name}`, tone: '' }, { t: 'not verified', tone: 'bad' }], foot: [], history };
  const names = declaredNames(dir, c.caseId);
  const steps = c.steps.filter((x) => x.declared !== false).map((x) => ({ ...x, name: names.get(x.id) ?? x.name }));
  const name1 = (x: StepReport) => x.name;
  const { line, contradicts } = oneLineOf(c, steps, name1);
  const at = Math.max(0, steps.findIndex(bad));
  return { run: name, verified, source: verified ? r.sourceDigest.slice(0, 6) : null, startedAt: r.startedAt, caseId: c.caseId, title: c.title, outcome: c.outcome, ms: c.durationMs,
    steps, at, contradicts, oneLine: line, chips: chipsOf(r, c, name), foot: footOf(c, steps), history };
}
