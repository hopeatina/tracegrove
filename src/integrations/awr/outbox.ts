import { canonicalizeAgentWorkJson, verifyAgentWorkReceiptIntegrity } from '@useorgx/agent-work-receipt';
import { LocalLedger } from '../../core/ledger.ts';
import { LocalDeliveryJournal } from '../../core/deliveryJournal.ts';
import { LocalResultSink } from '../../core/resultSink.ts';
import { Conflict } from '../../core/errors.ts';
import { nowIso } from '../../core/clock.ts';
import { ScopeSchema, digestOfValue, freeze, sameDigest, sameRef, sameScope, type Scope } from '../../protocol/index.ts';
import { AwrAcknowledgement, AwrDestination, PreparedAwrDelivery, checkedAwrDocument } from './contracts.ts';
import { projectAwr } from './projection.ts';

export interface AwrDeliveryAuthority { authorize(scope: Scope, destination: AwrDestination, action: 'prepare' | 'read' | 'deliver'): Promise<void> }
export interface AwrTransport { import(delivery: PreparedAwrDelivery): Promise<unknown> }
export type AwrDeliveryState = { prepared: PreparedAwrDelivery; attempts: number; status: 'prepared' | 'acknowledgement_unknown' | 'imported_unverified'; acknowledgement: AwrAcknowledgement | null };
const identity = (scope: Scope, resultId: string) => `awr-delivery-${digestOfValue({ scope, resultId }).hex}`;

/** Durable immutable intent plus idempotent network reconciliation. Never invokes execution. */
export class LocalAwrOutbox {
  private readonly scope: Scope;
  private readonly journal: LocalDeliveryJournal<PreparedAwrDelivery, AwrAcknowledgement>;
  constructor(ledger: LocalLedger, private readonly sink: LocalResultSink, scope: Scope, private readonly authority: AwrDeliveryAuthority) {
    this.scope = ScopeSchema.parse(scope);
    this.journal = new LocalDeliveryJournal(ledger, this.scope,
      { prepared: 'workflow.awr.prepared', attempted: 'workflow.awr.attempted', acknowledged: 'workflow.awr.imported' }, {
        prepared: raw => { const intent = PreparedAwrDelivery.parse(raw); checkedAwrDocument(intent.receipt); return intent; },
        acknowledgement: raw => AwrAcknowledgement.parse(raw),
        checkAcknowledgement: (prepared, ack) => { if (ack.external_receipt_id !== prepared.receipt.receipt_id) throw new Conflict('Delivery response belongs to another receipt'); },
      });
  }
  private load(resultId: string): AwrDeliveryState | null {
    const state = this.journal.read(identity(this.scope, resultId)); if (!state) return null;
    const { prepared, attempts, acknowledgement } = state;
    if (prepared.resultRef.id !== resultId) throw new Conflict('Delivery intent refers to another retained result');
    return { prepared, attempts, acknowledgement, status: acknowledgement ? 'imported_unverified' : attempts ? 'acknowledgement_unknown' : 'prepared' };
  }
  async prepare(resultId: string, destination: AwrDestination): Promise<AwrDeliveryState> {
    destination = AwrDestination.parse(destination);
    await this.authority.authorize(structuredClone(this.scope), structuredClone(destination), 'prepare');
    const result = await this.sink.get(resultId); const existing = this.load(resultId);
    if (!sameScope(result.receipt.scope, this.scope)) throw new Conflict('Retained result belongs to another delivery scope');
    if (existing) {
      if (!sameDigest(digestOfValue(existing.prepared.destination), digestOfValue(destination))) throw new Conflict('Result delivery is already bound to another destination');
      return existing;
    }
    const preparedAt = nowIso(); const receipt = await projectAwr(result, preparedAt);
    const prepared = PreparedAwrDelivery.parse(freeze({ schemaVersion: 'workflow.awr-delivery/v1' as const,
      ref: { id: identity(this.scope, resultId), revision: '1' }, scope: this.scope, resultRef: result.receipt.ref,
      destination, receipt, preparedAt, idempotencyKey: `tracegrove-awr-${digestOfValue({ receipt: canonicalizeAgentWorkJson(receipt), destination }).hex}` }));
    await this.authority.authorize(structuredClone(this.scope), structuredClone(destination), 'prepare');
    if (this.load(resultId)) return this.prepare(resultId, destination);
    this.journal.prepare(prepared);
    return this.load(resultId)!;
  }
  async inspect(resultId: string): Promise<AwrDeliveryState> {
    const state = this.load(resultId); if (!state) throw new Conflict('No prepared delivery for this result');
    await this.authority.authorize(structuredClone(this.scope), structuredClone(state.prepared.destination), 'read');
    return state;
  }
  async deliver(resultId: string, transport: AwrTransport): Promise<AwrDeliveryState> {
    return this.journal.whileIdle(identity(this.scope, resultId), async () => {
      let state = await this.inspect(resultId);
      await this.authority.authorize(structuredClone(this.scope), structuredClone(state.prepared.destination), 'deliver');
      if (state.acknowledgement) return state;
      const result = await this.sink.get(resultId);
      if (!sameScope(result.receipt.scope, this.scope) || !sameRef(result.receipt.ref, state.prepared.resultRef)) throw new Conflict('Retained result differs from the frozen delivery');
      const integrity = await verifyAgentWorkReceiptIntegrity(state.prepared.receipt);
      if (integrity.content_hash.state !== 'verified') throw new Conflict('Prepared AWR content hash differs');
      await this.authority.authorize(structuredClone(this.scope), structuredClone(state.prepared.destination), 'deliver');
      state = this.load(resultId)!;
      const attempt = this.journal.attempt(state.prepared.ref.id);
      const acknowledgement = await transport.import(structuredClone(state.prepared));
      this.journal.acknowledge(state.prepared.ref.id, attempt.version, acknowledgement);
      return this.load(resultId)!;
    });
  }
}
