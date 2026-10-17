/** Pure lifecycle decisions. No retries, reset, filesystem access or cleanup is performed here. */
import { CapabilityReplayPlan, CapabilityRetryPolicy, CapabilityRetryState, CapabilityLifecycleCheckpoint, CapabilityArtifactManifest,
  ScopedResource, CapabilityBinding, digestOfValue, sameRef, type Ref } from '../protocol/index.ts';
import { CapabilityBoundaryError } from './capabilityBoundary.ts';
const same = (a: unknown, b: unknown) => digestOfValue(a).hex === digestOfValue(b).hex;

export function planCapabilityRetry(policyValue: unknown, stateValue: unknown) {
  const policy = CapabilityRetryPolicy.parse(policyValue); const state = CapabilityRetryState.parse(stateValue);
  const result = (decision: 'stop' | 'reconcile' | 'retry', reason: string, delayMs: number | null = null) => ({ decision, reason, delayMs,
    priorAttemptRef: structuredClone(state.priorAttemptRef), retainedArtifactRefs: structuredClone(state.retainedArtifactRefs) });
  if (state.effects === 'ambiguous') return result('reconcile', 'effect_outcome_ambiguous');
  if (['assertion', 'cancelled', 'unsupported'].includes(state.failure)) return result('stop', 'failure_not_automatically_retryable');
  if (state.mutating && state.effects === 'acknowledged' && !state.idempotency) return result('reconcile', 'idempotency_authority_required');
  if (state.attemptNumber >= policy.maxAttempts || state.requestsUsed >= policy.maxRequests) return result('stop', 'attempt_or_request_budget_exhausted');
  const delay = Math.max(policy.baseDelayMs * 2 ** Math.min(state.attemptNumber - 1, 10), state.retryAfterMs ?? 0);
  if (delay > policy.maxDelayMs || state.elapsedMs + delay >= policy.maxElapsedMs || delay >= state.remainingDeadlineMs) return result('stop', 'retry_delay_exceeds_budget');
  return result('retry', 'transport_or_setup_retry', delay);
}
/** Resolve inventory against host-owned records. Ambiguity/staleness always needs reconciliation. */
export function planCapabilityTeardown(checkpointValue: unknown, currentValue: unknown, ownedValues: unknown[], now = Date.now()) {
  const checkpoint = CapabilityLifecycleCheckpoint.parse(checkpointValue); const current = CapabilityBinding.parse(currentValue);
  if (!same(checkpoint.binding, current)) throw new CapabilityBoundaryError('stale_or_cross_run_cleanup');
  const owned = ownedValues.map(value => ScopedResource.parse(value));
  return checkpoint.inventory.map(item => {
    const resource = owned.find(value => sameRef(value.ref, item.resourceRef));
    const bound = resource && same(resource.binding, current) && sameRef(resource.leaseRef, item.leaseRef) && resource.isolation === 'owned_isolated' && resource.identityRef !== null && Date.parse(resource.expiresAt) > now;
    const action = !bound || ['reserved', 'effect_unacknowledged'].includes(item.state) ? 'reconcile' as const
      : item.state === 'removed' ? 'already_confirmed' as const : 'cleanup' as const;
    return { resourceRef: structuredClone(item.resourceRef), action, priorEvidenceRefs: structuredClone(item.evidenceRefs) };
  });
}
/** Artifact paths contain only a content hash and a closed extension; user/domain names never enter them. */
export function capabilityArtifactName(ref: Ref, extension: 'json' | 'jsonl' | 'xml' | 'webm' | 'png' | 'zip' | 'txt'): string {
  const name = `${ref.digest.hex}.${extension}`;
  if (!/^[a-f0-9]{64}\.(?:json|jsonl|xml|webm|png|zip|txt)$/.test(name)) throw new CapabilityBoundaryError('unsafe_artifact_name');
  return name;
}
export function capabilityIdentitySlugs(bindingValue: unknown) {
  const binding = CapabilityBinding.parse(bindingValue);
  return { scenario: `scenario-${digestOfValue(binding.caseRef.id).hex.slice(0, 16)}`,
    run: `run-${digestOfValue({ campaignId: binding.campaignId, executionId: binding.executionId }).hex.slice(0, 16)}`,
    attempt: `attempt-${digestOfValue({ executionId: binding.executionId, attemptId: binding.attemptId, generation: binding.generation }).hex.slice(0, 16)}` };
}
export function validateCapabilityArtifactManifest(value: unknown, currentValue: unknown) {
  const manifest = CapabilityArtifactManifest.parse(value); const current = CapabilityBinding.parse(currentValue);
  if (!same(manifest.binding, current)) throw new CapabilityBoundaryError('stale_or_cross_run_artifact_manifest');
  return structuredClone(manifest);
}

/** Explicit replay semantics; support must come from the host, never a caller's mode label. */
export function validateCapabilityReplay(value: unknown, supportedModes: readonly string[] = ['evidence_playback']) {
  const plan = CapabilityReplayPlan.parse(value);
  if (!supportedModes.includes(plan.mode)) throw new CapabilityBoundaryError('unsupported_replay_mode');
  if (plan.mode === 'evidence_playback') {
    if (plan.targetBinding || plan.freshFixtureRefs.length || plan.externalEffects !== 'none' || !sameRef(plan.sourceCodeRef, plan.targetCodeRef)) throw new CapabilityBoundaryError('playback_must_not_execute_actions');
  } else {
    if (!plan.targetBinding || plan.targetBinding.executionId === plan.sourceBinding.executionId || plan.targetBinding.attemptId === plan.sourceBinding.attemptId || !plan.freshFixtureRefs.length) throw new CapabilityBoundaryError('rerun_requires_fresh_attempt_and_fixtures');
    if (plan.targetBinding.scope.ownerId !== plan.sourceBinding.scope.ownerId || !same(plan.targetBinding.scope, plan.sourceBinding.scope)) throw new CapabilityBoundaryError('replay_scope_mismatch');
    if (plan.mode === 'workflow_history_replay' && (!plan.historyRef || (!sameRef(plan.sourceCodeRef, plan.targetCodeRef) && !plan.compatibilityReviewRef))) throw new CapabilityBoundaryError('history_code_compatibility_unreviewed');
  }
  return structuredClone(plan); // No replay/provider operation is performed.
}
