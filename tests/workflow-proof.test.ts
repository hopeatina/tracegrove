import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { projectFaults, challengeFault, inspectFault } from '../src/authoring/faultProof.ts';
import { runImpact } from '../src/authoring/impact.ts';
import { runTests } from '../src/authoring/run.ts';
import { recordFlow } from '../src/cli/record.ts';
import { renderCard } from '../src/authoring/card.ts';
import { faultPage } from '../src/authoring/faultPage.ts';

const roots: string[] = [];
function sample(name: string) {
  const root = mkdtempSync(join(tmpdir(), 'tg-workflow-'));
  roots.push(root);
  cpSync(join(import.meta.dirname, '../src/samples', name), root, { recursive: true });
  return { root, config: join(root, 'tracegrove.config.yaml') };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('paired evidence', () => {
  it('requires the exact sealed observations and reports tampering', async () => {
    const { root, config } = sample('voice-receptionist');
    const fault = projectFaults(root)[0]!;
    const { report } = await runTests({ configPath: config, caseIds: [fault.caseId] });
    const { proof, report: broken } = await challengeFault(config, fault, report);
    expect(proof).toMatchObject({ caught: true, healthy: 200, broken: 404 });
    expect(renderCard({ dirs: [root] }).markdown).toContain('200 | 404 | Caught');
    expect(faultPage(root, basename(report.runDir), fault.name)).toContain('Call transcript');
    for (const change of [{ caseId: 'other' }, { step: 'other' }, { check: 'other' }, { got: 500 }, { expected: 201 }])
      expect(inspectFault(root, basename(report.runDir), { ...fault, ...change }).caught).toBe(false);
    writeFileSync(join(broken.runDir, 'bundle/manifest.json'), '{}');
    expect(inspectFault(root, basename(report.runDir), fault).caught).toBe(false);
  }, 45000);
});

it('records a browser action, replays it with a fresh provider, and saves only verified flows', async () => {
  const { root, config } = sample('saas-billing');
  const html = '<button onclick="fetch(\'/subscription\',{method:\'POST\',body:JSON.stringify({plan:\'team\'})}).then(()=>document.querySelector(\'output\').textContent=\'Done\')">Upgrade</button><output data-testid="result"></output>';
  const app = join(root, 'app/billing.mjs');
  writeFileSync(app, readFileSync(app, 'utf8').replace('  const auth =', '  if (url.pathname === "/upgrade") { res.writeHead(200,{"content-type":"text/html"}); return res.end(' + JSON.stringify(html) + '); }\n  const auth ='));
  const preview = createServer((req, res) => {
    if (req.url === '/upgrade') { res.setHeader('content-type','text/html'); res.end(html); }
    else res.end('{}');
  });
  await new Promise<void>(done => preview.listen(0,'127.0.0.1',done));
  const port = (preview.address() as {port: number}).port;
  async function* steps(count: number) {
    yield JSON.stringify({ kind:'click', target:{by:'role',role:'button',name:'Upgrade'} });
    yield JSON.stringify({ browser:{kind:'read', target:{by:'testId',name:'result'}}, expect:{text:'Done'} });
    yield JSON.stringify({ standin:'payments', received:'POST /v1/charges', expect:{calls:count, json:{'calls[0].json.customer':'acme'}} });
    yield '"save"';
  }
  try {
    const options = { config, url: 'http://127.0.0.1:' + port + '/upgrade', title:'A team upgrade charges Acme once', headed:false, emit:()=>{} };
    await recordFlow({ ...options, name:'upgrade', lines:steps(1) });
    const path = join(root,'tracegrove/upgrade.flow.yaml');
    expect(parse(readFileSync(path,'utf8')).steps.at(-1).expect.calls).toBe(1);
    await expect(recordFlow({ ...options, name:'wrong', lines:steps(2) })).rejects.toThrow();
    expect(existsSync(join(root,'tracegrove/wrong.flow.yaml'))).toBe(false);
  } finally { preview.closeAllConnections(); await new Promise<void>(done => preview.close(() => done())); }
}, 60000);

it('shadows a selected flow against the full suite and widens on an unknown change', async () => {
  const { root, config } = sample('notes-api');
  const git = (...args: string[]) => execFileSync('git', args, { cwd:root, stdio:'pipe' }).toString().trim();
  writeFileSync(join(root,'.gitignore'), '.tracegrove/\n');
  git('init','-q'); git('config','user.name','Tracegrove'); git('config','user.email','test@example.test');
  git('add','.'); git('commit','-qm','base'); const base = git('rev-parse','HEAD');
  const { report } = await runTests({ configPath:config });
  const file = join(root,'tracegrove/notes/list.flow.yaml');
  writeFileSync(file,readFileSync(file,'utf8')+'\n# branch change\n');
  git('commit','-qam','change one flow');
  const result = await runImpact(config,base,basename(report.runDir),false);
  expect(result.plan.caseIds).toEqual(['notes.list']);
  expect(result.shadow?.report.cases.length).toBe(2);
  expect(result.exitCode).toBe(0);
  mkdirSync(join(root,'shared')); writeFileSync(join(root,'shared/change.txt'),'changed');git('add','.');git('commit','-qm','unknown');
  const widened = await runImpact(config,base,basename(report.runDir),true);
  expect(widened.plan.full).toBe(true);
}, 45000);
