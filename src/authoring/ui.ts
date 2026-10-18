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
import { CONFIG_FILE, STATE_DIR, compileProject, configInDirectory, loadAuthoringConfig, type CompileResult } from './compile.ts';
import { runTests, type TestRunReport } from './run.ts';
import { initProject } from './init.ts';
import { draftFlow, gitInfo } from './discover.ts';
import { discoverProject, draftWithAgent } from './workspace.ts';
import { DEFAULT_MODELS, detectAgents, readLocalSettings, resolveAgentSettings, writeLocalSettings } from './agent.ts';
import { UI_HTML } from './uiPage.ts';
import { RunActivity, runActivity } from './activity.ts';
import { readRunVideo, videoRange } from './media.ts';
import { heal, listHeals, undoHeal } from './heal.ts';
import { projectStatus } from './status.ts';
import { previewVerificationSource, savedVerificationSource, saveVerificationSource } from './verificationSource.ts';
import { readSavedRun } from './runSource.ts';
import { SavedRunName } from './runReport.ts';
import { isRunDirectory } from './runLocation.ts';
import { compareSavedRuns, SavedRunPair } from './runComparison.ts';
import { nativeImportsReply, readNativeUpload } from './uiImportsApi.ts';
import { savedWorkflowKnowledge } from './workflowKnowledge.ts';

/** What the page polls while something runs: the test run, the agent's own words, the heal phase. */
type Live = { agent: { status: 'idle' | 'running' | 'finished' | 'failed'; task: 'draft' | 'heal' | null; lines: string[]; startedAt: string | null }; heal: { status: 'idle' | 'running' | 'finished' | 'failed'; phase: string; detail: string | null } };

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
  let active: { id: string; kind: 'run' | 'heal' | 'draft'; controller: AbortController; cancelling: boolean } | null = null;
  let closing = false;
  let closePromise: Promise<void> | null = null;
  const pendingBodies = new Map<IncomingMessage, ServerResponse>();
  const readBody = async (req: IncomingMessage, res: ServerResponse) => {
    pendingBodies.set(req, res);
    try { return await readJson(req); } finally { pendingBodies.delete(req); }
  };
  const begin = (kind: 'run' | 'heal' | 'draft') => {
    const operation = { id: randomBytes(12).toString('hex'), kind, controller: new AbortController(), cancelling: false };
    active = operation; return operation;
  };
  let drafting = false;
  const live: Live = { agent: { status: 'idle', task: null, lines: [], startedAt: null }, heal: { status: 'idle', phase: '', detail: null } };
  const agentStart = (task: 'draft' | 'heal') => { live.agent = { status: 'running', task, lines: [], startedAt: new Date().toISOString() }; };
  const agentSay = (line: string) => { live.agent.lines.push(line.replaceAll(`${dir}/`, '')); if (live.agent.lines.length > 80) live.agent.lines.splice(0, live.agent.lines.length - 80); };
  let activity: RunActivity = { status: 'idle', event: null, stepId: null, label: 'No run in progress', observedAt: new Date().toISOString() };

  const configPath = () => configInDirectory(dir) ?? join(dir, CONFIG_FILE);
  const compiled = (): { result: CompileResult | null; error: ReturnType<typeof errorBody> | null } => {
    try {
      const path = configPath();
      return { result: existsSync(path) ? compileProject(path) : null, error: null };
    } catch (error) { return { result: null, error: errorBody(error) }; }
  };
  const runs = () => {
    const runsDir = join(dir, STATE_DIR, 'runs');
    if (!existsSync(runsDir)) return [];
    return readdirSync(runsDir).filter((name) => name !== 'latest' && SavedRunName.safeParse(name).success && isRunDirectory(join(runsDir, name)) &&
      (existsSync(join(runsDir, name, 'summary.json')) || existsSync(join(runsDir, name, 'bundle/manifest.json')))).sort().reverse().slice(0, 50)
      .map((name) => { const r = readSavedRun(join(runsDir, name));
        return { name, outcome: r.outcome, startedAt: r.startedAt, finishedAt: r.finishedAt, totals: r.totals, evidenceStatus: r.evidenceStatus, bundleVerified: r.bundleVerified,
          cases: r.cases.map((c) => ({ caseId: c.caseId, outcome: c.outcome, durationMs: c.durationMs })) }; });
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
        else if (/\.flow\.(?:ya?ml|ts)\.pruned$/.test(name)) {
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
    if (typeof file !== 'string' || !/^[A-Za-z0-9_./-]+\.flow\.(?:ya?ml|ts)$/.test(file) || file.split('/').includes('..')) return null;
    const abs = resolve(dir, file + suffix);
    const root = testDir();
    return abs.startsWith(root + sep) ? abs : null;
  };

  const agentInfo = () => {
    let config = null;
    if (existsSync(configPath())) { try { config = loadAuthoringConfig(configPath()); } catch { config = null; } }
    return { settings: resolveAgentSettings(dir, config), detected: detectAgents(), drafting };
  };
  const sourceInfo = (result: CompileResult | null, error: ReturnType<typeof errorBody> | null) => ({
    selection: savedVerificationSource(dir), binding: result?.sourceBinding ?? null,
    status: error ? 'blocked' : 'ready', error,
  });

  const handle = async (req: IncomingMessage, res: ServerResponse, port: number) => {
    const send = (status: number, body: unknown, type = 'application/json') => {
      if (res.writableEnded || res.destroyed) return;
      const unreadRejection = status >= 400 && !req.complete;
      if (unreadRejection) res.once('finish', () => req.socket.destroySoon());
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(unreadRejection ? { connection: 'close' } : {}) });
      res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
    };
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(421, { error: 'unexpected host' });
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && req.headers['x-tracegrove-token'] !== token) return send(403, { error: 'missing session token' });
    if (closing && req.method === 'POST') return send(409, { error: 'UI is closing; new work is not admitted.' });
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const scriptJson = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
        return send(200, UI_HTML.replace('__TOKEN__', token).replace('__BRANCH__', scriptJson(options.branch ?? null)).replace('__DEFAULT_MODELS__', scriptJson(DEFAULT_MODELS)), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/api/overview') {
        const { result, error } = compiled();
        let config: unknown = null;
        if (existsSync(configPath())) { try { config = loadAuthoringConfig(configPath()); } catch { config = null; } }
        return send(200, { dir, hasConfig: existsSync(configPath()), config, compileError: error, flows: result?.flows ?? [], sourceDigest: result?.sourceDigest ?? null, sourceFiles: result?.sourceFiles.length ?? 0, runs: runs(), pruned: pruned(), git: gitInfo(dir), running: running !== null, activeRunId: active?.id ?? null, cancelling: active?.cancelling ?? false, agent: agentInfo(), verificationSource: sourceInfo(result, error) });
      }
      if (url.pathname === '/api/imports' || url.pathname.startsWith('/api/imports/')) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'unexpected origin' });
        const reply = await nativeImportsReply(req, url, { root: dir, canWrite: () => !closing && !active,
          readBytes: async maximum => { pendingBodies.set(req, res); try { return await readNativeUpload(req, maximum); } finally { pendingBodies.delete(req); } } });
        if (!Buffer.isBuffer(reply.body)) return send(reply.status, reply.body);
        if (!res.writableEnded && !res.destroyed) { res.writeHead(reply.status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...reply.headers }); res.end(reply.body); }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/source/preview') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        if (typeof body.path !== 'string' || !body.path.trim() || body.path.length > 8192) return send(400, { error: 'Enter a snapshot manifest path.' });
        return send(200, previewVerificationSource(dir, body.path.trim(), loadAuthoringConfig(configPath())));
      }
      if (req.method === 'POST' && url.pathname === '/api/source') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        saveVerificationSource(dir, body.source, loadAuthoringConfig(configPath()));
        const { result, error } = compiled();
        return send(200, sourceInfo(result, error));
      }
      if (req.method === 'POST' && url.pathname === '/api/prune') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        const graft = body.graft === true;
        const live = flowPath(body.file, '');
        const cut = flowPath(body.file, '.pruned');
        if (!live || !cut) return send(400, { error: 'file must be a .flow.yaml, .flow.yml, or .flow.ts under the test folder' });
        const [from, to] = graft ? [cut, live] : [live, cut];
        if (!existsSync(from)) return send(404, { error: `${body.file} is not ${graft ? 'pruned' : 'a live flow'}` });
        if (existsSync(to)) return send(409, { error: `${relative(dir, to)} already exists` });
        renameSync(from, to);
        return send(200, { file: body.file, pruned: !graft });
      }
      if (req.method === 'GET' && url.pathname === '/api/settings') return send(200, agentInfo());
      if (req.method === 'GET' && url.pathname === '/api/activity') return send(200, RunActivity.parse(activity));
      if (req.method === 'GET' && url.pathname === '/api/run-control') return send(200, { runId: active?.id ?? null, operation: active?.kind ?? null, cancelling: active?.cancelling ?? false, closing });
      if (req.method === 'GET' && url.pathname === '/api/live') return send(200, { run: RunActivity.parse(activity), agent: live.agent, heal: live.heal });
      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, projectStatus(dir));
      if (req.method === 'GET' && url.pathname === '/api/heals') return send(200, listHeals(dir).slice(0, 20));
      if (req.method === 'POST' && url.pathname === '/api/heal') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        if (running || drafting) return send(409, { error: 'a run or agent draft is already in progress' });
        live.heal = { status: 'running', phase: 'Starting', detail: null };
        activity = { status: 'running', event: null, stepId: null, label: 'Healing', observedAt: new Date().toISOString() };
        const operation = begin('heal');
        const job = heal({ dir, signal: operation.controller.signal, agent: body.agent !== false, dryRun: body.dryRun === true,
          onProgress: (phase, detail) => {
            live.heal = { status: 'running', phase, detail: detail ?? null };
            if (phase === 'Asking the agent') agentStart('heal');
            activity = { status: 'running', event: null, stepId: null, label: `${phase}${detail ? ` · ${detail}` : ''}`.slice(0, 300), observedAt: new Date().toISOString() };
          },
          onAgentActivity: agentSay });
        running = job;
        try {
          const report = await job;
          live.heal = { status: 'finished', phase: 'Done', detail: report.outcome };
          if (live.agent.status === 'running') live.agent.status = 'finished';
          activity = { status: 'finished', event: null, stepId: null, label: `Heal finished: ${report.outcome}`, observedAt: report.finishedAt };
          return send(200, report);
        } catch (error) {
          live.heal = { status: 'failed', phase: 'Failed', detail: (error as Error).message };
          if (live.agent.status === 'running') live.agent.status = 'failed';
          activity = { status: 'failed', event: null, stepId: null, label: 'Heal could not be completed', observedAt: new Date().toISOString() };
          throw error;
        } finally { if (active === operation) { running = null; active = null; } }
      }
      if (req.method === 'POST' && url.pathname === '/api/heal/undo') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        if (typeof body.id !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(body.id)) return send(400, { error: 'id required' });
        return send(200, undoHeal(dir, body.id));
      }
      if (req.method === 'POST' && url.pathname === '/api/settings') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        const agent = (body.agent ?? {}) as Record<string, unknown>;
        const clean = Object.fromEntries(Object.entries(agent).filter(([, v]) => v !== '' && v !== null));
        writeLocalSettings(dir, { ...readLocalSettings(dir), agent: clean });
        return send(200, agentInfo());
      }
      if (req.method === 'POST' && url.pathname === '/api/agent-draft') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        // Body reads yield: admit against the current state only after parsing.
        if (drafting) return send(409, { error: 'an agent draft is already in progress' });
        drafting = true;
        const operation = begin('draft');
        agentStart('draft');
        try {
          const job = draftWithAgent({ dir, signal: operation.controller.signal, branch: typeof body.branch === 'string' && body.branch ? body.branch : null, intent: typeof body.intent === 'string' && body.intent.trim() ? body.intent.trim().slice(0, 2000) : null, onActivity: agentSay });
          running = job;
          const result = await job;
          live.agent.status = result.agent.exitCode === 0 ? 'finished' : 'failed';
          return send(200, result);
        } catch (error) { live.agent.status = 'failed'; agentSay((error as Error).message); throw error; }
        finally { drafting = false; if (active === operation) { running = null; active = null; } }
      }
      if (req.method === 'GET' && url.pathname === '/api/discover') {
        return send(200, discoverProject(dir, url.searchParams.get('branch') || null));
      }
      const video = /^\/api\/runs\/([^/]+)\/media\/([a-f0-9]{64})$/.exec(url.pathname);
      if ((req.method === 'GET' || req.method === 'HEAD') && video) {
        try {
          if (readSavedRun(join(dir, STATE_DIR, 'runs', decodeURIComponent(video[1]!))).evidenceStatus !== 'verified') return send(409, { error: 'Recording is not bound to freshly verified saved evidence.' });
          const bytes = readRunVideo(dir, decodeURIComponent(video[1]!), video[2]!, url.searchParams.get('case') ?? '');
          const range = videoRange(req.headers.range, bytes.length);
          const headers = { 'content-type': 'video/webm', 'cache-control': 'private, no-store', 'accept-ranges': 'bytes',
            'cross-origin-resource-policy': 'same-origin', 'x-content-type-options': 'nosniff' };
          if (!range) { res.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` }); res.end(); return; }
          res.writeHead(req.headers.range ? 206 : 200, { ...headers, 'content-length': range.end - range.start + 1,
            ...(req.headers.range ? { 'content-range': `bytes ${range.start}-${range.end}/${bytes.length}` } : {}) });
          res.end(req.method === 'HEAD' ? undefined : bytes.subarray(range.start, range.end + 1)); return;
        } catch { return send(409, { error: 'Recording is unavailable or its evidence failed verification.' }); }
      }
      if (req.method === 'GET' && ['/api/workflow-map','/api/workflows'].includes(url.pathname)) {
        const reply=savedWorkflowKnowledge(dir,url);return send(reply.status,reply.body);
      }
      if (req.method === 'GET' && url.pathname === '/api/compare') {
        const pair = SavedRunPair.safeParse(Object.fromEntries(url.searchParams));
        if (!pair.success || url.searchParams.getAll('baseline').length !== 1 || url.searchParams.getAll('candidate').length !== 1)
          return send(400, { error: 'Select one named baseline and one named candidate.' });
        try { return send(200, compareSavedRuns(dir, pair.data)); }
        catch { return send(409, { error: 'Comparison unavailable. Re-check both retained evidence bundles; no recorded result is available for this comparison.' }); }
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
        const name = decodeURIComponent(url.pathname.slice('/api/runs/'.length));
        if (!SavedRunName.safeParse(name).success || name === 'latest') return send(400, { error: 'bad run name' });
        const file = join(dir, STATE_DIR, 'runs', name, 'summary.json');
        return existsSync(dirname(file)) ? send(200, readSavedRun(dirname(file))) : send(404, { error: 'run not found' });
      }
      if (req.method === 'POST' && url.pathname === '/api/test') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
        if (running) return send(409, { error: 'a run is already in progress' });
        activity = { status: 'running', event: null, stepId: null, label: 'Planning verification', observedAt: new Date().toISOString() };
        const operation = begin('run');
        const job = runTests({ signal: operation.controller.signal, configPath: configPath(), ...(typeof body.grep === 'string' && body.grep ? { grep: body.grep } : {}),
          onEvent: event => { activity = runActivity(event); } });
        running = job;
        try {
          const { report } = await job;
          const checked = readSavedRun(report.runDir);
          activity = { status: 'finished', event: null, stepId: null, label: `Run finished: ${checked.outcome}`, observedAt: checked.finishedAt || new Date().toISOString() };
          return send(200, checked);
        } catch (error) {
          activity = { status: 'failed', event: null, stepId: null, label: 'Run could not be completed', observedAt: new Date().toISOString() };
          throw error;
        } finally { if (active === operation) { running = null; active = null; } }
      }
      if (req.method === 'POST' && url.pathname === '/api/cancel') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        const operation = active; const job = running;
        if (!operation || !job || body.runId !== operation.id) return send(409, { error: 'No matching active operation.' });
        if (!operation.cancelling) { operation.cancelling = true; operation.controller.abort(new Error('user_cancelled')); }
        try {
          const value = await job as { report?: { outcome: string; exitCode: number; executionId: string | null; runDir: string; bundleVerified: boolean | null }; outcome?: string; exitCode?: number; agent?: { exitCode: number } };
          const facts = operation.kind === 'run' ? value.report : operation.kind === 'draft'
            ? { outcome: value.agent?.exitCode === 4 ? 'cancelled' : value.agent?.exitCode === 0 ? 'completed' : 'infrastructure_failed', exitCode: value.agent?.exitCode ?? 3,
              edits: 'Drafted edits remain for review.' }
            : { outcome: value.outcome, exitCode: value.exitCode };
          return send(200, { runId: operation.id, operation: operation.kind, state: 'settled', ...facts,
            cleanup: 'Inspect the saved receipts and heal changes; cancellation alone does not confirm cleanup.' });
        } catch { return send(500, { error: 'Operation did not settle successfully; preserve its existing state and inspect its records.' }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/init') {
        if (closing || active) return send(409, { error: 'UI is closing or an operation is active' });
        return send(200, initProject(dir));
      }
      if (req.method === 'POST' && url.pathname === '/api/draft') {
        const body = await readBody(req, res);
        if (closing) return send(409, { error: 'UI is closing; new work is not admitted.' });
        if (active) return send(409, { error: 'an operation is already in progress' });
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
  return { url: `http://127.0.0.1:${port}/${query}`, port, close: () => {
    if (closePromise) return closePromise;
    closing = true;
    if (active && !active.cancelling) { active.cancelling = true; active.controller.abort(new Error('ui_closed')); }
    const pending = running;
    closePromise = (async () => {
      try { await pending; } catch { /* Preserve response failure; close grants no cleanup verdict. */ }
      for (const [request, response] of pendingBodies) {
        if (!response.writableEnded && !response.destroyed) {
          response.once('finish', () => request.socket.destroySoon());
          response.writeHead(409, { 'content-type': 'application/json', connection: 'close' });
          response.end(JSON.stringify({ error: 'UI is closing; new work is not admitted.' }));
        }
      }
      await new Promise<void>(done => server.close(() => done()));
    })();
    return closePromise;
  } };
}
