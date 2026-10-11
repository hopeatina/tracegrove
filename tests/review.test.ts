import { describe, expect, it } from 'vitest';
import { editPlan, reviewPlan, type PlanReviewPorts, type PlanRevisionToken, type ReviewSnapshot } from '../src/core/review.ts';
import { SourcePlan, freeze, type PlanReview, type Ref, type Scope } from '../src/protocol/index.ts';

const scope: Scope = { ownerId: 'owner', tenantId: 'tenant', visibility: 'tenant_private' };
const ref = (id: string): Ref => ({ id, revision: '1', digest: { algorithm: 'sha256', hex: 'a'.repeat(64) } });
function plan(revision: string) {
  return SourcePlan.parse(freeze({
    schemaVersion: 'workflow.source-plan/v1', ref: { id: 'source-plan', revision }, scope,
    revisionMatrixRef: ref('revisions'), changeModelRef: ref('change-model'),
    disposition: 'surface_unresolved', dispositionReasonRefs: [ref('unresolved')],
    candidates: [{ id: 'blocked-case', sourceElementIds: ['changed-route'], caseRef: null, disposition: 'blocked', reasonRefs: [ref('capability-gap')], capabilityRefs: [] }],
    validFlowRefs: [], withheldFlows: [], invalidFlows: [], coverageObligationRefs: [ref('required-cell')], gapRefs: [ref('capability-gap')],
  }));
}

function fixture() {
  const before = plan('1');
  const after = plan('2');
  let snapshot: ReviewSnapshot = { storageVersion: 1, projection: { id: 'editable-plan', scope, editRevision: 1, sourcePlanRef: before.ref, currentReviewRef: null } };
  const reviews: PlanReview[] = [];
  const ports: PlanReviewPorts = {
    authorize: async () => ({ actorId: 'authenticated-human', policyRef: ref('review-policy') }),
    resolvePlan: async (r) => r.revision === '1' ? before : after,
    read: async () => structuredClone(snapshot),
    compareAndSwap: async (version, projection, review) => {
      if (snapshot.storageVersion !== version) return false;
      snapshot = { storageVersion: version + 1, projection: structuredClone(projection) };
      if (review) reviews.push(structuredClone(review));
      return true;
    },
  };
  const token = (): PlanRevisionToken => ({ id: snapshot.projection.id, scope, expectedEditRevision: snapshot.projection.editRevision, expectedSourcePlanRef: snapshot.projection.sourcePlanRef });
  return { before, after, ports, token, reviews, snapshot: () => structuredClone(snapshot) };
}

describe('exact-plan review and edit arbitration', () => {
  it('binds authenticated reviewer identity and invalidates approval on edit', async () => {
    const f = fixture();
    const review = await reviewPlan(f.ports, f.token(), 'approved', []);
    expect(review.reviewerActorId).toBe('authenticated-human');
    expect(review.sourcePlanRef).toEqual(f.before.ref);
    const next = await editPlan(f.ports, f.token(), f.after.ref);
    expect(next.editRevision).toBe(2);
    expect(next.currentReviewRef).toBeNull();
    expect(f.reviews).toEqual([review]);
    expect(f.after.coverageObligationRefs).toEqual(f.before.coverageObligationRefs);
    expect(f.after.gapRefs).toEqual(f.before.gapRefs);
  });

  it('rejects stale edit and review tokens without publishing anything', async () => {
    const f = fixture();
    const stale = f.token();
    await editPlan(f.ports, stale, f.after.ref);
    const saved = f.snapshot();
    await expect(reviewPlan(f.ports, stale, 'approved', [])).rejects.toThrow('stale plan');
    await expect(editPlan(f.ports, stale, f.after.ref)).rejects.toThrow('stale plan');
    expect(f.snapshot()).toEqual(saved);
    expect(f.reviews).toEqual([]);
  });

  it('allows only one concurrent writer and publishes no losing review', async () => {
    const f = fixture();
    const token = f.token();
    const results = await Promise.allSettled([
      editPlan(f.ports, token, f.after.ref), reviewPlan(f.ports, token, 'approved', []),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(f.snapshot().storageVersion).toBe(2);
    expect(f.reviews.length).toBe(f.snapshot().projection.currentReviewRef ? 1 : 0);
  });

  it.each(['scope', 'digest'] as const)('rejects a resolver %s mismatch', async (kind) => {
    const f = fixture();
    f.ports.resolvePlan = async () => kind === 'scope'
      ? freeze({ ...f.before, scope: { ...scope, tenantId: 'another-tenant' } })
      : { ...f.before, gapRefs: [] };
    await expect(reviewPlan(f.ports, f.token(), 'approved', [])).rejects.toThrow('digest or scope mismatch');
    expect(f.reviews).toEqual([]);
    expect(f.snapshot().storageVersion).toBe(1);
  });

  it('does not turn caller claims into review authority', async () => {
    const f = fixture();
    f.ports.authorize = async () => { throw new Error('review permission denied'); };
    await expect(reviewPlan(f.ports, f.token(), 'approved', [])).rejects.toThrow('permission denied');
    await expect(editPlan(f.ports, f.token(), f.after.ref)).rejects.toThrow('permission denied');
    expect(f.snapshot().storageVersion).toBe(1);
    expect(f.reviews).toEqual([]);
  });

  it('rejects a projection from another tenant before publishing a review', async () => {
    const f = fixture();
    const saved = f.snapshot();
    f.ports.read = async () => ({ ...saved, projection: { ...saved.projection, scope: { ...scope, tenantId: 'other' } } });
    await expect(reviewPlan(f.ports, f.token(), 'approved', [])).rejects.toThrow('plan scope mismatch');
    expect(f.reviews).toEqual([]);
  });

  it('rejects caller-supplied reviewer identity fields', async () => {
    const f = fixture();
    const forged = { ...f.token(), reviewerActorId: 'attacker' };
    await expect(reviewPlan(f.ports, forged, 'approved', [])).rejects.toThrow();
    expect(f.reviews).toEqual([]);
    expect(f.snapshot().storageVersion).toBe(1);
  });

  it('refuses changed bytes under an already published specification revision', async () => {
    const f = fixture();
    const reused = freeze({ ...f.after, ref: { ...f.after.ref, revision: f.before.ref.revision } });
    await expect(editPlan(f.ports, f.token(), reused.ref)).rejects.toThrow('new immutable revision');
    expect(f.snapshot().storageVersion).toBe(1);
  });

  it('keeps rejected reviews separate from activation and editable revision', async () => {
    const f = fixture();
    const review = await reviewPlan(f.ports, f.token(), 'rejected', [ref('reason')]);
    expect(review.decision).toBe('rejected');
    expect(f.snapshot().projection.editRevision).toBe(1);
    expect(f.snapshot().projection).not.toHaveProperty('state');
  });
});
