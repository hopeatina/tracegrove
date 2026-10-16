/**
 * `tracegrove ui`: a loopback-only web UI over one folder. It shows the config, flows and run
 * history, runs `tracegrove test`, starts discovery at the working tree or a git branch, and
 * hands drafting to Claude Code or Codex using the settings saved in .tracegrove/settings.json.
 * Writes need the per-session token in a custom header (blocks cross-site form posts) and
 * every request must carry the loopback Host header (blocks DNS rebinding).
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Blocked } from '../core/errors.ts';
import { CONFIG_FILE, STATE_DIR, compileProject, loadAuthoringConfig, type CompileResult } from './compile.ts';
import { runTests, type TestRunReport } from './run.ts';
import { initProject } from './init.ts';
import { draftFlow, gitInfo } from './discover.ts';
import { discoverProject, draftWithAgent } from './workspace.ts';
import { detectAgents, readLocalSettings, resolveAgentSettings, writeLocalSettings } from './agent.ts';
import { UI_HTML } from './uiPage.ts';

export type UiServer = { url: string; port: number; close: () => Promise<void> };

function errorBody(error: unknown): { error: string; reasons?: Array<{ code: string; detail: string; action: string }> } {
  if (error instanceof Blocked) return { error: 'blocked', reasons: error.reasons.map((r) => ({ code: r.code, detail: r.detail, action: r.action })) };
  return { error: (error as Error).message };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 64 * 1024) throw new Error('request too large'); }
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

export async function startUi(options: { dir: string; branch?: string | null; port?: number }): Promise<UiServer> {
  const dir = resolve(options.dir);
  const token = randomBytes(18).toString('base64url');
  let running: Promise<unknown> | null = null;
  let drafting = false;

  const configPath = () => join(dir, CONFIG_FILE);
  const compiled = (): { result: CompileResult | null; error: ReturnType<typeof errorBody> | null } => {
    if (!existsSync(configPath())) return { result: null, error: null };
    try { return { result: compileProject(configPath()), error: null }; } catch (error) { return { result: null, error: errorBody(error) }; }
  };
  const runs = () => {
    const runsDir = join(dir, STATE_DIR, 'runs');
    if (!existsSync(runsDir)) return [];
    return readdirSync(runsDir).filter((name) => name !== 'latest' && existsSync(join(runsDir, name, 'summary.json'))).sort().reverse().slice(0, 50)
      .map((name) => { const r = JSON.parse(readFileSync(join(runsDir, name, 'summary.json'), 'utf8')) as TestRunReport;
        return { name, outcome: r.outcome, startedAt: r.startedAt, finishedAt: r.finishedAt, totals: r.totals, cases: r.cases.map((c) => ({ caseId: c.caseId, outcome: c.outcome, durationMs: c.durationMs })) }; });
  };
  const testDir = () => {
    try { return resolve(dir, existsSync(configPath()) ? loadAuthoringConfig(configPath()).testDir : 'tracegrove'); } catch { return join(dir, 'tracegrove'); }
  };
  /** Pruned flows keep their file with a .pruned suffix, so the compiler skips them and grafting is a rename back. */
  const pruned = () => {
    const out: Array<{ file: string; title: string }> = [];
    const walk = (d: string) => {
      if (!existsSync(d)) return;
      for (const name of readdirSync(d)) {
        const path = join(d, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.flow\.ya?ml\.pruned$/.test(name)) {
          let title = name;
          try { const doc = parseYaml(readFileSync(path, 'utf8')) as { title?: unknown }; if (typeof doc?.title === 'string') title = doc.title; } catch { /* keep name */ }
          out.push({ file: relative(dir, path).split(sep).join('/'), title });
        }
      }
    };
    walk(testDir());
    return out.sort((a, b) => a.file.localeCompare(b.file));
  };
  const flowPath = (file: unknown, suffix: '' | '.pruned') => {
    if (typeof file !== 'string' || !/^[A-Za-z0-9_./-]+\.flow\.ya?ml$/.test(file) || file.split('/').includes('..')) return null;
    const abs = resolve(dir, file + suffix);
    const root = testDir();
    return abs.startsWith(root + sep) ? abs : null;
  };

  const agentInfo = () => {
    let config = null;
    if (existsSync(configPath())) { try { config = loadAuthoringConfig(configPath()); } catch { config = null; } }
    return { settings: resolveAgentSettings(dir, config), detected: detectAgents(), drafting };
  };

  const handle = async (req: IncomingMessage, res: ServerResponse, port: number) => {
    const send = (status: number, body: unknown, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
    };
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(421, { error: 'unexpected host' });
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && req.headers['x-tracegrove-token'] !== token) return send(403, { error: 'missing session token' });
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(200, UI_HTML.replace('__TOKEN__', token).replace('__BRANCH__', JSON.stringify(options.branch ?? null)), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/overview') {
        const { result, error } = compiled();
        let config: unknown = null;
        if (existsSync(configPath())) { try { config = loadAuthoringConfig(configPath()); } catch { config = null; } }
        return send(200, { dir, hasConfig: existsSync(configPath()), config, compileError: error, flows: result?.flows ?? [], sourceDigest: result?.sourceDigest ?? null, sourceFiles: result?.sourceFiles.length ?? 0, runs: runs(), pruned: pruned(), git: gitInfo(dir), running: running !== null, agent: agentInfo() });
      }
      if (req.method === 'POST' && url.pathname === '/api/prune') {
        const body = await readJson(req);
        const graft = body.graft === true;
        const live = flowPath(body.file, '');
        const cut = flowPath(body.file, '.pruned');
        if (!live || !cut) return send(400, { error: 'file must be a .flow.yaml under the test folder' });
        const [from, to] = graft ? [cut, live] : [live, cut];
        if (!existsSync(from)) return send(404, { error: `${body.file} is not ${graft ? 'pruned' : 'a live flow'}` });
        if (existsSync(to)) return send(409, { error: `${relative(dir, to)} already exists` });
        renameSync(from, to);
        return send(200, { file: body.file, pruned: !graft });
      }
      if (req.method === 'GET' && url.pathname === '/api/settings') return send(200, agentInfo());
      if (req.method === 'POST' && url.pathname === '/api/settings') {
        const body = await readJson(req);
        const agent = (body.agent ?? {}) as Record<string, unknown>;
        const clean = Object.fromEntries(Object.entries(agent).filter(([, v]) => v !== '' && v !== null));
        writeLocalSettings(dir, { ...readLocalSettings(dir), agent: clean });
        return send(200, agentInfo());
      }
      if (req.method === 'POST' && url.pathname === '/api/agent-draft') {
        if (drafting) return send(409, { error: 'an agent draft is already in progress' });
        const body = await readJson(req);
        drafting = true;
        try {
          const result = await draftWithAgent({ dir, branch: typeof body.branch === 'string' && body.branch ? body.branch : null, intent: typeof body.intent === 'string' && body.intent.trim() ? body.intent.trim().slice(0, 2000) : null });
          return send(200, result);
        } finally { drafting = false; }
      }
      if (req.method === 'GET' && url.pathname === '/api/discover') {
        return send(200, discoverProject(dir, url.searchParams.get('branch') || null));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
        const name = decodeURIComponent(url.pathname.slice('/api/runs/'.length));
        if (!/^[A-Za-z0-9_.:-]+$/.test(name)) return send(400, { error: 'bad run name' });
        const file = join(dir, STATE_DIR, 'runs', name, 'summary.json');
        return existsSync(file) ? send(200, JSON.parse(readFileSync(file, 'utf8'))) : send(404, { error: 'run not found' });
      }
      if (req.method === 'POST' && url.pathname === '/api/test') {
        if (running) return send(409, { error: 'a run is already in progress' });
        const body = await readJson(req);
        const job = runTests({ configPath: configPath(), ...(typeof body.grep === 'string' && body.grep ? { grep: body.grep } : {}) });
        running = job;
        try { const { report } = await job; return send(200, report); } finally { running = null; }
      }
      if (req.method === 'POST' && url.pathname === '/api/init') {
        return send(200, initProject(dir));
      }
      if (req.method === 'POST' && url.pathname === '/api/draft') {
        const body = await readJson(req);
        if (typeof body.method !== 'string' || typeof body.path !== 'string' || !body.path.startsWith('/')) return send(400, { error: 'method and path required' });
        const draft = draftFlow({ method: body.method, path: body.path });
        if (body.save === true) {
          const testDir = existsSync(configPath()) ? resolve(dir, loadAuthoringConfig(configPath()).testDir) : join(dir, 'tracegrove');
          const target = join(testDir, 'discovered', draft.file);
          if (existsSync(target)) return send(409, { error: `${target} already exists` });
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, draft.yaml);
          return send(200, { ...draft, saved: target });
        }
        return send(200, draft);
      }
      return send(404, { error: 'not found' });
    } catch (error) {
      return send(error instanceof Blocked ? 422 : 500, errorBody(error));
    }
  };

  const server = createServer();
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(options.port ?? 0, '127.0.0.1', () => done()); });
  const port = (server.address() as { port: number }).port;
  server.on('request', (req, res) => { void handle(req, res, port); });
  const query = options.branch ? `?branch=${encodeURIComponent(options.branch)}` : '';
  return { url: `http://127.0.0.1:${port}/${query}`, port, close: () => new Promise((done) => server.close(() => done())) };
}
