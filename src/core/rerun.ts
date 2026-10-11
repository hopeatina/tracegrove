import { freeze, parseAs, refKey, RunRequest } from '../protocol/index.ts';
import type { FrozenBundle } from './planner.ts';
import { Blocked } from './errors.ts';
import { newId } from './clock.ts';

/** Fresh campaign/leases for the exact frozen cases. This is distinct from redelivery. */
export function createRerun(bundle: FrozenBundle): FrozenBundle {
  if (!bundle.request) throw new Blocked([{ code: 'rerun_blocked_plan', detail: 'resolve the original blockers before rerunning' }]);
  const old = bundle.request;
  const request = parseAs(RunRequest, freeze({ ...old,
    ref: { id: old.ref.id, revision: newId('rerun') },
    idempotencyKey: newId('request'), campaignId: newId('campaign'), clientRequestId: newId('client'),
    replayOf: old.ref, qualificationRoundRef: null,
  }), 'rerun');
  return { ...bundle, request, documents: { ...bundle.documents, [refKey(request.ref)]: request } };
}
