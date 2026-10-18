// Local native application: file-backed notes over MCP and independent HTTP readback.
// Implements the bounded JSON-response 2025-11-25 transport, not an MCP widget host.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { send, readBody } from './http.mjs';

const directory = process.env.NOTES_DIR;
if (!directory) throw new Error('NOTES_DIR is required');
mkdirSync(directory, { recursive: true });
const tokens = JSON.parse(process.env.NOTES_TOKENS ?? '{}');
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method === 'GET' && path === '/health') return send(response, 200, { ok: true, notes: readdirSync(directory).length });
    const token = String(request.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!Object.hasOwn(tokens, token)) return send(response, 401, { error: 'unauthorized' });
    const ownerId = tokens[token];
    const match = path.match(/^\/notes\/([0-9a-f-]{36})$/);
    if (request.method === 'GET' && match) {
      let note;
      try { note = JSON.parse(readFileSync(join(directory, `${match[1]}.json`), 'utf8')); }
      catch { return send(response, 404, { error: 'not_found' }); }
      if (note.ownerId !== ownerId) return send(response, 403, { error: 'forbidden' });
      return send(response, 200, { note });
    }
    if (path !== '/mcp') return send(response, 404, { error: 'not_found' });
    if (request.method !== 'POST') return send(response, 405, { error: 'method_not_allowed' });
    const message = await readBody(request);
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return send(response, 400, { error: 'invalid_request' });
    if (message.id === undefined) { response.writeHead(202); response.end(); return; }
    const reply = result => send(response, 200, { jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize') return reply({ protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'native-notes', version: '1.0.0' } });
    if (message.method === 'tools/list') return reply({ tools: [{ name: 'notes.create', inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'], additionalProperties: false } }] });
    if (message.method === 'tools/call' && message.params?.name === 'notes.create') {
      const input = message.params.arguments;
      if (!input || typeof input.title !== 'string' || typeof input.body !== 'string') return reply({ isError: true, content: [{ type: 'text', text: 'Invalid note input' }] });
      const note = { id: randomUUID(), title: input.title, body: input.body, ownerId };
      writeFileSync(join(directory, `${note.id}.json`), JSON.stringify(note));
      return reply({ content: [{ type: 'text', text: JSON.stringify({ note }) }], structuredContent: { note }, isError: false });
    }
    return send(response, 200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported method or tool' } });
  } catch { send(response, 400, { error: 'invalid_request' }); }
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
