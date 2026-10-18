import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAgentWorkReceipt, verifyAgentWorkReceiptIntegrity } from '@useorgx/agent-work-receipt';
import { cleanupTemps, editFile, planSample, runSample, sampleCopy, sampleIdentityDigest } from '../conformance/helpers.ts';
import { localScope } from '../src/core/corpus.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalResultSink } from '../src/core/resultSink.ts';
import { AwrDestination, LocalAwrOutbox, OrgxAwrHttpTransport, type AwrDeliveryAuthority, type PreparedAwrDelivery } from '../src/integrations/awr/index.ts';
import { WorkflowEvidenceProjection } from '../src/protocol/index.ts';

const dirs: string[] = []; const handles: LocalLedger[] = []; const servers: Server[] = [];
const authority: AwrDeliveryAuthority = { authorize: async () => {} }; // Simulated consumer authority, never a live approval.
const destination = { origin: 'https://orgx.example', workspaceId: '00000000-0000-4000-8000-000000000001' };
const hostedId = '00000000-0000-4000-8000-000000000002';
function open(dir = mkdtempSync(join(tmpdir(), 'tracegrove-awr-')), policy = authority) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const ledger = LocalLedger.open(dir); handles.push(ledger);
  const sink = new LocalResultSink(ledger, localScope(), { authorize: async () => {} });
  return { dir, ledger, sink, outbox: new LocalAwrOutbox(ledger, sink, localScope(), policy) };
}
async function result(store: ReturnType<typeof open>, fail = false) {
  const sample = sampleCopy(fail ? root => editFile(join(root, 'app/app.mjs'), text => text.replace(
    "if (note.ownerId !== userId) return send(res, 403, { error: 'forbidden' });",
    "if (note.ownerId !== userId && req.method !== 'GET') return send(res, 403, { error: 'forbidden' });")) : undefined);
  if (fail) { const digest = sampleIdentityDigest(sample.root).hex;
    editFile(join(sample.root, 'verification/components/notes-api.profile.yaml'), text => text.replace(/hex: "?[0-9a-f]{64}"?/, `hex: "${digest}"`)); }
  const run = await runSample(planSample(sample.configPath, fail ? 'native-real' : 'offline-contract'), sample.stateDir);
  return store.sink.ingest(run.executionDir);
}
function ack(delivery: PreparedAwrDelivery, extra = {}) {
  return { ok: true, receipt_id: hostedId, external_receipt_id: delivery.receipt.receipt_id, schema_version: 'agent-work-receipt/v0.2', idempotent: false, ...extra };
}
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const handle of handles.splice(0)) handle.close(); cleanupTemps(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('prepares canonical AWR v0.2 without upgrading mocked evidence, leaking payloads, or changing its destination on retry', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  const prepared = await store.outbox.prepare(id, destination);
  expect(validateAgentWorkReceipt(prepared.prepared.receipt).ok).toBe(true);
  expect((await verifyAgentWorkReceiptIntegrity(prepared.prepared.receipt)).content_hash.state).toBe('verified');
  expect(prepared.status).toBe('prepared'); expect(prepared.attempts).toBe(0);
  const projection = WorkflowEvidenceProjection.parse(prepared.prepared.receipt.extensions?.['org.tracegrove.workflow']);
  expect(projection).toMatchObject({ productOutcome: 'passed', plannedLanes: ['mock_contract'], issuerStatus: 'unverified',
    qualificationStatus: 'not_evaluated', payloads: 'withheld', media: 'withheld', nativeOutcome: 'not_observed' });
  expect(projection.attempts.every(attempt => attempt.provenance.runtime === 'mocked')).toBe(true);
  expect(prepared.prepared.receipt.verification.status).toBe('unverified');
  expect(prepared.prepared.receipt.cost).toMatchObject({ estimated: true, metadata: { status: 'unknown', zero_is_schema_placeholder: true } });
  expect(prepared.prepared.receipt.actor.runtime?.name).not.toBe('orgx-verify');
  expect(await store.outbox.prepare(id, destination)).toEqual(prepared);
  await expect(store.outbox.prepare(id, { ...destination, workspaceId: hostedId })).rejects.toThrow('another destination');
  expect(JSON.stringify(prepared)).not.toContain('authorization:');
  expect(JSON.stringify(prepared)).not.toContain('notes-api.local');
});

it('exports honest target counterevidence as successful export effort without claiming passing behavior', async () => {
  const store = open(); const retained = await result(store, true);
  expect(retained.receipt.retainedOutcome).toBe('assertion_failed');
  const state = await store.outbox.prepare(retained.receipt.ref.id, destination);
  expect(state.prepared.receipt.outcome).toMatchObject({ status: 'succeeded', acceptance: { status: 'pending' } });
  expect(state.prepared.receipt.outcome.summary).toContain('assertion_failed');
  expect(WorkflowEvidenceProjection.parse(state.prepared.receipt.extensions?.['org.tracegrove.workflow']).productOutcome).toBe('assertion_failed');
});

it('reconciles an actual HTTP connection loss after receiver admission across reopen with the same receipt and key', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  const prepared = await store.outbox.prepare(id, destination); const imported = new Map<string, string>(); const bodies: string[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const part of request) body += part; bodies.push(body);
    expect(request.url).toBe('/api/v1/agent-work-receipts'); expect(request.headers.authorization).toBe('Bearer fixture-private-token');
    const input = JSON.parse(body); expect(validateAgentWorkReceipt(input.receipt).ok).toBe(true); expect(input.workspace_id).toBe(destination.workspaceId);
    const previous = imported.get(input.idempotency_key);
    if (!previous) { imported.set(input.idempotency_key, JSON.stringify(input.receipt)); request.socket.destroy(); return; }
    expect(previous).toBe(JSON.stringify(input.receipt)); response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(ack(prepared.prepared, { idempotent: true, extra_secret: 'must-not-be-retained' })));
  }); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing listener');
  const transport = new OrgxAwrHttpTransport(async () => 'fixture-private-token', (url, init) => fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`, init));
  await expect(store.outbox.deliver(id, transport)).rejects.toThrow('acknowledgement unavailable');
  expect((await store.outbox.inspect(id)).status).toBe('acknowledgement_unknown');
  store.ledger.close(); const recovered = open(store.dir);
  const complete = await recovered.outbox.deliver(id, transport);
  expect(complete).toMatchObject({ status: 'imported_unverified', attempts: 2, acknowledgement: { receipt_id: hostedId, idempotent: true } });
  expect(imported.size).toBe(1); expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]);
  expect(await recovered.outbox.deliver(id, transport)).toEqual(complete); expect(bodies).toHaveLength(2);
  const journal = readFileSync(join(store.dir, 'ledger/journal.jsonl'), 'utf8');
  expect(journal).not.toContain('fixture-private-token'); expect(journal).not.toContain('must-not-be-retained');
  expect((await recovered.sink.list()).records).toHaveLength(1);
});

it('refuses revoked authority, corrupt retained evidence, and cross-receipt acknowledgements', async () => {
  let revoked = false; const store = open(undefined, { authorize: async (_scope, _destination, action) => {
    if (revoked && action === 'deliver') throw new Error('authority revoked');
  } });
  const retained = await result(store); const id = retained.receipt.ref.id; await store.outbox.prepare(id, destination);
  let requests = 0; const transport = { import: async (delivery: PreparedAwrDelivery) => { requests++; return ack(delivery, { external_receipt_id: 'other' }); } };
  revoked = true; await expect(store.outbox.deliver(id, transport)).rejects.toThrow('revoked'); expect(requests).toBe(0);
  revoked = false; await expect(store.outbox.deliver(id, transport)).rejects.toThrow('another receipt'); expect(requests).toBe(1);
  expect((await store.outbox.inspect(id)).status).toBe('acknowledgement_unknown');
  writeFileSync(join(retained.bundleDir, 'campaign.json'), '{}');
  await expect(store.outbox.deliver(id, transport)).rejects.toThrow('verified'); expect(requests).toBe(1);
});

it('fails before acknowledgement publication and retries the frozen import rather than replacing intent', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  await store.outbox.prepare(id, destination); const append = store.ledger.append.bind(store.ledger); let fail = true; const keys: string[] = [];
  store.ledger.append = (...args) => { if (args[2] === 'workflow.awr.imported' && fail) throw new Error('local index unavailable'); return append(...args); };
  const transport = { import: async (delivery: PreparedAwrDelivery) => { keys.push(delivery.idempotencyKey); return ack(delivery); } };
  await expect(store.outbox.deliver(id, transport)).rejects.toThrow('index unavailable');
  expect((await store.outbox.inspect(id)).status).toBe('acknowledgement_unknown');
  fail = false; expect((await store.outbox.deliver(id, transport)).status).toBe('imported_unverified'); expect(keys[0]).toBe(keys[1]);
});

it('requires a clean HTTPS destination and sanitizes transport failures and bounded acknowledgements', async () => {
  for (const origin of ['http://orgx.example', 'https://user:secret@orgx.example', 'https://orgx.example/path', 'https://orgx.example?secret=x']) {
    expect(AwrDestination.safeParse({ ...destination, origin }).success).toBe(false);
  }
  const store = open(); const retained = await result(store); const prepared = (await store.outbox.prepare(retained.receipt.ref.id, destination)).prepared;
  const fetcher = async () => { throw new Error('fixture-secret-provider-error'); };
  await expect(new OrgxAwrHttpTransport(async () => 'private-token', fetcher).import(prepared)).rejects.toThrow('acknowledgement unavailable');
  const oversized = async () => new Response('x'.repeat(33000));
  await expect(new OrgxAwrHttpTransport(async () => 'private-token', oversized).import(prepared)).rejects.toThrow('acknowledgement unavailable');
});

it('refuses cross-scope composition and revocation during preparation without publishing an intent', async () => {
  const store = open(); const retained = await result(store); const id = retained.receipt.ref.id;
  const foreign = new LocalAwrOutbox(store.ledger, store.sink, { ...localScope(), ownerId: 'another-owner' }, authority);
  await expect(foreign.prepare(id, destination)).rejects.toThrow('another delivery scope');
  let calls = 0; const revoked = new LocalAwrOutbox(store.ledger, store.sink, localScope(), { authorize: async () => {
    if (++calls === 2) throw new Error('authorization withdrawn');
  } });
  await expect(revoked.prepare(id, destination)).rejects.toThrow('withdrawn');
  await expect(store.outbox.inspect(id)).rejects.toThrow('No prepared delivery');
});
