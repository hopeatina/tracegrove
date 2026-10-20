import { sameRef, type Ref, type Scope } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import type { LocalLedger } from './ledger.ts';
import type { FrozenBundle } from './planner.ts';
import { QualificationExecutionContext, validateQualificationExecution, type QualificationExecutionOwner } from './qualificationExecution.ts';
import { rebindScenarioBundle, scenarioBaseRequest } from './scenarioBundle.ts';

/** New execution request from unchanged frozen contracts. No trial receipt is read or relabelled. */
export async function prepareQualificationExecution(bundle: FrozenBundle, admissionRef: Ref, scope: Scope,
  ledger: LocalLedger, owner: QualificationExecutionOwner): Promise<FrozenBundle> {
  scenarioBaseRequest(bundle, scope);
  const context = QualificationExecutionContext.parse(await owner.resolve(structuredClone(admissionRef), structuredClone(scope), ledger));
  const { admission, definition, selection, matrix, sourceReview } = context;
  if (!sameRef(admission.ref, admissionRef)) throw new Conflict('qualification resolver returned another admission');
  const prepared = rebindScenarioBundle(bundle, scope, selection, { kind: 'qualification', digest: admission.ref.digest.hex }, {
    purpose: 'qualification', campaignId: admission.campaignId, sourcePlanRef: definition.sourcePlanRef,
    reviewRef: definition.reviewRef, scenarioRefs: [definition.ref], qualificationRoundRef: admission.ref,
  }, [admission, definition, selection, matrix, ...(sourceReview ? [sourceReview.plan, sourceReview.review, sourceReview.validation] : [])]);
  validateQualificationExecution(prepared.request!, selection, context);
  return prepared;
}
