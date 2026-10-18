import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request, type ClientRequest } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';
import { stringify } from 'yaml';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { renderText, type TestRunReport } from '../src/authoring/run.ts';

const roots: string[] = [], servers: UiServer[] = [], children: ChildProcess[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL'); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-ui-cancel-')); roots.push(root);
  const control = join(root, 'control'); mkdirSync(control); mkdirSync(join(root, 'app')); mkdirSync(join(root, 'tracegrove'));
  writeFileSync(join(root, 'app/app.mjs'), `import {createServer} from 'node:http';import{existsSync,writeFileSync,appendFileSync}from'node:fs';import{join}from'node:path';
const dir=process.env.CONTROL;appendFileSync(join(dir,'starts'),process.pid+'\\n');
createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/health'){res.end('{}');return;}writeFileSync(join(dir,'seen'),'seen');const until=Date.now()+15000;while(!existsSync(join(dir,'release'))&&Date.now()<until)await new Promise(r=>setTimeout(r,10));res.end('{"state":"ready"}');}).listen(Number(process.env.PORT),'127.0.0.1');`);
  writeFileSync(join(root, 'tracegrove.config.yaml'), stringify({ project: 'cancel-fixture', app: { adapter: 'node', entry: 'app/app.mjs', health: '/health', sources: ['app/**'], env: { CONTROL: control } }, personas: { fixture: { subject: 'synthetic' } }, agent: { provider: 'none' }, defaults: { stepTimeoutMs: 12000, caseTimeoutMs: 20000 } }));
  writeFileSync(join(root, 'tracegrove/slow.flow.yaml'), stringify({ title: 'Owned cancellable fixture request', steps: [{ GET: '/slow', as: 'none', expect: 200 }] }));
  return { root, control };
}
async function session(root: string) {
  const ui = await startUi({ dir: root }); servers.push(ui);
  const html = await (await fetch(ui.url)).text(); const token = /const TOKEN='([^']+)'/.exec(html)![1]!;
  return { ui, token };
}
const post = async (ui: Pick<UiServer, 'url'>, token: string, path: string, body: unknown) => {
  const response = await fetch(ui.url + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tracegrove-token': token }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
async function active(ui: Pick<UiServer, 'url'>, control: string) {
  await expect.poll(() => existsSync(join(control, 'seen')), { timeout: 15000 }).toBe(true);
  const report = await (await fetch(ui.url + 'api/run-control')).json(); expect(report.runId).toMatch(/^[a-f0-9]{24}$/); return report.runId as string;
}
function assertCleanup(report: TestRunReport, control: string, expected: 'passed' | 'cancelled') {
  expect(report.outcome).toBe(expected); expect(report.exitCode).toBe(expected === 'cancelled' ? 4 : 0);
  expect(report.stateDir).toBeDefined(); expect(renderText(report, roots.at(-1)!)).toContain(`execution ${report.executionId} · state ${report.stateDir}`);
  expect(verifyBundle(join(report.runDir, 'bundle'))).toMatchObject({ ok: true, outcome: expected });
  const records = readVerifiedBundle(join(report.runDir, 'bundle'));
  expect(records.receipts.every(r => r.cleanup.remainingUnknownMutations === 0 && r.cleanup.confirmed.includes('host.process') && r.cleanup.confirmed.includes('host.workspace'))).toBe(true);
  for (const resource of records.receipts.flatMap(r => r.cleanup.ownedResources)) {
    if (resource.entityKey === 'host.workspace') expect(existsSync(resource.physicalId)).toBe(false);
    if (resource.entityKey === 'host.process') absentPid(resource.physicalId);
  }
  for (const pid of readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')) absentPid(pid);
}
function absentPid(pid: string) {
  expect(pid).toMatch(/^[1-9][0-9]*$/);
  let code: string | undefined;
  try { process.kill(Number(pid), 0); } catch (error) { code = (error as NodeJS.ErrnoException).code; }
  expect(code).toBe('ESRCH');
}
async function pendingBody(ui: UiServer, token: string, path: string) {
  let req!: ClientRequest; let accepted!: () => void;
  const continuation = new Promise<void>(resolve => { accepted = resolve; });
  const response = new Promise<{ status: number; body: any }>((resolve, reject) => {
    req = request({ hostname: '127.0.0.1', port: ui.port, path, method: 'POST', headers: { 'content-type': 'application/json', 'x-tracegrove-token': token, expect: '100-continue' } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(body) }));
    }); req.on('error', reject); req.once('continue', accepted); req.flushHeaders();
  }); await continuation; return { req, response };
}

it('cancels only the identified owned run and waits for verified cleanup, including repeated requests', async () => {
  const { root, control } = fixture(); const { ui, token } = await session(root);
  const run = post(ui, token, 'api/test', {}); const runId = await active(ui, control);
  expect((await post(ui, 'wrong-token', 'api/cancel', { runId })).status).toBe(403);
  expect((await post(ui, token, 'api/cancel', { runId: 'foreign' })).status).toBe(409);
  expect((await (await fetch(ui.url + 'api/run-control')).json()).cancelling).toBe(false);
  const cancellations = await Promise.all([post(ui, token, 'api/cancel', { runId }), post(ui, token, 'api/cancel', { runId })]);
  expect(cancellations[0]!.status).toBe(200); expect([200, 409]).toContain(cancellations[1]!.status);
  const result = await run; expect(result.status).toBe(200); assertCleanup(result.body, control, 'cancelled');
  const saved = await (await fetch(ui.url + 'api/runs/' + result.body.runDir.split('/').at(-1))).json();
  expect(saved.evidenceStatus).toBe('verified'); expect(saved.stateDir).toBe(result.body.stateDir);
  expect(readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  expect(cancellations[0]!.body.executionId).toBe(result.body.executionId);
  expect(cancellations[0]!.body.cleanup).toContain('cancellation alone does not confirm cleanup');
}, 30000);

it('does not let a slowly delivered old cancellation abort a newer run', async () => {
  const { root, control } = fixture(); const { ui, token } = await session(root);
  const first = post(ui, token, 'api/test', {}); const firstId = await active(ui, control);
  const stale = await pendingBody(ui, token, '/api/cancel');
  writeFileSync(join(control, 'release'), 'release'); assertCleanup((await first).body, control, 'passed');
  rmSync(join(control, 'release')); rmSync(join(control, 'seen'));
  const second = post(ui, token, 'api/test', {}); const secondId = await active(ui, control); expect(secondId).not.toBe(firstId);
  stale.req.end(JSON.stringify({ runId: firstId })); expect((await stale.response).status).toBe(409);
  const current = await (await fetch(ui.url + 'api/run-control')).json(); expect(current.runId).toBe(secondId); expect(current.cancelling).toBe(false);
  await post(ui, token, 'api/cancel', { runId: secondId }); assertCleanup((await second).body, control, 'cancelled');
}, 30000);

it('sets closing before awaiting cleanup and refuses delayed test/draft admission', async () => {
  const { root, control } = fixture(); const { ui, token } = await session(root);
  const run = post(ui, token, 'api/test', {}); await active(ui, control);
  const delayedTest = await pendingBody(ui, token, '/api/test'), delayedDraft = await pendingBody(ui, token, '/api/agent-draft'), delayedTemplate = await pendingBody(ui, token, '/api/draft');
  const delayedSource = await pendingBody(ui, token, '/api/source'), delayedPreview = await pendingBody(ui, token, '/api/source/preview');
  const closed = ui.close(); delayedSource.req.end(JSON.stringify({ source: { kind: 'working_tree' } })); delayedPreview.req.end(JSON.stringify({ path: '/never' }));
  expect((await delayedSource.response).status).toBe(409); expect((await delayedPreview.response).status).toBe(409);
  delayedTest.req.end('{}'); delayedDraft.req.end('{}'); delayedTemplate.req.end(JSON.stringify({ method: 'GET', path: '/never', save: true }));
  expect((await delayedTest.response).status).toBe(409); expect((await delayedDraft.response).status).toBe(409); expect((await delayedTemplate.response).status).toBe(409);
  assertCleanup((await run).body, control, 'cancelled'); await closed;
  expect(readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  expect(existsSync(join(root, 'tracegrove/discovered'))).toBe(false);
}, 30000);

it('cancels through the real browser button and retains a readable 375px result', async () => {
  const { root, control } = fixture(); const { ui } = await session(root); const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } }); await page.route('https://**/*', route => route.abort()); await page.goto(ui.url);
    const result = page.waitForResponse(response => response.url().endsWith('/api/test') && response.request().method() === 'POST');
    void result.catch(() => {}); // The original promise is awaited below; cleanup may close it after an earlier assertion fails.
    await page.getByRole('button', { name: 'Run all', exact: true }).click(); await active(ui, control);
    await expect.poll(() => page.getByRole('button', { name: 'Cancel run', exact: true }).count()).toBe(1);
    expect(await page.getByRole('complementary', { name: 'Step detail' }).getByRole('button', { name: 'Run current flow', exact: true }).isDisabled()).toBe(true);
    const evidence = join(process.cwd(), 'artifacts/qa/ui-cancellation'); mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'active-375.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Cancel run', exact: true }).click(); const report = await (await result).json(); assertCleanup(report, control, 'cancelled');
    await expect.poll(() => page.getByRole('button', { name: 'Run all', exact: true }).count()).toBe(1);
    await page.screenshot({ path: join(evidence, 'cancelled-375.png'), fullPage: true, animations: 'disabled' });
  } finally { await browser.close(); }
}, 30000);

it('closes after the owned run settles even when an admitted connection never completes its body', async () => {
  const { root, control } = fixture(); const { ui, token } = await session(root);
  const run = post(ui, token, 'api/test', {}); await active(ui, control);
  const unfinished = await pendingBody(ui, token, '/api/test');
  const rejected = unfinished.response.catch(error => error);
  const started = Date.now(); await ui.close();
  expect(Date.now() - started).toBeLessThan(5000);
  expect((await rejected).status).toBe(409); // Explicit refusal is flushed before the unread body is closed.
  assertCleanup((await run).body, control, 'cancelled');
  expect(readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
}, 10000);

it.each([{ mode: 'valid token', status: 409 }, { mode: 'wrong token', status: 403 }, { mode: 'wrong host', status: 421 }])('flushes and closes a new unfinished $mode request during shutdown', async ({ mode, status }) => {
  const { root, control } = fixture(); const { ui, token } = await session(root);
  const run = post(ui, token, 'api/test', {}); await active(ui, control);
  const closed = ui.close();
  const late = request({ hostname: '127.0.0.1', port: ui.port, path: '/api/settings', method: 'POST', headers: {
    host: mode === 'wrong host' ? 'foreign.invalid' : `127.0.0.1:${ui.port}`,
    'x-tracegrove-token': mode === 'wrong token' ? 'wrong' : token, expect: '100-continue', 'content-type': 'application/json',
  } });
  const response = new Promise<number>((resolve, reject) => { late.on('error', reject); late.on('response', res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); }); });
  late.flushHeaders();
  try {
    expect(await response).toBe(status);
    await Promise.race([closed, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('UI shutdown did not complete')), 5000); timer.unref(); closed.finally(() => clearTimeout(timer)); })]);
    assertCleanup((await run).body, control, 'cancelled');
    expect(readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  } finally { late.destroy(); await closed; }
}, 15000);

it('CLI UI interrupt awaits owned run settlement before process exit', async () => {
  const { root, control } = fixture();
  const child = spawn(process.execPath, ['--import', 'tsx', join(import.meta.dirname, '../src/cli/main.ts'), 'ui', '--dir', root], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  let stdout = '', stderr = ''; child.stdout!.on('data', chunk => { stdout += chunk; }); child.stderr!.on('data', chunk => { stderr += chunk; });
  const exit = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
  await expect.poll(() => /http:\/\/127\.0\.0\.1:\d+\//.exec(stdout)?.[0], { timeout: 15000 }).toBeTruthy();
  const ui = { url: /http:\/\/127\.0\.0\.1:\d+\//.exec(stdout)![0] };
  const token = /const TOKEN='([^']+)'/.exec(await (await fetch(ui.url)).text())![1]!;
  const run = post(ui, token, 'api/test', {}); await active(ui, control); child.kill('SIGINT');
  const result = await run; assertCleanup(result.body, control, 'cancelled'); expect(await exit).toBe(0);
  expect(stderr).toContain('waiting for the owned verification to settle');
}, 30000);
