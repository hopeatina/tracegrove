/**
 * The PR proof card: one Markdown comment that says whether every claim held on this commit, built from
 * the same readiness state as `tracegrove readiness`. It reads saved runs only and never starts an app,
 * so CI runs `test` first and the card can't claim more than the evidence on disk.
 */
import { basename, relative, resolve } from 'node:path';
import { readiness, type Claim, type Readiness } from './readiness.ts';

export const CARD_MARKER = '<!-- tracegrove-proof -->';

export type CardInput = { dirs: string[]; commit?: string | null; link?: string | null; title?: string | null };
export type CardFailure = { project: string; caseId: string; title: string; file: string; failure: string };
/** A person's call against a claim: rejected (the product is wrong) or challenged (the check is wrong). */
export type CardDispute = { project: string; caseId: string; title: string; file: string; decision: 'rejected' | 'challenged'; by: string | null; reason: string };
export type Card = {
  schemaVersion: 'tracegrove.card/v1';
  verdict: 'holds' | 'fails' | 'incomplete';
  commit: string | null;
  totals: { projects: number; claims: number; supported: number; contradicted: number; rejected: number; challenged: number; notRun: number; awaitingSignOff: number };
  failures: CardFailure[];
  disputes: CardDispute[];
  projects: Array<{ project: string; dir: string; claims: number; supported: number; contradicted: number; awaitingSignOff: number }>;
  markdown: string;
};

const ICON = { holds: '✅', fails: '❌', incomplete: '⚠️' } as const;
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const awaiting = (c: Claim) => c.assessment === 'supported' && c.validity === 'current' && c.decision === 'pending';
const evidence = (c: Claim) => c.decision === 'rejected' ? '**rejected**' : c.assessment === 'supported' ? (c.validity === 'current' ? 'holds' : 'stale') : c.assessment === 'contradicted' ? '**fails**' : c.execution === 'not_run' ? 'not run' : 'inconclusive';
const signOff = (c: Claim) => c.assessment === 'contradicted' ? '' : c.decision === 'auto' ? 'routine' : c.decision === 'pending' ? (c.risk === 'critical' ? 'needs a person' : '') : `${c.decision}${c.decidedBy ? ` by ${c.decidedBy}` : ''}`;

export function renderCard(input: CardInput): Card {
  const read: Readiness[] = input.dirs.map((dir) => readiness(resolve(dir)));
  // Two folders of the same project (say, with and without a bug) are told apart by folder name.
  const states = read.map((s, i) => read.filter((o) => o.project === s.project).length > 1 ? { ...s, project: `${s.project} (${basename(resolve(input.dirs[i]!))})` } : s);
  const all = states.flatMap((s) => s.claims.map((c) => ({ project: s.project, claim: c })));
  const roots = new Map(states.map((s) => [s.project, s.root]));
  const failures: CardFailure[] = all.filter(({ claim }) => claim.assessment === 'contradicted')
    .map(({ project, claim }) => ({ project, caseId: claim.caseId, title: claim.title, file: relative(process.cwd(), resolve(roots.get(project) ?? '.', claim.file)), failure: claim.failure ?? 'the evidence contradicts the claim' }));
  const disputes: CardDispute[] = all.filter(({ claim }) => claim.decision === 'rejected' || claim.decision === 'challenged')
    .map(({ project, claim }) => ({ project, caseId: claim.caseId, title: claim.title, file: relative(process.cwd(), resolve(roots.get(project) ?? '.', claim.file)),
      decision: claim.decision as CardDispute['decision'], by: claim.decidedBy, reason: claim.reason ?? '' }));
  const totals = { projects: states.length, claims: all.length, supported: all.filter(({ claim }) => claim.assessment === 'supported').length, contradicted: failures.length,
    rejected: disputes.filter((d) => d.decision === 'rejected').length, challenged: disputes.filter((d) => d.decision === 'challenged').length,
    notRun: all.filter(({ claim }) => claim.execution === 'not_run' || claim.assessment === 'inconclusive').length, awaitingSignOff: all.filter(({ claim }) => awaiting(claim)).length };
  // A person saying "this is wrong" outranks passing evidence: rejected fails the card, challenged leaves it incomplete.
  const verdict: Card['verdict'] = totals.contradicted || totals.rejected ? 'fails' : totals.claims === 0 || totals.notRun || totals.challenged || totals.supported < totals.claims ? 'incomplete' : 'holds';
  const commit = input.commit ? input.commit.slice(0, 12) : null;
  const on = commit ? ` on \`${commit}\`` : '';
  const failing = totals.contradicted + disputes.filter((d) => d.decision === 'rejected' && !failures.some((f) => f.project === d.project && f.caseId === d.caseId)).length;
  const headline = verdict === 'holds' ? `${totals.supported} of ${totals.claims} claims hold${on}`
    : verdict === 'fails' ? `${failing} of ${totals.claims} claims fail${on}`
    : totals.challenged && !totals.notRun ? `${totals.supported} of ${totals.claims} claims have passing evidence${on}; ${totals.challenged} check${totals.challenged === 1 ? ' is' : 's are'} disputed`
    : `${totals.supported} of ${totals.claims} claims have passing evidence${on}; ${totals.claims - totals.supported - totals.contradicted} did not run to a verdict`;

  const lines = [CARD_MARKER, `### ${ICON[verdict]} ${input.title ?? 'tracegrove'}: ${headline}`, ''];
  if (totals.awaitingSignOff) lines.push(`${totals.awaitingSignOff} critical claim${totals.awaitingSignOff === 1 ? ' passes and waits' : 's pass and wait'} for a person: \`tracegrove accept <claim>\`.`, '');
  for (const f of failures) lines.push(`- **${f.project} › ${f.title}** failed: ${cell(f.failure).slice(0, 300)}  \n  \`${f.file}\``);
  for (const d of disputes) lines.push(`- **${d.project} › ${d.title}** ${d.decision === 'rejected' ? 'is wrong' : 'has a disputed check'}, says ${d.by ?? 'a reviewer'}: ${cell(d.reason).slice(0, 300) || '(no reason given)'}  \n  \`${d.file}\``);
  if (failures.length || disputes.length) lines.push('');
  if (states.length > 1) {
    lines.push('| Project | Claims | Result |', '| --- | --- | --- |');
    for (const s of states) {
      const bad = s.claims.filter((c) => c.assessment === 'contradicted' || c.decision === 'rejected').length; const held = s.counts.supported;
      lines.push(`| ${cell(s.project)} | ${s.counts.claims} | ${bad ? `❌ ${bad} failing` : held === s.counts.claims ? '✅ all hold' : `⚠️ ${held} of ${s.counts.claims} with evidence`} |`);
    }
    lines.push('');
  }
  lines.push('<details><summary>Every claim</summary>', '', '| Claim | Checks | Evidence | Sign-off |', '| --- | --- | --- | --- |');
  for (const { project, claim } of all) lines.push(`| ${cell(states.length > 1 ? `${project} › ${claim.title}` : claim.title)} | ${claim.channels.join(', ')} | ${evidence(claim)} | ${cell(signOff(claim))} |`);
  lines.push('', '</details>', '');
  const footer = [input.link ? `[Full report](${input.link})` : null, 'Each run starts the app fresh, checks every effect with a separate read, and seals the evidence. Verified with [tracegrove](https://github.com/hopeatina/tracegrove).'].filter(Boolean);
  lines.push(`<sub>${footer.join(' · ')}</sub>`);

  return { schemaVersion: 'tracegrove.card/v1', verdict, commit, totals, failures, disputes,
    projects: states.map((s, i) => ({ project: s.project, dir: relative(process.cwd(), resolve(input.dirs[i]!)) || '.', claims: s.counts.claims, supported: s.counts.supported, contradicted: s.counts.contradicted,
      awaitingSignOff: s.claims.filter(awaiting).length })),
    markdown: `${lines.join('\n')}\n` };
}
