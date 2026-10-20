/**
 * `tracegrove handoff`: a self-contained HTML page a builder can send a client at handoff. It shows
 * each claim with its four states, what the agent actually said and did (transcripts and tool calls),
 * the independent readbacks behind it, who signed off, and what the evidence does not cover.
 * Everything comes from verified run bundles; nothing is re-run and nothing leaves the machine.
 */
import { join } from 'node:path';
import { readVerifiedBundle } from '../core/bundle.ts';
import { ConversationObservation } from '../protocol/index.ts';
import { compileProject, configInDirectory } from './compile.ts';
import { readiness, readDecisions, type Claim, type Readiness } from './readiness.ts';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const short = (value: unknown, max = 220) => { const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > max ? `${text.slice(0, max)}…` : text; };

type StepView = { name: string; kind: string; result: string; line: string; conversation: ConversationObservation | null };

function stepsFor(root: string, claim: Claim, names: Map<string, string>): StepView[] {
  if (!claim.run) return [];
  try {
    const receipt = readVerifiedBundle(join(root, '.tracegrove', 'runs', claim.run, 'bundle')).receipts.find((r) => r.caseRef.id === claim.caseId);
    if (!receipt) return [];
    return receipt.steps.map((step) => {
      const conversation = ConversationObservation.safeParse(step.output);
      const output = (step.output ?? {}) as { method?: string; url?: string; status?: number; body?: unknown };
      const line = conversation.success ? `${conversation.data.channel} · ${conversation.data.turns.length} turn(s)`
        : output.status !== undefined ? `${output.method ?? ''} ${(output.url ?? '').replace(/^https?:\/\/[^/]+/, '')} → ${output.status} ${short(output.body ?? '', 160)}` : step.result;
      return { name: names.get(`${claim.caseId}/${step.stepId}`) ?? step.stepId, kind: conversation.success ? 'conversation' : 'http', result: step.result, line, conversation: conversation.success ? conversation.data : null };
    });
  } catch { return []; }
}

const chip = (label: string, tone: 'good' | 'bad' | 'warn' | 'muted') => `<span class="chip ${tone}">${esc(label)}</span>`;
const tone = { supported: 'good', contradicted: 'bad', inconclusive: 'warn', none: 'muted', current: 'good', stale: 'warn', superseded: 'warn',
  completed: 'good', blocked: 'warn', interrupted: 'warn', not_run: 'muted', accepted: 'good', auto: 'good', pending: 'warn', rejected: 'bad', waived: 'warn', challenged: 'bad' } as const;

export function renderHandoff(dir: string, options: { preparedBy?: string; client?: string } = {}): { html: string; state: Readiness } {
  const state = readiness(dir);
  const compiled = compileProject(configInDirectory(dir)!);
  const names = new Map(compiled.flows.flatMap((flow) => flow.steps.map((step) => [`${flow.caseId}/${step.id}`, step.name] as const)));
  const decisions = readDecisions(compiled.root, compiled.config.testDir);
  const redact = compiled.config.privacy?.redact ?? [];
  const sections = state.claims.map((claim) => {
    const steps = stepsFor(compiled.root, claim, names);
    const body = steps.map((step) => step.conversation ? `
      <div class="step"><div class="step-head"><b>${esc(step.name)}</b> ${chip(step.result, step.result === 'completed' ? 'good' : 'bad')} <span class="muted">${esc(step.line)}</span></div>
      <div class="transcript">${step.conversation.turns.map((turn) => `
        <div class="bubble caller"><span class="who">Caller</span>${esc(turn.say)}</div>
        ${turn.toolCalls.map((call) => `<div class="tool">tool <code>${esc(call.name)}</code> ${esc(short(call.arguments, 140))} → ${esc(short(call.result, 160))}</div>`).join('')}
        <div class="bubble agent"><span class="who">Agent${turn.firstReplyMs !== null ? ` · ${turn.firstReplyMs} ms` : ''}</span>${esc(turn.reply || '(no reply)')}</div>`).join('')}
      </div></div>`
      : `<div class="step"><div class="step-head"><b>${esc(step.name)}</b> ${chip(step.result, step.result === 'completed' ? 'good' : 'bad')}</div><code class="line">${esc(step.line)}</code></div>`).join('');
    return `<section class="claim" id="${esc(claim.caseId)}">
      <div class="claim-head"><h3>${esc(claim.title)}</h3><span class="muted mono">${esc(claim.caseId)} · ${esc(claim.risk)}</span></div>
      <div class="states">
        <div><span class="label">Ran</span>${chip(claim.execution.replace('_', ' '), tone[claim.execution])}</div>
        <div><span class="label">Evidence</span>${chip(claim.assessment, tone[claim.assessment])}</div>
        <div><span class="label">Still valid</span>${chip(claim.validity, tone[claim.validity])}</div>
        <div><span class="label">Sign-off</span>${chip(claim.decision === 'auto' ? 'accepted by policy' : claim.decision, tone[claim.decision])}${claim.decidedBy && claim.decision !== 'auto' ? ` <span class="muted">${esc(claim.decidedBy)}</span>` : ''}</div>
      </div>
      ${claim.reason ? `<p class="note">${esc(claim.reason)}</p>` : ''}
      ${claim.failure ? `<p class="fail">${esc(claim.failure)}</p>` : ''}
      ${body || '<p class="muted">No verified run yet.</p>'}
      <p class="muted small">Evidence: ${esc(claim.channels.join(', '))}${claim.run ? ` · run ${esc(claim.run)} · ${esc(claim.ranAt)}` : ''}</p>
    </section>`;
  }).join('\n');
  const signoffs = decisions.filter((d) => state.claims.some((c) => c.caseId === d.case)).slice(-20).reverse();
  const verdict = state.ready ? `Ready for handoff${state.counts.waived ? ` (${state.counts.waived} waived)` : ''}` : `Not ready: ${state.claims.length - state.counts.ready} of ${state.claims.length} claims open`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(state.project)} handoff</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d2420;--muted:#66706a;--line:#e3e1da;--card:#fff;--good:#1f7a4d;--good-bg:#e5f3ea;--bad:#a8322a;--bad-bg:#f8e5e3;--warn:#8a5a00;--warn-bg:#fbf0d9;--accent:#2f6b4f}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--fg:#e8ece9;--muted:#9aa49e;--line:#2a302c;--card:#1a1e1b;--good:#7fd1a4;--good-bg:#173325;--bad:#f0a29a;--bad-bg:#3a1c19;--warn:#f0c46a;--warn-bg:#352a12;--accent:#8fd0ad}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 64px}h1{font-size:28px;margin:4px 0 8px}h2{font-size:18px;margin:32px 0 12px}h3{font-size:16px;margin:0}
.label{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.muted{color:var(--muted)}.small{font-size:13px}.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.verdict{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:600;background:${state.ready ? 'var(--good-bg)' : 'var(--warn-bg)'};color:${state.ready ? 'var(--good)' : 'var(--warn)'}}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:16px 0}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.kpi b{display:block;font-size:22px}
.claim{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}.claim-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline}
.states{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}
.chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}.chip.good{background:var(--good-bg);color:var(--good)}.chip.bad{background:var(--bad-bg);color:var(--bad)}.chip.warn{background:var(--warn-bg);color:var(--warn)}.chip.muted{background:var(--line);color:var(--muted)}
.step{border-top:1px solid var(--line);padding:10px 0}.step-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.line{display:block;margin-top:4px;overflow-wrap:anywhere;color:var(--muted)}
.transcript{display:flex;flex-direction:column;gap:6px;margin-top:8px}.bubble{max-width:85%;padding:8px 12px;border-radius:12px}.bubble .who{display:block;font-size:11px;color:var(--muted);margin-bottom:2px}
.caller{align-self:flex-end;background:var(--line)}.agent{align-self:flex-start;background:var(--good-bg)}.tool{align-self:flex-start;font-size:12px;color:var(--muted);font-family:ui-monospace,monospace;overflow-wrap:anywhere}
.fail{color:var(--bad);background:var(--bad-bg);padding:8px 10px;border-radius:8px}.note{background:var(--warn-bg);padding:8px 10px;border-radius:8px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
ul{padding-left:20px}@media print{.claim{break-inside:avoid}}
</style></head><body><main>
<span class="label">${esc(options.client ? `Prepared for ${options.client}` : 'Handoff report')}</span>
<h1>${esc(state.project)}</h1>
<p><span class="verdict">${esc(verdict)}</span> <span class="muted">Checked ${esc(new Date(state.checkedAt).toUTCString())}${options.preparedBy ? ` · prepared by ${esc(options.preparedBy)}` : ''}</span></p>
<div class="kpis">
<div class="kpi"><span class="label">Claims</span><b>${state.counts.claims}</b></div>
<div class="kpi"><span class="label">Supported</span><b>${state.counts.supported}</b></div>
<div class="kpi"><span class="label">Contradicted</span><b>${state.counts.contradicted}</b></div>
<div class="kpi"><span class="label">Out of date</span><b>${state.counts.stale}</b></div>
<div class="kpi"><span class="label">Awaiting sign-off</span><b>${state.counts.pending}</b></div>
</div>
<p class="muted">Each claim below was checked by running the real app: tracegrove played the user (a caller, a chat customer or an API client), then read the result back separately as staff, and as someone who should be refused. "Still valid" turns to out of date when the app or the check changes after the run.</p>
<h2>Claims</h2>
${sections}
${signoffs.length ? `<h2>Sign-off record</h2><table><tr><th>Claim</th><th>Decision</th><th>By</th><th>When</th><th>Reason</th></tr>${signoffs.map((d) => `<tr><td class="mono">${esc(d.case)}</td><td>${esc(d.decision)}</td><td>${esc(d.by)}</td><td class="mono">${esc(d.at.slice(0, 16).replace('T', ' '))}</td><td>${esc(d.reason)}</td></tr>`).join('')}</table>` : ''}
<h2>What this does not cover</h2>
<ul>
<li>Voice checks send the caller's words as text over the agent's own protocol (RTVI). They cover what the agent says, which tools it calls and what those tools change; they do not cover speech recognition, voice quality or the phone network.</li>
<li>Rule-based expectations check named phrases and tools; they do not judge tone or every possible wording.</li>
<li>Runs are local to the machine that produced them. Evidence bundles are integrity-checked but unsigned, so trust them as far as you trust who sent them.</li>
${redact.length ? `<li>Client data matching ${esc(redact.map((r) => typeof r === 'string' ? r : r.name).join(', '))} was redacted before anything was written, so it does not appear above.</li>` : ''}
</ul>
<p class="muted small">Generated by tracegrove · source digest ${esc(state.sourceDigest.slice(0, 16))}</p>
</main></body></html>`;
  return { html, state };
}
