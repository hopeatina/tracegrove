/**
 * URL host: binds a deployment tracegrove does not launch (staging, preview, a read-only production
 * observer). It proves the deployment is ready, records its declared release as the target identity,
 * establishes persona credentials through resolvers and recipes, and on stop revokes run-owned
 * identities. There is no runtime to hash; the deployment identity is what the bundle records.
 */
import { resolve } from 'node:path';
import { IdentityAttestation, freeze, parseAs } from '../protocol/index.ts';
import { Blocked } from '../core/errors.ts';
import { nowIso } from '../core/clock.ts';
import { getPath } from '../core/reducer.ts';
import { sleep } from '../core/deadline.ts';
import { buildCapabilityObservation, buildLease } from './local.ts';
import { establishPersonas } from './personas.ts';
import { defineHost, type ExecutorHost, type HostCapabilities, type HostSession, type HostStartContext } from './types.ts';

export const URL_CAPABILITIES = {
  supported: ['network_origin:external', 'confirmed_cancel', 'artifact_delivery'],
  unsupported: ['shell', 'file_persistence', 'network_origin:loopback', 'browser_engine', 'native_job', 'mcp_transport'],
} as const satisfies HostCapabilities;

/** Poll the health path until 2xx; distinguish "nothing answered" from "answered, not ready". */
export async function waitDeployment(origin: string, path: string, timeoutMs: number, signal: AbortSignal): Promise<{ body: unknown }> {
  const until = Date.now() + timeoutMs;
  let last: 'unreachable' | number = 'unreachable';
  let pause = 50;
  while (Date.now() < until && !signal.aborted) {
    try {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(5000, Math.max(1, until - Date.now())))]) });
      if (response.ok) { let body: unknown = null; try { body = await response.json(); } catch { body = null; } return { body }; }
      last = response.status; await response.body?.cancel();
    } catch { last = 'unreachable'; }
    await sleep(pause, signal).catch(() => undefined);
    pause = Math.min(pause * 2, 500);
  }
  if (last === 'unreachable') throw new Blocked([{ code: 'deployment_unreachable', detail: `${origin}${path} did not answer within ${timeoutMs} ms`, owner: 'operator', action: 'check the URL, VPN or tunnel, then run tracegrove env doctor' }]);
  throw new Blocked([{ code: 'deployment_not_ready', detail: `${origin}${path} answered ${last}`, owner: 'operator', action: 'wait for the deployment to become healthy, then run tracegrove env doctor' }]);
}

export function observedRelease(binding: NonNullable<HostStartContext['hostPlan']['binding']>, origin: string, body: unknown): string {
  if (!binding.identity.field) return binding.identity.expect ?? `url:${origin}`;
  const found = getPath({ body }, `body.${binding.identity.field}`);
  return found.present && (typeof found.value === 'string' || typeof found.value === 'number') ? String(found.value) : `missing:${binding.identity.field}`;
}

export class UrlHost implements ExecutorHost {
  async start(context: HostStartContext): Promise<HostSession> {
    const binding = context.hostPlan.binding;
    if (!binding || binding.kind !== 'url' || !binding.origin) throw new Blocked([{ code: 'host_binding_missing', detail: context.hostPlan.ref.id, owner: 'developer', action: 'compile the project with --env <name> for a url environment' }]);
    const origin = binding.origin.replace(/\/$/, '');
    const { body } = await waitDeployment(origin, binding.readiness.path, binding.readiness.timeoutMs, context.signal);
    const release = observedRelease(binding, origin, body);
    if (binding.identity.expect && release !== binding.identity.expect) throw new Blocked([{ code: 'identity_mismatch', detail: `${origin} reports ${binding.identity.field ?? 'release'} ${release}; environment ${binding.environment} expects ${binding.identity.expect}`, owner: 'operator', action: `redeploy ${binding.identity.expect}, or update target.release.expect` }]);
    const personas = await establishPersonas({ binding, origin, requested: context.credentialNames, root: resolve(context.projectRoot, binding.projectRoot), runId: context.executionId, signal: context.signal, hostId: context.hostPlan.ref.id });
    const lease = buildLease(context, null);
    const attestation = parseAs(IdentityAttestation, freeze({
      schemaVersion: 'workflow.identity-attestation/v1' as const,
      ref: { id: `${context.executionId}.attestation.app`, revision: '1' },
      scope: context.scope, componentId: 'app', kind: 'application' as const,
      identity: { kind: 'declared_release' as const, release },
      issuer: 'declared_binding' as const, trustPolicy: 'operator_declared_unverified' as const,
      evidence: { files: [], observedHealthBody: (body ?? null) as never },
      observedAt: nowIso(),
    }), 'deployment attestation');
    const observation = buildCapabilityObservation({ hostPlanRef: context.hostPlan.ref, leaseRef: lease.ref, scope: context.scope, executionId: context.executionId,
      supported: [...URL_CAPABILITIES.supported], unsupported: [...URL_CAPABILITIES.unsupported] });
    let stopped: Promise<{ confirmed: boolean; detail: string }> | null = null;
    return {
      origin, lease, observation, attestations: [attestation], credentials: new Map(), requestCredentials: personas.credentials,
      endpoints: binding.endpoints, boundaryMode: 'real', interceptorRefs: [], dataDir: null,
      accountClass: binding.writes === 'none' ? 'designated_production' : 'test_sandbox',
      // The session owns its lease (released on stop) and any identities it minted (revoked on stop).
      ownedResources: [{ entityKey: 'host.session', physicalId: lease.ref.id, boundaryId: 'execution' }, ...personas.owned], credentialRecords: personas.records,
      credentialCheck: (name, signal) => personas.check(name, signal),
      requestBudget: binding.budget?.maxRequests ?? null,
      allowedMethods: binding.writes === 'none' ? ['GET', 'HEAD'] : null,
      stop(reason) {
        stopped ??= personas.release(AbortSignal.timeout(15_000)).then(result => ({ confirmed: result.confirmed, detail: `${reason}; ${result.detail}` }));
        return stopped;
      },
    };
  }
}

export const urlHost = defineHost({ kind: 'url', capabilities: URL_CAPABILITIES, create: () => new UrlHost() });
