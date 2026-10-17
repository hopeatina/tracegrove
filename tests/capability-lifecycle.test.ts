import { expect, it } from 'vitest';
import { digestOfBytes, type Ref } from '../src/protocol/index.ts';
import { capabilityArtifactName, capabilityIdentitySlugs, planCapabilityRetry, planCapabilityTeardown, validateCapabilityArtifactManifest } from '../src/core/capabilityLifecycle.ts';
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
const binding = { campaignId: 'campaign', executionId: 'exec', attemptId: 'attempt', generation: 1,
  requestRef: ref('request'), sourceSelectionRef: ref('source'), caseRef: ref('case'), personaRef: ref('persona'), targetRef: ref('target'), environmentRef: ref('env'),
  scope: { ownerId: 'owner', tenantId: null, visibility: 'owner_private' as const } };
const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, maxElapsedMs: 5000, maxRequests: 5 };
const state = { attemptNumber: 1, elapsedMs: 200, requestsUsed: 1, remainingDeadlineMs: 5000, retryAfterMs: null,
  failure: 'transport', effects: 'none', mutating: false, idempotency: null,
  priorAttemptRef: ref('attempt.first'), retainedArtifactRefs: [ref('first.video')] };
it('retries only bounded transport/setup failures and retains the first attempt artifacts', () => {
  expect(planCapabilityRetry(policy, state)).toMatchObject({ decision: 'retry', delayMs: 100, priorAttemptRef: state.priorAttemptRef, retainedArtifactRefs: state.retainedArtifactRefs });
  expect(planCapabilityRetry(policy, { ...state, attemptNumber: 2, failure: 'setup' })).toMatchObject({ decision: 'retry', delayMs: 200 });
  for (const failure of ['assertion', 'cancelled', 'unsupported']) expect(planCapabilityRetry(policy, { ...state, failure }).decision).toBe('stop');
});
it('does not replay an ambiguous side effect or treat a bare key as authority', () => {
  expect(planCapabilityRetry(policy, { ...state, mutating: true, effects: 'ambiguous', idempotency: { key: 'key', requestDigest: ref('request').digest, authorityRef: ref('authority') } }).decision).toBe('reconcile');
  expect(planCapabilityRetry(policy, { ...state, mutating: true, effects: 'acknowledged' }).decision).toBe('reconcile');
  expect(() => planCapabilityRetry(policy, { ...state, mutating: true, idempotency: { key: 'key' } })).toThrow();
});
it('honors Retry-After and stops rather than retrying early or exceeding budgets', () => {
  expect(planCapabilityRetry(policy, { ...state, retryAfterMs: 800 })).toMatchObject({ decision: 'retry', delayMs: 800 });
  for (const change of [{ retryAfterMs: 2000 }, { requestsUsed: 5 }, { attemptNumber: 3 }, { remainingDeadlineMs: 50 }, { elapsedMs: 4950 }]) expect(planCapabilityRetry(policy, { ...state, ...change }).decision).toBe('stop');
});
function cleanupFixture() {
  const owned = ['one', 'two', 'three', 'four'].map(id => ({ schemaVersion: 'workflow.scoped-resource/v1', ref: ref(id), binding, kind: 'database',
    isolation: 'owned_isolated', leaseRef: ref(`lease.${id}`), identityRef: ref(`identity.${id}`), provisioningPlanRef: ref(`plan.${id}`), expiresAt: '2099-01-01T00:00:00Z' }));
  const checkpoint = { schemaVersion: 'workflow.capability-lifecycle-checkpoint/v1', binding, operationId: 'provision', inventory: owned.map((r, index) => ({ resourceRef: r.ref, leaseRef: r.leaseRef,
    state: ['created', 'effect_unacknowledged', 'cleanup_failed', 'removed'][index], evidenceRefs: index === 3 ? [ref('removed-proof')] : [] })) };
  return { owned, checkpoint };
}
it('plans resumable partial provisioning/failed cleanup without global delete or forgetting acknowledged resources', () => {
  const f = cleanupFixture(); const plan = planCapabilityTeardown(f.checkpoint, binding, f.owned);
  expect(plan.map(row => row.action)).toEqual(['cleanup', 'reconcile', 'cleanup', 'already_confirmed']);
  expect(plan.map(row => row.resourceRef)).toEqual(f.owned.map(row => row.ref));
});
it('refuses stale/cross-run cleanup and reconciles foreign, expired or unobserved inventory', () => {
  const f = cleanupFixture();
  expect(() => planCapabilityTeardown(f.checkpoint, { ...binding, attemptId: 'other' }, f.owned)).toThrow('stale_or_cross_run_cleanup');
  const changed = f.owned.map((row, index) => index === 0 ? { ...row, binding: { ...binding, executionId: 'other-run' } }
    : index === 2 ? { ...row, expiresAt: '2000-01-01T00:00:00Z' } : row);
  expect(planCapabilityTeardown(f.checkpoint, binding, changed).map(row => row.action)).toEqual(['reconcile', 'reconcile', 'reconcile', 'already_confirmed']);
  expect(planCapabilityTeardown(f.checkpoint, binding, f.owned.map(row => ({ ...row, identityRef: null }))).every(row => row.action === 'reconcile')).toBe(true);
});
it('requires cleanup evidence and rejects duplicate inventory', () => {
  const f = cleanupFixture();
  expect(() => planCapabilityTeardown({ ...f.checkpoint, inventory: [...f.checkpoint.inventory, f.checkpoint.inventory[0]] }, binding, f.owned)).toThrow();
  expect(() => planCapabilityTeardown({ ...f.checkpoint, inventory: f.checkpoint.inventory.map(row => ({ ...row, evidenceRefs: [] })) }, binding, f.owned)).toThrow();
});
it('keeps stable scenario labels separate from fresh run/attempt identity without putting PII in filenames', () => {
  const a = capabilityIdentitySlugs(binding); const b = capabilityIdentitySlugs({ ...binding, campaignId: 'fresh-campaign', executionId: 'fresh-exec', attemptId: 'fresh-attempt', caseRef: { ...binding.caseRef, revision: '2' } });
  expect(a.scenario).toBe(b.scenario); expect(a.run).not.toBe(b.run); expect(a.attempt).not.toBe(b.attempt);
  const name = capabilityArtifactName(ref('customer@example.com/private/recording'), 'webm');
  expect(name).toMatch(/^[a-f0-9]{64}\.webm$/); expect(name).not.toContain('customer');
});
it('requires deterministic safe artifact filenames and exact run bindings', () => {
  const artifact = { ref: ref('native'), producer: { adapterId: 'adapter', adapterVersion: '1', tool: 'tool', toolVersion: '2' },
    mediaType: 'application/json', byteCount: 1, redaction: 'not_required', redactionPolicyRef: null };
  const manifest = { schemaVersion: 'workflow.capability-artifact-manifest/v1', binding, publication: 'committed', artifacts: [{ fileName: capabilityArtifactName(artifact.ref, 'json'), artifact }] };
  expect(validateCapabilityArtifactManifest(manifest, binding)).toEqual(manifest);
  expect(() => validateCapabilityArtifactManifest({ ...manifest, artifacts: [{ fileName: '../private.json', artifact }] }, binding)).toThrow();
  expect(() => validateCapabilityArtifactManifest({ ...manifest, artifacts: [{ fileName: `${'0'.repeat(64)}.json`, artifact }] }, binding)).toThrow();
  expect(() => validateCapabilityArtifactManifest(manifest, { ...binding, executionId: 'foreign' })).toThrow('stale_or_cross_run_artifact_manifest');
});

it('separates evidence playback from fresh-fixture reruns and refuses unsupported history replay', async () => {
  const { validateCapabilityReplay } = await import('../src/core/capabilityLifecycle.ts');
  const plan = { schemaVersion: 'workflow.capability-replay-plan/v1', mode: 'evidence_playback', sourceReceiptRef: ref('receipt'), sourceBinding: binding,
    targetBinding: null, sourceCodeRef: ref('code'), targetCodeRef: ref('code'), compatibilityReviewRef: null,
    pins: { fixtureRef: ref('fixture'), seedRef: ref('seed'), generatorRef: ref('generator'), runtimeRef: ref('runtime'), configRef: ref('config'), clockMode: 'wall', clockRef: ref('clock') },
    freshFixtureRefs: [], historyRef: null, externalEffects: 'none' };
  expect(validateCapabilityReplay(plan)).toEqual(plan);
  expect(() => validateCapabilityReplay({ ...plan, externalEffects: 'declared_isolated' })).toThrow('playback_must_not_execute_actions');
  expect(() => validateCapabilityReplay({ ...plan, mode: 'fixture_rerun' })).toThrow('unsupported_replay_mode');
  expect(() => validateCapabilityReplay({ ...plan, mode: 'fixture_rerun', targetBinding: binding }, ['fixture_rerun'])).toThrow('rerun_requires_fresh_attempt_and_fixtures');
  const rerun = { ...plan, mode: 'fixture_rerun', targetBinding: { ...binding, executionId: 'new-exec', attemptId: 'new-attempt' }, freshFixtureRefs: [ref('fresh-fixture')] };
  expect(validateCapabilityReplay(rerun, ['fixture_rerun'])).toEqual(rerun);
  for (const freshFixtureRefs of [[plan.pins.fixtureRef], [{ ...plan.pins.fixtureRef, revision: '2' }], [ref('fresh-fixture'), ref('fresh-fixture')]]) {
    expect(() => validateCapabilityReplay({ ...rerun, freshFixtureRefs }, ['fixture_rerun'])).toThrow('rerun_requires_distinct_fresh_fixtures');
  }
  expect(() => validateCapabilityReplay({ ...rerun, mode: 'workflow_history_replay', historyRef: ref('history'), targetCodeRef: ref('new-code') }, ['workflow_history_replay'])).toThrow('history_code_compatibility_unreviewed');
  expect(() => validateCapabilityReplay({ ...plan, pins: { seedRef: ref('seed') } })).toThrow();
});
it('does not call partial/empty artifact publication committed', () => {
  expect(() => validateCapabilityArtifactManifest({ schemaVersion: 'workflow.capability-artifact-manifest/v1', binding, publication: 'committed', artifacts: [] }, binding)).toThrow();
  expect(validateCapabilityArtifactManifest({ schemaVersion: 'workflow.capability-artifact-manifest/v1', binding, publication: 'incomplete', artifacts: [] }, binding).publication).toBe('incomplete');
});
