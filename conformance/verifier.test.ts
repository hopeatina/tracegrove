/**
 * Verifier conformance cases from the scenario catalog. Each passes when it observes the
 * specified refusal, recovery or non-green result. None of these increase product coverage.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, editFile, planSample, rematerializePayload, runSample, sampleCopy, sampleIdentityDigest } from './helpers.ts';
import { Blocked, Conflict } from '../src/core/errors.ts';
import { HostFrame, PluginFrame, FRAME_MAX_BYTES, refKey } from '../src/protocol/index.ts';
import type { ExecutorHost, HostSession } from '../src/hosts/types.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
import { MockLoopbackHost } from '../src/hosts/mock.ts';

afterEach(cleanupTemps);

describe('verifier.zero_orgx', () => {
  it('no core, protocol, adapter or host module imports OrgX, Supabase, Clerk or a provider SDK', () => {
    const forbidden = /from ['"](@\/lib|@orgx|@useorgx|@supabase|@clerk|openai|@anthropic-ai|@trigger|inngest)/;
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    const files = walk(join(import.meta.dirname, '..', 'src'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
  });
  it('the real sample runs and reruns from saved definitions with no inference and a complete local proof', async () => {
    const copy = sampleCopy();
    const bundle = planSample(copy.configPath);
    const summary = await runSample(bundle, copy.stateDir);
    expect(summary.outcome).toBe('passed');
    const receipt = summary.receipts[0]!;
    expect(receipt.accounting.inferenceCalls).toBe(0);
    expect(receipt.assertions.filter((a) => a.required).every((a) => a.result === 'pass')).toBe(true);
    expect(receipt.environment.provenance.runtime).toBe('live');
  });
});

describe('verifier.fidelity_downgrade', () => {
  it('a live-required case cannot run under a mock profile; the mismatch is a blocker, not a fallback', () => {
    const copy = sampleCopy((root) => editFile(join(root, 'verification', 'cases', 'notes.suite.yaml'), (t) => t.replace('profiles: [native-real]', 'profiles: [native-real, offline-contract]')));
    const bundle = planSample(copy.configPath, 'offline-contract');
    expect(bundle.request).toBeNull();
    expect(bundle.blockers.map((b) => b.code)).toContain('fidelity_mode_mismatch');
  });
  it('a fidelity plan from a different selection is refused at admission', async () => {
    const copy = sampleCopy();
    const bundle = planSample(copy.configPath);
    const other = planSample(sampleCopy().configPath, 'offline-contract');
    const foreignPlan = other.documents[refKey(other.request!.fidelityPlanRef)];
    const tampered = { ...bundle, request: { ...bundle.request!, fidelityPlanRef: other.request!.fidelityPlanRef }, documents: { ...bundle.documents, [refKey(other.request!.fidelityPlanRef)]: foreignPlan } };
    await expect(runSample(tampered as never, copy.stateDir)).rejects.toThrow(/request_digest_mismatch|foreign_selection/);
  });
});

describe('verifier.review_digest', () => {
  it('a case edited after planning is refused before any effect', async () => {
    const copy = sampleCopy();
    const bundle = planSample(copy.configPath);
    const caseKey = refKey(bundle.request!.caseRefs[0]!);
    const spec = JSON.parse(JSON.stringify(bundle.documents[caseKey])) as { purpose: string };
    spec.purpose = 'edited after review';
    const tampered = { ...bundle, documents: { ...bundle.documents, [caseKey]: spec } };
    let launched = false;
    const spyHost: ExecutorHost = { async start(ctx) { launched = true; return new LocalProcessHost().start(ctx); } };
    await expect(runSample(tampered, copy.stateDir, { hosts: { local: spyHost } })).rejects.toThrow(/digest_mismatch/);
    expect(launched).toBe(false);
  });
});

describe('verifier.step_limit', () => {
  it('an oversize flow is rejected at plan time with no prefix execution', () => {
    const copy = sampleCopy((root) => editFile(join(root, 'verification', 'runners', 'http.yaml'), (t) => t.replace('maxStepsPerCase: 50', 'maxStepsPerCase: 3')));
    const bundle = planSample(copy.configPath);
    expect(bundle.request).toBeNull();
    expect(bundle.blockers.map((b) => b.code)).toContain('step_limit_exceeded');
  });
});

describe('verifier.unwired_capability', () => {
  it('a grammar-valid step the runner does not implement blocks before effects', () => {
    const copy = sampleCopy((root) => editFile(join(root, 'verification', 'cases', 'notes.create.yaml'), (t) => t.replace('requiredCapabilities: [http.request, observe, fixture.http]', 'requiredCapabilities: [http.request, observe, fixture.http, ui.navigate]')));
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers.map((b) => b.code)).toContain('unwired_capability');
  });
});

describe('verifier.host_capability', () => {
  it('a required capability the host never probed as supported blocks the cell; no step runs', async () => {
    const copy = sampleCopy((root) => editFile(join(root, 'verification', 'hosts', 'local-process.yaml'), (t) => t.replace('requiredCapabilities: [shell, network_origin:loopback, confirmed_cancel, artifact_delivery]', 'requiredCapabilities: [shell, network_origin:loopback, confirmed_cancel, artifact_delivery, video_export]')));
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers).toEqual([]);
    const summary = await runSample(bundle, copy.stateDir);
    expect(summary.outcome).toBe('blocked');
    expect(summary.reasonCodes.some((r) => r.startsWith('host_capability_unobserved'))).toBe(true);
    expect(summary.receipts[0]!.steps.every((s) => s.result === 'not_run')).toBe(true);
    expect(summary.receipts[0]!.cleanup.confirmed).toContain('host.process');
  });
});

describe('verifier.identity', () => {
  it('a changed application source makes the identity mismatch visible and blocks the live claim', async () => {
    const copy = sampleCopy((root) => editFile(join(root, 'app', 'app.mjs'), (t) => `${t}\n// drift\n`));
    const bundle = planSample(copy.configPath);
    const summary = await runSample(bundle, copy.stateDir);
    expect(summary.outcome).toBe('blocked');
    expect(summary.reasonCodes).toContain('identity_mismatch');
    expect(summary.receipts[0]!.environment.observed?.components[0]?.identity).not.toEqual(summary.receipts[0]!.environment.expected.components[0]?.identity);
  });
});

describe('controlled product defect', () => {
  it('an authorization regression fails its assertion, keeps the first failure and still cleans up', async () => {
    // Defect: the app no longer enforces ownership on reads.
    const copy = sampleCopy((root) => {
      editFile(join(root, 'app', 'app.mjs'), (t) => t.replace("if (note.ownerId !== userId) return send(res, 403, { error: 'forbidden' });", "if (note.ownerId !== userId && req.method !== 'GET') return send(res, 403, { error: 'forbidden' });"));
      editFile(join(root, 'verification', 'components', 'notes-api.profile.yaml'), (t) => t); // identity pin now stale on purpose below
    });
    // Re-pin identity so the only difference is the behavior, not the digest.
    const digest = sampleIdentityDigest(copy.root).hex;
    editFile(join(copy.root, 'verification', 'components', 'notes-api.profile.yaml'), (t) => t.replace(/hex: "?[0-9a-f]{64}"?/, `hex: "${digest}"`));
    const bundle = planSample(copy.configPath);
    const summary = await runSample(bundle, copy.stateDir);
    expect(summary.outcome).toBe('assertion_failed');
    expect(summary.exitCode).toBe(1);
    const receipt = summary.receipts[0]!;
    expect(receipt.assertions.find((a) => a.assertionId === 'a.denied')?.result).toBe('fail');
    expect(receipt.steps.every((s) => s.result === 'completed')).toBe(true); // the flow still ran to completion
    expect(receipt.cleanup.confirmed).toContain('existing_note');
    expect(receipt.proofEligible).toBe(false);
  });
});

describe('verifier.seed_partial', () => {
  it('a fixture readback mismatch blocks execution, journals the allocation and cleans it up', async () => {
    const copy = sampleCopy((root) => editFile(join(root, 'verification', 'fixtures', 'existing-note.recipe.yaml'), (t) => t.replace('json_path_equals, path: body.note.title, value: Existing note', 'json_path_equals, path: body.note.title, value: Something else')));
    rematerializePayload(copy.root);
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers).toEqual([]);
    const summary = await runSample(bundle, copy.stateDir);
    expect(summary.outcome).toBe('blocked');
    expect(summary.reasonCodes).toContain('fixture_failed');
    const receipt = summary.receipts[0]!;
    expect(receipt.steps.every((s) => s.result === 'not_run')).toBe(true);
    expect(receipt.cleanup.attempted).toContain('existing_note');
    expect(receipt.cleanup.confirmed).toContain('existing_note');
    const events = readFileSync(join(summary.executionDir, 'cells', readdirSync(join(summary.executionDir, 'cells'))[0]!, 'events.jsonl'), 'utf8');
    expect(events).toMatch(/fixture.allocating/);
    expect(events).toMatch(/fixture.failed/);
  });
});

describe('verifier.operation_deadline', () => {
  it('a stalled readback hits its own deadline; the step fails, cleanup still runs, the host is stopped', async () => {
    const copy = sampleCopy((root) => {
      editFile(join(root, 'app', 'app.mjs'), (t) => t.replace("if (req.method === 'GET') return send(res, 200, { note });", "if (req.method === 'GET') { if (process.env.STALL === '1') return; return send(res, 200, { note }); }"));
      editFile(join(root, 'verification', 'hosts', 'local-process.yaml'), (t) => t.replace('env: { NOTES_BUILD: sample }', 'env: { NOTES_BUILD: sample, STALL: "1" }'));
      editFile(join(root, 'verification', 'cases', 'notes.create.yaml'), (t) => t.replace(/timeoutMs: 5000/g, 'timeoutMs: 800'));
      editFile(join(root, 'verification', 'fixtures', 'existing-note.recipe.yaml'), (t) => t.replace(/    readback:\n      actionId: notes.read\/v1\n      predicate:\n        kind: all\n        predicates:\n          - \{ kind: status_equals, value: 200 \}\n          - \{ kind: json_path_equals, path: body.note.title, value: Existing note \}\n/, '    readback: null\n'));
    });
    const digest = sampleIdentityDigest(copy.root).hex;
    editFile(join(copy.root, 'verification', 'components', 'notes-api.profile.yaml'), (t) => t.replace(/hex: "?[0-9a-f]{64}"?/, `hex: "${digest}"`));
    rematerializePayload(copy.root);
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers).toEqual([]);
    const started = Date.now();
    const summary = await runSample(bundle, copy.stateDir);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(summary.outcome).toBe('infrastructure_failed');
    const receipt = summary.receipts[0]!;
    const readBack = receipt.steps.find((s) => s.stepId === 'read_back')!;
    expect(readBack.result).toBe('failed');
    expect(readBack.reasonCode).toBe('deadline_exceeded');
    expect(receipt.steps.filter((s) => s.result === 'not_run').length).toBeGreaterThan(0);
    expect(receipt.cleanup.confirmed).toContain('host.process');
  });
});

describe('verifier.cancel', () => {
  it('a stop during execution revokes action authority, marks remaining steps cancelled and still cleans up', async () => {
    const copy = sampleCopy();
    const bundle = planSample(copy.configPath);
    const controller = new AbortController();
    const summary = await runSample(bundle, copy.stateDir, { signal: controller.signal, onEvent: (e) => { if (e.kind === 'step.finished' && e.stepId === 'create') controller.abort(new Error('user_cancelled')); } });
    expect(summary.outcome).toBe('cancelled');
    expect(summary.exitCode).toBe(4);
    const receipt = summary.receipts[0]!;
    expect(receipt.steps.find((s) => s.stepId === 'create')?.result).toBe('completed');
    expect(receipt.steps.filter((s) => s.result === 'cancelled').length).toBeGreaterThan(0);
    expect(receipt.cleanup.confirmed).toContain('existing_note');
    expect(receipt.cleanup.confirmed).toContain('host.process');
  });
});

describe('verifier.surface_parity', () => {
  it('library and CLI resolve the same effective configuration and selection digests for the same inputs', async () => {
    const copy = sampleCopy();
    const library = planSample(copy.configPath);
    const { execFileSync } = await import('node:child_process');
    const out = join(copy.root, 'cli-request.json');
    execFileSync('node', ['--import', 'tsx', join(import.meta.dirname, '..', 'src', 'cli', 'main.ts'), 'plan', '--config', copy.configPath, '--output', out], { stdio: 'pipe' });
    const cli = JSON.parse(readFileSync(out, 'utf8')) as typeof library;
    expect(cli.request!.idempotencyKey).not.toBe(library.request!.idempotencyKey); // independent campaigns, identical semantic selection
    expect(cli.request!.selectionManifestRef.digest.hex).toBe(library.request!.selectionManifestRef.digest.hex);
    expect(cli.request!.effectiveConfigRef.digest.hex).toBe(library.request!.effectiveConfigRef.digest.hex);
  });
});

describe('verifier.adapter_protocol', () => {
  const binding = { executionId: 'exec_1', attemptId: 'attempt_1', generation: 1, requestDigest: { algorithm: 'sha256', hex: 'a'.repeat(64) } };
  it('rejects unknown fields, malformed frames and unsupported operations before effects', () => {
    expect(HostFrame.safeParse({ type: 'execute', ...binding, operationId: 'op1', stepId: 's1', deadlineAt: new Date().toISOString(), input: {}, extra: true }).success).toBe(false);
    expect(HostFrame.safeParse({ type: 'shell', ...binding, operationId: 'op1' }).success).toBe(false);
    expect(PluginFrame.safeParse({ type: 'terminal', ...binding, operationId: 'op1', sequence: 0, status: 'passed', reasonCode: null }).success).toBe(false);
    expect(PluginFrame.safeParse({ type: 'terminal', ...binding, operationId: 'op1', sequence: 0, status: 'completed', reasonCode: null }).success).toBe(true);
    expect(FRAME_MAX_BYTES).toBe(65536);
  });
  it('plugin success is not authority: a terminal completed frame carries no verdict field', () => {
    const parsed = PluginFrame.safeParse({ type: 'terminal', ...binding, operationId: 'op1', sequence: 0, status: 'completed', reasonCode: null, verdict: 'passed' });
    expect(parsed.success).toBe(false);
  });
});

describe('verifier.corpus_sync', () => {
  it('two definitions with the same id and revision but different bytes conflict instead of silently overriding', () => {
    const copy = sampleCopy((root) => {
      const dup = join(root, 'verification', 'personas', 'owner-dup.yaml');
      editFile(join(root, 'verification', 'personas', 'owner.yaml'), (t) => t);
      const original = readFileSync(join(root, 'verification', 'personas', 'owner.yaml'), 'utf8');
      writeFileSync(dup, original.replace('locale: en-US', 'locale: en-GB'));
      editFile(join(root, 'verification', 'cases', 'notes.contract.yaml'), (t) => t.replace('personaRef: { $file: ../personas/owner.yaml }', 'personaRef: { $file: ../personas/owner-dup.yaml }'));
    });
    expect(() => planSample(copy.configPath)).toThrow(/conflicting definitions/);
  });
});

describe('ledger', () => {
  it('a second live writer in another process is refused with the holder named', async () => {
    const copy = sampleCopy();
    const { spawn } = await import('node:child_process');
    const holder = spawn('node', ['--import', 'tsx', '-e', `import('${join(import.meta.dirname, '..', 'src', 'core', 'ledger.ts').replace(/\\/g, '/')}').then((m) => { m.LocalLedger.open(${JSON.stringify(copy.stateDir)}); console.log('held'); setInterval(() => {}, 1000); });`], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve) => holder.stdout.on('data', (d: Buffer) => { if (d.toString().includes('held')) resolve(); }));
    try {
      const { LocalLedger } = await import('../src/core/ledger.ts');
      expect(() => LocalLedger.open(copy.stateDir)).toThrow(Conflict);
      expect(() => LocalLedger.open(copy.stateDir)).toThrow(new RegExp(`live process ${holder.pid}`));
    } finally {
      holder.kill('SIGKILL');
      await new Promise((resolve) => holder.on('exit', resolve));
    }
    const { LocalLedger } = await import('../src/core/ledger.ts');
    const recovered = LocalLedger.open(copy.stateDir);
    expect(existsSync(join(copy.stateDir, 'ledger', 'lock.json'))).toBe(true);
    recovered.close();
  });
});

describe('mock lane isolation', () => {
  it('an unmatched mock route fails closed with 501 instead of inventing success', async () => {
    const copy = sampleCopy((root) => editFile(join(root, 'verification', 'mocks', 'notes.responses.yaml'), (t) => t.replace(/  - \{ method: GET[^\n]*\n/, '')));
    const bundle = planSample(copy.configPath, 'offline-contract');
    const summary = await runSample(bundle, copy.stateDir, { hosts: { mock: new MockLoopbackHost() } });
    expect(summary.outcome).toBe('assertion_failed');
    const readBack = summary.receipts[0]!.steps.find((s) => s.stepId === 'read_back')!;
    expect((readBack.output as { status: number }).status).toBe(501);
  });
});

void Blocked; void (null as unknown as HostSession);
