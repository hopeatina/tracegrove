import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { classify, guardFlowEdit, heal, healthCandidates, lineDiff, listHeals, parseVerdicts, undoHeal } from '../src/authoring/heal.ts';
import { agentEnv, claudeResult, describeAgentLine, normalizeModel } from '../src/authoring/agent.ts';
import { loadAuthoringConfig } from '../src/authoring/compile.ts';
import { projectStatus } from '../src/authoring/status.ts';
import { initProject } from '../src/authoring/init.ts';
import { paint, renderHeal, renderStatus, renderTree } from '../src/cli/render.ts';
import type { TestRunReport } from '../src/authoring/run.ts';

const ROOT = join(import.meta.dirname, '..');
const SAMPLES = join(ROOT, 'src', 'samples');
const PATH = process.env.PATH;
const temps: string[] = [];
afterEach(() => { process.env.PATH = PATH; for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-heal-')); temps.push(dir); return dir; }
function copy(sample: string): string { const root = temp(); cpSync(join(SAMPLES, sample), root, { recursive: true, filter: (src) => !src.includes('.tracegrove') }); return root; }
const plain = paint({ isTTY: false } as NodeJS.WriteStream);

function report(cases: TestRunReport['cases'], extra: Partial<TestRunReport> = {}): TestRunReport {
  return { schemaVersion: 'tracegrove.run-summary/v1', project: 'notes', outcome: 'assertion_failed', exitCode: 1, startedAt: '2026-10-18T00:00:00.000Z', finishedAt: '2026-10-18T00:00:01.000Z',
    executionId: 'exec_1', sourceDigest: 'a'.repeat(64), runDir: '/r/.tracegrove/runs/x', bundleVerified: true, blockers: [], cases,
    totals: { passed: cases.filter((c) => c.outcome === 'passed').length, failed: cases.filter((c) => c.outcome === 'assertion_failed').length, other: 0 }, ...extra };
}
const step = (name: string, result: string, status: number | null) => ({ id: name.replace(/ /g, '_'), name, method: 'GET', path: '/notes', result, status, durationMs: 3, reason: null });

describe('heal: diagnosis and guards', () => {
  it('classifies startup, assertion, blocker and evidence failures into actionable findings', () => {
    const findings = classify(report([
      { caseId: 'a.one', file: 'tracegrove/a/one.flow.yaml', title: 'one', outcome: 'blocked', durationMs: 0, steps: [], failure: { step: '(app startup)', message: 'application did not become ready at http://127.0.0.1:4001/healthz within the readiness timeout', observed: null } },
      { caseId: 'a.two', file: 'tracegrove/a/two.flow.yaml', title: 'two', outcome: 'infrastructure_failed', durationMs: 0, steps: [], failure: { step: '(app startup)', message: 'application did not become ready at http://127.0.0.1:4002/healthz within the readiness timeout', observed: null } },
      { caseId: 'a.three', file: 'tracegrove/a/three.flow.yaml', title: 'three', outcome: 'assertion_failed', durationMs: 4, steps: [step('read', 'failed', 500)], failure: { step: 'read', message: 'expected status 200, got 500', observed: 'GET /notes -> 500' } },
    ], { bundleVerified: false, blockers: [{ code: 'port_unavailable', detail: 'x', action: 'free it' }] }), [{ code: 'launch_executable_missing', detail: '/no/python', action: 'install it' }]);
    expect(findings.map((f) => f.kind)).toEqual(['setup', 'setup', 'setup', 'assertion', 'evidence']);
    expect(findings[2]!.fix).toMatch(/app\.health .* \(now \/healthz\)/);
    expect(findings.filter((f) => /did not become ready/.test(f.detail))).toHaveLength(1);
  });

  it('rejects agent edits that weaken a flow and accepts ones that keep its strength', () => {
    const before = 'title: t\nsteps:\n  - name: create\n    POST: /notes\n    expect: 201\n  - name: denied\n    GET: /notes/1\n    as: intruder\n    expect: { status: 403, absent: [note] }\n';
    expect(guardFlowEdit(before, before.replace(/  - name: denied[\s\S]*$/, ''))).toMatch(/steps were deleted/);
    expect(guardFlowEdit(before, before.replace('status: 403', 'status: 200'))).toMatch(/flipped from expecting 403 to 200/);
    expect(guardFlowEdit(before, before.replace(', absent: [note]', ''))).toMatch(/checks less/);
    expect(guardFlowEdit(before, before.replace('name: denied', 'name: allowed'))).toMatch(/removed or renamed/);
    expect(guardFlowEdit(before, before.replace('expect: 201', 'expect: 200'))).toBeNull();
    expect(guardFlowEdit(before, before.replace('absent: [note]', 'absent: [note, item]'))).toBeNull();
    expect(guardFlowEdit(before, 'steps: [')).toMatch(/no longer parses/);
  });

  it('parses the agent verdict line and ignores malformed ones', () => {
    expect(parseVerdicts('thinking\nTRACEGROVE_VERDICT {"cases":[{"caseId":"a.b","verdict":"product_bug","reason":"auth removed"},{"caseId":"x","verdict":"maybe"}]}')).toEqual([{ caseId: 'a.b', verdict: 'product_bug', reason: 'auth removed' }]);
    expect(parseVerdicts('TRACEGROVE_VERDICT {nope')).toEqual([]);
    expect(parseVerdicts('no verdict')).toEqual([]);
  });

  it('diffs files line by line with context', () => {
    const diff = lineDiff('a\nb\nc\nd\ne\nf\ng\n', 'a\nb\nc\nD\ne\nf\ng\n', 'x.yaml');
    expect(diff.split('\n')).toEqual(['--- a/x.yaml', '+++ b/x.yaml', '@@', ' b', ' c', '-d', '+D', ' e', ' f', '@@']);
  });

  it('finds health paths the app actually serves', () => {
    const root = copy('notes-api');
    expect(healthCandidates(root, loadAuthoringConfig(join(root, 'tracegrove.config.yaml')), '/healthz')).toContain('/health');
  });
});

describe('heal: repairs against the real app', () => {
  it('fixes a wrong health path, proves it with a re-run, keeps comments, and undoes cleanly', async () => {
    const root = copy('notes-api');
    const config = join(root, 'tracegrove.config.yaml');
    const original = readFileSync(config, 'utf8').replace('health: /health', 'health: /healthz # where the app answers\n  readyTimeoutMs: 2000');
    writeFileSync(config, original);
    const phases: string[] = [];
    const result = await heal({ dir: root, agent: false, onProgress: (phase) => phases.push(phase) });
    expect(result.outcome).toBe('healed');
    expect(result.before.outcome).not.toBe('passed');
    expect(result.after).toMatchObject({ outcome: 'passed', exitCode: 0 });
    expect(result.changes.filter((c) => c.status === 'kept')).toEqual([expect.objectContaining({ file: 'tracegrove.config.yaml', by: 'tracegrove' })]);
    const healed = readFileSync(config, 'utf8');
    expect(healed).toContain('health: /health # where the app answers');
    expect(healed).toContain('sources: [app/**]');
    expect(phases).toContain('Trying a fix');
    expect(listHeals(root)[0]!.id).toBe(result.id);
    expect(undoHeal(root, 'latest')).toEqual({ id: result.id, restored: ['tracegrove.config.yaml'], skipped: [] });
    expect(readFileSync(config, 'utf8')).toBe(original);
  }, 120_000);

  it('repairs a drifted test, reports a product bug instead of hiding it, and rejects weakening edits', async () => {
    const root = copy('notes-api');
    const app = join(root, 'app', 'app.mjs');
    writeFileSync(app, readFileSync(app, 'utf8')
      .replace('return send(res, 200, { notes });', 'return send(res, 200, { items: notes, total: notes.length });')
      .replace("if (note.ownerId !== userId) return send(res, 403, { error: 'forbidden' });", ''));
    const bin = temp();
    // Stands in for Claude Code: fixes the drift, also tries to "fix" the auth failure (must be rejected), touches app code (must be restored).
    writeFileSync(join(bin, 'claude'), `#!/bin/sh
node <<'REPAIR'
const fs = require('node:fs');
const list = 'tracegrove/notes/list.flow.yaml';
fs.writeFileSync(list, fs.readFileSync(list, 'utf8').replaceAll('notes: 1', 'items: 1').replaceAll('"notes[0].title"', '"items[0].title"').replaceAll('notes: 0', 'items: 0'));
const denied = 'tracegrove/notes/create-read-delete.flow.yaml';
fs.writeFileSync(denied, fs.readFileSync(denied, 'utf8').replace('status: 403, absent: [note]', 'status: 200, absent: [note]'));
REPAIR
echo '// agent was here' >> app/app.mjs
echo 'scratch' > notes.txt
echo 'Looked at the handlers.'
echo 'TRACEGROVE_VERDICT {"cases":[{"caseId":"notes.list","verdict":"test_drift","reason":"list moved to an items envelope"},{"caseId":"notes.create-read-delete","verdict":"product_bug","reason":"the ownership check was removed"}]}'
`);
    chmodSync(join(bin, 'claude'), 0o755);
    process.env.PATH = `${bin}${delimiter}${PATH}`;
    const appBefore = readFileSync(app, 'utf8');
    const result = await heal({ dir: root });
    expect(result.outcome).toBe('product_bugs');
    expect(result.exitCode).toBe(1);
    const byCase = Object.fromEntries(result.findings.map((f) => [f.caseId, f]));
    expect(byCase['notes.list']).toMatchObject({ kind: 'test_drift', status: 'fixed' });
    expect(byCase['notes.create-read-delete']).toMatchObject({ kind: 'product_bug', status: 'reported', fix: 'the ownership check was removed' });
    expect(result.changes.find((c) => c.file === 'tracegrove/notes/list.flow.yaml')).toMatchObject({ status: 'kept', by: 'agent' });
    expect(result.changes.find((c) => c.file === 'tracegrove/notes/create-read-delete.flow.yaml')).toMatchObject({ status: 'rejected' });
    expect(result.changes.find((c) => c.file === 'app/app.mjs')).toMatchObject({ status: 'rejected', note: 'restored' });
    expect(result.changes.find((c) => c.file === 'notes.txt')).toMatchObject({ status: 'rejected', note: 'removed' });
    expect(readFileSync(app, 'utf8')).toBe(appBefore);
    expect(readFileSync(join(root, 'tracegrove/notes/create-read-delete.flow.yaml'), 'utf8')).toContain('status: 403');
    expect(result.after.totals).toEqual({ passed: 1, failed: 1, other: 0 });
    expect(renderHeal(result, root, plain)).toMatch(/PRODUCT BUG\s+notes\.create-read-delete/);
  }, 180_000);
});

describe('agent plumbing for live progress and self-repair', () => {
  it('reads stream-json, describes tool use, fixes dotted model ids and detaches from a parent session', () => {
    const stream = ['{"type":"system"}', '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/p/app.mjs"}},{"type":"text","text":"The list moved.\\nMore"}]}}', '{"type":"result","result":"done: list fixed"}'].join('\n');
    expect(claudeResult(stream)).toBe('done: list fixed');
    expect(claudeResult('{"result":"single"}')).toBe('single');
    expect(stream.split('\n').flatMap(describeAgentLine)).toEqual(['Read /p/app.mjs', 'The list moved.']);
    expect(normalizeModel('claude', 'claude-haiku-4.5')).toBe('claude-haiku-4-5');
    expect(normalizeModel('codex', 'gpt-6.1')).toBe('gpt-6.1');
    const env = agentEnv({ CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x', HOME: '/h', HTTPS_PROXY: 'p' });
    expect(env).toEqual({ HOME: '/h', HTTPS_PROXY: 'p' });
  });
});

describe('status and terminal rendering', () => {
  it('orders next actions from no config, to never run, to failing', () => {
    const empty = temp();
    expect(projectStatus(empty).next[0]!.command).toBe('tracegrove init');
    expect(renderStatus(projectStatus(empty), plain)).toContain('next: tracegrove init');
    const root = copy('notes-api');
    const s = projectStatus(join(root, 'tracegrove', 'notes'));
    expect(s).toMatchObject({ root, config: { found: true, project: 'notes', adapter: 'node' }, flows: 2, check: { ok: true }, latestRun: null });
    expect(s.next[0]!.command).toBe('tracegrove test');
  });

  it('draws a run as a tree that unfolds only failing branches and suggests heal', () => {
    const text = renderTree(report([
      { caseId: 'notes.list', file: 'f', title: 't', outcome: 'passed', durationMs: 9, steps: [step('list', 'completed', 200)], failure: null },
      { caseId: 'notes.read', file: 'f', title: 't', outcome: 'assertion_failed', durationMs: 4, steps: [step('read', 'failed', 500), step('after', 'not_run', null)], failure: { step: 'read', message: 'expected status 200, got 500', observed: 'GET /notes -> 500' } },
    ]), '/r', plain);
    expect(text).toContain('├─ ✓ notes.list  PASS');
    expect(text).toContain('└─ ✗ notes.read  FAIL');
    expect(text).toContain('expected status 200, got 500');
    expect(text).toContain('○ after');
    expect(text).not.toContain('✓ list ');
    expect(text).toMatch(/next: tracegrove heal/);
    expect(text).not.toContain('\x1b[');
  });

  it('writes an AGENTS.md guide next to the flows on init', () => {
    const root = temp();
    writeFileSync(join(root, 'package.json'), '{"main":"server.js"}');
    initProject(root);
    expect(readFileSync(join(root, 'tracegrove', 'AGENTS.md'), 'utf8')).toMatch(/tracegrove heal --json/);
  });

  it('opens a status home screen for a bare tracegrove inside a project', () => {
    const root = copy('notes-api');
    const bare = spawnSync(process.execPath, ['--import', join(ROOT, 'node_modules/tsx/dist/esm/index.mjs'), join(ROOT, 'src/cli/main.ts')], { encoding: 'utf8', cwd: root });
    expect(bare.status).toBe(0);
    expect(bare.stdout).toContain('next: tracegrove test');
    const json = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'src/cli/main.ts'), 'status', '--json', '--dir', root], { encoding: 'utf8', cwd: ROOT });
    const status = JSON.parse(json.stdout);
    expect(status).toMatchObject({ schemaVersion: 'tracegrove.status/v1' });
    expect(status.next[0]).toMatchObject({ command: 'tracegrove test' });
    expect(status.next.map((n: { command: string }) => n.command)).toContain('tracegrove ui');
  });
});

describe('ui: live progress and heal endpoints', () => {
  it('reports live state, heals over HTTP with the session token, and lists heals', async () => {
    const { startUi } = await import('../src/authoring/ui.ts');
    const root = copy('notes-api');
    const ui = await startUi({ dir: root });
    try {
      const get = async (path: string) => (await fetch(`${ui.url}${path.slice(1)}`)).json();
      expect(await get('/api/live')).toMatchObject({ run: { status: 'idle' }, agent: { status: 'idle', lines: [] }, heal: { status: 'idle' } });
      const page = await (await fetch(ui.url)).text();
      const token = /const TOKEN='([^']+)'/.exec(page)![1]!;
      expect((await fetch(`${ui.url}api/heal`, { method: 'POST', body: '{}' })).status).toBe(403);
      const healed = await (await fetch(`${ui.url}api/heal`, { method: 'POST', headers: { 'x-tracegrove-token': token }, body: JSON.stringify({ agent: false }) })).json();
      expect(healed).toMatchObject({ schemaVersion: 'tracegrove.heal/v1', outcome: 'healthy', changes: [] });
      expect(await get('/api/live')).toMatchObject({ run: { status: 'finished', label: 'Heal finished: healthy' }, heal: { status: 'finished', detail: 'healthy' } });
      expect((await get('/api/heals'))[0].id).toBe(healed.id);
      expect((await get('/api/status')).latestHeal).toMatchObject({ id: healed.id, outcome: 'healthy' });
    } finally { await ui.close(); }
  }, 120_000);
});
