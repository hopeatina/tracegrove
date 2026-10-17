/** Read-only, experimental preflight. A ready report is never an execution/authorization token. */
import { PortableEnvironmentIntent, PortableEnvironmentProfile, PortableProbeObservation, PortablePreflightReport,
  digestOfValue, sameRef, sameScope, verifySelfDigest,
  type PortableProbeRequest, type Ref } from '../protocol/index.ts';

export type PortableEnvironmentPorts = {
  /** Trusted registry lookup; no network/auth setup or project-code evaluation. */
  resolveProfile(ref: Ref, signal: AbortSignal): Promise<unknown>;
  /** Inspect existing host capabilities/access metadata only. Never launch, seed, reset, install, fetch a secret value or change grants. */
  probe(request: PortableProbeRequest, context: PortableEnvironmentIntent, signal: AbortSignal): Promise<unknown>;
};
const recovery: Record<PortableProbeRequest['kind'], PortablePreflightReport['checks'][number]['recovery']> = {
  capability: 'install_or_select_capability', workspace: 'select_workspace_or_build', startup: 'select_launch_adapter', deployment: 'verify_deployment_access',
  endpoint: 'resolve_endpoint', readiness: 'verify_readiness', persona_credential: 'configure_existing_secret_reference', execution_credential: 'configure_existing_secret_reference',
  authorization: 'request_owner_authorization', configuration: 'select_safe_configuration', network: 'select_enforceable_network_policy', data: 'select_owned_synthetic_fixture',
  cleanup: 'reconcile_owned_cleanup', artifacts: 'select_exportable_artifact_destination', limits: 'lower_or_enforce_limits', replay: 'select_supported_replay_mode',
};
export function portableProbeRequests(profile: PortableEnvironmentProfile, intent: PortableEnvironmentIntent): PortableProbeRequest[] {
  const requests: PortableProbeRequest[] = [
    { kind: 'authorization', policyRef: profile.executionPolicyRef, actorRef: intent.actorRef },
    { kind: 'artifacts', artifacts: profile.artifacts }, { kind: 'limits', limits: profile.limits },
    { kind: 'replay', mode: intent.replayMode, planRef: intent.replayPlanRef },
  ];
  // Playback reads saved evidence, never asks for live application credentials or startup access.
  if (intent.replayMode === 'evidence_playback') return requests;
  requests.push({ kind: 'configuration', configurationRef: profile.configurationRef }, { kind: 'network', network: profile.network });
  if (profile.target.mode === 'alongside_runner') {
    requests.push({ kind: 'workspace', workspaceRef: profile.target.workspaceRef, sourceSelectionRef: profile.sourceSelectionRef, buildRef: profile.buildRef },
      { kind: 'startup', hostPlanRef: profile.target.hostPlanRef, launchRecipeRef: profile.target.launchRecipeRef, dependencyPlanRefs: profile.dependencyPlanRefs });
  } else requests.push({ kind: 'deployment', deploymentRef: profile.target.deploymentRef, sourceSelectionRef: profile.sourceSelectionRef, buildRef: profile.buildRef });
  requests.push(...profile.capabilities.map(requirement => ({ kind: 'capability' as const, requirement })),
    ...profile.endpoints.map(endpoint => ({ kind: 'endpoint' as const, endpoint })),
    { kind: 'readiness', readiness: profile.readiness },
    ...profile.personaCredentials.map(c => ({ kind: 'persona_credential' as const, ...c })),
    ...profile.executionSecretRefs.map(secretRef => ({ kind: 'execution_credential' as const, secretRef })),
    { kind: 'data', data: profile.data }, { kind: 'cleanup', ownership: profile.ownership });
  return requests;
}

/** Host ports must check actual enforceability, not merely whether a configuration declares a policy. */
export async function preflightPortableEnvironment(intentValue: unknown, ports: PortableEnvironmentPorts,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<PortablePreflightReport> {
  const parsed = PortableEnvironmentIntent.safeParse(intentValue);
  const report: PortablePreflightReport = { schemaVersion: 'workflow.portable-preflight/v1', profileRef: null, binding: null, actorRef: null,
    status: 'blocked', exitCode: 2, checks: [], errors: [], execution: 'not_started', verificationVerdict: 'not_evaluated' };
  if (!parsed.success) { report.errors.push('invalid_environment_intent'); return report; }
  const intent = parsed.data; report.profileRef = structuredClone(intent.profileRef); report.binding = structuredClone(intent.binding); report.actorRef = structuredClone(intent.actorRef);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) { report.errors.push('preflight_deadline'); return report; }
  let timedOut = false;
  const deadlineAt = performance.now() + timeoutMs;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const cancel = () => controller.abort(); options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const interruptedNow = () => {
    if (performance.now() >= deadlineAt) { timedOut = true; controller.abort(); }
    return controller.signal.aborted;
  };
  const bounded = async (call: () => Promise<unknown>) => {
    if (interruptedNow()) return { kind: 'aborted' as const };
    let abort!: () => void;
    const interrupted = new Promise<{ kind: 'aborted' }>(resolve => { abort = () => resolve({ kind: 'aborted' }); controller.signal.addEventListener('abort', abort, { once: true }); });
    try {
      const result = await Promise.race([interrupted, Promise.resolve().then(() => interruptedNow() ? undefined : call()).then(value => ({ kind: 'value' as const, value }), () => ({ kind: 'failed' as const }))]);
      return interruptedNow() ? { kind: 'aborted' as const } : result;
    } finally { controller.signal.removeEventListener('abort', abort); }
  };
  const interrupted = () => { report.errors.push(timedOut ? 'preflight_deadline' : 'preflight_cancelled'); };
  try {
    const resolved = await bounded(() => ports.resolveProfile(structuredClone(intent.profileRef), controller.signal));
    if (resolved.kind === 'aborted') { interrupted(); return report; }
    if (resolved.kind === 'failed') { report.errors.push('profile_unavailable'); return report; }
    const profileResult = PortableEnvironmentProfile.safeParse(resolved.value);
    if (!profileResult.success) { report.errors.push('invalid_environment_profile'); return report; }
    const profile = profileResult.data;
    if (!verifySelfDigest(profile) || !sameRef(profile.ref, intent.profileRef)) { report.errors.push('profile_identity_mismatch'); return report; }
    if (!sameScope(profile.scope, intent.binding.scope)) { report.errors.push('scope_mismatch'); return report; }
    if (profile.sourceSelectionRef && (!intent.binding.sourceSelectionRef || !sameRef(profile.sourceSelectionRef, intent.binding.sourceSelectionRef))) { report.errors.push('source_binding_mismatch'); return report; }
    if (!profile.allowedReplayModes.includes(intent.replayMode)) { report.errors.push('unsupported_replay_mode'); return report; }
    let validUntil = Infinity;
    for (const request of portableProbeRequests(profile, intent)) {
      if (interruptedNow()) { interrupted(); return report; }
      if (Date.now() >= validUntil) { report.errors.push('preflight_observations_expired'); return report; }
      const required = request.kind !== 'capability' || request.requirement.required;
      const result = await bounded(() => ports.probe(structuredClone(request), structuredClone(intent), controller.signal));
      if (result.kind === 'aborted') { interrupted(); return report; }
      const probe = result.kind === 'value' ? PortableProbeObservation.safeParse(result.value) : null;
      let state: PortableProbeObservation['state'] = 'temporarily_unavailable'; let code = 'probe_unavailable'; let evidenceRefs: Ref[] = [];
      if (probe?.success) {
        const observation = probe.data; const now = Date.now();
        if (!sameRef(observation.profileRef, intent.profileRef) || !sameRef(observation.actorRef, intent.actorRef) ||
          digestOfValue(observation.binding).hex !== digestOfValue(intent.binding).hex ||
          observation.requestDigest.hex !== digestOfValue(request).hex) { state = 'unknown'; code = 'probe_binding_mismatch'; }
        else if (Date.parse(observation.observedAt) > now || Date.parse(observation.expiresAt) <= now || Date.parse(observation.expiresAt) <= Date.parse(observation.observedAt)) {
          state = 'unknown'; code = 'probe_expired_or_future';
        } else if (observation.state === 'supported' && !observation.evidenceRefs.length) { state = 'unknown'; code = 'probe_evidence_missing'; }
        else { state = observation.state; code = state === 'supported' ? 'observed_supported' : `${request.kind}_${state}`; evidenceRefs = observation.evidenceRefs;
          if (required && state === 'supported') validUntil = Math.min(validUntil, Date.parse(observation.expiresAt)); }
      } else if (result.kind === 'value') { state = 'unknown'; code = 'invalid_probe_observation'; }
      report.checks.push({ request, required, state, evidenceRefs: structuredClone(evidenceRefs), code, recovery: state === 'supported' ? 'none' : state === 'denied' ? 'request_owner_authorization' : recovery[request.kind] });
      // Do not inspect credential or target metadata under a denied/unknown actor authorization.
      if (request.kind === 'authorization' && state !== 'supported') return report;
    }
    if (interruptedNow()) { interrupted(); return report; }
    if (Date.now() >= validUntil) { report.errors.push('preflight_observations_expired'); return report; }
    if (report.checks.every(check => !check.required || check.state === 'supported')) { report.status = 'ready'; report.exitCode = 0; }
    return PortablePreflightReport.parse(report);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
