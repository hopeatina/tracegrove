/**
 * Graded rubrics: a flow lists, in plain words, what a good conversation does ("offers the next opening
 * when the slot is taken"). `tracegrove judge` asks the configured agent to grade a saved run against
 * that list, citing the numbered evidence lines for every verdict. Judgments are advisory. Checks
 * decide pass or fail; a judgment only feeds readiness and the PR card as notes for the person who
 * signs off, and every sign-off records whether the person agreed with the judge.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { compileProject, configInDirectory } from './compile.ts';
import { resolveRun } from './run.ts';
import { readSavedRun } from './runSource.ts';
import { SavedRunName, type CaseReport } from './runReport.ts';
import { agentEnv, detectAgents, resolveAgentSettings, DEFAULT_MODELS, type AgentSettings } from './agent.ts';
import { readDecisions } from './readiness.ts';

export const RubricVerdict = z.enum(['met', 'not_met', 'unclear']);
export const JudgedItem = z.object({ item: z.string().min(1).max(400), verdict: RubricVerdict, lines: z.array(z.number().int().positive()).max(20), why: z.string().max(600) }).strict();
export const Judgment = z.object({
  schemaVersion: z.literal('tracegrove.judgment/v1'),
  caseId: z.string(), run: SavedRunName, at: z.string(),
  judge: z.object({ provider: z.string(), model: z.string().nullable() }).strict(),
  evidence: z.array(z.string().max(2000)).max(400),
  items: z.array(JudgedItem).max(20),
}).strict();
export type Judgment = z.infer<typeof Judgment>;
export type JudgmentSummary = { met: number; notMet: number; unclear: number; total: number; notMetItems: string[] };

/** Sends one prompt, returns the model's final text. Injected in tests. */
export type Ask = (prompt: string) => Promise<string>;

const judgmentsDir = (root: string, run: string) => join(root, '.tracegrove', 'judgments', run);
const fileFor = (caseId: string) => `${caseId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

export function rubricFor(root: string, file: string): string[] {
  try {
    const flow = parse(readFileSync(join(root, file), 'utf8')) as { rubric?: unknown } | null;
    return Array.isArray(flow?.rubric) ? flow.rubric.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 20) : [];
  } catch { return []; }
}

/** Numbered lines the judge may cite: every step, what it expected and what was observed. */
export function evidenceLines(c: CaseReport): string[] {
  return c.steps.filter((s) => s.declared !== false).flatMap((s) => [
    `[step] ${s.name} (${s.method} ${s.path}) -> ${s.checks === 'fail' || s.result === 'failed' ? 'failed' : s.result}${s.expectation ? `; checked: ${s.expectation}` : ''}`,
    ...(s.observedText ?? '').split('\n').filter((line) => line.trim()).map((line) => line.slice(0, 600)),
  ]).slice(0, 400);
}

export function buildJudgePrompt(input: { title: string; rubric: string[]; lines: string[] }): string {
  return [
    'You are grading one recorded test run of a voice or chat agent against a rubric written by the person responsible for it.',
    'Grade only from the numbered evidence below. Do not assume anything that is not in it.',
    '',
    `Scenario: ${input.title}`,
    '',
    'Rubric:',
    ...input.rubric.map((item, i) => `${i + 1}. ${item}`),
    '',
    'Evidence:',
    ...input.lines.map((line, i) => `${i + 1}: ${line}`),
    '',
    'For every rubric item answer "met", "not_met" or "unclear", cite the evidence line numbers that show it, and say why in one sentence.',
    'Tool calls marked "before replying" or "after saying …" show when they started relative to the agent\'s words; "during this turn" means that order was not recorded, so do not infer it.',
    'Use "unclear" when the evidence does not show it either way. "met" and "not_met" must cite at least one line.',
    'Reply with JSON only, no prose: {"items":[{"item":<rubric number>,"verdict":"met|not_met|unclear","lines":[<numbers>],"why":"..."}]}',
  ].join('\n');
}

/** Strict reading of the judge's answer: unknown items are dropped, uncited verdicts become unclear. */
export function parseJudgeAnswer(text: string, rubric: string[], lineCount: number): Judgment['items'] {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Blocked([{ code: 'judge_answer_unreadable', detail: text.slice(0, 300), action: 'run tracegrove judge again, or pick another model with --agent' }]); }
  const answers = Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
  return rubric.map((item, index) => {
    const found = answers.find((a) => Number((a as { item?: unknown }).item) === index + 1) as { verdict?: unknown; lines?: unknown; why?: unknown } | undefined;
    const lines = Array.isArray(found?.lines) ? [...new Set(found!.lines.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= lineCount))].slice(0, 20) : [];
    const said = RubricVerdict.safeParse(found?.verdict);
    const verdict = !said.success ? 'unclear' : said.data !== 'unclear' && lines.length === 0 ? 'unclear' : said.data;
    const why = typeof found?.why === 'string' ? found.why.slice(0, 600) : found ? '' : 'the judge gave no answer for this item';
    return { item, verdict, lines, why: said.success && said.data !== verdict ? `uncited: ${why}`.slice(0, 600) : why };
  });
}

export function readJudgment(root: string, run: string, caseId: string): Judgment | null {
  const path = join(judgmentsDir(root, run), fileFor(caseId));
  if (!existsSync(path)) return null;
  const parsed = Judgment.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return parsed.success && parsed.data.caseId === caseId && parsed.data.run === run ? parsed.data : null;
}

export function summarize(j: Judgment): JudgmentSummary {
  const count = (v: z.infer<typeof RubricVerdict>) => j.items.filter((i) => i.verdict === v).length;
  return { met: count('met'), notMet: count('not_met'), unclear: count('unclear'), total: j.items.length, notMetItems: j.items.filter((i) => i.verdict === 'not_met').map((i) => i.item) };
}

/** The default judge: the configured coding agent, called once per scenario with no tools. */
export function agentAsk(settings: AgentSettings): Ask {
  const bin = detectAgents()[settings.provider as 'claude' | 'codex'];
  if (settings.provider === 'none') throw new Blocked([{ code: 'agent_disabled', detail: 'agent provider is none', action: 'pass --agent claude or --agent codex' }]);
  if (!bin) throw new Blocked([{ code: 'agent_not_installed', detail: `${settings.provider} is not on PATH`, action: settings.provider === 'claude' ? 'install Claude Code and sign in' : 'install the Codex CLI and sign in' }]);
  return (prompt) => new Promise((resolve, reject) => {
    const args = settings.provider === 'claude'
      ? ['-p', prompt, '--model', settings.model ?? DEFAULT_MODELS.claude!, '--output-format', 'json', '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch', '--no-session-persistence']
      : ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--model', settings.model ?? DEFAULT_MODELS.codex!, prompt];
    const child = spawn(bin, args, { env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => { out = (out + chunk.toString()).slice(-200_000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new Blocked([{ code: 'judge_failed', detail: out.slice(-300), action: 'check that the agent CLI is signed in' }])); return; }
      try { const parsed = JSON.parse(out) as { result?: unknown }; resolve(typeof parsed.result === 'string' ? parsed.result : out); } catch { resolve(out); }
    });
  });
}

export type JudgeResult = { run: string; judged: Array<{ caseId: string; title: string; summary: JudgmentSummary; items: Judgment['items'] }>; skipped: Array<{ caseId: string; why: string }>;
  agreement: { decided: number; agreed: number } };

export async function judge(dir: string, options: { run?: string; grep?: string; ask?: Ask; judge?: { provider: string; model: string | null }; agent?: string | null }): Promise<JudgeResult> {
  const configPath = configInDirectory(dir);
  if (!configPath) throw new Blocked([{ code: 'config_not_found', detail: dir, action: 'run tracegrove init' }]);
  const compiled = compileProject(configPath);
  const root = compiled.root;
  const runDir = resolveRun(root, options.run ?? 'latest');
  if (!runDir) throw new Blocked([{ code: 'run_not_found', detail: options.run ?? 'latest', action: 'run tracegrove test first' }]);
  const report = readSavedRun(runDir);
  if (report.evidenceStatus !== 'verified') throw new Blocked([{ code: 'run_unverified', detail: runDir, action: 'judge only verified runs; run tracegrove test again' }]);
  const run = runDir.split(/[\\/]/).pop()!;
  let ask = options.ask; let who = options.judge ?? null;
  const result: JudgeResult = { run, judged: [], skipped: [], agreement: { decided: 0, agreed: 0 } };
  for (const c of report.cases) {
    if (options.grep && !c.caseId.includes(options.grep)) continue;
    const flow = compiled.flows.find((f) => f.caseId === c.caseId);
    const rubric = flow ? rubricFor(root, flow.file) : [];
    if (!rubric.length) { result.skipped.push({ caseId: c.caseId, why: 'no rubric: in the flow' }); continue; }
    if (!ask) {
      const settings = resolveAgentSettings(root, compiled.config, { provider: options.agent ?? null });
      ask = agentAsk(settings); who = { provider: settings.provider, model: settings.model };
    }
    const lines = evidenceLines(c);
    const items = parseJudgeAnswer(await ask(buildJudgePrompt({ title: c.title, rubric, lines })), rubric, lines.length);
    const judgment: Judgment = { schemaVersion: 'tracegrove.judgment/v1', caseId: c.caseId, run, at: new Date().toISOString(), judge: who ?? { provider: 'custom', model: null }, evidence: lines, items };
    mkdirSync(judgmentsDir(root, run), { recursive: true });
    writeFileSync(join(judgmentsDir(root, run), fileFor(c.caseId)), `${JSON.stringify(Judgment.parse(judgment), null, 2)}\n`);
    result.judged.push({ caseId: c.caseId, title: c.title, summary: summarize(judgment), items });
  }
  result.agreement = agreement(root, compiled.config.testDir);
  return result;
}

/**
 * How often people agreed with the judge: an acceptance agrees when every item was met, a rejection
 * agrees when at least one was not. Only decisions made on a judged run count.
 */
export function agreement(root: string, testDir: string): { decided: number; agreed: number } {
  let decided = 0; let agreed = 0;
  for (const d of readDecisions(root, testDir)) {
    if (!d.run || (d.decision !== 'accepted' && d.decision !== 'rejected')) continue;
    const j = readJudgment(root, d.run, d.case);
    if (!j) continue;
    decided++;
    const s = summarize(j);
    if ((d.decision === 'accepted' && s.notMet === 0 && s.unclear === 0) || (d.decision === 'rejected' && s.notMet > 0)) agreed++;
  }
  return { decided, agreed };
}

/** Judged runs on disk, for listing. */
export function judgedRuns(root: string): string[] {
  const dir = join(root, '.tracegrove', 'judgments');
  return existsSync(dir) ? readdirSync(dir).filter((n) => SavedRunName.safeParse(n).success).sort().reverse() : [];
}
