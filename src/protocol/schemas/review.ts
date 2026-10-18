import { z } from 'zod';
import { IdString, PositiveInt, RefSchema, ScopeSchema, refList, idList } from '../primitives.ts';

export const SourcePlan = z.object({
  schemaVersion: z.literal('workflow.source-plan/v1'),
  ref: RefSchema,
  scope: ScopeSchema,
  revisionMatrixRef: RefSchema,
  changeModelRef: RefSchema,
  disposition: z.enum(['scenario_set', 'no_e2e_warranted', 'surface_unresolved']),
  dispositionReasonRefs: refList(),
  candidates: z.array(z.object({
    id: IdString,
    sourceElementIds: idList(),
    caseRef: RefSchema.nullable(),
    disposition: z.enum(['runnable', 'blocked', 'excluded', 'not_derivable']),
    reasonRefs: refList(),
    capabilityRefs: refList(),
  }).strict()).max(500),
  validFlowRefs: refList(),
  withheldFlows: z.array(z.object({ flowRef: RefSchema, reasonRefs: refList() }).strict()).max(500),
  invalidFlows: z.array(z.object({ flowRef: RefSchema, diagnosticRefs: refList() }).strict()).max(500),
  coverageObligationRefs: refList(),
  gapRefs: refList(),
}).strict();
export type SourcePlan = z.infer<typeof SourcePlan>;

export const PlanReview = z.object({
  schemaVersion: z.literal('workflow.plan-review/v1'),
  ref: RefSchema,
  scope: ScopeSchema,
  sourcePlanRef: RefSchema,
  editRevision: PositiveInt,
  decision: z.enum(['approved', 'rejected']),
  reviewerActorId: IdString,
  policyRef: RefSchema,
  reasonRefs: refList(),
}).strict();
export type PlanReview = z.infer<typeof PlanReview>;

export const PlanEditProjection = z.object({
  id: IdString,
  scope: ScopeSchema,
  editRevision: PositiveInt,
  sourcePlanRef: RefSchema,
  currentReviewRef: RefSchema.nullable(),
}).strict();
export type PlanEditProjection = z.infer<typeof PlanEditProjection>;
export const PlanRevisionToken = z.object({ id: IdString, scope: ScopeSchema, expectedEditRevision: PositiveInt,
  expectedSourcePlanRef: RefSchema }).strict();
export type PlanRevisionToken = z.infer<typeof PlanRevisionToken>;
