import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { EmptyResultSchema, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { verifyCapabilityObservation, assessCapabilityEvidence, verifyCapabilityStream } from '../src/core/capabilityBoundary.ts';
import { capturedExchange } from './fixtures/mcp/evidence.ts';
import { FixtureStartupError, frames, jsonLines, startFixture, type Fixture } from './fixtures/mcp/harness.ts';

const fixtures: Fixture[] = [];
async function start(options: Parameters<typeof startFixture>[0] = {}) { const fixture = await startFixture(options); fixtures.push(fixture); return fixture; }
afterEach(async context => {
  for (const fixture of fixtures.splice(0)) {
    // Retain native bytes even when an assertion fails; remove only after confirmed owned cleanup.
    try {
      const cleanup = await fixture.close();
      writeFileSync(join(fixture.root, 'cleanup.json'), JSON.stringify(cleanup ?? { alreadyClosed: true }) + '\n');
      fixture.retain(context.task.name.replace(/[^a-z0-9]+/gi, '-'));
      fixture.remove();
    } catch (error) { fixture.retain(`cleanup-unconfirmed-${context.task.id}`); throw error; }
  }
});

it('pins the actual registry SDK and captures negotiated native stdio messages with verified protocol-client fidelity', async () => {
  const packageInfo = JSON.parse(readFileSync(new URL('../node_modules/@modelcontextprotocol/sdk/package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  expect(packageInfo.version).toBe('1.32.1'); expect(packageInfo.license).toBe('MIT');
  expect(lock.packages['node_modules/@modelcontextprotocol/sdk'].integrity).toBe('sha512-2DdE+SJDtzLEEWzY1ZjY7Q+VcPhcV1KisD3zI4u0XZyktsjHum1mwbMI+JaulUBi2OZk+KJAi2uPXzxichPkdw==');
  const fixture = await start();
  expect(fixture.client.getServerCapabilities()?.tools).toBeDefined();
  expect((await fixture.client.listTools()).tools.some(tool => tool.name === 'echo')).toBe(true);
  const text = 'Owned stdio: café 🌱';
  expect(await fixture.client.callTool({ name: 'echo', arguments: { text } }, undefined, { timeout: 1000 })).toMatchObject({ content: [{ type: 'text', text }] });
  await fixture.close();
  const outbound = frames(fixture.root, 'client_to_server');
  expect(outbound[0]?.message).toMatchObject({ method: 'initialize', params: { protocolVersion: LATEST_PROTOCOL_VERSION } });
  expect(outbound[1]?.message).toMatchObject({ method: 'notifications/initialized' });
  const captured = capturedExchange(fixture.root, 'echo');
  expect(captured.transcript.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  const token = await verifyCapabilityObservation(captured.observation, captured.operation, captured.descriptor, captured.readArtifact);
  expect(assessCapabilityEvidence(token)).toMatchObject({ evidenceVerdict: 'admissible', verificationVerdict: 'not_evaluated', observation: { evidenceClass: 'protocol_client' } });
  await expect(verifyCapabilityStream(captured.transcript, captured.operation, captured.readArtifact)).resolves.toMatchObject({ evidenceVerdict: 'admissible', verificationVerdict: 'not_evaluated' });
  writeFileSync(join(fixture.root, 'typed-evidence.json'), JSON.stringify({ ...captured, blobs: undefined, readArtifact: undefined }, null, 2));
  const serverInfo = JSON.parse(readFileSync(join(fixture.root, 'server-pid.json'), 'utf8'));
  // macOS adds its text-encoding key to this native child even with an explicit env.
  // Keep the fixture's allowlist exact on every other platform.
  const platformKeys = process.platform === 'darwin' ? ['__CF_USER_TEXT_ENCODING'] : [];
  expect(serverInfo.environmentKeys).toEqual(['FIXTURE_ROOT', 'HOME', 'PATH', 'TMPDIR', ...platformKeys].sort());
});

it('keeps a tool rejection distinct from a JSON-RPC method error', async () => {
  const fixture = await start();
  const toolError = await fixture.client.callTool({ name: 'tool-error', arguments: {} }, undefined, { timeout: 1000 });
  expect(toolError.isError).toBe(true);
  await expect(fixture.client.request({ method: 'fixture/unsupported' }, EmptyResultSchema, { timeout: 1000 })).rejects.toMatchObject({ code: -32601 });
  await fixture.close();
  const captured = capturedExchange(fixture.root, 'tool-error');
  expect(captured.observation.facts).toMatchObject({ kind: 'protocol_message', resultState: 'tool_error', nativeErrorCode: null });
  expect(frames(fixture.root, 'server_to_client').some(frame => 'error' in frame.message && frame.message.error.code === -32601)).toBe(true);
});

it('observes actual cancellation separately from the client request to cancel', async () => {
  const fixture = await start(); const controller = new AbortController();
  let progress = 0;
  await expect(fixture.client.callTool({ name: 'wait', arguments: {} }, undefined, { signal: controller.signal, timeout: 1000,
    onprogress: () => { progress++; controller.abort(new Error('owned_test_cancel')); } })).rejects.toThrow();
  await fixture.waitFor(() => jsonLines(fixture.root, 'server-events.jsonl').some(event => event.kind === 'cancel_observed'));
  expect(progress).toBeGreaterThan(0);
  await fixture.close();
  const outbound = frames(fixture.root, 'client_to_server');
  const request = outbound.find(frame => 'method' in frame.message && frame.message.method === 'tools/call')!.message;
  const cancel = outbound.find(frame => 'method' in frame.message && frame.message.method === 'notifications/cancelled')!.message;
  expect(cancel).toMatchObject({ params: { requestId: 'id' in request ? request.id : null } });
  expect(jsonLines(fixture.root, 'server-events.jsonl').find(event => event.kind === 'cancel_observed')?.requestId).toBe('id' in request ? request.id : null);
});

it('enforces an absolute request deadline despite repeated progress', async () => {
  const fixture = await start(); let progress = 0; const began = performance.now();
  await expect(fixture.client.callTool({ name: 'wait', arguments: {} }, undefined, { timeout: 100, maxTotalTimeout: 200,
    resetTimeoutOnProgress: true, onprogress: () => { progress++; } })).rejects.toMatchObject({ code: -32001 });
  expect(progress).toBeGreaterThan(0); expect(performance.now() - began).toBeLessThan(2000);
  await fixture.waitFor(() => jsonLines(fixture.root, 'server-events.jsonl').some(event => event.kind === 'cancel_observed'));
});

it('does not treat peer disconnect as successful completion or cancellation acknowledgement', async () => {
  const fixture = await start();
  await expect(fixture.client.callTool({ name: 'disconnect', arguments: {} }, undefined, { timeout: 1000 })).rejects.toThrow();
  await fixture.close();
  expect(jsonLines(fixture.root, 'server-events.jsonl').some(event => event.kind === 'cancel_observed')).toBe(false);
  expect(() => capturedExchange(fixture.root, 'disconnect')).toThrow('native_response_or_handshake_missing');
});

it('stops and confirms cleanup when native output exceeds the byte budget', async () => {
  const fixture = await start({ maxBytes: 8192 });
  await expect(fixture.client.callTool({ name: 'overflow', arguments: {} }, undefined, { timeout: 1000 })).rejects.toThrow();
  await fixture.close();
  expect(jsonLines(fixture.root, 'wire-events.jsonl')).toContainEqual(expect.objectContaining({ kind: 'closed', reason: 'byte_limit' }));
  expect(() => capturedExchange(fixture.root, 'overflow')).toThrow('native_response_or_handshake_missing');
});

it('stops the owned server at the independent wall limit', async () => {
  const fixture = await start({ wallMs: 1500 });
  await expect(fixture.client.callTool({ name: 'wait', arguments: {} }, undefined, { timeout: 5000, onprogress: () => {} })).rejects.toThrow();
  await fixture.close();
  expect(jsonLines(fixture.root, 'wire-events.jsonl')).toContainEqual(expect.objectContaining({ kind: 'closed', reason: 'wall_limit' }));
});

it('rejects modified native bytes, wrong request binding and evidence fidelity escalation', async () => {
  const fixture = await start(); await fixture.client.callTool({ name: 'echo', arguments: { text: 'control' } }); await fixture.close();
  const captured = capturedExchange(fixture.root, 'echo');
  await expect(verifyCapabilityObservation({ ...captured.observation, evidenceClass: 'signed_in_host' }, captured.operation, captured.descriptor, captured.readArtifact)).rejects.toThrow('unsupported_evidence_class');
  await expect(verifyCapabilityObservation({ ...captured.observation, binding: { ...captured.observation.binding, attemptId: 'foreign' } }, captured.operation, captured.descriptor, captured.readArtifact)).rejects.toThrow('stale_or_cross_run_evidence');
  await expect(verifyCapabilityStream({ ...captured.transcript, requestId: 'foreign' }, captured.operation, captured.readArtifact)).rejects.toThrow('request_correlation_mismatch');
  const altered = async () => Buffer.from('modified');
  await expect(verifyCapabilityObservation(captured.observation, captured.operation, captured.descriptor, altered)).rejects.toThrow('evidence_digest_mismatch');
});

it.each([{ maxBytes: 1 }, { maxBytes: 262145 }, { wallMs: 1 }, { wallMs: 15001 }])('rejects incompatible limits before allocating or spawning: %j', async options => {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-mcp-limits-')); const prior = process.env.TMPDIR;
  try {
    process.env.TMPDIR = root;
    await expect(startFixture(options)).rejects.toThrow('fixture_invalid_limits');
    expect(readdirSync(root)).toEqual([]);
  } finally {
    if (prior === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prior;
    rmSync(root, { recursive: true, force: true });
  }
});

it('retains an early tee failure without masking its cause or claiming unknown cleanup', async () => {
  let failure: unknown;
  try { await startFixture({ startupFault: 'exit_before_receipt' }); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(FixtureStartupError);
  const startup = failure as FixtureStartupError;
  expect(startup.cause).toMatchObject({ code: -32000 });
  expect(startup.message).toBe((startup.cause as Error).message);
  expect(startup.diagnostics).toMatchObject({ cleanup: 'unknown', cleanupError: 'fixture_pid_receipt_missing', retentionError: null });
  expect(startup.diagnostics.retainedPath).not.toBeNull();
  const retained = startup.diagnostics.retainedPath!;
  const receipt = JSON.parse(readFileSync(join(retained, 'startup-failure.json'), 'utf8'));
  expect(receipt).toMatchObject({ cleanup: 'unknown', cleanupError: 'fixture_pid_receipt_missing', originalCause: { message: startup.message } });
  expect(existsSync(join(retained, 'tee-pid.json'))).toBe(false);
  expect(existsSync(join(retained, 'cleanup.json'))).toBe(false);
  expect(existsSync(startup.diagnostics.root)).toBe(true);
});
