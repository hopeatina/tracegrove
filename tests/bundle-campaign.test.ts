import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, planSample, resealBundle, runSample, sampleCopy } from '../conformance/helpers.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { CampaignResult, freeze } from '../src/protocol/index.ts';
afterEach(cleanupTemps);

it.each(['receipt bindings', 'coverage', 'scope'] as const)('rejects resealed campaign %s that disagree with the saved selection/receipts', async field => {
  const copy = sampleCopy(); const run = await runSample(planSample(copy.configPath), copy.stateDir);
  expect(verifyBundle(run.executionDir).ok).toBe(true);
  const path = join(run.executionDir, 'campaign.json');
  const campaign = CampaignResult.parse(JSON.parse(readFileSync(path, 'utf8')));
  const changed = field === 'receipt bindings' ? { ...campaign, cellReceiptRefs: [] }
    : field === 'coverage' ? { ...campaign, coverage: { ...campaign.coverage, selected: 0 } }
      : { ...campaign, scope: { ...campaign.scope, ownerId: 'another-owner' } };
  writeFileSync(path, JSON.stringify(freeze(changed))); resealBundle(run.executionDir);
  const invalid = verifyBundle(run.executionDir);
  expect(invalid.ok).toBe(false);
  expect(invalid.outcome).toBeNull();
});
