/** Trusted local owner: the IPC channel closes even when the controller is killed. */
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { readGitSnapshotSource, readGitSnapshotTree, writeGitSnapshotTree } from '../source/snapshotTree.ts';
import { sourceIdentityDigest } from './sourceIdentity.ts';
import type { LaunchRecipe } from '../protocol/schemas/definitions.ts';
import { pinnedArguments } from './pinnedArguments.ts';
import { NativeJobRequest, MAX_NATIVE_JOB_MESSAGE_BYTES } from '../protocol/schemas/nativeJob.ts';

type Launch = { command: string; args: string[]; cwd: string; env: Record<string, string>; workspaceDir: string;
  sourceSnapshot?: LaunchRecipe['sourceSnapshot']; nativeJobs?: LaunchRecipe['nativeJobs']; identitySourceFiles: string[]; runtimeFamily: 'node' | 'python' };
let app: ChildProcess | null = null;
let workspaceDir: string | null = null;
let stopping = false;

function signalApp(signal: NodeJS.Signals): void {
  if (!app?.pid) return;
  try {
    if (process.platform === 'win32') app.kill(signal);
    else process.kill(-app.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (app && app.exitCode === null && app.signalCode === null) {
    const exited = new Promise<void>((done) => app!.once('exit', () => done()));
    signalApp('SIGKILL');
    await exited;
  } else signalApp('SIGKILL');
  if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
  if (process.connected) process.send?.({ kind: 'host.cleaned' }, undefined, undefined, () => process.exit(0));
  else process.exit(0);
}

process.once('disconnect', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
process.on('message', (message: unknown) => {
  const wrapper = message as { kind?: string; request?: unknown } | null;
  if (wrapper?.kind !== 'host.job_request' || stopping || !app?.connected) return;
  const parsed = NativeJobRequest.safeParse(wrapper.request);
  if (parsed.success && Buffer.byteLength(JSON.stringify(parsed.data)) <= MAX_NATIVE_JOB_MESSAGE_BYTES) app.send(parsed.data);
});
process.once('message', (message: Launch) => {
  if (stopping || !process.connected) return;
  workspaceDir = message.workspaceDir;
  let cwd = message.cwd; let args = message.args;
  if (message.sourceSnapshot) {
    let stage: 'read' | 'template' | 'copy' | 'objects' | 'identity' = 'read';
    try {
      const binding = message.sourceSnapshot; const root = resolve(binding.root); const within = relative(root, cwd);
      if (within.startsWith('..') || isAbsolute(within) || (within || '.') !== binding.cwd) throw new Error('snapshot cwd outside binding');
      const files = readGitSnapshotTree(binding.snapshot, root);
      stage = 'template';
      args = pinnedArguments(message.args, cwd, root, binding.snapshot, message.runtimeFamily);
      stage = 'copy';
      const privateRoot = join(workspaceDir, 'source'); writeGitSnapshotTree(files, privateRoot);
      stage = 'objects';
      const { gitSource } = readGitSnapshotSource(binding.snapshot, privateRoot);
      cwd = resolve(privateRoot, within);
      stage = 'identity';
      const identity = sourceIdentityDigest(cwd, message.identitySourceFiles);
      if (!process.connected) { void stop(); return; }
      process.send?.({ kind: 'host.source', snapshotRef: binding.snapshot.ref, identity, ...(gitSource ? { gitSource } : {}) }, undefined, undefined, error => { if (error) void stop(); });
    } catch {
      if (process.connected) process.send?.({ kind: 'host.source_failed', stage }, undefined, undefined, () => { void stop(); });
      else void stop();
      return;
    }
  }
  if (stopping || !process.connected) { void stop(); return; }
  app = spawn(message.command, args, {
    cwd, env: message.env, detached: process.platform !== 'win32',
    stdio: message.nativeJobs ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
  if (message.nativeJobs) app.on('message', (payload: unknown) => {
    const kind = (payload as { kind?: unknown } | null)?.kind;
    if (!stopping && process.connected && (kind === 'tracegrove.job.ready' || kind === 'tracegrove.job.response') &&
        Buffer.byteLength(JSON.stringify(payload)) <= MAX_NATIVE_JOB_MESSAGE_BYTES) process.send?.({ kind: 'host.job', message: payload });
  });
  app.stdout?.pipe(process.stdout);
  app.stderr?.pipe(process.stderr);
  app.once('error', () => { void stop(); });
  app.once('exit', () => { void stop(); });
});
