import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JobStore } from './store.mjs';
import { send, readBody } from './http.mjs';

const dir = process.env.REPORTS_DIR;
if (!dir) throw new Error('REPORTS_DIR is required');
mkdirSync(dir, { recursive: true });
const store = new JobStore(join(dir, 'reports.sqlite'));
const tokens = JSON.parse(process.env.REPORTS_TOKENS ?? '{}');
const worker = fork(new URL('./worker.mjs', import.meta.url), [join(dir, 'reports.sqlite')], {
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  env: { REPORTS_TEST_DROP_REPORT: process.env.REPORTS_TEST_DROP_REPORT ?? '0' },
});
let ready = false;
worker.on('message', message => { if (message?.type === 'ready') ready = true; });
worker.on('exit', () => { ready = false; });
const view = job => ({ id: job.id, requestKey: job.request_key, title: job.title, mode: job.mode,
  status: job.status, workerPid: job.worker_pid, apiPid: process.pid });
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, ready ? 200 : 503, { ok: ready, workerPid: worker.pid, apiPid: process.pid });
  const authorization = req.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const owner = Object.hasOwn(tokens, token) ? tokens[token] : null;
  if (typeof owner !== 'string' || !owner) return send(res, 401, { error: 'unauthorized' });
  try {
    if (url.pathname === '/jobs' && req.method === 'GET') return send(res, 200, { jobs: store.list(owner).map(view) });
    if (url.pathname === '/jobs' && req.method === 'POST') {
      if (!ready) return send(res, 503, { error: 'worker_unavailable' });
      const body = await readBody(req);
      if (typeof body.requestKey !== 'string' || !body.requestKey || body.requestKey.length > 100 ||
          typeof body.title !== 'string' || !body.title || body.title.length > 200 ||
          !['succeed', 'fail', 'hold'].includes(body.mode)) return send(res, 400, { error: 'invalid_job' });
      const result = store.submit(owner, body);
      if (result.conflict) return send(res, 409, { error: 'idempotency_conflict' });
      return send(res, result.duplicate ? 200 : 202, { job: view(result.job), deduplicated: result.duplicate });
    }
    const match = /^\/(jobs|reports)\/([0-9a-f-]{36})(\/cancel)?$/.exec(url.pathname);
    if (!match) return send(res, 404, { error: 'not_found' });
    const [, resource, id, cancel] = match;
    const job = store.get(id);
    if (!job) return send(res, 404, { error: 'not_found' });
    if (job.owner_id !== owner) return send(res, 403, { error: 'forbidden' });
    if (resource === 'reports' && req.method === 'GET' && !cancel) {
      const report = store.report(id);
      return report ? send(res, 200, { report }) : send(res, 404, { error: 'report_absent' });
    }
    if (resource !== 'jobs') return send(res, 405, { error: 'method_not_allowed' });
    if (cancel && req.method === 'POST') return send(res, store.requestCancel(id) ? 202 : 409, { requested: true });
    if (!cancel && req.method === 'GET') return send(res, 200, { job: view(job) });
    if (!cancel && req.method === 'DELETE') { store.remove(id); return send(res, 204); }
    return send(res, 405, { error: 'method_not_allowed' });
  } catch { return send(res, 400, { error: 'bad_request' }); }
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  process.send?.({ type: 'listening', port: server.address().port });
});
process.on('SIGTERM', () => {
  const close = () => server.close(() => { store.close(); process.exit(0); });
  if (worker.exitCode !== null || worker.signalCode !== null) close();
  else { worker.once('exit', close); worker.kill('SIGTERM'); }
});
