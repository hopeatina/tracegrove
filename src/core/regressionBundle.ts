import { sameRef, type Ref, type Scope } from '../protocol/index.ts';
import type { LocalLedger } from './ledger.ts';
import type { FrozenBundle } from './planner.ts';
import { RegressionExecutionContext, validateRegressionExecution, type RegressionExecutionOwner } from './regressionExecution.ts';
import { rebindScenarioBundle, scenarioBaseRequest } from './scenarioBundle.ts';
import { Conflict } from './errors.ts';

export async function prepareRegressionExecution(bundle: FrozenBundle, admissionRef: Ref, scope: Scope,
  ledger: LocalLedger, owner: RegressionExecutionOwner): Promise<FrozenBundle> {
  scenarioBaseRequest(bundle, scope);
  const context = RegressionExecutionContext.parse(await owner.resolve(structuredClone(admissionRef), structuredClone(scope), ledger));
  const { admission, definition, activation, selection, matrix, sourceReview } = context;
  if (!sameRef(admission.ref, admissionRef)) throw new Conflict('regression resolver returned another admission');
  const prepared = rebindScenarioBundle(bundle, scope, selection, { kind: 'regression', digest: admission.ref.digest.hex }, {
    purpose: 'regression', campaignId: admission.campaignId, sourcePlanRef: definition.sourcePlanRef, reviewRef: definition.reviewRef,
    scenarioRefs: [definition.ref], qualificationRoundRef: null, regressionAdmissionRef: admission.ref,
  }, [admission, definition, activation, selection, matrix, ...(sourceReview ? [sourceReview.plan, sourceReview.review, sourceReview.validation] : [])]);
  validateRegressionExecution(prepared.request!, selection, context);
  return prepared;
}
