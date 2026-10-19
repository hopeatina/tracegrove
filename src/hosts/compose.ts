/**
 * Compose host: brings a compose project up under a run-owned project name, reads the service's
 * published port, injects host-issued tokens through the compose client's environment, attests the
 * compose definition digest it launched, and confirms `down` left no container of that project.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Blocked, Conflict } from '../core/errors.ts';
import { buildCapabilityObservation, buildLease } from './local.ts';
import { DOCKER_CAPABILITIES, attestRelease, hostIssuedTokens } from './container.ts';
import { waitDeployment } from './url.ts';
import { dockerCli, dockerName, loopbackOrigin, must, requireDocker, type DockerCli } from './docker.ts';
import { defineHost, type ExecutorHost, type HostSession, type HostStartContext } from './types.ts';
import { InfrastructureFailure } from '../core/errors.ts';

export const composeDigest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

export class ComposeHost implements ExecutorHost {
  constructor(private readonly cli: DockerCli = dockerCli()) {}
  async start(context: HostStartContext): Promise<HostSession> {
    const binding = context.hostPlan.binding;
    if (!binding?.compose) throw new Blocked([{ code: 'host_binding_missing', detail: context.hostPlan.ref.id, owner: 'developer', action: 'compile with --env <compose environment>' }]);
    const spec = binding.compose;
    const file = resolve(context.projectRoot, binding.projectRoot, spec.file);
    const digest = composeDigest(file);
    if (digest !== spec.fileDigest) throw new Conflict(`compose file ${spec.file} changed after planning; plan again`);
    await requireDocker(this.cli, context.signal, true);
    const { credentials, tokenMap } = hostIssuedTokens(context);
    const project = dockerName('tg', context.executionId, randomUUID().slice(0, 8)).replace(/[^a-z0-9_-]/g, '');
    const base = ['compose', '-p', project, '-f', file];
    const env = { [spec.tokensEnv]: JSON.stringify(tokenMap) };
    const stop = async (reason: string) => {
      await this.cli.run([...base, 'down', '-v', '--remove-orphans', '--timeout', '5'], { env, timeoutMs: 120_000 });
      const left = await this.cli.run(['ps', '-a', '-q', '--filter', `label=com.docker.compose.project=${project}`], { timeoutMs: 15_000 });
      const confirmed = left.code === 0 && left.stdout.trim() === '';
      if (confirmed) rmSync(context.workspaceDir, { recursive: true, force: true });
      return { confirmed, detail: `${reason}; compose project ${project} ${confirmed ? 'removed' : 'still has containers'}` };
    };
    try {
      await must(this.cli, [...base, 'up', '-d', '--remove-orphans'], 'docker compose up', { env, timeoutMs: 600_000, signal: context.signal });
      const origin = loopbackOrigin(await must(this.cli, [...base, 'port', spec.service, String(spec.port)], 'docker compose port', { env }));
      let body: unknown;
      try { body = (await waitDeployment(origin, binding.readiness.path, binding.readiness.timeoutMs, context.signal)).body; }
      catch (error) {
        if (!(error instanceof Blocked)) throw error;
        const logs = await this.cli.run([...base, 'logs', '--tail', '20', spec.service], { env, timeoutMs: 15_000 });
        throw new InfrastructureFailure(`compose service ${spec.service} did not become ready at ${origin}${binding.readiness.path}; last output:\n${logs.stdout.split('\n').slice(-8).join('\n')}`);
      }
      const ids = await must(this.cli, ['ps', '-q', '--filter', `label=com.docker.compose.project=${project}`], 'docker ps');
      const lease = buildLease(context, null);
      const observation = buildCapabilityObservation({ hostPlanRef: context.hostPlan.ref, leaseRef: lease.ref, scope: context.scope, executionId: context.executionId, supported: [...DOCKER_CAPABILITIES.supported], unsupported: [...DOCKER_CAPABILITIES.unsupported] });
      let stopped: ReturnType<typeof stop> | null = null;
      return { origin, lease, observation, attestations: [await attestRelease(context, `compose:${digest}`, body)], credentials, boundaryMode: 'real', interceptorRefs: [], dataDir: null,
        ownedResources: [{ entityKey: 'host.compose', physicalId: project, boundaryId: 'application' }, ...ids.split('\n').filter(Boolean).map((id, i) => ({ entityKey: `host.container.${i}`, physicalId: id, boundaryId: 'application' }))],
        stop: (reason) => (stopped ??= stop(reason)) };
    } catch (error) {
      credentials.clear();
      await stop('startup failed').catch(() => undefined);
      throw error;
    }
  }
}

export const composeHost = defineHost({ kind: 'compose', capabilities: DOCKER_CAPABILITIES, create: () => new ComposeHost() });
