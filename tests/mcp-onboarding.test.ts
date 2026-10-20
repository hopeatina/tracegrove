import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTracegroveMcpServer } from '../src/mcp/server.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// An agent pointed at a repo that has never seen tracegrove: it must be able to start from status alone.
it('lets an agent set up an empty repo over MCP: status, init, discover, check', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-mcp-empty-')); roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ main: 'server.js' }));
  writeFileSync(join(root, 'server.js'), "import { createServer } from 'node:http';\nconst app = { get() {}, post() {} };\napp.get('/health', () => {});\napp.post('/orders', () => {});\ncreateServer().listen(Number(process.env.PORT));\n");
  const server = createTracegroveMcpServer({ dir: root, agent: { agent: 'claude-code', source: 'test' } });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1' }); await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<{ structuredContent: Record<string, unknown>; isError?: boolean }>;
  try {
    const before = await call('status');
    expect(before.isError).toBeFalsy();
    expect(JSON.stringify(before.structuredContent)).toContain('init');
    const blocked = await call('env_list');
    expect(blocked.isError).toBe(true);
    expect(JSON.stringify(blocked.structuredContent)).toContain('config_not_found');

    const init = await call('init');
    expect(init.isError).toBeFalsy();
    expect(init.structuredContent).toMatchObject({ detection: { adapter: 'node' } });
    expect(existsSync(join(root, 'tracegrove.config.yaml'))).toBe(true);

    const discovered = await call('discover', { save: true });
    expect(discovered.isError).toBeFalsy();
    const routes = (discovered.structuredContent.routes as Array<{ method: string; path: string }>).map((r) => `${r.method} ${r.path}`);
    expect(routes).toEqual(expect.arrayContaining(['POST /orders']));
    expect(discovered.structuredContent.catalog).toMatchObject({ routes: expect.any(Number) });

    expect((await call('check')).isError).toBeFalsy();
    expect((await call('env_list')).isError).toBeFalsy();
  } finally { await client.close(); await server.close(); }
});
