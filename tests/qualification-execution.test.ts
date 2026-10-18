import { registeredQualificationFixture } from './fixtures/registeredQualification.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalScenarioStore } from '../src/core/localScenarioStore.ts';
import { invalidateScenario } from '../src/core/scenario.ts';
import { prepareQualificationExecution } from '../src/core/qualificationBundle.ts';
import { localQualificationExecutionOwner, QualificationExecutionContext, validateQualificationExecution } from '../src/core/qualificationExecution.ts';
import { executeBundle } from '../src/core/executor.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { reduceQualificationRound } from '../src/core/qualification.ts';
import { ScenarioDefinition, SelectionManifest,
  digestOfBytes, freeze, refKey, type Ref } from '../src/protocol/index.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';

const roots: string[] = []; const ledgers: LocalLedger[] = [];
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
const fixture = () => registeredQualificationFixture(ledger => ledgers.push(ledger));

it('executes real native cells with their registered identities and reduces terminal evidence against persisted admission', async () => {
  const f = await fixture(); const run = await executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner });
  expect(run.outcome).toBe('passed'); const saved = readVerifiedBundle(run.executionDir);
  expect(saved.receipts).toHaveLength(2);
  for (const receipt of saved.receipts) {
    const allocated = f.admission.attempts.find(a => a.selectionCellId === receipt.selectionCellId)!;
    expect(receipt).toMatchObject({ executionId: allocated.executionId, attemptId: allocated.attemptId, qualificationRoundRef: f.admission.ref });
    expect(receipt.cleanup.remainingUnknownMutations).toBe(0);
  }
  expect(new Set(saved.receipts.map(r => r.executionId)).size).toBe(2);
  const round = await reduceQualificationRound({ authorize: async () => {}, resolveAdmission: (ref, scope) => f.store.resolveAdmission(ref, scope),
    authenticateEvidence: async (_admission, evidence) => { expect(evidence.request.ref).toEqual(f.bundle.request!.ref); } },
  { admissionRef: f.admission.ref, scope: f.scope, bundleDir: run.executionDir });
  expect(round.terminalReceiptRefs).toHaveLength(2);
  const host = new LocalProcessHost(); let starts = 0;
  const replay = await executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner,
    hosts: { local: { start: async context => { starts++; return host.start(context); } } } });
  expect(replay.redelivered).toBe(true); expect(starts).toBe(0);
  const changedKey = { ...f.bundle, request: freeze({ ...f.bundle.request!, idempotencyKey: 'another-key' }) };
  await expect(executeBundle({ bundle: changedKey, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner })).rejects.toThrow('different frozen request');
});
it('refuses missing authority, foreign ledgers and altered campaign bindings before any host effect', async () => {
  const f = await fixture();
  await expect(executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope })).rejects.toThrow('scenario_lifecycle_unavailable');
  const otherRoot = mkdtempSync(join(tmpdir(), 'tracegrove-foreign-owner-')); roots.push(otherRoot); const other = LocalLedger.open(otherRoot); ledgers.push(other);
  await expect(executeBundle({ bundle: f.bundle, ledger: other, stateDir: otherRoot, scope: f.scope, qualification: f.owner })).rejects.toThrow('registration owner ledger');
  const changed = { ...f.bundle, request: freeze({ ...f.bundle.request!, campaignId: 'substituted-campaign' }) };
  await expect(executeBundle({ bundle: changed, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner })).rejects.toThrow('registered closure');
});
it('rejects incomplete, duplicated and unsafe allocations and changed preparation matrices', async () => {
  const f = await fixture();
  const context = QualificationExecutionContext.parse(await f.owner.resolve(f.admission.ref, f.scope, f.ledger));
  for (const attempts of [f.admission.attempts.slice(1),
    f.admission.attempts.map(a => ({ ...a, executionId: '../escape' })),
    f.admission.attempts.map(a => ({ ...a, executionId: f.admission.attempts[0]!.executionId }))]) {
    const admission = freeze({ ...f.admission, attempts });
    expect(() => validateQualificationExecution(f.bundle.request!, context.selection, { ...context, admission })).toThrow();
  }
  const selection = SelectionManifest.parse(f.planned.documents[refKey(f.planned.request!.selectionManifestRef)]);
  const changed = freeze({ ...selection, cells: selection.cells.slice(1) });
  const request = freeze({ ...f.planned.request!, selectionManifestRef: changed.ref });
  const altered = { ...f.planned, request, documents: { ...f.planned.documents, [refKey(changed.ref)]: changed } };
  await expect(prepareQualificationExecution(altered, f.admission.ref, f.scope, f.ledger, f.owner)).rejects.toThrow('cannot change');
});
it('stops subsequent effects after invalidation and retains complete nonpassing terminal evidence', async () => {
  const f = await fixture(); let calls = 0;
  const owner = localQualificationExecutionOwner(f.store, async (_request, _admission, cell) => {
    if (cell && ++calls === 3) {
      const next = ScenarioDefinition.parse(freeze({ ...f.definition, ref: { id: 'scenario', revision: '2' }, replayContractRef: ref('changed-contract') }));
      await f.store.stage(next); await invalidateScenario(f.store.ports(), { id: 'entry', scope: f.scope, expectedAggregateVersion: 2,
        expectedDefinitionRef: f.definition.ref, expectedInvalidationEpoch: 0, expectedLatestRoundSequence: 1 }, next.ref);
    }
  });
  const run = await executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner });
  expect(run.outcome).not.toBe('passed'); const saved = readVerifiedBundle(run.executionDir);
  expect(saved.receipts).toHaveLength(2); expect(saved.receipts.some(r => r.steps.some(s => s.reasonCode === 'qualification_authority_unavailable'))).toBe(true);
  expect(saved.receipts[0]!.cleanup.remainingUnknownMutations).toBe(0);
  await expect(executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner })).rejects.toThrow('invalidated');
});

it('admits one execution when the same registered round is delivered concurrently', async () => {
  const f = await fixture(); const host = new LocalProcessHost(); let starts = 0;
  const execute = () => executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner,
    hosts: { local: { start: async context => { starts++; return host.start(context); } } } });
  const results = await Promise.allSettled([execute(), execute()]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const failure = results.find(r => r.status === 'rejected');
  expect(failure?.status === 'rejected' && String(failure.reason)).toMatch(/incomplete|EEXIST|expected version/);
  expect(starts).toBe(2); // One host per selected cell, never a duplicate campaign.
  expect(f.ledger.history(`qualification-execution:${f.admission.ref.digest.hex}`).filter(e => e.type === 'admitted')).toHaveLength(1);
});

it('refuses to replay a durable admission after its publication acknowledgement is lost', async () => {
  const f = await fixture(); const append = f.ledger.append.bind(f.ledger); let starts = 0;
  const spy = vi.spyOn(f.ledger, 'append').mockImplementation((aggregate, version, type, data) => {
    const entry = append(aggregate, version, type, data);
    if (aggregate.startsWith('qualification-execution:') && type === 'admitted') throw new Error('lost publication acknowledgement');
    return entry;
  });
  const options = { bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner,
    hosts: { local: { start: async () => { starts++; throw new Error('must not start'); } } } };
  await expect(executeBundle(options)).rejects.toThrow('lost publication acknowledgement');
  spy.mockRestore(); f.ledger.close();
  const reopened = LocalLedger.open(f.root); ledgers.push(reopened);
  const store = new LocalScenarioStore(reopened, 'entry', f.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  await expect(executeBundle({ ...options, ledger: reopened, qualification: localQualificationExecutionOwner(store, async () => {}) })).rejects.toThrow('incomplete');
  expect(starts).toBe(0);
});

it('retains cleanup when effect permission is revoked and preserves the original trial plan', async () => {
  const f = await fixture(); const original = structuredClone(f.planned); let effects = 0;
  const owner = localQualificationExecutionOwner(f.store, async (_request, _admission, cell) => {
    if (cell && ++effects >= 3) throw new Error('permission revoked');
  });
  const run = await executeBundle({ bundle: f.bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: owner });
  const saved = readVerifiedBundle(run.executionDir);
  expect(run.outcome).not.toBe('passed');
  expect(saved.receipts[0]!.cleanup.remainingUnknownMutations).toBe(0);
  expect(saved.receipts[0]!.steps.some(s => s.reasonCode === 'qualification_authority_unavailable')).toBe(true);
  expect(f.planned).toEqual(original);
  expect(f.planned.request!.purpose).toBe('trial');
});
