import { z } from 'zod';
import { IdString, IsoDateTime, PositiveInt, RefSchema, ScopeSchema, refList } from '../primitives.ts';
import { PlanRevisionToken } from './review.ts';

export const ScenarioPromotionIntent = z.object({ scenarioId: IdString, definitionRef: RefSchema,
  reviewToken: PlanRevisionToken, selectionManifestRefs: refList().min(1), idempotencyKey: IdString }).strict();
export type ScenarioPromotionIntent = z.infer<typeof ScenarioPromotionIntent>;
export const ScenarioPromotion = z.object({ schemaVersion: z.literal('workflow.scenario-promotion/v1'), ref: RefSchema,
  scope: ScopeSchema, intent: ScenarioPromotionIntent, reviewRef: RefSchema, sourceValidationRef: RefSchema,
  reviewStorageVersion: PositiveInt, actorId: IdString, authorizationPolicyRef: RefSchema, promotedAt: IsoDateTime }).strict();
export type ScenarioPromotion = z.infer<typeof ScenarioPromotion>;
