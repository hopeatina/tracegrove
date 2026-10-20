import { z } from 'zod';
import { Conflict } from './errors.ts';
import { RefSchema } from '../protocol/primitives.ts';
import { PersonaPoolDefinition, ReservePersonaPool, PersonaPoolStatus } from '../protocol/schemas/personaPool.ts';
import { sameRef } from '../protocol/canonical.ts';
import { CoordinationKey as Key, CoordinationCounter as Counter, CoordinationLeaseDuration as LeaseDuration } from '../protocol/schemas/coordinationPrimitives.ts';
import { choosePersonaPoolMember, personaPoolProblems, personaPoolAvailability } from './personaPool.ts';

const LeaseSchema = z.object({
  attemptId: Key, workerId: Key, personaId: Key, generation: Counter.positive(),
  expiresAt: Counter, reservedCents: Counter.positive(),
  state: z.enum(['active', 'reconciling', 'released']),
  effectIds: z.array(Key), cleanupProof: Key.nullable(), poolRef:RefSchema.optional(),
}).strict();
export const CoordinationSnapshotSchema = z.object({
  scopeId: Key, version: Counter, generation: Counter, budgetCents: Counter.positive(),
  leases: z.array(LeaseSchema),personaPools:z.array(PersonaPoolDefinition).max(100).optional(),
}).strict().superRefine((snapshot, ctx) => {
  const attempts = new Set<string>();
  const personas = new Set<string>();
  let reserved = BigInt(0);
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
  for(const message of personaPoolProblems(snapshot))ctx.addIssue({code:'custom',message});
});
export type CoordinationSnapshot = z.infer<typeof CoordinationSnapshotSchema>;
export type CoordinationFence = { attemptId: string; workerId: string; generation: number };

export const CoordinationCommandSchema = z.discriminatedUnion('type', [
  ReservePersonaPool,
  z.object({ type: z.literal('reserve'), attemptId: Key, workerId: Key, personaId: Key,
    reservedCents: Counter.positive(), ttlMs: LeaseDuration }).strict(),
  z.object({ type: z.literal('heartbeat'), attemptId: Key, workerId: Key, generation: Counter.positive(),
    ttlMs: LeaseDuration }).strict(),
  z.object({ type: z.literal('effect'), attemptId: Key, workerId: Key, generation: Counter.positive(), effectId: Key }).strict(),
  z.object({ type: z.literal('recover'), attemptId: Key, workerId: Key, ttlMs: LeaseDuration }).strict(),
  z.object({ type: z.literal('release'), attemptId: Key, workerId: Key, generation: Counter.positive(), cleanupProof: Key }).strict(),
]);
export type CoordinationCommand = z.infer<typeof CoordinationCommandSchema>;

/** Pure transition only. The trusted storage owner supplies time, CAS and cleanup proof admission. */
export function transitionCoordination(raw: unknown, scopeId: string, expectedVersion: number,
  input: CoordinationCommand, observedAt: number): CoordinationSnapshot {
  const state = CoordinationSnapshotSchema.parse(raw);
  const command = CoordinationCommandSchema.parse(input);
  Counter.parse(observedAt);
  if (state.scopeId !== scopeId || state.version !== expectedVersion) throw new Conflict('Coordination scope or version changed');
  if (state.version === Number.MAX_SAFE_INTEGER || state.generation === Number.MAX_SAFE_INTEGER) throw new Conflict('Coordination counter exhausted');
  const lease = state.leases.find(item => item.attemptId === command.attemptId);
  if (command.type === 'reserve'||command.type==='reserve_pool') {
    if (lease) throw new Conflict('Attempt already reserved; reconcile its existing reservation');
    const member=command.type==='reserve_pool'?choosePersonaPoolMember(state,command):null;
    const personaId=command.type==='reserve'?command.personaId:member!.personaId;
    if(command.type==='reserve'&&state.personaPools?.some(p=>p.memberIds.includes(personaId)))throw new Conflict('Pooled persona requires pool admission');
    // Expiry alone cannot make a persona safe to reuse: cleanup must be independently admitted.
    if (state.leases.some(item => item.personaId === personaId && item.state !== 'released')) throw new Conflict('Persona requires reconciliation');
    const spent = state.leases.reduce((sum, item) => sum + BigInt(item.reservedCents), BigInt(0));
    if (spent + BigInt(command.reservedCents) > BigInt(state.budgetCents)) throw new Conflict('Shared coordination budget exhausted');
    state.generation++;
    state.leases.push({ attemptId: command.attemptId, workerId: command.workerId, personaId,
      reservedCents: command.reservedCents, generation: state.generation, expiresAt: observedAt + command.ttlMs,
      state: 'active', effectIds: [], cleanupProof: null,...(member?{poolRef:member.poolRef}:{}) });
  } else {
    if (!lease || lease.state === 'released') throw new Conflict('No active coordination lease');
    if(lease.poolRef&&(command.type==='recover'||command.type==='heartbeat')){
      const pool=state.personaPools!.find(p=>sameRef(p.ref,lease.poolRef!))!;
      if(command.ttlMs>pool.maxLeaseMs)throw new Conflict('Persona pool lease limit exceeded');
      if(command.type==='recover'&&state.leases.filter(l=>l!==lease&&l.state!=='released'&&l.workerId===command.workerId&&l.poolRef&&sameRef(l.poolRef,pool.ref)).length>=pool.maxPerWorker)
        throw new Conflict('Persona pool recovery worker capacity exceeded');
    }
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

/** Owner-side pure transition only. Workers cannot configure membership through commitCoordination. */
export function transitionPersonaPools(raw:unknown,scopeId:string,expectedVersion:number,input:unknown):CoordinationSnapshot {
  const state=CoordinationSnapshotSchema.parse(raw);
  if(state.scopeId!==scopeId||state.version!==expectedVersion||state.version===Number.MAX_SAFE_INTEGER)throw new Conflict('Coordination scope or version changed');
  if(state.leases.some(l=>l.state!=='released'))throw new Conflict('Persona pool configuration requires every lease to be independently released');
  const pools=z.array(PersonaPoolDefinition).max(100).parse(input);
  return CoordinationSnapshotSchema.parse({...state,version:state.version+1,personaPools:pools});
}

/** Recorded operator view only. No broker access, clock validation, credential issuance or reservation occurs. */
export function inspectPersonaPools(raw:unknown):PersonaPoolStatus {
  const state=CoordinationSnapshotSchema.parse(raw),reserved=state.leases.reduce((sum,l)=>sum+BigInt(l.reservedCents),0n);
  const report=PersonaPoolStatus.parse({schemaVersion:'tracegrove.persona-pool-status/v1',scopeId:state.scopeId,coordinationVersion:state.version,
    basis:'supplied_snapshot',authority:'none',leaseTime:'not_evaluated',budgetCents:state.budgetCents,reservedCents:Number(reserved),
    remainingReservationCents:Number(BigInt(state.budgetCents)-reserved),pools:personaPoolAvailability(state)});
  if(Buffer.byteLength(JSON.stringify(report))>4*1024*1024)throw new Conflict('Persona pool status exceeds the byte bound');
  return report;
}

export { PersonaPoolDefinition, ReservePersonaPool, PersonaPoolStatus };
