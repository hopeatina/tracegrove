import { ReplayComparison, FidelityPlan, digestOfValue, refKey, sameDigest, sameScope,
  type ReplayComparisonPoint, type ReplayChange } from '../protocol/index.ts';
import { VerifiedBundleSnapshot, type VerifiedBundleRecords } from './bundle.ts';
import { Conflict } from './errors.ts';

type Row = ReplayComparison['rows'][number];
type Indexed = { rows: Map<string, Omit<Row, 'baseline' | 'candidate' | 'change'> & { points: ReplayComparisonPoint[] }>; executionIds: Set<string> };

function index(bundle: VerifiedBundleRecords): Indexed {
  const rows: Indexed['rows'] = new Map();
  const receipts = new Map(bundle.receipts.map(receipt => [receipt.selectionCellId, receipt]));
  const fidelity = FidelityPlan.parse(bundle.documents[refKey(bundle.request.fidelityPlanRef)]);
  for (const cell of bundle.selection.cells) {
    const dimensions = { caseId: cell.caseRef.id, personaId: cell.personaRef.id, surfaceId: cell.surfaceBindingRef.id,
      variantId: cell.variantRef?.id ?? null, environmentId: cell.environmentRef.id };
    const key = digestOfValue(dimensions);
    const receipt = receipts.get(cell.selectionCellId);
    const plan = fidelity.cells.find(value => value.selectionCellId === cell.selectionCellId);
    const point: ReplayComparisonPoint = {
      selectionCellId: cell.selectionCellId, required: cell.required, caseRef: cell.caseRef, personaRef: cell.personaRef,
      surfaceBindingRef: cell.surfaceBindingRef, variantRef: cell.variantRef,
      contractDigest: digestOfValue({ caseRef: cell.caseRef, personaRef: cell.personaRef, surfaceBindingRef: cell.surfaceBindingRef,
        variantRef: cell.variantRef, required: cell.required }),
      contextDigest: digestOfValue({ environmentRef: cell.environmentRef, hostRef: cell.executionHostRef,
        fidelity: plan ? { lane: plan.lane, boundaryProfileRef: plan.boundaryProfileRef, boundaries: plan.boundaries, claimBoundaryIds: plan.claimBoundaryIds } : null,
        limits: bundle.request.limits, intelligencePolicyRef: bundle.request.intelligencePolicyRef, runner: cell.expectedTarget.runner, evaluator: cell.expectedTarget.evaluator,
        provenance: receipt?.environment.provenance ?? null }),
      expectedTargetDigest: digestOfValue(cell.expectedTarget),
      observedTargetDigest: receipt?.environment.observed ? digestOfValue(receipt.environment.observed) : null,
      declaredComponents: cell.expectedTarget.components, observedComponents: receipt?.environment.observed?.components ?? null,
      repositoryCommits: (receipt?.environment.observed?.repositories ?? []).map(({ repositoryRole, resolvedCommit }) => ({ repositoryRole, resolvedCommit })),
      receiptRef: receipt?.ref ?? null, executionId: receipt?.executionId ?? null,
      outcome: receipt?.outcome ?? null, proofEligible: receipt?.proofEligible ?? null, reasons: receipt?.reasonCodes ?? [],
      steps: (receipt?.steps ?? []).map(({ stepId, result, reasonCode }) => ({ stepId, result, reasonCode })),
      assertions: (receipt?.assertions ?? []).map(({ assertionId, required, result, reasonCode }) => ({ assertionId, required, result, reasonCode })),
    };
    const row = rows.get(key.hex) ?? { key, dimensions, points: [] };
    row.points.push(point); rows.set(key.hex, row);
  }
  for (const row of rows.values()) row.points.sort((a, b) => a.selectionCellId.localeCompare(b.selectionCellId));
  return { rows, executionIds: new Set(bundle.receipts.map(receipt => receipt.executionId)) };
}

function classify(baseline: ReplayComparisonPoint[], candidate: ReplayComparisonPoint[], policyChanged: boolean): ReplayChange {
  if (!baseline.length) return 'selection_added';
  if (!candidate.length) return 'selection_removed';
  if (baseline.length !== 1 || candidate.length !== 1) return 'ambiguous_selection';
  const before = baseline[0]!, after = candidate[0]!;
  if (!before.receiptRef || !after.receiptRef) return 'missing_receipt';
  if (!sameDigest(before.contractDigest, after.contractDigest)) return 'contract_changed';
  if (policyChanged || !sameDigest(before.contextDigest, after.contextDigest)) return 'context_changed';
  if (before.outcome === after.outcome) return 'unchanged';
  if (before.outcome === 'passed' && after.outcome === 'assertion_failed') return 'passed_to_failed';
  if (before.outcome === 'assertion_failed' && after.outcome === 'passed') return 'failed_to_passed';
  return 'outcome_changed';
}

/** Compare independently reduced captured records. No discovery, execution, review or activation occurs. */
export function compareReplays(baselineSnapshot: VerifiedBundleSnapshot, candidateSnapshot: VerifiedBundleSnapshot): ReplayComparison {
  const baseline = baselineSnapshot.records, candidate = candidateSnapshot.records;
  if (!sameScope(baseline.request.requestedScope, candidate.request.requestedScope)) throw new Conflict('replay comparison requires the same evidence scope');
  const before = index(baseline), after = index(candidate);
  const selectionPolicyChanged = digestOfValue(baseline.selection.policyRef).hex !== digestOfValue(candidate.selection.policyRef).hex;
  const rows = [...new Set([...before.rows.keys(), ...after.rows.keys()])].sort().map(key => {
    const a = before.rows.get(key), b = after.rows.get(key);
    const left = a?.points ?? [], right = b?.points ?? [];
    return { key: (a ?? b)!.key, dimensions: (a ?? b)!.dimensions, baseline: left, candidate: right,
      change: classify(left, right, selectionPolicyChanged) };
  });
  const summary = (snapshot: VerifiedBundleSnapshot, bundle: VerifiedBundleRecords) => ({ manifestDigest: snapshot.manifestDigest,
    campaignId: bundle.campaign.campaignId, requestRef: bundle.request.ref, outcome: bundle.campaign.outcome, coverage: bundle.campaign.coverage,
    selectedCells: bundle.selection.cells.length, retainedReceipts: bundle.receipts.length, excludedCells: bundle.selection.excludedCells });
  return ReplayComparison.parse({ schemaVersion: 'tracegrove.replay-comparison/v1', scope: baseline.request.requestedScope,
    operation: 'read_only', qualification: 'not_evaluated', issuerTrust: 'not_authenticated', evidenceScope: 'provided_bundles_only',
    executionIdentityRelation: baseline.campaign.campaignId === candidate.campaign.campaignId ? 'same_campaign' :
      !before.executionIds.size || !after.executionIds.size ? 'unavailable' :
      [...before.executionIds].some(id => after.executionIds.has(id)) ? 'overlapping_executions' : 'distinct_recorded_executions',
    baseline: summary(baselineSnapshot, baseline), candidate: summary(candidateSnapshot, candidate), selectionPolicyChanged, rows });
}
