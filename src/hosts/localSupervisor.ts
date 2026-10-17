/** Trusted local owner: the IPC channel closes even when the controller is killed. */
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { readGitSnapshotTree, writeGitSnapshotTree } from '../source/snapshotTree.ts';
import { sourceIdentityDigest } from './sourceIdentity.ts';
import type { LaunchRecipe } from '../protocol/schemas/definitions.ts';
import { pinnedArguments } from './pinnedArguments.ts';

type Launch = { command: string; args: string[]; cwd: string; env: Record<string, string>; workspaceDir: string;
  sourceSnapshot?: LaunchRecipe['sourceSnapshot']; identitySourceFiles: string[]; runtimeFamily: 'node' | 'python' };
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
process.once('message', (message: Launch) => {
  if (stopping || !process.connected) return;
  workspaceDir = message.workspaceDir;
  let cwd = message.cwd; let args = message.args;
  if (message.sourceSnapshot) {
    let stage: 'read' | 'template' | 'copy' | 'identity' = 'read';
    try {
      const binding = message.sourceSnapshot; const root = resolve(binding.root); const within = relative(root, cwd);
      if (within.startsWith('..') || isAbsolute(within) || (within || '.') !== binding.cwd) throw new Error('snapshot cwd outside binding');
      const files = readGitSnapshotTree(binding.snapshot, root);
      stage = 'template';
      args = pinnedArguments(message.args, cwd, root, binding.snapshot, message.runtimeFamily);
      stage = 'copy';
      const privateRoot = join(workspaceDir, 'source'); writeGitSnapshotTree(files, privateRoot);
      cwd = resolve(privateRoot, within);
      stage = 'identity';
      const identity = sourceIdentityDigest(cwd, message.identitySourceFiles);
      if (!process.connected) { void stop(); return; }
      process.send?.({ kind: 'host.source', snapshotRef: binding.snapshot.ref, identity }, undefined, undefined, error => { if (error) void stop(); });
    } catch {
      if (process.connected) process.send?.({ kind: 'host.source_failed', stage }, undefined, undefined, () => { void stop(); });
      else void stop();
      return;
    }
  }
  if (stopping || !process.connected) { void stop(); return; }
  app = spawn(message.command, args, {
    cwd, env: message.env, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout?.pipe(process.stdout);
  app.stderr?.pipe(process.stderr);
  app.once('error', () => { void stop(); });
  app.once('exit', () => { void stop(); });
});
