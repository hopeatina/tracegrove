import {
  QualificationRound, QualificationRoundAdmission, RefSchema, ScopeSchema, digestOfValue, freeze, sameDigest, sameRef, sameScope, verifySelfDigest,
  type Ref, type Scope,
} from '../protocol/index.ts';
import { readVerifiedBundle, type VerifiedBundleRecords } from './bundle.ts';
import { Conflict } from './errors.ts';
import { qualificationStrataDigest } from './scenario.ts';

/** Trusted host interfaces. Neither a plugin nor a saved bundle supplies these implementations. */
export interface QualificationResultPorts {
  authorize(scope: Scope): Promise<void>;
  /** Resolve an authentic, already registered admission, including its reserved attempts/state. */
  resolveAdmission(ref: Ref, scope: Scope): Promise<unknown>;
  /** Authenticate issuer, admission/effect authority and evidence against the captured manifest digest.
   * Reject untrusted imports; validate the frozen definition/replay/policy/matrix/target closure.
   * This does not certify live qualification: mock/structural terminal results are retained too. */
  authenticateEvidence(admission: QualificationRoundAdmission, bundle: VerifiedBundleRecords): Promise<void>;
}
export type QualificationRoundInput = { admissionRef: Ref; scope: Scope; bundleDir: string };
export type QualificationEvidence = { admission: QualificationRoundAdmission; round: QualificationRound; bundle: VerifiedBundleRecords };

/** Reduce a complete terminal campaign. No activation, live-level claim or storage write occurs here. */
export async function reduceQualificationRound(
  ports: QualificationResultPorts, input: QualificationRoundInput,
): Promise<QualificationRound> {
  return (await readQualificationEvidence(ports, input)).round;
}

/** Read once so assessment uses the same authenticated bytes as terminal reduction. */
export async function readQualificationEvidence(ports: QualificationResultPorts, input: QualificationRoundInput): Promise<QualificationEvidence> {
  const admissionRef = RefSchema.parse(input.admissionRef);
  const scope = ScopeSchema.parse(input.scope);
  const bundleDir = input.bundleDir;
  await ports.authorize(structuredClone(scope));
  const admission = QualificationRoundAdmission.parse(await ports.resolveAdmission(structuredClone(admissionRef), structuredClone(scope)));
  if (!verifySelfDigest(admission) || !sameRef(admission.ref, admissionRef) || !sameScope(admission.scope, scope)) {
    throw new Conflict('qualification admission identity or scope mismatch');
  }
  const bundle = readVerifiedBundle(bundleDir);
  const { request, selection, campaign, receipts } = bundle;
  if (!sameScope(request.requestedScope, scope) || !request.qualificationRoundRef || !sameRef(request.qualificationRoundRef, admission.ref) ||
      request.purpose !== 'qualification' || request.campaignId !== admission.campaignId ||
      !sameRef(selection.ref, admission.selectionManifestRef) || !selection.policyRef ||
      !sameRef(selection.policyRef, admission.qualificationPolicyRef) || !sameDigest(qualificationStrataDigest(selection), admission.strataDigest) ||
      request.scenarioRefs.length !== 1 || !sameRef(request.scenarioRefs[0]!, admission.scenarioRef)) {
    throw new Conflict('campaign does not bind the registered qualification admission');
  }
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!selection.cells.length || !unique(selection.cells.map(c => c.selectionCellId)) ||
      admission.attempts.length !== selection.cells.length ||
      !unique(admission.attempts.map(a => a.selectionCellId)) ||
      !unique(admission.attempts.map(a => a.executionId)) || !unique(admission.attempts.map(a => a.attemptId)) ||
      !unique(admission.stateLeaseRefs.map(ref => ref.id))) {
    throw new Conflict('qualification admission has incomplete or duplicate cell/attempt/state allocations');
  }
  const attempts = new Map(admission.attempts.map(a => [a.selectionCellId, a]));
  const byCell = new Map(receipts.map(receipt => [receipt.selectionCellId, receipt]));
  if (receipts.length !== selection.cells.length || byCell.size !== receipts.length || campaign.missingCellIds.length) {
    throw new Conflict('qualification needs exactly one terminal receipt for every selected cell');
  }
  for (const cell of selection.cells) {
    const attempt = attempts.get(cell.selectionCellId);
    const receipt = byCell.get(cell.selectionCellId);
    if (!attempt || !receipt || receipt.executionId !== attempt.executionId || receipt.attemptId !== attempt.attemptId ||
        !receipt.qualificationRoundRef || !sameRef(receipt.qualificationRoundRef, admission.ref)) {
      throw new Conflict('qualification receipt differs from its preallocated cell execution/attempt');
    }
  }
  // Separate copies prevent trusted callbacks from rewriting records used by this reduction.
  await ports.authenticateEvidence(structuredClone(admission), structuredClone(bundle));
  const round = QualificationRound.parse(freeze({ schemaVersion: 'workflow.qualification-round/v1',
    ref: { id: `qualification-result-${digestOfValue(admission.ref).hex}`, revision: '1' }, scope, admissionRef: admission.ref,
    campaignResultRef: campaign.ref,
    terminalReceiptRefs: selection.cells.map(cell => byCell.get(cell.selectionCellId)!.ref),
  }));
  return { admission, round, bundle };
}
