import { planSample, sampleCopy } from '../../conformance/helpers.ts';
import { LocalLedger } from '../../src/core/ledger.ts';
import { LocalScenarioStore } from '../../src/core/localScenarioStore.ts';
import { registerQualificationRound } from '../../src/core/scenario.ts';
import { prepareQualificationExecution } from '../../src/core/qualificationBundle.ts';
import { localQualificationExecutionOwner } from '../../src/core/qualificationExecution.ts';
import { CampaignFixturePlan, FidelityPlan, RunRequest, ScenarioDefinition, SelectionManifest,
  digestOfBytes, freeze, refKey, type Ref } from '../../src/protocol/index.ts';

const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
/** Real registration and two native cells; host/source/physical-lease authorization is simulated. */
export async function registeredQualificationFixture(track: (ledger: LocalLedger) => void, policyRef: Ref = ref('policy')) {
  const copy = sampleCopy(); const root = copy.stateDir;
  const ledger = LocalLedger.open(root); track(ledger);
  const base = planSample(copy.configPath, 'native-real');
  const previous = SelectionManifest.parse(base.documents[refKey(base.request!.selectionManifestRef)]);
  const secondId = `${previous.cells[0]!.selectionCellId}.second`;
  const selection = SelectionManifest.parse(freeze({ ...previous, ref: { id: 'two-cell-selection', revision: '1' }, cells: [...previous.cells, { ...previous.cells[0]!, selectionCellId: secondId }] }));
  const oldFidelity = FidelityPlan.parse(base.documents[refKey(base.request!.fidelityPlanRef)]);
  const fidelity = FidelityPlan.parse(freeze({ ...oldFidelity, ref: { id: 'two-cell-fidelity', revision: '1' }, selectionManifestRef: selection.ref,
    cells: [...oldFidelity.cells, { ...oldFidelity.cells[0]!, selectionCellId: secondId }] }));
  const oldFixtures = CampaignFixturePlan.parse(base.documents[refKey(base.request!.fixturePlanRef!)]);
  const fixtures = CampaignFixturePlan.parse(freeze({ ...oldFixtures, ref: { id: 'two-cell-fixtures', revision: '1' }, selectionManifestRef: selection.ref,
    cells: [...oldFixtures.cells, { ...oldFixtures.cells[0]!, selectionCellId: secondId }] }));
  const request = RunRequest.parse(freeze({ ...base.request!, selectionManifestRef: selection.ref, fidelityPlanRef: fidelity.ref, fixturePlanRef: fixtures.ref }));
  const documents = { ...base.documents }; for (const document of [selection, fidelity, fixtures, request]) documents[refKey(document.ref)] = document;
  const planned = { ...base, request, documents };
  const matrix = SelectionManifest.parse(freeze({ ...selection, ref: { id: 'qualification-matrix', revision: '1' }, policyRef }));
  const selected = SelectionManifest.parse(freeze({ ...matrix, ref: { id: 'registered-selection', revision: '1' } }));
  const definition = ScenarioDefinition.parse(freeze({ schemaVersion: 'workflow.scenario/v1', ref: { id: 'scenario', revision: '1' }, scope: selected.scope,
    sourcePlanRef: null, reviewRef: ref('review'), caseRefs: request.caseRefs, replayContractRef: ref('contract'),
    qualificationPolicyRef: matrix.policyRef, qualificationMatrixRef: matrix.ref, qualificationTargetProfileRef: ref('target') }));
  const store = new LocalScenarioStore(ledger, 'entry', selected.scope, { authorize: async () => {}, validateDefinition: async () => {}, validateStateLeases: async () => {} });
  await store.initialize(definition, [matrix, selected]);
  const token = { id: 'entry', scope: selected.scope, expectedAggregateVersion: 1, expectedDefinitionRef: definition.ref, expectedInvalidationEpoch: 0, expectedLatestRoundSequence: 0 };
  const admission = await registerQualificationRound(store.ports(), token, { selectionManifestRef: selected.ref, stateLeaseRefs: [ref('reserved-local-state')] });
  const owner = localQualificationExecutionOwner(store, async () => {});
  const unchanged = JSON.stringify(planned);
  const bundle = await prepareQualificationExecution(planned, admission.ref, selected.scope, ledger, owner);
  if (JSON.stringify(planned) !== unchanged) throw new Error('qualification preparation modified the original plan');
  return { root, ledger, store, admission, definition, owner, bundle, planned, scope: selected.scope };
}
