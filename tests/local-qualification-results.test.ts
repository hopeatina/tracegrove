import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import { registeredQualificationFixture } from './fixtures/registeredQualification.ts';
import { executeBundle } from '../src/core/executor.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { LocalQualificationResults, type LocalQualificationResultAuthority } from '../src/core/localQualificationResults.ts';
import { localScope } from '../src/core/corpus.ts';
import { registerQualificationRound } from '../src/core/scenario.ts';
import { prepareQualificationExecution } from '../src/core/qualificationBundle.ts';
import { assessScenarioReplay } from '../src/core/replayAssessment.ts';
import { QualificationPolicy, digestOfBytes, digestOfValue, freeze } from '../src/protocol/index.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); });
async function fixture() {
  const policy = QualificationPolicy.parse(freeze({ schemaVersion: 'workflow.qualification-policy/v1', ref: { id: 'actual-policy', revision: '1' },
    scope: localScope(), requiredLevel: 'environment', minimumIndependentRounds: 2 }));
  const f = await registeredQualificationFixture(ledger => ledgers.push(ledger), policy.ref);
  const controls = { read: true, write: true, issuer: true };
  const authority: LocalQualificationResultAuthority = {
    authorize: async () => { if (!controls.read) throw new Error('read denied'); },
    authorizeRetention: async () => { if (!controls.write) throw new Error('retention denied'); },
    resolveAdmission: (ref, scope) => f.store.resolveAdmission(ref, scope),
    authenticateEvidence: async () => { if (!controls.issuer) throw new Error('issuer denied'); },
  };
  const results = new LocalQualificationResults(f.ledger, f.scope, authority);
  const input = (bundleDir: string) => ({ admissionRef: f.admission.ref, scope: f.scope, bundleDir });
  const execute = () => executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner });
  return { ...f, controls, authority, results, input, execute, policy };
}
it('retains registered native terminal evidence after producer deletion and ledger reopen', async () => {
  const f = await fixture(); const run = await f.execute();
  const retained = await f.results.retain(f.input(run.executionDir));
  expect(retained.replayed).toBe(false); expect(retained.round.terminalReceiptRefs).toHaveLength(2);
  rmSync(run.executionDir, { recursive: true }); f.ledger.close();
  const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const store = new LocalScenarioStore(ledger, 'entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const results = new LocalQualificationResults(ledger, f.scope, { ...f.authority, resolveAdmission: (ref, scope) => store.resolveAdmission(ref, scope) });
  expect(await results.resolveRound(f.admission)).toEqual({ roundRef: retained.round.ref, bundleDir: retained.bundleDir });
  expect((await results.retain(f.input(retained.bundleDir))).replayed).toBe(true);
  const request = join(retained.bundleDir, 'request.json'); writeFileSync(request, 'tampered');
  await expect(results.resolveRound(f.admission)).rejects.toThrow();
});
it('distinguishes registered pending work from unknown, forged and foreign admissions', async () => {
  const f = await fixture(); expect(await f.results.resolveRound(f.admission)).toBeNull();
  const changed = freeze({ ...f.admission, ref: { id: 'unknown-admission', revision: '1' } });
  await expect(f.results.resolveRound(changed)).rejects.toThrow('not registered');
  await expect(f.results.resolveRound({ ...f.admission, campaignId: 'forged' })).rejects.toThrow('seal');
  const foreign = freeze({ ...f.admission, scope: { ...f.scope, ownerId: 'foreign-owner' } });
  await expect(f.results.resolveRound(foreign)).rejects.toThrow('another scope');
});
it('requires retention permission and fresh read/issuer authority on historical reads', async () => {
  const f = await fixture(); const run = await f.execute(); f.controls.write = false;
  await expect(f.results.retain(f.input(run.executionDir))).rejects.toThrow('retention denied');
  f.controls.write = true; await f.results.retain(f.input(run.executionDir));
  f.controls.issuer = false; await expect(f.results.resolveRound(f.admission)).rejects.toThrow('issuer denied');
  f.controls.issuer = true; f.controls.read = false; await expect(f.results.resolveRound(f.admission)).rejects.toThrow('read denied');
});
it('converges concurrent retention and refuses different bytes for the same admitted round', async () => {
  const f = await fixture(); const run = await f.execute(); const input = f.input(run.executionDir);
  const both = await Promise.all([f.results.retain(input), f.results.retain(input)]);
  expect(both.map(r => r.replayed).sort()).toEqual([false, true]); expect(both[0]!.round).toEqual(both[1]!.round);
  const manifest = join(run.executionDir, 'manifest.json'); writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n`);
  await expect(f.results.retain(input)).rejects.toThrow('different evidence');
});
it.each(['before', 'after'] as const)('recovers %s terminal-index publication without duplicating or losing retained evidence', async phase => {
  const f = await fixture(); const run = await f.execute(); const append = f.ledger.append.bind(f.ledger);
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((aggregate, version, type, data) => {
    if (type !== 'workflow.qualification.retained') return append(aggregate, version, type, data);
    if (phase === 'after') append(aggregate, version, type, data);
    throw new Error('publication acknowledgement lost');
  });
  await expect(f.results.retain(f.input(run.executionDir))).rejects.toThrow('acknowledgement lost');
  spy.mockRestore(); f.ledger.close(); const ledger = LocalLedger.open(f.root); ledgers.push(ledger);
  const store = new LocalScenarioStore(ledger, 'entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  const results = new LocalQualificationResults(ledger, f.scope, { ...f.authority, resolveAdmission: (ref, scope) => store.resolveAdmission(ref, scope) });
  const pending = await results.resolveRound(f.admission); expect(pending === null).toBe(phase === 'before');
  const retained = await results.retain(f.input(run.executionDir)); expect(retained.replayed).toBe(phase === 'after');
  expect(ledger.history(`qualification-results:${digestOfValue(f.scope).hex}`)).toHaveLength(1);
});
it('retains nonpassing registered results without manufacturing qualification', async () => {
  const f = await fixture();
  const run = await executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner,
    hosts: { local: { start: async () => { throw new Error('controlled unavailable host'); } } } });
  expect(run.outcome).not.toBe('passed');
  const retained = await f.results.retain(f.input(run.executionDir));
  expect(retained.round.terminalReceiptRefs).toHaveLength(2);
  expect(await f.results.resolveRound(f.admission)).toEqual({ roundRef: retained.round.ref, bundleDir: retained.bundleDir });
  expect('qualifies' in retained.round).toBe(false);
});
it('rejects input replacement during issuer authentication without publishing a terminal round', async () => {
  const f = await fixture(); const run = await f.execute(); const manifest = join(run.executionDir, 'manifest.json');
  f.authority.authenticateEvidence = async () => { writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n`); };
  await expect(f.results.retain(f.input(run.executionDir))).rejects.toThrow('expected manifest');
  expect(f.ledger.history(`result-sink:${digestOfValue(f.scope).hex}`)).toHaveLength(0);
  expect(await f.results.resolveRound(f.admission)).toBeNull();
});
it('rechecks retained bytes after the final retention authorization await', async () => {
  const f = await fixture(); const run = await f.execute(); let writes = 0;
  f.authority.authorizeRetention = async () => {
    if (++writes !== 4) return;
    const objects = join(f.root, `result-objects-${digestOfValue(f.scope).hex}`);
    const manifest = join(objects, readdirSync(objects)[0]!, 'manifest.json');
    writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n`);
  };
  await expect(f.results.retain(f.input(run.executionDir))).rejects.toThrow('archive changed');
  expect(await f.results.resolveRound(f.admission)).toBeNull();
});
it('assesses two independent registered native campaigns through the durable result index', async () => {
  const f = await fixture(); const first = await f.execute(); await f.results.retain(f.input(first.executionDir));
  const token = (version: number, sequence: number) => ({ id: 'entry', scope: f.scope, expectedAggregateVersion: version,
    expectedDefinitionRef: f.definition.ref, expectedInvalidationEpoch: 0, expectedLatestRoundSequence: sequence });
  const second = await registerQualificationRound(f.store.ports(), token(2, 1), { selectionManifestRef: f.admission.selectionManifestRef,
    stateLeaseRefs: [{ id: 'independent-second-state', revision: '1', digest: digestOfBytes('independent-second-state') }] });
  const bundle = await prepareQualificationExecution(f.planned, second.ref, f.scope, f.ledger, f.owner);
  const run = await executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner });
  await f.results.retain({ admissionRef: second.ref, scope: f.scope, bundleDir: run.executionDir });
  rmSync(first.executionDir, { recursive: true }); rmSync(run.executionDir, { recursive: true });
  const report = await assessScenarioReplay({ ...f.store.ports(), authorize: f.authority.authorize,
    resolvePolicy: async () => f.policy, resolveRound: admission => f.results.resolveRound(admission), authenticateEvidence: f.authority.authenticateEvidence }, token(3, 2));
  expect(report.qualifies).toBe(true); expect(report.qualifyingRoundRefs).toHaveLength(2);
  expect(report.latestAdmissionRef).toEqual(second.ref);
  expect((await f.store.read('entry', f.scope)).projection.state).toBe('validating'); // Readiness does not activate.
});
