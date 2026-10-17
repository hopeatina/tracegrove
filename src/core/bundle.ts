/**
 * Portable evidence bundle: manifest.json hashes every payload file; verify-bundle rechecks the
 * hashes, every self digest, re-derives assertions from the frozen case and step observations and
 * re-reduces the outcome. A bundle whose reduction disagrees with its receipt is not evidence.
 */
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createDurableDirectory, requireRealDirectory, syncDirectory, syncDirectoryAncestors, syncRegularFile, writeExclusiveDurable } from './atomicFiles.ts';
import { readBoundedFile } from './boundedFile.ts';
import { checkCellEvidence } from './bundleEvidence.ts';
import { BundleSnapshot, BUNDLE_SCHEMA_VERSION, BUNDLE_LIMITS } from './bundleSnapshot.ts';
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
import { cellBundleName, videoBundlePath } from './bundlePaths.ts';


function writeJson(path: string, value: unknown): void {
  writeExclusiveDurable(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

export type CellRecords = {
  id: string; receipt: ExecutionReceipt; environment: unknown; fixtureManifest: unknown; boundaryObservations: unknown[];
  hostLease: unknown; hostObservation: unknown; attestations: unknown[]; credentialLease: unknown; routing: unknown; costs: unknown[]; eventsJsonl: string; finalization: unknown;
  media?: Array<{ digest: string; bytes: Buffer }>;
};


function safeBundlePath(root: string, path: string): string {
  if (isAbsolute(path) || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('unsafe execution bundle path');
  return join(root, path);
}

/**
 * Source commit under an owned quiescent local tree and the existing ledger writer.
 * Payloads are exclusive and durable; candidate reduction precedes manifest publication.
 * A crash/failure retains the local lock and incomplete records for explicit reconciliation.
 */
export function writeExecutionBundle(input: { dir: string; cell?: CellRecords; bundle?: FrozenBundle; request?: RunRequest; selection?: SelectionManifest; receipts?: ExecutionReceipt[]; campaign?: CampaignResult }): void {
  createDurableDirectory(input.dir);
  try { lstatSync(join(input.dir, 'manifest.json')); throw new Error('execution bundle already sealed; existing evidence is never overwritten'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (readdirSync(input.dir).some(name => name.startsWith('.bundle-pending-'))) throw new Error('incomplete execution seal; reconcile retained staging before retrying');
  const lock = join(input.dir, '.bundle-write.lock');
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error('execution bundle write is locked; reconcile incomplete records before retrying'); }
  let staging: string | null = null; let published = false;
  try {
    syncDirectory(input.dir);
    const candidateBytes = writeBundlePayloads(input);
    if (candidateBytes) {
      staging = mkdtempSync(join(input.dir, '.bundle-pending-'));
      const temporary = join(staging, 'manifest.json');
      writeExclusiveDurable(temporary, candidateBytes);
      syncDirectory(staging);
      const snapshot = BundleSnapshot.fromCandidateManifest(input.dir, readBoundedFile(temporary, BUNDLE_LIMITS.manifestBytes));
      const checked = verifySnapshot(snapshot);
      if (!checked.verification.ok || !checked.records) throw new Error(`execution candidate failed verification: ${checked.verification.problems.slice(0, 20).join('; ')}`);
      if (digestOfValue(checked.records.receipts.map(receipt => refKey(receipt.ref)).sort()).hex !== digestOfValue(input.receipts!.map(receipt => refKey(receipt.ref)).sort()).hex) throw new Error('execution candidate receipts differ from frozen final records');
      // Exclusive atomic commit marker: never replace a preexisting manifest.
      linkSync(temporary, join(input.dir, 'manifest.json'));
      published = true;
      syncDirectory(input.dir);
      rmSync(staging, { recursive: true }); staging = null;
    }
    rmSync(lock, { recursive: true });
    syncDirectory(input.dir);
  } catch (error) {
    if (published) throw new Error('execution bundle published but final directory/lock durability is unconfirmed; verify the existing bundle before retrying', { cause: error });
    throw new Error(`${error instanceof Error ? error.message : 'execution seal failed'}; execution bundle incomplete; reconcile the retained local lock and records before retrying`, { cause: error });
  }
}

function writeBundlePayloads(input: { dir: string; cell?: CellRecords; bundle?: FrozenBundle; request?: RunRequest; selection?: SelectionManifest; receipts?: ExecutionReceipt[]; campaign?: CampaignResult }): Buffer | null {
  createDurableDirectory(join(input.dir, 'cells'));
  if (input.cell) {
    const cellDir = safeBundlePath(input.dir, `cells/${cellBundleName(input.cell.id)}`);
    createDurableDirectory(cellDir);
    writeJson(join(cellDir, 'receipt.json'), input.cell.receipt);
    writeJson(join(cellDir, 'environment.json'), input.cell.environment);
    writeJson(join(cellDir, 'fixtures.json'), input.cell.fixtureManifest);
    writeJson(join(cellDir, 'boundaries.json'), input.cell.boundaryObservations);
    writeJson(join(cellDir, 'host.json'), { lease: input.cell.hostLease, observation: input.cell.hostObservation, attestations: input.cell.attestations, credentialLease: input.cell.credentialLease });
    writeJson(join(cellDir, 'accounting.json'), { routing: input.cell.routing, costs: input.cell.costs, accounting: input.cell.receipt.accounting });
    writeJson(join(cellDir, 'assertions.json'), input.cell.receipt.assertions);
    writeJson(join(cellDir, 'cleanup.json'), input.cell.receipt.cleanup);
    writeExclusiveDurable(join(cellDir, 'events.jsonl'), Buffer.from(input.cell.eventsJsonl));
    writeJson(join(cellDir, 'finalization.json'), input.cell.finalization);
    for (const artifact of input.cell.media ?? []) {
      if (!/^[a-f0-9]{64}$/.test(artifact.digest) || digestOfBytes(artifact.bytes).hex !== artifact.digest) throw new Error('invalid media digest');
      createDurableDirectory(join(cellDir, 'media'));
      writeExclusiveDurable(safeBundlePath(input.dir, videoBundlePath(input.cell.id, artifact.digest)), artifact.bytes);
    }
    if (input.cell.media?.length) syncDirectory(join(cellDir, 'media'));
    syncDirectory(cellDir);
    syncDirectory(join(input.dir, 'cells'));
    return null;
  }
  if (!input.bundle || !input.request || !input.selection || !input.receipts || !input.campaign) throw new Error('incomplete bundle input');
  writeJson(join(input.dir, 'request.json'), input.request);
  writeJson(join(input.dir, 'selection.json'), input.selection);
  createDurableDirectory(join(input.dir, 'cases'));
  for (const caseRef of input.request.caseRefs) {
    const key = `${caseRef.id}@${caseRef.revision}#${caseRef.digest.hex}`;
    const path = safeBundlePath(input.dir, `cases/${caseRef.id}.json`);
    createDurableDirectory(dirname(path));
    writeJson(path, input.bundle.documents[key]);
  }
  writeJson(join(input.dir, 'documents.json'), input.bundle.documents);
  writeJson(join(input.dir, 'campaign.json'), input.campaign);
  const files: Array<{ path: string; sha256: string; bytes: number }> = [];
  let totalBytes = 0;
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!prefix && entry.name === '.bundle-write.lock') continue;
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`symlink in execution payload ${rel}`);
      if (entry.isDirectory()) { if (entry.name === 'host') continue; walk(full, rel); }
      else {
        if (files.length >= BUNDLE_LIMITS.files) throw new Error('execution bundle exceeds bounded payload limits');
        const bytes = readBoundedFile(full, BUNDLE_LIMITS.fileBytes);
        totalBytes += bytes.byteLength;
        if (totalBytes > BUNDLE_LIMITS.totalBytes) throw new Error('execution bundle exceeds bounded payload limits');
        syncRegularFile(full);
        files.push({ path: rel, sha256: digestOfBytes(bytes).hex, bytes: bytes.byteLength });
      }
    }
    syncDirectory(dir);
  };
  walk(input.dir, '');
  const manifest = { schemaVersion: BUNDLE_SCHEMA_VERSION, executionId: input.receipts[0]?.executionId ?? null, campaignId: input.campaign.campaignId, reducer: REDUCER_REF, runner: input.selection.cells[0]?.expectedTarget.runner ?? HTTP_RUNNER_CAPABILITIES.ref, files, createdAt: new Date().toISOString() };
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

export type BundleVerification = { ok: boolean; problems: string[]; outcome: CampaignResult['outcome'] | null; receipts: number };
export type VerifiedBundleRecords = { verification: BundleVerification & { ok: true }; manifestDigest: Digest;
  request: RunRequest; selection: SelectionManifest; campaign: CampaignResult; receipts: ExecutionReceipt[]; documents: Record<string, unknown> };
type Inspection = { verification: BundleVerification; records: Omit<VerifiedBundleRecords, 'verification'> | null };

export function verifyBundle(dir: string): BundleVerification {
  try { return verifyBundleRecords(dir).verification; }
  catch (error) { return { ok: false, problems: [error instanceof Error ? error.message : 'invalid bundle'], outcome: null, receipts: 0 }; }
}

/**
 * Publish only the verified snapshot's sealed bytes. The owned local parent must exist;
 * cooperating writers share an exclusive lock, and existing outputs are never merged/overwritten.
 * A crash leaves a private staging directory/lock to reconcile, or a complete verified output.
 * No automatic stale-lock breaking, distributed fencing or hostile-parent race protection.
 */
export function exportVerifiedBundle(source: string, output: string): BundleVerification {
  let snapshot: BundleSnapshot;
  let verification: BundleVerification;
  try {
    snapshot = new BundleSnapshot(source);
    verification = verifySnapshot(snapshot).verification;
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : 'invalid bundle'], outcome: null, receipts: 0 };
  }
  if (!verification.ok) return verification;
  const destination = resolve(output);
  const parent = dirname(destination);
  requireRealDirectory(parent);
  const lock = join(parent, `.${basename(destination)}.publish.lock`);
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error('bundle publication is locked; reconcile the owned publication lock before retrying'); }
  let staging: string | null = null;
  try {
    try { lstatSync(destination); throw new Error('bundle output already exists; choose a fresh output directory'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    syncDirectoryAncestors(parent);
    staging = mkdtempSync(join(parent, '.tracegrove-publish-'));
    const directories = new Set<string>([staging]);
    for (const path of snapshot.paths()) {
      const file = join(staging, path);
      let directory = dirname(file);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      while (directory !== parent) { directories.add(directory); if (directory === staging) break; directory = dirname(directory); }
      writeExclusiveDurable(file, snapshot.read(path));
    }
    // Commit marker last, from the same bounded snapshot that was independently reduced.
    writeExclusiveDurable(join(staging, 'manifest.json'), snapshot.manifestBytes());
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) syncDirectory(directory);
    const copied = verifyBundle(staging);
    if (!copied.ok) throw new Error('staged bundle failed verification; no output published');
    renameSync(staging, destination);
    staging = null;
    // If this fails, the complete output may exist; do not retry blindly or delete it.
    try { syncDirectory(parent); }
    catch { throw new Error('bundle published but directory durability is unconfirmed; verify existing output before retrying'); }
    return copied;
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    rmSync(lock, { recursive: true });
  }
}

export function readVerifiedBundle(dir: string): VerifiedBundleRecords {
  const checked = verifyBundleRecords(dir);
  if (!checked.verification.ok || !checked.records) throw new Error(`invalid bundle: ${checked.verification.problems.slice(0, 20).join('; ')}`);
  return { ...checked.records, verification: { ...checked.verification, ok: true } };
}

/** Read recording bytes from the same immutable snapshot that passed complete bundle verification. */
export function readVerifiedVideo(dir: string, digest: string, caseId?: string): Buffer {
  const snapshot = new BundleSnapshot(dir);
  const checked = verifySnapshot(snapshot);
  if (!checked.verification.ok || !checked.records) throw new Error('recording bundle failed verification');
  const receipt = checked.records.receipts.find(r => (caseId === undefined || r.caseRef.id === caseId) && r.artifacts.some(a => a.mediaType === 'video/webm' && a.ref.digest.hex === digest));
  if (!receipt) throw new Error('recording is not bound to a verified receipt');
  return snapshot.read(videoBundlePath(receipt.selectionCellId, digest));
}

function verifyBundleRecords(dir: string): Inspection { return verifySnapshot(new BundleSnapshot(dir)); }

function verifySnapshot(snapshot: BundleSnapshot): Inspection {
  const problems: string[] = [];
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
