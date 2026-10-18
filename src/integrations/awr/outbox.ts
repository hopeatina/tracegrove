import { canonicalizeAgentWorkJson, verifyAgentWorkReceiptIntegrity } from '@useorgx/agent-work-receipt';
import { LocalLedger } from '../../core/ledger.ts';
import { LocalResultSink } from '../../core/resultSink.ts';
import { Conflict } from '../../core/errors.ts';
import { nowIso } from '../../core/clock.ts';
import { ScopeSchema, digestOfValue, freeze, sameDigest, sameRef, sameScope, verifySelfDigest, type Scope } from '../../protocol/index.ts';
import { AwrAcknowledgement, AwrDeliveryAccepted, AwrDeliveryAttempt, AwrDestination, PreparedAwrDelivery, checkedAwrDocument } from './contracts.ts';
import { projectAwr } from './projection.ts';

export interface AwrDeliveryAuthority { authorize(scope: Scope, destination: AwrDestination, action: 'prepare' | 'read' | 'deliver'): Promise<void> }
export interface AwrTransport { import(delivery: PreparedAwrDelivery): Promise<unknown> }
export type AwrDeliveryState = { prepared: PreparedAwrDelivery; attempts: number; status: 'prepared' | 'acknowledgement_unknown' | 'imported_unverified'; acknowledgement: AwrAcknowledgement | null };
const identity = (scope: Scope, resultId: string) => `awr-delivery-${digestOfValue({ scope, resultId }).hex}`;

/** Durable immutable intent plus idempotent network reconciliation. Never invokes execution. */
export class LocalAwrOutbox {
  private readonly inFlight = new Set<string>();
  private readonly scope: Scope;
  constructor(private readonly ledger: LocalLedger, private readonly sink: LocalResultSink, scope: Scope, private readonly authority: AwrDeliveryAuthority) { this.scope = ScopeSchema.parse(scope); }
  private load(resultId: string): AwrDeliveryState | null {
    const entries = this.ledger.history(identity(this.scope, resultId));
    if (!entries.length) return null;
    const prepared = PreparedAwrDelivery.parse(entries[0]!.data);
    if (entries[0]!.type !== 'workflow.awr.prepared' || prepared.ref.id !== identity(this.scope, resultId) || prepared.resultRef.id !== resultId ||
        !sameScope(prepared.scope, this.scope) || !verifySelfDigest(prepared)) throw new Conflict('Delivery intent is inconsistent or foreign');
    checkedAwrDocument(prepared.receipt);
    let attempts = 0; let acknowledgement: AwrAcknowledgement | null = null;
    for (const entry of entries.slice(1)) {
      if (acknowledgement) throw new Conflict('Delivery history changed after acknowledgement');
      if (entry.type === 'workflow.awr.attempted') {
        const attempt = AwrDeliveryAttempt.parse(entry.data); if (attempt.attempt !== ++attempts) throw new Conflict('Delivery attempt sequence is inconsistent');
      } else if (entry.type === 'workflow.awr.imported' && attempts > 0) {
        acknowledgement = AwrDeliveryAccepted.parse(entry.data).acknowledgement;
        if (acknowledgement.external_receipt_id !== prepared.receipt.receipt_id) throw new Conflict('Delivery acknowledgement refers to another receipt');
      } else throw new Conflict('Unexpected delivery journal entry');
    }
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
    this.ledger.append(prepared.ref.id, 0, 'workflow.awr.prepared', prepared);
    return this.load(resultId)!;
  }
  async inspect(resultId: string): Promise<AwrDeliveryState> {
    const state = this.load(resultId); if (!state) throw new Conflict('No prepared delivery for this result');
    await this.authority.authorize(structuredClone(this.scope), structuredClone(state.prepared.destination), 'read');
    return state;
  }
  async deliver(resultId: string, transport: AwrTransport): Promise<AwrDeliveryState> {
    if (this.inFlight.has(resultId)) throw new Conflict('Delivery is already in flight');
    this.inFlight.add(resultId);
    try {
      let state = await this.inspect(resultId);
      await this.authority.authorize(structuredClone(this.scope), structuredClone(state.prepared.destination), 'deliver');
      if (state.acknowledgement) return state;
      const result = await this.sink.get(resultId);
      if (!sameScope(result.receipt.scope, this.scope) || !sameRef(result.receipt.ref, state.prepared.resultRef)) throw new Conflict('Retained result differs from the frozen delivery');
      const integrity = await verifyAgentWorkReceiptIntegrity(state.prepared.receipt);
      if (integrity.content_hash.state !== 'verified') throw new Conflict('Prepared AWR content hash differs');
      await this.authority.authorize(structuredClone(this.scope), structuredClone(state.prepared.destination), 'deliver');
      state = this.load(resultId)!;
      if (state.attempts >= 1000) throw new Conflict('Delivery retry limit reached; evidence and intent remain retained');
      this.ledger.append(state.prepared.ref.id, 1 + state.attempts, 'workflow.awr.attempted', AwrDeliveryAttempt.parse({ attempt: state.attempts + 1, startedAt: nowIso() }));
      const acknowledgement = AwrAcknowledgement.parse(await transport.import(structuredClone(state.prepared)));
      if (acknowledgement.external_receipt_id !== state.prepared.receipt.receipt_id) throw new Conflict('Delivery response belongs to another receipt');
      this.ledger.append(state.prepared.ref.id, 2 + state.attempts, 'workflow.awr.imported', AwrDeliveryAccepted.parse({ acknowledgement, acknowledgedAt: nowIso() }));
      return this.load(resultId)!;
    } finally { this.inFlight.delete(resultId); }
  }
}
