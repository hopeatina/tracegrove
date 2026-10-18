import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { writeSample } from '../src/cli/samples/write.ts';
import { runTests } from '../src/authoring/run.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { loadProject } from '../src/core/corpus.ts';
import { CaseSpec } from '../src/protocol/index.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-job-proof-')); roots.push(root);
  const config = writeSample(join(import.meta.dirname, '../src/samples'), 'report-jobs', root);
  return { root, config };
}
const JobOutput = z.object({ body: z.object({ job: z.object({ status: z.string(), workerPid: z.number().int().positive(), apiPid: z.number().int().positive() }) }) });

it('qualifies persisted worker completion, duplicate delivery, cancellation and failure over the ordinary HTTP oracle', async () => {
  const { root } = project();
  const compiled = compileProject(join(root, 'tracegrove.config.yaml'));
  expect(compiled.sourceFiles).toEqual(['app/http.mjs', 'app/jobs-api.mjs', 'app/native-bridge.mjs', 'app/store.mjs', 'app/worker.mjs']);
  const loaded = loadProject(compiled.workflowConfigPath);
  expect(loaded.suiteCases.map(entry => loaded.corpus.getAs(CaseSpec, entry.ref).effects.maxJobs)).toEqual([1, 1, 1]);
  const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml') });
  expect(report.outcome).toBe('passed');
  expect(report.bundleVerified).toBe(true);
  expect(report.cases.map(c => c.caseId)).toEqual(['reports.cancellation', 'reports.completion', 'reports.failure']);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  const states = new Set<string>();
  for (const receipt of bundle.receipts) {
    expect(receipt.cleanup.confirmed).toContain('host.process');
    expect(receipt.cleanup.remainingUnknownMutations).toBe(0);
    expect(receipt.cleanup.critical.every(resource => receipt.cleanup.confirmed.includes(resource))).toBe(true);
    for (const step of receipt.steps) {
      const parsed = JobOutput.safeParse(step.output);
      if (!parsed.success) continue;
      const job = parsed.data.body.job;
      expect(job.workerPid).not.toBe(job.apiPid);
      if (['cancelled', 'failed', 'succeeded'].includes(job.status)) states.add(job.status);
      await expect.poll(() => { try { process.kill(job.workerPid, 0); return true; } catch { return false; } }).toBe(false);
    }
  }
  expect([...states].sort()).toEqual(['cancelled', 'failed', 'succeeded']);
  expect(JSON.stringify(bundle.receipts)).not.toContain('Bearer ');
});

it('retains a verifiable failed attempt when a worker claims success without persisting its output', async () => {
  const { root } = project();
  const configPath = join(root, 'tracegrove.config.yaml');
  const config = parse(readFileSync(configPath, 'utf8'));
  config.app.env = { REPORTS_TEST_DROP_REPORT: '1' };
  writeFileSync(configPath, stringify(config));
  const { report } = await runTests({ configPath, grep: 'reports.completion' });
  expect(report.outcome).toBe('assertion_failed');
  expect(report.bundleVerified).toBe(true);
  expect(report.cases[0]?.failure?.step).toBe('read persisted output independently');
  expect(report.cases[0]?.steps.some(s => s.status === 404)).toBe(true);
  expect(verifyBundle(join(report.runDir, 'bundle'))).toMatchObject({ ok: true, outcome: 'assertion_failed' });
});
