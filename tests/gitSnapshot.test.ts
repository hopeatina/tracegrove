import { afterEach, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { resolveGitSources } from '../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../src/core/gitSnapshot.ts';
import { localScope } from '../src/core/corpus.ts';
import { digestOfBytes, freeze, verifySelfDigest } from '../src/protocol/index.ts';

afterEach(cleanupGitRepositories);
const allow = async () => {};
async function selected(f: ReturnType<typeof gitFixture>, base = f.base, head = f.head) {
  return resolveGitSources({ scope: localScope(), repositories: [{ ...f.selected, base, head }] }, allow);
}

it.each(['sha1', 'sha256'] as const)('materializes complete immutable %s trees despite dirty files and moved refs', async format => {
  const f = gitFixture('app', format); const resolution = await selected(f);
  writeFileSync(join(f.root, 'route.ts'), 'dirty private bytes');
  f.git('update-ref', 'refs/heads/main', f.base);
  for (const side of ['base', 'head'] as const) {
    const result = await materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side, root: f.root, output: join(f.root, side) }, allow);
    expect(result.snapshot.commit).toBe(side === 'base' ? f.base : f.head);
    expect(verifySelfDigest(result.snapshot)).toBe(true);
    expect(readFileSync(join(result.sourceDir, 'route.ts'), 'utf8')).toBe(`export const authorized = ${side === 'base' ? 'false' : 'true'};\n`);
    expect(existsSync(join(result.sourceDir, 'deleted.txt'))).toBe(side === 'base');
    expect(existsSync(join(result.sourceDir, 'space name.txt'))).toBe(side === 'head');
    for (const entry of result.snapshot.files) expect(digestOfBytes(readFileSync(join(result.sourceDir, entry.path)))).toEqual(entry.digest);
    expect(JSON.parse(readFileSync(result.manifestPath, 'utf8'))).toEqual(result.snapshot);
    expect(existsSync(join(result.sourceDir, '.git'))).toBe(false);
    if (process.platform !== 'win32') {
      expect(statSync(result.sourceDir).mode & 0o777).toBe(0o700);
      expect(statSync(result.manifestPath).mode & 0o777).toBe(0o600);
    }
  }
});

it('refuses revoked authority before publishing any files and preserves existing output', async () => {
  const f = gitFixture(); const resolution = await selected(f); const output = join(f.root, 'snapshot');
  let checks = 0;
  await expect(materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output }, async () => {
    if (++checks > 1) throw new Error('authority revoked');
  })).rejects.toThrow('authority revoked');
  expect(existsSync(output)).toBe(false);
  const result = await materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output }, allow);
  const saved = readFileSync(result.manifestPath);
  await expect(materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'base', root: f.root, output }, allow)).rejects.toThrow('already exists');
  expect(readFileSync(result.manifestPath)).toEqual(saved);
});

it('materializes executable files from an authorized bare object store without a checkout', async () => {
  const f = gitFixture(); writeFileSync(join(f.root, 'run.sh'), '#!/bin/sh\nexit 0\n');
  f.git('add', 'run.sh'); f.git('update-index', '--chmod=+x', 'run.sh'); f.git('commit', '--quiet', '-m', 'Executable input');
  const resolution = await selected(f, f.base, f.git('rev-parse', 'HEAD'));
  const bare = join(f.root, 'mirror.git'); f.git('clone', '--quiet', '--bare', f.root, bare);
  const result = await materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: bare, output: join(f.root, 'snapshot') }, allow);
  expect(result.snapshot.files.find(file => file.path === 'run.sh')?.mode).toBe('100755');
  expect(readFileSync(join(result.sourceDir, 'run.sh'), 'utf8')).toBe('#!/bin/sh\nexit 0\n');
  if (process.platform !== 'win32') expect(statSync(join(result.sourceDir, 'run.sh')).mode & 0o777).toBe(0o700);
});

it('rejects tampered resolution, mismatched scope and substituted repository before output', async () => {
  const f = gitFixture(); const resolution = await selected(f); const output = join(f.root, 'snapshot');
  const tampered = structuredClone(resolution); tampered.matrix.repositories[0]!.headCommit = f.base;
  const foreign = freeze({ ...resolution, scope: { ...resolution.scope, ownerId: 'foreign' } });
  for (const candidate of [tampered, foreign]) await expect(materializeGitSnapshot({ resolution: candidate, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output }, allow)).rejects.toThrow();
  await expect(materializeGitSnapshot({ resolution, repositoryRef: { ...f.repositoryRef, id: 'other' }, side: 'head', root: f.root, output }, allow)).rejects.toThrow('exactly one');
  expect(existsSync(output)).toBe(false);
});

it.each(['symlink', 'oversized'] as const)('rejects an unchanged %s instead of silently dropping source coverage', async kind => {
  const f = gitFixture();
  if (kind === 'symlink') symlinkSync('route.ts', join(f.root, 'unchanged'));
  else writeFileSync(join(f.root, 'unchanged'), Buffer.alloc(1_048_577));
  f.git('add', 'unchanged'); f.git('commit', '--quiet', '-m', 'Unchanged source input'); const base = f.git('rev-parse', 'HEAD');
  writeFileSync(join(f.root, 'route.ts'), 'changed'); f.git('add', 'route.ts'); f.git('commit', '--quiet', '-m', 'Small change');
  const resolution = await selected(f, base, f.git('rev-parse', 'HEAD')); const output = join(f.root, 'snapshot');
  await expect(materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output }, allow)).rejects.toThrow();
  expect(existsSync(output)).toBe(false);
});

it.each(['reserved-device', 'directory-alias'] as const)('refuses %s paths before writing a portable snapshot', async kind => {
  const f = gitFixture(); const blob = f.git('hash-object', '-w', 'route.ts');
  const paths = kind === 'reserved-device' ? ['CON.txt'] : ['Dir/one', 'dir/two'];
  for (const path of paths) f.git('update-index', '--add', '--cacheinfo', '100644', blob, path);
  f.git('commit', '--quiet', '-m', 'Unsupported portable names');
  const resolution = await selected(f, f.base, f.git('rev-parse', 'HEAD')); const output = join(f.root, 'snapshot');
  await expect(materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output }, allow)).rejects.toThrow();
  expect(existsSync(output)).toBe(false);
});
