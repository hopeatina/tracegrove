import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { runTests } from '../src/authoring/run.ts';

const servers: Server[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each([1, 4])('shares the real Chromium subresource/readiness budget for %s fixture assets', async assets => {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url!);
    response.setHeader('cache-control', 'no-store');
    if (request.url === '/fixture-ready') { response.setHeader('content-type', 'application/json'); response.end('{}'); }
    else if (request.url === '/fixture') {
      response.setHeader('content-type', 'text/html');
      response.end(`<p data-testid="message">Fixture budget safe</p>${Array.from({ length: assets }, (_, i) => `<img src="/assets/${i}.svg">`).join('')}`);
    } else { response.setHeader('content-type', 'image/svg+xml'); response.end('<svg xmlns="http://www.w3.org/2000/svg"/>'); }
  });
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'tg-browser-budget-')); roots.push(root);
  mkdirSync(join(root, 'tracegrove'));
  writeFileSync(join(root, 'tracegrove.config.yaml'), stringify({ project: 'browser-budget', app: { adapter: 'node', entry: 'unused.mjs' }, personas: { visitor: { subject: 'visitor' } },
    environments: { fixture: { target: { url: origin, health: '/fixture-ready' }, class: 'deployed_preview', agents: 'allow', writes: 'none', personas: {}, budget: { maxRequests: 3 } } } }));
  writeFileSync(join(root, 'tracegrove/public.flow.yaml'), stringify({ title: 'Bounded real browser fixture', envs: ['fixture'], as: 'none', browser: { allowPaths: ['/fixture', '/assets/'], allowMethods: ['GET', 'HEAD'] }, steps: [
    { browser: { kind: 'navigate', path: '/fixture' }, expect: { status: 200 } },
    { browser: { kind: 'read', target: { by: 'testId', name: 'message' } }, expect: { text: 'Fixture budget safe' } },
  ] }));
  const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml'), env: 'fixture' });
  expect(paths.length).toBeLessThanOrEqual(3);
  if (assets === 1) { expect(report.outcome).toBe('passed'); expect(report.bundleVerified).toBe(true); expect(paths).toHaveLength(3); }
  else { expect(report.outcome).toBe('blocked'); expect(JSON.stringify(report)).toContain('budget_exceeded'); }
});
