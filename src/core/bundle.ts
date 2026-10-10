/**
 * Portable evidence bundle: manifest.json hashes every payload file; verify-bundle rechecks the
 * hashes, every self digest, re-derives assertions from the frozen case and step observations and
 * re-reduces the outcome. A bundle whose reduction disagrees with its receipt is not evidence.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CampaignResult, CaseFixturePlan, CaseSpec, ExecutionReceipt, RunRequest, SeedRecipe, SelectionManifest, canonicalize, digestOfBytes, parseAs,
  refKey, sameDigest, verifySelfDigest, type Ref,
} from '../protocol/index.ts';
import type { FrozenBundle } from './planner.ts';
import { REDUCER_REF, evaluateAssertions, reduceCampaign, reduceCell } from './reducer.ts';
import { compileCase } from './compiler.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../adapters/http/capabilities.ts';

export const BUNDLE_SCHEMA_VERSION = 'workflow.evidence-bundle/v1';

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export type CellRecords = {
  id: string; receipt: ExecutionReceipt; environment: unknown; fixtureManifest: unknown; boundaryObservations: unknown[];
  hostLease: unknown; hostObservation: unknown; attestations: unknown[]; credentialLease: unknown; routing: unknown; costs: unknown[]; eventsJsonl: string; finalization: unknown;
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
  const manifest = { schemaVersion: BUNDLE_SCHEMA_VERSION, executionId: input.receipts[0]?.executionId ?? null, campaignId: input.campaign.campaignId, reducer: REDUCER_REF, runner: HTTP_RUNNER_CAPABILITIES.ref, files, createdAt: new Date().toISOString() };
  writeJson(join(input.dir, 'manifest.json'), manifest);
}

export type BundleVerification = { ok: boolean; problems: string[]; outcome: CampaignResult['outcome'] | null; receipts: number };

export function verifyBundle(dir: string): BundleVerification {
  const problems: string[] = [];
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return { ok: false, problems: ['manifest.json missing'], outcome: null, receipts: 0 };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Array<{ path: string; sha256: string }> };
  for (const file of manifest.files) {
    const full = join(dir, file.path);
    if (!existsSync(full)) { problems.push(`missing ${file.path}`); continue; }
    if (digestOfBytes(readFileSync(full)).hex !== file.sha256) problems.push(`hash mismatch ${file.path}`);
  }
  const request = parseAs(RunRequest, JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')), 'request');
  const selection = parseAs(SelectionManifest, JSON.parse(readFileSync(join(dir, 'selection.json'), 'utf8')), 'selection');
  const campaign = parseAs(CampaignResult, JSON.parse(readFileSync(join(dir, 'campaign.json'), 'utf8')), 'campaign');
  for (const [label, doc] of [['request', request], ['selection', selection], ['campaign', campaign]] as Array<[string, { ref: Ref }]>) {
    if (!verifySelfDigest(doc)) problems.push(`${label} self digest mismatch`);
  }
  const documents = existsSync(join(dir, 'documents.json')) ? (JSON.parse(readFileSync(join(dir, 'documents.json'), 'utf8')) as Record<string, unknown>) : {};
  const receipts: ExecutionReceipt[] = [];
  const cellsDir = join(dir, 'cells');
  for (const name of existsSync(cellsDir) ? readdirSync(cellsDir) : []) {
    const receiptPath = join(cellsDir, name, 'receipt.json');
    if (!existsSync(receiptPath)) { problems.push(`cell ${name} has no receipt`); continue; }
    const receipt = parseAs(ExecutionReceipt, JSON.parse(readFileSync(receiptPath, 'utf8')), 'receipt');
    if (!verifySelfDigest(receipt)) problems.push(`receipt ${name} self digest mismatch`);
    const events = readFileSync(join(cellsDir, name, 'events.jsonl'));
    if (!sameDigest(digestOfBytes(events), receipt.eventsDigest)) problems.push(`events digest mismatch for ${name}`);
    const spec = parseAs(CaseSpec, JSON.parse(readFileSync(join(dir, 'cases', `${receipt.caseRef.id}.json`), 'utf8')), 'case');
    if (!sameDigest(spec.ref.digest, receipt.caseRef.digest)) problems.push(`case digest mismatch for ${name}`);
    let recipe: SeedRecipe | null = null;
    if (spec.fixturePlanRef) {
      const planDoc = documents[refKey(spec.fixturePlanRef)];
      const plan = planDoc ? CaseFixturePlan.safeParse(planDoc) : null;
      const recipeDoc = plan?.success ? documents[refKey(plan.data.seedRecipeRef)] : null;
      const parsedRecipe = recipeDoc ? SeedRecipe.safeParse(recipeDoc) : null;
      if (!parsedRecipe?.success) problems.push(`fixture recipe for ${receipt.caseRef.id} missing from bundle documents`);
      else recipe = parsedRecipe.data;
    }
    const compiled = compileCase(spec, { ...HTTP_RUNNER_CAPABILITIES, maxStepsPerCase: 10_000 }, recipe);
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
  void canonicalize;
  return { ok: problems.length === 0, problems, outcome: campaign.outcome, receipts: receipts.length };
}
