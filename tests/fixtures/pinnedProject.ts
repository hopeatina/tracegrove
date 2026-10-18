import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture } from './git.ts';
import { compileProject } from '../../src/authoring/compile.ts';
import { loadProject, localScope } from '../../src/core/corpus.ts';
import { plan } from '../../src/core/planner.ts';
import { resolveGitSources } from '../../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../../src/core/gitSnapshot.ts';
import { HostPlan, SelectionManifest, refKey } from '../../src/protocol/index.ts';

/** Complete immutable Git sample, ordinary compiler and planner. No runtime or review authority. */
export async function pinnedProjectFixture(format: 'sha1' | 'sha256' = 'sha1', grep = 'notes.list') {
  const git = gitFixture('app', format);
  cpSync(join(import.meta.dirname, '../../src/samples/notes-api'), git.root, { recursive: true });
  writeFileSync(join(git.root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git.git('add', '.'); git.git('commit', '--quiet', '-m', 'Application and lockfile');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...git.selected, head: 'main' }] }, async () => {});
  const materialized = await materializeGitSnapshot({ resolution, repositoryRef: git.repositoryRef, side: 'head', root: git.root, output: join(git.root, 'pin') }, async () => {});
  const configPath = join(materialized.sourceDir, 'tracegrove.config.yaml');
  const compiled = compileProject(configPath, { sourceSnapshot: materialized.manifestPath, sourceRepositoryRole: 'application', grep });
  const bundle = plan({ project: loadProject(compiled.workflowConfigPath), profileName: 'real', scope: localScope() });
  if (!bundle.request || bundle.blockers.length) throw new Error(`pinned project planning failed: ${JSON.stringify(bundle.blockers)}`);
  const request = bundle.request;
  const selection = SelectionManifest.parse(bundle.documents[refKey(request.selectionManifestRef)]); const cell = selection.cells[0]!;
  const host = HostPlan.parse(bundle.documents[refKey(cell.executionHostRef)]);
  return { ...git, ...materialized, resolution, configPath, compiled, bundle, request, cell, host, pin: host.launch!.sourceSnapshot! };
}
