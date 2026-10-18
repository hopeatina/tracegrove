/**
 * Terminal rendering for the everyday commands: the run as a small tree (flows are branches,
 * steps are leaves, only failing branches unfold), the heal report, the status home screen and
 * a one-line live progress indicator. Colour only on a TTY without NO_COLOR.
 */
import { relative } from 'node:path';
import type { TestRunReport, CaseReport } from '../authoring/run.ts';
import type { HealReport } from '../authoring/heal.ts';
import { ageOf, type NextAction, type ProjectStatus } from '../authoring/status.ts';

export type Paint = { on: boolean; moss: (t: string) => string; red: (t: string) => string; amber: (t: string) => string; dim: (t: string) => string; bold: (t: string) => string };

export function paint(stream: NodeJS.WriteStream = process.stdout, env: NodeJS.ProcessEnv = process.env): Paint {
  const on = !!stream.isTTY && env.NO_COLOR === undefined && env.TERM !== 'dumb';
  const wrap = (open: string) => (t: string) => (on ? `\x1b[${open}m${t}\x1b[0m` : t);
  return { on, moss: wrap('32'), red: wrap('31'), amber: wrap('33'), dim: wrap('2'), bold: wrap('1') };
}

const LABEL: Record<string, string> = { passed: 'PASS', assertion_failed: 'FAIL', blocked: 'BLOCKED', infrastructure_failed: 'ERROR', inconclusive: 'INCONCLUSIVE', cancelled: 'CANCELLED' };

function mark(p: Paint, result: string): string {
  if (result === 'passed' || result === 'completed') return p.moss('✓');
  if (result === 'assertion_failed' || result === 'failed') return p.red('✗');
  if (result === 'not_run' || result === 'skipped') return p.dim('○');
  return p.amber('!');
}

function caseLines(p: Paint, c: CaseReport, last: boolean): string[] {
  const branch = last ? '└─' : '├─';
  const stem = last ? '   ' : '│  ';
  const label = LABEL[c.outcome] ?? c.outcome.toUpperCase();
  const tint = c.outcome === 'passed' ? p.moss : c.outcome === 'assertion_failed' ? p.red : p.amber;
  const head = `${p.dim(branch)} ${mark(p, c.outcome)} ${p.bold(c.caseId)}  ${tint(label)}  ${p.dim(`${c.steps.length} steps · ${c.durationMs} ms`)}`;
  if (c.outcome === 'passed') return [head];
  const lines = [head];
  if (c.failure?.step === '(app startup)' || c.failure?.step === '(case)') {
    lines.push(`${p.dim(stem)}   ${p.amber(c.failure.message)}`);
    return lines;
  }
  const width = Math.min(28, Math.max(...c.steps.map((s) => s.name.length)));
  c.steps.forEach((s, i) => {
    const leaf = i === c.steps.length - 1 ? '└─' : '├─';
    const req = s.method ? `${s.method} ${s.path}` : '';
    const status = s.status !== null ? ` → ${s.status}` : s.result === 'not_run' ? ' · not run' : '';
    lines.push(`${p.dim(`${stem}${leaf}`)} ${mark(p, s.result)} ${s.name.padEnd(width)}  ${p.dim(`${req}${status}`)}`);
    if (c.failure && c.failure.step === s.name && s.result !== 'not_run') {
      const pad = `${p.dim(`${stem}${i === c.steps.length - 1 ? '   ' : '│  '}`)}    `;
      for (const line of c.failure.message.split('\n')) lines.push(`${pad}${p.red(line)}`);
      if (c.failure.observed) lines.push(`${pad}${p.dim(c.failure.observed.length > 160 ? `${c.failure.observed.slice(0, 160)}…` : c.failure.observed)}`);
    }
  });
  return lines;
}

export function nextLines(p: Paint, next: NextAction[], max = 3): string[] {
  if (!next.length) return [];
  const width = Math.max(...next.slice(0, max).map((n) => n.command.length));
  return next.slice(0, max).map((n, i) => `${i === 0 ? p.bold('next:') : '     '} ${p.moss(n.command.padEnd(width))}  ${p.dim(n.why)}`);
}

export function runNext(report: TestRunReport): NextAction[] {
  if (report.outcome === 'passed') return [{ command: 'tracegrove ui', why: 'browse the run, its evidence and video' }];
  const startup = report.cases.some((c) => c.failure?.step === '(app startup)') || report.blockers.length > 0;
  return [
    { command: 'tracegrove heal', why: startup ? 'the app did not start; heal repairs setup and proves it with a re-run' : 'tell drifted tests from product bugs; keeps only fixes that pass' },
    { command: 'tracegrove show --run latest --json', why: 'the full failure, for you or your agent' },
  ];
}

export function renderTree(report: TestRunReport, root: string, p: Paint): string {
  const lines = [`${p.moss('tracegrove')} ${p.dim('·')} ${p.bold(report.project)} ${p.dim(`· app ${report.sourceDigest.slice(0, 12)}`)}`, p.dim('│')];
  for (const b of report.blockers) lines.push(`${p.dim('├─')} ${p.amber('!')} ${p.bold(b.code)}  ${b.detail}`, `${p.dim('│')}     ${p.dim(`fix: ${b.action}`)}`);
  report.cases.forEach((c, i) => lines.push(...caseLines(p, c, i === report.cases.length - 1)));
  const t = report.totals;
  const tally = `${p.moss(`${t.passed} passed`)}, ${t.failed ? p.red(`${t.failed} failed`) : `${t.failed} failed`}${t.other ? `, ${p.amber(`${t.other} other`)}` : ''}`;
  lines.push('', `${tally} ${p.dim('·')} run ${relative(root, report.runDir) || report.runDir}${report.bundleVerified === false ? ` ${p.red('· BUNDLE INVALID')}` : ''}`);
  const next = nextLines(p, runNext(report), 2);
  if (next.length) lines.push(...next);
  return lines.join('\n');
}

export function renderHeal(report: HealReport, root: string, p: Paint): string {
  const tone = report.outcome === 'healed' || report.outcome === 'healthy' ? p.moss : report.outcome === 'product_bugs' ? p.red : p.amber;
  const title: Record<HealReport['outcome'], string> = { healthy: 'Nothing to heal: every flow passes', healed: 'Healed: every fix was proven by a re-run', partly_healed: 'Partly healed', product_bugs: 'Product bugs found: the tests stay red on purpose', needs_human: 'Needs you: nothing safe to fix automatically', cancelled: 'Heal cancelled: inspect the saved changes and run receipts' };
  const lines = [`${p.moss('tracegrove heal')} ${p.dim(`· ${report.id}`)}`, tone(p.bold(title[report.outcome])), ''];
  const kindLabel: Record<string, string> = { setup: 'setup', authoring: 'authoring', test_drift: 'test drift', product_bug: 'PRODUCT BUG', assertion: 'failing', evidence: 'evidence', infrastructure: 'infrastructure' };
  for (const f of report.findings) {
    const icon = f.status === 'fixed' ? p.moss('✓') : f.kind === 'product_bug' ? p.red('✗') : p.amber('!');
    const label = f.kind === 'product_bug' ? p.red(kindLabel[f.kind]!) : p.dim(kindLabel[f.kind] ?? f.kind);
    lines.push(`  ${icon} ${label}  ${p.bold(f.caseId ?? f.file ?? 'project')}${f.step ? p.dim(` · ${f.step}`) : ''}`);
    lines.push(`      ${f.detail.split('\n')[0]!.slice(0, 160)}`);
    lines.push(`      ${p.dim(f.status === 'fixed' ? 'fixed' : '→')} ${f.fix}`);
  }
  const kept = report.changes.filter((c) => c.status === 'kept');
  const other = report.changes.filter((c) => c.status !== 'kept');
  if (kept.length) {
    lines.push('', p.bold('Kept changes'));
    for (const c of kept) {
      lines.push(`  ${p.moss('✓')} ${c.file} ${p.dim(`(${c.by}; ${c.note ?? ''})`)}`);
      for (const d of c.diff.split('\n').slice(2)) lines.push(`      ${d.startsWith('+') ? p.moss(d) : d.startsWith('-') ? p.red(d) : p.dim(d)}`);
    }
  }
  if (other.length) {
    lines.push('', p.bold('Tried and not kept'));
    for (const c of other) lines.push(`  ${p.dim('○')} ${c.file} ${p.dim(`${c.status}: ${c.note ?? c.reason}`)}`);
  }
  if (report.agent) lines.push('', p.dim(`agent: ${report.agent.provider}${report.agent.model ? ` (${report.agent.model})` : ''}, exit ${report.agent.exitCode}, ${report.agent.verdicts.length} verdict(s)`));
  const b = report.before.totals; const a = report.after.totals;
  if (b && a) lines.push(p.dim(`before: ${b.passed} passed, ${b.failed} failed, ${b.other} other  →  after: ${a.passed} passed, ${a.failed} failed, ${a.other} other`));
  lines.push(p.dim(`report: ${relative(root, report.reportPath)}`), ...nextLines(p, report.next));
  return lines.join('\n');
}

export function renderStatus(s: ProjectStatus, p: Paint): string {
  if (!s.config.found) return [`${p.moss('tracegrove')} ${p.dim('· no tracegrove.config.yaml here or above')}`, '', ...nextLines(p, s.next), '', p.dim('tracegrove --help for every command')].join('\n');
  const run = s.latestRun;
  const runLine = run
    ? `${run.outcome === 'passed' ? p.moss('●') : run.outcome === 'assertion_failed' ? p.red('●') : p.amber('●')} last run ${p.bold(LABEL[run.outcome]?.toLowerCase() ?? run.outcome)}  ${run.totals.passed} passed, ${run.totals.failed} failed${run.totals.other ? `, ${run.totals.other} other` : ''}  ${p.dim(ageOf(run.finishedAt))}`
    : `${p.dim('○')} no runs yet`;
  const lines = [
    `${p.moss('tracegrove')} ${p.dim('·')} ${p.bold(s.config.project ?? '?')} ${p.dim(`· ${s.config.adapter ?? '?'} · ${s.root}`)}`,
    '',
    `  ${s.check.ok ? p.moss('●') : p.red('●')} ${s.flows} flow(s)${s.check.ok ? ' compile' : ` · ${p.red(`${s.check.issues} issue(s)`)} ${p.dim(s.check.first ?? '')}`}`,
    `  ${runLine}`,
    ...(run && run.failing.length ? [`    ${p.dim(`not passing: ${run.failing.slice(0, 4).join(', ')}${run.failing.length > 4 ? ', …' : ''}`)}`] : []),
    ...(s.coverage && s.coverage.routes ? [`  ${s.coverage.uncovered ? p.amber('●') : p.moss('●')} ${s.coverage.routes} route(s), ${s.coverage.uncovered} uncovered${s.coverage.changed ? `, ${s.coverage.changed} changed on this branch` : ''}`] : []),
    `  ${s.agent.installed ? p.moss('●') : p.dim('○')} agent ${s.agent.provider}${s.agent.model ? p.dim(` · ${s.agent.model}`) : ''}${s.agent.installed ? '' : p.dim(' · not installed')}`,
    ...(s.latestHeal ? [`  ${p.dim('○')} last heal ${s.latestHeal.outcome.replace('_', ' ')}${s.latestHeal.kept ? `, ${s.latestHeal.kept} change(s) kept` : ''} ${p.dim(s.latestHeal.id)}`] : []),
    '',
    ...nextLines(p, s.next),
  ];
  return lines.join('\n');
}

/** A single rewritable stderr line; a no-op when stderr is not a terminal. */
export function progressLine(stream: NodeJS.WriteStream = process.stderr): { update: (text: string) => void; done: () => void } {
  if (!stream.isTTY) return { update: () => {}, done: () => {} };
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0; let text = ''; const started = Date.now();
  const draw = () => { const cols = stream.columns ?? 80; const line = `${frames[i++ % frames.length]} ${text} \x1b[2m${Math.round((Date.now() - started) / 1000)}s\x1b[0m`; stream.write(`\r\x1b[2K${line.slice(0, cols + 8)}`); };
  const timer = setInterval(draw, 120); timer.unref();
  return { update: (next) => { text = next; draw(); }, done: () => { clearInterval(timer); stream.write('\r\x1b[2K'); } };
}
