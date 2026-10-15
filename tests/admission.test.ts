import { afterEach, expect, it } from 'vitest';
import { cleanupTemps, sampleCopy, planSample, runSample } from '../conformance/helpers.ts';
import { freeze, refKey } from '../src/protocol/index.ts';
afterEach(cleanupTemps);
it('rejects unimplemented qualification authority and frozen-key rebinding before effects', async () => {
  const copy = sampleCopy(); const bundle = planSample(copy.configPath);
  const qualification = freeze({ ...bundle.request!, purpose: 'qualification' as const });
  await expect(runSample({ ...bundle, request: qualification }, copy.stateDir)).rejects.toThrow(/scenario_lifecycle_unavailable/);
  const disguised = freeze({ ...bundle.request!, qualificationRoundRef: bundle.request!.selectionManifestRef });
  await expect(runSample({ ...bundle, request: disguised }, copy.stateDir)).rejects.toThrow(/scenario_lifecycle_unavailable/);
  await runSample(bundle, copy.stateDir);
  const changed = freeze({ ...bundle.request!, campaignId: 'campaign.different' });
  await expect(runSample({ ...bundle, request: changed, documents: { ...bundle.documents, [refKey(changed.ref)]: changed } }, copy.stateDir)).rejects.toThrow(/different frozen request/);
});
