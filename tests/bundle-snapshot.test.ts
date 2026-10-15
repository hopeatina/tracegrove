import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, planSample, resealBundle, runSample, sampleCopy } from '../conformance/helpers.ts';
import { BundleSnapshot, BUNDLE_LIMITS } from '../src/core/bundleSnapshot.ts';
import { readVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
afterEach(cleanupTemps);

it('reduces captured bytes and does not reread changed files or expose mutable backing buffers', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir);
  const snapshot = new BundleSnapshot(run.executionDir);
  const campaign = snapshot.json('campaign.json');
  writeFileSync(join(run.executionDir, 'campaign.json'), '{}');
  const bytes = snapshot.read('campaign.json'); bytes.fill(0);
  expect(snapshot.json('campaign.json')).toEqual(campaign);
  expect(verifyBundle(run.executionDir).ok).toBe(false);
  expect(() => readVerifiedBundle(run.executionDir)).toThrow('hash mismatch');
});
it('returns complete rechecked records without changing the existing verification response', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir);
  const records = readVerifiedBundle(run.executionDir);
  expect(records.verification).toEqual(verifyBundle(run.executionDir));
  expect(records.campaign.cellReceiptRefs.map(cell => cell.receiptRef)).toEqual(records.receipts.map(receipt => receipt.ref));
  expect(records.manifestDigest.hex).toMatch(/^[a-f0-9]{64}$/);
  records.request.campaignId = 'caller-mutated-copy';
  expect(readVerifiedBundle(run.executionDir).request.campaignId).toBe(run.campaignId);
});
it('rejects oversized declarations before reading payload data', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir);
  const path = join(run.executionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify({ ...manifest, files: [{ path: 'absent.bin', bytes: BUNDLE_LIMITS.fileBytes + 1, sha256: '0'.repeat(64) }] }));
  expect(verifyBundle(run.executionDir).ok).toBe(false);
  expect(() => new BundleSnapshot(run.executionDir)).toThrow();
});
it('names a malformed payload without echoing its potentially private contents', async () => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir);
  writeFileSync(join(run.executionDir, 'campaign.json'), 'private-fixture-value'); resealBundle(run.executionDir);
  const result = verifyBundle(run.executionDir);
  expect(result.ok).toBe(false);
  expect(result.problems.join(' ')).toContain('campaign.json');
  expect(result.problems.join(' ')).not.toContain('private-fixture-value');
});
