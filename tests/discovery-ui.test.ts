import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover, draftFlow, gitInfo, scanSource } from '../src/authoring/discover.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { Flow } from '../src/authoring/schema.ts';
import { parse } from 'yaml';

const SAMPLES = join(import.meta.dirname, '..', 'src', 'samples');
const temps: string[] = [];
const servers: UiServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-disc-')); temps.push(dir); return dir; }
function copy(sample: string): string { const root = temp(); cpSync(join(SAMPLES, sample), root, { recursive: true, filter: (src) => !src.includes('.tracegrove') }); return root; }
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'pipe' }).toString();

function call(port: number, method: string, path: string, opts: { host?: string; token?: string | undefined; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: opts.host ?? `127.0.0.1:${port}`, 'content-type': 'application/json', ...(opts.token ? { 'x-tracegrove-token': opts.token } : {}) } }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => { let body: any = text; try { body = JSON.parse(text); } catch { /* html */ } done({ status: res.statusCode ?? 0, body }); });
    });
    req.on('error', fail);
    req.end(opts.body ? JSON.stringify(opts.body) : undefined);
  });
}

describe('route scanning', () => {
  it('reads FastAPI decorators, Django path() and Express routers', () => {
    expect(scanSource('main.py', '@app.get("/notes/{note_id}")\ndef r(): ...\n@router.post("/notes")\n')).toEqual([
      expect.objectContaining({ method: 'GET', path: '/notes/{note_id}', line: 1, framework: 'fastapi' }),
      expect.objectContaining({ method: 'POST', path: '/notes', line: 3 }),
    ]);
    expect(scanSource('urls.py', 'urlpatterns = [path("notes/<int:pk>/", v), path("", h)]').map((r) => `${r.method} ${r.path}`)).toEqual(['ANY /notes/{pk}', 'ANY /']);
    expect(scanSource('server.ts', "app.delete('/notes/:id', h); router.get(`/x/${y}`, h)").map((r) => `${r.method} ${r.path}`)).toEqual(['DELETE /notes/{id}']);
    const node = "if (req.method === 'GET' && url.pathname === '/api/status') x();\nif (url.pathname === '/jobs' && req.method === 'POST') y();\nif (url.pathname === '/any') z();\nif (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) w();";
    expect(scanSource('ui.ts', node).map((r) => `${r.method} ${r.path} ${r.framework}`)).toEqual(['GET /api/status node', 'POST /jobs node', 'ANY /any node', 'GET /api/runs/{id} node']);
  });

  it('matches sample routes to the flows that cover them', () => {
    const root = copy('fastapi-notes');
    const d = discover(root, [{ caseId: 'notes.crud', method: 'POST', path: '/notes' }], null);
    expect(d.source).toBe('working tree');
    const post = d.routes.find((r) => r.method === 'POST' && r.path === '/notes');
    expect(post?.coveredBy).toEqual(['notes.crud']);
    expect(d.uncovered).toBe(d.routes.filter((r) => r.coveredBy.length === 0).length);
    expect(d.routes.length).toBeGreaterThan(1);
    expect(discover(copy('django-notes'), [], null).routes.some((r) => r.framework === 'django')).toBe(true);
  });

  it('drafts a flow that parses against the flow schema', () => {
    const draft = draftFlow({ method: 'GET', path: '/notes/{noteId}' });
    expect(draft.file).toBe('notes/get-by-id.flow.yaml');
    expect(Flow.safeParse(parse(draft.yaml)).success).toBe(true);
  });
});

describe('git branches', () => {
  it('scans a branch without checking it out and flags changed files', () => {
    const dir = temp();
    git(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'app.py'), '@app.get("/a")\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'a');
    git(dir, 'checkout', '-qb', 'feature');
    mkdirSync(join(dir, 'api'));
    writeFileSync(join(dir, 'api', 'b.py'), '@app.post("/b")\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'b');
    git(dir, 'checkout', '-q', 'main');
    expect(gitInfo(dir)).toMatchObject({ isRepo: true, current: 'main', base: 'main' });
    const d = discover(dir, [], 'feature');
    expect(d.changedFiles).toEqual(['api/b.py']);
    expect(d.routes.map((r) => `${r.method} ${r.path} ${r.changed}`)).toEqual(['POST /b true', 'GET /a false']);
    expect(existsSync(join(dir, 'api'))).toBe(false);
    expect(() => discover(dir, [], '--output=/tmp/x')).toThrow();
  });

  it('scans a branch from a subfolder, limited to source globs', () => {
    const dir = temp();
    git(dir, 'init', '-q', '-b', 'main');
    mkdirSync(join(dir, 'svc', 'lib'), { recursive: true });
    writeFileSync(join(dir, 'svc', 'server.js'), "if (url.pathname === '/a') a();\n");
    writeFileSync(join(dir, 'svc', 'lib', 'extra.js'), "app.get('/hidden', h)\n");
    git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'a');
    git(dir, 'checkout', '-qb', 'feature');
    writeFileSync(join(dir, 'svc', 'server.js'), "if (url.pathname === '/a') a();\nif (req.method === 'POST' && url.pathname === '/b') b();\n");
    git(dir, 'commit', '-qam', 'b');
    git(dir, 'checkout', '-q', 'main');
    const d = discover(join(dir, 'svc'), [], 'feature', ['*.js']);
    expect(d.changedFiles).toEqual(['server.js']);
    expect(d.routes.map((r) => `${r.method} ${r.path} ${r.file} ${r.changed}`)).toEqual(['ANY /a server.js true', 'POST /b server.js true']);
  });
});

describe('tracegrove ui server', () => {
  it('serves loopback only, requires the session token for writes, and drafts flows', async () => {
    const root = copy('notes-api');
    const ui = await startUi({ dir: root });
    servers.push(ui);
    expect(ui.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect((await call(ui.port, 'GET', '/api/overview', { host: 'evil.example' })).status).toBe(421);
    const page = await call(ui.port, 'GET', '/');
    const token = /const TOKEN='([^']+)'/.exec(page.body)?.[1];
    expect(token).toBeTruthy();
    expect(() => new Function(/<script>([\s\S]*)<\/script>/.exec(page.body)![1]!)).not.toThrow();
    const overview = await call(ui.port, 'GET', '/api/overview');
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({ hasConfig: true, compileError: null });
    expect(overview.body.flows.length).toBeGreaterThan(0);
    expect((await call(ui.port, 'GET', '/api/discover')).status).toBe(200);
    expect((await call(ui.port, 'POST', '/api/draft', { body: { method: 'GET', path: '/x' } })).status).toBe(403);
    const saved = await call(ui.port, 'POST', '/api/draft', { token, body: { method: 'GET', path: '/widgets', save: true } });
    expect(saved.status).toBe(200);
    expect(existsSync(saved.body.saved)).toBe(true);
    expect((await call(ui.port, 'POST', '/api/draft', { token, body: { method: 'GET', path: '/widgets', save: true } })).status).toBe(409);
    expect((await call(ui.port, 'GET', '/api/runs/..%2f..%2fetc')).status).toBe(400);
  });
});
