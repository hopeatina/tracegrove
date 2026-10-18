/** Reconstruct verdict inputs from evidence records, never from outcome labels. */
import {
  BoundaryObservation, FidelityPlan, FixtureManifest, HostCapabilityObservation, HostLease,
  HostPlan, IdentityAttestation, CaseFixturePlan, SeedRecipe, CaseSpec, digestOfValue,
  refKey, sameDigest, verifySelfDigest, parseAs, digestOfBytes,
  type ExecutionReceipt, type RunRequest, type SelectionManifest, type Ref,
} from '../protocol/index.ts';
import { compareTargets, evaluateAssertions, REDUCER_REF, reduceCell } from './reducer.ts';
import { compileCase } from './compiler.ts';
import { frozenRunnerCapabilities } from './runnerCapabilities.ts';
import { videoBundlePath } from './bundlePaths.ts';
import { targetFromComponentAttestations } from './targetObservation.ts';
import { snapshotAttestationProblems } from './snapshotEvidence.ts';
import { isInfrastructureStepFailure } from './errors.ts';
import { repositorySelectionProblems } from './repositorySelectionEvidence.ts';

export function checkCellEvidence(input: {
  readBytes(path: string): Buffer; readJson(path: string): unknown; name: string; receipt: ExecutionReceipt; request: RunRequest;
  selection: SelectionManifest; documents: Record<string, unknown>; problems: string[];
}): void {
  const { name, receipt: r, request, selection, documents, problems } = input;
  const problem = (message: string) => problems.push(`cell ${name}: ${message}`);
  const read = (file: string): unknown => input.readJson(`cells/${name}/${file}`);
  const exact = (a: Ref, b: Ref) => refKey(a) === refKey(b);
  const nullableExact = (a: Ref | null, b: Ref | null) => a === null ? b === null : b !== null && exact(a, b);
  const record = (doc: { ref: Ref }, ref: Ref, label: string) => {
    if (!verifySelfDigest(doc) || !exact(doc.ref, ref)) problem(`${label} digest or reference mismatch`);
  };
  const cell = selection.cells.find((c) => c.selectionCellId === r.selectionCellId);
  if (!cell) { problem('unknown selection cell'); return; }
  if (!exact(r.caseRef, cell.caseRef) || !exact(r.personaRef, cell.personaRef) || !exact(r.surfaceBindingRef, cell.surfaceBindingRef) ||
      !nullableExact(r.variantRef, cell.variantRef)) problem('case/persona/binding/variant differs from selected cell');
  if (!exact(r.requestRef, request.ref) || r.campaignId !== request.campaignId) problem('foreign request or campaign');
  if (!nullableExact(r.qualificationRoundRef, request.qualificationRoundRef)) problem('qualification admission binding mismatch');
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
  for (const message of repositorySelectionProblems(request, cell, plan, documents)) problem(message);
  record(r.environment, r.environment.ref, 'environment');
  if (digestOfValue(read('environment.json')).hex !== digestOfValue(r.environment).hex) problem('environment records disagree');
  if (digestOfValue(r.environment.expected).hex !== digestOfValue(cell.expectedTarget).hex) problem('expected identity differs from selection');
  if (r.environment.executionId !== r.executionId || r.environment.attemptId !== r.attemptId || r.environment.campaignId !== r.campaignId ||
      digestOfValue(r.environment.scope).hex !== digestOfValue(r.scope).hex) problem('foreign environment attempt or scope');

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
  if (observed && digestOfValue(observed).hex !== digestOfValue(targetFromComponentAttestations(cell.expectedTarget, attestations, plan.launch, r.scope)).hex) {
    problem('target differs from host observations');
  }
  if (observed && r.environment.provenance.runtime === 'live') {
    for (const id of cell.expectedTarget.requiredComponents) {
      const attestation = attestations.find((a) => a.componentId === id);
      if (!attestation || attestation.issuer !== 'local_launcher' || attestation.trustPolicy !== 'launcher_computed_source_digest') { problem(`required identity ${id} lacks trusted attestation`); continue; }
      const identity = observed.components.find((c) => c.componentId === id)?.identity;
      const sourceProblems = plan.launch?.componentId === id ? snapshotAttestationProblems(plan.launch, attestation, r.scope) : [];
      if (identity !== null && identity !== undefined) for (const message of sourceProblems) problem(message);
      if (!sourceProblems.length && digestOfValue(identity ?? null).hex !== digestOfValue(attestation.identity).hex) problem(`identity ${id} differs from attestation`);
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
  const compiled = compileCase(spec, frozenRunnerCapabilities(documents, cell.expectedTarget.runner), recipe);
  const rederived = evaluateAssertions(spec, r.environment.class, r.steps, REDUCER_REF, r.startedAt ?? r.finalizedAt, r.finalizedAt);
  if (digestOfValue(rederived).hex !== digestOfValue(r.assertions).hex) problem('assertions disagree with independent reduction');
  const events = input.readBytes(`cells/${name}/events.jsonl`);
  const eventArtifacts = r.artifacts.filter(a => a.mediaType === 'application/x-ndjson');
  const videos = r.artifacts.filter(a => a.mediaType === 'video/webm');
  const artifactsVerified = eventArtifacts.length === 1
    && (spec.capture.video !== 'required' || videos.length === 1)
    && r.artifacts.reduce((sum, a) => sum + a.byteCount, 0) <= spec.limits.maxArtifactBytes
    && r.artifacts.every(a => {
      if (a.mediaType === 'application/x-ndjson') return sameDigest(a.ref.digest, r.eventsDigest) && a.byteCount === events.length;
      if (a.mediaType !== 'video/webm' || !exact(a.producerRef, cell.expectedTarget.runner)) return false;
      const bytes = input.readBytes(videoBundlePath(r.selectionCellId, a.ref.digest.hex));
      return a.byteCount === bytes.length && sameDigest(a.ref.digest, digestOfBytes(bytes))
        && bytes.subarray(0, 4).toString('hex') === '1a45dfa3'
        && a.stepIds.every(id => compiled.stepsById.get(id)?.kind.startsWith('ui.'));
    });
  const reduction = reduceCell({
    spec, expectedStepIds: compiled.orderedStepIds, steps: r.steps, assertions: rederived,
    cancelled: r.steps.some((s) => s.result === 'cancelled'), fixtureState,
    identityMatched: compareTargets(cell.expectedTarget, observed).matched,
    fidelityMatched, requiredCapabilitiesObserved: capabilitiesObserved, artifactsVerified,
    unknownMutations: r.cleanup.remainingUnknownMutations,
    criticalCleanupConfirmed: r.cleanup.critical.every((k) => r.cleanup.confirmed.includes(k)),
    // A host that never started leaves every step not_run; its sealed host.failed event is the
    // evidence. It can only move a cell away from passed, never towards it.
    infrastructureFailure: r.steps.some((s) => isInfrastructureStepFailure(s.reasonCode))
      || events.toString('utf8').split('\n').some((line) => line.includes('"kind":"host.failed"') || line.includes('"kind":"browser.failed"')),
    blockedReasons: r.outcome === 'blocked' ? r.reasonCodes : [],
  });
  if (reduction.outcome !== r.outcome || reduction.proofEligible !== r.proofEligible) problem(`recorded outcome ${r.outcome} differs from evidence reduction ${reduction.outcome}`);
  if (digestOfValue(reduction.coverage).hex !== digestOfValue(r.coverage).hex) problem('coverage differs from evidence');
}
