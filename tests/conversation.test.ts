import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSample } from '../src/cli/samples/write.ts';
import { runTests } from '../src/authoring/run.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { loadProject } from '../src/core/corpus.ts';
import { compileCase } from '../src/core/compiler.ts';
import { evaluatePredicate } from '../src/core/reducer.ts';
import { CaseSpec, ConversationObservation } from '../src/protocol/index.ts';
import { CONVERSATION_RUNNER_CAPABILITIES } from '../src/adapters/conversation/capabilities.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../src/adapters/http/capabilities.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function sample(name: 'voice-receptionist' | 'support-chatbot') {
  const root = mkdtempSync(join(tmpdir(), `tracegrove-${name}-`)); roots.push(root);
  writeSample(join(import.meta.dirname, '../src/samples'), name, root);
  return { root, configPath: join(root, 'tracegrove.config.yaml') };
}

describe('voice receptionist sample', () => {
  it('books by phone over RTVI, reads the booking back, keeps other clinics out, and re-verifies the sealed evidence', async () => {
    const p = sample('voice-receptionist');
    const { report } = await runTests({ configPath: p.configPath, grep: 'books-a-cleaning' });
    expect(report.outcome, JSON.stringify(report.cases, null, 1)).toBe('passed');
    expect(report.bundleVerified).toBe(true);
    const receipt = readVerifiedBundle(join(report.runDir, 'bundle')).receipts[0]!;
    const call = ConversationObservation.parse(receipt.steps[0]!.output);
    expect(call).toMatchObject({ channel: 'voice', transport: 'rtvi', endpoint: '/voice', toolNames: ['book_appointment'], attempts: 1 });
    expect(call.turns).toHaveLength(2);
    expect(call.turns[0]!.toolNames).toEqual([]);
    expect(call.turns[1]!.reply).toMatch(/You're all set, Dana\. Your cleaning is booked for Tuesday at 3 PM\. Your confirmation number is BSD-\d{4}\./);
    expect(call.turns.every((turn) => turn.ended === 'stopped' && turn.firstReplyMs !== null)).toBe(true);
    expect(receipt.steps[1]!.output).toMatchObject({ status: 200, body: { appointment: { status: 'booked', patient: 'Dana Lee' } } });
    expect(receipt.steps[2]!.output).toMatchObject({ status: 403 });
    expect(receipt.performance.map((value) => value.boundary)).toEqual(['conversation', 'http', 'http']);
    expect(report.cases[0]!.steps[0]!.observedText).toContain('tool book_appointment(');
  });

  it('fails at the readback when the agent says it booked but nothing was saved', async () => {
    const p = sample('voice-receptionist');
    writeFileSync(p.configPath, readFileSync(p.configPath, 'utf8').replace('  health: /health', '  health: /health\n  env: { RECEPTIONIST_BUG: drop_booking }'));
    const { report } = await runTests({ configPath: p.configPath, grep: 'books-a-cleaning' });
    expect(report.outcome).toBe('assertion_failed');
    const failure = report.cases[0]!.failure!;
    expect(failure.step).toBe('front desk sees the booking');
    expect(failure.message).toBe('status 404 != 200');
    expect(report.cases[0]!.steps[0]!.result).toBe('completed');
  }, 30_000);

  it('reports which phrase the agent never said', async () => {
    const p = sample('voice-receptionist');
    const flow = join(p.root, 'tracegrove/calls/after-hours.flow.yaml');
    writeFileSync(flow, readFileSync(flow, 'utf8').replace('says: [Monday through Friday, 8 AM to 5 PM]', 'says: [Monday through Friday, open Saturdays]'));
    const { report } = await runTests({ configPath: p.configPath, grep: 'after-hours' });
    expect(report.outcome).toBe('assertion_failed');
    expect(report.cases[0]!.failure!.message).toBe('body.turns[0].reply lacks "open Saturdays"');
  });
});

describe('support chatbot sample', () => {
  it('runs every chat flow: refund ticket readback, privacy and prompt injection', async () => {
    const p = sample('support-chatbot');
    const { report } = await runTests({ configPath: p.configPath });
    expect(report.outcome, JSON.stringify(report.cases, null, 1)).toBe('passed');
    expect(report.cases.map((c) => c.caseId).sort()).toEqual(['support.privacy', 'support.prompt-injection', 'support.refund-request']);
    const refund = readVerifiedBundle(join(report.runDir, 'bundle')).receipts.find((r) => r.caseRef.id === 'support.refund-request')!;
    const chat = ConversationObservation.parse(refund.steps[0]!.output);
    expect(chat).toMatchObject({ channel: 'chat', transport: 'http_chat', toolNames: ['lookup_order', 'create_ticket'] });
    expect(new Set(chat.turns.map((turn) => turn.ended))).toEqual(new Set(['response']));
  });
});

describe('conversation admission and predicates', () => {
  it('blocks unbudgeted, read-only, retried, off-envelope conversations and oracle substitution', () => {
    const p = sample('voice-receptionist');
    const loaded = loadProject(compileProject(p.configPath, { grep: 'books-a-cleaning' }).workflowConfigPath);
    const spec = loaded.corpus.getAs(CaseSpec, loaded.suiteCases[0]!.ref);
    expect(() => compileCase(spec, CONVERSATION_RUNNER_CAPABILITIES, null)).not.toThrow();
    const invalid: Array<[CaseSpec['effects'], string]> = [
      [{ ...spec.effects, maxConversations: 0 }, 'conversation_limit'],
      [{ ...spec.effects, mode: 'read_only' as const }, 'conversation_effect_not_admitted'],
      [{ ...spec.effects, allowedResourcePrefixes: ['/appointments'] }, 'conversation_endpoint_not_admitted'],
    ];
    for (const [effects, reason] of invalid) expect(() => compileCase({ ...spec, effects }, CONVERSATION_RUNNER_CAPABILITIES, null)).toThrow(reason);
    expect(() => compileCase(spec, HTTP_RUNNER_CAPABILITIES, null)).toThrow('unsupported_operation');
    expect(() => compileCase({ ...spec, steps: spec.steps.map((step) => step.kind === 'conversation.run' ? { ...step, retry: { attempts: 2 } } : step) }, CONVERSATION_RUNNER_CAPABILITIES, null)).toThrow('conversation_retry_unsupported');
    expect(() => compileCase({ ...spec, assertions: spec.assertions.map((assertion) => ({ ...assertion, oracle: { name: 'http.observation' as const, version: '1' as const } })) }, CONVERSATION_RUNNER_CAPABILITIES, null)).toThrow('oracle_step_mismatch');
  });

  it('matches phrases ignoring case and spacing, list members exactly, and bounds latency', () => {
    const body = { reply: 'You are  ALL set for Tuesday at 3 PM.', tools: ['book_appointment'], ms: 420 };
    expect(evaluatePredicate({ kind: 'json_path_includes', path: 'body.reply', values: ['all set', 'tuesday at 3 pm'] }, { body }).pass).toBe(true);
    expect(evaluatePredicate({ kind: 'json_path_includes', path: 'body.reply', values: ['Wednesday'] }, { body })).toMatchObject({ pass: false, reason: 'body.reply lacks "Wednesday"' });
    expect(evaluatePredicate({ kind: 'json_path_excludes', path: 'body.reply', values: ['911'] }, { body }).pass).toBe(true);
    expect(evaluatePredicate({ kind: 'json_path_excludes', path: 'body.reply', values: ['tuesday'] }, { body })).toMatchObject({ pass: false, reason: 'body.reply contains "tuesday"' });
    expect(evaluatePredicate({ kind: 'json_path_includes', path: 'body.tools', values: ['book'] }, { body }).pass).toBe(false);
    expect(evaluatePredicate({ kind: 'json_path_excludes', path: 'body.tools', values: ['transfer_call'] }, { body }).pass).toBe(true);
    expect(evaluatePredicate({ kind: 'json_path_includes', path: 'body.missing', values: ['x'] }, { body })).toMatchObject({ pass: false, reason: 'body.missing absent' });
    expect(evaluatePredicate({ kind: 'json_path_at_most', path: 'body.ms', value: 500 }, { body }).pass).toBe(true);
    expect(evaluatePredicate({ kind: 'json_path_at_most', path: 'body.ms', value: 400 }, { body })).toMatchObject({ pass: false, reason: 'body.ms 420 > 400' });
    expect(evaluatePredicate({ kind: 'json_path_at_most', path: 'body.reply', value: 400 }, { body }).pass).toBe(false);
  });
});
