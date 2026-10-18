import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GitSourceRequest, resolveGitSources } from '../core/gitSources.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { localScope } from '../core/corpus.ts';
import { Blocked, Conflict } from '../core/errors.ts';
import { GitSourceResolution, parseAs, sameScope } from '../protocol/index.ts';
import { materializeGitSnapshot } from '../core/gitSnapshot.ts';

export async function resolveSourceFiles(inputPath: string, outputPath: string) {
  const input = resolve(inputPath);
  let request: GitSourceRequest;
  try { request = parseAs(GitSourceRequest, JSON.parse(readBoundedFile(input, 256 * 1024).toString('utf8')), 'Git source request'); }
  catch { throw new Blocked([{ code: 'invalid_source_request', detail: 'Provide a regular JSON file up to 256 KiB matching the Git source request schema' }]); }
  const scope = localScope();
  if (!sameScope(request.scope, scope)) throw new Blocked([{ code: 'source_scope_mismatch', detail: 'The CLI resolves only its local owner-private scope' }]);
  request.repositories = request.repositories.map(repository => ({ ...repository, root: resolve(dirname(input), repository.root) }));
  const resolution = await resolveGitSources(request, async selectedScope => {
    if (!sameScope(selectedScope, scope)) throw new Conflict('source scope changed');
  });
  const output = resolve(outputPath); mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  try { writeFileSync(output, `${JSON.stringify(resolution, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Conflict('source output already exists; choose a new output path'); throw error; }
  return { summary: { output, resolutionRef: resolution.ref, matrixRef: resolution.matrix.ref, repositories: resolution.matrix.repositories.length,
    changedFiles: resolution.changes.length },
  text: `frozen source: ${output}\n${resolution.matrix.repositories.length} repository pair(s), ${resolution.changes.length} changed file(s). Source facts only; no review, execution or deployment proof.` };
}

export async function materializeSourceFiles(inputPath: string, repository: string, root: string, side: string, output: string) {
  const input = resolve(inputPath); let resolution: GitSourceResolution;
  try { resolution = parseAs(GitSourceResolution, JSON.parse(readBoundedFile(input, 64 * 1024 * 1024).toString('utf8')), 'Git source resolution'); }
  catch { throw new Blocked([{ code: 'invalid_source_resolution', detail: 'Provide a regular sealed Git source resolution JSON file up to 64 MiB' }]); }
  const scope = localScope();
  const rows = resolution.matrix.repositories.filter(row => row.repositoryRef.id === repository);
  if (rows.length !== 1) throw new Conflict('select exactly one repository ID from the frozen source resolution');
  const result = await materializeGitSnapshot({ resolution, repositoryRef: rows[0]!.repositoryRef, root: resolve(dirname(input), root), side, output },
    async selected => { if (!sameScope(selected, scope)) throw new Conflict('source snapshot scope differs from the local owner'); });
  return { summary: { sourceDir: result.sourceDir, manifestPath: result.manifestPath, snapshotRef: result.snapshot.ref,
    commit: result.snapshot.commit, files: result.snapshot.files.length },
  text: `source snapshot: ${result.sourceDir}\n${result.snapshot.commit}, ${result.snapshot.files.length} file(s). No application executed; no deployment or qualification claimed.` };
}
