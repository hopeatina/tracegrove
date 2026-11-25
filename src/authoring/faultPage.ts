import { join } from 'node:path';
import { inspectFault, projectFaults } from './faultProof.ts';
import { savedRunDirectory } from './runLocation.ts';
import { readSavedRun } from './runSource.ts';

const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function faultPage(root: string, run: string, name: string) {
  const fault = projectFaults(root).find(f => f.name === name);
  if (!fault) throw new Error('Unknown fault');
  const proof = inspectFault(root, run, fault);
  const healthy = savedRunDirectory(root, run);
  function column(title: string, dir: string) {
    const c = dir ? readSavedRun(dir).cases.find(c => c.caseId === fault?.caseId) : undefined;
    const step = c?.steps.find(s => s.id === fault?.step);
    const call = c?.steps.find(s => s.method === 'VOICE');
    return '<section><h2>' + title + '</h2>' + (call?.observedText ? '<details open><summary>Call transcript</summary><pre>' + escape(call.observedText) + '</pre></details>' : '') +
      '<h3>Independent observation</h3><pre>' + escape(step ? [step.method, step.path, step.status ?? '', step.answer ?? step.observedText ?? ''].join(' ') : 'Unavailable') +
      '</pre><small>' + escape(dir ? join(dir, 'bundle') : '') + '</small></section>';
  }
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fault comparison</title>' +
    '<style>body{max-width:76rem;margin:3rem auto;padding:0 1rem;font:16px/1.5 system-ui;background:#fafaf6;color:#172b22}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:1rem}section{background:white;border:1px solid #cdd6cc;padding:1.3rem;border-radius:.5rem}pre,small{white-space:pre-wrap;overflow-wrap:anywhere}h1{line-height:1.2}</style>' +
    '<h1>' + escape(proof.name) + '</h1><p>' + escape(proof.caught ? 'Caught by ' + proof.caseId + ' · ' + proof.step : proof.reason) + '</p><main>' +
    column('Healthy control', healthy) + column('Fault enabled', proof.faultRun) + '</main><p><a href="/">Open the workbench</a></p></html>';
}
