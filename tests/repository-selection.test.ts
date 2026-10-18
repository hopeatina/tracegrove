import { afterEach, expect, it } from 'vitest';
import { cpSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupGitRepositories, gitFixture } from './fixtures/git.ts';
import { cleanupTemps, runSample } from '../conformance/helpers.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { resolveGitSources } from '../src/core/gitSources.ts';
import { materializeGitSnapshot } from '../src/core/gitSnapshot.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { prepareFrozenCells } from '../src/core/executionPreparation.ts';
import { repositorySelectionProblems } from '../src/core/repositorySelectionEvidence.ts';
import { snapshotRepository, snapshotSourceSelection } from '../src/core/snapshotRepository.ts';
import { activateScenario } from '../src/core/scenarioActivation.ts';
import { registeredReplayFixture } from './fixtures/registeredReplay.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { HostPlan, RevisionMatrix, RunRequest, SelectionManifest, SourcePlan, SourceSelection, digestOfBytes, freeze, refKey } from '../src/protocol/index.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); cleanupGitRepositories(); });

async function fixture(format: 'sha1' | 'sha256' = 'sha1') {
  const git = gitFixture('app', format);
  cpSync(join(import.meta.dirname, '../src/samples/notes-api'), git.root, { recursive: true });
  writeFileSync(join(git.root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git.git('add', '.'); git.git('commit', '--quiet', '-m', 'Application and lockfile');
  const resolution = await resolveGitSources({ scope: localScope(), repositories: [{ ...git.selected, head: 'main' }] }, async () => {});
  const materialized = await materializeGitSnapshot({ resolution, repositoryRef: git.repositoryRef, side: 'head', root: git.root, output: join(git.root, 'pin') }, async () => {});
  const configPath = join(materialized.sourceDir, 'tracegrove.config.yaml');
  const compiled = compileProject(configPath, { sourceSnapshot: materialized.manifestPath, sourceRepositoryRole: 'application', grep: 'notes.list' });
  const bundle = plan({ project: loadProject(compiled.workflowConfigPath), profileName: 'real', scope: localScope() });
  expect(bundle.blockers).toEqual([]); expect(bundle.request).not.toBeNull();
  const request = bundle.request!;
  const selection = SelectionManifest.parse(bundle.documents[refKey(request.selectionManifestRef)]);
  const cell = selection.cells[0]!;
  const host = HostPlan.parse(bundle.documents[refKey(cell.executionHostRef)]);
  return { ...git, ...materialized, resolution, configPath, compiled, bundle, request, cell, host, pin: host.launch!.sourceSnapshot! };
}

for (const format of ['sha1', 'sha256'] as const) it(`observes the actual ${format} repository without a Git checkout or claimed remote`, async () => {
  const f = await fixture(format);
  renameSync(join(f.root, '.git'), join(f.root, '.git-unavailable'));
  const source = SourceSelection.parse(f.bundle.documents[refKey(f.request.sourceSelectionRef!)]);
  expect(source.repositories[0]).toMatchObject({ repositoryRole: 'application', headCommit: f.snapshot.commit,
    canonicalUrl: `urn:tracegrove:git-object:${format}:${f.snapshot.commit}`, origin: 'snapshot_bundle' });
  expect(source.revisionMatrixRef).toEqual(f.resolution.matrix.ref);
  const run = await runSample(f.bundle, join(f.root, 'state'));
  expect(run.outcome, JSON.stringify(run.reasonCodes)).toBe('passed'); expect(verifyBundle(run.executionDir).ok).toBe(true);
  const evidence = readVerifiedBundle(run.executionDir);
  expect(evidence.receipts.length).toBeGreaterThan(0);
  for (const receipt of evidence.receipts) expect(receipt.environment.observed?.repositories).toEqual([snapshotRepository(f.pin)]);
});

it('qualifies two independent native rounds at revision level and atomically activates with simulated issuer/lease authority', async () => {
  const f = await fixture();
  const registered = await registeredReplayFixture(ledger => ledgers.push(ledger), 'real', { frozen: f.bundle, requiredLevel: 'revision' });
  const activated = await activateScenario(registered.ports, registered.intent);
  expect((await registered.store.read('entry', registered.scope)).projection).toMatchObject({ state: 'active', activationDecisionRef: activated.ref });
  expect(registered.first.round.ref).not.toEqual(registered.second.round.ref);
});

it('refuses missing, changed, foreign and multi-repository resolution sidecars and base-only snapshots', async () => {
  const f = await fixture(); const sidecar = join(f.root, 'pin/resolution.json');
  unlinkSync(sidecar);
  expect(() => compileProject(f.configPath, { sourceSnapshot: f.manifestPath, sourceRepositoryRole: 'application' })).toThrow('snapshot_repository_unbound');
  for (const input of [
    { ...f.resolution, matrix: { ...f.resolution.matrix, resolvedAt: '2000-01-01T00:00:00Z' } },
    freeze({ ...f.resolution, ref: { ...f.resolution.ref, revision: 'foreign' } }),
  ]) expect(() => snapshotSourceSelection(f.pin, input)).toThrow();
  expect(() => snapshotSourceSelection({ ...f.pin, snapshot: freeze({ ...f.snapshot, side: 'base' }) }, f.resolution)).toThrow('resolver matrix head');
  const matrix = RevisionMatrix.parse(freeze({ ...f.resolution.matrix, repositories: [...f.resolution.matrix.repositories, f.resolution.matrix.repositories[0]!] }));
  const resolution = freeze({ ...f.resolution, matrix });
  const pin = { ...f.pin, snapshot: freeze({ ...f.snapshot, resolutionRef: resolution.ref }) };
  expect(() => snapshotSourceSelection(pin, resolution)).toThrow('one sealed');
});

it('blocks a role without a snapshot and rejects empty roles rather than silently dropping repository identity', async () => {
  const f = await fixture();
  expect(() => compileProject(f.configPath, { sourceRepositoryRole: 'application' })).toThrow('snapshot_repository_unbound');
  expect(() => compileProject(f.configPath, { sourceSnapshot: f.manifestPath, sourceRepositoryRole: '' })).toThrow();
});

it('requires sealed source closure, exact roles, lockfile digest, and content identity before effects', async () => {
  const f = await fixture(); const source = SourceSelection.parse(f.bundle.documents[refKey(f.request.sourceSelectionRef!)]);
  for (const patch of [
    { canonicalUrl: 'https://github.com/someone/claimed' }, { repositoryRole: 'invented' },
    { lockfileDigest: digestOfBytes('different lockfiles') }, { headCommit: f.base }, { resolverRef: null },
  ]) {
    const changed = SourceSelection.parse(freeze({ ...source, repositories: [{ ...source.repositories[0]!, ...patch }] }));
    const documents = { ...f.bundle.documents, [refKey(changed.ref)]: changed };
    const request = RunRequest.parse(freeze({ ...f.request, sourceSelectionRef: changed.ref }));
    const cell = { ...f.cell, sourceSelectionRef: changed.ref };
    expect(repositorySelectionProblems(request, cell, f.host, documents)).not.toEqual([]);
  }
  const documents = { ...f.bundle.documents }; delete documents[refKey(f.resolution.matrix.ref)];
  expect(() => prepareFrozenCells({ ...f.bundle, documents }, localScope(), f.request)).toThrow('repository_source_binding_invalid');
  // Requested URLs cannot flow into observed target identity through this path.
  expect(snapshotRepository(f.pin).canonicalUrl).toMatch(/^urn:tracegrove:git-object:/);
});

it('refuses the right executable commit when the reviewed source plan binds a different matrix', async () => {
  const f = await fixture();
  const sourcePlan = SourcePlan.parse(freeze({ schemaVersion: 'workflow.source-plan/v1', ref: { id: 'reviewed-source', revision: '1' }, scope: localScope(),
    revisionMatrixRef: { ...f.resolution.matrix.ref, revision: 'wrong' }, changeModelRef: f.resolution.ref,
    disposition: 'scenario_set', dispositionReasonRefs: [], candidates: [], validFlowRefs: [], withheldFlows: [], invalidFlows: [], coverageObligationRefs: [], gapRefs: [] }));
  const documents = { ...f.bundle.documents, [refKey(sourcePlan.ref)]: sourcePlan };
  const request = RunRequest.parse(freeze({ ...f.request, sourcePlanRef: sourcePlan.ref }));
  expect(repositorySelectionProblems(request, f.cell, f.host, documents).join()).toContain('different revision matrix');
  expect(() => prepareFrozenCells({ ...f.bundle, request, documents }, localScope(), request)).toThrow('repository_source_binding_invalid');
});
