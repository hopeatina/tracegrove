/** Terminal renderings of the environment commands. JSON callers get the objects themselves. */
import type { Paint } from './render.ts';
import type { CapabilityMatrix, EnvRow, ExplainReport } from '../environments/commands.ts';
import type { DoctorCheck, DoctorReport } from '../environments/doctor.ts';
import type { ConfigEditResult } from '../authoring/configEdit.ts';
import type { Approval } from '../environments/agents.ts';

const classTone = (p: Paint, cls: string) => (cls === 'isolated_candidate' ? p.dim : cls === 'production_observation' ? p.red : p.amber);
const stateMark = (p: Paint, state: string) => (state === 'supported' || state === 'resolvable' ? p.moss('✓') : state === 'denied' || state === 'expired' ? p.red('✗') : p.amber('!'));

export function renderEnvList(rows: EnvRow[], p: Paint, selected: string): string {
  const lines: string[] = [];
  const nameWidth = Math.max(14, ...rows.map(r => r.name.length));
  for (const row of rows) {
    lines.push(`${row.name === selected ? p.moss('●') : ' '} ${p.bold(row.name.padEnd(nameWidth))} ${classTone(p, row.class)(row.class.padEnd(22))} ${p.dim('writes')} ${row.writes.padEnd(15)} ${p.dim('agents')} ${row.agents}`);
    lines.push(`    ${p.dim('target')} ${row.target}${row.implicit ? p.dim(' (implicit default)') : ''}`);
    if (row.error) lines.push(`    ${p.red('invalid:')} ${row.error}`);
    for (const persona of row.personas) lines.push(`    ${p.dim('persona')} ${persona.persona.padEnd(10)} ${persona.resolver.padEnd(11)} ${p.dim(persona.ref)}${persona.auth !== 'bearer' ? p.dim(` · ${persona.auth}`) : ''}`);
  }
  lines.push('', `${p.dim('selected:')} ${selected}  ${p.dim('(flag > TRACEGROVE_ENV > .tracegrove/settings.json > local)')}`);
  return lines.join('\n');
}

export function renderEnvShow(result: { environment: EnvRow; enabledFlows: string[]; approvalPending: boolean }, p: Paint): string {
  const e = result.environment;
  const lines = [`${p.bold(e.name)} ${classTone(p, e.class)(`[${e.class}]`)}`, `  target   ${e.target}`, `  writes   ${e.writes}`, `  agents   ${e.agents}${result.approvalPending ? p.amber('  (an approval is waiting)') : ''}`];
  if (e.budget) lines.push(`  budget   ${e.budget.maxRequests} requests per run${e.budget.maxSpendCents ? `, ${e.budget.maxSpendCents}¢` : ''}`);
  if (e.whoami) lines.push(`  whoami   ${e.whoami}`);
  lines.push('  personas');
  for (const persona of e.personas) {
    lines.push(`    ${stateMark(p, persona.state ?? 'missing')} ${persona.persona.padEnd(10)} ${(persona.state ?? '').padEnd(11)} ${persona.ref} ${p.dim(`(${persona.resolver}, ${persona.auth}${persona.subject ? `, expects ${persona.subject}` : ''})`)}`);
    if (persona.detail && persona.state !== 'resolvable') lines.push(`      ${p.dim(persona.detail)}`);
    if (persona.fix) lines.push(`      ${p.dim('run:')} ${p.moss(persona.fix)}`);
  }
  lines.push(`  flows    ${result.enabledFlows.length ? result.enabledFlows.join(', ') : p.dim('none enabled (add envs: [' + e.name + '] to a flow)')}`);
  return lines.join('\n');
}

function checkLine(p: Paint, c: DoctorCheck, width = 26): string[] {
  const out = [`  ${stateMark(p, c.state)} ${c.check.padEnd(width)} ${c.state === 'supported' ? p.dim(c.detail) : c.detail}`];
  if (c.state !== 'supported' && c.fix) out.push(`      ${p.dim('run:')} ${p.moss(c.fix)}${c.owner ? p.dim(` (owner: ${c.owner})`) : ''}`);
  else if (c.state === 'supported' && c.fix) out.push(`      ${p.dim('note:')} ${p.dim(c.fix)}`);
  return out;
}

export function renderDoctor(report: DoctorReport, p: Paint): string {
  const e = report.environment;
  const lines = [`${p.moss('tracegrove env doctor')} ${p.bold(e.name)} ${classTone(p, e.class)(`[${e.class}]`)}${e.origin ? p.dim(` · ${e.origin}`) : ''}`, ''];
  const width = Math.min(40, Math.max(18, ...report.checks.map(c => c.check.length)));
  for (const c of report.checks) lines.push(...checkLine(p, c, width));
  lines.push('', report.status === 'ready' ? p.moss('ready') : p.red(`blocked: ${report.checks.filter(c => c.required && c.state !== 'supported').map(c => c.check).join(', ') || report.preflight.errors.join(', ')}`));
  if (report.next) lines.push(`${p.bold('next:')} ${p.moss(report.next)}`);
  return lines.join('\n');
}

export function renderWhoami(result: { environment: string; checks: DoctorCheck[] }, p: Paint): string {
  return [`${p.moss('tracegrove whoami')} ${p.bold(result.environment)}`, ...result.checks.flatMap(c => checkLine(p, c))].join('\n');
}

export function renderExplain(r: ExplainReport, p: Paint): string {
  const e = r.environment;
  const lines = [`${p.moss('tracegrove explain')} ${p.bold(e.name)} ${classTone(p, e.class)(`[${e.class}]`)} ${p.dim(`· ${e.target} · writes ${e.writes}`)}`];
  if (e.expectedRelease) lines.push(p.dim(`  expects release ${e.expectedRelease}`));
  lines.push(`  agent: ${r.agent.name ?? 'none (a person)'} · policy ${r.agent.policy} · ${r.agent.wouldRun ? p.moss('may run') : p.red('may not run')} (${r.agent.reason})`, '');
  for (const c of r.cells) {
    lines.push(`  ${c.blockers.length ? p.amber('!') : p.moss('▸')} ${p.bold(c.caseId)}  ${p.dim(c.title)}`);
    lines.push(`      as ${c.credentials.map(x => `${x.persona} ← ${x.from}${x.auth !== 'bearer' ? ` (${x.auth})` : ''}`).join(', ')}`);
    lines.push(`      ${c.assertions.applicable} assertion(s) apply in ${e.class}${c.assertions.skipped ? `, ${c.assertions.skipped} skipped` : ''}`);
    if (c.writes.length || c.creates.length) lines.push(`      writes: ${[...c.creates, ...c.writes].join(', ')}`);
    for (const cleanup of c.cleanup) lines.push(`      cleanup: ${cleanup}`);
    for (const b of c.blockers) lines.push(`      ${p.amber(b.code)} ${b.detail}${b.fix ? `\n      ${p.dim('run:')} ${p.moss(b.fix)}` : ''}`);
  }
  for (const s of r.skipped) lines.push(`  ${p.dim('○')} ${s.caseId}  ${p.dim(s.reason)}`);
  for (const b of r.blockers) lines.push(`  ${p.amber('!')} ${p.bold(b.code)} ${b.detail}${b.fix ? `\n      ${p.dim('run:')} ${p.moss(b.fix)}` : ''}`);
  lines.push('', `${r.wouldRun ? p.moss('would run') : p.red('would not run')} · ${p.bold('next:')} ${p.moss(r.next)}`);
  return lines.join('\n');
}

export function renderCapabilities(m: CapabilityMatrix, p: Paint): string {
  const names = m.environments.map(e => e.name);
  const width = Math.max(...m.capabilities.map(c => c.id.length), 10);
  const col = Math.max(8, ...names.map(n => n.length + 2));
  const lines = [`${''.padEnd(width)}  ${names.map(n => n.padEnd(col)).join('')}`];
  for (const c of m.capabilities) lines.push(`${c.id.padEnd(width)}  ${names.map(n => { const cell = c.cells[n]!; return (cell.state === 'supported' ? p.moss('yes') : cell.state === 'denied' ? p.red('denied') : p.dim('no')) + ''.padEnd(col - (cell.state === 'supported' ? 3 : cell.state === 'denied' ? 6 : 2)); }).join('')}`);
  const notes = m.capabilities.flatMap(c => Object.entries(c.cells).filter(([, cell]) => cell.state !== 'supported' && m.environments.length === 1).map(([env, cell]) => `  ${c.id} in ${env}: ${cell.reason}${cell.fix ? ` → ${cell.fix}` : ''}`));
  return [...lines, ...(notes.length ? ['', ...notes] : [])].join('\n');
}

export function renderConfigEdit(r: ConfigEditResult, p: Paint): string {
  if (!r.changed) return `${r.path}: no change`;
  const diff = r.diff.split('\n').map(line => (line.startsWith('+') && !line.startsWith('+++') ? p.moss(line) : line.startsWith('-') && !line.startsWith('---') ? p.red(line) : p.dim(line))).join('\n');
  return `${diff}\n${r.dryRun ? p.amber('dry run: nothing written') : p.moss('written')}`;
}

export function renderApproval(a: Approval, p: Paint): string {
  return `${p.moss('approved')} the next ${a.uses === 1 ? 'agent run' : `${a.uses} agent runs`} in ${p.bold(a.environment)} until ${a.expiresAt} ${p.dim(`(by ${a.approvedBy}; bound to this environment's current config)`)}`;
}
