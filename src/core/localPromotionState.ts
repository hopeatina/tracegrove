import { z } from 'zod';
import { ScenarioPromotion, digestOfValue, sameRef } from '../protocol/index.ts';
import { ApprovedPlanReview, deriveScenarioPromotion, normalizePromotionIntent } from './sourcePromotion.ts';
import type { StoredScenario } from './localScenarioState.ts';
import { Conflict } from './errors.ts';

export const StoredPromotion = z.object({ receipt: ScenarioPromotion, approved: ApprovedPlanReview }).strict();
export function validateStoredPromotion(entry: StoredScenario, keys: Set<string>): void {
  if (!entry.promotion) return;
  const { receipt, approved } = entry.promotion; const intent = normalizePromotionIntent(receipt.intent);
  if (keys.has(intent.idempotencyKey) || intent.scenarioId !== entry.projection.id) throw new Conflict('promotion identity or scoped idempotency key changed');
  keys.add(intent.idempotencyKey);
  const definition = entry.definitions.find(d => sameRef(d.ref, intent.definitionRef));
  const selections = intent.selectionManifestRefs.map(ref => entry.selections.find(s => sameRef(s.ref, ref)));
  if (!definition || selections.some(s => !s)) throw new Conflict('promoted immutable definition or selection is missing');
  const expected = deriveScenarioPromotion(intent, definition, selections, approved,
    { actorId: receipt.actorId, policyRef: receipt.authorizationPolicyRef }, receipt.promotedAt);
  if (digestOfValue(expected.promotion).hex !== digestOfValue(receipt).hex) throw new Conflict('stored promotion manifest or reviewed source bindings changed');
}
