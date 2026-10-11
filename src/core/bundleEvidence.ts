/** Reconstruct verdict inputs from evidence records, never from outcome labels. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BoundaryObservation, FidelityPlan, FixtureManifest, HostCapabilityObservation, HostLease,
  HostPlan, IdentityAttestation, CaseFixturePlan, SeedRecipe, CaseSpec, digestOfValue,
  refKey, sameDigest, verifySelfDigest, parseAs,
  type ExecutionReceipt, type RunRequest, type SelectionManifest, type Ref,
} from '../protocol/index.ts';
import { compareTargets, evaluateAssertions, REDUCER_REF, reduceCell } from './reducer.ts';
import { compileCase } from './compiler.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../adapters/http/capabilities.ts';

export function checkCellEvidence(input: {
  dir: string; name: string; receipt: ExecutionReceipt; request: RunRequest;
  selection: SelectionManifest; documents: Record<string, unknown>; problems: string[];
}): void {
  const { dir, name, receipt: r, request, selection, documents, problems } = input;
  const problem = (message: string) => problems.push(`cell ${name}: ${message}`);
  const read = (file: string): unknown => JSON.parse(readFileSync(join(dir, 'cells', name, file), 'utf8'));
  const exact = (a: Ref, b: Ref) => refKey(a) === refKey(b);
  const record = (doc: { ref: Ref }, ref: Ref, label: string) => {
    if (!verifySelfDigest(doc) || !exact(doc.ref, ref)) problem(`${label} digest or reference mismatch`);
  };
  const cell = selection.cells.find((c) => c.selectionCellId === r.selectionCellId);
  if (!cell) { problem('unknown selection cell'); return; }
  if (!exact(r.requestRef, request.ref) || r.campaignId !== request.campaignId) problem('foreign request or campaign');
  if (digestOfValue(r.scope).hex !== digestOfValue(request.requestedScope).hex) problem('scope mismatch');
  if (!exact(r.environment.planRef, cell.environmentRef) || !exact(r.executionHostRef, cell.executionHostRef)) problem('foreign environment or host');
  const spec = parseAs(CaseSpec, documents[refKey(cell.caseRef)], 'case');
  record(spec, cell.caseRef, 'case');
  const fidelity = parseAs(FidelityPlan, documents[refKey(request.fidelityPlanRef)], 'fidelity');
  record(fidelity, request.fidelityPlanRef, 'fidelity');
  const fidelityCell = fidelity.cells.find((c) => c.selectionCellId === cell.selectionCellId);
  if (!fidelityCell) { problem('missing fidelity cell'); return; }
  const plan = parseAs(HostPlan, documents[refKey(cell.executionHostRef)], 'host plan');
  record(plan, cell.executionHostRef, 'host plan');
  record(r.environment, r.environment.ref, 'environment');
  if (digestOfValue(read('environment.json')).hex !== digestOfValue(r.environment).hex) problem('environment records disagree');
  if (digestOfValue(r.environment.expected).hex !== digestOfValue(cell.expectedTarget).hex) problem('expected identity differs from selection');
  if (r.environment.executionId !== r.executionId || r.environment.attemptId !== r.attemptId) problem('foreign environment attempt');

  const host = read('host.json') as { lease: unknown; observation: unknown; attestations: unknown[] };
  let capabilitiesObserved = false;
  if (host.lease && host.observation) {
    const lease = parseAs(HostLease, host.lease, 'host lease');
    const observation = parseAs(HostCapabilityObservation, host.observation, 'host observation');
    record(lease, r.hostLeaseRef, 'host lease');
    if (!r.hostObservationRefs.some((ref) => exact(ref, observation.ref))) problem('unbound host observation');
    record(observation, observation.ref, 'host observation');
    if (lease.executionId !== r.executionId || lease.attemptId !== r.attemptId || lease.campaignId !== r.campaignId) problem('foreign host lease');
    if (!exact(lease.hostPlanRef, plan.ref) || !exact(observation.hostPlanRef, plan.ref) || !observation.hostLeaseRef || !exact(observation.hostLeaseRef, lease.ref)) problem('host observation lease/plan mismatch');
    const observedAt = Date.parse(observation.observedAt);
    const kickoff = Date.parse(r.startedAt ?? r.finalizedAt);
    const fresh = observedAt >= kickoff - 1000 && observedAt < Date.parse(observation.expiresAt);
    capabilitiesObserved = fresh && plan.requiredCapabilities.every((cap) => observation.capabilities.some((o) => o.capability === cap && o.state === 'supported' && o.probe === 'probed'));
  }
  const attestations = host.attestations.map((a) => parseAs(IdentityAttestation, a, 'attestation'));
  for (const a of attestations) record(a, a.ref, 'attestation');
  const observed = r.environment.observed;
  if (observed && r.environment.provenance.runtime === 'live') {
    for (const id of cell.expectedTarget.requiredComponents) {
      const attestation = attestations.find((a) => a.componentId === id);
      if (!attestation || attestation.issuer !== 'local_launcher' || attestation.trustPolicy !== 'launcher_computed_source_digest') { problem(`required identity ${id} lacks trusted attestation`); continue; }
      const identity = observed.components.find((c) => c.componentId === id)?.identity;
      if (digestOfValue(identity ?? null).hex !== digestOfValue(attestation.identity).hex) problem(`identity ${id} differs from attestation`);
    }
  }
  const boundaries = (read('boundaries.json') as unknown[]).map((b) => parseAs(BoundaryObservation, b, 'boundary'));
  for (const b of boundaries) {
    record(b, b.ref, 'boundary');
    if (!r.boundaryObservationRefs.some((ref) => exact(ref, b.ref))) problem('unbound boundary');
    if (b.executionId !== r.executionId || b.attemptId !== r.attemptId || b.selectionCellId !== r.selectionCellId || !exact(b.fidelityPlanRef, fidelity.ref)) problem('foreign boundary observation');
  }
  const fidelityMatched = fidelityCell.claimBoundaryIds.every((id) => {
    const matches = boundaries.filter((b) => b.boundaryId === id);
    const rule = fidelityCell.boundaries.find((b) => b.boundaryId === id);
    return matches.length === 1 && !!rule && matches[0]!.observedMode === rule.mode && matches[0]!.observedAccountClass === rule.accountClass;
  });
  let fixtureState: 'verified' | 'failed' | 'blocked' | 'cancelled' | 'unknown' | 'not_required' = 'not_required';
  let recipe: SeedRecipe | null = null;
  if (spec.fixturePlanRef) {
    const fixturePlan = parseAs(CaseFixturePlan, documents[refKey(spec.fixturePlanRef)], 'fixture plan');
    record(fixturePlan, spec.fixturePlanRef, 'fixture plan');
    recipe = parseAs(SeedRecipe, documents[refKey(fixturePlan.seedRecipeRef)], 'recipe');
    record(recipe, fixturePlan.seedRecipeRef, 'recipe');
    if (!r.fixtureManifestRef) fixtureState = 'unknown';
    else {
      const manifest = parseAs(FixtureManifest, read('fixtures.json'), 'fixtures');
      record(manifest, r.fixtureManifestRef, 'fixture manifest');
      if (manifest.executionId !== r.executionId || manifest.attemptId !== r.attemptId || !exact(manifest.caseFixturePlanRef, fixturePlan.ref)) problem('foreign fixture manifest');
      fixtureState = manifest.state;
      if (fixtureState === 'verified' && (manifest.missingEntityKeys.length || recipe.entities.some((entity) => !manifest.entities.some((e) => e.entityKey === entity.entityKey && (!entity.readback || e.readbackEvidenceRefs.length > 0))))) problem('fixture manifest omits required starting state');
    }
  }
  const compiled = compileCase(spec, { ...HTTP_RUNNER_CAPABILITIES, maxStepsPerCase: 10_000 }, recipe);
  const rederived = evaluateAssertions(spec, r.environment.class, r.steps, REDUCER_REF, r.startedAt ?? r.finalizedAt, r.finalizedAt);
  if (digestOfValue(rederived).hex !== digestOfValue(r.assertions).hex) problem('assertions disagree with independent reduction');
  const events = readFileSync(join(dir, 'cells', name, 'events.jsonl'));
  const artifactsVerified = r.artifacts.length > 0 && r.artifacts.every((a) => a.mediaType === 'application/x-ndjson' && sameDigest(a.ref.digest, r.eventsDigest) && a.byteCount === events.length);
  const reduction = reduceCell({
    spec, expectedStepIds: compiled.orderedStepIds, steps: r.steps, assertions: rederived,
    cancelled: r.steps.some((s) => s.result === 'cancelled'), fixtureState,
    identityMatched: compareTargets(cell.expectedTarget, observed).matched,
    fidelityMatched, requiredCapabilitiesObserved: capabilitiesObserved, artifactsVerified,
    unknownMutations: r.cleanup.remainingUnknownMutations,
    criticalCleanupConfirmed: r.cleanup.critical.every((k) => r.cleanup.confirmed.includes(k)),
    infrastructureFailure: r.steps.some((s) => ['transport_failure', 'deadline_exceeded'].includes(s.reasonCode ?? '')),
    blockedReasons: r.outcome === 'blocked' ? r.reasonCodes : [],
  });
  if (reduction.outcome !== r.outcome || reduction.proofEligible !== r.proofEligible) problem(`recorded outcome ${r.outcome} differs from evidence reduction ${reduction.outcome}`);
  if (digestOfValue(reduction.coverage).hex !== digestOfValue(r.coverage).hex) problem('coverage differs from evidence');
}
