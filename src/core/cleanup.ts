import { CleanupObservation as CleanupSchema, type ActionRegistry, type CleanupObservation } from '../protocol/index.ts';
import type { HttpDriver } from '../adapters/http/driver.ts';
import type { HostSession } from '../hosts/types.ts';
import type { Deadline } from './deadline.ts';
import type { EventLog } from './events.ts';
import { cleanupActionError } from './cleanupActions.ts';

export type AllocatedFixture = {
  entityKey: string; physicalId: string;
  cleanup: { actionId: string; args: Record<string, unknown> } | null;
  absence: { actionId: string; expectStatus: number } | null;
};

/** Collect observed cleanup only. This report is not an authority to release a hosted lease. */
export async function collectCleanup(input: {
  allocated: readonly AllocatedFixture[]; uncertainAllocations: number;
  registry: ActionRegistry | null; driver: Pick<HttpDriver, 'request'> | null; origin: string;
  deadline: Deadline; session: HostSession | null; reason: string; log: Pick<EventLog, 'emit'>;
}): Promise<{ cleanup: CleanupObservation; criticalCleanupConfirmed: boolean }> {
  const { allocated, driver, registry, origin, deadline, session, log } = input;
  const attempted: string[] = []; const confirmed: string[] = [];
  for (const entry of [...allocated].reverse()) {
    if (!entry.cleanup || !driver || !registry) {
      log.emit('cleanup.entity', null, { entityKey: entry.entityKey, confirmed: false, reason: 'cleanup_unavailable' });
      continue;
    }
    attempted.push(entry.entityKey);
    try {
      const action = registry.actions.find(item => item.actionId === entry.cleanup!.actionId);
      const absenceAction = registry.actions.find(item => item.actionId === entry.absence?.actionId);
      const error = cleanupActionError(action, absenceAction, entry.absence?.expectStatus ?? 0);
      if (error) throw new Error(error);
      if (!action || !entry.absence || !absenceAction) throw new Error('cleanup actions unavailable');
      const result = await driver.request({ origin, method: action.method, path: action.path, body: action.body,
        auth: action.auth, variables: entry.cleanup.args, deadline: deadline.child(5000) });
      const readback = await driver.request({ origin, method: absenceAction.method, path: absenceAction.path,
        body: absenceAction.body, auth: absenceAction.auth, variables: entry.cleanup.args, deadline: deadline.child(5000) });
      const absent = readback.status === entry.absence.expectStatus;
      const ok = (action.expectStatus === null || result.status === action.expectStatus) && absent;
      if (ok) confirmed.push(entry.entityKey);
      log.emit('cleanup.entity', null, { entityKey: entry.entityKey, status: result.status,
        absenceConfirmed: absent, confirmed: ok });
    } catch (error) {
      log.emit('cleanup.entity', null, { entityKey: entry.entityKey, confirmed: false,
        error: error instanceof Error ? error.message : 'cleanup failed' });
    }
  }
  let hostStopConfirmed = false;
  if (session) {
    try {
      const stop = await session.stop(input.reason);
      hostStopConfirmed = stop.confirmed;
      log.emit('cleanup.host', null, { confirmed: stop.confirmed, detail: stop.detail });
    } catch (error) {
      log.emit('cleanup.host', null, { confirmed: false, detail: error instanceof Error ? error.message : 'host cleanup failed' });
    }
  }
  // Every allocation remains unresolved until observed cleanup, including those
  // lacking handles. A lost allocation response cannot invent a physical ID.
  const unconfirmed = allocated.filter(item => !confirmed.includes(item.entityKey)).length;
  const unknown = unconfirmed + input.uncertainAllocations;
  const hostResources = session?.ownedResources ?? [];
  const cleanup = CleanupSchema.parse({
    ownedResources: [...allocated.map(item => ({ entityKey: item.entityKey, physicalId: item.physicalId, boundaryId: 'application' })), ...hostResources],
    attempted: [...attempted, ...hostResources.map(item => item.entityKey)],
    confirmed: [...confirmed, ...(hostStopConfirmed ? hostResources.map(item => item.entityKey) : [])],
    remainingUnknownMutations: unknown,
    critical: [...allocated.map(item => item.entityKey), ...hostResources.map(item => item.entityKey)],
    janitorReceiptRef: null,
    reasonCodes: [...(unconfirmed ? ['fixture_cleanup_unconfirmed'] : []),
      ...(input.uncertainAllocations ? ['fixture_allocation_uncertain'] : []),
      ...(session && !hostStopConfirmed ? ['host_stop_unconfirmed'] : [])],
  });
  return { cleanup, criticalCleanupConfirmed: unknown === 0 && (!session || hostStopConfirmed) };
}
