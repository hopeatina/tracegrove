import { z } from 'zod';
import { RefSchema, ScopeSchema, IdString } from '../primitives.ts';
import { CoordinationKey as Key, CoordinationCounter as Counter, CoordinationLeaseDuration as Duration } from './coordinationPrimitives.ts';

/** Owner-admitted membership. A frozen document or resource ID is not a credential or access grant. */
export const PersonaPoolDefinition=z.object({schemaVersion:z.literal('workflow.persona-pool/v1'),ref:RefSchema,scope:ScopeSchema,
  coordinationScopeId:Key,personaRef:RefSchema,environmentRef:RefSchema,memberIds:z.array(IdString).min(1).max(1000),
  maxConcurrent:z.number().int().min(1).max(1000),maxPerWorker:z.number().int().min(1).max(1000),
  maxLeaseMs:Duration,reservationCeilingCents:Counter.positive(),selection:z.literal('least_used_available'),
}).strict().superRefine((pool,ctx)=>{
  if(new Set(pool.memberIds).size!==pool.memberIds.length||pool.maxConcurrent>pool.memberIds.length||pool.maxPerWorker>pool.maxConcurrent)
    ctx.addIssue({code:'custom',message:'Pool membership or capacity is inconsistent'});
});
export type PersonaPoolDefinition=z.infer<typeof PersonaPoolDefinition>;
export const ReservePersonaPool=z.object({type:z.literal('reserve_pool'),attemptId:Key,workerId:Key,poolRef:RefSchema,
  personaRef:RefSchema,environmentRef:RefSchema,reservedCents:Counter.positive(),ttlMs:Duration}).strict();
export type ReservePersonaPool=z.infer<typeof ReservePersonaPool>;
export const PersonaPoolStatus=z.object({schemaVersion:z.literal('tracegrove.persona-pool-status/v1'),scopeId:Key,coordinationVersion:Counter,
  basis:z.literal('supplied_snapshot'),authority:z.literal('none'),leaseTime:z.literal('not_evaluated'),
  budgetCents:Counter,reservedCents:Counter,remainingReservationCents:Counter,
  pools:z.array(z.object({poolRef:RefSchema,personaRef:RefSchema,environmentRef:RefSchema,maxConcurrent:Counter,maxPerWorker:Counter,
    unreleased:Counter,members:z.array(z.object({personaId:IdString,state:z.enum(['unreleased_in_snapshot','available_in_snapshot'])}).strict()).max(1000),
  }).strict()).max(100)}).strict();
export type PersonaPoolStatus=z.infer<typeof PersonaPoolStatus>;
