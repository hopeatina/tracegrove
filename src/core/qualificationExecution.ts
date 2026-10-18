import { z } from 'zod';
import { QualificationRoundAdmission, ScenarioDefinition, SelectionManifest, RunRequest, refKey, sameRef, sameScope,
  verifySelfDigest, digestOfValue, type Ref, type Scope } from '../protocol/index.ts';
import { checkAdmission } from './localScenarioState.ts';
import type { LocalLedger } from './ledger.ts';
import type { LocalScenarioStore } from './localScenarioStore.ts';
import { Conflict } from './errors.ts';
import { ApprovedPlanReview, validateApprovedPlanReview, validatePromotedCases } from './sourcePromotion.ts';

export const QualificationExecutionContext = z.object({ admission: QualificationRoundAdmission, definition: ScenarioDefinition,
  selection: SelectionManifest, matrix: SelectionManifest, sourceReview: ApprovedPlanReview.optional() }).strict();
export type QualificationExecutionContext = z.infer<typeof QualificationExecutionContext>;
export interface QualificationExecutionOwner {
  resolve(ref: Ref, scope: Scope, ledger: LocalLedger): Promise<unknown>;
  /** Authenticated host effect authority, distinct from read/registration permission. Never supplied by a bundle. */
  authorizeEffects(request: RunRequest, admission: QualificationRoundAdmission, selectionCellId: string | null): Promise<void>;
}
export function localQualificationExecutionOwner(store: LocalScenarioStore,
  authorizeEffects: QualificationExecutionOwner['authorizeEffects']): QualificationExecutionOwner {
  return { resolve: (ref, scope, ledger) => store.executionContext(ref, scope, ledger), authorizeEffects };
}
export function validateQualificationExecution(request: RunRequest, selection: SelectionManifest, raw: unknown): QualificationExecutionContext {
  const context = QualificationExecutionContext.parse(raw); const { admission, definition, matrix } = context;
  for (const document of [admission, definition, selection, context.selection, matrix]) {
    if (!verifySelfDigest(document) || !sameScope(document.scope, request.requestedScope)) throw new Conflict('qualification document seal or scope mismatch');
  }
  checkAdmission({ definitions: [definition], selections: [matrix, context.selection] }, admission);
  if (definition.sourcePlanRef) {
    if (!context.sourceReview) throw new Conflict('source-backed qualification needs current review owner evidence');
    const approved = context.sourceReview;
    validateApprovedPlanReview(approved, { id: approved.projection.id, scope: definition.scope,
      expectedEditRevision: approved.projection.editRevision, expectedSourcePlanRef: definition.sourcePlanRef }, definition.reviewRef);
    validatePromotedCases(definition, approved);
  } else if (context.sourceReview) throw new Conflict('unbound source review in qualification context');
  if (admission.attempts.some(a => [a.executionId, a.attemptId].some(id => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id === '.' || id === '..'))) throw new Conflict('qualification allocation IDs must be safe local path segments');
  const nullableEqual = (a: Ref | null, b: Ref | null) => a === null ? b === null : b !== null && sameRef(a, b);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (request.purpose !== 'qualification' || request.regressionAdmissionRef || !request.qualificationRoundRef || !sameRef(request.qualificationRoundRef, admission.ref) ||
      request.campaignId !== admission.campaignId || request.scenarioRefs.length !== 1 || !sameRef(request.scenarioRefs[0]!, definition.ref) ||
      !nullableEqual(request.sourcePlanRef, definition.sourcePlanRef) || !nullableEqual(request.reviewRef, definition.reviewRef) ||
      !sameRef(request.selectionManifestRef, selection.ref) || !sameRef(selection.ref, context.selection.ref) || !sameRef(selection.ref, admission.selectionManifestRef) ||
      admission.attempts.length !== selection.cells.length || !unique(admission.attempts.map(a => a.selectionCellId)) ||
      !unique(admission.attempts.map(a => a.executionId)) || !unique(admission.attempts.map(a => a.attemptId)) || !unique(admission.stateLeaseRefs.map(r => r.id)) ||
      digestOfValue([...new Set(request.caseRefs.map(refKey))].sort()).hex !== digestOfValue([...new Set(definition.caseRefs.map(refKey))].sort()).hex) throw new Conflict('qualification request differs from its registered closure or allocations');
  return context;
}
export async function authorizeQualificationExecution(owner: QualificationExecutionOwner, request: RunRequest, selection: SelectionManifest,
  ledger: LocalLedger, cellId: string | null): Promise<QualificationExecutionContext> {
  if (!request.qualificationRoundRef) throw new Conflict('qualification execution requires a registered round');
  const context = validateQualificationExecution(request, selection, await owner.resolve(structuredClone(request.qualificationRoundRef), structuredClone(request.requestedScope), ledger));
  await owner.authorizeEffects(structuredClone(request), structuredClone(context.admission), cellId);
  // Effect authorization may yield while invalidation or source/lease revocation is committed.
  const current = validateQualificationExecution(request, selection, await owner.resolve(structuredClone(request.qualificationRoundRef), structuredClone(request.requestedScope), ledger));
  if (digestOfValue(current).hex !== digestOfValue(context).hex) throw new Conflict('qualification authority changed before effects');
  return current;
}
