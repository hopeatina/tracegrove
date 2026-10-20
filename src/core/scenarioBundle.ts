import { CampaignFixturePlan, FidelityPlan, RunRequest, SelectionManifest, digestOfValue, freeze, refKey, sameRef, sameScope,
  verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import type { FrozenBundle } from './planner.ts';
import { Conflict } from './errors.ts';

type Lifecycle = Pick<RunRequest, 'purpose' | 'campaignId' | 'sourcePlanRef' | 'reviewRef' | 'scenarioRefs' | 'qualificationRoundRef' | 'regressionAdmissionRef'>;
/** Rebind lifecycle metadata over unchanged executable cells; never edits assertions, hosts or fixture recipes. */
export function scenarioBaseRequest(bundle: FrozenBundle, scope: Scope): RunRequest {
  const base = bundle.request;
  if (!base || !verifySelfDigest(base) || !sameScope(base.requestedScope, scope) || !['trial', 'work_proof'].includes(base.purpose) ||
      base.sourcePlanRef || base.reviewRef || base.scenarioRefs.length || base.qualificationRoundRef || base.regressionAdmissionRef)
    throw new Conflict('scenario preparation requires an unchanged non-lifecycle frozen plan');
  return base;
}
export function rebindScenarioBundle(bundle: FrozenBundle, scope: Scope, selection: SelectionManifest,
  identity: { kind: 'qualification' | 'regression'; digest: string }, lifecycle: Lifecycle, additions: Array<{ ref: Ref }>): FrozenBundle {
  const base = scenarioBaseRequest(bundle, scope), key = `${identity.kind}-${identity.digest}`;
  const recordId = (role: string) => `${identity.kind}-${role}-${identity.digest}`;
  const original = SelectionManifest.parse(bundle.documents[refKey(base.selectionManifestRef)]);
  if (!verifySelfDigest(original) || digestOfValue({ cells: original.cells, excluded: original.excludedCells }).hex !==
      digestOfValue({ cells: selection.cells, excluded: selection.excludedCells }).hex) throw new Conflict('scenario execution cannot change the frozen case/persona/target matrix');
  const documents = structuredClone(bundle.documents);
  for (const document of additions) {
    const key = refKey(document.ref);
    if (documents[key] && digestOfValue(documents[key]).hex !== digestOfValue(document).hex) throw new Conflict('scenario evidence conflicts with its owning record');
    documents[key] = structuredClone(document);
  }
  const source = FidelityPlan.parse(documents[refKey(base.fidelityPlanRef)]);
  if (!verifySelfDigest(source) || !sameRef(source.selectionManifestRef, original.ref)) throw new Conflict('scenario fidelity input changed');
  const fidelity = FidelityPlan.parse(freeze({ ...source, ref: { id: recordId('fidelity'), revision: '1' }, selectionManifestRef: selection.ref }));
  documents[refKey(fidelity.ref)] = fidelity;
  let fixtureRef: Ref | null = null;
  if (base.fixturePlanRef) {
    const prior = CampaignFixturePlan.parse(documents[refKey(base.fixturePlanRef)]);
    if (!verifySelfDigest(prior) || !sameRef(prior.selectionManifestRef, original.ref)) throw new Conflict('scenario fixture input changed');
    const fixture = CampaignFixturePlan.parse(freeze({ ...prior, ref: { id: recordId('fixtures'), revision: '1' }, selectionManifestRef: selection.ref }));
    documents[refKey(fixture.ref)] = fixture; fixtureRef = fixture.ref;
  }
  const request = RunRequest.parse(freeze({ ...base, ...lifecycle, ref: { id: recordId('request'), revision: '1' },
    clientRequestId: key, idempotencyKey: key, selectionManifestRef: selection.ref, fidelityPlanRef: fidelity.ref,
    fixturePlanRef: fixtureRef, replayOf: null }));
  documents[refKey(request.ref)] = request;
  return { ...structuredClone(bundle), request, documents };
}
