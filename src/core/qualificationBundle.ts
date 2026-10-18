import { CampaignFixturePlan, FidelityPlan, RunRequest, SelectionManifest, digestOfValue, freeze, refKey, sameRef, sameScope,
  verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import type { LocalLedger } from './ledger.ts';
import type { FrozenBundle } from './planner.ts';
import { QualificationExecutionContext, validateQualificationExecution, type QualificationExecutionOwner } from './qualificationExecution.ts';

/** New execution request from unchanged frozen contracts. No trial receipt is read or relabelled. */
export async function prepareQualificationExecution(bundle: FrozenBundle, admissionRef: Ref, scope: Scope,
  ledger: LocalLedger, owner: QualificationExecutionOwner): Promise<FrozenBundle> {
  const base = bundle.request;
  if (!base || !verifySelfDigest(base) || !sameScope(base.requestedScope, scope) || !['trial', 'work_proof'].includes(base.purpose) ||
      base.sourcePlanRef || base.reviewRef || base.scenarioRefs.length || base.qualificationRoundRef) throw new Conflict('qualification preparation requires an unchanged non-lifecycle frozen plan');
  const context = QualificationExecutionContext.parse(await owner.resolve(structuredClone(admissionRef), structuredClone(scope), ledger));
  const { admission, definition, selection } = context;
  if (!sameRef(admission.ref, admissionRef)) throw new Conflict('qualification resolver returned another admission');
  const original = SelectionManifest.parse(bundle.documents[refKey(base.selectionManifestRef)]);
  if (!verifySelfDigest(original) || digestOfValue({ cells: original.cells, excluded: original.excludedCells }).hex !==
      digestOfValue({ cells: selection.cells, excluded: selection.excludedCells }).hex) throw new Conflict('qualification cannot change the frozen case/persona/target matrix');
  const suffix = admission.ref.digest.hex;
  const sourceFidelity = FidelityPlan.parse(bundle.documents[refKey(base.fidelityPlanRef)]);
  if (!verifySelfDigest(sourceFidelity) || !sameRef(sourceFidelity.selectionManifestRef, original.ref)) throw new Conflict('qualification fidelity input changed');
  const fidelity = FidelityPlan.parse(freeze({ ...sourceFidelity, ref: { id: `qualification-fidelity-${suffix}`, revision: '1' }, selectionManifestRef: selection.ref }));
  const documents = structuredClone(bundle.documents);
  for (const document of [admission, definition, selection, context.matrix, fidelity]) documents[refKey(document.ref)] = document;
  if (context.sourceReview) {
    for (const document of [context.sourceReview.plan, context.sourceReview.review, context.sourceReview.validation]) {
      const key = refKey(document.ref);
      if (documents[key] && digestOfValue(documents[key]).hex !== digestOfValue(document).hex) throw new Conflict('qualification source evidence conflicts with its owning review');
      documents[key] = structuredClone(document);
    }
  }
  let fixtureRef: Ref | null = null;
  if (base.fixturePlanRef) {
    const source = CampaignFixturePlan.parse(documents[refKey(base.fixturePlanRef)]);
    if (!verifySelfDigest(source) || !sameRef(source.selectionManifestRef, original.ref)) throw new Conflict('qualification fixture input changed');
    const fixture = CampaignFixturePlan.parse(freeze({ ...source, ref: { id: `qualification-fixtures-${suffix}`, revision: '1' }, selectionManifestRef: selection.ref }));
    documents[refKey(fixture.ref)] = fixture; fixtureRef = fixture.ref;
  }
  const request = RunRequest.parse(freeze({ ...base, ref: { id: `qualification-request-${suffix}`, revision: '1' }, clientRequestId: `qualification-${suffix}`,
    idempotencyKey: `qualification-${suffix}`, campaignId: admission.campaignId, purpose: 'qualification', sourcePlanRef: definition.sourcePlanRef,
    reviewRef: definition.reviewRef, scenarioRefs: [definition.ref], qualificationRoundRef: admission.ref, selectionManifestRef: selection.ref,
    fidelityPlanRef: fidelity.ref, fixturePlanRef: fixtureRef, replayOf: null }));
  validateQualificationExecution(request, selection, context); documents[refKey(request.ref)] = request;
  return { ...structuredClone(bundle), request, documents };
}
