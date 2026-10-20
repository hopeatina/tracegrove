import type { Readiness } from '../authoring/readiness.ts';
import type { Paint } from './render.ts';

const MARK: Record<string, string> = { supported: '●', contradicted: '✗', inconclusive: '?', none: '○' };

/** One line per claim: the four states, then what to do about the ones that are not ready. */
export function renderReadiness(state: Readiness, c: Paint): string {
  const width = Math.min(48, Math.max(12, ...state.claims.map((claim) => claim.caseId.length)));
  const color = (value: string) => ['supported', 'current', 'completed', 'accepted', 'auto'].includes(value) ? c.moss(value)
    : ['contradicted', 'rejected', 'challenged'].includes(value) ? c.red(value) : ['none', 'not_run'].includes(value) ? c.dim(value) : c.amber(value);
  const cell = (value: string, w: number) => `${color(value)}${' '.repeat(Math.max(0, w - value.length))}`;
  const lines = [
    `${c.bold(state.project)}  ${state.ready ? c.moss('ready for handoff') : c.amber(`not ready: ${state.claims.length - state.counts.ready} of ${state.claims.length} claims open`)}`,
    c.dim(`  ${'claim'.padEnd(width)}  ran         evidence      still valid   sign-off`),
    ...state.claims.map((claim) => `${MARK[claim.assessment] ?? ' '} ${claim.caseId.padEnd(width)}  ${cell(claim.execution, 10)}  ${cell(claim.assessment, 12)}  ${cell(claim.validity, 12)}  ${color(claim.decision)}${claim.decidedBy && claim.decision !== 'auto' ? c.dim(` ${claim.decidedBy}`) : ''}`),
  ];
  if (state.next.length) lines.push('', c.bold('next'), ...state.next.map((n) => `  ${n.command}  ${c.dim(n.why)}`));
  return lines.join('\n');
}
