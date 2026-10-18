import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { buildAgentCommand, buildDraftPrompt, detectAgents, resolveAgentSettings, writeLocalSettings } from '../src/authoring/agent.ts';
import { checkProject, discoverProject, draftWithAgent } from '../src/authoring/workspace.ts';
import { loadAuthoringConfig } from '../src/authoring/compile.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { AuthoringConfig } from '../src/authoring/schema.ts';

const ROOT = join(import.meta.dirname, '..');
const SAMPLES = join(ROOT, 'src', 'samples');
const temps: string[] = [];
const servers: UiServer[] = [];
const PATH = process.env.PATH;
afterEach(async () => {
  process.env.PATH = PATH;
  for (const s of servers.splice(0)) await s.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-agent-')); temps.push(dir); return dir; }
function copy(sample: string): string { const root = temp(); cpSync(join(SAMPLES, sample), root, { recursive: true, filter: (src) => !src.includes('.tracegrove') }); return root; }
const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'src/cli/main.ts'), ...args], { encoding: 'utf8', cwd: ROOT });

function call(port: number, method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', ...(opts.token ? { 'x-tracegrove-token': opts.token } : {}) } }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => { let body: any = text; try { body = JSON.parse(text); } catch { /* html */ } done({ status: res.statusCode ?? 0, body }); });
    });
    req.on('error', fail);
    req.end(opts.body ? JSON.stringify(opts.body) : undefined);
  });
}

describe('agent settings', () => {
  it('pins the low-cost drafting model for both providers', () => {
    const s = resolveAgentSettings(temp(), null);
    expect(s).toMatchObject({ provider: 'claude', model: 'claude-haiku-4-5', source: { provider: 'default', model: 'default' } });
    expect(resolveAgentSettings(temp(), null, { provider: 'codex' }).model).toBe('gpt-6-luna');
  });

  it('does not inherit a shared model when local settings switch the provider', () => {
    const root = temp();
    const config = AuthoringConfig.parse({ project: 'p', app: { adapter: 'node', entry: 'server.js' }, personas: { alice: { subject: 'alice' } }, agent: { provider: 'codex', model: 'codex-team-model' } });
    writeLocalSettings(root, { agent: { provider: 'claude' } });
    expect(resolveAgentSettings(root, config)).toMatchObject({ provider: 'claude', model: 'claude-haiku-4-5', source: { model: 'default' } });
  });

  it('resolves flag over settings.json over config', () => {
    const root = temp();
    const config = AuthoringConfig.parse({ project: 'p', app: { adapter: 'node', entry: 'server.js' }, personas: { alice: { subject: 'alice' } }, agent: { provider: 'codex', model: 'team-model' } });
    expect(resolveAgentSettings(root, config)).toMatchObject({ provider: 'codex', model: 'team-model', source: { provider: 'config' } });
    writeLocalSettings(root, { agent: { provider: 'claude', model: 'sonnet' } });
    expect(resolveAgentSettings(root, config)).toMatchObject({ provider: 'claude', model: 'sonnet', source: { provider: 'settings', model: 'settings' } });
    // switching provider by flag drops a model chosen for the other provider
    expect(resolveAgentSettings(root, config, { provider: 'codex' })).toMatchObject({ provider: 'codex', model: 'gpt-6-luna', source: { provider: 'flag' } });
    expect(resolveAgentSettings(root, config, { provider: 'claude', model: 'opus' })).toMatchObject({ model: 'opus', source: { model: 'flag' } });
    expect(() => resolveAgentSettings(root, config, { provider: 'gpt' })).toThrow(/invalid_agent/);
    expect(() => writeLocalSettings(root, { agent: { provider: 'nope' } })).toThrow();
  });

  it('builds a headless, tool-restricted command for each provider', () => {
    const tg = ['node', '/x/main.js'];
    const claude = buildAgentCommand({ provider: 'claude', model: 'haiku', maxBudgetUsd: 0.5, source: { provider: 'default', model: 'default' } }, 'PROMPT', tg);
    expect(claude.bin).toBe('claude');
    expect(claude.args).toEqual(expect.arrayContaining(['-p', 'PROMPT', '--model', 'haiku', '--output-format', 'stream-json', '--max-budget-usd', '0.5']));
    const allowed = claude.args[claude.args.indexOf('--allowedTools') + 1]!;
    expect(allowed).toContain('Bash(node /x/main.js check:*)');
    expect(allowed).not.toMatch(/Bash\(\*|Bash,|Bash$/);
    const codex = buildAgentCommand({ provider: 'codex', model: null, maxBudgetUsd: null, source: { provider: 'flag', model: 'default' } }, 'PROMPT', tg);
    expect(codex).toEqual({ bin: 'codex', args: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '--model', 'gpt-6-luna', 'PROMPT'] });
    expect(() => buildAgentCommand({ provider: 'codex', model: null, maxBudgetUsd: 0.5, source: { provider: 'flag', model: 'default' } }, 'P', tg)).toThrow(/cannot enforce maxBudgetUsd/);
    expect(() => buildAgentCommand({ provider: 'none', model: null, maxBudgetUsd: null, source: { provider: 'flag', model: 'default' } }, 'P', tg)).toThrow(/none/);
  });

  it('gives the agent intent, uncovered routes, conventions and the check command', () => {
    const root = copy('fastapi-notes');
    const config = loadAuthoringConfig(join(root, 'tracegrove.config.yaml'));
    const prompt = buildDraftPrompt({ root, testDir: join(root, 'tracegrove'), discovery: discoverProject(root, null), intent: 'only the owner can read a note', config, tracegrove: ['tg'] });
    expect(prompt).toContain('only the owner can read a note');
    expect(prompt).toContain('tracegrove/discovered/');
    expect(prompt).toContain('`tg check --json`');
    expect(prompt).toContain('Personas available: owner, intruder');
    expect(prompt).toMatch(/An existing flow in this repo/);
    expect(prompt).toMatch(/Discovery \(working tree\): [1-9]/);
  });
});

describe('agent-friendly CLI', () => {
  it('check reports ok, then file-located issues with exit 2', () => {
    const root = copy('notes-api');
    const ok = cli('check', '--dir', root, '--json');
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ ok: true, issues: [] });
    writeFileSync(join(root, 'tracegrove', 'notes', 'broken.flow.yaml'), 'title: x\nsteps:\n  - name: y\n    FETCH: /nope\n');
    const bad = cli('check', '--dir', root, '--json');
    expect(bad.status).toBe(2);
    const body = JSON.parse(bad.stdout);
    expect(body.ok).toBe(false);
    expect(body.issues[0].detail).toContain('broken.flow.yaml');
  });

  it('discover lists routes with coverage as JSON', () => {
    const root = copy('fastapi-notes');
    const result = cli('discover', '--dir', root, '--json');
    expect(result.status).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.routes.length).toBeGreaterThan(0);
    expect(body.routes.some((r: { coveredBy: string[] }) => r.coveredBy.length > 0)).toBe(true);
  });

  it('settings saves the per-developer choice', () => {
    const root = temp();
    writeLocalSettings(root, { agent: { provider: 'claude', model: 'claude-custom-model' } });
    const result = cli('settings', '--dir', root, '--agent', 'codex', '--json');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).settings).toMatchObject({ provider: 'codex', model: 'gpt-6-luna', source: { provider: 'settings', model: 'default' } });
    expect(JSON.parse(readFileSync(join(root, '.tracegrove', 'settings.json'), 'utf8'))).toEqual({ agent: { provider: 'codex' } });
  });
});

describe('draft with an agent', () => {
  function fakeClaude(): string {
    const bin = temp();
    // Stands in for Claude Code: writes one flow where it was told to, prints a JSON result.
    writeFileSync(join(bin, 'claude'), `#!/bin/sh
mkdir -p tracegrove/discovered/notes
cat > tracegrove/discovered/notes/owner-only.flow.yaml <<'YAML'
title: only the owner can read a note
tags: [discovered]
steps:
  - name: create
    POST: /notes
    json: { title: t, body: b }
    expect: 201
YAML
echo '{"result":"tracegrove/discovered/notes/owner-only.flow.yaml: owner-only read"}'
`);
    chmodSync(join(bin, 'claude'), 0o755);
    return bin;
  }

  it('runs the configured agent, then re-checks what it wrote', async () => {
    const root = copy('notes-api');
    process.env.PATH = `${fakeClaude()}${delimiter}${PATH}`;
    expect(detectAgents().claude).toBeTruthy();
    const result = await draftWithAgent({ dir: root, branch: null, intent: 'only the owner can read a note' });
    expect(result.agent).toMatchObject({ provider: 'claude', model: 'claude-haiku-4-5', exitCode: 0, files: ['tracegrove/discovered/notes/owner-only.flow.yaml'] });
    expect(result.agent.output).toContain('owner-only read');
    expect(result.agent.command).toContain('<prompt>');
    expect(result.check.ok).toBe(true);
    expect(checkProject(root).flows.map((f) => f.caseId)).toContain('discovered.notes.owner-only');
  });

  it('blocks with an install hint when the agent CLI is missing', async () => {
    const root = copy('notes-api');
    process.env.PATH = temp();
    await expect(draftWithAgent({ dir: root, branch: null, intent: null })).rejects.toThrow(/not on PATH/);
  });

  it('serves and saves settings in the UI behind the session token', async () => {
    const root = copy('notes-api');
    const server = await startUi({ dir: root }); servers.push(server);
    const page = await call(server.port, 'GET', '/');
    const token = /const TOKEN='([^']+)'/.exec(page.body)![1]!;
    expect((await call(server.port, 'GET', '/api/settings')).body.settings).toMatchObject({ provider: 'claude', model: 'claude-haiku-4-5' });
    expect((await call(server.port, 'POST', '/api/settings', { body: { agent: { provider: 'codex' } } })).status).toBe(403);
    const saved = await call(server.port, 'POST', '/api/settings', { token, body: { agent: { provider: 'codex', model: '' } } });
    expect(saved.status).toBe(200);
    expect(saved.body.settings).toMatchObject({ provider: 'codex', model: 'gpt-6-luna' });
    expect((await call(server.port, 'POST', '/api/settings', { token, body: { agent: { provider: 'gpt' } } })).status).toBe(422);
    expect(existsSync(join(root, '.tracegrove', 'settings.json'))).toBe(true);
    void mkdirSync;
  });

  it('prunes a flow by renaming it and grafts it back', async () => {
    const root = copy('notes-api');
    const server = await startUi({ dir: root }); servers.push(server);
    const token = /const TOKEN='([^']+)'/.exec((await call(server.port, 'GET', '/')).body)![1]!;
    const file = 'tracegrove/notes/list.flow.yaml';
    expect((await call(server.port, 'POST', '/api/prune', { body: { file } })).status).toBe(403);
    expect((await call(server.port, 'POST', '/api/prune', { token, body: { file: '../outside.flow.yaml' } })).status).toBe(400);
    expect((await call(server.port, 'POST', '/api/prune', { token, body: { file: 'tracegrove.config.yaml' } })).status).toBe(400);
    expect((await call(server.port, 'POST', '/api/prune', { token, body: { file } })).body).toEqual({ file, pruned: true });
    expect(existsSync(join(root, file + '.pruned'))).toBe(true);
    const overview = (await call(server.port, 'GET', '/api/overview')).body;
    expect(overview.flows.map((f: { file: string }) => f.file)).not.toContain(file);
    expect(overview.pruned).toEqual([{ file: file + '.pruned', title: "A new note shows up in the owner's list and nowhere else" }]);
    expect((await call(server.port, 'POST', '/api/prune', { token, body: { file } })).status).toBe(404);
    expect((await call(server.port, 'POST', '/api/prune', { token, body: { file, graft: true } })).body).toEqual({ file, pruned: false });
    expect(existsSync(join(root, file))).toBe(true);
  });
});
