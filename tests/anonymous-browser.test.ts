import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { compileProject } from '../src/authoring/compile.ts';
import { runTests } from '../src/authoring/run.ts';

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(origin = 'http://127.0.0.1:9') {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'tracegrove-anonymous-')); roots.push(root);
  mkdirSync(join(root, 'tracegrove'));
  writeFileSync(join(root, 'app.mjs'), 'console.log("compile fixture only")');
  writeFileSync(join(root, 'tracegrove.config.yaml'), stringify({ project: 'anonymous', app: { adapter: 'node', entry: 'app.mjs', sources: ['app.mjs'] }, personas: { visitor: { subject: 'anonymous' } },
    environments: { preview: { target: { url: origin, health: '/fixture-ready' }, class: 'deployed_preview', writes: 'none', agents: 'allow', personas: {} } } }));
  writeFileSync(join(root, 'tracegrove/public.flow.yaml'), stringify({ title: 'Public browser needs no account', envs: ['local', 'preview'], as: 'none', browser: { allowPaths: ['/'], allowMethods: ['GET', 'HEAD'] }, steps: [
    { browser: { kind: 'navigate', path: '/' }, expect: { status: 200 } },
    { browser: { kind: 'read', target: { by: 'testId', name: 'message' } }, expect: { text: 'Public fixture' } },
  ] }));
  return root;
}
const config = (root: string) => join(root, 'tracegrove.config.yaml');

it('compiles explicit anonymous flows to the existing none recipe; never invents a token', () => {
  const root = fixture(); const result = compileProject(config(root), { env: 'preview' });
  expect(parse(readFileSync(join(result.compiledDir, 'auth/visitor.yaml'), 'utf8'))).toMatchObject({ kind: 'none', credentialName: null, header: null, scheme: null });
});
it('retains credential requirements when anonymous intent was not declared', () => {
  const root = fixture(); const path = join(root, 'tracegrove/public.flow.yaml');
  const flow = parse(readFileSync(path, 'utf8')); delete flow.as; writeFileSync(path, stringify(flow));
  const result = compileProject(config(root), { env: 'preview' });
  expect(parse(readFileSync(join(result.compiledDir, 'auth/visitor.yaml'), 'utf8'))).toMatchObject({ kind: 'env_credential', credentialName: 'visitor_token' });
});
it('refuses mixing an anonymous browser with a campaign that could attach credentials', () => {
  const root = fixture();
  writeFileSync(join(root, 'tracegrove/authenticated.flow.yaml'), stringify({ title: 'Authenticated sibling', envs: ['preview'], steps: [{ GET: '/', expect: 200 }] }));
  expect(() => compileProject(config(root), { env: 'preview' })).toThrow(/anonymous browser flow cannot share/);
});
it('runs a real anonymous URL browser without resolver access or Authorization headers', async () => {
  const auth: string[] = [];
  const server = createServer((request, response) => {
    if (request.headers.authorization) auth.push(request.headers.authorization);
    if (request.url === '/fixture-ready') { response.setHeader('content-type', 'application/json'); response.end('{"ready":true}'); }
    else { response.setHeader('content-type', 'text/html'); response.end('<p data-testid="message">Public fixture</p>'); }
  }); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = fixture(origin);
  const { report } = await runTests({ configPath: config(root), env: 'preview' });
  expect(report.outcome).toBe('passed'); expect(report.bundleVerified).toBe(true); expect(auth).toEqual([]);
  expect(report.cases[0]!.videos![0]!.byteCount).toBeGreaterThan(0);
});
it('does not downgrade an explicit authenticated HTTP step inside an anonymous flow', async () => {
  const root = fixture(); const path = join(root, 'tracegrove/public.flow.yaml');
  writeFileSync(path, stringify({ title: 'Explicit credential still required', envs: ['preview'], as: 'none', steps: [{ GET: '/', as: 'visitor', expect: 200 }] }));
  const result = compileProject(config(root), { env: 'preview' });
  const spec = parse(readFileSync(join(result.compiledDir, 'cases/public.yaml'), 'utf8'));
  expect(spec.steps[0].auth).toMatchObject({ kind: 'credential', name: 'visitor_token' });
});

it('inherits explicit anonymous intent for HTTP steps instead of attaching the campaign token', () => {
  const root = fixture();
  writeFileSync(join(root, 'tracegrove/public.flow.yaml'), stringify({ title: 'Public HTTP read', envs: ['preview'], as: 'none', steps: [{ GET: '/', expect: 200 }] }));
  const result = compileProject(config(root), { env: 'preview' });
  const spec = parse(readFileSync(join(result.compiledDir, 'cases/public.yaml'), 'utf8'));
  expect(spec.steps[0].auth).toEqual({ kind: 'none' });
});
