import { localScope } from '../../src/core/corpus.ts';
import { LocalLedger } from '../../src/core/ledger.ts';
import { executeBundle } from '../../src/core/executor.ts';
import { LocalQualificationResults, type LocalQualificationResultAuthority } from '../../src/core/localQualificationResults.ts';
import { registerQualificationRound } from '../../src/core/scenario.ts';
import { prepareQualificationExecution } from '../../src/core/qualificationBundle.ts';
import { QualificationPolicy, digestOfBytes, freeze, type ScenarioActivationIntent, type ScenarioProjection } from '../../src/protocol/index.ts';
import { registeredQualificationFixture } from './registeredQualification.ts';

const ref = (id: string) => ({ id, revision: '1', digest: digestOfBytes(id) });
export const projectionToken = (p: ScenarioProjection) => ({ id: p.id, scope: p.scope, expectedAggregateVersion: p.aggregateVersion,
  expectedDefinitionRef: p.definitionRef, expectedInvalidationEpoch: p.invalidationEpoch, expectedLatestRoundSequence: p.latestRoundSequence });
/** Actual ledger/registration/execution/result path. External authority is explicitly simulated. */
export async function registeredReplayFixture(track: (ledger: LocalLedger) => void, profileName = 'native-real') {
  const policy = QualificationPolicy.parse(freeze({ schemaVersion: 'workflow.qualification-policy/v1', ref: { id: 'actual-policy', revision: '1' },
    scope: localScope(), requiredLevel: 'environment', minimumIndependentRounds: 2 }));
  const f = await registeredQualificationFixture(track, policy.ref, profileName);
  const controls = { authorized: true, calls: 0, beforeAuthorization: async () => {} };
  const resultAuthority: LocalQualificationResultAuthority = { authorize: async () => {}, authorizeRetention: async () => {},
    resolveAdmission: (ref, scope) => f.store.resolveAdmission(ref, scope), authenticateEvidence: async () => {} };
  const results = new LocalQualificationResults(f.ledger, f.scope, resultAuthority);
  const complete = async (bundle: typeof f.bundle) => {
    const run = await executeBundle({ bundle, ledger: f.ledger, stateDir: f.root, scope: f.scope, qualification: f.owner });
    return results.retain({ admissionRef: bundle.request!.qualificationRoundRef!, scope: f.scope, bundleDir: run.executionDir });
  };
  const first = await complete(f.bundle);
  const pending = async () => {
    const { projection } = await f.store.read('entry', f.scope);
    return registerQualificationRound(f.store.ports(), projectionToken(projection), { selectionManifestRef: f.admission.selectionManifestRef,
      stateLeaseRefs: [ref(`independent-state-${projection.latestRoundSequence + 1}`)] });
  };
  const admission = await pending();
  const second = await complete(await prepareQualificationExecution(f.planned, admission.ref, f.scope, f.ledger, f.owner));
  const projection = (await f.store.read('entry', f.scope)).projection;
  const intent: ScenarioActivationIntent = { snapshot: projectionToken(projection), replayContractRef: f.definition.replayContractRef,
    qualificationPolicyRef: policy.ref, qualificationMatrixRef: f.definition.qualificationMatrixRef,
    targetProfileRef: f.definition.qualificationTargetProfileRef, roundRefs: [first.round.ref, second.round.ref], idempotencyKey: 'activate-local' };
  const authority = { resolvePolicy: async () => policy, authorizeActivation: async () => {
    controls.calls++; await controls.beforeAuthorization();
    if (!controls.authorized) throw new Error('activation denied');
    return { actorId: 'authenticated-local-owner', policyRef: ref('activation-policy') };
  } };
  const ports = f.store.activationPorts(results, authority);
  return { ...f, results, resultAuthority, first, second, policy, controls, authority, ports, intent, pending };
}
