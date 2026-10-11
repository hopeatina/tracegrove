import { afterEach, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';

afterEach(cleanupTemps);
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('owned host did not recover after controller SIGKILL');
    await new Promise((done) => setTimeout(done, 25));
  }
}

it('kills the owned app and removes its workspace after its controller is SIGKILLed', async () => {
  const copy = sampleCopy();
  const workspaceDir = join(copy.stateDir, 'crash-host');
  const pidPath = join(copy.root, 'app.pid');
  const owner = fork(new URL('./fixtures/host-owner.ts', import.meta.url), [copy.configPath, workspaceDir, pidPath], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let appPid: number | undefined;
  try {
    const ready = await Promise.race([
      once(owner, 'message'),
      once(owner, 'exit').then(() => { throw new Error('test controller exited before host readiness'); }),
    ]) as [{ supervisorPid: number }];
    appPid = Number(readFileSync(pidPath, 'utf8'));
    expect(alive(appPid)).toBe(true);
    expect(existsSync(workspaceDir)).toBe(true);
    const exited = once(owner, 'exit');
    owner.kill('SIGKILL');
    await exited;
    await until(() => !alive(appPid!) && !alive(ready[0].supervisorPid) && !existsSync(workspaceDir));
  } finally {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    if (appPid && alive(appPid)) process.kill(appPid, 'SIGKILL');
  }
}, 10_000);
