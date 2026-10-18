import { z } from 'zod';
import { IsoDateTime, ScopeSchema, sameScope, verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import { LocalLedger } from './ledger.ts';
import { nowIso } from './clock.ts';

const Attempt = z.object({ attempt: z.number().int().positive().max(1000), startedAt: IsoDateTime }).strict();
const Accepted = z.object({ acknowledgement: z.unknown(), acknowledgedAt: IsoDateTime }).strict();
type Intent = { ref: Ref; scope: Scope };
export type DeliveryState<P, A extends object> = { prepared: P; attempts: number; acknowledgement: A | null; version: number };
export interface DeliveryCodec<P extends Intent, A extends object> {
  prepared(raw: unknown): P;
  acknowledgement(raw: unknown): A;
  checkAcknowledgement(prepared: P, acknowledgement: A): void;
}

/** Shared local outbox mechanics. Host-specific authorization remains outside this journal. */
export class LocalDeliveryJournal<P extends Intent, A extends object> {
  private readonly scope: Scope;
  private readonly inFlight = new Set<string>();
  constructor(private readonly ledger: LocalLedger, scope: Scope,
    private readonly events: { prepared: string; attempted: string; acknowledged: string }, private readonly codec: DeliveryCodec<P, A>) {
    this.scope = ScopeSchema.parse(scope);
  }
  read(id: string): DeliveryState<P, A> | null {
    const entries = this.ledger.history(id); if (!entries.length) return null;
    if (entries.length > 1002) throw new Conflict('Delivery history exceeds its bounded retry limit');
    const prepared = this.codec.prepared(entries[0]!.data);
    if (entries[0]!.type !== this.events.prepared || prepared.ref.id !== id || !sameScope(prepared.scope, this.scope) || !verifySelfDigest(prepared)) throw new Conflict('Delivery intent is inconsistent or foreign');
    let attempts = 0; let acknowledgement: A | null = null;
    for (const entry of entries.slice(1)) {
      if (acknowledgement !== null) throw new Conflict('Delivery history changed after acknowledgement');
      if (entry.type === this.events.attempted) {
        if (Attempt.parse(entry.data).attempt !== ++attempts) throw new Conflict('Delivery attempt sequence is inconsistent');
      } else if (entry.type === this.events.acknowledged && attempts > 0) {
        acknowledgement = this.codec.acknowledgement(Accepted.parse(entry.data).acknowledgement);
        this.codec.checkAcknowledgement(prepared, acknowledgement);
      } else throw new Conflict('Unexpected delivery journal entry');
    }
    return { prepared, attempts, acknowledgement, version: entries.length };
  }
  prepare(raw: P): DeliveryState<P, A> {
    const prepared = this.codec.prepared(raw);
    if (!sameScope(prepared.scope, this.scope) || !verifySelfDigest(prepared)) throw new Conflict('Invalid delivery intent');
    this.ledger.append(prepared.ref.id, 0, this.events.prepared, prepared);
    return this.read(prepared.ref.id)!;
  }
  attempt(id: string): DeliveryState<P, A> {
    const state = this.require(id);
    if (state.acknowledgement !== null || state.attempts >= 1000) throw new Conflict('Delivery is acknowledged or its retry limit was reached');
    this.ledger.append(id, state.version, this.events.attempted, Attempt.parse({ attempt: state.attempts + 1, startedAt: nowIso() }));
    return this.require(id);
  }
  acknowledge(id: string, expectedVersion: number, raw: unknown): DeliveryState<P, A> {
    const state = this.require(id); const acknowledgement = this.codec.acknowledgement(raw);
    if (!state.attempts || state.acknowledgement !== null) throw new Conflict('Delivery has no outstanding attempt');
    this.codec.checkAcknowledgement(state.prepared, acknowledgement);
    this.ledger.append(id, expectedVersion, this.events.acknowledged, { acknowledgement, acknowledgedAt: nowIso() });
    return this.require(id);
  }
  private require(id: string): DeliveryState<P, A> { const state = this.read(id); if (!state) throw new Conflict('No prepared delivery for this result'); return state; }
  async whileIdle<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(id)) throw new Conflict('Delivery is already in flight');
    this.inFlight.add(id); try { return await operation(); } finally { this.inFlight.delete(id); }
  }
}
