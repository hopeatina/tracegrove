import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpDriver, MAX_MCP_BYTES } from '../src/adapters/mcp/driver.ts';
import { Deadline } from '../src/core/deadline.ts';

const servers: Server[] = [];
const protocols: McpServer[] = [];
afterEach(async () => {
  await Promise.all(protocols.splice(0).map(server => server.close().catch(() => {})));
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
const call = { endpoint: '/mcp', tool: 'test', arguments: {} };
async function fixture(mode: 'normal' | 'error' | 'secret' | 'large' | 'lost' | 'slow' | 'no-tools', enableJsonResponse = true) {
  let effects = 0;
  const http = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
    const server = new McpServer({ name: 'official-sdk-fixture', version: '1.0.0' }); protocols.push(server);
    if (mode !== 'no-tools') server.registerTool('test', { inputSchema: {} }, async () => {
      effects++;
      if (mode === 'lost') request.socket.destroy();
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 200));
      const text = mode === 'secret' ? 'fixture-private-token' : mode === 'large' ? 'x'.repeat(MAX_MCP_BYTES + 1) : 'Observed native tool';
      return { content: [{ type: 'text' as const, text }], structuredContent: { value: 'observed' }, isError: mode === 'error' };
    });
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse });
    try { await server.connect(transport as Parameters<McpServer['connect']>[0]); await transport.handleRequest(request, response); }
    catch { if (!response.headersSent && !response.destroyed) { response.writeHead(500); response.end(); } }
  }); servers.push(http); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const address = http.address(); if (!address || typeof address === 'string') throw new Error('No fixture listener');
  return { driver: new McpDriver(`http://127.0.0.1:${address.port}`), effects: () => effects };
}
it.each([true, false])('interoperates with the official SDK server using JSON response=%s without treating transport success as a product verdict', async json => {
  const server = await fixture('normal', json);
  expect(await server.driver.call(call, null, Deadline.in(3000), new AbortController().signal)).toMatchObject({
    server: { name: 'official-sdk-fixture' }, structuredContent: { value: 'observed' }, isError: false, attempts: 1,
  }); expect(server.effects()).toBe(1);
});
it('records protocol-level tool errors instead of converting them into transport failures', async () => {
  const server = await fixture('error');
  expect(await server.driver.call(call, null, Deadline.in(3000), new AbortController().signal)).toMatchObject({ isError: true });
  expect(server.effects()).toBe(1);
});
it('requires an observed native tool capability before invoking any tool', async () => {
  const server = await fixture('no-tools');
  await expect(server.driver.call(call, null, Deadline.in(3000), new AbortController().signal)).rejects.toMatchObject({ code: 'mcp_capability_missing' });
  expect(server.effects()).toBe(0);
});
it('refuses real HTTP redirects without forwarding the issued bearer to another endpoint', async () => {
  const paths: string[] = [];
  const http = createServer((request, response) => { paths.push(request.url!); response.writeHead(307, { location: '/different-endpoint' }); response.end(); });
  servers.push(http); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const address = http.address(); if (!address || typeof address === 'string') throw new Error('No fixture listener');
  const driver = new McpDriver(`http://127.0.0.1:${address.port}`);
  await expect(driver.call(call, 'fixture-private-token', Deadline.in(3000), new AbortController().signal)).rejects.toMatchObject({ code: 'mcp_protocol_failure' });
  expect(paths).toEqual(['/mcp']);
});
it.each(['secret', 'large', 'lost'] as const)('withholds unsafe or lost %s observations and never replays a potentially admitted effect', async mode => {
  const server = await fixture(mode);
  await expect(server.driver.call(call, 'fixture-private-token', Deadline.in(3000), new AbortController().signal)).rejects.toThrow(mode === 'secret' ? 'observation withheld' : 'remote side effects remain unknown');
  expect(server.effects()).toBe(1);
});
it('bounds a running tool by its deadline and keeps cancellation distinct without claiming remote rollback', async () => {
  const server = await fixture('slow');
  await expect(server.driver.call(call, null, Deadline.in(50), new AbortController().signal)).rejects.toMatchObject({ code: 'deadline_exceeded' });
  expect(server.effects()).toBeLessThanOrEqual(1);
  const controller = new AbortController(); controller.abort();
  await expect(server.driver.call(call, null, Deadline.in(3000), controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
});
it('rejects endpoint substitution and oversized arguments before any transport request', async () => {
  let requests = 0;
  const driver = new McpDriver('http://127.0.0.1:1', async () => { requests++; throw new Error('Unexpected network request'); });
  for (const endpoint of ['//other.example/mcp', '/mcp?target=other', '/a/../mcp', '/mcp#fragment']) {
    await expect(driver.call({ ...call, endpoint }, null, Deadline.in(100), new AbortController().signal)).rejects.toThrow();
  }
  await expect(driver.call({ ...call, arguments: { first: 'x'.repeat(40000), second: 'x'.repeat(40000) } }, null, Deadline.in(100), new AbortController().signal)).rejects.toMatchObject({ code: 'mcp_request_too_large' });
  expect(requests).toBe(0);
});
