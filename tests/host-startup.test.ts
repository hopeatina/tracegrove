import { expect, it, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { HostPlan, freeze } from '../src/protocol/index.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
afterEach(cleanupTemps);
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
