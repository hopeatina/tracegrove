import { z } from 'zod';
import { IdString, RefSchema, ScopeSchema, refList } from '../primitives.ts';
import { ScenarioRevisionToken } from './scenario.ts';

export const RegressionRunIntent = z.object({ snapshot: ScenarioRevisionToken, selectionManifestRef: RefSchema,
  stateLeaseRefs: refList().min(1), idempotencyKey: IdString }).strict();
export type RegressionRunIntent = z.infer<typeof RegressionRunIntent>;
/** Registration binds fresh state to an active definition. It grants no effect authority. */
export const RegressionAdmission = z.object({ schemaVersion: z.literal('workflow.regression-admission/v1'), ref: RefSchema,
  scope: ScopeSchema, intent: RegressionRunIntent, activationRef: RefSchema, campaignId: IdString }).strict();
export type RegressionAdmission = z.infer<typeof RegressionAdmission>;
