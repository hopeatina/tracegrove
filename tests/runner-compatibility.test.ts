import { afterEach, expect, it } from 'vitest';
import { RunnerProfile, freeze, refKey, type Ref } from '../src/protocol/index.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, planSample, sampleCopy, runSample } from '../conformance/helpers.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { frozenRunnerCapabilities, runnerCapabilitiesFor } from '../src/core/runnerCapabilities.ts';

afterEach(cleanupTemps);

function profile(adapter: RunnerProfile['adapter'] = 'browser') {
  return RunnerProfile.parse(freeze({ schemaVersion: 'workflow.runner-profile/v1', ref: { id: `fixture.runner.${adapter}`, revision: '1' },
    scope: { ownerId: 'compatibility-fixture', tenantId: null, visibility: 'owner_private' }, adapter, maxStepsPerCase: 50, cancellation: 'confirmed' }));
}
function failure(documents: Record<string, unknown>, requested: Ref) {
  try { frozenRunnerCapabilities(documents, requested); throw new Error('unexpected admission'); }
  catch (error) { return error as Error & { diagnostic: { schemaVersion: string; code: string; profileEvidence: string; verification: string; requestedRunner: Ref; availableProfiles: Array<{ profile: Ref; reproducedRunner: Ref }>; action: string } }; }
}

it.each(['http', 'browser', 'native_job', 'mcp'] as const)('reproduces the exact frozen %s identity without changing documents', adapter => {
  const p = profile(adapter), documents = { [refKey(p.ref)]: p }, before = JSON.stringify(documents), expected = runnerCapabilitiesFor(p);
  expect(frozenRunnerCapabilities(documents, expected.ref)).toEqual(expected); expect(JSON.stringify(documents)).toBe(before);
});

it('distinguishes an unsupported revision from absent profile evidence without admitting a subset of its operations', () => {
  const p = profile(), current = runnerCapabilitiesFor(p), requested = { ...current.ref, revision: '0.3.0', digest: { algorithm: 'sha256' as const, hex: '9'.repeat(64) } };
  const error = failure({ [refKey(p.ref)]: p }, requested);
  expect(error.diagnostic).toMatchObject({ schemaVersion: 'tracegrove.runner-compatibility/v1', code: 'runner_capability_revision_unsupported',
    profileEvidence: 'present', verification: 'not_completed', requestedRunner: requested, availableProfiles: [{ profile: p.ref, reproducedRunner: current.ref }] });
  expect(error.message).toContain('runner_capability_revision_unsupported'); expect(error.diagnostic.action).toContain('Do not edit or reseal');
});

it('refuses a different digest at a supported revision rather than labeling it a version migration', () => {
  const p = profile(), current = runnerCapabilitiesFor(p), requested = { ...current.ref, digest: { algorithm: 'sha256' as const, hex: '0'.repeat(64) } };
  expect(failure({ [refKey(p.ref)]: p }, requested).diagnostic).toMatchObject({ code: 'runner_capability_digest_mismatch', profileEvidence: 'present', verification: 'not_completed' });
});

it.each(['absent', 'invalid', 'forged', 'unrelated'] as const)('does not treat %s profile evidence as a supported or unsupported runner', mode => {
  const p = profile(), expected = runnerCapabilitiesFor(p).ref;
  const documents = mode === 'absent' ? {} : mode === 'invalid' ? { invalid: { adapter: 'browser' } }
    : mode === 'forged' ? { forged: { ...p, maxStepsPerCase: p.maxStepsPerCase + 1 } } : { unrelated: profile('http') };
  expect(failure(documents, expected).diagnostic).toMatchObject({ code: 'runner_profile_missing', profileEvidence: 'missing_or_invalid', verification: 'not_completed', availableProfiles: [] });
});

it('keeps successful reduction and corrupt-byte rejection separate from compatibility diagnostics', async () => {
  const copy = sampleCopy(), summary = await runSample(planSample(copy.configPath), copy.stateDir);
  expect(verifyBundle(summary.executionDir)).toMatchObject({ ok: true, outcome: 'passed' });
  const file = join(summary.executionDir, 'documents.json');
  writeFileSync(file, readFileSync(file, 'utf8') + ' ');
  const rejected = verifyBundle(summary.executionDir);
  expect(rejected.ok).toBe(false); expect(rejected.outcome).toBeNull(); expect(rejected.diagnostics).toBeUndefined();
});
