import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTrafficProxy, type TrafficRecord, type TrafficRecorder } from '../src/hosts/trafficProxy.ts';
import { matchesTemplate, observedRequests } from '../src/authoring/traffic.ts';
import { blindSpots, discover, scanSource, templateOfObserved } from '../src/authoring/discover.ts';
import { buildRepairPrompt } from '../src/authoring/agent.ts';
import { classify } from '../src/authoring/heal.ts';
import { runTests, type TestRunReport } from '../src/authoring/run.ts';
import { discoverProject, latestObservedRun } from '../src/authoring/workspace.ts';

const SAMPLES = join(import.meta.dirname, '..', 'src', 'samples');
const temps: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-observe-')); temps.push(dir); return dir; }

async function upstream(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server: Server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  closers.push(() => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }));
  return (server.address() as AddressInfo).port;
}
async function proxy(port: number): Promise<TrafficRecorder> {
  const recorder = await startTrafficProxy(port);
  closers.unshift(() => recorder.close());
  return recorder;
}
function get(origin: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((done, fail) => {
    const req = request(`${origin}${path}`, { headers }, (res) => { let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body })); });
    req.on('error', fail); req.end();
  });
}

describe('recording proxy', () => {
  it('closes the upstream request when the client leaves a streaming answer', async () => {
    let upstreamClosed!: () => void;
    const closed = new Promise<void>((done) => { upstreamClosed = done; });
    const port = await upstream((req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n');
      res.on('close', () => upstreamClosed());
    });
    const recorder = await proxy(port);
    await new Promise<void>((done, fail) => {
      const req = request(`${recorder.origin}/stream`, (res) => { res.once('data', () => { req.destroy(); done(); }); });
      req.on('error', () => undefined); req.on('close', () => undefined); req.end();
      setTimeout(() => fail(new Error('no first event')), 5000);
    });
    await expect(Promise.race([closed.then(() => 'closed'), new Promise((done) => setTimeout(() => done('still open'), 3000))])).resolves.toBe('closed');
  });

  it('forwards requests, attributes them to the running step, and records no header, body or query values', async () => {
    const seenHosts: string[] = [];
    const port = await upstream((req, res) => { seenHosts.push(String(req.headers.host)); res.writeHead(req.url?.startsWith('/missing') ? 404 : 200, { 'content-type': 'text/plain' }); res.end(`hello ${req.url}`); });
    const recorder = await proxy(port);
    const records: TrafficRecord[] = [];
    recorder.subscribe((r) => records.push(r));
    recorder.setStep('create_note');
    const answer = await get(recorder.origin, '/notes/42?token=secret-value&b=1', { authorization: 'Bearer secret-token' });
    recorder.setStep(null);
    await get(recorder.origin, '/missing');
    expect(answer).toMatchObject({ status: 200, body: 'hello /notes/42?token=secret-value&b=1' });
    expect(seenHosts[0]).toBe(`127.0.0.1:${port}`);
    expect(records).toEqual([
      expect.objectContaining({ stepId: 'create_note', method: 'GET', path: '/notes/42', queryKeys: ['b', 'token'], status: 200 }),
      expect.objectContaining({ stepId: null, path: '/missing', status: 404 }),
    ]);
    expect(JSON.stringify(records)).not.toMatch(/secret/);
  });

  it('rewrites redirects to the private port onto the proxy origin, and counts requests after sealing', async () => {
    const port = await upstream((_req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${port}/home` }); res.end(); });
    const recorder = await proxy(port);
    const records: TrafficRecord[] = [];
    recorder.subscribe((r) => records.push(r));
    const answer = await get(recorder.origin, '/login');
    expect(answer.headers.location).toBe(`${recorder.origin}/home`);
    expect(recorder.seal()).toEqual({ recorded: 1, dropped: 0, afterSeal: 0 });
    await get(recorder.origin, '/login');
    expect(records).toHaveLength(1);
    expect(recorder.seal().afterSeal).toBe(1);
  });

  it('answers 502 and records a null status when the app is gone', async () => {
    const port = await upstream((_req, res) => res.end());
    const recorder = await proxy(port);
    const records: TrafficRecord[] = [];
    recorder.subscribe((r) => records.push(r));
    await closers.splice(1, 1)[0]!(); // stop the upstream, keep the proxy
    const answer = await get(recorder.origin, '/x');
    expect(answer.status).toBe(502);
    expect(records[0]).toMatchObject({ path: '/x', status: null });
  });
});

describe('observed requests', () => {
  it('groups sealed app.request events by step, method, path and status', () => {
    const line = (stepId: string | null, path: string, status: number) => JSON.stringify({ kind: 'app.request', stepId, redactedPayload: { method: 'GET', path, status, durationMs: 2, queryKeys: [] } });
    const events = [line('a', '/notes/1', 200), line('a', '/notes/1', 200), line(null, '/notes', 201), '{"kind":"step.started"}', 'not json'].join('\n');
    expect(observedRequests(events)).toEqual([
      { step: 'a', method: 'GET', path: '/notes/1', status: 200, count: 2, durationMs: 4 },
      { step: null, method: 'GET', path: '/notes', status: 201, count: 1, durationMs: 2 },
    ]);
  });

  it('matches concrete paths against route templates one segment at a time', () => {
    expect(matchesTemplate('/notes/{id}', '/notes/42')).toBe(true);
    expect(matchesTemplate('/notes/{id}/', '/notes/42')).toBe(true);
    expect(matchesTemplate('/notes/{id}', '/notes/42/share')).toBe(false);
    expect(matchesTemplate('/notes/{id}', '/notes/')).toBe(false);
    expect(matchesTemplate('/', '/')).toBe(true);
  });

  it('collapses id-like segments of observed paths', () => {
    expect(templateOfObserved('/notes/42/shares/7d0c2a4e-6f1b-4d8e-9a3c-2b5e8f1a9c7d')).toBe('/notes/{id}/shares/{id}');
    expect(templateOfObserved('/assets/app.js')).toBe('/assets/app.js');
    expect(templateOfObserved('/u/nt_8f3k2m9q1x7v4b6z')).toBe('/u/{id}');
  });
});

describe('discovery with traffic and ambiguity', () => {
  it('confirms scanned routes by traffic, adds routes only traffic saw, and names what the scan cannot read', () => {
    const root = temp();
    writeFileSync(join(root, 'server.js'), [
      "app.get('/notes', list);",
      "app.get('/notes/:id', one);",
      "app.use('/admin', adminRouter);",
      "if (url.pathname.match(/^\\/shares\\/\\w+$/)) share(req, res);",
    ].join('\n'));
    const found = discover(root, [{ caseId: 'list-notes', method: 'GET', path: '/notes' }], null, undefined, {
      run: 'r1', stale: false,
      cases: [{ caseId: 'read-note', requests: [
        { step: 'read', method: 'GET', path: '/notes/9', status: 200, count: 1, durationMs: 1 },
        { step: 'share', method: 'POST', path: '/shares/abc123def456ghi7', status: 201, count: 1, durationMs: 1 },
        { step: 'typo', method: 'GET', path: '/nope', status: 404, count: 1, durationMs: 1 },
      ] }],
    });
    const byKey = new Map(found.routes.map((r) => [`${r.method} ${r.path}`, r]));
    expect(byKey.get('GET /notes')).toMatchObject({ provenance: 'static', coveredBy: ['list-notes'], observedBy: [] });
    expect(byKey.get('GET /notes/{id}')).toMatchObject({ provenance: 'static', observedBy: ['read-note'] });
    expect(byKey.get('POST /shares/{id}')).toMatchObject({ provenance: 'traffic', file: null, observedBy: ['read-note'] });
    expect(byKey.has('GET /nope')).toBe(false);
    expect(found.uncovered).toBe(0);
    expect(found.observed).toEqual({ run: 'r1', stale: false, requests: 3 });
    expect(found.ambiguities.map((a) => a.kind).sort()).toEqual(['unlisted_traffic', 'unreadable_routing', 'unreadable_routing']);
    expect(found.ambiguities.find((a) => a.kind === 'unlisted_traffic')?.ask).toContain('POST /shares/{id}');
    // Once a flow names the route the app served, it is confirmed, not a question.
    const named = discover(root, [{ caseId: 'share', method: 'POST', path: '/shares/{token}' }], null, undefined, { run: 'r1', stale: false, cases: [{ caseId: 'share', requests: [{ step: 's', method: 'POST', path: '/shares/abc123def456ghi7', status: 201, count: 1, durationMs: 1 }] }] });
    expect(named.routes.find((r) => r.provenance === 'traffic')).toMatchObject({ coveredBy: ['share'], observedBy: ['share'] });
    expect(named.ambiguities.map((a) => a.kind)).toEqual(['unreadable_routing', 'unreadable_routing']);
  });

  it('flags routing styles the scanner cannot parse, per language', () => {
    expect(blindSpots('a.ts', '@Controller("notes")\nclass C { @Get(":id") one() {} }').map((s) => s.what)).toEqual(['decorator routes (NestJS style)']);
    expect(blindSpots('app/api/notes/route.ts', 'export async function GET() {}')[0]).toMatchObject({ line: 1, what: 'file-based route handlers (Next.js style)' });
    expect(blindSpots('main.py', 'router = APIRouter(prefix="/notes")\napp.include_router(router)').map((s) => s.what)).toEqual(['an APIRouter with a prefix', 'included routers or URL modules']);
    expect(blindSpots('main.py', 'app.use("/x", r)')).toEqual([]);
    expect(blindSpots('plain.js', "app.get('/notes', h)")).toEqual([]);
    // Prose about routes in comments is neither a route nor a blind spot; URLs in strings survive.
    expect(scanSource('a.js', "// app.get('/old', h)\n/* pathname === '/gone' */\nfetch('http://x/y'); app.get('/live', h) // app.get('/x')")).toEqual([expect.objectContaining({ path: '/live', line: 3 })]);
    expect(blindSpots('a.py', '# app.include_router(r)\nx = 1')).toEqual([]);
  });
});

describe('observed coverage from a real run', () => {
  it('reads the requests the notes sample served from its verified evidence', async () => {
    const root = temp();
    cpSync(join(SAMPLES, 'notes-api'), root, { recursive: true, filter: (src) => !src.includes('.tracegrove') });
    const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml') });
    expect(report.bundleVerified).toBe(true);
    const served = report.cases.flatMap((c) => c.requests ?? []);
    expect(served.length).toBeGreaterThan(0);
    expect(served.every((r) => r.step === null || report.cases.some((c) => c.steps.some((s) => s.id === r.step)))).toBe(true);
    const observed = latestObservedRun(root, null);
    expect(observed?.cases.length).toBe(report.cases.length);
    const found = discoverProject(root, null);
    expect(found.observed?.stale).toBe(false);
    expect(found.routes.some((r) => r.observedBy.length > 0)).toBe(true);
  }, 60_000);
});

describe('agent repair and typed failure codes', () => {
  it('tells the agent what failed and never to weaken an assertion the code shows is a bug', () => {
    const prompt = buildRepairPrompt({ round: 1, rounds: 2, tracegrove: ['tracegrove'], failures: [{ file: 'tracegrove/discovered/notes/share.flow.yaml', caseId: 'share', step: 'share it', message: 'expected status 201, got 403', observed: 'POST /shares -> 403' }] });
    expect(prompt).toContain('repair round 1 of 2');
    expect(prompt).toContain('expected status 201, got 403');
    expect(prompt).toMatch(/Never weaken an assertion/);
    expect(prompt).toContain('product bug:');
  });

  it('classifies startup failures by code, not by message text', () => {
    const report = (failure: { step: string; message: string; observed: null; code?: string }): TestRunReport => ({
      schemaVersion: 'tracegrove.run-summary/v1', project: 'p', outcome: 'infrastructure_failed', exitCode: 3, startedAt: '', finishedAt: '', executionId: null, sourceDigest: '', runDir: '/tmp/x', bundleVerified: true, blockers: [],
      cases: [{ caseId: 'c', file: 'f.flow.yaml', title: 't', outcome: 'infrastructure_failed', durationMs: 0, steps: [], failure }], totals: { passed: 0, failed: 0, other: 1 },
    } as unknown as TestRunReport);
    const reworded = classify(report({ step: '(app startup)', message: 'readiness probe gave up on http://127.0.0.1:1/healthz', observed: null, code: 'app_not_ready' }), []);
    expect(reworded[0]).toMatchObject({ kind: 'setup', code: 'app_not_ready' });
    expect(reworded[0]?.fix).toContain('/healthz');
    const exited = classify(report({ step: '(app startup)', message: 'did not become ready at http://x/health within', observed: null, code: 'app_exited_early' }), []);
    expect(exited[0]).toMatchObject({ code: 'app_exited_early' });
    expect(exited[0]?.fix).toContain('exited');
    const browser = classify(report({ step: 'open page', message: 'video_encoder_missing', observed: null }), []);
    expect(browser[0]).toMatchObject({ code: 'video_encoder_missing' });
    expect(browser[0]?.fix).toContain('setup browsers');
  });
});
