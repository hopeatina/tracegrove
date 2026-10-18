import { afterEach, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { writeSample } from '../src/cli/samples/write.ts';
import { runTests } from '../src/authoring/run.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { loadProject } from '../src/core/corpus.ts';
import { compileCase } from '../src/core/compiler.ts';
import { CaseSpec, NativeJobObservation } from '../src/protocol/index.ts';
import { NATIVE_JOB_RUNNER_CAPABILITIES } from '../src/adapters/job/capabilities.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../src/adapters/http/capabilities.ts';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { resolveGitSources } from '../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../src/core/gitSnapshot.ts';
import { localScope } from '../src/core/corpus.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); cleanupGitRepositories(); });
function project() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-native-job-')); roots.push(root);
  writeSample(join(import.meta.dirname, '../src/samples'), 'report-native', root);
  return { root, configPath: join(root, 'tracegrove.config.yaml') };
}
it('runs native submissions, deduplication, owner isolation, worker readback, cancellation and failure through sealed evidence', async () => {
  const p = project(); const { report } = await runTests({ configPath: p.configPath });
  expect(report.outcome, JSON.stringify(report)).toBe('passed'); expect(report.bundleVerified).toBe(true);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  expect(bundle.receipts).toHaveLength(3);
  const states = new Set<string>();
  for (const receipt of bundle.receipts) {
    expect(receipt.hostObservationRefs.length).toBeGreaterThan(0);
    expect(receipt.cleanup.confirmed).toEqual(expect.arrayContaining(['host.process', 'host.workspace']));
    expect(receipt.cleanup.remainingUnknownMutations).toBe(0);
    for (const step of receipt.steps) {
      const job = NativeJobObservation.parse(step.output); states.add(job.status);
      if (job.workerId) {
        expect(job.output).toMatchObject({ apiPid: expect.any(Number) });
        expect(Number(job.workerId)).not.toBe((job.output as { apiPid: number }).apiPid);
        await expect.poll(() => { try { process.kill(Number(job.workerId), 0); return true; } catch { return false; } }).toBe(false);
      }
    }
  }
  for (const state of ['succeeded', 'cancelled', 'failed', 'conflict', 'forbidden']) expect(states.has(state)).toBe(true);
  expect(JSON.stringify(bundle.receipts)).not.toContain('"credential":');
});

it('retains a failed native attempt when completion has no persisted output', async () => {
  const p = project(); const config = parse(readFileSync(p.configPath, 'utf8'));
  config.app.env = { REPORTS_TEST_DROP_REPORT: '1' }; writeFileSync(p.configPath, stringify(config));
  const { report } = await runTests({ configPath: p.configPath, grep: 'completion' });
  expect(report.outcome, JSON.stringify(report)).toBe('assertion_failed'); expect(report.bundleVerified).toBe(true);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  expect(bundle.receipts[0]!.steps.some(step => {
    const job = NativeJobObservation.safeParse(step.output);
    return job.success && job.data.status === 'succeeded' && (job.data.output as { report?: unknown })?.report === null;
  })).toBe(true);
});

it('rejects job effect overflow, an unadmitted queue, HTTP runner substitution and HTTP oracle substitution', () => {
  const p = project(); const c = compileProject(p.configPath); const loaded = loadProject(c.workflowConfigPath);
  const spec = loaded.corpus.getAs(CaseSpec, loaded.suiteCases.find(entry => entry.ref.id.includes('completion'))!.ref);
  expect(() => compileCase({ ...spec, effects: { ...spec.effects, maxJobs: 0 } }, NATIVE_JOB_RUNNER_CAPABILITIES, null)).toThrow('job_effect_limit');
  expect(() => compileCase({ ...spec, effects: { ...spec.effects, allowedJobQueues: [] } }, NATIVE_JOB_RUNNER_CAPABILITIES, null)).toThrow('job_queue_not_admitted');
  expect(() => compileCase({ ...spec, effects: { ...spec.effects, mode: 'read_only' } }, NATIVE_JOB_RUNNER_CAPABILITIES, null)).toThrow('job_write_not_admitted');
  expect(() => compileCase(spec, HTTP_RUNNER_CAPABILITIES, null)).toThrow('unsupported_operation');
  const assertions = spec.assertions.map(assertion => ({ ...assertion, oracle: { name: 'http.observation' as const, version: '1' as const } }));
  expect(() => compileCase({ ...spec, assertions }, NATIVE_JOB_RUNNER_CAPABILITIES, null)).toThrow('oracle_step_mismatch');
});

it('does not claim a native capability without an actual application handshake', async () => {
  const p = project(); const app = join(p.root, 'app/jobs-api.mjs');
  const original = readFileSync(app, 'utf8'); expect(original).toContain('nativeReady();');
  writeFileSync(app, original.replace('nativeReady();', '/* controlled missing bridge handshake */'));
  const config = parse(readFileSync(p.configPath, 'utf8')); config.app.readyTimeoutMs = 1500; writeFileSync(p.configPath, stringify(config));
  const { report } = await runTests({ configPath: p.configPath, grep: 'failure' });
  expect(report.outcome).not.toBe('passed');
  expect(report.bundleVerified).toBe(true);
  expect(report.cases.flatMap(c => c.steps).every(step => step.result !== 'completed')).toBe(true);
});

it('propagates controller cancellation without treating a running job as completed', async () => {
  const p = project(); const controller = new AbortController(); let observed = false;
  const { report } = await runTests({ configPath: p.configPath, grep: 'cancellation', signal: controller.signal,
    onEvent(event) { if (event.kind === 'step.started' && event.stepId === 'job_read_2') { observed = true; controller.abort(new Error('controlled stop')); } },
  });
  expect(observed).toBe(true); expect(report.outcome).toBe('cancelled'); expect(report.bundleVerified).toBe(true);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  expect(bundle.receipts[0]!.cleanup.confirmed).toEqual(expect.arrayContaining(['host.process', 'host.workspace']));
  expect(bundle.receipts[0]!.cleanup.remainingUnknownMutations).toBe(0);
});

it('refuses a native response for another job instead of accepting its successful status', async () => {
  const p = project(); const bridge = join(p.root, 'app/native-bridge.mjs');
  const source = readFileSync(bridge, 'utf8'); expect(source).toContain('jobId: job.id');
  writeFileSync(bridge, source.replace('jobId: job.id', "jobId: command.action === 'read' ? 'wrong-job' : job.id"));
  const { report } = await runTests({ configPath: p.configPath, grep: 'failure' });
  expect(report.outcome).toBe('infrastructure_failed'); expect(report.bundleVerified).toBe(true);
  expect(report.cases[0]!.steps.some(step => step.reason === 'native_job_identity_mismatch')).toBe(true);
});

it('uses the same native provider bridge from a supervisor-owned pinned source copy', async () => {
  const f = gitFixture(); const p = project();
  cpSync(p.root, f.root, { recursive: true, filter: path => !path.split('/').includes('.tracegrove') });
  f.git('add', 'app', 'tracegrove', 'tracegrove.config.yaml'); f.git('commit', '--quiet', '-m', 'Native job application');
  const commit = f.git('rev-parse', 'HEAD');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...f.selected, base: commit, head: commit }] }, async () => {});
  const snapshot = await materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output: join(f.root, 'snapshot') }, async () => {});
  writeFileSync(join(f.root, 'app/jobs-api.mjs'), 'throw new Error("dirty checkout must not execute")');
  const { report } = await runTests({ configPath: join(f.root, 'tracegrove.config.yaml'), sourceSnapshot: snapshot.manifestPath, grep: 'completion' });
  expect(report.outcome, JSON.stringify(report)).toBe('passed'); expect(report.bundleVerified).toBe(true);
  expect(report.sourceBinding).toMatchObject({ kind: 'snapshot', commit });
});

it('withholds a response that echoes an issued credential instead of sealing the secret', async () => {
  const p = project(); const bridge = join(p.root, 'app/native-bridge.mjs');
  const source = readFileSync(bridge, 'utf8'); expect(source).toContain('output: { report:');
  writeFileSync(bridge, source.replace('output: { report:', 'output: { leaked: credential, report:'));
  const { report } = await runTests({ configPath: p.configPath, grep: 'failure' });
  expect(report.outcome, JSON.stringify(report.cases.flatMap(c => c.steps.map(s => ({ result: s.result, reason: s.reason }))))).toBe('infrastructure_failed'); expect(report.bundleVerified).toBe(true);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  expect(bundle.receipts[0]!.steps[0]).toMatchObject({ output: null, reasonCode: 'native_job_secret_echo' });
  expect(JSON.stringify(bundle.receipts)).not.toContain('"leaked"');
});
