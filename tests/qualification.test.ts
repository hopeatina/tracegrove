import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps } from '../conformance/helpers.ts';
import { reduceQualificationRound } from '../src/core/qualification.ts';
import { digestOfBytes, verifySelfDigest } from '../src/protocol/index.ts';
import { qualificationFixture } from './fixtures/qualification.ts';
import { reduceCampaign } from '../src/core/reducer.ts';
import { CampaignResult } from '../src/protocol/index.ts';
import { resealBundle } from '../conformance/helpers.ts';

afterEach(cleanupTemps);
it('binds the entire saved campaign deterministically without declaring mock evidence live-qualified', async () => {
  const f = await qualificationFixture();
  const first = await reduceQualificationRound(f.ports, f.input);
  expect(first).toEqual(await reduceQualificationRound(f.ports, f.input));
  expect(verifySelfDigest(first)).toBe(true);
  expect(first.campaignResultRef).toEqual(f.bundle.campaign.ref);
  expect(first.terminalReceiptRefs).toEqual(f.bundle.selection.cells.map(c => f.bundle.receipts.find(r => r.selectionCellId === c.selectionCellId)!.ref));
  expect(first).not.toHaveProperty('qualifies');
  expect(first).not.toHaveProperty('level');
  expect(f.ports.authenticateEvidence).toHaveBeenCalledWith(f.admission, f.bundle);
});
it('retains a complete failed round instead of filtering away its campaign', async () => {
  const f = await qualificationFixture(true);
  expect(f.bundle.campaign.outcome).toBe('assertion_failed');
  expect((await reduceQualificationRound(f.ports, f.input)).campaignResultRef).toEqual(f.bundle.campaign.ref);
});
it.each(['execution', 'attempt', 'cell', 'strata', 'policy', 'campaign', 'scope', 'selection'] as const)(
  'rejects substituted registered %s before issuer authentication', async field => {
    const f = await qualificationFixture(false, changed => {
    if (field === 'execution') changed.attempts[0]!.executionId = 'foreign-execution';
    if (field === 'attempt') changed.attempts[0]!.attemptId = 'foreign-attempt';
    if (field === 'cell') changed.attempts[0]!.selectionCellId = 'foreign-cell';
    if (field === 'strata') changed.strataDigest = digestOfBytes('changed-strata');
    if (field === 'policy') changed.qualificationPolicyRef.id = 'foreign-policy';
    if (field === 'campaign') changed.campaignId = 'foreign-campaign';
    if (field === 'scope') changed.scope.ownerId = 'foreign-owner';
    if (field === 'selection') changed.selectionManifestRef.id = 'foreign-selection';
    });
    await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow();
    expect(f.ports.authenticateEvidence).not.toHaveBeenCalled();
  });
it('rejects corrupt raw bundle bytes even if the trusted issuer would accept them', async () => {
  const f = await qualificationFixture();
  writeFileSync(join(f.input.bundleDir, 'campaign.json'), '{}');
  await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow();
  expect(f.ports.authenticateEvidence).not.toHaveBeenCalled();
});
it('rejects a correctly sealed incomplete campaign rather than completing its pending round', async () => {
  const f = await qualificationFixture();
  const { campaign, request, selection } = f.bundle;
  const incomplete = reduceCampaign({ scope: campaign.scope, campaignId: campaign.campaignId,
    requestRef: request.ref, selection, receipts: [] });
  writeFileSync(join(f.input.bundleDir, 'campaign.json'), JSON.stringify(CampaignResult.parse(incomplete)));
  const path = join(f.input.bundleDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.files = manifest.files.filter((file: { path: string }) => !file.path.startsWith('cells/'));
  writeFileSync(path, JSON.stringify(manifest)); resealBundle(f.input.bundleDir);
  await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow('exactly one terminal');
  expect(f.ports.authenticateEvidence).not.toHaveBeenCalled();
});
it.each(['attempt', 'lease'] as const)('rejects duplicate registered %s allocations', async kind => {
  const f = await qualificationFixture(false, admission => {
    if (kind === 'attempt') admission.attempts.push(structuredClone(admission.attempts[0]!));
    else admission.stateLeaseRefs.push(structuredClone(admission.stateLeaseRefs[0]!));
  });
  await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow('duplicate');
  expect(f.ports.authenticateEvidence).not.toHaveBeenCalled();
});
it('never falls back when authorization, the saved admission, or issuer authentication is unavailable', async () => {
  const f = await qualificationFixture();
  f.ports.authorize = async () => { throw new Error('owner denied'); };
  await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow('owner denied');
  expect(f.ports.resolveAdmission).not.toHaveBeenCalled();
  f.ports.authorize = async () => {};
  f.ports.resolveAdmission = async () => null;
  await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow();
  f.ports.resolveAdmission = async () => f.admission;
  f.ports.authenticateEvidence = async () => { throw new Error('issuer untrusted'); };
  await expect(reduceQualificationRound(f.ports, f.input)).rejects.toThrow('issuer untrusted');
});
it('isolates authoritative callback inputs from the records used to seal the result', async () => {
  const f = await qualificationFixture();
  f.ports.authenticateEvidence = vi.fn(async (admission, bundle) => {
    admission.scope.ownerId = 'rewritten-owner'; bundle.campaign.ref.id = 'rewritten-campaign'; bundle.receipts.length = 0;
  });
  const round = await reduceQualificationRound(f.ports, f.input);
  expect(round.scope).toEqual(f.input.scope);
  expect(round.campaignResultRef).toEqual(f.bundle.campaign.ref);
  expect(round.terminalReceiptRefs.length).toBe(f.bundle.receipts.length);
});
