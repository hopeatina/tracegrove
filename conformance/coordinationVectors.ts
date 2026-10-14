import { transitionCoordination, type CoordinationCommand, type CoordinationSnapshot } from '../src/core/coordination.ts';

export type CoordinationVector = {
  id: string; before: CoordinationSnapshot; command: CoordinationCommand;
  observedAt: number; after: CoordinationSnapshot; clockUpdatedAttempts: string[];
};

/** Executable portable oracle. SQL consumes its checked JSON export without app dependencies. */
export function buildCoordinationVectors(): CoordinationVector[] {
  let state: CoordinationSnapshot = { scopeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    version: 1, generation: 0, budgetCents: 500, leases: [] };
  const commands: Array<{ id: string; command: CoordinationCommand; observedAt: number }> = [
    { id: 'reserve', observedAt: 1000, command: { type: 'reserve', attemptId: 'attempt:1',
      workerId: 'worker:1', personaId: 'persona:1', reservedCents: 300, ttlMs: 300000 } },
    { id: 'effect', observedAt: 2000, command: { type: 'effect', attemptId: 'attempt:1',
      workerId: 'worker:1', generation: 1, effectId: 'effect:1' } },
    { id: 'heartbeat', observedAt: 3000, command: { type: 'heartbeat', attemptId: 'attempt:1',
      workerId: 'worker:1', generation: 1, ttlMs: 300000 } },
    { id: 'shared_budget', observedAt: 4000, command: { type: 'reserve', attemptId: 'attempt:2',
      workerId: 'worker:1', personaId: 'persona:2', reservedCents: 200, ttlMs: 300000 } },
    { id: 'recover', observedAt: 303000, command: { type: 'recover', attemptId: 'attempt:1',
      workerId: 'worker:2', ttlMs: 300000 } },
    { id: 'reconcile_heartbeat', observedAt: 303100, command: { type: 'heartbeat', attemptId: 'attempt:1',
      workerId: 'worker:2', generation: 3, ttlMs: 300000 } },
  ];
  return commands.map(({ id, command, observedAt }) => {
    const before = state;
    const after = transitionCoordination(before, before.scopeId, before.version, command, observedAt);
    const clockUpdatedAttempts = after.leases.filter(lease =>
      before.leases.find(previous => previous.attemptId === lease.attemptId)?.expiresAt !== lease.expiresAt)
      .map(lease => lease.attemptId);
    state = after;
    return { id, before, command, observedAt, after, clockUpdatedAttempts };
  });
}
