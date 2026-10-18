import { z } from 'zod';
import { DigestSchema, IdString, IsoDateTime, NonNegInt, RefSchema } from '../primitives.ts';
import { Outcome, Provenance, RunRequest } from './execution.ts';
import { FidelityLane } from './definitions.ts';

/** Redacted portable report. No raw observations, media locations, or native acceptance claim. */
export const WorkflowEvidenceProjection = z.object({
  schemaVersion: z.literal('workflow.evidence-projection/v1'), campaignId: IdString,
  campaignRef: RefSchema, requestRef: RefSchema, selectionRef: RefSchema, manifestDigest: DigestSchema,
  productOutcome: Outcome, plannedLanes: z.array(FidelityLane).max(5), workBinding: RunRequest.shape.workBinding,
  issuerStatus: z.literal('unverified'), qualificationStatus: z.literal('not_evaluated'),
  nativeAcceptance: z.literal('not_requested'), nativeOutcome: z.literal('not_observed'),
  media: z.literal('withheld'), payloads: z.literal('withheld'),
  attempts: z.array(z.object({ receiptRef: RefSchema, executionId: IdString, attemptId: IdString, caseRef: RefSchema, outcome: Outcome,
    expectedTargetDigest: DigestSchema, observedTargetDigest: DigestSchema.nullable(), provenance: Provenance,
    finalizedAt: IsoDateTime, estimatedCents: NonNegInt.nullable(), reconciledCents: NonNegInt.nullable(), unknownChargeCount: NonNegInt,
  }).strict()).max(500),
}).strict();
export type WorkflowEvidenceProjection = z.infer<typeof WorkflowEvidenceProjection>;
