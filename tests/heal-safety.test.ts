import { afterEach, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { request } from 'node:http';
import { stringify } from 'yaml';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { heal, lineDiff, listHeals, undoHeal } from '../src/authoring/heal.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import type { TestRunReport } from '../src/authoring/run.ts';

const originalPath = process.env.PATH;
const roots: string[] = [];
const servers: UiServer[] = [];
afterEach(async () => {
  process.env.PATH = originalPath;
  for (const server of servers.splice(0)) await server.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function temp() { const root = mkdtempSync(join(tmpdir(), 'tracegrove-heal-safety-')); roots.push(root); return root; }
function fixture() {
  const root = temp(); mkdirSync(join(root, 'app')); mkdirSync(join(root, 'tracegrove'));
  writeFileSync(join(root, 'app/app.mjs'), `import {createServer} from 'node:http';createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(req.url==='/health'?'{}':'{"state":"new"}');}).listen(Number(process.env.PORT),'127.0.0.1');`);
  writeFileSync(join(root, 'tracegrove.config.yaml'), stringify({ project: 'safety', app: { adapter: 'node', entry: 'app/app.mjs', health: '/health', sources: ['app/**'] }, personas: { fixture: { subject: 'synthetic' } } }));
  const flow = join(root, 'tracegrove/read.flow.yaml');
  writeFileSync(flow, stringify({ title: 'Read intended state', steps: [{ name: 'read', GET: '/read', as: 'none', expect: { status: 200, json: { state: 'old' } } }] }));
  const compiled = compileProject(join(root, 'tracegrove.config.yaml')); const caseId = compiled.flows[0]!.caseId;
  const report: TestRunReport = { schemaVersion: 'tracegrove.run-summary/v1', project: 'safety', outcome: 'assertion_failed', exitCode: 1,
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), executionId: null, sourceDigest: compiled.sourceDigest,
    runDir: join(root, '.tracegrove/runs/supplied-fixture-failure'), bundleVerified: true, blockers: [], totals: { passed: 0, failed: 1, other: 0 },
    cases: [{ caseId, file: 'tracegrove/read.flow.yaml', title: 'Read intended state', outcome: 'assertion_failed', durationMs: 0, steps: [], failure: { step: 'read', message: 'expected old state, received new', observed: null } }] };
  return { root, flow, caseId, report };
}
function fakeAgent(output: string, exitCode = 0) {
  const bin = temp(); const file = join(bin, 'claude');
  writeFileSync(file, `#!${process.execPath}\nconst fs=require('node:fs');const file='tracegrove/read.flow.yaml';fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('state: old','state: new'));console.log(${JSON.stringify(output)});process.exitCode=${exitCode};\n`);
  chmodSync(file, 0o755); process.env.PATH = `${bin}${delimiter}${originalPath}`;
}

it.each(['absent', 'malformed', 'foreign', 'duplicate', 'failed', 'unsure', 'product_bug'] as const)('rejects an otherwise passing agent edit with %s admission', async mode => {
  const f = fixture(); const before = readFileSync(f.flow, 'utf8');
  const verdict = { caseId: f.caseId, verdict: mode === 'unsure' || mode === 'product_bug' ? mode : 'test_drift', reason: 'fixture verdict' };
  const output = mode === 'absent' ? 'Finished editing, with no verdict.' : mode === 'malformed' ? 'TRACEGROVE_VERDICT {nope'
    : 'TRACEGROVE_VERDICT ' + JSON.stringify({ cases: mode === 'foreign' ? [{ ...verdict, caseId: 'other' }] : mode === 'duplicate' ? [verdict, verdict] : [verdict] });
  fakeAgent(output, mode === 'failed' ? 1 : 0);
  const phases: string[] = [];
  const result = await heal({ dir: f.root, report: f.report, onProgress: phase => phases.push(phase) });
  expect(readFileSync(f.flow, 'utf8')).toBe(before);
  expect(result.changes.some(change => change.status === 'kept')).toBe(false);
  expect(result.outcome).toBe(mode === 'product_bug' ? 'product_bugs' : 'needs_human');
  expect(phases).not.toContain('Re-running to prove the repairs');
}, 20000);

it('retains a matching drift edit only after the actual local fixture passes and records complete undo bindings', async () => {
  const f = fixture(); const before = readFileSync(f.flow, 'utf8');
  fakeAgent('TRACEGROVE_VERDICT ' + JSON.stringify({ cases: [{ caseId: f.caseId, verdict: 'test_drift', reason: 'fixture state renamed' }] }));
  const result = await heal({ dir: f.root, report: f.report });
  expect(result.outcome).toBe('healed'); expect(result.after.exitCode).toBe(0);
  expect(result.fileBindings).toContainEqual({ file: 'tracegrove/read.flow.yaml', beforeSha256: hash(before), afterSha256: hash(readFileSync(f.flow, 'utf8')) });
  expect(undoHeal(f.root, result.id).restored).toEqual(['tracegrove/read.flow.yaml']); expect(readFileSync(f.flow, 'utf8')).toBe(before);
}, 20000);

it('restores an admitted candidate if verification throws before it can be retained', async () => {
  const f = fixture(); const before = readFileSync(f.flow, 'utf8');
  fakeAgent('TRACEGROVE_VERDICT ' + JSON.stringify({ cases: [{ caseId: f.caseId, verdict: 'test_drift', reason: 'fixture state renamed' }] }));
  await expect(heal({ dir: f.root, report: f.report, onProgress: phase => { if (phase === 'Re-running to prove the repairs') throw new Error('fixture verification stop'); } })).rejects.toThrow('fixture verification stop');
  expect(readFileSync(f.flow, 'utf8')).toBe(before);
});

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function undoFixture(deletionOnly = false, bound = true) {
  const root = temp(); const id = 'fixture-undo'; const relative = 'flow.yaml'; const original = 'title: before\nsteps: []\n'; const healed = deletionOnly ? 'steps: []\n' : 'title: after\nsteps: []\n';
  const dir = join(root, '.tracegrove/heals', id); mkdirSync(join(dir, 'backup'), { recursive: true });
  writeFileSync(join(dir, 'backup', relative), original);
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ id, changes: [{ file: relative, status: 'kept', diff: lineDiff(original, healed, relative) }], ...(bound ? { fileBindings: [{ file: relative, beforeSha256: hash(original), afterSha256: hash(healed) }] } : {}) }));
  writeFileSync(join(root, relative), healed); return { root, id, relative, original, healed, dir };
}
it.each([false, true])('undo preserves subsequent edits including deletion-only=%s', deletionOnly => {
  const { root, id, relative, healed } = undoFixture(deletionOnly);
  const human = healed + '# added by a human after heal\n'; writeFileSync(join(root, relative), human);
  const undone = undoHeal(root, id);
  expect(readFileSync(join(root, relative), 'utf8')).toBe(human);
  expect(undone.restored).toEqual([]); expect(undone.skipped).toHaveLength(1);
});

it('undo restores only the exact bound postimage and refuses old unbound reports or corrupted backups', () => {
  const f = undoFixture(); expect(undoHeal(f.root, f.id).restored).toEqual([f.relative]); expect(readFileSync(join(f.root, f.relative), 'utf8')).toBe(f.original);
  expect(undoHeal(f.root, f.id).restored).toEqual([]);
  const old = undoFixture(false, false); expect(undoHeal(old.root, old.id).restored).toEqual([]); expect(readFileSync(join(old.root, old.relative), 'utf8')).toBe(old.healed);
  const corrupt = undoFixture(); writeFileSync(join(corrupt.dir, 'backup', corrupt.relative), 'corrupt'); expect(undoHeal(corrupt.root, corrupt.id).restored).toEqual([]);
});

it('does not take over an existing heal/undo mutation owner', () => {
  const f = undoFixture(); mkdirSync(join(f.root, '.tracegrove/heal-mutation.lock'));
  expect(() => undoHeal(f.root, f.id)).toThrow(/heal_mutation_in_progress/); expect(readFileSync(join(f.root, f.relative), 'utf8')).toBe(f.healed);
});

it('retains separate reports when sequential heals start at the same clock time', async () => {
  const f = fixture(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-18T00:00:00Z'));
  try {
    const first = await heal({ dir: f.root, report: f.report, agent: false }); const saved = readFileSync(first.reportPath, 'utf8');
    const second = await heal({ dir: f.root, report: f.report, agent: false });
    expect(first.id).not.toBe(second.id); expect(listHeals(f.root)).toHaveLength(2); expect(readFileSync(first.reportPath, 'utf8')).toBe(saved);
  } finally { vi.useRealTimers(); }
});

it('refuses a mutating request whose body finishes after shutdown has begun', async () => {
  const root = temp(); const ui = await startUi({ dir: root }); servers.push(ui);
  const token = /const TOKEN='([^']+)'/.exec(await (await fetch(ui.url)).text())![1]!;
  let ready!: () => void; const continued = new Promise<void>(resolve => { ready = resolve; });
  const req = request({ hostname: '127.0.0.1', port: ui.port, path: '/api/settings', method: 'POST', headers: { 'x-tracegrove-token': token, expect: '100-continue' } });
  const response = new Promise<number>((resolve, reject) => { req.on('error', reject); req.on('response', res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); }); });
  req.once('continue', ready); req.flushHeaders(); await continued;
  const closed = ui.close(); req.end('{}');
  expect(await response).toBe(409); await closed;
  expect(() => readFileSync(join(root, '.tracegrove/settings.json'))).toThrow();
}, 10000);

function heldAgent(root: string, ignoreTermination = false) {
  const control = temp(); const bin = temp(); const script = join(bin, 'claude');
  writeFileSync(script, `#!${process.execPath}\nconst fs=require('node:fs');const path=require('node:path');const control=${JSON.stringify(control)};const file='tracegrove/read.flow.yaml';fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('state: old','state: new'));fs.appendFileSync(path.join(control,'starts'),process.pid+'\\n');process.on('SIGTERM',()=>{if(${ignoreTermination})return;setTimeout(()=>{fs.appendFileSync(file,'# late agent write\\n');fs.writeFileSync(path.join(control,'stopped'),'yes');process.exit(0)},80)});fs.writeFileSync(path.join(control,'ready'),'yes');setInterval(()=>{},1000);\n`);
  chmodSync(script, 0o755); process.env.PATH = `${bin}${delimiter}${originalPath}`; return control;
}
async function uiSession(root: string) {
  const ui = await startUi({ dir: root }); servers.push(ui);
  const token = /const TOKEN='([^']+)'/.exec(await (await fetch(ui.url)).text())![1]!;
  const post = async (path: string, body: unknown, auth = token) => { const response = await fetch(ui.url + path, { method: 'POST', headers: { 'x-tracegrove-token': auth }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  return { ui, token, post };
}
it.each([false, true])('owns a heal until agent close and rollback, with ignored termination=%s', async ignoreTermination => {
  const f = fixture(); const original = readFileSync(f.flow, 'utf8'); const control = heldAgent(f.root, ignoreTermination); const { ui, post } = await uiSession(f.root);
  const job = post('api/heal', {});
  await expect.poll(() => existsSync(join(control, 'ready')), { timeout: 10000 }).toBe(true);
  const active = await (await fetch(ui.url + 'api/run-control')).json(); expect(active.operation).toBe('heal');
  expect((await post('api/agent-draft', {})).status).toBe(409);
  expect((await post('api/heal/undo', { id: 'latest' })).status).toBe(409);
  expect((await post('api/cancel', { runId: active.runId }, 'wrong')).status).toBe(403);
  expect((await post('api/cancel', { runId: 'foreign' })).status).toBe(409);
  const cancellations = await Promise.all([post('api/cancel', { runId: active.runId }), post('api/cancel', { runId: active.runId })]);
  expect(cancellations.every(result => [200, 409].includes(result.status))).toBe(true); expect(cancellations.some(result => result.status === 200)).toBe(true);
  const result = await job; expect(result.body).toMatchObject({ outcome: 'cancelled', exitCode: 4 });
  expect(existsSync(join(control, 'stopped'))).toBe(!ignoreTermination); expect(readFileSync(f.flow, 'utf8')).toBe(original);
  const pid = Number(readFileSync(join(control, 'starts'), 'utf8').trim()); expect(() => process.kill(pid, 0)).toThrow();
  expect(readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
}, 20000);

it('shutdown aborts and awaits the owned heal before completing or admitting a delayed mutation', async () => {
  const f = fixture(); const original = readFileSync(f.flow, 'utf8'); const control = heldAgent(f.root); const { ui, token, post } = await uiSession(f.root);
  const job = post('api/heal', {}); await expect.poll(() => existsSync(join(control, 'ready')), { timeout: 10000 }).toBe(true);
  let ready!: () => void; const continued = new Promise<void>(resolve => { ready = resolve; });
  const req = request({ hostname: '127.0.0.1', port: ui.port, path: '/api/heal', method: 'POST', headers: { 'x-tracegrove-token': token, expect: '100-continue' } });
  const response = new Promise<number>((resolve, reject) => { req.on('error', reject); req.on('response', res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); }); });
  req.once('continue', ready); req.flushHeaders(); await continued;
  const closed = ui.close(); req.end('{}'); expect(await response).toBe(409); await closed;
  expect((await job).body).toMatchObject({ outcome: 'cancelled', exitCode: 4 });
  expect(existsSync(join(control, 'stopped'))).toBe(true); expect(readFileSync(f.flow, 'utf8')).toBe(original);
  expect(readFileSync(join(control, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
}, 20000);

it('returns a structured cancelled outcome for an owned agent draft', async () => {
  const f = fixture(); const control = heldAgent(f.root); const { ui, post } = await uiSession(f.root);
  const job = post('api/agent-draft', {}); await expect.poll(() => existsSync(join(control, 'ready')), { timeout: 10000 }).toBe(true);
  const active = await (await fetch(ui.url + 'api/run-control')).json(); expect(active.operation).toBe('draft');
  const cancelled = await post('api/cancel', { runId: active.runId });
  expect(cancelled.body).toMatchObject({ operation: 'draft', outcome: 'cancelled', exitCode: 4 });
  expect((await job).body.agent.exitCode).toBe(4);
}, 20000);

it('shows an explicit cancelled heal result through the real 375px browser UI', async () => {
  const f = fixture(); const original = readFileSync(f.flow, 'utf8'); const control = heldAgent(f.root); const { ui } = await uiSession(f.root);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 760 } }); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(ui.url); await page.getByRole('button', { name: 'Heal', exact: true }).first().click(); await page.getByRole('button', { name: 'Heal now', exact: true }).click();
    await expect.poll(() => existsSync(join(control, 'ready')), { timeout: 10000 }).toBe(true);
    await page.getByRole('button', { name: 'Cancel heal', exact: true }).click();
    await expect.poll(() => page.getByRole('heading', { name: 'Heal cancelled', exact: true }).count(), { timeout: 10000 }).toBe(1);
    expect(errors).toEqual([]); expect(readFileSync(f.flow, 'utf8')).toBe(original);
    await page.screenshot({ path: join(import.meta.dirname, '../artifacts/qa/pr50-repairs/heal-cancelled-375.png'), fullPage: true });
  } finally { await browser.close(); }
}, 25000);

it('test --heal keeps JSON on stdout and exits four when healing is interrupted', async () => {
  const f = fixture(); const original = readFileSync(f.flow, 'utf8'); const control = heldAgent(f.root); const repo = join(import.meta.dirname, '..');
  const child = spawn(process.execPath, ['--import', join(repo, 'node_modules/tsx/dist/esm/index.mjs'), join(repo, 'src/cli/main.ts'), 'test', '--heal', '--json'], { cwd: f.root, env: process.env });
  let stdout = ''; let stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  try {
    await expect.poll(() => existsSync(join(control, 'ready')), { timeout: 10000 }).toBe(true); child.kill('SIGINT');
    expect(await closed).toBe(4); const result = JSON.parse(stdout);
    expect(result.heal).toMatchObject({ outcome: 'cancelled', exitCode: 4 }); expect(result.report.outcome).toBe('assertion_failed');
    expect(stderr).toContain('stop requested'); expect(readFileSync(f.flow, 'utf8')).toBe(original);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
}, 20000);
