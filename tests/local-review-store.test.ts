import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalReviewStore, type LocalReviewAuthority } from '../src/core/localReviewStore.ts';
import { editPlan, reviewPlan, type PlanRevisionToken } from '../src/core/review.ts';
import { SourcePlan, PlanSourceValidation, digestOfBytes, freeze, sameRef, type Ref, type Scope } from '../src/protocol/index.ts';

const scope: Scope = { ownerId: 'owner', tenantId: 'tenant', visibility: 'tenant_private' };
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
function plan(revision = '1') {
  return SourcePlan.parse(freeze({ schemaVersion: 'workflow.source-plan/v1', ref: { id: 'plan', revision }, scope,
    revisionMatrixRef: ref('matrix'), changeModelRef: ref('change-model'), disposition: 'surface_unresolved', dispositionReasonRefs: [ref('reason')],
    candidates: [], validFlowRefs: [], withheldFlows: [], invalidFlows: [], coverageObligationRefs: [ref('obligation')], gapRefs: [ref('unresolved-gap')] }));
}
const dirs: string[] = []; const handles: LocalLedger[] = [];
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-review-')); dirs.push(dir);
  const controls = { allowed: true, sourceCheck: true };
  let checks = 0;
  // Source authority is deliberately simulated; persistence does not establish source correctness.
  const authority: LocalReviewAuthority = { authorize: async () => {
    if (!controls.allowed) throw new Error('owner denied');
    return { actorId: 'authenticated-owner', policyRef: ref('source-policy') };
  }, validateSources: async (source, policy) => {
    if (!controls.sourceCheck) throw new Error('independent source check unavailable');
    return PlanSourceValidation.parse(freeze({ schemaVersion: 'workflow.source-validation/v1', ref: { id: `check-${++checks}`, revision: '1' }, scope,
      sourcePlanRef: source.ref, revisionMatrixRef: source.revisionMatrixRef, changeModelRef: source.changeModelRef, policyRef: policy,
      verifiedCitationRefs: [], runnableElementIds: [], retainedDiagnosticRefs: source.gapRefs }));
  } };
  function reopen() {
    const ledger = LocalLedger.open(dir); handles.push(ledger);
    const store = new LocalReviewStore(ledger, 'editable-plan', scope, authority);
    return { ledger, store, ports: store.ports() };
  }
  const initial = reopen();
  await initial.store.initialize(plan());
  const token = async (store: LocalReviewStore): Promise<PlanRevisionToken> => {
    const { projection: p } = await store.read('editable-plan', scope);
    return { id: p.id, scope, expectedEditRevision: p.editRevision, expectedSourcePlanRef: p.sourcePlanRef };
  };
  return { ...initial, dir, controls, authority, reopen, token };
}
afterEach(() => { for (const ledger of handles.splice(0)) ledger.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('persists approval, source validation and projection in one durable entry and recovers them after reopen', async () => {
  const f = await fixture(); const before = await f.store.read('editable-plan', scope);
  const approved = await reviewPlan(f.ports, await f.token(f.store), 'approved', []);
  const lines = readFileSync(join(f.dir, 'ledger/journal.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(lines).toHaveLength(2);
  expect(lines[1].data.state.reviews).toEqual([approved]); expect(lines[1].data.state.validations).toHaveLength(1);
  expect(lines[1].data.state.projection.currentReviewRef).toEqual(approved.ref);
  f.ledger.close(); const reopened = f.reopen();
  const saved = await reopened.store.read('editable-plan', scope);
  expect(saved.storageVersion).toBe(before.storageVersion + 1); expect(saved.projection.currentReviewRef).toEqual(approved.ref);
  expect(await reopened.ports.resolvePlan(plan().ref, scope)).toEqual(plan());
});
it('stages immutable drafts without advancing editable revision, then invalidates approval when the edit is committed', async () => {
  const f = await fixture(); const stale = await f.token(f.store);
  await reviewPlan(f.ports, stale, 'approved', []);
  const reviewed = await f.store.read('editable-plan', scope);
  await f.store.stage(plan('2'));
  expect((await f.store.read('editable-plan', scope)).projection).toEqual(reviewed.projection);
  const staged = await f.store.read('editable-plan', scope); await f.store.stage(plan('2'));
  expect(await f.store.read('editable-plan', scope)).toEqual(staged);
  const changed = await editPlan(f.ports, stale, plan('2').ref);
  expect(changed).toMatchObject({ editRevision: 2, sourcePlanRef: plan('2').ref, currentReviewRef: null });
  f.ledger.close(); const reopened = f.reopen();
  expect((await reopened.store.read('editable-plan', scope)).projection).toEqual(changed);
  await expect(reviewPlan(reopened.ports, stale, 'approved', [])).rejects.toThrow('stale');
});
it('publishes only one concurrent review and no losing source validation', async () => {
  const f = await fixture(); const token = await f.token(f.store);
  const results = await Promise.allSettled([reviewPlan(f.ports, token, 'approved', []), reviewPlan(f.ports, token, 'approved', [])]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const lines = readFileSync(join(f.dir, 'ledger/journal.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(lines).toHaveLength(2); expect(lines[1].data.state.reviews).toHaveLength(1); expect(lines[1].data.state.validations).toHaveLength(1);
});
it('retains drafts when authorization or source checks fail, with no approval or storage-version change', async () => {
  const f = await fixture(); const before = await f.store.read('editable-plan', scope);
  f.controls.sourceCheck = false;
  await expect(reviewPlan(f.ports, await f.token(f.store), 'approved', [])).rejects.toThrow('source check unavailable');
  expect(await f.store.read('editable-plan', scope)).toEqual(before);
  f.controls.allowed = false;
  await expect(f.store.stage(plan('2'))).rejects.toThrow('owner denied');
  await expect(reviewPlan(f.ports, await f.token(f.store), 'rejected', [])).rejects.toThrow('owner denied');
  expect(await f.store.read('editable-plan', scope)).toEqual(before);
});
it('refuses scope substitution, changed immutable identities and forged approval persistence', async () => {
  const f = await fixture(); const before = await f.store.read('editable-plan', scope);
  await expect(f.store.read('editable-plan', { ...scope, ownerId: 'foreign' })).rejects.toThrow('scope');
  await expect(f.ports.resolvePlan(plan().ref, { ...scope, tenantId: 'foreign' })).rejects.toThrow('scope');
  await expect(f.store.stage(freeze({ ...plan(), gapRefs: [] }))).rejects.toThrow('immutable');
  await expect(f.store.stage(freeze({ ...plan('2'), scope: { ...scope, ownerId: 'foreign' } }))).rejects.toThrow('scope');
  const review = freeze({ schemaVersion: 'workflow.plan-review/v1' as const, ref: { id: 'forged-review', revision: '1' }, scope,
    sourcePlanRef: plan().ref, editRevision: 1, decision: 'approved' as const, reviewerActorId: 'authenticated-owner', policyRef: ref('source-policy'), reasonRefs: [] });
  await expect(f.ports.compareAndSwap(before.storageVersion, { ...before.projection, currentReviewRef: review.ref }, review, null)).rejects.toThrow('source validation');
  expect(await f.store.read('editable-plan', scope)).toEqual(before);
});
it('rechecks authority at the final write and rejects caller-forged actor or policy fields', async () => {
  const f = await fixture(); const before = await f.store.read('editable-plan', scope); const commit = f.ports.compareAndSwap;
  f.ports.compareAndSwap = async (...args) => { f.controls.allowed = false; return commit(...args); };
  await expect(reviewPlan(f.ports, await f.token(f.store), 'approved', [])).rejects.toThrow('owner denied');
  expect(await f.store.read('editable-plan', scope)).toEqual(before);
  f.controls.allowed = true;
  for (const field of ['reviewerActorId', 'policyRef'] as const) {
    const review = freeze({ schemaVersion: 'workflow.plan-review/v1' as const, ref: { id: 'forged-review', revision: '1' }, scope,
      sourcePlanRef: plan().ref, editRevision: 1, decision: 'rejected' as const,
      reviewerActorId: field === 'reviewerActorId' ? 'claimed-owner' : 'authenticated-owner',
      policyRef: field === 'policyRef' ? ref('claimed-policy') : ref('source-policy'), reasonRefs: [] });
    await expect(commit(before.storageVersion, { ...before.projection, currentReviewRef: review.ref }, review, null)).rejects.toThrow('actor or policy');
  }
  expect(await f.store.read('editable-plan', scope)).toEqual(before);
});
it('does not permit concurrent controllers and keeps cloned readbacks independent of stored bytes', async () => {
  const f = await fixture(); expect(() => LocalLedger.open(f.dir)).toThrow('held by live process');
  const p = await f.store.read('editable-plan', scope); p.projection.editRevision = 999;
  const resolved = await f.ports.resolvePlan(plan().ref, scope); (resolved as SourcePlan).gapRefs = [];
  expect((await f.store.read('editable-plan', scope)).projection.editRevision).toBe(1);
  expect(sameRef((await f.store.resolvePlan(plan().ref, scope)).ref, plan().ref)).toBe(true);
  expect((await f.store.resolvePlan(plan().ref, scope)).gapRefs).toEqual(plan().gapRefs);
});
