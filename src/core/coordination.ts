import { z } from 'zod';
import { Conflict } from './errors.ts';

const Key = z.string().min(1).max(256);
const Counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const LeaseDuration = Counter.positive().max(300_000);
const LeaseSchema = z.object({
  attemptId: Key, workerId: Key, personaId: Key, generation: Counter.positive(),
  expiresAt: Counter, reservedCents: Counter.positive(),
  state: z.enum(['active', 'reconciling', 'released']),
  effectIds: z.array(Key), cleanupProof: Key.nullable(),
}).strict();
export const CoordinationSnapshotSchema = z.object({
  scopeId: Key, version: Counter, generation: Counter, budgetCents: Counter.positive(),
  leases: z.array(LeaseSchema),
}).strict().superRefine((snapshot, ctx) => {
  const attempts = new Set<string>();
  const personas = new Set<string>();
  let reserved = 0n;
  for (const lease of snapshot.leases) {
    if (attempts.has(lease.attemptId) || lease.generation > snapshot.generation ||
      new Set(lease.effectIds).size !== lease.effectIds.length ||
      (lease.state === 'released') !== (lease.cleanupProof !== null)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid coordination history' });
    }
    attempts.add(lease.attemptId);
    if (lease.state !== 'released') {
      if (personas.has(lease.personaId)) ctx.addIssue({ code: 'custom', message: 'Persona has multiple owners' });
      personas.add(lease.personaId);
    }
    reserved += BigInt(lease.reservedCents);
  }
  if (reserved > BigInt(snapshot.budgetCents)) ctx.addIssue({ code: 'custom', message: 'Coordination budget exceeded' });
});
export type CoordinationSnapshot = z.infer<typeof CoordinationSnapshotSchema>;
export type CoordinationFence = { attemptId: string; workerId: string; generation: number };

const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reserve'), attemptId: Key, workerId: Key, personaId: Key,
    reservedCents: Counter.positive(), ttlMs: LeaseDuration }).strict(),
  z.object({ type: z.literal('heartbeat'), attemptId: Key, workerId: Key, generation: Counter.positive(),
    ttlMs: LeaseDuration }).strict(),
  z.object({ type: z.literal('effect'), attemptId: Key, workerId: Key, generation: Counter.positive(), effectId: Key }).strict(),
  z.object({ type: z.literal('recover'), attemptId: Key, workerId: Key, ttlMs: LeaseDuration }).strict(),
  z.object({ type: z.literal('release'), attemptId: Key, workerId: Key, generation: Counter.positive(), cleanupProof: Key }).strict(),
]);
export type CoordinationCommand = z.infer<typeof CommandSchema>;

/** Pure transition only. The trusted storage owner supplies time, CAS and cleanup proof admission. */
export function transitionCoordination(raw: unknown, scopeId: string, expectedVersion: number,
  input: CoordinationCommand, observedAt: number): CoordinationSnapshot {
  const state = CoordinationSnapshotSchema.parse(raw);
  const command = CommandSchema.parse(input);
  Counter.parse(observedAt);
  if (state.scopeId !== scopeId || state.version !== expectedVersion) throw new Conflict('Coordination scope or version changed');
  if (state.version === Number.MAX_SAFE_INTEGER || state.generation === Number.MAX_SAFE_INTEGER) throw new Conflict('Coordination counter exhausted');
  const lease = state.leases.find(item => item.attemptId === command.attemptId);
  if (command.type === 'reserve') {
    if (lease) throw new Conflict('Attempt already reserved; reconcile its existing reservation');
    // Expiry alone cannot make a persona safe to reuse: cleanup must be independently admitted.
    if (state.leases.some(item => item.personaId === command.personaId && item.state !== 'released')) throw new Conflict('Persona requires reconciliation');
    const spent = state.leases.reduce((sum, item) => sum + BigInt(item.reservedCents), 0n);
    if (spent + BigInt(command.reservedCents) > BigInt(state.budgetCents)) throw new Conflict('Shared coordination budget exhausted');
    state.generation++;
    state.leases.push({ attemptId: command.attemptId, workerId: command.workerId, personaId: command.personaId,
      reservedCents: command.reservedCents, generation: state.generation, expiresAt: observedAt + command.ttlMs,
      state: 'active', effectIds: [], cleanupProof: null });
  } else {
    if (!lease || lease.state === 'released') throw new Conflict('No active coordination lease');
    if (command.type === 'recover') {
      if (lease.expiresAt > observedAt) throw new Conflict('Coordination lease has not expired');
      state.generation++;
      lease.generation = state.generation;
      lease.workerId = command.workerId;
      lease.state = 'reconciling';
      lease.expiresAt = observedAt + command.ttlMs;
      // Recovery admits cleanup/readback only. It never replays an uncertain effect.
    } else {
      if (lease.workerId !== command.workerId || lease.generation !== command.generation) throw new Conflict('Stale coordination fence');
      if (lease.expiresAt <= observedAt) throw new Conflict('Coordination lease expired; recover before continuing');
      if (command.type === 'release') {
        lease.state = 'released';
        lease.cleanupProof = command.cleanupProof;
      } else {
        if (command.type === 'heartbeat') lease.expiresAt = observedAt + command.ttlMs;
        else {
          if (lease.state !== 'active') throw new Conflict('Coordination lease cannot admit effects');
          if (lease.effectIds.includes(command.effectId)) throw new Conflict('Effect already admitted; reconcile its provider receipt');
          lease.effectIds.push(command.effectId);
        }
      }
    }
  }
  state.version++;
  return CoordinationSnapshotSchema.parse(state);
}

/** One aggregate per shared budget/persona domain; CAS must be atomic across all processes. */
export interface CoordinationStore {
  read(scopeId: string): Promise<{ snapshot: unknown; observedAt: number }>;
  compareAndSwap(scopeId: string, expectedVersion: number, next: CoordinationSnapshot): Promise<boolean>;
}

/** Not a distributed admission adapter: time, owner authentication and protected output fencing are adapter obligations. */
export async function commitCoordination(store: CoordinationStore, scopeId: string, command: CoordinationCommand): Promise<CoordinationSnapshot> {
  if (command.type === 'release') throw new Conflict('Release requires the storage owner to admit an independent cleanup proof');
  const { snapshot, observedAt } = await store.read(scopeId);
  const current = CoordinationSnapshotSchema.parse(snapshot);
  const next = transitionCoordination(current, scopeId, current.version, command, observedAt);
  if (!await store.compareAndSwap(scopeId, current.version, next)) throw new Conflict('Coordination version changed; reload before admission');
  return next;
}
