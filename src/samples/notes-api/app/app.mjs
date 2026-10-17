// Tracegrove sample: a real file-backed notes API. No dependencies. Not a mock.
// Env: PORT, NOTES_DIR, NOTES_TOKENS (JSON object token -> userId), NOTES_BUILD (display only).
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT ?? 0);
const dir = process.env.NOTES_DIR ?? './notes-data';
const tokens = JSON.parse(process.env.NOTES_TOKENS ?? '{}');
const build = process.env.NOTES_BUILD ?? 'dev';
mkdirSync(dir, { recursive: true });

function send(res, status, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': randomUUID(), 'content-length': Buffer.byteLength(text) });
  res.end(text);
}
function notePath(id) { if (!/^[0-9a-f-]{36}$/.test(id)) return null; return join(dir, `${id}.json`); }
function readNote(id) { const p = notePath(id); if (!p || !existsSync(p)) return null; return JSON.parse(readFileSync(p, 'utf8')); }
function writeNote(note) { const p = notePath(note.id); const tmp = `${p}.tmp`; writeFileSync(tmp, JSON.stringify(note)); renameSync(tmp, p); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; req.setEncoding('utf8');
    req.on('data', (c) => { data += c; if (data.length > 65536) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') {
    const count = readdirSync(dir).filter((f) => f.endsWith('.json')).length;
    return send(res, 200, { ok: true, build, notes: count });
  }
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = token ? tokens[token] : undefined;
  if (!userId) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET' && url.pathname === '/ui') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Notes</title>
      <main><h1>Notes</h1><button onclick="fetch('/notes').then(r=>r.json()).then(data=>document.querySelector('[role=status]').textContent=data.notes.map(n=>n.title).join(', '))">Refresh</button>
      <p role="status" data-testid="notes">Not loaded</p></main></html>`);
    return;
  }
  const match = url.pathname.match(/^\/notes(?:\/([^/]+))?$/);
  if (!match) return send(res, 404, { error: 'not_found' });
  const id = match[1];
  try {
    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      if (typeof body.title !== 'string' || typeof body.body !== 'string') return send(res, 400, { error: 'invalid_note' });
      const note = { id: randomUUID(), title: body.title, body: body.body, ownerId: userId, createdAt: new Date().toISOString() };
      writeNote(note);
      return send(res, 201, { note });
    }
    if (req.method === 'GET' && !id) {
      const notes = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((n) => n.ownerId === userId);
      return send(res, 200, { notes });
    }
    if (id) {
      const note = readNote(id);
      if (!note) return send(res, 404, { error: 'not_found' });
      if (note.ownerId !== userId) return send(res, 403, { error: 'forbidden' });
      if (req.method === 'GET') return send(res, 200, { note });
      if (req.method === 'DELETE') { unlinkSync(notePath(id)); return send(res, 204); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    return send(res, 400, { error: 'bad_request', detail: String(error && error.message) });
  }
});
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`listening ${typeof address === 'object' && address ? address.port : port}\n`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
