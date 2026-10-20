/**
 * Container host: runs one image with a fresh name, publishes its port on loopback, injects
 * host-issued persona tokens through the Docker client's environment (never argv or a file), attests
 * the image ID it observed, and confirms on stop that the container is gone.
 */
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { IdentityAttestation, freeze, parseAs } from '../protocol/index.ts';
import { Blocked, InfrastructureFailure } from '../core/errors.ts';
import { nowIso } from '../core/clock.ts';
import { issueHostCredentials } from '../credentials/resolvers/hostIssued.ts';
import { buildCapabilityObservation, buildLease } from './local.ts';
import { waitDeployment } from './url.ts';
import { dockerCli, dockerName, loopbackOrigin, must, requireDocker, type DockerCli } from './docker.ts';
import { defineHost, type ExecutorHost, type HostCapabilities, type HostSession, type HostStartContext } from './types.ts';

export const DOCKER_CAPABILITIES = {
  supported: ['network_origin:loopback', 'confirmed_cancel', 'artifact_delivery', 'container'],
  unsupported: ['shell', 'file_persistence', 'browser_engine', 'native_job', 'mcp_transport'],
} as const satisfies HostCapabilities;

export function hostIssuedTokens(context: HostStartContext) {
  const binding = context.hostPlan.binding!;
  const issued = binding.personas.filter(p => p.from === 'host_issued').map(p => ({ name: p.credentialName, subject: p.subject ?? p.persona }));
  return issueHostCredentials(issued, context.credentialNames, context.hostPlan.ref.id);
}

export async function attestRelease(context: HostStartContext, release: string, body: unknown): Promise<IdentityAttestation> {
  return parseAs(IdentityAttestation, freeze({
    schemaVersion: 'workflow.identity-attestation/v1' as const,
    ref: { id: `${context.executionId}.attestation.app`, revision: '1' }, scope: context.scope, componentId: 'app', kind: 'application' as const,
    identity: { kind: 'declared_release' as const, release }, issuer: 'declared_binding' as const, trustPolicy: 'operator_declared_unverified' as const,
    evidence: { files: [], observedHealthBody: (body ?? null) as never }, observedAt: nowIso(),
  }), 'container attestation');
}

async function readyOrFail(origin: string, context: HostStartContext, logs: () => Promise<string>): Promise<unknown> {
  const binding = context.hostPlan.binding!;
  try { return (await waitDeployment(origin, binding.readiness.path, binding.readiness.timeoutMs, context.signal)).body; }
  catch (error) {
    if (!(error instanceof Blocked)) throw error;
    throw new InfrastructureFailure(`the app did not become ready at ${origin}${binding.readiness.path}; last output:\n${(await logs().catch(() => '')).split('\n').slice(-8).join('\n')}`);
  }
}

export class ContainerHost implements ExecutorHost {
  constructor(private readonly cli: DockerCli = dockerCli()) {}
  async start(context: HostStartContext): Promise<HostSession> {
    const binding = context.hostPlan.binding;
    if (!binding?.container) throw new Blocked([{ code: 'host_binding_missing', detail: context.hostPlan.ref.id, owner: 'developer', action: 'compile with --env <container environment>' }]);
    const spec = binding.container;
    await requireDocker(this.cli, context.signal);
    const { credentials, tokenMap } = hostIssuedTokens(context);
    const name = dockerName('tg', context.executionId, randomUUID().slice(0, 8));
    const env = { ...spec.env, [spec.tokensEnv]: JSON.stringify(tokenMap) };
    let id: string | null = null;
    const stop = async (reason: string) => {
      await this.cli.run(['rm', '-f', '-v', name], { timeoutMs: 30_000 });
      const left = await this.cli.run(['ps', '-a', '-q', '--filter', `name=^${name}$`], { timeoutMs: 15_000 });
      const confirmed = left.code === 0 && left.stdout.trim() === '';
      if (confirmed) rmSync(context.workspaceDir, { recursive: true, force: true });
      return { confirmed, detail: `${reason}; container ${name} ${confirmed ? 'removed' : 'still present'}` };
    };
    try {
      id = await must(this.cli, ['run', '-d', '--name', name, '--label', `tracegrove.execution=${context.executionId}`, '-p', `127.0.0.1::${spec.port}`, ...Object.keys(env).flatMap(k => ['-e', k]), spec.image], 'docker run', { env, timeoutMs: 300_000, signal: context.signal });
      const origin = loopbackOrigin(await must(this.cli, ['port', name, `${spec.port}/tcp`], 'docker port'));
      const body = await readyOrFail(origin, context, () => must(this.cli, ['logs', '--tail', '20', name], 'docker logs'));
      const image = await must(this.cli, ['inspect', '--format', '{{.Image}}', name], 'docker inspect');
      if (binding.identity.expect && `image:${image}` !== binding.identity.expect) throw new Blocked([{ code: 'identity_mismatch', detail: `container ${name} runs image:${image}; the plan expects ${binding.identity.expect}`, owner: 'developer', action: `rebuild or retag ${spec.image}, then compile again` }]);
      const lease = buildLease(context, null);
      const observation = buildCapabilityObservation({ hostPlanRef: context.hostPlan.ref, leaseRef: lease.ref, scope: context.scope, executionId: context.executionId, supported: [...DOCKER_CAPABILITIES.supported], unsupported: [...DOCKER_CAPABILITIES.unsupported] });
      let stopped: ReturnType<typeof stop> | null = null;
      return { origin, lease, observation, attestations: [await attestRelease(context, `image:${image}`, body)], credentials, boundaryMode: 'real', interceptorRefs: [], dataDir: null,
        ownedResources: [{ entityKey: 'host.container', physicalId: id.slice(0, 64), boundaryId: 'application' }],
        stop: (reason) => (stopped ??= stop(reason)) };
    } catch (error) {
      credentials.clear();
      await stop('startup failed').catch(() => undefined);
      throw error;
    }
  }
}

export const containerHost = defineHost({ kind: 'container', capabilities: DOCKER_CAPABILITIES, create: () => new ContainerHost() });
