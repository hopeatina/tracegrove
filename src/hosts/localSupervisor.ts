/** Trusted local owner: the IPC channel closes even when the controller is killed. */
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';

type Launch = { command: string; args: string[]; cwd: string; env: Record<string, string>; workspaceDir: string };
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
  app = spawn(message.command, message.args, {
    cwd: message.cwd, env: message.env, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout?.pipe(process.stdout);
  app.stderr?.resume();
  app.once('error', () => { void stop(); });
  app.once('exit', () => { void stop(); });
});
