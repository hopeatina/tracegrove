import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { UrlHost, waitDeployment } from '../src/hosts/url.ts';
import { runTests } from '../src/authoring/run.ts';
import { RequestBudget } from '../src/core/requestBudget.ts';
import { Deadline } from '../src/core/deadline.ts';
import { HttpDriver } from '../src/adapters/http/driver.ts';
import { BrowserRequestPolicy } from '../src/adapters/browser/requestPolicy.ts';
import { establishPersonas } from '../src/hosts/personas.ts';
import { loadAuthoringConfig } from '../src/authoring/compile.ts';
import { resolveEnvironment } from '../src/environments/resolve.ts';
import { targetBinding } from '../src/environments/binding.ts';
import { ConversationDriver } from '../src/adapters/conversation/driver.ts';
import { McpDriver } from '../src/adapters/mcp/driver.ts';
import { ContainerHost } from '../src/hosts/container.ts';
import { ComposeHost, composeDigest } from '../src/hosts/compose.ts';
import type { HostStartContext } from '../src/hosts/types.ts';

const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const origin = 'https://deployment-fixture.invalid';
function fixture(maxRequests: number, observe = false, release?: { field: string; expect: string }) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'tg-request-budget-')); roots.push(root);
  mkdirSync(join(root, 'tracegrove'));
  writeFileSync(join(root, 'tracegrove.config.yaml'), stringify({ project: 'request-budget', app: { adapter: 'node', entry: 'unused.mjs' }, personas: { visitor: { subject: 'visitor' } },
    environments: { fixture: { target: { url: origin, health: '/fixture-ready', readyTimeoutMs: 120, ...(release ? { release } : {}) }, class: 'deployed_preview', writes: 'none', agents: 'allow', personas: {}, budget: { maxRequests } } } }));
  for (const id of ['first', 'second']) writeFileSync(join(root, 'tracegrove', `${id}.flow.yaml`), stringify({ title: id, envs: ['fixture'], as: 'none', steps: [
    { GET: `/${id}`, ...(observe ? { observe: true, timeoutMs: 1500 } : {}), expect: observe ? { status: 200, json: { ready: true } } : 200 },
  ] }));
  return join(root, 'tracegrove.config.yaml');
}
function transport(answer: (path: string) => Response) {
  const mock = vi.fn(async (url: string | URL | Request) => {
    const target = new URL(String(url));
    expect(target.origin).toBe(origin);
    return answer(target.pathname);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

it('never retries a readiness access refusal, including across later selection cells', async () => {
  const fetch = transport(() => new Response('forbidden fixture', { status: 403 }));
  const configPath = fixture(50);
  const { report } = await runTests({ configPath, env: 'fixture' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(report.outcome).toBe('blocked');
  expect(JSON.stringify(report)).toContain('deployment_access_denied');
});

it.each([
  { name: 'different release', body: { release: 'previous' } },
  { name: 'missing release', body: { ready: true } },
  { name: 'different numeric release', body: { release: 41 } },
])('latches an identity mismatch across cells: $name', async ({ body }) => {
  let probes = 0;
  // A later probe would report the expected release; this run must still stop at the first refusal.
  const fetch = transport(path => {
    expect(path).toBe('/fixture-ready');
    return Response.json(++probes === 1 ? body : { release: 'expected' });
  });
  const start = vi.spyOn(UrlHost.prototype, 'start');
  try {
    const { report } = await runTests({ configPath: fixture(50, false, { field: 'release', expect: 'expected' }), env: 'fixture' });
    expect(start).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(report.outcome).toBe('blocked');
    expect(report.exitCode).toBe(2);
    expect(report.cases).toHaveLength(2);
    for (const cell of report.cases) {
      expect(cell.outcome).toBe('blocked');
      expect(cell.failure?.message).toContain('identity_mismatch');
      expect(cell.steps.every(step => step.result === 'not_run')).toBe(true);
    }
  } finally { start.mockRestore(); }
});

it('acquires and executes later cells when the expected release matches', async () => {
  const fetch = transport(() => Response.json({ release: 'expected' }));
  const { report } = await runTests({ configPath: fixture(50, false, { field: 'release', expect: 'expected' }), env: 'fixture' });
  expect(report.outcome).toBe('passed');
  expect(report.cases).toHaveLength(2);
  expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/fixture-ready', '/first', '/fixture-ready', '/second']);
});

it('does not latch an intentional step-level authorization-negative assertion', async () => {
  const configPath = fixture(50);
  writeFileSync(join(configPath, '..', 'tracegrove', 'first.flow.yaml'), stringify({ title: 'first', envs: ['fixture'], as: 'none', steps: [{ GET: '/first', expect: 403 }] }));
  const fetch = transport(path => new Response(null, { status: path === '/first' ? 403 : 200 }));
  const { report } = await runTests({ configPath, env: 'fixture' });
  expect(report.outcome).toBe('passed');
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(report.cases.every(cell => cell.outcome === 'passed')).toBe(true);
});

it('does not latch an ordinary failed step assertion across independent cells', async () => {
  const fetch = transport(path => new Response(null, { status: path === '/first' ? 500 : 200 }));
  const { report } = await runTests({ configPath: fixture(50), env: 'fixture' });
  expect(report.outcome).toBe('assertion_failed');
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(report.cases.map(cell => cell.outcome)).toEqual(['assertion_failed', 'passed']);
});

it('does not reset the request ceiling between selection cells or omit readiness', async () => {
  const fetch = transport(() => Response.json({ ready: true }));
  const { report } = await runTests({ configPath: fixture(3), env: 'fixture' });
  expect(fetch).not.toHaveBeenCalled(); // Aggregate planning estimate refuses the selection before acquisition.
  expect(report.outcome).toBe('blocked');
  expect(JSON.stringify(report)).toContain('budget_exceeded');
});

it('charges transient readiness attempts and refuses dispatch after exhaustion', async () => {
  const fetch = transport(() => new Response(null, { status: 503 }));
  const budget = new RequestBudget(2);
  await expect(waitDeployment(origin, '/fixture-ready', 1000, new AbortController().signal, budget)).rejects.toThrow('budget_exceeded');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(budget.count).toBe(2);
});

it('charges failed transport attempts but never dispatches a pre-cancelled readiness call', async () => {
  const fetch = vi.fn(async () => { throw new Error('synthetic network failure'); }); vi.stubGlobal('fetch', fetch);
  const budget = new RequestBudget(1);
  await expect(waitDeployment(origin, '/fixture-ready', 1000, new AbortController().signal, budget)).rejects.toThrow('budget_exceeded');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockClear();
  await expect(waitDeployment(origin, '/fixture-ready', 1000, AbortSignal.abort(), new RequestBudget(10))).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it('shares synchronous reservations across concurrent HTTP drivers', async () => {
  const fetch = transport(() => Response.json({ ok: true }));
  const requestBudget = new RequestBudget(2);
  const drivers = [0, 1, 2].map(() => new HttpDriver({ persona: null, named: {} }, new Set([origin]), { requestBudget }));
  const results = await Promise.allSettled(drivers.map(driver => driver.request({ origin, method: 'GET', path: '/fixture', auth: { kind: 'none' }, variables: {}, deadline: Deadline.in(1000) })));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
});

it('meters every admitted browser hop while rejected origins spend no dispatch allowance', () => {
  const budget = new RequestBudget(2);
  const policy = new BrowserRequestPolicy({ origin, mainFrameId: 'main', extraOrigins: new Set(), requestBudget: budget });
  const event = (id: string, url: string) => ({ requestId: id, resourceType: 'Document', request: { method: 'GET', url } });
  expect(policy.allows(event('rejected', 'https://not-admitted.invalid/'))).toBe(false);
  expect(budget.count).toBe(0);
  expect(policy.allows(event('one', `${origin}/fixture`))).toBe(true);
  expect(policy.allows({ ...event('two', `${origin}/redirect-target`), redirectedRequestId: 'one' })).toBe(true);
  expect(() => policy.allows(event('three', `${origin}/asset.js`))).toThrow('budget_exceeded');
  expect(budget.count).toBe(2);
});

it.each([false, true])('meters persona setup and records cleanup uncertainty without following a redirect=%s', async cleanupRedirect => {
  const configPath = fixture(10);
  const config = loadAuthoringConfig(configPath);
  config.environments!.fixture!.personas = { visitor: { from: 'orgx-broker://fixture?ttl=60', auth: 'bearer' } };
  config.environments!.fixture!.whoami = { GET: '/fixture-identity', subject: 'id' };
  const environment = resolveEnvironment(config, 'fixture');
  const binding = targetBinding(environment, config, join(configPath, '..'), join(configPath, '..', '.tracegrove/compiled'))!;
  const saved = { url: process.env.TRACEGROVE_ORGX_BROKER_URL, token: process.env.TRACEGROVE_ORGX_TOKEN };
  process.env.TRACEGROVE_ORGX_BROKER_URL = origin;
  process.env.TRACEGROVE_ORGX_TOKEN = 'synthetic-fixture-grant';
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(new URL(String(url)).origin).toBe(origin);
    const path = new URL(String(url)).pathname;
    if (path === '/api/test-personas' && init?.method === 'POST') return Response.json({ persona: { id: 'owned-fixture', subject: 'visitor', workspaceId: 'fixture', role: 'member' }, token: 'synthetic-fixture-token', expiresAt: new Date(Date.now() + 60_000).toISOString() }, { status: 201 });
    expect(init?.redirect).toBe('manual');
    if (path === '/api/test-personas/owned-fixture' && init?.method === 'DELETE') return new Response(null, cleanupRedirect ? { status: 307, headers: { location: 'https://not-admitted.invalid/revoke' } } : { status: 204 });
    if (path === '/api/test-personas/owned-fixture' && init?.method === 'GET') return new Response(null, { status: 404 });
    throw new Error('unexpected synthetic request');
  });
  vi.stubGlobal('fetch', fetch);
  const budget = new RequestBudget(1);
  try {
    const failed = establishPersonas({ binding, origin, requested: ['visitor_token'], root: roots.at(-1)!, runId: 'fixture-run', signal: new AbortController().signal, hostId: 'fixture-host', requestBudget: budget });
    await expect(failed).rejects.toThrow('budget_exceeded');
    if (cleanupRedirect) await expect(failed).rejects.toThrow('deployed_cleanup_unconfirmed');
    expect(budget.count).toBe(1);
    expect(fetch.mock.calls.map(([url, init]) => [init?.method, new URL(String(url)).pathname])).toEqual([
      ['POST', '/api/test-personas'], ['DELETE', '/api/test-personas/owned-fixture'], ...(!cleanupRedirect ? [['GET', '/api/test-personas/owned-fixture']] : []),
    ]);
  } finally {
    for (const [name, value] of [['TRACEGROVE_ORGX_BROKER_URL', saved.url], ['TRACEGROVE_ORGX_TOKEN', saved.token]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

it.each([302, 404])('does not let later cells retry a terminal readiness status %s', async status => {
  const fetch = transport(() => new Response(null, { status }));
  const { report } = await runTests({ configPath: fixture(50), env: 'fixture' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(report.outcome).toBe('blocked');
});

it('meters MCP initialization and refuses later SDK dispatches without invoking a tool', async () => {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    expect(request.method).toBe('initialize');
    return Response.json({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'budget-fixture', version: '1' } } });
  });
  const budget = new RequestBudget(1);
  const driver = new McpDriver(origin, fetch as typeof globalThis.fetch, budget);
  await expect(driver.call({ endpoint: '/mcp', tool: 'fixture', arguments: {} }, null, Deadline.in(1000), new AbortController().signal)).rejects.toThrow('budget_exceeded');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not reset the budget for each HTTP conversation turn', async () => {
  const fetch = vi.fn(async () => Response.json({ reply: 'synthetic reply' }));
  const driver = new ConversationDriver(origin, fetch as typeof globalThis.fetch, new RequestBudget(1));
  await expect(driver.run({ channel: 'chat', transport: 'http_chat', endpoint: '/chat', turns: [{ say: 'one' }, { say: 'two' }] }, null, Deadline.in(1000), new AbortController().signal)).rejects.toThrow('budget_exceeded');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('meters WebSocket opening and each outgoing conversation message and still closes on exhaustion', async () => {
  const sent: string[] = [];
  let closed = false;
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(raw: string) {
      const { type } = JSON.parse(raw); sent.push(type);
      queueMicrotask(() => {
        const messages = type === 'client-ready' ? [{ type: 'bot-ready', data: {} }]
          : [{ type: 'bot-tts-text', data: { text: 'Synthetic reply' } }, { type: 'bot-stopped-speaking', data: {} }];
        for (const message of messages) this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
      });
    }
    close() { closed = true; this.dispatchEvent(new Event('close')); }
  }
  vi.stubGlobal('WebSocket', Socket);
  const driver = new ConversationDriver(origin, async () => { throw new Error('no HTTP permitted'); }, new RequestBudget(3));
  await expect(driver.run({ channel: 'voice', transport: 'rtvi', endpoint: '/voice', turns: [{ say: 'one' }, { say: 'two' }], turnTimeoutMs: 100 }, null, Deadline.in(1000), new AbortController().signal)).rejects.toThrow('budget_exceeded');
  expect(sent).toEqual(['client-ready', 'send-text', 'disconnect-bot']);
  expect(closed).toBe(true);
});

it.each(['container', 'compose'] as const)('preserves typed readiness budget/access refusals and removes the owned %s fixture', async kind => {
  for (const refused of ['budget', 'access'] as const) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'tg-host-budget-')); roots.push(root);
    const file = join(root, 'compose.yaml'); writeFileSync(file, 'services: { app: { image: fixture } }');
    const calls: string[][] = [];
    const cli = { async run(args: string[]) {
      calls.push(args);
      const stdout = args[0] === 'version' || args[1] === 'version' ? 'fixture-version'
        : args[0] === 'port' || args.includes('port') ? '127.0.0.1:12345'
        : args[0] === 'run' ? 'owned-fixture-container' : '';
      return { code: 0, stdout, stderr: '' };
    } };
    const budget = new RequestBudget(refused === 'budget' ? 0 : 5);
    const fetch = vi.fn(async () => new Response(null, { status: 403 })); vi.stubGlobal('fetch', fetch);
    const binding = { kind, personas: [], readiness: { path: '/fixture-ready', timeoutMs: 100 }, projectRoot: '.',
      container: { image: 'fixture', port: 8080, env: {}, tokensEnv: 'FIXTURE_TOKENS' },
      compose: { file: 'compose.yaml', fileDigest: composeDigest(file), service: 'app', port: 8080, tokensEnv: 'FIXTURE_TOKENS' } };
    const context = { hostPlan: { binding, ref: { id: 'fixture-host' } }, projectRoot: root, workspaceDir: join(root, 'owned'), credentialNames: [], executionId: 'fixture', signal: new AbortController().signal, requestBudget: budget } as unknown as HostStartContext;
    const host = kind === 'container' ? new ContainerHost(cli) : new ComposeHost(cli);
    await expect(host.start(context)).rejects.toThrow(refused === 'budget' ? 'budget_exceeded' : 'deployment_access_denied');
    expect(fetch).toHaveBeenCalledTimes(refused === 'budget' ? 0 : 1);
    expect(calls.some(args => kind === 'container' ? args[0] === 'rm' : args.includes('down'))).toBe(true);
  }
});

it('enforces the shared runtime ceiling when readback polling exceeds the planner estimate', async () => {
  const counts = new Map<string, number>();
  const fetch = transport(path => {
    counts.set(path, (counts.get(path) ?? 0) + 1);
    return Response.json({ ready: path === '/fixture-ready' || counts.get(path)! >= 7 });
  });
  const { report } = await runTests({ configPath: fixture(12, true), env: 'fixture' });
  expect(fetch).toHaveBeenCalledTimes(12);
  expect(report.outcome).toBe('blocked');
  expect(JSON.stringify(report)).toContain('budget_exceeded');
});

it('treats a redirect as a terminal readiness result instead of following or retrying it', async () => {
  const fetch = transport(() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid/' } }));
  await expect(waitDeployment(origin, '/fixture-ready', 120, new AbortController().signal)).rejects.toThrow('deployment_not_ready');
  expect(fetch).toHaveBeenCalledTimes(1);
});
