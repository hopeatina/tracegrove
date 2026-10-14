import { CleanupExpectationSchema, WorkflowOwnershipSchema, type CleanupExpectation } from '../protocol/schemas/cleanup.ts';
import { CoordinationSnapshotSchema } from './coordination.ts';
import { Conflict } from './errors.ts';

/** Derive from the protected ledger head. This helper does not establish the caller's authority. */
export function deriveCleanupExpectation(snapshotRaw: unknown, attemptId: string,
  ownershipRaw: unknown, ledgerHeadDigest: string): CleanupExpectation {
  const snapshot = CoordinationSnapshotSchema.parse(snapshotRaw);
  const lease = snapshot.leases.find(item => item.attemptId === attemptId);
  if (!lease || lease.state === 'released') throw new Conflict('Cleanup requires an unreleased attempt');
  if (!ownershipRaw) throw new Conflict('Host ownership inventory is unresolved');
  const ownership = WorkflowOwnershipSchema.parse(ownershipRaw);
  const resolved = new Set(ownership.effects.map(effect => effect.effectId));
  if ([...resolved].some(id => !lease.effectIds.includes(id))) throw new Conflict('Ownership contains an effect outside the admitted attempt');
  return CleanupExpectationSchema.parse({
    schemaVersion: 'workflow.cleanup-expectation/v1', scopeId: snapshot.scopeId, attemptId,
    workerId: lease.workerId, generation: lease.generation, coordinationVersion: snapshot.version,
    effectIds: lease.effectIds, unresolvedEffectIds: lease.effectIds.filter(id => !resolved.has(id)),
    ownershipLedgerHeadDigest: ledgerHeadDigest,
    resources: [...ownership.hostResources, ...ownership.effects.flatMap(effect => effect.resources)],
  });
}
