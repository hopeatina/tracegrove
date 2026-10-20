/**
 * Readiness: one claim per flow, with four separate states instead of one green check.
 *   execution  - did the check run (completed, blocked, interrupted, not_run)
 *   assessment - what the evidence supports (supported, contradicted, inconclusive)
 *   validity   - is that evidence still about this code and this check (current, stale, superseded)
 *   decision   - who accepted it (pending, accepted, auto, rejected, waived, challenged)
 * Decisions live in tracegrove/decisions.yaml, committed beside the flows, and bind to the case and
 * source digests they were made on: change the check or the app and the decision no longer applies.
 * A waiver records a person's call; it never turns an unsupported claim into a supported one.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { compileProject, configInDirectory } from './compile.ts';
import { loadProject } from '../core/corpus.ts';
import { readVerifiedBundle } from '../core/bundle.ts';
import { readSavedRun } from './runSource.ts';
import { SavedRunName } from './runReport.ts';
import { isRunDirectory } from './runLocation.ts';
import { Blocked } from '../core/errors.ts';
import { CaseSpec, digestOfValue } from '../protocol/index.ts';

/** What the check asserts, without the app identity it ran against: steps, assertions, effects. */
const checkDigest = (spec: CaseSpec) => digestOfValue({ steps: spec.steps, assertions: spec.assertions, preconditions: spec.preconditions, effects: spec.effects, risk: spec.risk }).hex;

export const DECISION_KINDS = ['accepted', 'rejected', 'waived', 'challenged'] as const;
export const Decision = z.object({
  case: z.string().min(1).max(200),
  decision: z.enum(DECISION_KINDS),
  by: z.string().min(1).max(120),
  reason: z.string().max(2000).default(''),
  at: z.string(),
  run: z.string().nullable().default(null),
  caseDigest: z.string().nullable().default(null),
  sourceDigest: z.string().nullable().default(null),
  step: z.string().max(200).optional().describe('challenged: the check being disputed.'),
}).strict();
export type Decision = z.infer<typeof Decision>;
export const DecisionsFile = z.object({ schemaVersion: z.literal('tracegrove.decisions/v1'), decisions: z.array(Decision).max(5000).default([]) }).strict();

export type Claim = {
  caseId: string; title: string; file: string; risk: string;
  execution: 'completed' | 'blocked' | 'interrupted' | 'not_run';
  assessment: 'supported' | 'contradicted' | 'inconclusive' | 'none';
  validity: 'current' | 'stale' | 'superseded' | 'none';
  decision: 'pending' | 'accepted' | 'auto' | 'rejected' | 'waived' | 'challenged';
  decidedBy: string | null; reason: string | null;
  run: string | null; ranAt: string | null;
  failure: string | null;
  channels: string[];
  ready: boolean;
  next: { command: string; why: string } | null;
};
export type Readiness = {
  schemaVersion: 'tracegrove.readiness/v1';
  project: string; root: string; checkedAt: string; sourceDigest: string;
  ready: boolean;
  counts: { claims: number; ready: number; supported: number; contradicted: number; stale: number; pending: number; waived: number };
  claims: Claim[];
  next: Array<{ command: string; why: string }>;
};

const decisionsPath = (root: string, testDir: string) => join(root, testDir, 'decisions.yaml');

export function readDecisions(root: string, testDir = 'tracegrove'): Decision[] {
  const path = decisionsPath(root, testDir);
  if (!existsSync(path)) return [];
  return DecisionsFile.parse(parse(readFileSync(path, 'utf8')) ?? { schemaVersion: 'tracegrove.decisions/v1' }).decisions;
}

const CHANNEL: Record<string, string> = { GET: 'http readback', HEAD: 'http readback', POST: 'http', PUT: 'http', PATCH: 'http', DELETE: 'http', UI: 'browser', MCP: 'mcp', JOB: 'native job', VOICE: 'voice', CHAT: 'chat' };

type RunCase = { run: string; ranAt: string; outcome: string; caseDigest: string | null; sourceDigest: string; failure: string | null };

/** Newest verified run that contains each case (bounded: the last 30 runs). */
function latestByCase(root: string): Map<string, RunCase> {
  const runsDir = join(root, '.tracegrove', 'runs');
  const found = new Map<string, RunCase>();
  if (!existsSync(runsDir)) return found;
  const names = readdirSync(runsDir).filter((n) => n !== 'latest' && SavedRunName.safeParse(n).success && isRunDirectory(join(runsDir, n))).sort().reverse().slice(0, 30);
  for (const name of names) {
    const dir = join(runsDir, name);
    let report; let digests = new Map<string, string>();
    try {
      report = readSavedRun(dir);
      if (report.evidenceStatus !== 'verified') continue;
      digests = new Map(Object.values(readVerifiedBundle(join(dir, 'bundle')).documents).flatMap((doc) => {
        const spec = CaseSpec.safeParse(doc);
        return spec.success ? [[spec.data.ref.id, checkDigest(spec.data)] as const] : [];
      }));
    } catch { continue; }
    for (const c of report.cases) {
      if (found.has(c.caseId)) continue;
      found.set(c.caseId, { run: name, ranAt: report.finishedAt, outcome: c.outcome, caseDigest: digests.get(c.caseId) ?? null, sourceDigest: report.sourceDigest,
        failure: c.failure ? `${c.failure.step}: ${c.failure.message}` : null });
    }
  }
  return found;
}

export function readiness(dir: string): Readiness {
  const configPath = configInDirectory(dir);
  if (!configPath) throw new Blocked([{ code: 'config_not_found', detail: dir, action: 'run tracegrove init' }]);
  const compiled = compileProject(configPath);
  const root = compiled.root;
  const loaded = loadProject(compiled.workflowConfigPath);
  const currentDigest = new Map(loaded.suiteCases.map((entry) => { const spec = loaded.corpus.getAs(CaseSpec, entry.ref); return [spec.ref.id, checkDigest(spec)]; }));
  const decisions = readDecisions(root, compiled.config.testDir);
  const runs = latestByCase(root);
  const claims: Claim[] = compiled.flows.map((flow) => {
    const caseDigest = currentDigest.get(flow.caseId) ?? null;
    const risk = (parse(readFileSync(join(root, flow.file), 'utf8')) as { risk?: string } | null)?.risk ?? 'standard';
    const ran = runs.get(flow.caseId);
    const execution: Claim['execution'] = !ran ? 'not_run' : ran.outcome === 'passed' || ran.outcome === 'assertion_failed' ? 'completed' : ran.outcome === 'blocked' ? 'blocked' : 'interrupted';
    const assessment: Claim['assessment'] = !ran ? 'none' : ran.outcome === 'passed' ? 'supported' : ran.outcome === 'assertion_failed' ? 'contradicted' : 'inconclusive';
    const validity: Claim['validity'] = !ran ? 'none' : ran.caseDigest !== caseDigest ? 'superseded' : ran.sourceDigest !== compiled.sourceDigest ? 'stale' : 'current';
    const mine = decisions.filter((d) => d.case === flow.caseId && d.caseDigest === caseDigest && (d.decision === 'challenged' || d.decision === 'waived' || d.sourceDigest === compiled.sourceDigest)).at(-1);
    let decision: Claim['decision'] = 'pending';
    if (mine) decision = mine.decision;
    else if (assessment === 'supported' && validity === 'current' && risk !== 'critical') decision = 'auto';
    if (decision === 'accepted' && assessment !== 'supported') decision = 'pending'; // an acceptance never outlives the evidence it saw
    const ready = decision === 'waived' || (assessment === 'supported' && validity === 'current' && (decision === 'accepted' || decision === 'auto'));
    const grep = `tracegrove test --grep ${flow.caseId}`;
    const next = ready ? null
      : decision === 'challenged' ? { command: `tracegrove show`, why: `the check is disputed${mine?.reason ? `: ${mine.reason}` : ''}; fix the flow or resolve the challenge with accept/reject` }
      : execution === 'not_run' ? { command: grep, why: 'never run; there is no evidence yet' }
      : validity === 'superseded' ? { command: grep, why: 'the check changed since its last run' }
      : validity === 'stale' ? { command: grep, why: 'the app changed since its last run' }
      : assessment === 'contradicted' ? { command: 'tracegrove heal', why: ran?.failure ?? 'the evidence contradicts the claim' }
      : assessment === 'inconclusive' ? { command: 'tracegrove show', why: `${ran?.outcome ?? 'inconclusive'}: the run could not decide` }
      : decision === 'rejected' ? { command: grep, why: `rejected by ${mine?.by ?? 'a reviewer'}${mine?.reason ? `: ${mine.reason}` : ''}` }
      : { command: `tracegrove accept ${flow.caseId}`, why: `${risk} claim: a person signs off` };
    return { caseId: flow.caseId, title: flow.title, file: flow.file, risk, execution, assessment, validity, decision,
      decidedBy: decision === 'auto' ? 'policy: supported routine claim' : mine?.by ?? null, reason: mine?.reason || null,
      run: ran?.run ?? null, ranAt: ran?.ranAt ?? null, failure: assessment === 'contradicted' || assessment === 'inconclusive' ? ran?.failure ?? null : null,
      channels: [...new Set(flow.steps.map((s) => CHANNEL[s.method] ?? s.method.toLowerCase()))], ready, next };
  });
  const order = (c: Claim) => (c.ready ? 3 : 0) + (c.decision === 'waived' ? 1 : 0) + (c.assessment === 'contradicted' ? -1 : 0);
  claims.sort((a, b) => order(a) - order(b) || a.caseId.localeCompare(b.caseId));
  const counts = { claims: claims.length, ready: claims.filter((c) => c.ready).length, supported: claims.filter((c) => c.assessment === 'supported').length,
    contradicted: claims.filter((c) => c.assessment === 'contradicted').length, stale: claims.filter((c) => c.validity === 'stale' || c.validity === 'superseded').length,
    pending: claims.filter((c) => c.decision === 'pending' && c.assessment === 'supported' && c.validity === 'current').length, waived: claims.filter((c) => c.decision === 'waived').length };
  const next: Readiness['next'] = [];
  for (const claim of claims) if (claim.next && !next.some((n) => n.command === claim.next!.command)) next.push(claim.next);
  return { schemaVersion: 'tracegrove.readiness/v1', project: compiled.config.project, root, checkedAt: new Date().toISOString(), sourceDigest: compiled.sourceDigest,
    ready: claims.length > 0 && claims.every((c) => c.ready), counts, claims, next: next.slice(0, 8) };
}

/** Record a person's call on one claim, bound to the evidence it was made on. */
export function decide(dir: string, input: { case: string; decision: Decision['decision']; by: string; reason?: string; step?: string }): Decision {
  const state = readiness(dir);
  const claim = state.claims.find((c) => c.caseId === input.case || c.caseId.endsWith(input.case));
  if (!claim) throw new Blocked([{ code: 'claim_not_found', detail: input.case, action: 'run tracegrove readiness to list claims' }]);
  if ((input.decision === 'waived' || input.decision === 'rejected' || input.decision === 'challenged') && !input.reason?.trim()) {
    throw new Blocked([{ code: 'decision_reason_required', detail: `${input.decision} needs --reason`, action: 'say why, in a sentence a reviewer will understand later' }]);
  }
  if (input.decision === 'accepted' && (claim.assessment !== 'supported' || claim.validity !== 'current')) {
    throw new Blocked([{ code: 'accept_requires_current_support', detail: `${claim.caseId} is ${claim.assessment}, ${claim.validity}`, action: claim.next?.command ?? 'rerun it; or waive it with --reason if you are knowingly shipping without this evidence' }]);
  }
  const compiled = compileProject(configInDirectory(dir)!);
  const loaded = loadProject(compiled.workflowConfigPath);
  const entry = loaded.suiteCases.find((item) => item.ref.id === claim.caseId);
  const caseDigest = entry ? checkDigest(loaded.corpus.getAs(CaseSpec, entry.ref)) : null;
  const decision = Decision.parse({ case: claim.caseId, decision: input.decision, by: input.by, reason: input.reason ?? '', at: new Date().toISOString(),
    run: claim.run, caseDigest, sourceDigest: compiled.sourceDigest, ...(input.step ? { step: input.step } : {}) });
  const path = decisionsPath(compiled.root, compiled.config.testDir);
  const existing = readDecisions(compiled.root, compiled.config.testDir);
  writeFileSync(path, `# Sign-off record: who accepted, waived, rejected or challenged each claim, and on which evidence.\n# Written by tracegrove accept / waive / reject / challenge. Commit it with your flows.\n${stringify({ schemaVersion: 'tracegrove.decisions/v1', decisions: [...existing, decision] })}`);
  return decision;
}

export function defaultReviewer(): string {
  return process.env.TRACEGROVE_REVIEWER ?? process.env.GIT_AUTHOR_NAME ?? process.env.USER ?? 'unknown';
}
