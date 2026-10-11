/**
 * Local process ExecutorHost: launches the pinned application with a fresh port, data
 * directory and issued credentials; attests the actual source identity independently of
 * anything the application says about itself; confirms termination on stop.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { HostCapabilityObservation, HostLease, IdentityAttestation, digestOfBytes, freeze, parseAs, sha256Hex } from '../protocol/index.ts';
import { Deadline, sleep } from '../core/deadline.ts';
import { InfrastructureFailure, Blocked } from '../core/errors.ts';
import { isoPlusMs, nowIso } from '../core/clock.ts';
import type { ExecutorHost, HostSession, HostStartContext } from './types.ts';

export function sourceIdentityDigest(root: string, files: string[]): { hex: string; entries: Array<{ path: string; sha256: string }> } {
  const entries = [...files].sort().map((rel) => {
    const abs = resolve(root, rel);
    const relToRoot = relative(root, abs);
    if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) throw new Blocked([{ code: 'identity_file_outside_root', detail: rel }]);
    if (!existsSync(abs)) throw new Blocked([{ code: 'identity_file_missing', detail: rel, owner: 'operator', action: 'materialize the pinned source before launching' }]);
    return { path: rel, sha256: sha256Hex(readFileSync(abs)) };
  });
  const combined = entries.map((e) => `${e.path}\n${e.sha256}\n`).join('');
  return { hex: digestOfBytes(combined).hex, entries };
}

export function buildCapabilityObservation(input: { hostPlanRef: HostLease['hostPlanRef']; leaseRef: HostLease['ref'] | null; scope: HostStartContext['scope']; executionId: string; supported: string[]; unsupported: string[] }): HostCapabilityObservation {
  const capabilities = [
    ...input.supported.map((capability) => ({ capability, state: 'supported' as const, probe: 'probed' as const, evidenceRefs: [] })),
    ...input.unsupported.map((capability) => ({ capability, state: 'unsupported' as const, probe: 'probed' as const, evidenceRefs: [] })),
  ];
  return parseAs(HostCapabilityObservation, freeze({
    schemaVersion: 'workflow.host-observation/v1' as const,
    ref: { id: `${input.executionId}.host-observation`, revision: '1' },
    scope: input.scope,
    hostPlanRef: input.hostPlanRef,
    hostLeaseRef: input.leaseRef,
    capabilities,
    observedAt: nowIso(),
    expiresAt: isoPlusMs(10 * 60 * 1000),
  }), 'host observation');
}

export function buildLease(context: HostStartContext, pid: number | null): HostLease {
  return parseAs(HostLease, freeze({
    schemaVersion: 'workflow.host-lease/v1' as const,
    ref: { id: `${context.executionId}.host-lease`, revision: String(context.generation) },
    scope: context.scope,
    hostPlanRef: context.hostPlan.ref,
    campaignId: context.campaignId, executionId: context.executionId, attemptId: context.attemptId, generation: context.generation,
    actorId: context.actorId,
    observedWorkspaceIdentityRef: null,
    observedRuntimeIdentity: { node: process.version, platform: process.platform, arch: process.arch, pid },
    sessionHandleRef: null,
    issuedAt: nowIso(),
    expiresAt: isoPlusMs(context.hostPlan.sessionLifetimeMs),
  }), 'host lease');
}

async function waitReady(origin: string, path: string, deadline: Deadline, signal: AbortSignal): Promise<unknown> {
  while (!deadline.expired()) {
    try {
      const response = await fetch(`${origin}${path}`, { signal: deadline.child(2000).signal(signal) });
      if (response.ok) { try { return await response.json(); } catch { return null; } }
    } catch { /* not ready yet */ }
    await sleep(100, signal);
  }
  throw new InfrastructureFailure(`application did not become ready at ${origin}${path} within the readiness timeout`);
}

export class LocalProcessHost implements ExecutorHost {
  async start(context: HostStartContext): Promise<HostSession> {
    if (process.platform === 'win32') throw new Blocked([{ code: 'local_process_tree_unsupported', detail: 'the local host requires POSIX process-group termination' }]);
    const launch = context.hostPlan.launch;
    if (!launch) throw new Blocked([{ code: 'host_launch_missing', detail: context.hostPlan.ref.id }]);
    const cwd = resolve(context.projectRoot, launch.cwd);
    const identity = sourceIdentityDigest(cwd, launch.identitySourceFiles);
    const dataDir = join(context.workspaceDir, 'data');
    mkdirSync(dataDir, { recursive: true });
    const credentials = new Map<string, string>();
    const tokenMap: Record<string, string> = {};
    for (const issued of launch.issuedCredentials) {
      if (!context.credentialNames.includes(issued.name)) continue;
      const secret = randomBytes(24).toString('base64url');
      credentials.set(issued.name, secret);
      tokenMap[secret] = issued.subject;
    }
    for (const name of context.credentialNames) {
      if (!credentials.has(name)) throw new Blocked([{ code: 'credential_not_issuable', detail: `host ${context.hostPlan.ref.id} cannot issue ${name}`, owner: 'operator', action: 'declare the credential in the launch recipe' }]);
    }
    const env: Record<string, string> = { ...launch.env, PATH: process.env.PATH ?? '', [launch.portEnv]: '0', [launch.dataDirEnv]: dataDir, [launch.credentialsEnv]: JSON.stringify(tokenMap) };
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
    const child: ChildProcess = fork(new URL(`./localSupervisor.${extension}`, import.meta.url), [], {
      cwd, env: { PATH: process.env.PATH ?? '' }, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let ownedCleanupConfirmed = false;
    child.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'host.cleaned') ownedCleanupConfirmed = true;
    });
    // Candidate output may contain credentials. Drain it without exporting it as proof.
    child.stderr?.resume();
    try {
    const port = await new Promise<number>((resolvePort, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new InfrastructureFailure(`application did not report a port within ${launch.readiness.timeoutMs} ms`)), launch.readiness.timeoutMs);
      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const match = buffer.match(/listening (\d+)/);
        if (match) { clearTimeout(timer); resolvePort(Number(match[1])); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new InfrastructureFailure(`application exited before listening (code ${code})`)); });
      child.on('error', (error) => { clearTimeout(timer); reject(new InfrastructureFailure(`failed to spawn ${launch.command}: ${error.message}`)); });
      child.send({ command: launch.command, args: launch.args, cwd, env, workspaceDir: context.workspaceDir });
    });
    const origin = `http://127.0.0.1:${port}`;
    const healthBody = await waitReady(origin, launch.readiness.path, Deadline.in(launch.readiness.timeoutMs), context.signal);
    const lease = buildLease(context, child.pid ?? null);
    const attestation = parseAs(IdentityAttestation, freeze({
      schemaVersion: 'workflow.identity-attestation/v1' as const,
      ref: { id: `${context.executionId}.attestation.${launch.componentId}`, revision: '1' },
      scope: context.scope,
      componentId: launch.componentId,
      kind: 'application' as const,
      identity: { kind: 'source_digest' as const, sourceDigest: { algorithm: 'sha256' as const, hex: identity.hex }, runtime: `node${process.versions.node.split('.')[0]}` },
      issuer: 'local_launcher' as const,
      trustPolicy: 'launcher_computed_source_digest' as const,
      evidence: { files: identity.entries, observedHealthBody: (healthBody ?? null) as never },
      observedAt: nowIso(),
    }), 'identity attestation');
    const observation = buildCapabilityObservation({
      hostPlanRef: context.hostPlan.ref, leaseRef: lease.ref, scope: context.scope, executionId: context.executionId,
      supported: ['shell', 'network_origin:loopback', 'confirmed_cancel', 'artifact_delivery', 'file_persistence'],
      unsupported: ['browser_engine', 'dom_cdp', 'screenshot', 'video_export', 'native_desktop', 'device:ios', 'device:android', 'mcp_transport', 'widget_host'],
    });
    let stopResult: Promise<{ confirmed: boolean; detail: string }> | null = null;
    const session: HostSession = {
      origin, lease, observation, attestations: [attestation], credentials,
      boundaryMode: 'real', interceptorRefs: [],
      ownedResources: [
        { entityKey: 'host.process', physicalId: String(child.pid ?? 'unknown'), boundaryId: 'application' },
        { entityKey: 'host.workspace', physicalId: context.workspaceDir, boundaryId: 'storage' },
      ],
      dataDir,
      stop(reason: string) {
        if (stopResult) return stopResult;
        stopResult = (async () => {
        const exited = new Promise<boolean>((resolveExit) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolveExit(true);
          child.once('exit', () => resolveExit(true));
        });
        child.kill('SIGTERM');
        const graceful = await Promise.race([exited, sleep(5000).then(() => false)]);
        if (!graceful && child.connected) child.disconnect();
        if (!graceful) await Promise.race([exited, sleep(2000).then(() => false)]);
        const confirmed = ownedCleanupConfirmed && (child.exitCode !== null || child.signalCode !== null);
        if (confirmed) rmSync(context.workspaceDir, { recursive: true, force: true });
        const workspaceGone = !existsSync(context.workspaceDir);
        return { confirmed: confirmed && workspaceGone, detail: `${reason}; process ${confirmed ? 'exited' : 'still running'}; workspace ${workspaceGone ? 'removed' : 'remains'}` };
        })();
        return stopResult;
      },
    };
    if (context.signal.aborted) { await session.stop('cancelled during start'); throw new InfrastructureFailure('cancelled during host start'); }
    return session;
    } catch (error) {
      // Disconnect lets the trusted owner kill its application group and remove
      // the owned workspace, including when startup failed before readiness.
      if (child.connected) child.disconnect();
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((done) => {
          const timeout = setTimeout(done, context.hostPlan.cleanupReserveMs);
          child.once('exit', () => { clearTimeout(timeout); done(); });
        });
      }
      credentials.clear();
      if (child.exitCode !== null || child.signalCode !== null) rmSync(context.workspaceDir, { recursive: true, force: true });
      throw error;
    }
  }
}
