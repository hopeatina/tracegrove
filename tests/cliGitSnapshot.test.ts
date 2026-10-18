import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { localScope } from '../src/core/corpus.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { sourceIdentityDigest } from '../src/hosts/local.ts';
import { GitSourceSnapshot, digestOfBytes, verifySelfDigest } from '../src/protocol/index.ts';

const root = resolve(import.meta.dirname, '..');
function cli(...args: string[]) {
  return spawnSync(process.execPath, process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled'
    ? [join(root, 'dist/cli/main.js'), ...args] : ['--import', 'tsx', join(root, 'src/cli/main.ts'), ...args],
  { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
}
afterEach(cleanupGitRepositories);
const Summary = z.object({ outcome: z.string(), runDir: z.string(), sourceDigest: z.string(), executionId: z.string(), bundleVerified: z.literal(true) });

it('independent base/head CLI runs prove the same saved authorization flow fails before the fix and passes after it', () => {
  const f = gitFixture();
  cpSync(join(root, 'src/samples/notes-api'), f.root, { recursive: true });
  const appPath = join(f.root, 'app/app.mjs'); const good = readFileSync(appPath, 'utf8');
  const bad = good.replace("if (note.ownerId !== userId) return send(res, 403, { error: 'forbidden' });", "if (note.ownerId !== userId && req.method !== 'GET') return send(res, 403, { error: 'forbidden' });");
  expect(bad).not.toBe(good); writeFileSync(appPath, bad);
  f.git('add', '.'); f.git('commit', '--quiet', '-m', 'Authorization regression'); const base = f.git('rev-parse', 'HEAD');
  writeFileSync(appPath, good); f.git('add', 'app/app.mjs'); f.git('commit', '--quiet', '-m', 'Enforce read ownership'); const head = f.git('rev-parse', 'HEAD');
  const input = join(f.root, 'repositories.json'); const resolution = join(f.root, 'resolution.json');
  writeFileSync(input, JSON.stringify({ scope: localScope(), repositories: [{ ...f.selected, root: '.', base, head }] }));
  const selected = cli('source-resolve', '--input', input, '--output', resolution, '--json'); expect(selected.status, selected.stderr).toBe(0);
  writeFileSync(appPath, 'invalid dirty checkout must never execute'); f.git('update-ref', 'refs/heads/main', base);
  const runs: Array<{ snapshot: GitSourceSnapshot; bundle: ReturnType<typeof readVerifiedBundle>; bundleDir: string }> = [];
  for (const side of ['base', 'head'] as const) {
    const output = join(f.root, side);
    const materialized = cli('source-materialize', '--input', resolution, '--repository', f.repositoryRef.id, '--root', '.', '--side', side, '--output', output, '--json');
    expect(materialized.status, materialized.stderr).toBe(0);
    const snapshot = GitSourceSnapshot.parse(JSON.parse(readFileSync(join(output, 'snapshot.json'), 'utf8')));
    expect(verifySelfDigest(snapshot)).toBe(true); expect(snapshot.commit).toBe(side === 'base' ? base : head);
    const source = join(output, 'source');
    const compiled = cli('compile', '--config', join(source, 'tracegrove.config.yaml'), '--source-snapshot', join(output, 'snapshot.json'), '--json');
    expect(compiled.status, compiled.stderr).toBe(0);
    const doctor = cli('doctor', '--config', join(source, '.tracegrove/compiled/workflow.yaml'), '--json');
    expect(doctor.status, doctor.stderr).toBe(0);
    expect(JSON.parse(doctor.stdout).checks).toContainEqual(expect.objectContaining({ check: 'source_snapshot', state: 'ok' }));
    const run = cli('test', '--config', join(source, 'tracegrove.config.yaml'), '--source-snapshot', join(output, 'snapshot.json'), '--grep', 'notes.create-read-delete', '--json');
    expect(run.status, run.stderr).toBe(side === 'base' ? 1 : 0);
    const summary = Summary.parse(JSON.parse(run.stdout));
    expect(summary.outcome).toBe(side === 'base' ? 'assertion_failed' : 'passed');
    const appFiles = snapshot.files.filter(file => file.path.startsWith('app/')).map(file => file.path);
    expect(summary.sourceDigest).toBe(sourceIdentityDigest(source, appFiles).hex);
    const bundleDir = join(summary.runDir, 'bundle'); const bundle = readVerifiedBundle(bundleDir);
    expect(bundle.receipts).toHaveLength(1);
    const receipt = bundle.receipts[0]!;
    expect(receipt.cleanup.confirmed).toContain('host.process');
    expect(receipt.cleanup.remainingUnknownMutations).toBe(0);
    expect(receipt.cleanup.critical.every(resource => receipt.cleanup.confirmed.includes(resource))).toBe(true);
    if (side === 'base') {
      expect(receipt.assertions.some(assertion => assertion.result === 'fail')).toBe(true);
      expect(receipt.steps.some(step => JSON.stringify(step.output).includes('"status":200') && step.stepId.includes('intruder'))).toBe(true);
    }
    runs.push({ snapshot, bundle, bundleDir });
  }
  expect(runs[0]!.bundle.campaign.ref).not.toEqual(runs[1]!.bundle.campaign.ref);
  expect(runs[0]!.bundle.receipts[0]!.attemptId).not.toBe(runs[1]!.bundle.receipts[0]!.attemptId);
  const flowPath = 'tracegrove/notes/create-read-delete.flow.yaml';
  expect(runs[0]!.snapshot.files.find(file => file.path === flowPath)).toBeDefined();
  expect(runs[0]!.snapshot.files.find(file => file.path === flowPath)?.digest).toEqual(runs[1]!.snapshot.files.find(file => file.path === flowPath)?.digest);
  expect(runs[0]!.snapshot.files.find(file => file.path === 'app/app.mjs')?.digest).not.toEqual(runs[1]!.snapshot.files.find(file => file.path === 'app/app.mjs')?.digest);
  // Explicit CI opt-in retains both genuine attempts and rerunnable source inputs.
  const archive = process.env.TRACEGROVE_SOURCE_PROOF_DIR;
  if (archive) {
    mkdirSync(archive, { mode: 0o700 });
    cpSync(resolution, join(archive, 'resolution.json'));
    for (const run of runs) {
      const destination = join(archive, run.snapshot.side); mkdirSync(destination);
      writeFileSync(join(destination, 'snapshot.json'), `${JSON.stringify(run.snapshot, null, 2)}\n`, { mode: 0o600 });
      for (const file of run.snapshot.files) {
        const bytes = readFileSync(join(f.root, run.snapshot.side, 'source', file.path));
        expect(digestOfBytes(bytes)).toEqual(file.digest);
        const target = join(destination, 'source', file.path); mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes, { mode: file.mode === '100755' ? 0o700 : 0o600 });
      }
      cpSync(run.bundleDir, join(destination, 'bundle'), { recursive: true });
    }
    writeFileSync(join(archive, 'README.md'), '# Independent local source regression proof\n\nBase: assertion_failed (ownership read allowed). Head: passed (ownership read denied).\nThe saved flow is byte-identical. Each attempt has its own campaign, execution and fresh state.\n\nVerify each retained `base/bundle` and `head/bundle` with `tracegrove verify-bundle --bundle <path>`.\nIn the matching admitted local scope, rerun with `tracegrove test --config <base|head>/source/tracegrove.config.yaml --source-snapshot <base|head>/snapshot.json --grep notes.create-read-delete`.\nScope labels do not grant remote identity or cross-owner access.\nThese are local application observations, not hosted activation or deployed revision attestations.\n');
  }
}, 60_000); // Nine independent CLI processes plus real app launches; their own deadlines remain enforced.
