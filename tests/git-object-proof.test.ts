import { afterEach, expect, it } from 'vitest';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture, cleanupGitRepositories } from './fixtures/git.ts';
import { resolveGitSources } from '../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../src/core/gitSnapshot.ts';
import { localScope } from '../src/core/corpus.ts';
import { readGitSnapshotTree } from '../src/source/snapshotTree.ts';
import { gitObjectId, verifyGitSnapshotCommit, verifyGitSnapshotProofMetadata } from '../src/source/gitObjectProof.ts';
import { GitSourceSnapshot, digestOfBytes, freeze } from '../src/protocol/index.ts';

afterEach(cleanupGitRepositories);
async function fixture(format: 'sha1' | 'sha256' = 'sha1') {
  const f = gitFixture('proof-source', format);
  for (const dir of ['left', 'right']) { mkdirSync(join(f.root, dir)); writeFileSync(join(f.root, dir, 'shared.bin'), Buffer.from([0, 255, 13, 10])); }
  f.git('add', '.'); f.git('commit', '--quiet', '-m', 'Shared binary subtrees'); const head = f.git('rev-parse', 'HEAD');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...f.selected, head }] }, async () => {});
  const result = await materializeGitSnapshot({ resolution, repositoryRef: f.repositoryRef, side: 'head', root: f.root, output: join(f.root, 'snapshot') }, async () => {});
  return { ...f, ...result, head, files: readGitSnapshotTree(result.snapshot, result.sourceDir) };
}
it.each(['sha1', 'sha256'] as const)('verifies complete %s object closure, binary bytes and reused subtrees after Git is unavailable', async format => {
  const f = await fixture(format); const observed = verifyGitSnapshotCommit(f.snapshot, f.files);
  const tree = f.git('rev-parse', `${f.head}^{tree}`);
  expect(observed).toMatchObject({ commit: f.head, tree, algorithm: format, verification: 'actual_file_bytes' });
  expect(verifyGitSnapshotProofMetadata(f.snapshot)).toEqual({ verification: 'object_links_only', binding: {
    algorithm: observed.algorithm, commit: observed.commit, tree: observed.tree, proofDigest: observed.proofDigest } });
  // Pure verification consumes captured bytes and objects, never invokes Git or reads a checkout.
  renameSync(join(f.root, '.git'), join(f.root, 'git-unavailable'));
  renameSync(f.sourceDir, join(f.root, 'source-unavailable'));
  expect(verifyGitSnapshotCommit(f.snapshot, f.files)).toEqual(observed);
});
it.each(['commit', 'commit-bytes', 'tree-bytes', 'missing-tree', 'duplicate-tree', 'file-object', 'file-mode', 'unrelated-tree', 'base64'] as const)(
  'refuses resealed %s substitution', async kind => {
    const f = await fixture(); const candidate = structuredClone(f.snapshot); const proof = candidate.commitProof!;
    if (kind === 'commit') candidate.commit = f.base;
    if (kind === 'commit-bytes') proof.commitBase64 = Buffer.from('invented commit').toString('base64');
    if (kind === 'tree-bytes') proof.trees[0]!.base64 = Buffer.from('changed tree').toString('base64');
    if (kind === 'missing-tree') proof.trees = proof.trees.slice(1);
    if (kind === 'duplicate-tree') proof.trees.push(proof.trees[0]!);
    if (kind === 'file-object') candidate.files[0]!.objectId = '0'.repeat(f.head.length);
    if (kind === 'file-mode') candidate.files[0]!.mode = candidate.files[0]!.mode === '100644' ? '100755' : '100644';
    if (kind === 'unrelated-tree') proof.trees.push({ objectId: gitObjectId('tree', Buffer.alloc(0), 'sha1'), base64: '' });
    if (kind === 'base64') proof.commitBase64 += '\n';
    expect(() => verifyGitSnapshotCommit(freeze(candidate), f.files)).toThrow();
  });
it('cannot bind replacement SHA-256 file hashes to old Git blob identities without reading actual bytes', async () => {
  const f = await fixture(); const candidate = structuredClone(f.snapshot); const files = structuredClone(f.files).map(file => ({ ...file, bytes: Buffer.from(file.bytes) }));
  const target = candidate.files[0]!; const actual = files.find(file => file.path === target.path)!;
  actual.bytes = Buffer.from('different actual source'); target.bytes = actual.bytes.length; target.digest = digestOfBytes(actual.bytes);
  const resealed = GitSourceSnapshot.parse(freeze(candidate));
  expect(verifyGitSnapshotProofMetadata(resealed).verification).toBe('object_links_only');
  expect(() => verifyGitSnapshotCommit(resealed, files)).toThrow('Actual snapshot bytes');
  writeFileSync(join(f.sourceDir, target.path), actual.bytes);
  expect(() => readGitSnapshotTree(resealed, f.sourceDir)).toThrow('Actual snapshot bytes');
});
it('requires every actual file and rejects missing proof or oversized declared byte coverage', async () => {
  const f = await fixture(); expect(() => verifyGitSnapshotCommit(f.snapshot, f.files.slice(1))).toThrow('complete actual');
  const { commitProof: _proof, ...legacy } = f.snapshot;
  expect(() => verifyGitSnapshotCommit(freeze(legacy), f.files)).toThrow('missing');
  const oversized = freeze({ ...f.snapshot, files: Array.from({ length: 33 }, (_, i) => ({ ...f.snapshot.files[0]!, path: `file-${i}`, bytes: 1_048_576 })) });
  expect(() => verifyGitSnapshotProofMetadata(oversized)).toThrow('total file byte bound');
});
it('captures one file buffer before both hashes instead of accepting a changing bytes getter', async () => {
  const f = await fixture(); const files = [...f.files]; const original = files[0]!; const replacement = Buffer.from(original.bytes);
  replacement[0] = replacement[0]! ^ 1;
  const counterfeit = freeze({ ...f.snapshot, files: f.snapshot.files.map(file => file.path === original.path ? { ...file, digest: digestOfBytes(replacement) } : file) });
  let reads = 0;
  files[0] = Object.defineProperty({ path: original.path, mode: original.mode }, 'bytes', { get: () => ++reads < 3 ? replacement : original.bytes }) as typeof original;
  expect(() => verifyGitSnapshotCommit(counterfeit, files)).toThrow('Actual snapshot bytes');
});
