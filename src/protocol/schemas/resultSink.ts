import { z } from 'zod';
import { DigestSchema, IdString, IsoDateTime, NonNegInt, RefSchema, ScopeSchema } from '../primitives.ts';
import { Outcome } from './execution.ts';
import { FidelityLane } from './definitions.ts';

/** Receipt of durable local retention, not issuer authentication or qualification. */
export const ResultIngestReceipt = z.object({
  schemaVersion: z.literal('workflow.result-ingest/v1'), ref: RefSchema, scope: ScopeSchema,
  campaignId: IdString, campaignRef: RefSchema, requestRef: RefSchema, selectionRef: RefSchema, manifestDigest: DigestSchema,
  fidelityPlanRef: RefSchema, plannedLanes: z.array(FidelityLane).max(5),
  retainedOutcome: Outcome, receiptCount: NonNegInt, acceptedAt: IsoDateTime,
  evidenceClass: z.literal('integrity_checked_local_bundle'), issuerStatus: z.literal('unverified'),
  qualificationStatus: z.literal('not_evaluated'),
}).strict();
export type ResultIngestReceipt = z.infer<typeof ResultIngestReceipt>;
