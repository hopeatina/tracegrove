import { afterAll, beforeAll, expect, it } from 'vitest';
import { cleanupTemps } from '../conformance/helpers.ts';
import { qualificationFixture } from './fixtures/qualification.ts';
import { readQualificationEvidence, type QualificationEvidence } from '../src/core/qualification.ts';
import { assessReplayEvidence } from '../src/core/replayEvidence.ts';
import { QualificationPolicy, ScenarioDefinition, FidelityPlan, SourceSelection, digestOfBytes, freeze, refKey,
  type Provenance, type Ref } from '../src/protocol/index.ts';

let evidence: QualificationEvidence;
let policy: QualificationPolicy;
let scenario: ScenarioDefinition;
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
beforeAll(async () => {
  const saved = await qualificationFixture(false, undefined, 'native-real');
  evidence = await readQualificationEvidence(saved.ports, saved.input);
  policy = QualificationPolicy.parse(freeze({ schemaVersion: 'workflow.qualification-policy/v1', ref: { id: 'policy', revision: '1' },
    scope: evidence.round.scope, requiredLevel: 'environment', minimumIndependentRounds: 2 }));
  scenario = ScenarioDefinition.parse(freeze({ schemaVersion: 'workflow.scenario/v1', ref: { id: 'scenario', revision: '1' },
    scope: evidence.round.scope, sourcePlanRef: null, reviewRef: ref('review'), caseRefs: saved.bundle.request.caseRefs,
    replayContractRef: saved.admission.replayContractRef, qualificationPolicyRef: policy.ref,
    qualificationMatrixRef: saved.admission.qualificationMatrixRef, qualificationTargetProfileRef: saved.admission.targetProfileRef }));
});
afterAll(cleanupTemps);

it.each([
  { runtime: 'mocked' }, { runtime: 'replay' }, { data: 'mocked' }, { provider: 'mocked' }, { provider: 'replay' },
  { faults: 'controlled' }, { interceptors: [ref('interceptor')] }, { injectedFaults: [ref('fault')] },
] satisfies Partial<Provenance>[])('cannot promote non-live provenance %j', change => {
  // Unit-check the proof-strength classifier, after separately testing authenticated bundle readback.
  const changed = structuredClone(evidence);
  Object.assign(changed.bundle.receipts[0]!.environment.provenance, change);
  const result = assessReplayEvidence(changed, policy, scenario);
  expect(result.assessment).toMatchObject({ level: 'mock', qualifies: false });
  expect(result.findings.map(f => f.code)).toContain('non_live_provenance');
});
it.each(['unknown', 'different component', 'different flag', 'empty required set'] as const)('rejects %s target identity', kind => {
  const changed = structuredClone(evidence); const env = changed.bundle.receipts[0]!.environment;
  if (kind === 'unknown') env.observed = null;
  if (kind === 'different component') env.observed!.components[0]!.identity = null;
  if (kind === 'different flag') env.observed!.featureFlagsDigest = digestOfBytes('different');
  if (kind === 'empty required set') { env.expected.requiredComponents = []; env.observed!.requiredComponents = []; }
  const result = assessReplayEvidence(changed, policy, scenario);
  expect(result.assessment.qualifies).toBe(false);
  expect(result.findings.map(f => f.code)).toContain('target_identity_unproven');
});
it('rejects a stubbed claimed boundary even under an otherwise live provenance label', () => {
  const changed = structuredClone(evidence);
  const fidelity = FidelityPlan.parse(changed.bundle.documents[refKey(changed.bundle.request.fidelityPlanRef)]);
  fidelity.cells[0]!.boundaries[0]!.mode = 'stubbed';
  changed.bundle.documents[refKey(changed.bundle.request.fidelityPlanRef)] = fidelity;
  expect(assessReplayEvidence(changed, policy, scenario).assessment.qualifies).toBe(false);
});
it('requires revision proof for source-derived scenarios even with an environment policy', () => {
  const sourceScenario = ScenarioDefinition.parse(freeze({ ...scenario, sourcePlanRef: ref('source-plan') }));
  const result = assessReplayEvidence(evidence, policy, sourceScenario);
  expect(result.assessment.qualifies).toBe(false);
  expect(result.findings.map(f => f.code)).toContain('revision_identity_unproven');
});

function revisionEvidence() {
  // Synthetic resolved-source fixture for classifier guards, not an attested source resolver.
  const value = structuredClone(evidence);
  const repository = { repositoryRole: 'application', canonicalUrl: 'https://example.invalid/application.git', requestedRef: 'candidate',
    resolvedCommit: 'a'.repeat(40), origin: 'remote_object' as const, sourceObjectsRef: ref('objects'), lockfileDigest: digestOfBytes('lock'), dirty: false as const };
  const source = SourceSelection.parse(freeze({ schemaVersion: 'workflow.source-selection/v1', ref: { id: 'source', revision: '1' },
    scope: value.round.scope, draftRevision: 0, strategy: 'head_only', repositories: [{ repositoryRole: repository.repositoryRole,
      canonicalUrl: repository.canonicalUrl, requestedExpression: repository.requestedRef, headCommit: repository.resolvedCommit,
      baseCommit: null, origin: repository.origin, sourceObjectsRef: repository.sourceObjectsRef, lockfileDigest: repository.lockfileDigest,
      resolvedAt: '2026-10-14T00:00:00Z', resolverRef: ref('resolver') }], excludedRoles: [], compatibilityRuleRefs: [], revisionMatrixRef: null }));
  value.bundle.documents[refKey(source.ref)] = source; value.bundle.request.sourceSelectionRef = source.ref;
  for (const receipt of value.bundle.receipts) {
    receipt.environment.expected.repositories = [structuredClone(repository)]; receipt.environment.observed!.repositories = [structuredClone(repository)];
  }
  return value;
}
it('refuses synthetic matching repository metadata without the frozen executable source closure', () => {
  const stronger = QualificationPolicy.parse(freeze({ ...policy, requiredLevel: 'revision' }));
  const good = assessReplayEvidence(revisionEvidence(), stronger, scenario);
  // Actual positive revision qualification is exercised by repository-selection.test.ts.
  expect(good.assessment).toMatchObject({ level: 'environment', qualifies: false });
  expect(good.findings.map(f => f.code)).toContain('revision_identity_unproven');
  for (const field of ['commit', 'origin', 'lockfile', 'objects', 'role', 'missing repository'] as const) {
    const changed = revisionEvidence();
    // Keep expected/observed target equal so source-to-target checks must catch the mismatch.
    for (const target of [changed.bundle.receipts[0]!.environment.expected, changed.bundle.receipts[0]!.environment.observed!]) {
      const repository = target.repositories[0]!;
      if (field === 'commit') repository.resolvedCommit = 'b'.repeat(40);
      if (field === 'origin') repository.origin = 'snapshot_bundle';
      if (field === 'lockfile') repository.lockfileDigest = digestOfBytes('other lock');
      if (field === 'objects') repository.sourceObjectsRef = ref('foreign-objects');
      if (field === 'role') repository.repositoryRole = 'different-role';
      if (field === 'missing repository') target.repositories = [];
    }
    const result = assessReplayEvidence(changed, stronger, scenario);
    expect(result.assessment.qualifies, field).toBe(false);
    expect(result.findings.map(f => f.code), field).toContain('revision_identity_unproven');
    expect(assessReplayEvidence(changed, policy, scenario).assessment.qualifies, `environment policy cannot waive ${field}`).toBe(false);
  }
});
it('refuses source claims without a registered resolver, including under an environment policy', () => {
  const changed = revisionEvidence(); const key = refKey(changed.bundle.request.sourceSelectionRef!);
  const source = SourceSelection.parse(changed.bundle.documents[key]); source.repositories[0]!.resolverRef = null;
  changed.bundle.documents[key] = source;
  expect(assessReplayEvidence(changed, policy, scenario).assessment.qualifies).toBe(false);
});
