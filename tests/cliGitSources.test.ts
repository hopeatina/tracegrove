import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { localScope } from '../src/core/corpus.ts';
import { GitSourceResolution, verifySelfDigest } from '../src/protocol/index.ts';

const root = resolve(import.meta.dirname, '..');
const cli = (...args: string[]) => spawnSync(process.execPath,
  process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled' ? [join(root, 'dist/cli/main.js'), ...args] : ['--import', 'tsx', join(root, 'src/cli/main.ts'), ...args],
  { cwd: root, encoding: 'utf8', timeout: 30_000 });
afterEach(cleanupGitRepositories);

it('exports a sealed owner-private source resolution through the actual CLI without product-pass output', () => {
  const f = gitFixture(); const input = join(f.root, 'repositories.json'); const output = join(f.root, 'source.json');
  writeFileSync(input, JSON.stringify({ scope: localScope(), repositories: [{ ...f.selected, root: '.' }] }));
  const result = cli('source-resolve', '--input', input, '--output', output, '--json');
  expect(result.status, result.stderr).toBe(0);
  const summary = JSON.parse(result.stdout); expect(summary).toMatchObject({ repositories: 1, changedFiles: 3 });
  expect(summary).not.toHaveProperty('passed'); expect(summary).not.toHaveProperty('qualifies');
  const artifact = GitSourceResolution.parse(JSON.parse(readFileSync(output, 'utf8')));
  expect(verifySelfDigest(artifact)).toBe(true); expect(artifact.matrix.repositories[0]!.headCommit).toBe(f.head);
  if (process.platform !== 'win32') expect(statSync(output).mode & 0o777).toBe(0o600);
  const repeated = cli('source-resolve', '--input', input, '--output', output, '--json');
  expect(repeated.status).toBe(2); expect(repeated.stderr).toContain('already exists');
  expect(JSON.parse(readFileSync(output, 'utf8')).ref).toEqual(artifact.ref);
});
it('refuses malformed/oversized input and foreign scope before writing output', () => {
  const f = gitFixture(); const input = join(f.root, 'repositories.json'); const output = join(f.root, 'source.json');
  for (const text of ['{', ' '.repeat(256 * 1024 + 1), JSON.stringify({ scope: { ...localScope(), ownerId: 'foreign' }, repositories: [f.selected] })]) {
    writeFileSync(input, text); const result = cli('source-resolve', '--input', input, '--output', output);
    expect(result.status, result.stderr).toBe(2); expect(existsSync(output)).toBe(false);
  }
});
it('rejects incomplete source resolution without creating a partial output', () => {
  const f = gitFixture(); const input = join(f.root, 'repositories.json'); const output = join(f.root, 'source.json');
  writeFileSync(input, JSON.stringify({ scope: localScope(), repositories: [{ ...f.selected, head: 'missing-private-ref' }] }));
  const result = cli('source-resolve', '--input', input, '--output', output, '--json');
  expect(result.status).toBe(2); expect(existsSync(output)).toBe(false); expect(result.stderr).not.toContain('missing-private-ref');
});
it('rejects an ignored scope/actor flag before opening even a nonexistent input', () => {
  const result = cli('source-resolve', '--input', '/missing-source-file.json', '--output', '/unused.json', '--actor', 'claimed-owner');
  expect(result.status).toBe(2); expect(result.stderr).toContain('unknown_flag'); expect(result.stderr).not.toContain('ENOENT');
});
