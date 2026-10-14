import { describe, expect, it } from 'vitest';
import { commitCoordination, transitionCoordination, type CoordinationCommand, type CoordinationSnapshot, type CoordinationStore } from '../src/core/coordination.ts';

const initial = (): CoordinationSnapshot => ({ scopeId: 'workspace:test', version: 0, generation: 0, budgetCents: 500, leases: [] });
const reserve = (attemptId = 'attempt:1', personaId = 'persona:1'): CoordinationCommand => ({ type: 'reserve', attemptId, personaId, workerId: 'worker:1', reservedCents: 300, ttlMs: 100 });
const step = (state: CoordinationSnapshot, command: CoordinationCommand, now = 10) => transitionCoordination(state, state.scopeId, state.version, command, now);
const fence = { attemptId: 'attempt:1', workerId: 'worker:1', generation: 1 };

describe('shared coordination domain', () => {
  it('reserves budget and persona together without mutating the input', () => {
    const before = initial(); const after = step(before, reserve());
    expect(before.leases).toEqual([]);
    expect(after.leases[0]).toMatchObject({ personaId: 'persona:1', reservedCents: 300, generation: 1 });
    expect(() => step(after, reserve('attempt:2', 'persona:2'))).toThrow('budget');
    expect(() => step(after, reserve('attempt:2'))).toThrow('Persona');
    expect(() => step(after, reserve())).toThrow('already reserved');
  });
  it('keeps expired personas quarantined and fences old workers after takeover', () => {
    const active = step(initial(), reserve());
    expect(() => step(active, reserve('attempt:2'), 111)).toThrow('Persona');
    expect(() => step(active, { type: 'recover', attemptId: 'attempt:1', workerId: 'worker:2', ttlMs: 100 }, 109)).toThrow('not expired');
    const recovered = step(active, { type: 'recover', attemptId: 'attempt:1', workerId: 'worker:2', ttlMs: 100 }, 110);
    expect(recovered.leases[0]).toMatchObject({ generation: 2, state: 'reconciling', reservedCents: 300 });
    expect(() => step(recovered, { type: 'effect', ...fence, effectId: 'write:1' }, 111)).toThrow('Stale');
    expect(() => step(recovered, { type: 'effect', ...fence, workerId: 'worker:2', generation: 2, effectId: 'write:1' }, 111)).toThrow('cannot admit');
  });
  it('leases reconciliation to one worker and permits renewal without admitting effects', () => {
    const active = step(initial(), reserve());
    const recovery = { type: 'recover' as const, attemptId: 'attempt:1', workerId: 'worker:2', ttlMs: 100 };
    const recovered = step(active, recovery, 110);
    const current = { attemptId: 'attempt:1', workerId: 'worker:2', generation: 2 };
    expect(recovered.leases[0]?.expiresAt).toBe(210);
    expect(() => step(recovered, { ...recovery, workerId: 'worker:3' }, 111)).toThrow('not expired');
    const renewed = step(recovered, { type: 'heartbeat', ...current, ttlMs: 100 }, 200);
    expect(renewed.leases[0]).toMatchObject({ expiresAt: 300, state: 'reconciling', effectIds: [] });
    expect(() => step(renewed, { type: 'effect', ...current, effectId: 'new-effect' }, 201)).toThrow('cannot admit');
    expect(() => step(renewed, { type: 'heartbeat', ...current, ttlMs: 100 }, 300)).toThrow('expired');
    expect(() => step(renewed, { type: 'release', ...current, cleanupProof: 'cleanup:verified' }, 300)).toThrow('expired');
    const restarted = step(JSON.parse(JSON.stringify(renewed)), { ...recovery, workerId: 'worker:3' }, 300);
    expect(restarted.leases[0]).toMatchObject({ generation: 3, workerId: 'worker:3', expiresAt: 400, reservedCents: 300 });
    expect(() => step(restarted, { type: 'release', ...current, cleanupProof: 'cleanup:verified' }, 301)).toThrow('Stale');
    const released = step(restarted, { type: 'release', attemptId: 'attempt:1', workerId: 'worker:3', generation: 3, cleanupProof: 'cleanup:verified' }, 301);
    expect(released.leases[0]?.state).toBe('released');
  });
  it('never refunds uncertain spend and never reissues admitted effects on restart', () => {
    const active = step(initial(), reserve());
    const effect = step(active, { type: 'effect', ...fence, effectId: 'provider:write:1' });
    const restarted = JSON.parse(JSON.stringify(effect));
    expect(() => step(restarted, { type: 'effect', ...fence, effectId: 'provider:write:1' })).toThrow('already admitted');
    const released = step(effect, { type: 'release', ...fence, cleanupProof: 'sha256:cleanup:1' });
    expect(() => step(released, reserve('attempt:2', 'persona:2'))).toThrow('budget');
    const next = step(released, { type: 'reserve', attemptId: 'attempt:2', personaId: 'persona:1', workerId: 'worker:2', reservedCents: 200, ttlMs: 100 });
    expect(next.generation).toBe(2);
  });
  it('rejects scope substitution, stale versions and corrupted persisted history', () => {
    expect(() => transitionCoordination(initial(), 'other', 0, reserve(), 10)).toThrow('scope');
    expect(() => transitionCoordination(initial(), 'workspace:test', 1, reserve(), 10)).toThrow('version');
    const state = step(initial(), reserve());
    expect(() => step({ ...state, leases: [...state.leases, ...state.leases] }, reserve('attempt:2'))).toThrow();
    expect(() => step(state, { type: 'heartbeat', ...fence, ttlMs: 100 }, 110)).toThrow('expired');
  });
  it('makes only one concurrent admission win a shared atomic CAS', async () => {
    let persisted = initial(); let reads = 0; let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const store: CoordinationStore = {
      async read() { const snapshot = structuredClone(persisted); if (++reads === 2) release(); await barrier; return { snapshot, observedAt: 10 }; },
      async compareAndSwap(scope, version, next) {
        if (scope !== persisted.scopeId || version !== persisted.version) return false;
        persisted = structuredClone(next); return true;
      },
    };
    const results = await Promise.allSettled([commitCoordination(store, persisted.scopeId, reserve()), commitCoordination(store, persisted.scopeId, reserve('attempt:2', 'persona:2'))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(persisted.leases).toHaveLength(1);
    expect(persisted.leases[0]?.reservedCents).toBe(300);
  });
  it('does not let an ordinary caller claim cleanup through the commit port', async () => {
    const store: CoordinationStore = { read: async () => ({ snapshot: initial(), observedAt: 10 }), compareAndSwap: async () => true };
    await expect(commitCoordination(store, 'workspace:test', { type: 'release', ...fence, cleanupProof: 'invented' })).rejects.toThrow('independent cleanup');
  });
});
