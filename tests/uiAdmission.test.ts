import { afterEach, expect, it } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request, type ClientRequest } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startUi, type UiServer } from '../src/authoring/ui.ts';

const roots: string[] = [];
const servers: UiServer[] = [];
const originalPath = process.env.PATH;
afterEach(async () => {
  process.env.PATH = originalPath;
  for (const server of servers.splice(0)) await server.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sample() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-ui-admission-')); roots.push(root);
  cpSync(join(import.meta.dirname, '../src/samples/notes-api'), root, { recursive: true });
  return root;
}

/** Hold both request bodies after the server has accepted their headers. */
async function pendingBody(server: UiServer, path: string, token: string) {
  let req!: ClientRequest;
  let accepted!: () => void;
  const headersAccepted = new Promise<void>(resolve => { accepted = resolve; });
  const response = new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    req = request({ hostname: '127.0.0.1', port: server.port, path, method: 'POST', headers: {
      'content-type': 'application/json', 'x-tracegrove-token': token, expect: '100-continue',
    } }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(body) as Record<string, unknown> }));
    });
    req.on('error', reject);
    req.once('continue', accepted);
    req.flushHeaders();
  });
  await headersAccepted;
  return { req, response };
}

function gate(root: string) {
  const started = join(root, 'started'); const release = join(root, 'release');
  // Bound scratch children even if the test runner itself is interrupted.
  const code = `writeFileSync(${JSON.stringify(started)}, 'started\\n', { flag: 'a' });
const gateDeadline = Date.now() + 15000;
while (!existsSync(${JSON.stringify(release)}) && Date.now() < gateDeadline) await new Promise(resolve => setTimeout(resolve, 10));
`;
  return { started, release, code };
}

it.each(['draft', 'test'] as const)('admits one %s when two authenticated bodies arrive after their headers', async kind => {
  const root = sample(); const held = gate(root);
  if (kind === 'draft') {
    const bin = join(root, 'fake-bin'); mkdirSync(bin);
    const fake = join(bin, 'claude');
    writeFileSync(fake, `#!${process.execPath}\nconst { writeFileSync, existsSync } = require('node:fs');\n(async () => {\n${held.code}\nconsole.log(JSON.stringify({ result: 'fake local draft' }));\n})();\n`);
    chmodSync(fake, 0o755);
    process.env.PATH = `${bin}:${originalPath}`;
  } else {
    const app = join(root, 'app/app.mjs');
    writeFileSync(app, `${held.code}\n${readFileSync(app, 'utf8')}`);
  }
  const server = await startUi({ dir: root }); servers.push(server);
  const html = await (await fetch(server.url)).text();
  const token = /const TOKEN='([^']+)'/.exec(html)![1]!;
  const path = kind === 'draft' ? '/api/agent-draft' : '/api/test';
  const first = await pendingBody(server, path, token);
  const second = await pendingBody(server, path, token);
  let firstCompleted: Awaited<typeof first.response> | undefined;
  const firstResponsePromise = first.response.then(response => { firstCompleted = response; return response; });
  let secondResponse: Awaited<typeof second.response>;
  try {
    first.req.end(JSON.stringify(kind === 'test' ? { grep: 'list' } : {}));
    // Real child startup can be slow on a busy runner. A completed request is
    // diagnostic evidence of startup failure, not a substitute for the marker.
    await expect.poll(() => existsSync(held.started) ? 'started'
      : firstCompleted ? `request completed before startup: ${JSON.stringify(firstCompleted).slice(0, 1000)}` : 'waiting for child startup',
    { timeout: 10_000 }).toBe('started');
    second.req.end('{}');
    secondResponse = await second.response;
  } finally {
    writeFileSync(held.release, 'release');
    if (!second.req.writableEnded) second.req.end('{}');
    await Promise.allSettled([firstResponsePromise, second.response]);
  }
  const firstResponse = await firstResponsePromise;
  expect(secondResponse.status).toBe(409);
  expect(firstResponse.status).toBe(200);
  expect(readFileSync(held.started, 'utf8').trim().split('\n')).toHaveLength(1);
  if (kind === 'test') expect(firstResponse.body).toMatchObject({ outcome: 'passed', bundleVerified: true });
});

it('admits a harness-fixed session token as a bearer token and refuses any other credential', async () => {
  const root = sample(); const token = 'dogfood-session-token-0123';
  const server = await startUi({ dir: root, token }); servers.push(server);
  const prune = (headers: Record<string, string>) => fetch(`http://127.0.0.1:${server.port}/api/prune`, { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ file: 'tracegrove/notes/list.flow.yaml' }) });
  expect((await prune({})).status).toBe(403);
  expect((await prune({ authorization: 'Bearer wrong-token-0123456789' })).status).toBe(403);
  expect((await prune({ authorization: token })).status).toBe(403);
  expect(existsSync(join(root, 'tracegrove/notes/list.flow.yaml'))).toBe(true);
  expect((await prune({ authorization: `Bearer ${token}` })).status).toBe(200);
  expect(existsSync(join(root, 'tracegrove/notes/list.flow.yaml.pruned'))).toBe(true);
});

it('ignores a fixed token too short to be a session secret', async () => {
  const root = sample(); const server = await startUi({ dir: root, token: 'short' }); servers.push(server);
  const response = await fetch(`http://127.0.0.1:${server.port}/api/prune`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer short' }, body: JSON.stringify({ file: 'tracegrove/notes/list.flow.yaml' }) });
  expect(response.status).toBe(403);
});
