/** One local authority for CLI/viewer coexistence. The OS owner holds the private
 * bearer file; callers cannot supply an actor or a different project root. */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { localScope } from './corpus.ts';
import { executeBundle, type RunSummary } from './executor.ts';
import { LocalLedger, type LockFile } from './ledger.ts';
import { Conflict } from './errors.ts';
import type { FrozenBundle } from './planner.ts';
import { sha256Hex } from '../protocol/index.ts';

const MAX_BYTES = 8 * 1024 * 1024;
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function body(req: IncomingMessage): Promise<unknown> {
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw new Error('controller request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startController(stateDir: string, projectRoot: string) {
  stateDir = resolve(stateDir); projectRoot = resolve(projectRoot);
  const ledger = LocalLedger.open(stateDir);
  chmodSync(ledger.dir, 0o700);
  const token = randomBytes(32).toString('hex');
  const tokenPath = join(ledger.dir, 'controller.token');
  writeFileSync(tokenPath, token, { mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  let queue: Promise<unknown> = Promise.resolve();
  let closing = false;
  const active = new Set<AbortController>();
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (!equal(req.headers.authorization ?? '', `Bearer ${token}`) || req.headers.origin) {
      res.writeHead(403); res.end(JSON.stringify({ error: 'controller_access_denied' })); return;
    }
    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({ projectRoot, running: active.size, closing })); return;
    }
    if (req.method !== 'POST' || req.url !== '/run' || closing) {
      res.writeHead(409); res.end(JSON.stringify({ error: 'controller_command_unavailable' })); return;
    }
    try {
      const value = await body(req) as { bundle?: FrozenBundle };
      const bundle = value?.bundle;
      if (!bundle || bundle.schemaVersion !== 'workflow.frozen-request-bundle/v1' || resolve(bundle.projectRoot) !== projectRoot) {
        throw new Conflict('controller_project_mismatch');
      }
      const abort = new AbortController();
      res.once('close', () => { if (!res.writableEnded) abort.abort(new Error('delegated_client_disconnected')); });
      // Queue owns the writer for the entire admitted attempt, including cleanup.
      const task = queue.then(async () => {
        if (closing) throw new Conflict('controller_closing');
        active.add(abort);
        try { return await executeBundle({ bundle, stateDir, ledger, scope: localScope(), signal: abort.signal }); }
        finally { active.delete(abort); }
      });
      queue = task.catch(() => undefined);
      const result = await task;
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'controller_request_failed' }));
    }
  });
  server.requestTimeout = 30_000;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('controller_address_missing');
    const endpoint = `http://127.0.0.1:${address.port}`;
    ledger.publishController(endpoint, sha256Hex(token));
    return { endpoint, async close() {
      closing = true;
      for (const abort of active) abort.abort(new Error('controller_closing'));
      await queue;
      await new Promise<void>((done) => server.close(() => done()));
      rmSync(tokenPath, { force: true }); ledger.close();
    } };
  } catch (error) { server.close(); rmSync(tokenPath, { force: true }); ledger.close(); throw error; }
}

export async function delegateRun(stateDir: string, bundle: FrozenBundle, signal?: AbortSignal): Promise<RunSummary> {
  const dir = join(resolve(stateDir), 'ledger');
  const lock = JSON.parse(readFileSync(join(dir, 'lock.json'), 'utf8')) as LockFile;
  if (!lock.endpoint || !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(lock.endpoint)) throw new Conflict('controller_endpoint_unavailable');
  const token = readFileSync(join(dir, 'controller.token'), 'utf8');
  if (!lock.tokenDigest || !equal(sha256Hex(token), lock.tokenDigest)) throw new Conflict('controller_token_mismatch');
  const response = await fetch(`${lock.endpoint}/run`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ bundle }), redirect: 'error',
    signal: AbortSignal.any([AbortSignal.timeout((bundle.request?.limits.deadlineMs ?? 60_000) + 60_000), ...(signal ? [signal] : [])]),
  });
  const result = await response.json() as RunSummary & { error?: string };
  if (!response.ok) throw new Conflict(result.error ?? 'controller_request_failed');
  return result;
}
