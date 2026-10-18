import { afterEach, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { z } from 'zod';
import { parse, stringify } from 'yaml';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { resolveGitSources } from '../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../src/core/gitSnapshot.ts';
import { localScope, loadProject } from '../src/core/corpus.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { runTests } from '../src/authoring/run.ts';
import { plan } from '../src/core/planner.ts';
import { runSample } from '../conformance/helpers.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { IdentityAttestation } from '../src/protocol/index.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
import type { ExecutorHost } from '../src/hosts/types.ts';
import { digestOfBytes, freeze } from '../src/protocol/index.ts';
import { verifyGitSnapshotProofMetadata } from '../src/source/gitObjectProof.ts';
import { resealBundle } from '../conformance/helpers.ts';

afterEach(cleanupGitRepositories);
async function project(sample: 'notes-api' | 'fastapi-notes' | 'django-notes' = 'notes-api') {
  const fixture = gitFixture(); cpSync(join(import.meta.dirname, '../src/samples', sample), fixture.root, { recursive: true });
  if (sample === 'notes-api') {
    const app = join(fixture.root, 'app/app.mjs'); const original = readFileSync(app, 'utf8');
    const observable = original.replace('{ ok: true, build, notes: count }', "{ ok: true, build, notes: count, cwd: process.cwd(), untracked: existsSync(join(process.cwd(), 'untracked.txt')) }");
    expect(observable).not.toBe(original); writeFileSync(app, observable);
  } else {
    const path = join(fixture.root, 'tracegrove.config.yaml'); const config = parse(readFileSync(path, 'utf8'));
    config.app.python = process.env.TRACEGROVE_PYTHON; writeFileSync(path, stringify(config));
  }
  fixture.git('add', '.'); fixture.git('commit', '--quiet', '-m', 'Pinned real application'); const commit = fixture.git('rev-parse', 'HEAD');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...fixture.selected, base: commit, head: commit }] }, async () => {});
  const materialized = await materializeGitSnapshot({ resolution, repositoryRef: fixture.repositoryRef, side: 'head', root: fixture.root, output: join(fixture.root, 'snapshot') }, async () => {});
  return { ...fixture, ...materialized, configPath: join(materialized.sourceDir, 'tracegrove.config.yaml') };
}

it('launches pinned files from a private supervisor-owned tree and seals its source observation', async () => {
  const p = await project(); writeFileSync(join(p.sourceDir, 'untracked.txt'), 'must not enter application');
  const { report } = await runTests({ configPath: p.configPath, sourceSnapshot: p.manifestPath });
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  expect(report.outcome, JSON.stringify(bundle.receipts.map(receipt => ({ reasons: receipt.reasonCodes, expected: receipt.environment.expected.components, observed: receipt.environment.observed?.components })))).toBe('passed');
  expect(report.bundleVerified).toBe(true);
  for (const receipt of bundle.receipts) {
    const name = receipt.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_');
    const host = JSON.parse(readFileSync(join(report.runDir, 'bundle', 'cells', name, 'host.json'), 'utf8'));
    const attestation = IdentityAttestation.parse(host.attestations[0]);
    expect(attestation.evidence.sourceSnapshotRef).toEqual(p.snapshot.ref);
    expect(attestation.evidence.gitSource).toMatchObject({ commit: p.snapshot.commit, algorithm: 'sha1', verification: 'actual_file_bytes' });
    const health = z.object({ cwd: z.string(), untracked: z.literal(false) }).parse(attestation.evidence.observedHealthBody);
    expect(health.cwd).not.toBe(p.sourceDir); expect(health.cwd).toMatch(/\/host\/[^/]+\/source$/);
    expect(existsSync(health.cwd)).toBe(false);
    expect(receipt.cleanup.confirmed).toContain('host.workspace'); expect(receipt.cleanup.remainingUnknownMutations).toBe(0);
    expect(receipt.environment.observed?.repositories).toEqual([]);
  }
});

for (const sample of ['fastapi-notes', 'django-notes'] as const) {
  it.skipIf(!process.env.TRACEGROVE_PYTHON)(`runs a pinned ${sample} source tree with its qualified Python template`, async () => {
    const p = await project(sample);
    const { report } = await runTests({ configPath: p.configPath, sourceSnapshot: p.manifestPath });
    expect(report.outcome, JSON.stringify(report.cases)).toBe('passed'); expect(report.bundleVerified).toBe(true);
    const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
    expect(bundle.receipts.every(receipt => receipt.cleanup.confirmed.includes('host.workspace'))).toBe(true);
  });
}

it('refuses a resealed bundle with an invented snapshot observation', async () => {
  const p = await project(); const { report } = await runTests({ configPath: p.configPath, sourceSnapshot: p.manifestPath, grep: 'notes.list' });
  expect(report.outcome).toBe('passed'); const directory = join(report.runDir, 'bundle');
  const bundle = readVerifiedBundle(directory); const name = bundle.receipts[0]!.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = join(directory, 'cells', name, 'host.json'); const host = JSON.parse(readFileSync(path, 'utf8'));
  const attestation = IdentityAttestation.parse(host.attestations[0]);
  host.attestations[0] = freeze({ ...attestation, evidence: { ...attestation.evidence, sourceSnapshotRef: { ...p.snapshot.ref, revision: 'invented' } } });
  writeFileSync(path, JSON.stringify(host)); resealBundle(directory);
  const verification = verifyBundle(directory);
  expect(verification.ok).toBe(false);
  expect(verification.problems.some(problem => problem.includes('supervisor observation'))).toBe(true);
});
it('refuses a resealed bundle that drops the supervisor Git object observation', async () => {
  const p = await project(); const { report } = await runTests({ configPath: p.configPath, sourceSnapshot: p.manifestPath, grep: 'notes.list' });
  const directory = join(report.runDir, 'bundle'); const bundle = readVerifiedBundle(directory);
  const name = bundle.receipts[0]!.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_'); const path = join(directory, 'cells', name, 'host.json');
  const host = JSON.parse(readFileSync(path, 'utf8')); const attestation = IdentityAttestation.parse(host.attestations[0]);
  const { gitSource: _observed, ...evidence } = attestation.evidence;
  host.attestations[0] = freeze({ ...attestation, evidence }); writeFileSync(path, JSON.stringify(host)); resealBundle(directory);
  const verification = verifyBundle(directory); expect(verification.ok).toBe(false);
  expect(verification.problems.some(problem => problem.includes('Git object observation'))).toBe(true);
});
it('blocks a resealed checksum-valid source replacement that does not belong to its claimed Git commit', async () => {
  const p = await project(); const path = join(p.sourceDir, 'app/app.mjs');
  const bytes = Buffer.concat([readFileSync(path), Buffer.from('\n// replacement outside the selected Git commit\n')]);
  writeFileSync(path, bytes);
  const counterfeit = freeze({ ...p.snapshot, files: p.snapshot.files.map(file => file.path === 'app/app.mjs'
    ? { ...file, bytes: bytes.length, digest: digestOfBytes(bytes) } : file) });
  expect(verifyGitSnapshotProofMetadata(counterfeit).verification).toBe('object_links_only');
  writeFileSync(p.manifestPath, JSON.stringify(counterfeit));
  expect(() => compileProject(p.configPath, { sourceSnapshot: p.manifestPath })).toThrow('snapshot_source_changed');
});

it('refuses an eval wrapper before it can execute outside the pinned tree', async () => {
  const p = await project(); const workspace = join(p.root, 'refused-workspace'); mkdirSync(workspace);
  const marker = join(p.root, 'must-not-execute');
  const child = fork(join(import.meta.dirname, '../src/hosts/localSupervisor.ts'), [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = once(child, 'exit', { signal: AbortSignal.timeout(10000) });
  try {
    const response = once(child, 'message', { signal: AbortSignal.timeout(5000) });
    child.send({ command: process.execPath, args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad')`], cwd: p.sourceDir, env: {},
      workspaceDir: workspace, sourceSnapshot: { snapshot: p.snapshot, root: p.sourceDir, cwd: '.' }, identitySourceFiles: ['app/app.mjs'], runtimeFamily: 'node' });
    const [message] = await response;
    expect(message).toMatchObject({ kind: 'host.source_failed', stage: 'template' });
    await exited; expect(existsSync(marker)).toBe(false); expect(existsSync(workspace)).toBe(false);
  } finally {
    if (child.connected) child.disconnect();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
  }
});

it('blocks drift in an unchanged, non-entrypoint file after planning and removes the failed launch workspace', async () => {
  const p = await project(); const compiled = compileProject(p.configPath, { sourceSnapshot: p.manifestPath });
  const bundle = plan({ project: loadProject(compiled.workflowConfigPath), profileName: 'real', scope: localScope() });
  writeFileSync(join(p.sourceDir, 'route.ts'), 'post-plan drift');
  const summary = await runSample(bundle, join(p.root, 'state'));
  expect(summary.outcome).toBe('blocked'); expect(summary.reasonCodes).toContain('snapshot_source_unavailable');
  expect(summary.receipts.every(receipt => receipt.steps.every(step => step.result === 'not_run'))).toBe(true);
  expect(readdirSync(join(summary.executionDir, 'host'))).toEqual([]);
  expect(verifyBundle(summary.executionDir)).toMatchObject({ ok: true, outcome: 'blocked' });
});

it('refuses a foreign snapshot scope before reading missing app code or creating compiled output', async () => {
  const p = await project(); const path = join(p.root, 'foreign.json');
  writeFileSync(path, JSON.stringify(freeze({ ...p.snapshot, scope: { ...p.snapshot.scope, ownerId: 'foreign' } })));
  unlinkSync(join(p.sourceDir, 'app/app.mjs'));
  expect(() => compileProject(p.configPath, { sourceSnapshot: path })).toThrow('snapshot_scope_mismatch');
  expect(existsSync(join(p.sourceDir, '.tracegrove'))).toBe(false);
});

it('refuses symlinked source parents before creating compiled output', async () => {
  const p = await project(); renameSync(join(p.sourceDir, 'app'), join(p.sourceDir, 'real-app'));
  symlinkSync('real-app', join(p.sourceDir, 'app'));
  expect(() => compileProject(p.configPath, { sourceSnapshot: p.manifestPath })).toThrow('linked or non-directory parents');
  expect(existsSync(join(p.sourceDir, '.tracegrove'))).toBe(false);
});

it('reports a source-template block directly and never executes an entry outside the snapshot', async () => {
  const p = await project(); const verifier = join(p.root, 'verifier'); mkdirSync(verifier);
  const config = parse(readFileSync(p.configPath, 'utf8')); const marker = join(p.root, 'outside-executed');
  const outside = join(p.root, 'outside.cjs'); writeFileSync(outside, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad');`);
  config.app.root = p.sourceDir; config.app.entry = outside; config.testDir = join(p.sourceDir, 'tracegrove');
  const path = join(verifier, 'tracegrove.config.yaml'); writeFileSync(path, stringify(config));
  const { report } = await runTests({ configPath: path, sourceSnapshot: p.manifestPath, grep: 'notes.list' });
  expect(report.outcome).toBe('blocked'); expect(report.bundleVerified).toBe(true);
  expect(report.cases[0]?.failure?.step).toBe('(before steps)');
  expect(report.cases[0]?.failure?.message).toContain('snapshot_preparation_template');
  expect(existsSync(marker)).toBe(false);
});

it('blocks an adapter that ignores the source pin while retaining its honest blocked attempt', async () => {
  const p = await project(); const compiled = compileProject(p.configPath, { sourceSnapshot: p.manifestPath });
  const bundle = plan({ project: loadProject(compiled.workflowConfigPath), profileName: 'real', scope: localScope() });
  const unsupported: ExecutorHost = { start: context => {
    const { sourceSnapshot: _ignored, ...launch } = context.hostPlan.launch!;
    return new LocalProcessHost().start({ ...context, hostPlan: { ...context.hostPlan, launch } });
  } };
  const summary = await runSample(bundle, join(p.root, 'state'), { hosts: { local: unsupported } });
  expect(summary.outcome).toBe('blocked'); expect(summary.reasonCodes).toContain('required_identity_unknown');
  expect(summary.receipts.every(receipt => receipt.steps.every(step => step.result === 'not_run'))).toBe(true);
  expect(verifyBundle(summary.executionDir)).toMatchObject({ ok: true, outcome: 'blocked' });
});

it('the supervisor removes its private copy when its controlling IPC client disconnects', async () => {
  const p = await project(); const workspace = join(p.root, 'owned-workspace'); mkdirSync(workspace);
  const child = fork(join(import.meta.dirname, '../src/hosts/localSupervisor.ts'), [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = once(child, 'exit', { signal: AbortSignal.timeout(10000) });
  try {
    const source = once(child, 'message', { signal: AbortSignal.timeout(5000) });
    child.send({ command: process.execPath, args: ['app/app.mjs'], cwd: p.sourceDir, env: { PORT: '0', NOTES_DIR: join(workspace, 'data'), NOTES_TOKENS: '{}' },
      workspaceDir: workspace, sourceSnapshot: { snapshot: p.snapshot, root: p.sourceDir, cwd: '.' }, identitySourceFiles: ['app/app.mjs', 'app/http.mjs'], runtimeFamily: 'node' });
    const [message] = await source;
    expect(z.object({ kind: z.literal('host.source') }).parse(message).kind).toBe('host.source');
    child.disconnect(); await exited;
    expect(existsSync(workspace)).toBe(false);
  } finally {
    if (child.connected) child.disconnect();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
  }
});
