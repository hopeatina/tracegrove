import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, planSample, sampleCopy, runSample, resealBundle } from '../conformance/helpers.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { compareTargets } from '../src/core/reducer.ts';
import { BoundaryObservation, CampaignFixturePlan, CampaignResult, EnvironmentBinding, ExecutionReceipt, FidelityPlan, FixtureManifest, RunRequest, SelectionManifest,
  digestOfValue, freeze, refKey, type TargetTuple } from '../src/protocol/index.ts';

afterEach(cleanupTemps);
const digest = digestOfValue({ unobserved: true });
const claims: Partial<TargetTuple> = {
  repositories: [{ repositoryRole: 'app', canonicalUrl: 'https://example.invalid/app', requestedRef: 'main', resolvedCommit: 'a'.repeat(40),
    origin: 'snapshot_bundle', sourceObjectsRef: null, lockfileDigest: digest, dirty: false }],
  frontendRelease: 'unobserved', backendRelease: 'unobserved', workerRelease: 'unobserved',
  schemaFingerprint: digest, featureFlagsDigest: digest, capabilityVersionsDigest: digest,
  browserVersion: 'unobserved', containerImageDigest: 'unobserved', modelConfigDigest: digest,
};

/** Rebind every dependent planning document, so integrity failure cannot mask the identity defect. */
function requestWithClaims(input: { request: RunRequest; documents: Record<string, unknown> }) {
  const documents = structuredClone(input.documents); const before = input.request;
  const selection = SelectionManifest.parse(freeze({ ...SelectionManifest.parse(documents[refKey(before.selectionManifestRef)]),
    cells: SelectionManifest.parse(documents[refKey(before.selectionManifestRef)]).cells.map(cell => ({ ...cell, expectedTarget: { ...cell.expectedTarget, ...claims } })),
  }));
  const fidelity = FidelityPlan.parse(freeze({ ...FidelityPlan.parse(documents[refKey(before.fidelityPlanRef)]), selectionManifestRef: selection.ref }));
  const fixtures = before.fixturePlanRef ? CampaignFixturePlan.parse(freeze({ ...CampaignFixturePlan.parse(documents[refKey(before.fixturePlanRef)]), selectionManifestRef: selection.ref })) : null;
  for (const document of [selection, fidelity, ...(fixtures ? [fixtures] : [])]) documents[refKey(document.ref)] = document;
  const request = RunRequest.parse(freeze({ ...before, selectionManifestRef: selection.ref, fidelityPlanRef: fidelity.ref,
    fixturePlanRef: fixtures?.ref ?? null, expectedTarget: before.expectedTarget ? { ...before.expectedTarget, ...claims } : null }));
  return { request, selection, documents };
}

it.each(Object.keys(claims) as Array<keyof TargetTuple>)('target comparison refuses a different %s even when application identity matches', key => {
  const copy = sampleCopy(); const request = planSample(copy.configPath).request!;
  const expected = request.expectedTarget!;
  expect(compareTargets(expected, { ...expected, [key]: claims[key] }).matched).toBe(false);
});

it('requires the observed component kind as well as its source identity to match', () => {
  const copy = sampleCopy(); const expected = planSample(copy.configPath).request!.expectedTarget!;
  expect(compareTargets(expected, { ...expected, components: expected.components.map(component => ({ ...component, kind: 'worker' })) }).matched).toBe(false);
});

it('does not turn requested repository/release metadata into observed proof during a real local run', async () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath);
  const changed = requestWithClaims({ request: bundle.request!, documents: bundle.documents });
  const summary = await runSample({ ...bundle, request: changed.request, documents: changed.documents }, copy.stateDir);
  expect(summary.outcome).toBe('blocked');
  const receipt = summary.receipts[0]!;
  expect(receipt.reasonCodes).toContain('identity_mismatch');
  expect(receipt.environment.expected.repositories).toHaveLength(1);
  const observed = receipt.environment.observed!;
  expect(observed.repositories).toEqual([]);
  for (const key of Object.keys(claims).filter(key => key !== 'repositories') as Array<keyof TargetTuple>) expect(observed[key]).toBeNull();
  expect(receipt.steps.every(step => step.result === 'not_run')).toBe(true);
  expect(receipt.fixtureManifestRef).toBeNull();
  expect(receipt.cleanup.confirmed).toContain('host.process');
  expect(receipt.proofEligible).toBe(false);
  expect(verifyBundle(summary.executionDir)).toMatchObject({ ok: true, outcome: 'blocked' });
});

it('rejects resealed saved evidence that invents matching expected and observed metadata without host observations', async () => {
  const copy = sampleCopy(); const summary = await runSample(planSample(copy.configPath), copy.stateDir);
  const original = readVerifiedBundle(summary.executionDir);
  const changed = requestWithClaims(original);
  const write = (path: string, value: unknown) => writeFileSync(join(summary.executionDir, path), JSON.stringify(value));
  const receipts = original.receipts.map(receipt => {
    const name = receipt.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_');
    const read = (file: string): unknown => JSON.parse(readFileSync(join(summary.executionDir, 'cells', name, file), 'utf8'));
    const boundaries = (read('boundaries.json') as unknown[]).map(value => BoundaryObservation.parse(freeze({ ...BoundaryObservation.parse(value), fidelityPlanRef: changed.request.fidelityPlanRef })));
    const fixture = FixtureManifest.parse(freeze({ ...FixtureManifest.parse(read('fixtures.json')), campaignFixturePlanRef: changed.request.fixturePlanRef! }));
    const environment = EnvironmentBinding.parse(freeze({ ...receipt.environment,
      expected: { ...receipt.environment.expected, ...claims }, observed: { ...receipt.environment.observed!, ...claims } }));
    const updated = ExecutionReceipt.parse(freeze({ ...receipt, requestRef: changed.request.ref, environment,
      boundaryObservationRefs: boundaries.map(boundary => boundary.ref), fixtureManifestRef: fixture.ref }));
    write(`cells/${name}/boundaries.json`, boundaries); write(`cells/${name}/fixtures.json`, fixture);
    write(`cells/${name}/environment.json`, environment); write(`cells/${name}/receipt.json`, updated);
    return updated;
  });
  write('request.json', changed.request); write('selection.json', changed.selection); write('documents.json', changed.documents);
  write('campaign.json', CampaignResult.parse(freeze({ ...original.campaign, requestRef: changed.request.ref, selectionManifestRef: changed.selection.ref,
    cellReceiptRefs: original.campaign.cellReceiptRefs.map(cell => ({ ...cell, receiptRef: receipts.find(receipt => receipt.selectionCellId === cell.selectionCellId)!.ref })) })));
  resealBundle(summary.executionDir);
  const verification = verifyBundle(summary.executionDir);
  expect(verification.ok, JSON.stringify(verification)).toBe(false);
  expect(verification.problems.some(problem => problem.includes('host observations'))).toBe(true);
});
