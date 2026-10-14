import { describe, expect, it } from 'vitest';
import { deriveCleanupExpectation } from '../src/core/ownership.ts';
import type { CoordinationSnapshot } from '../src/core/coordination.ts';

const digest = 'sha256:' + 'a'.repeat(64);
const snapshot: CoordinationSnapshot = { scopeId: 'workspace', version: 5, generation: 1, budgetCents: 500,
  leases: [{ attemptId: 'attempt', workerId: 'worker', personaId: 'persona', generation: 1, expiresAt: 1000,
    reservedCents: 300, state: 'active', effectIds: ['create:1', 'uncertain:2'], cleanupProof: null }] };
const ownership = { hostReceiptDigest: digest,
  hostResources: [{ entityKey: 'host', physicalId: 'host-id', boundaryId: 'host', check: 'host_stop' }],
  effects: [{ effectId: 'create:1', receiptDigest: digest,
    resources: [{ entityKey: 'fixture', physicalId: 'fixture-id', boundaryId: 'api', check: 'http_absence' }] }] };

describe('cleanup expectation from protected ledger state', () => {
  it('retains unresolved admitted effects and binds every resource to the ledger head', () => {
    expect(deriveCleanupExpectation(snapshot, 'attempt', ownership, digest)).toEqual({
      schemaVersion: 'workflow.cleanup-expectation/v1', scopeId: 'workspace', attemptId: 'attempt', workerId: 'worker',
      generation: 1, coordinationVersion: 5, ownershipLedgerHeadDigest: digest,
      effectIds: ['create:1', 'uncertain:2'], unresolvedEffectIds: ['uncertain:2'],
      resources: [...ownership.hostResources, ...ownership.effects[0]!.resources],
    });
  });
  it('refuses missing host inventory, unknown attempts and released attempts', () => {
    expect(() => deriveCleanupExpectation(snapshot, 'attempt', null, digest)).toThrow(/inventory/);
    expect(() => deriveCleanupExpectation(snapshot, 'different', ownership, digest)).toThrow(/unreleased/);
    expect(() => deriveCleanupExpectation({ ...snapshot, leases: [{ ...snapshot.leases[0]!, state: 'released', cleanupProof: digest }] }, 'attempt', ownership, digest)).toThrow(/unreleased/);
  });
  it('refuses extra effects, duplicate resource identities and fabricated host/application kinds', () => {
    expect(() => deriveCleanupExpectation(snapshot, 'attempt', { ...ownership,
      effects: [{ ...ownership.effects[0]!, effectId: 'outside-attempt' }] }, digest)).toThrow(/outside/);
    expect(() => deriveCleanupExpectation(snapshot, 'attempt', { ...ownership,
      effects: [{ ...ownership.effects[0]!, resources: [{ ...ownership.effects[0]!.resources[0]!, entityKey: 'host' }] }] }, digest)).toThrow();
    expect(() => deriveCleanupExpectation(snapshot, 'attempt', { ...ownership,
      hostResources: [{ ...ownership.hostResources[0]!, check: 'http_absence' }] }, digest)).toThrow();
  });
  it('derives takeover bindings from the current lease while retaining prior owned resources', () => {
    const recovered = { ...snapshot, version: 7, generation: 2,
      leases: [{ ...snapshot.leases[0]!, workerId: 'recovery-worker', generation: 2, state: 'reconciling' }] };
    expect(deriveCleanupExpectation(recovered, 'attempt', ownership, digest)).toMatchObject({
      workerId: 'recovery-worker', generation: 2, coordinationVersion: 7,
      unresolvedEffectIds: ['uncertain:2'], resources: [...ownership.hostResources, ...ownership.effects[0]!.resources],
    });
  });
});
