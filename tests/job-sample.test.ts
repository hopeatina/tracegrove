import { afterEach, expect, it } from 'vitest';
import { fork, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { writeSample } from '../src/cli/samples/write.ts';

const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const done = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
    child.kill('SIGTERM');
    try { await done; } catch {
      const forced = once(child, 'exit', { signal: AbortSignal.timeout(2000) });
      child.kill('SIGKILL'); await forced;
    }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const JobResponse = z.object({ job: z.object({ id: z.string().uuid(), status: z.string(), workerPid: z.number().int().nullable() }) });
async function api() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-job-api-')); roots.push(root);
  writeSample(join(import.meta.dirname, '../src/samples'), 'report-jobs', root);
  const child = fork(join(root, 'app/jobs-api.mjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { PORT: '0', REPORTS_DIR: join(root, 'data'), REPORTS_TOKENS: JSON.stringify({ fixture: 'alice', other: 'bob' }) } });
  children.push(child);
  const [raw] = await once(child, 'message', { signal: AbortSignal.timeout(5000) });
  const address = z.object({ type: z.literal('listening'), port: z.number().int().positive() }).parse(raw);
  const request = (path: string, method = 'GET', body?: unknown, token = 'fixture') => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  await expect.poll(async () => (await request('/health')).status, { timeout: 5000 }).toBe(200);
  return { root, child, request };
}

it('serializes concurrent duplicate submissions and refuses payload and owner substitution', async () => {
  const { request } = await api();
  const input = { requestKey: 'one-key', title: 'One report', mode: 'succeed' };
  const responses = await Promise.all(Array.from({ length: 12 }, () => request('/jobs', 'POST', input)));
  expect(responses.filter(r => r.status === 202)).toHaveLength(1);
  expect(responses.filter(r => r.status === 200)).toHaveLength(11);
  const jobs = await Promise.all(responses.map(async r => JobResponse.parse(await r.json()).job));
  expect(new Set(jobs.map(job => job.id)).size).toBe(1);
  const id = jobs[0]!.id;
  expect((await request('/jobs', 'POST', { ...input, title: 'Changed intent' })).status).toBe(409);
  expect((await request(`/jobs/${id}`, 'GET', undefined, 'other')).status).toBe(403);
  expect((await request(`/reports/${id}`, 'GET', undefined, 'other')).status).toBe(403);
  expect((await request('/jobs', 'GET', undefined, 'constructor')).status).toBe(401);
  const count = z.object({ jobs: z.array(z.unknown()) });
  expect(count.parse(await (await request('/jobs')).json()).jobs).toHaveLength(1);
  expect(count.parse(await (await request('/jobs', 'GET', undefined, 'other')).json()).jobs).toHaveLength(0);
});

it('deleting an active job prevents a late publication before the same worker accepts more work', async () => {
  const { root, request } = await api();
  const old = JobResponse.parse(await (await request('/jobs', 'POST', { requestKey: 'old', title: 'Old', mode: 'hold' })).json()).job.id;
  await expect.poll(async () => JobResponse.parse(await (await request(`/jobs/${old}`)).json()).job.status).toBe('running');
  expect((await request(`/jobs/${old}`, 'DELETE')).status).toBe(204);
  const next = JobResponse.parse(await (await request('/jobs', 'POST', { requestKey: 'new', title: 'New', mode: 'succeed' })).json()).job.id;
  await expect.poll(async () => JobResponse.parse(await (await request(`/jobs/${next}`)).json()).job.status).toBe('succeeded');
  expect((await request(`/reports/${old}`)).status).toBe(404);
  const db = new DatabaseSync(join(root, 'data/reports.sqlite'), { readOnly: true });
  try {
    expect(db.prepare('SELECT count(*) AS count FROM reports WHERE job_id=?').get(old)?.count).toBe(0);
    expect(db.prepare('SELECT count(*) AS count FROM reports WHERE job_id=?').get(next)?.count).toBe(1);
  } finally { db.close(); }
});

it('worker loss makes admission unavailable and retains the unfinished job as nonterminal', async () => {
  const { child, request } = await api();
  const id = JobResponse.parse(await (await request('/jobs', 'POST', { requestKey: 'lost', title: 'Unfinished', mode: 'hold' })).json()).job.id;
  const current = async () => JobResponse.parse(await (await request(`/jobs/${id}`)).json()).job;
  await expect.poll(async () => (await current()).status).toBe('running');
  const workerPid = (await current()).workerPid!;
  expect(Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(workerPid)], { encoding: 'utf8' }).trim())).toBe(child.pid);
  process.kill(workerPid, 'SIGTERM');
  await expect.poll(async () => (await request('/health')).status).toBe(503);
  expect((await request('/jobs', 'POST', { requestKey: 'later', title: 'Later', mode: 'succeed' })).status).toBe(503);
  expect((await current()).status).toBe('running');
  expect((await request(`/reports/${id}`)).status).toBe(404);
});
