import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join } from 'node:path';
import { digestOfBytes, type Ref } from '../../src/protocol/index.ts';

const roots: string[] = [];
export function cleanupGitRepositories() { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); }
export function gitFixture(id = 'application', objectFormat: 'sha1' | 'sha256' = 'sha1') {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-git-')); roots.push(root);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, '-c', `core.hooksPath=${devNull}`, '-c', 'commit.gpgsign=false',
    '-c', 'gc.auto=0', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('init', '--quiet', `--object-format=${objectFormat}`); git('symbolic-ref', 'HEAD', 'refs/heads/main');
  git('config', 'user.name', 'Conformance'); git('config', 'user.email', 'conformance@example.invalid');
  writeFileSync(join(root, 'route.ts'), 'export const authorized = false;\n'); writeFileSync(join(root, 'deleted.txt'), 'remove\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'Base fixture'); const base = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'route.ts'), 'export const authorized = true;\n'); unlinkSync(join(root, 'deleted.txt'));
  writeFileSync(join(root, 'space name.txt'), 'space\n'); git('add', '-A'); git('commit', '--quiet', '-m', 'Head fixture');
  const head = git('rev-parse', 'HEAD'); const repositoryRef: Ref = { id, revision: '1', digest: digestOfBytes(id) };
  return { root, git, base, head, repositoryRef, selected: { root, repositoryRef, base, head: 'main' } };
}
