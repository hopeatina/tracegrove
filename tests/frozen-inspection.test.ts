import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { localScope } from '../src/core/corpus.ts';
import { inspectFrozenPlan } from '../src/core/planInspection.ts';
import { createRerun } from '../src/core/rerun.ts';
import { VerifiedBundleSnapshot, verifyBundle } from '../src/core/bundle.ts';
import { exportVerifiedBundle } from '../src/core/bundleExport.ts';
import { inspectExecution } from '../src/core/executionInspection.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { registeredQualificationFixture } from './fixtures/registeredQualification.ts';
import { FROZEN_BUNDLE_MAX_BYTES, readFrozenBundle } from '../src/core/frozenBundle.ts';

const ledgers: LocalLedger[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const ledger of ledgers.splice(0)) ledger.close(); cleanupTemps(); });
it('inspects frozen contracts without opening mutable config or runtime source and grants no execution authority', () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath, 'native-real');
  renameSync(copy.configPath, `${copy.configPath}.unavailable`); renameSync(join(copy.root, 'app'), join(copy.root, 'app-unavailable'));
  const inspection = inspectFrozenPlan(bundle, localScope());
  expect(inspection).toMatchObject({ structural: 'valid', executionAuthority: 'not_checked', requestRef: bundle.request!.ref, requiresQualificationOwner: false });
  expect(inspection.cells.length).toBeGreaterThan(0); expect(existsSync(copy.stateDir)).toBe(false);
});
it('reports blocked scope, request, document and empty-plan inputs rather than structural success', () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath);
  const missing = inspectFrozenPlan({ ...bundle, request: null, blockers: [] }, localScope()); expect(missing.structural).toBe('blocked'); expect(missing.blockers.length).toBeGreaterThan(0);
  const foreign = inspectFrozenPlan(bundle, { ...localScope(), ownerId: 'foreign' }); expect(foreign.blockers[0]!.code).toBe('scope_mismatch');
  const changed = structuredClone(bundle); changed.request!.campaignId = 'tampered';
  expect(inspectFrozenPlan(changed, localScope()).blockers[0]!.code).toBe('request_digest_mismatch');
  expect(() => createRerun(changed)).toThrow('request_digest_mismatch');
  const extra = { ...bundle, documents: { ...bundle.documents, invented: {} } };
  expect(inspectFrozenPlan(extra, localScope()).blockers[0]!.code).toBe('frozen_document_changed');
  expect(() => createRerun(extra)).toThrow('frozen_document_changed');
});
it('does not clear lifecycle registration or treat a structurally valid qualification bundle as effect permission', async () => {
  const f = await registeredQualificationFixture(ledger => ledgers.push(ledger));
  expect(inspectFrozenPlan(f.bundle, f.scope)).toMatchObject({ structural: 'valid', executionAuthority: 'not_checked', requiresQualificationOwner: true });
  expect(() => createRerun(f.bundle)).toThrow('rerun_requires_registration');
});
it('keeps the original immutable input independent of edits to a newly prepared rerun', () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath); const before = JSON.stringify(bundle);
  const rerun = createRerun(bundle); const key = Object.keys(rerun.documents)[0]!;
  (rerun.documents[key] as Record<string, unknown>).testMutation = true;
  expect(JSON.stringify(bundle)).toBe(before);
  expect(rerun.request!.replayOf).toEqual(bundle.request!.ref); expect(rerun.request!.campaignId).not.toBe(bundle.request!.campaignId);
});
it('bounds frozen input reads and refuses links or invalid envelopes before admission', () => {
  const copy = sampleCopy(); const path = join(copy.root, 'plan.json'); writeFileSync(path, JSON.stringify(planSample(copy.configPath)));
  expect(readFrozenBundle(path).request).not.toBeNull(); symlinkSync(path, `${path}.link`);
  expect(() => readFrozenBundle(`${path}.link`)).toThrow('invalid_request_file');
  writeFileSync(path, '{}'); expect(() => readFrozenBundle(path)).toThrow('invalid_request_file');
  truncateSync(path, FROZEN_BUNDLE_MAX_BYTES + 1); expect(() => readFrozenBundle(path)).toThrow('invalid_request_file');
});
it('exports only captured sealed bytes after the producer directory disappears', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath, 'native-real'), copy.stateDir);
  writeFileSync(join(run.executionDir, 'unsealed.txt'), 'scratch must not enter export');
  const snapshot = VerifiedBundleSnapshot.open(run.executionDir); const expected = inspectExecution(snapshot);
  rmSync(run.executionDir, { recursive: true });
  const output = join(copy.root, 'export'); const exported = exportVerifiedBundle(snapshot, output);
  expect(exported.verification.ok).toBe(true); expect(exported.manifestDigest).toEqual(snapshot.manifestDigest);
  expect(verifyBundle(output).ok).toBe(true); expect(existsSync(join(output, 'unsealed.txt'))).toBe(false);
  expect(inspectExecution(VerifiedBundleSnapshot.open(output))).toEqual(expected);
});
it('never merges into or removes an existing destination, including linked directories', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir); const snapshot = VerifiedBundleSnapshot.open(run.executionDir);
  const output = join(copy.root, 'existing'); mkdirSync(output); writeFileSync(join(output, 'keep'), 'original');
  expect(() => exportVerifiedBundle(snapshot, output)).toThrow('already exists'); expect(readFileSync(join(output, 'keep'), 'utf8')).toBe('original');
  const linked = join(copy.root, 'linked'); symlinkSync(output, linked);
  expect(() => exportVerifiedBundle(snapshot, linked)).toThrow('already exists'); expect(existsSync(linked)).toBe(true);
});
it('removes only its own partial export after a captured-byte read failure', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir); const snapshot = VerifiedBundleSnapshot.open(run.executionDir);
  const output = join(copy.root, 'partial'); const read = snapshot.read.bind(snapshot);
  vi.spyOn(snapshot, 'read').mockImplementation(path => { if (path === 'campaign.json') throw new Error('injected read failure'); return read(path); });
  expect(() => exportVerifiedBundle(snapshot, output)).toThrow('injected read failure'); expect(existsSync(output)).toBe(false);
  expect(verifyBundle(run.executionDir).ok).toBe(true);
});
