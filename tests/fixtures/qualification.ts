/** Unit-only registered-admission simulation. The executor does not yet admit qualification runs.
 * Rewrite genuine mock observation bundles consistently to test the consumer boundary. This is
 * deliberately not a live registration, authenticated issuer, or qualification receipt. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { planSample, resealBundle, runSample, sampleCopy } from '../../conformance/helpers.ts';
import { readVerifiedBundle } from '../../src/core/bundle.ts';
import { qualificationStrataDigest } from '../../src/core/scenario.ts';
import { QualificationRoundAdmission, RunRequest, SelectionManifest, ExecutionReceipt, CampaignResult,
  digestOfBytes, freeze, type Ref } from '../../src/protocol/index.ts';
import type { QualificationResultPorts } from '../../src/core/qualification.ts';

const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
export async function qualificationFixture(failed = false, alterAdmission?: (admission: QualificationRoundAdmission) => void) {
  const copy = sampleCopy(root => {
    if (!failed) return;
    const path = join(root, 'verification/cases/notes.contract.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('value: 200 }, { kind: json_path_present', 'value: 299 }, { kind: json_path_present'));
  });
  const run = await runSample(planSample(copy.configPath, 'offline-contract'), copy.stateDir);
  const original = readVerifiedBundle(run.executionDir);
  const policy = ref('qualification-policy');
  const selection = SelectionManifest.parse(freeze({ ...original.selection, policyRef: policy }));
  let admission = QualificationRoundAdmission.parse(freeze({ schemaVersion: 'workflow.qualification-admission/v1',
    ref: { id: 'qualification-admission', revision: '1' }, scope: selection.scope, scenarioRef: ref('scenario'),
    replayContractRef: ref('replay-contract'), qualificationPolicyRef: policy, qualificationMatrixRef: selection.ref,
    targetProfileRef: ref('target-profile'), strataDigest: qualificationStrataDigest(selection), invalidationEpoch: 0,
    roundSequence: 1, campaignId: original.request.campaignId, selectionManifestRef: selection.ref,
    attempts: original.receipts.map(r => ({ selectionCellId: r.selectionCellId, executionId: r.executionId, attemptId: r.attemptId })),
    stateLeaseRefs: [ref('fresh-state-lease')],
  }));
  alterAdmission?.(admission);
  admission = QualificationRoundAdmission.parse(freeze(admission));
  const request = RunRequest.parse(freeze({ ...original.request, purpose: 'qualification', scenarioRefs: [admission.scenarioRef],
    selectionManifestRef: selection.ref, qualificationRoundRef: admission.ref }));
  const receipts = original.receipts.map(r => ExecutionReceipt.parse(freeze({ ...r, requestRef: request.ref, qualificationRoundRef: admission.ref })));
  for (const name of readdirSync(join(run.executionDir, 'cells'))) {
    const path = join(run.executionDir, 'cells', name, 'receipt.json');
    const old = ExecutionReceipt.parse(JSON.parse(readFileSync(path, 'utf8')));
    write(path, receipts.find(r => r.selectionCellId === old.selectionCellId));
  }
  write(join(run.executionDir, 'selection.json'), selection);
  write(join(run.executionDir, 'request.json'), request);
  write(join(run.executionDir, 'campaign.json'), CampaignResult.parse(freeze({ ...original.campaign, requestRef: request.ref,
    selectionManifestRef: selection.ref, cellReceiptRefs: original.campaign.cellReceiptRefs.map(binding => ({
      ...binding, receiptRef: receipts.find(r => r.selectionCellId === binding.selectionCellId)!.ref,
    })) })));
  resealBundle(run.executionDir);
  const ports: QualificationResultPorts = { authorize: vi.fn(async () => {}), resolveAdmission: vi.fn(async () => admission),
    authenticateEvidence: vi.fn(async () => {}) };
  const input = { admissionRef: admission.ref, scope: admission.scope, bundleDir: run.executionDir };
  return { ports, input, admission, bundle: readVerifiedBundle(run.executionDir) };
}
