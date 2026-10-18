import { z } from 'zod';
import { RegressionAdmission, ScenarioActivation, ScenarioDefinition, SelectionManifest, digestOfValue, refKey, sameRef, sameScope,
  verifySelfDigest, type Ref, type RunRequest, type Scope } from '../protocol/index.ts';
import { ApprovedPlanReview, validateApprovedPlanReview, validatePromotedCases } from './sourcePromotion.ts';
import { validateQualificationMatrix } from './scenario.ts';
import { Conflict } from './errors.ts';
import type { LocalLedger } from './ledger.ts';

export const RegressionExecutionContext = z.object({ admission: RegressionAdmission, definition: ScenarioDefinition,
  activation: ScenarioActivation, selection: SelectionManifest, matrix: SelectionManifest, sourceReview: ApprovedPlanReview.optional() }).strict();
export type RegressionExecutionContext = z.infer<typeof RegressionExecutionContext>;
export interface RegressionExecutionOwner {
  resolve(ref: Ref, scope: Scope, ledger: LocalLedger): Promise<unknown>;
  authorizeEffects(request: RunRequest, admission: RegressionAdmission, cellId: string | null): Promise<void>;
}
export function validateRegressionExecution(request: RunRequest, selection: SelectionManifest, raw: unknown): RegressionExecutionContext {
  const context = RegressionExecutionContext.parse(raw), { definition } = context;
  validateRegressionBinding(request, selection, context);
  if (definition.sourcePlanRef) {
    if (!context.sourceReview) throw new Conflict('source-backed regression needs current review evidence');
    const approved = context.sourceReview;
    validateApprovedPlanReview(approved, { id: approved.projection.id, scope: definition.scope,
      expectedEditRevision: approved.projection.editRevision, expectedSourcePlanRef: definition.sourcePlanRef }, definition.reviewRef);
    validatePromotedCases(definition, approved);
  } else if (context.sourceReview) throw new Conflict('unbound source review in regression context');
  return context;
}
/** Historical closure binding only. Issuer, current activation, leases and effects remain host authority. */
function validateRegressionBinding(request: RunRequest, selection: SelectionManifest, context: RegressionExecutionContext): void {
  const { admission, definition, activation, matrix } = context;
  for (const document of [admission, definition, activation, selection, context.selection, matrix]) {
    if (!verifySelfDigest(document) || !sameScope(document.scope, request.requestedScope)) throw new Conflict('regression document seal or scope mismatch');
  }
  const nullableEqual = (a: Ref | null, b: Ref | null) => a === null ? b === null : b !== null && sameRef(a, b);
  if (request.purpose !== 'regression' || !request.regressionAdmissionRef || !sameRef(request.regressionAdmissionRef, admission.ref) ||
      request.qualificationRoundRef || request.campaignId !== admission.campaignId || request.replayOf ||
      request.idempotencyKey !== `regression-${admission.ref.digest.hex}` ||
      !sameScope(admission.intent.snapshot.scope, admission.scope) || !sameScope(activation.intent.snapshot.scope, admission.scope) ||
      admission.intent.snapshot.id !== activation.intent.snapshot.id ||
      admission.intent.snapshot.expectedInvalidationEpoch !== activation.intent.snapshot.expectedInvalidationEpoch ||
      new Set(admission.intent.stateLeaseRefs.map(ref => ref.id)).size !== admission.intent.stateLeaseRefs.length ||
      request.scenarioRefs.length !== 1 || !sameRef(request.scenarioRefs[0]!, definition.ref) ||
      !nullableEqual(request.sourcePlanRef, definition.sourcePlanRef) || !nullableEqual(request.reviewRef, definition.reviewRef) ||
      !sameRef(admission.intent.snapshot.expectedDefinitionRef, definition.ref) || !sameRef(admission.activationRef, activation.ref) ||
      !sameRef(activation.intent.snapshot.expectedDefinitionRef, definition.ref) ||
      !sameRef(selection.ref, context.selection.ref) || !sameRef(request.selectionManifestRef, selection.ref) ||
      !sameRef(selection.ref, admission.intent.selectionManifestRef) ||
      digestOfValue(request.caseRefs.map(refKey).sort()).hex !== digestOfValue(definition.caseRefs.map(refKey).sort()).hex)
    throw new Conflict('regression request differs from its active registered closure');
  validateQualificationMatrix(definition, matrix, selection);
  const bindings = [[definition.replayContractRef, activation.intent.replayContractRef], [definition.qualificationPolicyRef, activation.intent.qualificationPolicyRef],
    [definition.qualificationMatrixRef, activation.intent.qualificationMatrixRef], [definition.qualificationTargetProfileRef, activation.intent.targetProfileRef]] as const;
  if (bindings.some(([a, b]) => !sameRef(a, b))) throw new Conflict('regression activation closure changed');
}
export function validateRecordedRegression(request: RunRequest, selection: SelectionManifest, documents: Record<string, unknown>): void {
  if (request.purpose !== 'regression') {
    if (request.regressionAdmissionRef) throw new Conflict('regression reference on another request purpose');
    return;
  }
  if (!request.regressionAdmissionRef || request.scenarioRefs.length !== 1) throw new Conflict('recorded regression admission is missing');
  const admission = RegressionAdmission.parse(documents[refKey(request.regressionAdmissionRef)]);
  const definition = ScenarioDefinition.parse(documents[refKey(request.scenarioRefs[0]!)]);
  validateRegressionBinding(request, selection, RegressionExecutionContext.parse({ admission, definition,
    activation: documents[refKey(admission.activationRef)], selection, matrix: documents[refKey(definition.qualificationMatrixRef)] }));
}
export async function authorizeRegressionExecution(owner: RegressionExecutionOwner, request: RunRequest, selection: SelectionManifest,
  ledger: LocalLedger, cellId: string | null): Promise<RegressionExecutionContext> {
  if (!request.regressionAdmissionRef) throw new Conflict('regression execution needs a registered admission');
  const resolve = async () => validateRegressionExecution(request, selection,
    await owner.resolve(structuredClone(request.regressionAdmissionRef!), structuredClone(request.requestedScope), ledger));
  const context = await resolve();
  await owner.authorizeEffects(structuredClone(request), structuredClone(context.admission), cellId);
  if (digestOfValue(await resolve()).hex !== digestOfValue(context).hex) throw new Conflict('regression authority changed before effects');
  return context;
}
