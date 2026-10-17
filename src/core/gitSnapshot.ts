import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GitSourceResolution, GitSourceSnapshot, GitSnapshotSide, RefSchema, digestOfBytes, digestOfValue, freeze, sameRef, sameScope, verifySelfDigest } from '../protocol/index.ts';
import { GitRepository } from '../source/git.ts';
import { GIT_RESOLVER_REF, type GitSourceAuthorization } from './gitSources.ts';
import { Conflict } from './errors.ts';
import { readBoundedFile } from './boundedFile.ts';

/** Materialize selected immutable source facts. Does not execute code, install dependencies or grant authority. */
export async function materializeGitSnapshot(input: { resolution: unknown; repositoryRef: unknown; side: unknown; root: string; output: string }, authorize: GitSourceAuthorization) {
  const resolution = GitSourceResolution.parse(input.resolution);
  const repositoryRef = RefSchema.parse(input.repositoryRef); const side = GitSnapshotSide.parse(input.side);
  if (!verifySelfDigest(resolution) || !verifySelfDigest(resolution.matrix) || !sameScope(resolution.scope, resolution.matrix.scope)) throw new Conflict('source resolution integrity or scope mismatch');
  const rows = resolution.matrix.repositories.filter(row => sameRef(row.repositoryRef, repositoryRef));
  if (rows.length !== 1 || !rows[0]!.resolverRef || !sameRef(rows[0]!.resolverRef, GIT_RESOLVER_REF)) throw new Conflict('snapshot needs exactly one repository from the registered Git resolver');
  await authorize(structuredClone(resolution.scope), structuredClone(repositoryRef));
  const commit = side === 'base' ? rows[0]!.baseCommit : rows[0]!.headCommit;
  const git = new GitRepository(input.root);
  if (git.commit(commit) !== commit) throw new Conflict('immutable snapshot commit changed');
  const entries = git.snapshot(commit);
  const binding = { resolutionRef: resolution.ref, repositoryRef, side, commit };
  const snapshot = GitSourceSnapshot.parse(freeze({ schemaVersion: 'workflow.git-source-snapshot/v1' as const,
    ref: { id: `git-snapshot-${digestOfValue(binding).hex}`, revision: '1' }, scope: resolution.scope, ...binding,
    files: entries.map(entry => ({ path: entry.path, mode: entry.mode, digest: digestOfBytes(entry.bytes), bytes: entry.bytes.length })),
  }));
  // Check authorization again after object reads, before allocating a private output.
  await authorize(structuredClone(resolution.scope), structuredClone(repositoryRef));
  const output = resolve(input.output); const sourceDir = join(output, 'source');
  try { mkdirSync(output, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Conflict('snapshot output already exists; choose a new output directory'); throw error; }
  try {
    mkdirSync(sourceDir, { mode: 0o700 });
    for (const entry of entries) {
      const path = join(sourceDir, entry.path); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, entry.bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600 });
      if (!readBoundedFile(path, entry.bytes.length, entry.bytes.length).equals(entry.bytes)) throw new Conflict('snapshot bytes changed while writing');
    }
    const manifestPath = join(output, 'snapshot.json');
    writeFileSync(manifestPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { snapshot, sourceDir, manifestPath };
  } catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
}
