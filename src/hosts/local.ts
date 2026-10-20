/**
 * Local process ExecutorHost: launches the pinned application with a fresh port, data
 * directory and issued credentials; attests the actual source identity independently of
 * anything the application says about itself; confirms termination on stop.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HostCapabilityObservation, HostLease, IdentityAttestation, digestOfValue, freeze, parseAs, sameRef, sameScope, verifySelfDigest, type LaunchRecipe, type GitCommitObservation } from '../protocol/index.ts';
import { verifyGitSnapshotProofMetadata } from '../source/gitObjectProof.ts';
import { Deadline, sleep } from '../core/deadline.ts';
import { InfrastructureFailure, Blocked } from '../core/errors.ts';
import { isoPlusMs, nowIso } from '../core/clock.ts';
import type { ExecutorHost, HostSession, HostStartContext } from './types.ts';
import { observeApplicationRuntime } from './runtime.ts';
import { SnapshotLaunchObservation, SnapshotLaunchFailure, identityFromEntries, sourceIdentityDigest } from './sourceIdentity.ts';
import { NativeJobDriver } from '../adapters/job/driver.ts';
import { startTrafficProxy, type TrafficRecorder } from './trafficProxy.ts';
export { sourceIdentityDigest } from './sourceIdentity.ts';

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

/** Reserve a free loopback port. The app binds it moments later; a race is reported as a startup failure. */
export function freeLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolvePort(port) : reject(new InfrastructureFailure('could not reserve a loopback port'))));
    });
  });
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replace(/\{(port|dataDir)\}/g, (_m, name: string) => values[name]!);
}

async function waitReady(origin: string, path: string, deadline: Deadline, signal: AbortSignal): Promise<unknown> {
  // Most apps are ready within tens of milliseconds; back off from 10 ms so a fixed 100 ms tick is not paid per case.
  let pause = 10;
  while (!deadline.expired()) {
    try {
      const response = await fetch(`${origin}${path}`, { signal: deadline.child(2000).signal(signal) });
      if (response.ok) { try { return await response.json(); } catch { return null; } }
    } catch { /* not ready yet */ }
    await sleep(pause, signal);
    pause = Math.min(pause * 2, 100);
  }
  throw new InfrastructureFailure(`application did not become ready at ${origin}${path} within the readiness timeout`, 'app_not_ready');
}

export class LocalProcessHost implements ExecutorHost {
  async start(context: HostStartContext): Promise<HostSession> {
    if (process.platform === 'win32') throw new Blocked([{ code: 'local_process_tree_unsupported', detail: 'the local host requires POSIX process-group termination' }]);
    const launch = context.hostPlan.launch;
    if (!launch) throw new Blocked([{ code: 'host_launch_missing', detail: context.hostPlan.ref.id }]);
    const cwd = resolve(context.projectRoot, launch.cwd);
    if (launch.sourceSnapshot && (!verifySelfDigest(launch.sourceSnapshot.snapshot) || !sameScope(launch.sourceSnapshot.snapshot.scope, context.scope))) {
      throw new Blocked([{ code: 'snapshot_scope_or_digest_mismatch', detail: 'The launch snapshot must match the admitted local owner and sealed manifest' }]);
    }
    let identity = sourceIdentityDigest(cwd, launch.identitySourceFiles);
    let observedSnapshotRef: SnapshotLaunchObservation['snapshotRef'] | undefined;
    let observedGitSource: GitCommitObservation | undefined;
    const runtime = await observeApplicationRuntime(launch.command, cwd, process.env.PATH ?? '', context.signal);
    if (launch.nativeJobs && runtime.family !== 'node') throw new Blocked([{ code: 'native_job_runtime_unsupported', detail: 'The native job bridge requires a Node application' }]);
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
    const assigned = launch.portMode === 'assigned';
    const assignedPort = assigned ? await freeLoopbackPort() : 0;
    const values = { port: String(assignedPort), dataDir };
    const launchEnv = assigned ? Object.fromEntries(Object.entries(launch.env).map(([k, v]) => [k, substitute(v, values)])) : launch.env;
    const launchArgs = assigned ? launch.args.map((arg) => substitute(arg, values)) : launch.args;
    const env: Record<string, string> = { ...launchEnv, ...(launch.nativeJobs ? { TRACEGROVE_NATIVE_JOBS: launch.nativeJobs } : {}), PATH: process.env.PATH ?? '', ...(assigned && process.env.HOME ? { HOME: process.env.HOME } : {}), [launch.portEnv]: String(assignedPort), [launch.dataDirEnv]: dataDir, [launch.credentialsEnv]: JSON.stringify(tokenMap) };
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
    const child: ChildProcess = fork(new URL(`./localSupervisor.${extension}`, import.meta.url), [], {
      cwd, env: { PATH: process.env.PATH ?? '' }, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const nativeJobs = launch.nativeJobs ? new NativeJobDriver(child) : undefined;
    let ownedCleanupConfirmed = false;
    child.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'host.cleaned') ownedCleanupConfirmed = true;
    });
    const sourceObservation = launch.sourceSnapshot ? new Promise<SnapshotLaunchObservation>((resolveSource, reject) => {
      const failed = (stage: string) => { cleanup(); reject(new Blocked([{ code: 'snapshot_source_unavailable', detail: 'The supervisor could not verify the pinned source tree' }, { code: `snapshot_preparation_${stage}`, detail: 'Pinned source preparation did not complete' }])); };
      const exited = () => failed('owner_exit');
      const timer = setTimeout(() => failed('timeout'), launch.readiness.timeoutMs);
      const onMessage = (message: unknown) => {
        const failure = SnapshotLaunchFailure.safeParse(message);
        if (failure.success) return failed(failure.data.stage);
        const parsed = SnapshotLaunchObservation.safeParse(message);
        if (!parsed.success) return;
        if (!sameRef(parsed.data.snapshotRef, launch.sourceSnapshot!.snapshot.ref) || identityFromEntries(parsed.data.identity.entries).hex !== parsed.data.identity.hex) return failed('observation');
        try {
          const expected = launch.sourceSnapshot!.snapshot.commitProof ? { ...verifyGitSnapshotProofMetadata(launch.sourceSnapshot!.snapshot).binding, verification: 'actual_file_bytes' } : undefined;
          if (digestOfValue(parsed.data.gitSource ?? null).hex !== digestOfValue(expected ?? null).hex) return failed('objects');
        } catch { return failed('objects'); }
        cleanup(); resolveSource(parsed.data);
      };
      const cleanup = () => { clearTimeout(timer); child.off('message', onMessage); child.off('exit', exited); child.off('error', exited); };
      child.on('message', onMessage); child.once('exit', exited); child.once('error', exited);
    }) : null;
    sourceObservation?.catch(() => undefined);
    const sourceLaunch: Pick<LaunchRecipe, 'sourceSnapshot' | 'nativeJobs'> = launch.sourceSnapshot ? {
      sourceSnapshot: { ...launch.sourceSnapshot, root: resolve(context.projectRoot, launch.sourceSnapshot.root) },
    } : {};
    if (launch.nativeJobs) sourceLaunch.nativeJobs = launch.nativeJobs;
    // Candidate output may contain credentials. Drain it without exporting it as proof; keep a
    // short, secret-redacted tail only to explain a startup failure.
    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4096); });
    const startupHint = () => {
      let text = stderrTail;
      for (const secret of credentials.values()) text = text.split(secret).join('<redacted>');
      const lines = text.trim().split('\n').slice(-8).join('\n');
      return lines ? `; last app output:\n${lines}` : '';
    };
    let traffic: TrafficRecorder | undefined;
    try {
    const port = assigned ? await new Promise<number>((resolvePort, reject) => {
      // No stdout protocol: drain output and let readiness polling decide.
      child.stdout?.resume();
      child.on('exit', (code) => reject(new InfrastructureFailure(`application exited before becoming ready (code ${code})`, 'app_exited_early')));
      child.on('error', (error) => reject(new InfrastructureFailure(`failed to spawn ${launch.command}: ${error.message}`, 'app_spawn_failed')));
      child.send({ command: runtime.executable, args: launchArgs, cwd, env, workspaceDir: context.workspaceDir, identitySourceFiles: launch.identitySourceFiles, runtimeFamily: runtime.family, ...sourceLaunch });
      resolvePort(assignedPort);
    }) : await new Promise<number>((resolvePort, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new InfrastructureFailure(`application did not report a port within ${launch.readiness.timeoutMs} ms`, 'app_port_not_reported')), launch.readiness.timeoutMs);
      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const match = buffer.match(/listening (\d+)/);
        if (match) { clearTimeout(timer); resolvePort(Number(match[1])); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new InfrastructureFailure(`application exited before listening (code ${code})`, 'app_exited_early')); });
      child.on('error', (error) => { clearTimeout(timer); reject(new InfrastructureFailure(`failed to spawn ${launch.command}: ${error.message}`, 'app_spawn_failed')); });
      child.send({ command: runtime.executable, args: launch.args, cwd, env, workspaceDir: context.workspaceDir, identitySourceFiles: launch.identitySourceFiles, runtimeFamily: runtime.family, ...sourceLaunch });
    });
    const origin = `http://127.0.0.1:${port}`;
    const stopPolling = new AbortController();
    const exitedEarly = assigned ? new Promise<never>((_, reject) => {
      // Give the last stderr bytes a moment to arrive, reject, then stop the readiness poll.
      const onExit = () => { setTimeout(() => { reject(new InfrastructureFailure(`application exited before becoming ready${startupHint()}`, 'app_exited_early')); stopPolling.abort(); }, 50); };
      if (child.exitCode !== null) onExit(); else child.once('exit', onExit);
    }) : null;
    exitedEarly?.catch(() => undefined);
    const ready = waitReady(origin, launch.readiness.path, Deadline.in(launch.readiness.timeoutMs), AbortSignal.any([context.signal, stopPolling.signal]));
    ready.catch(() => undefined);
    let healthBody: unknown;
    try {
      const [health, source] = await Promise.all([exitedEarly ? Promise.race([ready, exitedEarly]) : ready, sourceObservation,
        nativeJobs?.waitReady(Deadline.in(launch.readiness.timeoutMs), context.signal)]);
      healthBody = health;
      if (source) { identity = source.identity; observedSnapshotRef = source.snapshotRef; observedGitSource = source.gitSource; }
    }
    catch (error) {
      stopPolling.abort();
      if (assigned && error instanceof InfrastructureFailure && !error.message.includes('last app output')) throw new InfrastructureFailure(`${error.message}${startupHint()}`, error.code);
      throw error;
    }
    // Steps and browser pages reach the app through a recording proxy; readiness polled the app directly.
    traffic = await startTrafficProxy(port);
    const recorder = traffic;
    const lease = buildLease(context, child.pid ?? null);
    const attestation = parseAs(IdentityAttestation, freeze({
      schemaVersion: 'workflow.identity-attestation/v1' as const,
      ref: { id: `${context.executionId}.attestation.${launch.componentId}`, revision: '1' },
      scope: context.scope,
      componentId: launch.componentId,
      kind: 'application' as const,
      identity: { kind: 'source_digest' as const, sourceDigest: { algorithm: 'sha256' as const, hex: identity.hex }, runtime: runtime.runtime },
      issuer: 'local_launcher' as const,
      trustPolicy: 'launcher_computed_source_digest' as const,
      evidence: { files: identity.entries, runtimeProbe: runtime, observedHealthBody: (healthBody ?? null) as never,
        ...(observedSnapshotRef ? { sourceSnapshotRef: observedSnapshotRef } : {}), ...(observedGitSource ? { gitSource: observedGitSource } : {}) },
      observedAt: nowIso(),
    }), 'identity attestation');
    const observation = buildCapabilityObservation({
      hostPlanRef: context.hostPlan.ref, leaseRef: lease.ref, scope: context.scope, executionId: context.executionId,
      supported: ['shell', 'network_origin:loopback', 'confirmed_cancel', 'artifact_delivery', 'file_persistence', ...(nativeJobs ? ['native_job'] : [])],
      unsupported: ['browser_engine', 'dom_cdp', 'screenshot', 'video_export', 'native_desktop', 'device:ios', 'device:android', 'mcp_transport', 'widget_host'],
    });
    let stopResult: Promise<{ confirmed: boolean; detail: string }> | null = null;
    const session: HostSession = {
      origin: recorder.origin, traffic: recorder, lease, observation, attestations: [attestation], credentials,
      boundaryMode: 'real', interceptorRefs: [],
      ownedResources: [
        { entityKey: 'host.process', physicalId: String(child.pid ?? 'unknown'), boundaryId: 'application' },
        { entityKey: 'host.workspace', physicalId: context.workspaceDir, boundaryId: 'storage' },
      ],
      dataDir,
      ...(nativeJobs ? { nativeJobs } : {}),
      stop(reason: string) {
        if (stopResult) return stopResult;
        stopResult = (async () => {
        await recorder.close().catch(() => undefined);
        const exited = new Promise<boolean>((resolveExit) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolveExit(true);
          child.once('exit', () => resolveExit(true));
        });
        child.kill('SIGTERM');
        // Abort the losing timer so a prompt exit does not keep the CLI alive for the full grace period.
        const waitFor = async (ms: number) => {
          const timer = new AbortController();
          try { return await Promise.race([exited, sleep(ms, timer.signal).then(() => false, () => false)]); } finally { timer.abort(); }
        };
        const graceful = await waitFor(5000);
        if (!graceful && child.connected) child.disconnect();
        if (!graceful) await waitFor(2000);
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
      await traffic?.close().catch(() => undefined);
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
      // Supervisor exit alone says nothing about its owned process group. Keep
      // the inventory/workspace unless the trusted owner acknowledged cleanup.
      if (ownedCleanupConfirmed && (child.exitCode !== null || child.signalCode !== null)) {
        rmSync(context.workspaceDir, { recursive: true, force: true });
      }
      throw error;
    }
  }
}
