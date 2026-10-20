import { refKey, sameRef, verifySelfDigest } from '../protocol/canonical.ts';
import type { Ref } from '../protocol/primitives.ts';
import type { PersonaPoolDefinition, ReservePersonaPool } from '../protocol/schemas/personaPool.ts';
import { Conflict } from './errors.ts';

type PoolLease={personaId:string;workerId:string;state:'active'|'reconciling'|'released';poolRef?:Ref|undefined};
export type PersonaPoolSnapshot={scopeId:string;personaPools?:PersonaPoolDefinition[]|undefined;leases:PoolLease[]};

/** Snapshot invariants supplement, rather than replace, the coordinator's budget/fence checks. */
export function personaPoolProblems(snapshot:PersonaPoolSnapshot):string[]{
  const problems:string[]=[],pools=snapshot.personaPools??[],ids=new Set<string>(),members=new Set<string>();
  for(const pool of pools){
    if(ids.has(pool.ref.id)||pool.coordinationScopeId!==snapshot.scopeId||!verifySelfDigest(pool))problems.push('Pool identity, scope or digest is invalid');
    ids.add(pool.ref.id);
    for(const member of pool.memberIds){if(members.has(member))problems.push('A persona belongs to multiple pools');members.add(member)}
  }
  for(const lease of snapshot.leases.filter(l=>l.state!=='released')){
    if(lease.poolRef){const pool=pools.find(p=>sameRef(p.ref,lease.poolRef!));
      if(!pool||!pool.memberIds.includes(lease.personaId))problems.push('Unreleased lease differs from its admitted pool');
    }else if(members.has(lease.personaId))problems.push('Pooled persona cannot have an ordinary unreleased lease');
  }
  for(const pool of pools){
    const active=snapshot.leases.filter(l=>l.state!=='released'&&l.poolRef&&sameRef(l.poolRef,pool.ref));
    if(active.length>pool.maxConcurrent)problems.push('Pool concurrent capacity exceeded');
    const counts=new Map<string,number>();for(const lease of active)counts.set(lease.workerId,(counts.get(lease.workerId)??0)+1);
    if([...counts.values()].some(n=>n>pool.maxPerWorker))problems.push('Pool worker capacity exceeded');
  }
  return problems;
}

/** Pure selection only. The atomic owner must recheck this under its own policy, clock and admission lock. */
export function choosePersonaPoolMember(snapshot:PersonaPoolSnapshot,input:ReservePersonaPool):{personaId:string;poolRef:Ref}{
  const pool=snapshot.personaPools?.find(p=>sameRef(p.ref,input.poolRef));
  if(!pool)throw new Conflict('Persona pool is unavailable or its revision changed');
  if(!sameRef(pool.personaRef,input.personaRef)||!sameRef(pool.environmentRef,input.environmentRef))throw new Conflict('Persona pool does not match the frozen persona/environment');
  if(input.ttlMs>pool.maxLeaseMs||input.reservedCents>pool.reservationCeilingCents)throw new Conflict('Persona pool lease or reservation limit exceeded');
  const active=snapshot.leases.filter(l=>l.state!=='released'&&l.poolRef&&sameRef(l.poolRef,pool.ref));
  if(active.length>=pool.maxConcurrent||active.filter(l=>l.workerId===input.workerId).length>=pool.maxPerWorker)throw new Conflict('Persona pool capacity is occupied; cleanup is required before reuse');
  const occupied=new Set(snapshot.leases.filter(l=>l.state!=='released').map(l=>l.personaId));
  const uses=new Map(pool.memberIds.map(id=>[id,0]));for(const lease of snapshot.leases)if(uses.has(lease.personaId))uses.set(lease.personaId,uses.get(lease.personaId)!+1);
  const candidates=pool.memberIds.filter(id=>!occupied.has(id)).sort((a,b)=>uses.get(a)!-uses.get(b)!||(a<b?-1:a>b?1:0));
  if(!candidates.length)throw new Conflict('Persona pool has no reconciled available member');
  return {personaId:candidates[0]!,poolRef:structuredClone(pool.ref)};
}

/** Operator-facing recorded availability, never a live credential lease or successful application response. */
export function personaPoolAvailability(snapshot:PersonaPoolSnapshot){
  return (snapshot.personaPools??[]).map(pool=>({poolRef:pool.ref,personaRef:pool.personaRef,environmentRef:pool.environmentRef,
    maxConcurrent:pool.maxConcurrent,maxPerWorker:pool.maxPerWorker,
    unreleased:snapshot.leases.filter(l=>l.state!=='released'&&l.poolRef&&refKey(l.poolRef)===refKey(pool.ref)).length,
    members:pool.memberIds.map(personaId=>({personaId,state:snapshot.leases.some(l=>l.state!=='released'&&l.personaId===personaId)?'unreleased_in_snapshot' as const:'available_in_snapshot' as const}))}));
}
