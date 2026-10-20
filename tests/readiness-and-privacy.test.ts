import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSample } from '../src/cli/samples/write.ts';
import { runTests } from '../src/authoring/run.ts';
import { decide, readDecisions, readiness } from '../src/authoring/readiness.ts';
import { renderHandoff } from '../src/authoring/handoff.ts';
import { sealRun, unsealRun } from '../src/core/seal.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { scrubber, redactionRules } from '../src/core/privacy.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTracegroveMcpServer } from '../src/mcp/server.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function voice() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-readiness-')); roots.push(root);
  writeSample(join(import.meta.dirname, '../src/samples'), 'voice-receptionist', root);
  return { root, configPath: join(root, 'tracegrove.config.yaml') };
}

describe('readiness', () => {
  it('lets an MCP agent read claims and challenge a check, but never sign off', async () => {
    const p = voice();
    const server = createTracegroveMcpServer({ configPath: p.configPath, agent: { agent: 'claude-code', source: 'test' } });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args }) as { structuredContent: Record<string, unknown> }).structuredContent;
    expect(await call('readiness')).toMatchObject({ schemaVersion: 'tracegrove.readiness/v1', ready: false });
    expect(await call('challenge_check', { case: 'calls.after-hours', reason: 'should also offer the next weekday slot' })).toMatchObject({ decision: 'challenged', by: 'agent:claude-code' });
    expect(readDecisions(p.root).map((d) => d.decision)).toEqual(['challenged']);
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('accept');
  });

  it('keeps execution, assessment, validity and decision separate, and binds sign-off to the evidence it saw', async () => {
    const p = voice();
    let state = readiness(p.root);
    expect(state.claims.every((c) => c.execution === 'not_run' && c.assessment === 'none' && c.decision === 'pending')).toBe(true);
    expect(() => decide(p.root, { case: 'calls.books-a-cleaning', decision: 'accepted', by: 'Hope' })).toThrow('accept_requires_current_support');

    const { report } = await runTests({ configPath: p.configPath, grep: 'calls.' });
    expect(report.outcome).toBe('passed');
    state = readiness(p.root);
    const critical = state.claims.find((c) => c.caseId === 'calls.books-a-cleaning')!;
    expect(critical).toMatchObject({ execution: 'completed', assessment: 'supported', validity: 'current', decision: 'pending', ready: false, next: { command: 'tracegrove accept calls.books-a-cleaning' } });
    expect(state.claims.filter((c) => c.caseId !== critical.caseId).every((c) => c.decision === 'auto' && c.ready)).toBe(true);
    expect(state.ready).toBe(false);

    expect(() => decide(p.root, { case: 'books-a-cleaning', decision: 'waived', by: 'Hope' })).toThrow('decision_reason_required');
    decide(p.root, { case: 'books-a-cleaning', decision: 'accepted', by: 'Hope', reason: 'listened to the call' });
    state = readiness(p.root);
    expect(state.ready).toBe(true);
    expect(state.claims.find((c) => c.caseId === critical.caseId)).toMatchObject({ decision: 'accepted', decidedBy: 'Hope' });

    // Changing the app makes the evidence stale and voids the acceptance; changing the check supersedes it.
    const app = join(p.root, 'app/receptionist.mjs');
    writeFileSync(app, `${readFileSync(app, 'utf8')}\n// edited\n`);
    state = readiness(p.root);
    expect(state.claims.find((c) => c.caseId === critical.caseId)).toMatchObject({ validity: 'stale', decision: 'pending', ready: false });
    const flow = join(p.root, 'tracegrove/calls/after-hours.flow.yaml');
    writeFileSync(flow, readFileSync(flow, 'utf8').replace('Monday through Friday, 8 AM to 5 PM', 'Monday through Friday'));
    expect(readiness(p.root).claims.find((c) => c.caseId === 'calls.after-hours')!.validity).toBe('superseded');

    // A challenge keeps the claim open without editing the check.
    decide(p.root, { case: 'calls.cancel-by-phone', decision: 'challenged', by: 'agent', reason: 'callers also cancel by name', step: 'cancel it on a second call' });
    const challenged = readiness(p.root).claims.find((c) => c.caseId === 'calls.cancel-by-phone')!;
    expect(challenged).toMatchObject({ decision: 'challenged', ready: false });
    expect(challenged.next!.why).toContain('callers also cancel by name');

    const { html } = renderHandoff(p.root, { client: 'Bright Smile Dental', preparedBy: 'Hope' });
    expect(html).toContain('Prepared for Bright Smile Dental');
    expect(html).toContain('Your cleaning is booked for Tuesday at 3 PM');
    expect(html).toContain('tool <code>book_appointment</code>');
    expect(html).toContain('Not ready');
  }, 60_000);
});

describe('client data', () => {
  it('redacts configured patterns before evidence is written, while captured ids keep working', async () => {
    const p = voice();
    writeFileSync(p.configPath, `${readFileSync(p.configPath, 'utf8')}privacy:\n  redact: [phone, email]\n`);
    const flow = join(p.root, 'tracegrove/calls/books-a-cleaning.flow.yaml');
    writeFileSync(flow, readFileSync(flow, 'utf8').replace(', appointment.phone: 555-0142', '').replace('json: { appointment.status', 'present: [appointment.phone]\n      json: { appointment.status'));
    const { report } = await runTests({ configPath: p.configPath, grep: 'books-a-cleaning' });
    expect(report.outcome, JSON.stringify(report.cases[0]?.failure)).toBe('passed');
    expect(verifyBundle(join(report.runDir, 'bundle')).ok).toBe(true);
    // The flow's own script (what the test caller says) is authored input and stays in the compiled case;
    // everything the app and agent returned is scrubbed.
    const authored = new Set(['documents.json', 'request.json', 'calls.books-a-cleaning.json']);
    const everything = (dir: string): string => readdirSync(dir, { withFileTypes: true }).filter((e) => !authored.has(e.name)).map((e) => e.isDirectory() ? everything(join(dir, e.name)) : readFileSync(join(dir, e.name), 'utf8')).join('\n');
    const written = everything(report.runDir);
    expect(written).not.toContain('555-0142');
    expect(written).toContain('[redacted:phone]');
    expect(written).toContain('Dana Lee');
  }, 30_000);

  it('scrubs built-in patterns and only Luhn-valid card numbers', () => {
    const scrub = scrubber(redactionRules(['email', 'phone', 'card', 'ssn', { name: 'member', pattern: 'MBR-\\d{6}' }]))!;
    expect(scrub({ a: ['mail dana@example.com', 'call (802) 555-0142', 'card 4242 4242 4242 4242', 'order 1234567890123', 'ssn 123-45-6789', 'id MBR-123456'] })).toEqual({ a: [
      'mail [redacted:email]', 'call [redacted:phone]', 'card [redacted:card]', 'order 1234567890123', 'ssn [redacted:ssn]', 'id [redacted:member]'] });
    expect(scrubber([])).toBeNull();
  });

  it('seals a run so it opens only with the passphrase, rejects tampering, and round-trips a verifiable bundle', async () => {
    const p = voice();
    const { report } = await runTests({ configPath: p.configPath, grep: 'after-hours' });
    const sealed = join(p.root, 'run.tgseal');
    const passphrase = 'correct horse battery staple';
    expect(() => sealRun(report.runDir, join(p.root, 'weak.tgseal'), 'short')).toThrow('seal_passphrase_weak');
    sealRun(report.runDir, sealed, passphrase, { remove: true });
    expect(existsSync(report.runDir)).toBe(false);
    expect(readFileSync(sealed).includes(Buffer.from('Sam Ortiz'))).toBe(false);
    expect(() => unsealRun(sealed, join(p.root, 'bad'), 'not the right passphrase')).toThrow('seal_open_failed');
    const tampered = join(p.root, 'tampered.tgseal'); const bytes = readFileSync(sealed); bytes[bytes.length - 5] = bytes[bytes.length - 5]! ^ 1; writeFileSync(tampered, bytes);
    expect(() => unsealRun(tampered, join(p.root, 'tampered'), passphrase)).toThrow('seal_open_failed');
    const { outDir } = unsealRun(sealed, join(p.root, 'restored'), passphrase);
    expect(verifyBundle(join(outDir, 'bundle')).ok).toBe(true);
    expect(() => sealRun(outDir, sealed, passphrase)).toThrow('seal_output_exists');
  }, 30_000);
});
