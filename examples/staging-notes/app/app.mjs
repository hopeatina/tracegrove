// Notes API, deployable: the same file runs locally (launched by tracegrove), in a container, and as a
// standalone "staging" deployment that tracegrove only reaches by URL. No dependencies.
//
// Env: PORT, NOTES_DIR, NOTES_BUILD (reported by /health as the release),
//      NOTES_TOKENS        JSON { token: userId } for long-lived persona tokens (what a secret store holds),
//      NOTES_INTROSPECT_URL  identity provider endpoint for short-lived tokens (broker, Clerk, OAuth);
//                          it is asked on every request, so a revoked token stops working at once,
//      NOTES_DELETE_MODE   "ignore" simulates a broken deploy whose DELETE answers 204 but keeps the row.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { send, readBody } from './http.mjs';

const port = Number(process.env.PORT ?? 0);
const dir = process.env.NOTES_DIR ?? './notes-data';
const tokens = JSON.parse(process.env.NOTES_TOKENS ?? '{}');
const build = process.env.NOTES_BUILD ?? 'dev';
const introspectUrl = process.env.NOTES_INTROSPECT_URL ?? null;
const deleteMode = process.env.NOTES_DELETE_MODE ?? 'delete';
mkdirSync(dir, { recursive: true });

function notePath(id) { if (!/^[0-9a-f-]{36}$/.test(id)) return null; return join(dir, `${id}.json`); }
function readNote(id) { const p = notePath(id); if (!p || !existsSync(p)) return null; return JSON.parse(readFileSync(p, 'utf8')); }
function writeNote(note) { const p = notePath(note.id); const tmp = `${p}.tmp`; writeFileSync(tmp, JSON.stringify(note)); renameSync(tmp, p); }

async function userFor(req) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  if (tokens[token]) return tokens[token];
  if (!introspectUrl) return null;
  try {
    const response = await fetch(introspectUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(3000) });
    const body = await response.json();
    return body.active ? body.sub : null;
  } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') {
    const count = readdirSync(dir).filter((f) => f.endsWith('.json')).length;
    return send(res, 200, { ok: true, build, notes: count });
  }
  const userId = await userFor(req);
  if (!userId) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET' && url.pathname === '/me') return send(res, 200, { user: { id: userId } });
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
      if (req.method === 'DELETE') { if (deleteMode !== 'ignore') unlinkSync(notePath(id)); return send(res, 204); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    return send(res, 400, { error: 'bad_request', detail: String(error && error.message) });
  }
});
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`listening ${typeof address === 'object' && address ? address.port : port}\n`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
