import {
  FidelityPlan, ReplayAssessment, ReplayFinding, SourceSelection, digestOfValue, freeze, refKey, sameDigest, sameRef, sameScope,
  type QualificationPolicy, type ReplayFindingCode, type ScenarioDefinition,
} from '../protocol/index.ts';
import type { QualificationEvidence } from './qualification.ts';

/** Derive proof strength from independently checked observations; outcome flags alone grant nothing. */
export function assessReplayEvidence(evidence: QualificationEvidence, policy: QualificationPolicy, scenario: ScenarioDefinition): {
  assessment: ReplayAssessment; findings: ReplayFinding[];
} {
  const { round, bundle } = evidence;
  const codes = new Set<ReplayFindingCode>();
  if (bundle.campaign.outcome !== 'passed') codes.add('campaign_not_passed');
  const fidelity = FidelityPlan.parse(bundle.documents[refKey(bundle.request.fidelityPlanRef)]);
  const live = bundle.receipts.every(receipt => {
    const p = receipt.environment.provenance;
    const cell = fidelity.cells.find(c => c.selectionCellId === receipt.selectionCellId);
    return p.runtime === 'live' && p.data !== 'mocked' && ['live', 'none'].includes(p.provider) && p.faults === 'none' &&
      !p.interceptors.length && !p.injectedFaults.length && !!cell && !['mock_contract', 'recorded_replay'].includes(cell.lane) &&
      cell.claimBoundaryIds.length > 0 && cell.claimBoundaryIds.every(id => cell.boundaries.some(b => b.boundaryId === id && b.mode === 'real'));
  });
  if (!live) codes.add('non_live_provenance');
  const identity = bundle.receipts.every(receipt => {
    const { expected, observed } = receipt.environment;
    return !!observed && expected.requiredComponents.length > 0 &&
      expected.requiredComponents.every(id => expected.components.some(c => c.componentId === id && c.identity !== null)) &&
      sameDigest(digestOfValue(expected), digestOfValue(observed));
  });
  if (!identity) codes.add('target_identity_unproven');
  const source = bundle.request.sourceSelectionRef ? SourceSelection.safeParse(bundle.documents[refKey(bundle.request.sourceSelectionRef)]) : null;
  const revision = live && identity && source?.success === true && sameRef(source.data.ref, bundle.request.sourceSelectionRef!) &&
    sameScope(source.data.scope, round.scope) && source.data.repositories.length > 0 &&
    source.data.repositories.every(repository => repository.resolverRef !== null) &&
    source.data.excludedRoles.every(role => role.reasonRef !== null) &&
    new Set(source.data.repositories.map(r => r.repositoryRole)).size === source.data.repositories.length &&
    bundle.receipts.every(receipt => {
      const observed = receipt.environment.observed!;
      return observed.repositories.length === source.data.repositories.length &&
        new Set(observed.repositories.map(r => r.repositoryRole)).size === observed.repositories.length &&
        source.data.repositories.every(repository => observed.repositories.some(r => r.repositoryRole === repository.repositoryRole &&
          r.canonicalUrl === repository.canonicalUrl && r.resolvedCommit === repository.headCommit &&
          r.origin === repository.origin && sameDigest(r.lockfileDigest, repository.lockfileDigest) &&
          (r.sourceObjectsRef === null ? repository.sourceObjectsRef === null : repository.sourceObjectsRef !== null && sameRef(r.sourceObjectsRef, repository.sourceObjectsRef))));
    });
  const sourceBound = scenario.sourcePlanRef !== null || bundle.request.sourceSelectionRef !== null ||
    bundle.receipts.some(receipt => receipt.environment.expected.repositories.length > 0);
  if ((policy.requiredLevel === 'revision' || sourceBound) && !revision) codes.add('revision_identity_unproven');
  const level = !live ? 'mock' : !identity ? 'structural' : revision ? 'revision' : 'environment';
  const findings = [...codes].sort().map(code => ReplayFinding.parse(freeze({ schemaVersion: 'workflow.replay-finding/v1',
    ref: { id: `replay-finding-${digestOfValue({ round: round.ref, code }).hex}`, revision: '1' }, scope: round.scope, roundRef: round.ref, code,
  })));
  const assessment = ReplayAssessment.parse(freeze({ schemaVersion: 'workflow.replay-assessment/v1',
    ref: { id: `replay-assessment-${digestOfValue({ round: round.ref, policy: policy.ref, scenario: scenario.ref }).hex}`, revision: '1' },
    scope: round.scope, roundRef: round.ref, level, qualifies: findings.length === 0, reasonRefs: findings.map(finding => finding.ref),
  }));
  return { assessment, findings };
}
