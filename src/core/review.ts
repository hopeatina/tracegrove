import { z } from 'zod';
import {
  IdString, PlanEditProjection, PlanReview, PositiveInt, RefSchema, ScopeSchema,
  SourcePlan, freeze, parseAs, refKey, refList, selfDigest, sameDigest,
  type Ref, type Scope,
} from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import { newId } from './clock.ts';

export interface ReviewSnapshot { storageVersion: number; projection: PlanEditProjection }

/** Trusted host ports, never a case/plugin-supplied implementation. */
export interface PlanReviewPorts {
  authorize(scope: Scope, action: 'edit' | 'review'): Promise<{ actorId: string; policyRef: Ref }>;
  resolvePlan(ref: Ref, scope: Scope): Promise<unknown>;
  read(id: string, scope: Scope): Promise<ReviewSnapshot>;
  /** Atomically publish the review (if any) and projection; false leaves both unchanged. */
  compareAndSwap(expectedStorageVersion: number, projection: PlanEditProjection, review: PlanReview | null): Promise<boolean>;
}

export interface PlanRevisionToken {
  id: string;
  scope: Scope;
  expectedEditRevision: number;
  expectedSourcePlanRef: Ref;
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.ownerId === b.ownerId && a.tenantId === b.tenantId && a.visibility === b.visibility;
}

const RevisionToken = z.object({
  id: IdString, scope: ScopeSchema, expectedEditRevision: PositiveInt, expectedSourcePlanRef: RefSchema,
}).strict();

async function current(ports: PlanReviewPorts, token: PlanRevisionToken): Promise<ReviewSnapshot> {
  const snapshot = await ports.read(token.id, token.scope);
  const projection = PlanEditProjection.parse(snapshot.projection);
  PositiveInt.parse(snapshot.storageVersion);
  if (projection.id !== token.id || !sameScope(projection.scope, token.scope)) throw new Conflict('plan scope mismatch');
  if (projection.editRevision !== token.expectedEditRevision || refKey(projection.sourcePlanRef) !== refKey(token.expectedSourcePlanRef)) {
    throw new Conflict('stale plan edit revision or specification digest; preserve the draft and reload');
  }
  return { storageVersion: snapshot.storageVersion, projection };
}

async function resolved(ports: PlanReviewPorts, ref: Ref, scope: Scope): Promise<SourcePlan> {
  const plan = parseAs(SourcePlan, await ports.resolvePlan(ref, scope), 'source plan');
  if (refKey(plan.ref) !== refKey(ref) || !sameDigest(selfDigest(plan), ref.digest) || !sameScope(plan.scope, scope)) {
    throw new Conflict('resolved plan digest or scope mismatch');
  }
  return plan;
}

/** Every specification edit clears review; observation refreshes do not call this operation. */
export async function editPlan(ports: PlanReviewPorts, token: PlanRevisionToken, nextRef: Ref): Promise<PlanEditProjection> {
  token = RevisionToken.parse(token);
  nextRef = RefSchema.parse(nextRef);
  await ports.authorize(ScopeSchema.parse(token.scope), 'edit');
  const snapshot = await current(ports, token);
  if (nextRef.id !== snapshot.projection.sourcePlanRef.id || nextRef.revision === snapshot.projection.sourcePlanRef.revision) {
    throw new Conflict('edit requires a new immutable revision of the same plan');
  }
  await resolved(ports, nextRef, token.scope);
  const next = PlanEditProjection.parse({ ...snapshot.projection, editRevision: snapshot.projection.editRevision + 1, sourcePlanRef: nextRef, currentReviewRef: null });
  if (!await ports.compareAndSwap(snapshot.storageVersion, next, null)) throw new Conflict('plan changed during edit; preserve the draft and reload');
  return next;
}

/** Review identity/policy come only from authenticated host admission, never request fields. */
export async function reviewPlan(
  ports: PlanReviewPorts, token: PlanRevisionToken, decision: 'approved' | 'rejected', reasonRefs: Ref[],
): Promise<PlanReview> {
  token = RevisionToken.parse(token);
  decision = z.enum(['approved', 'rejected']).parse(decision);
  reasonRefs = refList().parse(reasonRefs);
  const admission = z.object({ actorId: IdString, policyRef: RefSchema }).strict().parse(await ports.authorize(ScopeSchema.parse(token.scope), 'review'));
  const snapshot = await current(ports, token);
  await resolved(ports, snapshot.projection.sourcePlanRef, token.scope);
  const review = PlanReview.parse(freeze({
    schemaVersion: 'workflow.plan-review/v1', ref: { id: newId('review'), revision: '1' },
    scope: snapshot.projection.scope, sourcePlanRef: snapshot.projection.sourcePlanRef,
    editRevision: snapshot.projection.editRevision, decision,
    reviewerActorId: admission.actorId, policyRef: admission.policyRef, reasonRefs,
  }));
  const next = { ...snapshot.projection, currentReviewRef: review.ref };
  if (!await ports.compareAndSwap(snapshot.storageVersion, next, review)) throw new Conflict('plan changed during review; reload before reviewing');
  return review;
}
