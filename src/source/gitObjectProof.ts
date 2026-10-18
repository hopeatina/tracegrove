import { createHash } from 'node:crypto';
import { GitSourceSnapshot, GIT_COMMIT_PROOF_LIMITS, GIT_SNAPSHOT_LIMITS, digestOfBytes, digestOfValue, sameDigest, verifySelfDigest,
  type GitCommitObservation } from '../protocol/index.ts';
import { Conflict } from '../core/errors.ts';
import { assertSnapshotPaths } from './snapshotPaths.ts';
import type { SnapshotFile } from './snapshotTree.ts';

export function gitObjectId(type: 'commit' | 'tree' | 'blob', bytes: Uint8Array, algorithm: 'sha1' | 'sha256'): string {
  return createHash(algorithm).update(`${type} ${bytes.byteLength}\0`).update(bytes).digest('hex');
}
function decode(value: string, bound: number): Buffer {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > bound || bytes.toString('base64') !== value) throw new Conflict('Git object proof has noncanonical or oversized bytes');
  return bytes;
}
type GitObjectBinding = Omit<GitCommitObservation, 'verification'>;
function verify(input: unknown, actual?: SnapshotFile[]): GitObjectBinding {
  const snapshot = GitSourceSnapshot.parse(input);
  if (!verifySelfDigest(snapshot) || !snapshot.commitProof) throw new Conflict('Git commit proof is missing or its snapshot seal changed');
  if (snapshot.files.reduce((sum, file) => sum + file.bytes, 0) > GIT_SNAPSHOT_LIMITS.totalBytes) throw new Conflict('Git proof snapshot exceeds the total file byte bound');
  const proof = snapshot.commitProof; const algorithm = snapshot.commit.length === 40 ? 'sha1' : 'sha256'; const oidBytes = algorithm === 'sha1' ? 20 : 32;
  const commit = decode(proof.commitBase64, GIT_COMMIT_PROOF_LIMITS.commitBytes);
  const observedCommit = gitObjectId('commit', commit, algorithm);
  if (observedCommit !== snapshot.commit) throw new Conflict('Git commit object disagrees with selected snapshot commit');
  const root = /^tree ([a-f0-9]{40}|[a-f0-9]{64})\n/.exec(commit.toString('utf8'))?.[1];
  if (!root || root.length !== snapshot.commit.length) throw new Conflict('Git commit proof has no valid root tree');
  const trees = new Map<string, Buffer>(); let total = 0;
  for (const entry of proof.trees) {
    const bytes = decode(entry.base64, GIT_COMMIT_PROOF_LIMITS.treeBytes); total += bytes.length;
    if (total > GIT_COMMIT_PROOF_LIMITS.totalTreeBytes || trees.has(entry.objectId) ||
        gitObjectId('tree', bytes, algorithm) !== entry.objectId) throw new Conflict('Git tree object proof is duplicated, oversized or changed');
    trees.set(entry.objectId, bytes);
  }
  assertSnapshotPaths(snapshot.files.map(file => file.path));
  const declared = new Map(snapshot.files.map(file => [file.path, file]));
  if (actual && actual.length !== declared.size) throw new Conflict('Git proof needs the complete actual snapshot file closure');
  const files = actual ? new Map(actual.map(file => {
    const path = file.path; const mode = file.mode; const source = file.bytes; const expected = declared.get(path);
    if (!expected || mode !== expected.mode || !(source instanceof Uint8Array) || source.byteLength !== expected.bytes) throw new Conflict('Actual snapshot bytes disagree with the declared file closure');
    return [path, { path, mode, bytes: Buffer.from(source) }] as const;
  })) : null;
  if (files && (files.size !== actual!.length || files.size !== declared.size)) throw new Conflict('Git proof needs the complete actual snapshot file closure');
  const visited = new Set<string>(); const paths = new Set<string>();
  const pending = [{ id: root, prefix: '' }]; let nodes = 0;
  while (pending.length) {
    const selected = pending.pop()!; const bytes = trees.get(selected.id);
    if (!bytes) throw new Conflict('Git tree object closure is incomplete');
    if (!bytes.length) throw new Conflict('Git snapshot cannot materialize empty Git directories');
    visited.add(selected.id); let offset = 0; const names = new Set<string>();
    while (offset < bytes.length) {
      if (++nodes > GIT_COMMIT_PROOF_LIMITS.nodes) throw new Conflict('Git object proof exceeds the complete traversal bound');
      const space = bytes.indexOf(32, offset); const nul = bytes.indexOf(0, space + 1);
      if (space < offset || nul <= space + 1 || nul + 1 + oidBytes > bytes.length) throw new Conflict('Git tree object record is truncated');
      const mode = bytes.subarray(offset, space).toString('ascii');
      const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(space + 1, nul));
      if (names.has(name) || name.includes('/') || name === '.' || name === '..' || !name) throw new Conflict('Git tree object has an ambiguous path');
      names.add(name); const path = selected.prefix ? `${selected.prefix}/${name}` : name;
      assertSnapshotPaths([path]);
      const id = bytes.subarray(nul + 1, nul + 1 + oidBytes).toString('hex'); offset = nul + 1 + oidBytes;
      if (mode === '40000') { pending.push({ id, prefix: path }); continue; }
      const entry = declared.get(path);
      if (!['100644', '100755'].includes(mode) || !entry || entry.mode !== mode || entry.objectId !== id || paths.has(path)) throw new Conflict('Git object tree differs from the declared snapshot files');
      paths.add(path);
      if (files) {
        const file = files.get(path);
        if (!file || file.mode !== entry.mode || file.bytes.length !== entry.bytes || !sameDigest(digestOfBytes(file.bytes), entry.digest) ||
            gitObjectId('blob', file.bytes, algorithm) !== id) throw new Conflict('Actual snapshot bytes disagree with the Git commit tree');
      }
    }
  }
  if (paths.size !== declared.size || visited.size !== trees.size) throw new Conflict('Git object proof has omitted files or unrelated trees');
  return { algorithm, commit: observedCommit, tree: root, proofDigest: digestOfValue(proof) };
}
/** Structural object/manifest links only: cannot certify SHA-256 file bytes without reading them. */
export function verifyGitSnapshotProofMetadata(snapshot: unknown): { verification: 'object_links_only'; binding: GitObjectBinding } {
  return { verification: 'object_links_only', binding: verify(snapshot) };
}
/** Hashes every actual file through its Git blob identity and the full tree/commit object closure. */
export function verifyGitSnapshotCommit(snapshot: unknown, files: SnapshotFile[]): GitCommitObservation {
  if (!Array.isArray(files)) throw new Conflict('actual Git source files are required');
  return { ...verify(snapshot, files), verification: 'actual_file_bytes' };
}
