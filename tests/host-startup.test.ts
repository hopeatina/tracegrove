import { expect, it, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { HostPlan, freeze } from '../src/protocol/index.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
afterEach(cleanupTemps);
it('retains the workspace when its supervisor dies before readiness without acknowledging cleanup', async () => {
  const copy = sampleCopy(); const project = loadProject(copy.configPath);
  const base = project.corpus.getAs(HostPlan, project.fileRefs.get('./hosts/local-process.yaml')!);
  const pidPath = join(copy.root, 'child.pid');
  const plan = freeze({ ...base, launch: { ...base.launch!, command: process.execPath,
    args: ['-e', "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); process.kill(process.ppid, 'SIGKILL'); setInterval(() => {}, 1000)", pidPath],
    // Exercise supervisor death even when parallel Git fixtures delay child startup.
    readiness: { path: '/health', timeoutMs: 5000 },
  } });
  const workspaceDir = join(copy.stateDir, 'host');
  try {
    await expect(new LocalProcessHost().start({ hostPlan: plan, projectRoot: project.root, workspaceDir,
      scope: localScope(), campaignId: 'campaign.test', executionId: 'exec.test', attemptId: 'attempt.test',
      generation: 1, actorId: localScope().ownerId, credentialNames: [], signal: new AbortController().signal, mockResponses: null,
    })).rejects.toThrow(/exited before listening/);
    expect(existsSync(workspaceDir)).toBe(true);
    expect(() => process.kill(Number(readFileSync(pidPath, 'utf8')), 0)).not.toThrow();
  } finally {
    if (existsSync(pidPath)) {
      try { process.kill(-Number(readFileSync(pidPath, 'utf8')), 'SIGKILL'); } catch { /* test child already exited */ }
    }
  }
});
it('stops a child and removes its workspace when it never announces readiness', async () => {
  const copy = sampleCopy(); const project = loadProject(copy.configPath);
  const base = project.corpus.getAs(HostPlan, project.fileRefs.get('./hosts/local-process.yaml')!);
  const pidPath = join(copy.root, 'child.pid');
  const plan = freeze({ ...base, launch: { ...base.launch!, command: process.execPath,
    args: ['-e', "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)", pidPath],
    readiness: { path: '/health', timeoutMs: 500 },
  } });
  const workspaceDir = join(copy.stateDir, 'host');
  await expect(new LocalProcessHost().start({ hostPlan: plan, projectRoot: project.root, workspaceDir,
    scope: localScope(), campaignId: 'campaign.test', executionId: 'exec.test', attemptId: 'attempt.test',
    generation: 1, actorId: localScope().ownerId, credentialNames: [], signal: new AbortController().signal, mockResponses: null,
  })).rejects.toThrow(/did not report a port/);
  const pid = Number(readFileSync(pidPath, 'utf8'));
  expect(() => process.kill(pid, 0)).toThrow();
  expect(existsSync(workspaceDir)).toBe(false);
});

it('does not confirm cleanup when the trusted supervisor is killed', async () => {
  const copy = sampleCopy(); const project = loadProject(copy.configPath);
  const base = project.corpus.getAs(HostPlan, project.fileRefs.get('./hosts/local-process.yaml')!);
  const pidPath = join(copy.root, 'child.pid');
  const plan = freeze({ ...base, launch: { ...base.launch!, command: process.execPath,
    args: ['-e', "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); const s=require('node:http').createServer((q,r)=>r.end('{}')); s.listen(0,'127.0.0.1',()=>console.log('listening '+s.address().port))", pidPath],
  } });
  const workspaceDir = join(copy.stateDir, 'host');
  const session = await new LocalProcessHost().start({ hostPlan: plan, projectRoot: project.root, workspaceDir,
    scope: localScope(), campaignId: 'campaign.test', executionId: 'exec.test', attemptId: 'attempt.test',
    generation: 1, actorId: localScope().ownerId, credentialNames: [], signal: new AbortController().signal, mockResponses: null,
  });
  const appPid = Number(readFileSync(pidPath, 'utf8'));
  try {
    process.kill(Number(session.lease.observedRuntimeIdentity.pid), 'SIGKILL');
    const first = await session.stop('supervisor failed');
    expect(first.confirmed).toBe(false);
    expect(await session.stop('repeated request')).toEqual(first);
    expect(existsSync(workspaceDir)).toBe(true);
  } finally {
    try { process.kill(-appPid, 'SIGKILL'); } catch { /* test app already exited */ }
  }
});
