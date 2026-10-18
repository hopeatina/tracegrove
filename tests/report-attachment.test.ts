import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemps, runSample, sampleCopy } from '../conformance/helpers.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalResultSink } from '../src/core/resultSink.ts';
import { LocalAwrOutbox, LocalReportAttachmentOutbox, OrgxAwrHttpTransport, OrgxReportAttachmentHttpTransport,
  type PreparedReportAttachment, type ReportAttachmentAuthority } from '../src/integrations/awr/index.ts';

const dirs: string[] = []; const handles: LocalLedger[] = []; const servers: Server[] = [];
const target = { entityType: 'task' as const, entityId: '00000000-0000-4000-8000-000000000003' };
const destination = { origin: 'https://orgx.example', workspaceId: '00000000-0000-4000-8000-000000000001' };
const hostedId = '00000000-0000-4000-8000-000000000002';
const authority: ReportAttachmentAuthority = { authorize: async () => {} }; // Consumer policy and native admission are simulated.
function open(dir = mkdtempSync(join(tmpdir(), 'tracegrove-report-')), policy = authority) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const ledger = LocalLedger.open(dir); handles.push(ledger); const scope = localScope();
  const sink = new LocalResultSink(ledger, scope, { authorize: async () => {} });
  const awr = new LocalAwrOutbox(ledger, sink, scope, { authorize: async () => {} });
  return { dir, ledger, sink, awr, reports: new LocalReportAttachmentOutbox(ledger, sink, awr, scope, policy) };
}
async function result(store: ReturnType<typeof open>, bound = true) {
  const sample = sampleCopy();
  const bundle = plan({ project: loadProject(sample.configPath), profileName: 'offline-contract', scope: localScope(), purpose: 'work_proof',
    workBinding: bound ? { workId: target.entityId, requirementRefs: [] } : null });
  expect(bundle.request?.workBinding?.workId ?? null).toBe(bound ? target.entityId : null);
  const run = await runSample(bundle, sample.stateDir); const retained = await store.sink.ingest(run.executionDir);
  await store.awr.prepare(retained.receipt.ref.id, destination); return retained;
}
async function admit(store: ReturnType<typeof open>, id: string) {
  return store.awr.deliver(id, { import: async delivery => ({ ok: true, receipt_id: hostedId, external_receipt_id: delivery.receipt.receipt_id,
    schema_version: 'agent-work-receipt/v0.2', idempotent: false }) });
}
function ack(intent: PreparedReportAttachment) {
  return { data: { id: intent.payload.artifact_id, workspace_id: intent.destination.workspaceId, entity_type: intent.target.entityType,
    entity_id: intent.target.entityId, artifact_url: intent.payload.artifact_url, metadata: intent.payload.metadata, status: 'in_review' }, meta: { duplicate: false } };
}
function readback(source: Awaited<ReturnType<typeof admit>>) { return { ok: true, data: { receipt_id: hostedId, receipt: source.prepared.receipt } }; }
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const handle of handles.splice(0)) handle.close(); cleanupTemps(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('imports then attaches over real HTTP, recovering one attachment after a lost acknowledgement without reimport or rerun', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  const imported = new Map<string, { receipt: unknown; receipt_id: string }>(); const artifacts = new Map<string, unknown>();
  const calls: Array<{ method: string; path: string; body: string }> = []; const postBodies: string[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const url = new URL(request.url!, 'http://fixture.local'); calls.push({ method: request.method!, path: url.pathname, body });
    expect(request.headers.authorization).toBe('Bearer fixture-private-token');
    const send = (value: unknown) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (url.pathname === '/api/v1/agent-work-receipts') {
      const input = JSON.parse(body); imported.set(input.idempotency_key, { receipt: input.receipt, receipt_id: hostedId });
      return send({ ok: true, receipt_id: hostedId, external_receipt_id: input.receipt.receipt_id, schema_version: 'agent-work-receipt/v0.2', idempotent: false });
    }
    if (request.method === 'GET' && url.pathname === `/api/v1/work-ledger/receipts/${hostedId}`) {
      expect(url.searchParams.get('workspace_id')).toBe(destination.workspaceId); return send({ ok: true, data: [...imported.values()][0] });
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/artifacts') {
      const input = JSON.parse(body); const key = String(request.headers['idempotency-key']); postBodies.push(body);
      expect(input.entity_id).toBe(target.entityId); expect(input.status).toBe('in_review'); expect(input.created_by_type).toBe('agent');
      const prior = artifacts.get(key);
      if (prior) return send({ data: { ...(prior as Record<string, unknown>), status: 'eval_passed' }, meta: { duplicate: true }, extra_secret: 'must-not-persist' });
      artifacts.set(key, { id: input.artifact_id, workspace_id: destination.workspaceId, entity_type: input.entity_type,
        entity_id: input.entity_id, artifact_url: input.artifact_url, metadata: input.metadata, status: input.status });
      request.socket.destroy(); return;
    }
    response.writeHead(404); response.end();
  }); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture listener');
  const fetcher: typeof fetch = (url, init) => { const parsed = new URL(String(url)); return fetch(`http://127.0.0.1:${address.port}${parsed.pathname}${parsed.search}`, init); };
  const credential = async () => 'fixture-private-token';
  await store.awr.deliver(id, new OrgxAwrHttpTransport(credential, fetcher));
  const prepared = await store.reports.prepare(id, target); expect(prepared.status).toBe('prepared');
  expect(prepared.prepared.payload.artifact_url).toBe(`${destination.origin}/work-ledger/receipts/${hostedId}`);
  const transport = new OrgxReportAttachmentHttpTransport(credential, fetcher);
  await expect(store.reports.deliver(id, transport)).rejects.toThrow('acknowledgement unavailable');
  expect((await store.reports.inspect(id)).status).toBe('acknowledgement_unknown');
  store.ledger.close(); const reopened = open(store.dir);
  const attached = await reopened.reports.deliver(id, transport);
  expect(attached).toMatchObject({ status: 'attached', recordedArtifactStatus: 'eval_passed', attempts: 2, nativeAcceptance: 'not_requested', acknowledgement: { meta: { duplicate: true } } });
  expect(imported.size).toBe(1); expect(artifacts.size).toBe(1); expect(postBodies).toHaveLength(2); expect(postBodies[0]).toBe(postBodies[1]);
  expect(calls.filter(call => call.path === '/api/v1/agent-work-receipts')).toHaveLength(1);
  expect(calls.filter(call => call.method === 'GET')).toHaveLength(2);
  const before = calls.length; expect(await reopened.reports.deliver(id, transport)).toEqual(attached); expect(calls.length).toBe(before);
  expect((await reopened.awr.inspect(id)).status).toBe('imported_unverified'); expect((await reopened.sink.list()).records).toHaveLength(1);
  const journal = readFileSync(join(store.dir, 'ledger/journal.jsonl'), 'utf8'); expect(journal).not.toContain('fixture-private-token'); expect(journal).not.toContain('must-not-persist');
  expect(calls.every(call => !/complete|outcome|approve/.test(call.path))).toBe(true);
});

it('requires acknowledged import and the original frozen full work ID, and refuses changed target types', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  await expect(store.reports.prepare(id, target)).rejects.toThrow('import must be acknowledged');
  await admit(store, id);
  await expect(store.reports.prepare(id, { ...target, entityId: hostedId })).rejects.toThrow('frozen work binding');
  await store.reports.prepare(id, target);
  await expect(store.reports.prepare(id, { ...target, entityType: 'milestone' })).rejects.toThrow('another work target');
  const unbound = await result(store, false); await admit(store, unbound.receipt.ref.id);
  await expect(store.reports.prepare(unbound.receipt.ref.id, target)).rejects.toThrow('frozen work binding');
});

it('refuses substituted hosted receipt content and revocation after readback before any artifact attempt', async () => {
  let revoked = false; const store = open(undefined, { authorize: async (_scope, _destination, _target, action) => {
    if (revoked && action === 'attach') throw new Error('scope revoked');
  } });
  const retained = await result(store); const id = retained.receipt.ref.id; const source = await admit(store, id); await store.reports.prepare(id, target);
  let writes = 0; const changed = structuredClone(readback(source)); changed.data.receipt.outcome.summary = 'substituted summary';
  await expect(store.reports.deliver(id, { readReceipt: async () => changed, attach: async intent => { writes++; return ack(intent); } })).rejects.toThrow('Hosted receipt readback differs');
  await expect(store.reports.deliver(id, { readReceipt: async () => { revoked = true; return readback(source); }, attach: async intent => { writes++; return ack(intent); } })).rejects.toThrow('scope revoked');
  expect(writes).toBe(0); expect((await store.reports.inspect(id)).attempts).toBe(0);
});

it('rejects foreign artifact acknowledgements and preserves a separately successful import through local acknowledgement failure', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  const source = await admit(store, id); await store.reports.prepare(id, target);
  const wrong = { readReceipt: async () => readback(source), attach: async (intent: PreparedReportAttachment) => ({ ...ack(intent), data: { ...ack(intent).data, workspace_id: hostedId } }) };
  await expect(store.reports.deliver(id, wrong)).rejects.toThrow('frozen work, scope, or evidence');
  const append = store.ledger.append.bind(store.ledger); let fail = true; const keys: string[] = [];
  store.ledger.append = (...args) => { if (args[2] === 'workflow.report.attached' && fail) throw new Error('index unavailable'); return append(...args); };
  const transport = { readReceipt: async () => readback(source), attach: async (intent: PreparedReportAttachment) => { keys.push(intent.idempotencyKey); return ack(intent); } };
  await expect(store.reports.deliver(id, transport)).rejects.toThrow('index unavailable');
  expect((await store.awr.inspect(id)).status).toBe('imported_unverified'); expect((await store.reports.inspect(id)).status).toBe('acknowledgement_unknown');
  fail = false; expect((await store.reports.deliver(id, transport)).status).toBe('attached'); expect(keys[0]).toBe(keys[1]);
});

it('rechecks retained evidence before contacting the receipt or artifact server', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  const source = await admit(store, id); await store.reports.prepare(id, target); writeFileSync(join(retained.bundleDir, 'campaign.json'), '{}');
  let calls = 0; await expect(store.reports.deliver(id, { readReceipt: async () => { calls++; return readback(source); }, attach: async intent => { calls++; return ack(intent); } })).rejects.toThrow('verified');
  expect(calls).toBe(0); expect((await store.reports.inspect(id)).attempts).toBe(0);
});
