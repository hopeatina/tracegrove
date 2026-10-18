import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freeze, type Ref } from '../src/protocol/index.ts';
import { PersonaPoolDefinition, type ReservePersonaPool } from '../src/protocol/schemas/personaPool.ts';
import { CoordinationSnapshotSchema, transitionCoordination, transitionPersonaPools, inspectPersonaPools, commitCoordination,
  type CoordinationSnapshot, type CoordinationCommand, type CoordinationStore } from '../src/core/coordination.ts';
import { runCli } from './fixtures/cli.ts';

const ref=(id:string)=>freeze({ref:{id,revision:'1'},value:id}).ref as Ref;
const scope={ownerId:'pool-owner',tenantId:'workspace:test',visibility:'owner_private' as const};
const pool=(overrides:Partial<PersonaPoolDefinition>={})=>PersonaPoolDefinition.parse(freeze({schemaVersion:'workflow.persona-pool/v1',
  ref:{id:'pool:test',revision:'1'},scope,coordinationScopeId:'workspace:test',personaRef:ref('persona:owner'),environmentRef:ref('environment:staging'),
  memberIds:['member:c','member:a','member:b'],maxConcurrent:2,maxPerWorker:1,maxLeaseMs:1000,reservationCeilingCents:100,selection:'least_used_available',...overrides}));
const initial=():CoordinationSnapshot=>transitionPersonaPools({scopeId:'workspace:test',version:1,generation:0,budgetCents:500,leases:[]},'workspace:test',1,[pool()]);
const reserve=(attemptId='attempt:1',workerId='worker:1'):ReservePersonaPool=>({type:'reserve_pool',attemptId,workerId,poolRef:pool().ref,
  personaRef:pool().personaRef,environmentRef:pool().environmentRef,reservedCents:100,ttlMs:1000});
const step=(state:CoordinationSnapshot,command:CoordinationCommand,at=10)=>transitionCoordination(state,state.scopeId,state.version,command,at);
const release=(state:CoordinationSnapshot,index=0,at=11)=>{const l=state.leases[index]!;return step(state,{type:'release',attemptId:l.attemptId,workerId:l.workerId,generation:l.generation,cleanupProof:'independently-admitted'},at)};

it('binds frozen membership/persona/environment and chooses least-used available members deterministically',()=>{
  const before=initial(),a=step(before,reserve());expect(before.leases).toEqual([]);expect(a.leases[0]).toMatchObject({personaId:'member:a',poolRef:pool().ref,reservedCents:100});
  const b=step(release(a),reserve('attempt:2'));expect(b.leases[1]!.personaId).toBe('member:b');
  const c=step(release(b,1),reserve('attempt:3'));expect(c.leases[2]!.personaId).toBe('member:c');
  const reused=step(release(c,2),reserve('attempt:4'));expect(reused.leases[3]!.personaId).toBe('member:a');
  expect(reused.leases.reduce((n,l)=>n+l.reservedCents,0)).toBe(400);
  expect(()=>step(reused,{...reserve('attempt:5','worker:2'),reservedCents:101})).toThrow(/reservation limit/);
});

it('retains expired/reconciling members in pool and worker caps until independent release',()=>{
  const a=step(initial(),reserve()),b=step(a,reserve('attempt:2','worker:2'));
  expect(()=>step(a,reserve('attempt:2'))).toThrow(/capacity/);
  expect(()=>step(b,reserve('attempt:3','worker:3'),1010)).toThrow(/capacity/);
  const recovered=step(b,{type:'recover',attemptId:'attempt:1',workerId:'worker:3',ttlMs:1000},1010);
  expect(recovered.leases[0]).toMatchObject({state:'reconciling',poolRef:pool().ref});
  expect(()=>step(recovered,reserve('attempt:3','worker:4'),1011)).toThrow(/capacity/);
  expect(()=>step(recovered,{type:'effect',attemptId:'attempt:1',workerId:'worker:3',generation:3,effectId:'unsafe'},1011)).toThrow(/cannot admit/);
  const next=step(release(recovered,0,1011),reserve('attempt:3','worker:4'),1012);expect(next.leases[2]!.personaId).toBe('member:c');
});

it('refuses ordinary admission bypass, substituted bindings, broad lease renewal and worker recovery overflow',()=>{
  expect(()=>step(initial(),{type:'reserve',attemptId:'bypass',workerId:'worker:1',personaId:'member:a',reservedCents:100,ttlMs:100})).toThrow(/pool admission/);
  for(const changed of [{personaRef:ref('other')},{environmentRef:ref('other')},{poolRef:ref('other')},{ttlMs:1001}])expect(()=>step(initial(),{...reserve(),...changed})).toThrow();
  const active=step(initial(),reserve());expect(()=>step(active,{type:'heartbeat',attemptId:'attempt:1',workerId:'worker:1',generation:1,ttlMs:1001})).toThrow(/lease limit/);
  const two=step(active,reserve('attempt:2','worker:2'));
  expect(()=>step(two,{type:'recover',attemptId:'attempt:1',workerId:'worker:2',ttlMs:1000},1010)).toThrow(/recovery worker capacity/);
  expect(()=>step(two,{type:'recover',attemptId:'attempt:1',workerId:'worker:3',ttlMs:1001},1010)).toThrow(/lease limit/);
});

it('requires quiescent owner configuration and rejects overlaps, corruption, wrong scope and impossible capacities',()=>{
  const active=step(initial(),reserve());expect(()=>transitionPersonaPools(active,active.scopeId,active.version,[])).toThrow(/independently released/);
  expect(()=>transitionPersonaPools(initial(),'other',2,[])).toThrow(/scope or version/);
  for(const value of [pool({coordinationScopeId:'other'}),{...pool(),memberIds:['edited']},pool({ref:ref('pool:other'),memberIds:['member:a'] ,maxConcurrent:1})]){
    expect(()=>transitionPersonaPools(initial(),'workspace:test',2,[pool(),value])).toThrow();
  }
  expect(()=>pool({maxConcurrent:4})).toThrow();expect(()=>pool({maxPerWorker:3})).toThrow();expect(()=>pool({memberIds:['duplicate','duplicate']})).toThrow();
  const released=release(active),cleared=transitionPersonaPools(released,released.scopeId,released.version,[]);
  expect(cleared.leases[0]!.poolRef).toEqual(pool().ref);expect(cleared.personaPools).toEqual([]);
  expect(()=>CoordinationSnapshotSchema.parse({...active,personaPools:[]})).toThrow();
});

it('preserves old snapshots/vectors and exposes recorded availability without evaluating a live clock',()=>{
  const legacy={scopeId:'legacy',version:0,generation:0,budgetCents:500,leases:[]};expect(CoordinationSnapshotSchema.parse(legacy)).toEqual(legacy);
  const a=step(initial(),reserve()),report=inspectPersonaPools(a);expect(report).toMatchObject({basis:'supplied_snapshot',authority:'none',leaseTime:'not_evaluated',reservedCents:100,remainingReservationCents:400});
  expect(report.pools[0]!.members.find(m=>m.personaId==='member:a')?.state).toBe('unreleased_in_snapshot');
  report.pools[0]!.members.length=0;expect(inspectPersonaPools(a).pools[0]!.members).toHaveLength(3);
});

it('admits only one competing worker against one atomic snapshot version and never lets a client self-release',async()=>{
  let state=initial(),reads=0;let open!:()=>void;const gate=new Promise<void>(r=>open=r);
  const store:CoordinationStore={read:async()=>{const snapshot=structuredClone(state);if(++reads===2)open();await gate;return {snapshot,observedAt:10}},
    compareAndSwap:async(scope,version,next)=>{if(scope!==state.scopeId||version!==state.version)return false;state=structuredClone(next);return true}};
  const result=await Promise.allSettled([commitCoordination(store,state.scopeId,reserve()),commitCoordination(store,state.scopeId,reserve('attempt:2','worker:2'))]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(state.leases).toHaveLength(1);
  const l=state.leases[0]!;await expect(commitCoordination(store,state.scopeId,{type:'release',attemptId:l.attemptId,workerId:l.workerId,generation:l.generation,cleanupProof:'invented'})).rejects.toThrow(/independent cleanup/);
});

it('inspects supplied snapshot files with the CLI without changing their bytes or reserving a persona',()=>{
  mkdirSync(resolve('artifacts/qa'),{recursive:true});const root=mkdtempSync(resolve('artifacts/qa/persona-pools-')),file=join(root,'snapshot.json'),before=JSON.stringify(initial());writeFileSync(file,before);
  const json=runCli(['pools','--snapshot',file]);expect(json.status,json.stderr).toBe(0);expect(JSON.parse(json.stdout).authority).toBe('none');
  const prose=runCli(['pools','--snapshot',file],false);expect(prose.status).toBe(0);expect(prose.stdout).toContain('lease time not evaluated');
  const missing=runCli(['pools','--snapshot',file,'--pool','other']);expect(JSON.parse(missing.stdout).pools).toEqual([]);
  expect(readFileSync(file,'utf8')).toBe(before);expect(runCli(['pools','--snapshot',file,'--reserve']).status).toBe(2);
});
