import { z } from 'zod';
import { IdString, IsoDateTime, RefSchema, ScopeSchema, ShortText, idList, refList } from '../primitives.ts';

const commit = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const document = { ref: RefSchema, scope: ScopeSchema };
export const RevisionMatrix = z.object({
  ...document, schemaVersion: z.literal('workflow.revisions/v1'),
  repositories: z.array(z.object({ repositoryRef: RefSchema, requestedRef: ShortText, requestedBaseRef: ShortText,
    headCommit: commit, baseCommit: commit, mergeBaseCommit: commit.nullable(), mergeBaseAbsentReason: ShortText.nullable(),
    diffRef: RefSchema, changedFileRefs: refList(), resolverRef: RefSchema }).strict()).min(1).max(100), resolvedAt: IsoDateTime,
}).strict();
export type RevisionMatrix = z.infer<typeof RevisionMatrix>;

export const ChangeElement = z.object({ id: IdString, boundary: ShortText, behavior: ShortText, citationRefs: refList(),
  derivation: z.enum(['ast', 'declared', 'probe', 'pattern', 'agent']), confidence: z.number().min(0).max(1).nullable(),
  verification: z.enum(['confirmed', 'contradicted', 'unverified']), verifierRef: RefSchema, verificationEvidenceRefs: refList(),
}).strict();
export type ChangeElement = z.infer<typeof ChangeElement>;
export const ChangeModel = z.object({ ...document, schemaVersion: z.literal('workflow.change-model/v1'), revisionMatrixRef: RefSchema,
  elements: z.array(ChangeElement).max(500), extractorReports: z.array(z.object({ extractorRef: RefSchema, sourceRefs: refList(),
    status: z.enum(['complete', 'partial', 'failed', 'unsupported']), diagnosticRefs: refList() }).strict()).max(500),
  unresolvedQuestions: z.array(z.object({ id: IdString, sourceRefs: refList(), reason: ShortText }).strict()).max(500), generationRef: RefSchema.nullable(),
}).strict();
export type ChangeModel = z.infer<typeof ChangeModel>;

/** Source checks are evidence for review, never runtime PASS or activation. */
export const PlanSourceValidation = z.object({ ...document, schemaVersion: z.literal('workflow.source-validation/v1'),
  sourcePlanRef: RefSchema, changeModelRef: RefSchema, revisionMatrixRef: RefSchema, policyRef: RefSchema,
  verifiedCitationRefs: refList(), runnableElementIds: idList(), retainedDiagnosticRefs: refList(),
}).strict();
export type PlanSourceValidation = z.infer<typeof PlanSourceValidation>;
