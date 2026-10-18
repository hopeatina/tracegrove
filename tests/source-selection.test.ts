import { afterEach, expect, it } from 'vitest';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { localScope } from '../src/core/corpus.ts';
import { resolveGitSources } from '../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../src/core/gitSnapshot.ts';
import { compileProject, loadAuthoringConfig } from '../src/authoring/compile.ts';
import { previewVerificationSource, saveVerificationSource } from '../src/authoring/verificationSource.ts';
import { readLocalSettings, writeLocalSettings } from '../src/authoring/localSettings.ts';
import { readSavedRun } from '../src/authoring/savedRun.ts';
import { readRunSource } from '../src/authoring/runSource.ts';
import { runTests } from '../src/authoring/run.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { spawnSync } from 'node:child_process';

const servers: UiServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); cleanupGitRepositories(); });
async function project() {
  const f = gitFixture(); cpSync(join(import.meta.dirname, '../src/samples/notes-api'), f.root, { recursive: true });
  f.git('add', '.'); f.git('commit', '--quiet', '-m', 'Application snapshot'); const commit = f.git('rev-parse', 'HEAD');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...f.selected, base: commit, head: commit }] }, async () => {});
  const snapshot = await materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output: join(f.root, 'snapshot') }, async () => {});
  const configPath = join(f.root, 'tracegrove.config.yaml');
  return { ...f, ...snapshot, configPath, config: loadAuthoringConfig(configPath) };
}

it('previews without writes or launches, saves an exact ref, and uses shared scenarios with snapshot application bytes', async () => {
  const p = await project(); const original = readFileSync(p.configPath, 'utf8');
  const candidate = previewVerificationSource(p.root, p.manifestPath, p.config);
  expect(existsSync(join(p.root, '.tracegrove'))).toBe(false);
  writeLocalSettings(p.root, { agent: { provider: 'none', maxBudgetUsd: 0.25 } });
  saveVerificationSource(p.root, candidate.selection, p.config);
  // A dirty application in the workbench cannot substitute for the selected snapshot.
  writeFileSync(join(p.root, 'app/app.mjs'), 'throw new Error("wrong application");');
  const { report } = await runTests({ configPath: p.configPath, grep: 'notes.list' });
  expect(report.outcome, JSON.stringify(report.blockers)).toBe('passed');
  expect(report.sourceBinding).toEqual(candidate.binding);
  const saved = readSavedRun(p.root, report.runDir.split('/').at(-1)!);
  expect(saved.savedEvidence.status).toBe('verified');
  expect(readRunSource(saved.runDir, saved)).toMatchObject({ sourceChecked: true, sourceBinding: candidate.binding, bundleVerified: true });
  expect(readFileSync(p.configPath, 'utf8')).toBe(original);
  expect(readLocalSettings(p.root).agent).toEqual({ provider: 'none', maxBudgetUsd: 0.25 });
  expect(readRunSource(report.runDir, { ...report, sourceBinding: { kind: 'working_tree' } })).toMatchObject({ sourceChecked: true, sourceBinding: candidate.binding });
  saveVerificationSource(p.root, { kind: 'working_tree' }, p.config);
  expect(compileProject(p.configPath).sourceBinding).toEqual({ kind: 'working_tree' });
  expect(readRunSource(report.runDir, report).sourceBinding).toEqual(candidate.binding);
  writeFileSync(join(report.runDir, 'bundle', 'campaign.json'), '{}');
  expect(readRunSource(report.runDir, report)).toMatchObject({ sourceChecked: false, sourceBinding: null, bundleVerified: false });
});

it('blocks byte drift and changed manifests, never silently falls back to the working tree', async () => {
  const p = await project(); const candidate = previewVerificationSource(p.root, p.manifestPath, p.config);
  saveVerificationSource(p.root, candidate.selection, p.config);
  writeFileSync(join(p.sourceDir, 'app/app.mjs'), 'changed bytes');
  expect(() => compileProject(p.configPath)).toThrow('snapshot_source_changed');
  expect(() => saveVerificationSource(p.root, candidate.selection, p.config)).toThrow();
  expect(readLocalSettings(p.root).verification?.source).toEqual(candidate.selection);
  writeFileSync(p.manifestPath, 'secret-marker-that-must-not-appear');
  expect(() => compileProject(p.configPath)).toThrow('Choose a bounded, regular source snapshot manifest with valid metadata');
  try { compileProject(p.configPath); }
  catch (error) { expect(String(error)).not.toContain('secret-marker'); }
  saveVerificationSource(p.root, { kind: 'working_tree' }, p.config);
  expect(compileProject(p.configPath).sourceBinding).toEqual({ kind: 'working_tree' });
});

it('requires a current session token for source routes and preserves agent settings through save', async () => {
  const p = await project(); writeLocalSettings(p.root, { agent: { provider: 'none', maxBudgetUsd: 0.5 } });
  const server = await startUi({ dir: p.root }); servers.push(server);
  const page = await (await fetch(server.url)).text(); const token = page.match(/const TOKEN='([^']+)'/)![1]!;
  const post = (path: string, body: unknown, authorized = true) => fetch(new URL(path, server.url), {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { 'x-tracegrove-token': token } : {}) }, body: JSON.stringify(body),
  });
  expect((await post('/api/source/preview', { path: p.manifestPath }, false)).status).toBe(403);
  expect((await post('/api/source', { source: { kind: 'working_tree' } }, false)).status).toBe(403);
  const preview = await post('/api/source/preview', { path: p.manifestPath }); expect(preview.status).toBe(200);
  const candidate = await preview.json();
  expect((await post('/api/source', { source: candidate.selection })).status).toBe(200);
  const overview = await (await fetch(new URL('/api/overview', server.url))).json();
  expect(overview.verificationSource).toMatchObject({ status: 'ready', binding: candidate.binding });
  expect(readLocalSettings(p.root).agent).toEqual({ provider: 'none', maxBudgetUsd: 0.5 });
  const executed = await post('/api/test', { grep: 'notes.list' }); expect(executed.status).toBe(200);
  expect(await executed.json()).toMatchObject({ outcome: 'passed', sourceChecked: true, sourceBinding: candidate.binding });
});

it('pins the reviewed manifest ref and requires review again when a valid replacement arrives', async () => {
  const p = await project(); const candidate = previewVerificationSource(p.root, p.manifestPath, p.config);
  saveVerificationSource(p.root, candidate.selection, p.config);
  writeFileSync(join(p.root, 'new-file.txt'), 'new source revision'); p.git('add', 'new-file.txt'); p.git('commit', '--quiet', '-m', 'Another revision');
  const commit = p.git('rev-parse', 'HEAD');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...p.selected, base: commit, head: commit }] }, async () => {});
  const next = await materializeGitSnapshot({ resolution, repositoryRef: p.repositoryRef, side: 'head', root: p.root, output: join(p.root, 'next') }, async () => {});
  cpSync(next.sourceDir, p.sourceDir, { recursive: true }); cpSync(next.manifestPath, p.manifestPath);
  expect(() => compileProject(p.configPath)).toThrow('source_selection_changed');
  expect(() => saveVerificationSource(p.root, candidate.selection, p.config)).toThrow('source_selection_changed');
  expect(compileProject(p.configPath, { sourceSnapshot: next.manifestPath }).sourceBinding).toMatchObject({ kind: 'snapshot', commit });
  saveVerificationSource(p.root, previewVerificationSource(p.root, p.manifestPath, p.config).selection, p.config);
  expect(compileProject(p.configPath).sourceBinding).toMatchObject({ kind: 'snapshot', commit });
});

it('CLI settings saves a snapshot default, rejects conflicting switches atomically, and clears it', async () => {
  const p = await project();
  const cli = (...args: string[]) => spawnSync(process.execPath,
    ['--import', 'tsx', join(import.meta.dirname, '../src/cli/main.ts'), 'settings', '--dir', p.root, '--json', ...args],
    { encoding: 'utf8', timeout: 30000 });
  const saved = cli('--source-snapshot', p.manifestPath, '--agent', 'none'); expect(saved.status, saved.stderr).toBe(0);
  expect(JSON.parse(saved.stdout).verificationSource.kind).toBe('snapshot');
  const before = readLocalSettings(p.root);
  expect(cli('--working-tree', '--source-snapshot', p.manifestPath, '--agent', 'codex').status).toBe(2);
  expect(readLocalSettings(p.root)).toEqual(before);
  const cleared = cli('--working-tree'); expect(cleared.status, cleared.stderr).toBe(0);
  expect(JSON.parse(cleared.stdout).verificationSource).toEqual({ kind: 'working_tree' });
  expect(readLocalSettings(p.root).agent?.provider).toBe('none');
}, 30000);
