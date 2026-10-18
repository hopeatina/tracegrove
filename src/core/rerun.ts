import { freeze, parseAs, refKey, RunRequest } from '../protocol/index.ts';
import { FrozenBundle } from './frozenBundle.ts';
import { Blocked } from './errors.ts';
import { newId } from './clock.ts';
import { inspectFrozenPlan } from './planInspection.ts';

/** Fresh campaign/leases for the exact frozen cases. This is distinct from redelivery. */
export function createRerun(input: FrozenBundle): FrozenBundle {
  const bundle = structuredClone(FrozenBundle.parse(input));
  if (!bundle.request) throw new Blocked([{ code: 'rerun_blocked_plan', detail: 'resolve the original blockers before rerunning' }]);
  const old = bundle.request;
  if (!['trial', 'work_proof'].includes(old.purpose) || old.qualificationRoundRef || old.sourcePlanRef || old.reviewRef || old.scenarioRefs.length)
    throw new Blocked([{ code: 'rerun_requires_registration', detail: 'Lifecycle executions need a fresh owning scenario registration.', owner: 'operator', action: 'register a new independent qualification round through the current owner' }]);
  const inspection = inspectFrozenPlan(bundle, old.requestedScope);
  if (inspection.structural !== 'valid') throw new Blocked(inspection.blockers);
  const request = parseAs(RunRequest, freeze({ ...old,
    ref: { id: old.ref.id, revision: newId('rerun') },
    idempotencyKey: newId('request'), campaignId: newId('campaign'), clientRequestId: newId('client'),
    replayOf: old.ref, qualificationRoundRef: null,
  }), 'rerun');
  return { ...bundle, request, documents: { ...bundle.documents, [refKey(request.ref)]: request } };
}
