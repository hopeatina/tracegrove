import { z } from 'zod';
import {
  IdString, PlanEditProjection, PlanReview, PlanRevisionToken, PositiveInt, RefSchema, ScopeSchema,
  SourcePlan, PlanSourceValidation, freeze, parseAs, refKey, refList, selfDigest, sameDigest, sameRef, sameScope, verifySelfDigest,
  type Ref, type Scope,
} from '../protocol/index.ts';
import { Blocked, Conflict } from './errors.ts';
import { newId } from './clock.ts';

export interface ReviewSnapshot { storageVersion: number; projection: PlanEditProjection }

/** Trusted host ports, never a case/plugin-supplied implementation. */
export interface PlanReviewPorts {
  authorize(scope: Scope, action: 'edit' | 'review'): Promise<{ actorId: string; policyRef: Ref }>;
  resolvePlan(ref: Ref, scope: Scope): Promise<unknown>;
  validateSources(plan: SourcePlan, policyRef: Ref): Promise<PlanSourceValidation>;
  read(id: string, scope: Scope): Promise<ReviewSnapshot>;
  /** Atomically publish validation, review (if any), and projection; false leaves all unchanged. */
  compareAndSwap(expectedStorageVersion: number, projection: PlanEditProjection, review: PlanReview | null, sourceValidation: PlanSourceValidation | null): Promise<boolean>;
}

export type { PlanRevisionToken } from '../protocol/index.ts';

async function current(ports: PlanReviewPorts, token: PlanRevisionToken): Promise<ReviewSnapshot> {
  const snapshot = await ports.read(token.id, structuredClone(token.scope));
  const projection = PlanEditProjection.parse(snapshot.projection);
  PositiveInt.parse(snapshot.storageVersion);
  if (projection.id !== token.id || !sameScope(projection.scope, token.scope)) throw new Conflict('plan scope mismatch');
  if (projection.editRevision !== token.expectedEditRevision || refKey(projection.sourcePlanRef) !== refKey(token.expectedSourcePlanRef)) {
    throw new Conflict('stale plan edit revision or specification digest; preserve the draft and reload');
  }
  return { storageVersion: snapshot.storageVersion, projection };
}

async function resolved(ports: PlanReviewPorts, ref: Ref, scope: Scope): Promise<SourcePlan> {
  const plan = parseAs(SourcePlan, await ports.resolvePlan(structuredClone(ref), structuredClone(scope)), 'source plan');
  if (refKey(plan.ref) !== refKey(ref) || !sameDigest(selfDigest(plan), ref.digest) || !sameScope(plan.scope, scope)) {
    throw new Conflict('resolved plan digest or scope mismatch');
  }
  return plan;
}

/** Every specification edit clears review; observation refreshes do not call this operation. */
export async function editPlan(ports: PlanReviewPorts, token: PlanRevisionToken, nextRef: Ref): Promise<PlanEditProjection> {
  token = PlanRevisionToken.parse(token);
  nextRef = RefSchema.parse(nextRef);
  await ports.authorize(ScopeSchema.parse(token.scope), 'edit');
  const snapshot = await current(ports, token);
  if (nextRef.id !== snapshot.projection.sourcePlanRef.id || nextRef.revision === snapshot.projection.sourcePlanRef.revision) {
    throw new Conflict('edit requires a new immutable revision of the same plan');
  }
  await resolved(ports, nextRef, token.scope);
  const next = PlanEditProjection.parse({ ...snapshot.projection, editRevision: snapshot.projection.editRevision + 1, sourcePlanRef: nextRef, currentReviewRef: null });
  if (!await ports.compareAndSwap(snapshot.storageVersion, structuredClone(next), null, null)) throw new Conflict('plan changed during edit; preserve the draft and reload');
  return next;
}

/** Review identity/policy come only from authenticated host admission, never request fields. */
export async function reviewPlan(
  ports: PlanReviewPorts, token: PlanRevisionToken, decision: 'approved' | 'rejected', reasonRefs: Ref[],
): Promise<PlanReview> {
  token = PlanRevisionToken.parse(token);
  decision = z.enum(['approved', 'rejected']).parse(decision);
  reasonRefs = refList().parse(reasonRefs);
  const admission = z.object({ actorId: IdString, policyRef: RefSchema }).strict().parse(await ports.authorize(ScopeSchema.parse(token.scope), 'review'));
  const snapshot = await current(ports, token);
  const plan = await resolved(ports, snapshot.projection.sourcePlanRef, token.scope);
  if (decision === 'approved' && typeof ports.validateSources !== 'function') throw new Blocked([{ code: 'source_validation_unavailable',
    detail: 'Approval requires a registered source checker', owner: 'review host', action: 'wire validatePlanSources and atomic validation/review persistence' }]);
  const validation = decision === 'approved' ? PlanSourceValidation.parse(await ports.validateSources(structuredClone(plan), structuredClone(admission.policyRef))) : null;
  if (validation && (!verifySelfDigest(validation) || !sameScope(validation.scope, token.scope) || !sameRef(validation.sourcePlanRef, plan.ref)
      || !sameRef(validation.changeModelRef, plan.changeModelRef) || !sameRef(validation.revisionMatrixRef, plan.revisionMatrixRef)
      || !sameRef(validation.policyRef, admission.policyRef))) throw new Conflict('source validation does not bind this reviewed plan and policy');
  const review = PlanReview.parse(freeze({
    schemaVersion: 'workflow.plan-review/v1', ref: { id: newId('review'), revision: '1' },
    scope: snapshot.projection.scope, sourcePlanRef: snapshot.projection.sourcePlanRef,
    editRevision: snapshot.projection.editRevision, decision,
    reviewerActorId: admission.actorId, policyRef: admission.policyRef, reasonRefs: validation ? [...reasonRefs, validation.ref] : reasonRefs,
  }));
  const next = { ...snapshot.projection, currentReviewRef: review.ref };
  if (!await ports.compareAndSwap(snapshot.storageVersion, structuredClone(next), structuredClone(review), validation ? structuredClone(validation) : null)) throw new Conflict('plan changed during review; reload before reviewing');
  return review;
}
