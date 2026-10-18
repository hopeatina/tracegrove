import { afterEach, expect, it } from 'vitest';
import { cpSync, existsSync, readFileSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { sampleCopy, cleanupTemps } from '../conformance/helpers.ts';
import { runTests, resolveRun } from '../src/authoring/run.ts';
import { readSavedRun } from '../src/authoring/runSource.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { runCli } from './fixtures/cli.ts';

const servers: UiServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); cleanupTemps(); });
async function nativeRun(fail = false) {
  const copy = sampleCopy(); const configPath = join(copy.root, 'tracegrove.config.yaml');
  if (fail) {
    const path = join(copy.root, 'tracegrove/notes/list.flow.yaml'); const before = readFileSync(path, 'utf8');
    const after = before.replace('status: 200', 'status: 299'); expect(after).not.toBe(before); writeFileSync(path, after);
  }
  const run = await runTests({ configPath, grep: 'list' }); expect(run.report.outcome).toBe(fail ? 'assertion_failed' : 'passed');
  return { ...copy, ...run, configPath };
}
function forgeSummary(report: Awaited<ReturnType<typeof nativeRun>>['report']) {
  const forged = structuredClone(report); forged.outcome = 'passed'; forged.exitCode = 0; forged.bundleVerified = true;
  forged.project = 'invented-project'; forged.sourceDigest = 'invented-source'; forged.executionId = 'invented-execution';
  forged.totals = { passed: 999, failed: 0, other: 0 };
  for (const c of forged.cases) {
    c.title = 'Invented passing case'; c.file = '../outside.flow.yaml'; c.outcome = 'passed'; c.failure = null;
    for (const step of c.steps) { step.result = 'completed'; step.status = 299; step.durationMs = 999999; step.reason = null; }
  }
  writeFileSync(join(report.runDir, 'summary.json'), JSON.stringify(forged)); return forged;
}
it('reconstructs failed cases, steps, totals, source and identity from evidence even when every saved label claims pass', async () => {
  const f = await nativeRun(true); const forged = forgeSummary(f.report); const raw = readFileSync(join(f.report.runDir, 'summary.json'), 'utf8');
  const checked = readSavedRun(f.report.runDir);
  expect(checked).toMatchObject({ outcome: 'assertion_failed', exitCode: 1, bundleVerified: true, evidenceStatus: 'verified', totals: { passed: 0, failed: 1, other: 0 } });
  expect(checked.executionId).toBe(f.report.executionId); expect(checked.project).toBe(f.report.project); expect(checked.sourceDigest).toBe(f.report.sourceDigest);
  expect(checked.cases[0]!.file).toBe(''); expect(checked.cases[0]!.title).not.toBe(forged.cases[0]!.title);
  expect(checked.cases[0]!.steps.find(step => step.result === 'failed')).toMatchObject({ status: 200, expectStatus: 299, declared: true });
  expect(checked.cases[0]!.failure?.message).toContain('299');
  expect(readFileSync(join(f.report.runDir, 'summary.json'), 'utf8')).toBe(raw); // Inspection does not repair or rewrite producer metadata.
  const shown = runCli(['show', '--config', f.configPath, '--run', basename(f.report.runDir)]);
  expect(shown.status, shown.stderr).toBe(0); expect(JSON.parse(shown.stdout).outcome).toBe('assertion_failed');
});
it('recovers recorded results when summary metadata is missing, malformed or oversized', async () => {
  const f = await nativeRun(); const path = join(f.report.runDir, 'summary.json');
  unlinkSync(path); expect(readSavedRun(f.report.runDir)).toMatchObject({ outcome: 'passed', evidenceStatus: 'verified' });
  writeFileSync(path, 'private malformed display value'); expect(readSavedRun(f.report.runDir).outcome).toBe('passed');
  truncateSync(path, 16 * 1024 * 1024 + 1); expect(readSavedRun(f.report.runDir).outcome).toBe('passed');
  const shown = runCli(['show', '--config', f.configPath, '--run', basename(f.report.runDir)]); expect(shown.status, shown.stderr).toBe(0);
  expect(JSON.parse(shown.stdout)).toMatchObject({ outcome: 'passed', bundleVerified: true });
});
it('clears passing metrics and exits nonzero when evidence changes after a successful read', async () => {
  const f = await nativeRun(); expect(readSavedRun(f.report.runDir).outcome).toBe('passed'); forgeSummary(f.report);
  writeFileSync(join(f.report.runDir, 'bundle/campaign.json'), '{}');
  const checked = readSavedRun(f.report.runDir);
  expect(checked).toMatchObject({ outcome: 'inconclusive', exitCode: 2, evidenceStatus: 'invalid', sourceChecked: false, cases: [], sourceBinding: null, sourceDigest: '', executionId: null,
    totals: { passed: 0, failed: 0, other: 0 } });
  const shown = runCli(['show', '--config', f.configPath, '--run', basename(f.report.runDir)]); expect(shown.status).toBe(2);
  expect(JSON.parse(shown.stdout)).toMatchObject({ outcome: 'inconclusive', cases: [] });
});
it('keeps good history readable while a neighboring record is malformed or missing metadata', async () => {
  const f = await nativeRun(); const runs = join(f.root, '.tracegrove/runs'); const broken = join(runs, 'z-unavailable');
  cpSync(f.report.runDir, broken, { recursive: true }); writeFileSync(join(broken, 'summary.json'), '{malformed');
  writeFileSync(join(broken, 'bundle/campaign.json'), '{}'); unlinkSync(join(f.report.runDir, 'summary.json'));
  const server = await startUi({ dir: f.root }); servers.push(server);
  const overview = await fetch(new URL('api/overview', server.url)); expect(overview.status).toBe(200); const body = await overview.json();
  expect(body.runs.find((r: { name: string }) => r.name === basename(f.report.runDir))).toMatchObject({ outcome: 'passed', bundleVerified: true });
  expect(body.runs.find((r: { name: string }) => r.name === 'z-unavailable')).toMatchObject({ outcome: 'inconclusive', bundleVerified: false, totals: { passed: 0, failed: 0, other: 0 } });
  const bad = await fetch(new URL('api/runs/z-unavailable', server.url)); expect(bad.status).toBe(200); expect(await bad.json()).toMatchObject({ outcome: 'inconclusive', cases: [] });
  const good = await fetch(new URL(`api/runs/${basename(f.report.runDir)}`, server.url)); expect(good.status).toBe(200); expect(await good.json()).toMatchObject({ outcome: 'passed' });
  expect((await fetch(new URL('api/runs/not%2Fa%2Frun', server.url))).status).toBe(400);
});
it('refuses linked run directories and latest pointers outside the owned run collection', async () => {
  const f = await nativeRun(); const runs = join(f.root, '.tracegrove/runs'); const linked = join(runs, 'linked'); symlinkSync(f.report.runDir, linked);
  expect(readSavedRun(linked)).toMatchObject({ outcome: 'inconclusive', evidenceStatus: 'invalid', cases: [] });
  const latest = join(runs, 'latest'); rmSync(latest, { force: true }); symlinkSync(f.root, latest);
  expect(resolveRun(f.root, 'latest')).toBeNull(); expect(resolveRun(f.root, '../escape')).toBeNull();
  expect(existsSync(f.report.runDir)).toBe(true);
});
