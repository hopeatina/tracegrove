import { lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GitSourceSnapshot, GIT_SNAPSHOT_LIMITS, type GitCommitObservation } from '../protocol/schemas/gitSources.ts';
import { digestOfBytes, sameDigest, verifySelfDigest } from '../protocol/canonical.ts';
import { Conflict } from '../core/errors.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { assertSnapshotPaths } from './snapshotPaths.ts';
import { verifyGitSnapshotCommit, verifyGitSnapshotProofMetadata } from './gitObjectProof.ts';

export type SnapshotFile = { path: string; mode: '100644' | '100755'; bytes: Buffer };

export function readGitSnapshotManifest(path: string): GitSourceSnapshot {
  let snapshot: GitSourceSnapshot;
  try { snapshot = GitSourceSnapshot.parse(JSON.parse(readBoundedFile(path, 32 * 1024 * 1024).toString('utf8'))); }
  catch { throw new Conflict('Choose a bounded, regular source snapshot manifest with valid metadata'); }
  if (!verifySelfDigest(snapshot)) throw new Conflict('Git snapshot manifest digest mismatch');
  if (snapshot.commitProof) verifyGitSnapshotProofMetadata(snapshot);
  return snapshot;
}

/** Read every pinned regular file, ignoring untracked inputs that will never enter the launch copy. */
export function readGitSnapshotTree(input: unknown, sourceRoot: string): SnapshotFile[] {
  return readGitSnapshotSource(input, sourceRoot).files;
}
export function readGitSnapshotSource(input: unknown, sourceRoot: string): { files: SnapshotFile[]; gitSource: GitCommitObservation | null } {
  const snapshot = GitSourceSnapshot.parse(input);
  if (!verifySelfDigest(snapshot)) throw new Conflict('Git snapshot manifest digest mismatch');
  assertSnapshotPaths(snapshot.files.map(file => file.path));
  if (snapshot.files.reduce((sum, file) => sum + file.bytes, 0) > GIT_SNAPSHOT_LIMITS.totalBytes) throw new Conflict('Git snapshot exceeds the total byte bound');
  const root = resolve(sourceRoot); const checked = new Set<string>();
  const directory = (path: string) => {
    if (checked.has(path)) return;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Conflict('Git snapshot refuses linked or non-directory parents');
    checked.add(path);
  };
  directory(root);
  const files = snapshot.files.map(file => {
    let parent = root;
    for (const segment of file.path.split('/').slice(0, -1)) { parent = join(parent, segment); directory(parent); }
    const bytes = readBoundedFile(join(root, file.path), file.bytes, file.bytes);
    if (!sameDigest(digestOfBytes(bytes), file.digest)) throw new Conflict('Git snapshot file digest mismatch');
    return { path: file.path, mode: file.mode, bytes };
  });
  return { files, gitSource: snapshot.commitProof ? verifyGitSnapshotCommit(snapshot, files) : null };
}

/** Exclusively create a private tree; a failed write removes only this owned directory. */
export function writeGitSnapshotTree(files: SnapshotFile[], destination: string): void {
  if (!files.length || files.length > GIT_SNAPSHOT_LIMITS.files || files.some(file => file.bytes.length > GIT_SNAPSHOT_LIMITS.fileBytes) ||
      files.reduce((sum, file) => sum + file.bytes.length, 0) > GIT_SNAPSHOT_LIMITS.totalBytes) throw new Conflict('Git snapshot tree exceeds complete-coverage bounds');
  assertSnapshotPaths(files.map(file => file.path));
  mkdirSync(destination, { mode: 0o700 });
  try {
    for (const file of files) {
      const path = join(destination, file.path); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, file.bytes, { flag: 'wx', mode: file.mode === '100755' ? 0o700 : 0o600 });
      if (!readBoundedFile(path, file.bytes.length, file.bytes.length).equals(file.bytes)) throw new Conflict('snapshot bytes changed while writing');
    }
  } catch (error) { rmSync(destination, { recursive: true, force: true }); throw error; }
}
