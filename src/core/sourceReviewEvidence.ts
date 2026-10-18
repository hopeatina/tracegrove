import { z } from 'zod';
import { PlanReview, PlanSourceValidation, SourcePlan, SourceSelection, sameRef, sameScope, verifySelfDigest, type Scope } from '../protocol/index.ts';
import { Conflict } from './errors.ts';

/** Sealed historical evidence. Current approval is established separately by its owning review store. */
export const ReviewedSourceDocuments = z.object({ plan: SourcePlan, review: PlanReview, validation: PlanSourceValidation }).strict();
export type ReviewedSourceDocuments = z.infer<typeof ReviewedSourceDocuments>;

export function validateReviewedSourceDocuments(raw: unknown, scope: Scope): ReviewedSourceDocuments {
  const documents = ReviewedSourceDocuments.parse(raw); const { plan, review, validation } = documents;
  if ([plan, review, validation].some(d => !verifySelfDigest(d) || !sameScope(d.scope, scope)) ||
      review.decision !== 'approved' || !sameRef(review.sourcePlanRef, plan.ref) ||
      !sameRef(validation.sourcePlanRef, plan.ref) || !sameRef(validation.changeModelRef, plan.changeModelRef) ||
      !sameRef(validation.revisionMatrixRef, plan.revisionMatrixRef) || !sameRef(validation.policyRef, review.policyRef) ||
      !review.reasonRefs.some(r => sameRef(r, validation.ref))) throw new Conflict('reviewed source evidence requires sealed matching plan, approved review and source validation');
  return documents;
}

/** Join reviewed source to executable source without changing the original frozen trial request. */
export function validateReviewedSourceSelection(approved: ReviewedSourceDocuments, selection: SourceSelection): void {
  const { plan, review, validation } = approved;
  validateReviewedSourceDocuments({ plan, review, validation }, selection.scope);
  if (!verifySelfDigest(selection) || !selection.revisionMatrixRef || !sameRef(approved.plan.revisionMatrixRef, selection.revisionMatrixRef))
    throw new Conflict('reviewed source plan selects a different executable revision matrix');
}
