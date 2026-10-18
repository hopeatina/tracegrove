import { z } from 'zod';
import { IdString, PlanEditProjection, PlanRevisionToken, PositiveInt, RefSchema,
  ScenarioDefinition, ScenarioPromotion, ScenarioPromotionIntent, SelectionManifest,
  digestOfValue, freeze, refKey, sameRef, sameScope, verifySelfDigest, type Digest, type Ref, type Scope } from '../protocol/index.ts';
import { validateQualificationMatrix, validateQualificationSelection, validateScenarioDefinition } from './scenario.ts';
import { Conflict } from './errors.ts';
import { nowIso } from './clock.ts';
import { ReviewedSourceDocuments, validateReviewedSourceDocuments } from './sourceReviewEvidence.ts';

export const PromotionActor = z.object({ actorId: IdString, policyRef: RefSchema }).strict();
export const ApprovedPlanReview = ReviewedSourceDocuments.extend({ storageVersion: PositiveInt, projection: PlanEditProjection }).strict();
export type ApprovedPlanReview = z.infer<typeof ApprovedPlanReview>;
export interface ApprovedPlanSnapshot { documents: ApprovedPlanReview; assertCurrent(): void }
export interface ScenarioPromotionPorts {
  authorizePromotion(scope: Scope, intentDigest: Digest): Promise<z.infer<typeof PromotionActor>>;
  resolveApprovedReview(token: PlanRevisionToken, reviewRef: Ref): Promise<unknown>;
  validateDefinition(definition: ScenarioDefinition): Promise<void>;
  readPromotion(idempotencyKey: string, scope: Scope): Promise<unknown | null>;
  /** Recheck actual reviewed storage and authority; publish receipt, review snapshot and proposed registry entry together. */
  compareAndSwapPromotion(intent: ScenarioPromotionIntent, definition: ScenarioDefinition, selections: SelectionManifest[],
    promotion: ScenarioPromotion, approved: ApprovedPlanReview): Promise<boolean>;
}
export function normalizePromotionIntent(raw: ScenarioPromotionIntent): ScenarioPromotionIntent {
  const parsed = ScenarioPromotionIntent.parse(raw);
  if (new Set(parsed.selectionManifestRefs.map(refKey)).size !== parsed.selectionManifestRefs.length) throw new Conflict('promotion selects duplicate manifests');
  return { ...parsed, selectionManifestRefs: [...parsed.selectionManifestRefs].sort((a, b) => refKey(a) < refKey(b) ? -1 : refKey(a) > refKey(b) ? 1 : 0) };
}
export function validateApprovedPlanReview(raw: unknown, token: PlanRevisionToken, reviewRef: Ref): ApprovedPlanReview {
  const approved = ApprovedPlanReview.parse(raw); const { projection: p, plan, review, validation } = approved;
  validateReviewedSourceDocuments({ plan, review, validation }, token.scope);
  if (p.id !== token.id || !sameScope(p.scope, token.scope) || p.editRevision !== token.expectedEditRevision ||
      !sameRef(p.sourcePlanRef, token.expectedSourcePlanRef) || !sameRef(plan.ref, p.sourcePlanRef) || !p.currentReviewRef ||
      !sameRef(p.currentReviewRef, review.ref) || !sameRef(review.ref, reviewRef) || review.decision !== 'approved' ||
      review.editRevision !== p.editRevision) throw new Conflict('promotion requires the exact current approved review and persisted source validation');
  return approved;
}
export function validatePromotedCases(definition: ScenarioDefinition, approved: ReviewedSourceDocuments): void {
  const { plan, validation } = approved;
  if (!definition.sourcePlanRef || !sameRef(definition.sourcePlanRef, plan.ref) || !sameRef(definition.reviewRef, approved.review.ref) ||
      plan.disposition !== 'scenario_set' || new Set(plan.candidates.map(c => c.id)).size !== plan.candidates.length) throw new Conflict('scenario does not bind an approved source scenario set');
  for (const caseRef of definition.caseRefs) {
    const candidates = plan.candidates.filter(c => c.caseRef && sameRef(c.caseRef, caseRef) && c.disposition === 'runnable');
    if (!candidates.length || candidates.some(c => !c.sourceElementIds.length || c.sourceElementIds.some(id => !validation.runnableElementIds.includes(id)))) throw new Conflict('promoted cases need approved runnable candidates and independently validated source elements');
  }
}
function promotionInputs(intent: ScenarioPromotionIntent, rawDefinition: unknown, rawSelections: unknown[]) {
  const scope = intent.reviewToken.scope;
  const definition = validateScenarioDefinition(rawDefinition, intent.definitionRef, scope);
  const selections = rawSelections.map(s => { const parsed = SelectionManifest.parse(s); return validateQualificationSelection(parsed, parsed.ref, scope); });
  if (digestOfValue(selections.map(s => refKey(s.ref)).sort()).hex !== digestOfValue(intent.selectionManifestRefs.map(refKey).sort()).hex) throw new Conflict('promotion manifests differ from the frozen intent');
  const matrix = selections.find(s => sameRef(s.ref, definition.qualificationMatrixRef));
  if (!matrix) throw new Conflict('promotion requires its frozen qualification matrix');
  for (const selection of selections) validateQualificationMatrix(definition, matrix, selection);
  return { definition, selections };
}
export function deriveScenarioPromotion(intent: ScenarioPromotionIntent, rawDefinition: unknown, rawSelections: unknown[], rawApproved: unknown,
  actor: z.infer<typeof PromotionActor>, promotedAt: string) {
  const { definition, selections } = promotionInputs(intent, rawDefinition, rawSelections);
  const scope = intent.reviewToken.scope;
  const approved = validateApprovedPlanReview(rawApproved, intent.reviewToken, definition.reviewRef);
  validatePromotedCases(definition, approved);
  const promotion = ScenarioPromotion.parse(freeze({ schemaVersion: 'workflow.scenario-promotion/v1',
    ref: { id: `scenario-promotion-${digestOfValue(intent).hex}`, revision: '1' }, scope, intent,
    reviewRef: approved.review.ref, sourceValidationRef: approved.validation.ref, reviewStorageVersion: approved.storageVersion,
    actorId: actor.actorId, authorizationPolicyRef: actor.policyRef, promotedAt }));
  return { promotion, definition, selections, approved };
}
/** Promotion registers a proposed scenario only. It does not approve the source plan, execute cases or activate coverage. */
export async function promoteScenario(ports: ScenarioPromotionPorts, rawIntent: ScenarioPromotionIntent,
  rawDefinition: ScenarioDefinition, rawSelections: SelectionManifest[]): Promise<ScenarioPromotion> {
  const intent = normalizePromotionIntent(rawIntent);
  const { definition, selections } = promotionInputs(intent, structuredClone(rawDefinition), structuredClone(rawSelections));
  const digest = digestOfValue(intent);
  const actor = PromotionActor.parse(await ports.authorizePromotion(structuredClone(intent.reviewToken.scope), structuredClone(digest)));
  const prior = async () => {
    const raw = await ports.readPromotion(intent.idempotencyKey, structuredClone(intent.reviewToken.scope));
    if (raw === null) return null;
    const record = ScenarioPromotion.parse(raw);
    if (!verifySelfDigest(record) || !sameScope(record.scope, intent.reviewToken.scope) ||
        record.ref.id !== `scenario-promotion-${digest.hex}` || record.ref.revision !== '1' ||
        digestOfValue(record.intent).hex !== digest.hex) throw new Conflict('promotion idempotency key belongs to another intent');
    return record;
  };
  const existing = await prior(); if (existing) return existing;
  const approved = await ports.resolveApprovedReview(structuredClone(intent.reviewToken), structuredClone(definition.reviewRef));
  await ports.validateDefinition(structuredClone(definition));
  const candidate = deriveScenarioPromotion(intent, definition, selections, approved, actor, nowIso());
  if (!await ports.compareAndSwapPromotion(intent, candidate.definition, candidate.selections, candidate.promotion, candidate.approved)) {
    const raced = await prior(); if (raced) return raced;
    throw new Conflict('scenario or reviewed plan changed during promotion');
  }
  return candidate.promotion;
}
