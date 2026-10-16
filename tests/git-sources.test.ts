import { afterEach, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { resolveGitSources, GitSourceReader } from '../src/core/gitSources.ts';
import { Conflict } from '../src/core/errors.ts';
import { verifySourceCitation } from '../src/core/source-citation.ts';
import { digestOfBytes, freeze, refKey, verifySelfDigest, type Scope } from '../src/protocol/index.ts';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';

const scope: Scope = { ownerId: 'owner', tenantId: null, visibility: 'owner_private' };
afterEach(() => { vi.unstubAllEnvs(); cleanupGitRepositories(); });
it('freezes complete multi-repository pairs, diffs and added/deleted/modified bytes without local root paths', async () => {
  const first = gitFixture(); const second = gitFixture('worker');
  const authorization = vi.fn(async () => {});
  const result = await resolveGitSources({ scope, repositories: [first.selected, second.selected] }, authorization);
  expect(verifySelfDigest(result)).toBe(true); expect(verifySelfDigest(result.matrix)).toBe(true);
  expect(result.matrix.repositories.map(row => row.headCommit)).toEqual([first.head, second.head]);
  expect(result.changes.map(c => c.status).sort()).toEqual(['A', 'A', 'D', 'D', 'M', 'M']);
  expect(authorization).toHaveBeenCalledTimes(2); expect(JSON.stringify(result)).not.toContain(first.root);
  for (const payload of result.payloads) expect(digestOfBytes(Buffer.from(payload.base64, 'base64'))).toEqual(payload.ref.digest);
  const changed = result.changes.find(c => c.path === 'route.ts' && c.repositoryRef.id === first.repositoryRef.id)!;
  const bytes = (ref: typeof changed.headBlobRef) => Buffer.from(result.payloads.find(p => refKey(p.ref) === refKey(ref!))!.base64, 'base64').toString();
  expect(bytes(changed.baseBlobRef)).toContain('false'); expect(bytes(changed.headBlobRef)).toContain('true');
});
it('reads pinned citations and diffs after dirty checkout changes and moved branch names, including a reopened reader', async () => {
  const f = gitFixture(); const result = await resolveGitSources({ scope, repositories: [f.selected] }, async () => {});
  const expected = Buffer.from('export const authorized = true;\n');
  const citation = freeze({ ref: { id: 'citation', revision: '1' }, repositoryRef: f.repositoryRef, resolvedCommit: f.head,
    path: 'route.ts', fileDigest: digestOfBytes(expected), lineStart: 1, lineEnd: 1, excerptDigest: digestOfBytes(expected), symbol: 'authorized' });
  writeFileSync(join(f.root, 'route.ts'), 'private checkout contents'); f.git('update-ref', 'refs/heads/main', f.base);
  const reader = new GitSourceReader(result.matrix, [{ root: f.root, repositoryRef: f.repositoryRef }], async () => {});
  expect((await verifySourceCitation(reader, citation, scope)).fileBytes).toBe(expected.length);
  expect(digestOfBytes(Buffer.from(await reader.readDiff(scope, result.matrix.repositories[0]!)))).toEqual(result.matrix.repositories[0]!.diffRef.digest);
  expect(f.git('status', '--porcelain')).toContain('route.ts');
});
it('refuses missing or ambiguous objects, missing common history and option-like revisions without checkout fallback', async () => {
  const f = gitFixture();
  await expect(resolveGitSources({ scope, repositories: [{ ...f.selected, head: 'unavailable-private-ref' }] }, async () => {})).rejects.toThrow('rev-parse failed');
  await expect(resolveGitSources({ scope, repositories: [{ ...f.selected, head: '--help' }] }, async () => {})).rejects.toThrow();
  f.git('checkout', '--quiet', '--orphan', 'unrelated'); f.git('add', '-A'); f.git('commit', '--quiet', '-m', 'Unrelated root');
  await expect(resolveGitSources({ scope, repositories: [{ ...f.selected, head: 'unrelated' }] }, async () => {})).rejects.toThrow('merge base unavailable');
});
it('rejects duplicate mappings, parent-repository fallback and unauthorized source access', async () => {
  const f = gitFixture(); const denied = vi.fn(async () => { throw new Error('source denied'); });
  await expect(resolveGitSources({ scope, repositories: [f.selected] }, denied)).rejects.toThrow('source denied');
  await expect(resolveGitSources({ scope, repositories: [f.selected, f.selected] }, async () => {})).rejects.toThrow('duplicate');
  mkdirSync(join(f.root, 'nested'));
  await expect(resolveGitSources({ scope, repositories: [{ ...f.selected, root: join(f.root, 'nested') }] }, async () => {})).rejects.toThrow('exact worktree');
});
it('ignores inherited Git routing variables and replacement objects', async () => {
  const f = gitFixture(); const other = gitFixture('other');
  f.git('replace', f.head, f.base);
  vi.stubEnv('GIT_DIR', join(other.root, '.git')); vi.stubEnv('GIT_WORK_TREE', other.root);
  const result = await resolveGitSources({ scope, repositories: [f.selected] }, async () => {});
  expect(result.changes).toHaveLength(3); expect(result.matrix.repositories[0]!.headCommit).toBe(f.head);
});
it('does not execute configured external diff/text-conversion helpers', async () => {
  const f = gitFixture(); const marker = join(f.root, 'helper-executed'); const helper = join(f.root, 'helper.sh');
  writeFileSync(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`); chmodSync(helper, 0o700);
  f.git('config', 'diff.external', helper); f.git('config', 'diff.custom.textconv', helper);
  writeFileSync(join(f.root, '.gitattributes'), '*.ts diff=custom\n');
  const result = await resolveGitSources({ scope, repositories: [f.selected] }, async () => {});
  expect(result.changes).toHaveLength(3); expect(existsSync(marker)).toBe(false);
});
it('blocks changed symlinks and oversized blobs instead of exporting partial source coverage', async () => {
  const f = gitFixture(); symlinkSync('route.ts', join(f.root, 'link')); f.git('add', 'link'); f.git('commit', '--quiet', '-m', 'Link fixture');
  await expect(resolveGitSources({ scope, repositories: [f.selected] }, async () => {})).rejects.toThrow('symlink');
  const big = gitFixture('big'); writeFileSync(join(big.root, 'big.txt'), Buffer.alloc(1_048_577, 65));
  big.git('add', 'big.txt'); big.git('commit', '--quiet', '-m', 'Oversized fixture');
  await expect(resolveGitSources({ scope, repositories: [big.selected] }, async () => {})).rejects.toThrow('cat-file failed');
});
it('never lazy-fetches missing blobs from a configured promisor remote', async () => {
  const f = gitFixture(); const blob = f.git('rev-parse', `${f.head}:route.ts`);
  unlinkSync(join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  f.git('config', 'remote.origin.promisor', 'true'); f.git('config', 'remote.origin.url', 'https://example.invalid/no-fetch.git');
  await expect(resolveGitSources({ scope, repositories: [f.selected] }, async () => {})).rejects.toThrow('cat-file failed');
});
it('rechecks source read scope, selection identity and fresh authorization', async () => {
  const f = gitFixture(); const result = await resolveGitSources({ scope, repositories: [f.selected] }, async () => {});
  const authorize = vi.fn(async () => {}); const reader = new GitSourceReader(result.matrix, [f.selected].map(({ root, repositoryRef }) => ({ root, repositoryRef })), authorize);
  await expect(reader.readDiff({ ...scope, ownerId: 'foreign' }, result.matrix.repositories[0]!)).rejects.toThrow('scope');
  await expect(reader.readDiff(scope, { ...result.matrix.repositories[0]!, headCommit: f.base })).rejects.toThrow('binding');
  expect(authorize).not.toHaveBeenCalled();
  authorize.mockRejectedValueOnce(new Error('revoked'));
  await expect(reader.readDiff(scope, result.matrix.repositories[0]!)).rejects.toThrow('revoked');
});
it('resolves SHA-256 Git object IDs without truncating them', async () => {
  const f = gitFixture('sha256-repository', 'sha256');
  const result = await resolveGitSources({ scope, repositories: [f.selected] }, async () => {});
  expect(result.matrix.repositories[0]!.headCommit).toHaveLength(64); expect(result.changes).toHaveLength(3);
});
it('resolves a bare repository using the same immutable object contract', async () => {
  const f = gitFixture(); const bare = join(f.root, 'bare.git'); f.git('clone', '--quiet', '--bare', f.root, bare);
  const result = await resolveGitSources({ scope, repositories: [{ ...f.selected, root: bare }] }, async () => {});
  expect(result.matrix.repositories[0]!.headCommit).toBe(f.head); expect(result.changes).toHaveLength(3);
});
it('rejects corrupt blob bytes even when Git can decompress the object under its old identity', async () => {
  const f = gitFixture(); const blob = f.git('rev-parse', `${f.head}:route.ts`);
  const path = join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2));
  const original = inflateSync(readFileSync(path)).toString();
  chmodSync(path, 0o600);
  writeFileSync(path, deflateSync(Buffer.from(original.replace('true', 'fake'))));
  await expect(resolveGitSources({ scope, repositories: [f.selected] }, async () => {})).rejects.toBeInstanceOf(Conflict);
});
it.each(['commit', 'tree'] as const)('rejects a corrupt selected %s instead of trusting its filename', async type => {
  const f = gitFixture(); const id = type === 'commit' ? f.head : f.git('rev-parse', `${f.head}^{tree}`);
  const path = join(f.root, '.git/objects', id.slice(0, 2), id.slice(2));
  const bytes = inflateSync(readFileSync(path));
  const original = Buffer.from(type === 'commit' ? 'Head fixture' : 'route.ts');
  const replacement = Buffer.from(type === 'commit' ? 'Fake fixture' : 'wrong.ts');
  const offset = bytes.indexOf(original); expect(offset).toBeGreaterThan(-1); replacement.copy(bytes, offset);
  chmodSync(path, 0o600); writeFileSync(path, deflateSync(bytes));
  await expect(resolveGitSources({ scope, repositories: [f.selected] }, async () => {})).rejects.toBeInstanceOf(Conflict);
});
