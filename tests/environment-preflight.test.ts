import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PortableEnvironmentProfile, PortableEnvironmentIntent, freeze, digestOfBytes, digestOfValue, type Ref } from '../src/protocol/index.ts';
import { portableEnvironmentTemplate } from '../src/authoring/environmentTemplates.ts';
import { preflightPortableEnvironment, portableProbeRequests } from '../src/core/environmentPreflight.ts';
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
function fixture(mode: 'alongside_runner' | 'external_staging' = 'alongside_runner') {
  const profile = portableEnvironmentTemplate(mode);
  const binding = { campaignId: 'campaign', executionId: 'exec', attemptId: 'attempt', generation: 1,
    requestRef: ref('request'), sourceSelectionRef: profile.sourceSelectionRef, caseRef: ref('case'), personaRef: ref('persona'), targetRef: ref('target'),
    environmentRef: profile.ref, scope: profile.scope };
  const intent = PortableEnvironmentIntent.parse({ schemaVersion: 'workflow.portable-environment-intent/v1', profileRef: profile.ref, binding,
    actorRef: ref('execution-actor'), replayMode: 'fresh_execution', replayPlanRef: null });
  const ports = { resolveProfile: vi.fn(async () => structuredClone(profile)), probe: vi.fn(async (request: unknown) => ({ profileRef: profile.ref,
    binding, actorRef: intent.actorRef, requestDigest: digestOfValue(request), state: 'supported', evidenceRefs: [ref('synthetic-probe-evidence')],
    observedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() })) };
  return { profile, intent, binding, ports };
}
it.each(['alongside_runner', 'external_staging'] as const)('checks a %s profile with no scenario edits or host assumptions (synthetic ports)', async mode => {
  const f = fixture(mode); const report = await preflightPortableEnvironment(f.intent, f.ports);
  expect(report).toMatchObject({ status: 'ready', exitCode: 0, execution: 'not_started', verificationVerdict: 'not_evaluated' });
  expect(report.binding?.caseRef).toEqual(f.binding.caseRef);
  const kinds = report.checks.map(c => c.request.kind);
  expect(kinds).toContain(mode === 'alongside_runner' ? 'startup' : 'deployment');
  expect(kinds).not.toContain(mode === 'alongside_runner' ? 'deployment' : 'startup');
  expect(kinds).toContain('network'); expect(kinds).toContain('limits'); expect(kinds).toContain('cleanup');
  expect(kinds).not.toContain('docker'); // capabilities are requested explicitly; no implicit Docker requirement.
});
it('rejects mutated frozen profiles, scope drift and ambiguous endpoint/network declarations', async () => {
  const f = fixture();
  f.ports.resolveProfile.mockResolvedValue({ ...f.profile, configurationRef: ref('changed') });
  expect((await preflightPortableEnvironment(f.intent, f.ports)).errors).toEqual(['profile_identity_mismatch']);
  f.ports.resolveProfile.mockResolvedValue(f.profile);
  expect((await preflightPortableEnvironment({ ...f.intent, binding: { ...f.binding, scope: { ...f.binding.scope, ownerId: 'foreign' } } }, f.ports)).errors).toEqual(['scope_mismatch']);
  expect(PortableEnvironmentProfile.safeParse({ ...f.profile, endpoints: [...f.profile.endpoints, ...f.profile.endpoints] }).success).toBe(false);
  expect(PortableEnvironmentProfile.safeParse({ ...f.profile, network: { ...f.profile.network, allowedEndpointIds: ['unknown'] } }).success).toBe(false);
  expect((await preflightPortableEnvironment({ ...f.intent, binding: { ...f.binding, sourceSelectionRef: ref('different-source') } }, f.ports)).errors).toEqual(['source_binding_mismatch']);
});
it('stops subsequent metadata probes if earlier authorization expires during preflight', async () => {
  const f = fixture(); const implementation = f.ports.probe.getMockImplementation()!;
  f.ports.probe.mockImplementation(async request => {
    if ((request as {kind: string}).kind === 'authorization') return { ...await implementation(request), expiresAt: new Date(Date.now() + 10).toISOString() };
    await new Promise(resolve => setTimeout(resolve, 20)); return implementation(request);
  });
  const report = await preflightPortableEnvironment(f.intent, f.ports);
  expect(report.errors).toEqual(['preflight_observations_expired']); expect(f.ports.probe).toHaveBeenCalledTimes(2);
});
it('stops before target/credential probing on denied authorization and omits raw errors', async () => {
  const f = fixture(); const implementation = f.ports.probe.getMockImplementation()!;
  f.ports.probe.mockImplementation(async request => ({ ...await implementation(request), state: 'denied' }));
  const report = await preflightPortableEnvironment(f.intent, f.ports);
  expect(report.checks).toHaveLength(1); expect(report.checks[0]).toMatchObject({ code: 'authorization_denied', recovery: 'request_owner_authorization' });
  f.ports.resolveProfile.mockRejectedValue(new Error('Bearer do-not-serialize-this'));
  expect(JSON.stringify(await preflightPortableEnvironment(f.intent, f.ports))).not.toContain('do-not-serialize-this');
});
it('reports missing secret references and separates persona identity from execution actor/permission', async () => {
  const f = fixture(); const implementation = f.ports.probe.getMockImplementation()!;
  f.ports.probe.mockImplementation(async request => ({ ...await implementation(request), state: (request as {kind: string}).kind === 'persona_credential' ? 'missing' : 'supported' }));
  const report = await preflightPortableEnvironment(f.intent, f.ports);
  expect(report).toMatchObject({ status: 'blocked', exitCode: 2 });
  expect(report.checks.find(c => c.request.kind === 'persona_credential')).toMatchObject({ code: 'persona_credential_missing', recovery: 'configure_existing_secret_reference' });
  expect(PortableEnvironmentProfile.safeParse({ ...f.profile, executionSecretRefs: [f.profile.personaCredentials[0]!.secretRef] }).success).toBe(false);
  expect(PortableEnvironmentProfile.safeParse({ ...f.profile, personaCredentials: [{ ...f.profile.personaCredentials[0], value: 'secret' }] }).success).toBe(false);
});
it.each(['binding', 'request', 'actor', 'expiry', 'proof', 'extraSecret'])('fails closed on stale or invalid %s probe observations', async failure => {
  const f = fixture(); const implementation = f.ports.probe.getMockImplementation()!;
  f.ports.probe.mockImplementation(async request => ({ ...await implementation(request),
    ...(failure === 'binding' ? { binding: { ...f.binding, attemptId: 'old' } } : {}),
    ...(failure === 'request' ? { requestDigest: digestOfValue('different') } : {}),
    ...(failure === 'actor' ? { actorRef: ref('other-actor') } : {}),
    ...(failure === 'expiry' ? { expiresAt: '2000-01-01T00:00:00Z' } : {}),
    ...(failure === 'proof' ? { evidenceRefs: [] } : {}),
    ...(failure === 'extraSecret' ? { secret: 'do-not-serialize' } : {}),
  }));
  const report = await preflightPortableEnvironment(f.intent, f.ports);
  expect(report.status).toBe('blocked'); expect(report.checks[0]!.state).toBe('unknown'); expect(JSON.stringify(report)).not.toContain('do-not-serialize');
});
it('reports optional capability omissions while requiring all mandatory policies', async () => {
  const f = fixture(); const profile = PortableEnvironmentProfile.parse(freeze({ ...f.profile,
    capabilities: [{ id: 'browser.chromium', version: 1, required: false }] }));
  f.ports.resolveProfile.mockResolvedValue(profile); const implementation = f.ports.probe.getMockImplementation()!;
  f.ports.probe.mockImplementation(async request => ({ ...await implementation(request), profileRef: profile.ref,
    state: (request as {kind: string}).kind === 'capability' ? 'missing' : 'supported' }));
  const report = await preflightPortableEnvironment({ ...f.intent, profileRef: profile.ref }, f.ports);
  expect(report.status).toBe('ready'); expect(report.checks.find(c => c.request.kind === 'capability')).toMatchObject({ required: false, state: 'missing' });
});
it('bounds ignored cancellation/deadlines and never reports a hanging host as ready', async () => {
  const f = fixture(); f.ports.resolveProfile.mockImplementation(() => new Promise(() => {}));
  expect((await preflightPortableEnvironment(f.intent, f.ports, { timeoutMs: 10 })).errors).toEqual(['preflight_deadline']);
  const abort = new AbortController(); abort.abort();
  expect((await preflightPortableEnvironment(f.intent, f.ports, { signal: abort.signal })).errors).toEqual(['preflight_cancelled']);
});
it('blocks an over-budget microtask chain even before the deadline timer can run', async () => {
  const f = fixture(); const implementation = f.ports.probe.getMockImplementation()!; let elapsed = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  try {
    f.ports.probe.mockImplementation(async request => { elapsed += 4; return implementation(request); });
    const report = await preflightPortableEnvironment(f.intent, f.ports, { timeoutMs: 10 });
    expect(report).toMatchObject({ status: 'blocked', errors: ['preflight_deadline'] });
    expect(f.ports.probe.mock.calls.length).toBeLessThan(portableProbeRequests(f.profile, f.intent).length);
  } finally { clock.mockRestore(); }
});
it('keeps saved evidence playback free from application startup/persona requirements', async () => {
  const f = fixture(); const intent = { ...f.intent, replayMode: 'evidence_playback' as const, replayPlanRef: ref('replay-plan') };
  expect(portableProbeRequests(f.profile, intent).map(r => r.kind)).toEqual(['authorization', 'artifacts', 'limits', 'replay']);
  const report = await preflightPortableEnvironment(intent, f.ports); expect(report.status).toBe('ready');
  expect((await preflightPortableEnvironment({ ...intent, replayMode: 'workflow_history_replay' }, f.ports)).errors).toEqual(['unsupported_replay_mode']);
});
it.each(['alongside_runner', 'external_staging'] as const)('keeps generated %s templates schema-valid and byte-identical', mode => {
  const file = new URL(`../docs/examples/portable-environments/${mode}.json`, import.meta.url);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(portableEnvironmentTemplate(mode));
});
