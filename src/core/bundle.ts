/**
 * Portable evidence bundle: manifest.json hashes every payload file; verify-bundle rechecks the
 * hashes, every self digest, re-derives assertions from the frozen case and step observations and
 * re-reduces the outcome. A bundle whose reduction disagrees with its receipt is not evidence.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCellEvidence } from './bundleEvidence.ts';
import { BundleSnapshot, BUNDLE_SCHEMA_VERSION } from './bundleSnapshot.ts';
export { BUNDLE_SCHEMA_VERSION, BUNDLE_LIMITS } from './bundleSnapshot.ts';
import {
  CampaignResult, CaseFixturePlan, CaseSpec, ExecutionReceipt, RunRequest, SeedRecipe, SelectionManifest, canonicalize, digestOfBytes, parseAs,
  refKey, sameDigest, sameRef, sameScope, digestOfValue, verifySelfDigest, type Ref, type Digest,
} from '../protocol/index.ts';
import type { FrozenBundle } from './planner.ts';
import { REDUCER_REF, evaluateAssertions, reduceCampaign, reduceCell } from './reducer.ts';
import { compileCase } from './compiler.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../adapters/http/capabilities.ts';
import { frozenRunnerCapabilities } from './runnerCapabilities.ts';


function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export type CellRecords = {
  id: string; receipt: ExecutionReceipt; environment: unknown; fixtureManifest: unknown; boundaryObservations: unknown[];
  hostLease: unknown; hostObservation: unknown; attestations: unknown[]; credentialLease: unknown; routing: unknown; costs: unknown[]; eventsJsonl: string; finalization: unknown;
  media?: Array<{ digest: string; bytes: Buffer }>;
};

export function writeExecutionBundle(input: { dir: string; cell?: CellRecords; bundle?: FrozenBundle; request?: RunRequest; selection?: SelectionManifest; receipts?: ExecutionReceipt[]; campaign?: CampaignResult }): void {
  mkdirSync(join(input.dir, 'cells'), { recursive: true });
  if (input.cell) {
    const cellDir = join(input.dir, 'cells', input.cell.id.replace(/[^A-Za-z0-9._-]/g, '_'));
    mkdirSync(cellDir, { recursive: true });
    writeJson(join(cellDir, 'receipt.json'), input.cell.receipt);
    writeJson(join(cellDir, 'environment.json'), input.cell.environment);
    writeJson(join(cellDir, 'fixtures.json'), input.cell.fixtureManifest);
    writeJson(join(cellDir, 'boundaries.json'), input.cell.boundaryObservations);
    writeJson(join(cellDir, 'host.json'), { lease: input.cell.hostLease, observation: input.cell.hostObservation, attestations: input.cell.attestations, credentialLease: input.cell.credentialLease });
    writeJson(join(cellDir, 'accounting.json'), { routing: input.cell.routing, costs: input.cell.costs, accounting: input.cell.receipt.accounting });
    writeJson(join(cellDir, 'assertions.json'), input.cell.receipt.assertions);
    writeJson(join(cellDir, 'cleanup.json'), input.cell.receipt.cleanup);
    writeFileSync(join(cellDir, 'events.jsonl'), input.cell.eventsJsonl);
    writeJson(join(cellDir, 'finalization.json'), input.cell.finalization);
    for (const artifact of input.cell.media ?? []) {
      if (!/^[a-f0-9]{64}$/.test(artifact.digest) || digestOfBytes(artifact.bytes).hex !== artifact.digest) throw new Error('invalid media digest');
      mkdirSync(join(cellDir, 'media'), { recursive: true });
      writeFileSync(join(cellDir, 'media', `${artifact.digest}.webm`), artifact.bytes, { mode: 0o600 });
    }
    return;
  }
  if (!input.bundle || !input.request || !input.selection || !input.receipts || !input.campaign) throw new Error('incomplete bundle input');
  writeJson(join(input.dir, 'request.json'), input.request);
  writeJson(join(input.dir, 'selection.json'), input.selection);
  mkdirSync(join(input.dir, 'cases'), { recursive: true });
  for (const caseRef of input.request.caseRefs) {
    const key = `${caseRef.id}@${caseRef.revision}#${caseRef.digest.hex}`;
    writeJson(join(input.dir, 'cases', `${caseRef.id}.json`), input.bundle.documents[key]);
  }
  writeJson(join(input.dir, 'documents.json'), input.bundle.documents);
  writeJson(join(input.dir, 'campaign.json'), input.campaign);
  const files: Array<{ path: string; sha256: string; bytes: number }> = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === 'manifest.json') continue;
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (entry.name === 'host') continue; walk(full, rel); }
      else { const bytes = readFileSync(full); files.push({ path: rel, sha256: digestOfBytes(bytes).hex, bytes: bytes.byteLength }); }
    }
  };
  walk(input.dir, '');
  const manifest = { schemaVersion: BUNDLE_SCHEMA_VERSION, executionId: input.receipts[0]?.executionId ?? null, campaignId: input.campaign.campaignId, reducer: REDUCER_REF, runner: input.selection.cells[0]?.expectedTarget.runner ?? HTTP_RUNNER_CAPABILITIES.ref, files, createdAt: new Date().toISOString() };
  writeJson(join(input.dir, 'manifest.json'), manifest);
}

export type BundleVerification = { ok: boolean; problems: string[]; outcome: CampaignResult['outcome'] | null; receipts: number };
export type VerifiedBundleRecords = { verification: BundleVerification & { ok: true }; manifestDigest: Digest;
  request: RunRequest; selection: SelectionManifest; campaign: CampaignResult; receipts: ExecutionReceipt[]; documents: Record<string, unknown> };
type Inspection = { verification: BundleVerification; records: Omit<VerifiedBundleRecords, 'verification'> | null };

export function verifyBundle(dir: string): BundleVerification {
  try { return verifyBundleRecords(dir).verification; }
  catch (error) { return { ok: false, problems: [error instanceof Error ? error.message : 'invalid bundle'], outcome: null, receipts: 0 }; }
}

export function readVerifiedBundle(dir: string): VerifiedBundleRecords {
  const checked = verifyBundleRecords(dir);
  if (!checked.verification.ok || !checked.records) throw new Error(`invalid bundle: ${checked.verification.problems.slice(0, 20).join('; ')}`);
  return { ...checked.records, verification: { ...checked.verification, ok: true } };
}

function verifyBundleRecords(dir: string): Inspection {
  const problems: string[] = [];
  const snapshot = new BundleSnapshot(dir);
  const requireListed = (file: string) => { if (!snapshot.has(file)) problems.push(`unsealed required file ${file}`); };
  for (const file of ['request.json', 'selection.json', 'campaign.json', 'documents.json']) requireListed(file);
  if (problems.length) return { verification: { ok: false, problems, outcome: null, receipts: 0 }, records: null };
  const request = parseAs(RunRequest, snapshot.json('request.json'), 'request');
  const selection = parseAs(SelectionManifest, snapshot.json('selection.json'), 'selection');
  const campaign = parseAs(CampaignResult, snapshot.json('campaign.json'), 'campaign');
  for (const [label, doc] of [['request', request], ['selection', selection], ['campaign', campaign]] as Array<[string, { ref: Ref }]>) {
    if (!verifySelfDigest(doc)) problems.push(`${label} self digest mismatch`);
  }
  const documents = snapshot.json('documents.json') as Record<string, unknown>;
  for (const [key, doc] of Object.entries(documents)) {
    const record = doc as { ref: Ref };
    if (!record?.ref || !verifySelfDigest(record) || refKey(record.ref) !== key) problems.push(`document digest mismatch ${key}`);
  }
  if (!sameRef(request.selectionManifestRef, selection.ref) || !sameRef(campaign.selectionManifestRef, selection.ref) || !sameRef(campaign.requestRef, request.ref) ||
      request.campaignId !== campaign.campaignId || !sameScope(request.requestedScope, selection.scope) || !sameScope(request.requestedScope, campaign.scope)) problems.push('request/selection/campaign binding or scope mismatch');
  const selectedCases = [...new Set(selection.cells.map(cell => refKey(cell.caseRef)))].sort();
  if (new Set(request.caseRefs.map(refKey)).size !== request.caseRefs.length || digestOfValue([...request.caseRefs.map(refKey)].sort()).hex !== digestOfValue(selectedCases).hex) problems.push('request cases differ from the complete selection');
  const receipts: ExecutionReceipt[] = [];
  const cellNames = [...new Set(snapshot.paths().filter(path => path.startsWith('cells/')).map(path => path.split('/')[1]!))].sort();
  for (const name of cellNames) {
    for (const file of ['receipt.json', 'events.jsonl', 'environment.json', 'fixtures.json', 'boundaries.json', 'host.json', 'accounting.json', 'assertions.json', 'cleanup.json', 'finalization.json']) requireListed(`cells/${name}/${file}`);
    const receipt = parseAs(ExecutionReceipt, snapshot.json(`cells/${name}/receipt.json`), 'receipt');
    checkCellEvidence({ readBytes: path => snapshot.read(path), readJson: path => snapshot.json(path), name, receipt, request, selection, documents, problems });
    if (!verifySelfDigest(receipt)) problems.push(`receipt ${name} self digest mismatch`);
    const events = snapshot.read(`cells/${name}/events.jsonl`);
    if (!sameDigest(digestOfBytes(events), receipt.eventsDigest)) problems.push(`events digest mismatch for ${name}`);
    const spec = parseAs(CaseSpec, snapshot.json(`cases/${receipt.caseRef.id}.json`), 'case');
    if (!verifySelfDigest(spec) || !sameRef(spec.ref, receipt.caseRef)) problems.push(`case digest mismatch for ${name}`);
    let recipe: SeedRecipe | null = null;
    if (spec.fixturePlanRef) {
      const planDoc = documents[refKey(spec.fixturePlanRef)];
      const plan = planDoc ? CaseFixturePlan.safeParse(planDoc) : null;
      const recipeDoc = plan?.success ? documents[refKey(plan.data.seedRecipeRef)] : null;
      const parsedRecipe = recipeDoc ? SeedRecipe.safeParse(recipeDoc) : null;
      if (!parsedRecipe?.success) problems.push(`fixture recipe for ${receipt.caseRef.id} missing from bundle documents`);
      else recipe = parsedRecipe.data;
    }
    const compiled = compileCase(spec, frozenRunnerCapabilities(documents, receipt.environment.expected.runner), recipe);
    const rederived = evaluateAssertions(spec, receipt.environment.class, receipt.steps, REDUCER_REF, receipt.startedAt ?? receipt.finalizedAt, receipt.finalizedAt);
    for (const assertion of rederived) {
      const recorded = receipt.assertions.find((a) => a.assertionId === assertion.assertionId);
      if (!recorded) problems.push(`assertion ${assertion.assertionId} missing from receipt ${name}`);
      else if (recorded.result !== assertion.result) problems.push(`assertion ${assertion.assertionId} recorded ${recorded.result}, re-derived ${assertion.result}`);
    }
    const expectedStepIds = compiled.orderedStepIds;
    const requiredCapabilitiesObserved = !receipt.reasonCodes.some((r) => r.startsWith('host_capability_unobserved'));
    const reduction = reduceCell({
      spec, expectedStepIds, steps: receipt.steps, assertions: receipt.assertions,
      cancelled: receipt.outcome === 'cancelled' || receipt.steps.some((s) => s.result === 'cancelled'),
      fixtureState: receipt.fixtureManifestRef ? (receipt.reasonCodes.find((r) => r.startsWith('fixture_'))?.replace('fixture_', '') as never ?? 'verified') : 'not_required',
      identityMatched: receipt.reasonCodes.includes('identity_mismatch') ? false : receipt.reasonCodes.includes('required_identity_unknown') ? null : true,
      fidelityMatched: !receipt.reasonCodes.includes('boundary_fidelity_mismatch'),
      requiredCapabilitiesObserved,
      artifactsVerified: true,
      unknownMutations: receipt.cleanup.remainingUnknownMutations,
      criticalCleanupConfirmed: receipt.cleanup.critical.every((k) => receipt.cleanup.confirmed.includes(k)),
      infrastructureFailure: receipt.outcome === 'infrastructure_failed',
      blockedReasons: receipt.outcome === 'blocked' ? receipt.reasonCodes : [],
    });
    if (reduction.outcome !== receipt.outcome) problems.push(`receipt ${name} outcome ${receipt.outcome} but re-reduction gives ${reduction.outcome}`);
    receipts.push(receipt);
  }
  const rereduced = reduceCampaign({ scope: campaign.scope, campaignId: campaign.campaignId, requestRef: request.ref, selection, receipts });
  if (rereduced.outcome !== campaign.outcome) problems.push(`campaign outcome ${campaign.outcome} but re-reduction gives ${rereduced.outcome}`);
  if (digestOfValue(rereduced.cellReceiptRefs).hex !== digestOfValue(campaign.cellReceiptRefs).hex) problems.push('campaign receipt bindings differ from the complete selection');
  if (digestOfValue(rereduced.coverage).hex !== digestOfValue(campaign.coverage).hex || digestOfValue(rereduced.missingCellIds).hex !== digestOfValue(campaign.missingCellIds).hex) problems.push('campaign coverage differs from evidence');
  if (rereduced.proofEligible !== campaign.proofEligible) problems.push('campaign proof eligibility differs from evidence');
  void canonicalize;
  return { verification: { ok: problems.length === 0, problems, outcome: problems.length ? null : campaign.outcome, receipts: receipts.length },
    records: problems.length ? null : { manifestDigest: snapshot.manifestDigest, request, selection, campaign, receipts, documents } };
}
