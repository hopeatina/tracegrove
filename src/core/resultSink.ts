import { dirname, join } from 'node:path';
import { z } from 'zod';
import { DigestSchema, FidelityPlan, IdString, ResultIngestReceipt, ScopeSchema, digestOfValue, freeze, refKey, sameDigest, sameRef, sameScope, verifySelfDigest, type Digest, type Scope } from '../protocol/index.ts';
import { VerifiedBundleSnapshot, type BundleVerification, type VerifiedBundleRecords } from './bundle.ts';
import { LocalBundleArchive } from './bundleArchive.ts';
import { LocalLedger } from './ledger.ts';
import { Conflict } from './errors.ts';
import { nowIso } from './clock.ts';

const MAX_RESULTS = 10_000;
const Cursor = z.object({ scope: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().min(0).max(MAX_RESULTS), offset: z.number().int().min(0).max(MAX_RESULTS) }).strict();
function plannedLanes(records: VerifiedBundleRecords) {
  return [...new Set(FidelityPlan.parse(records.documents[refKey(records.request.fidelityPlanRef)]).cells.map(cell => cell.lane))].sort();
}
export type ResultSinkAuthority = { authorize(scope: Scope, action: 'ingest' | 'read'): Promise<void> };
export type RetainedResult = { receipt: ResultIngestReceipt; bundleDir: string; verification: BundleVerification & { ok: true } };
export type ResultPage = { records: ResultIngestReceipt[]; snapshotVersion: number; nextCursor: string | null; archiveStatus: 'not_checked' };
export type ResultIngestOptions = { expectedManifestDigest?: Digest };
export interface ResultSink {
  ingest(bundleDir: string, options?: ResultIngestOptions): Promise<RetainedResult & { replayed: boolean }>;
  get(id: string): Promise<RetainedResult>;
  list(options?: { cursor?: string; limit?: number }): Promise<ResultPage>;
}

/** Local retention boundary. Its authority port authorizes consumers, never authenticates producers. */
export class LocalResultSink implements ResultSink {
  private readonly scope: Scope;
  private readonly scopeKey: string;
  private readonly aggregateId: string;
  private readonly archive: LocalBundleArchive;
  constructor(private readonly ledger: LocalLedger, scope: Scope, private readonly authority: ResultSinkAuthority) {
    this.scope = ScopeSchema.parse(scope); this.scopeKey = digestOfValue(this.scope).hex;
    this.aggregateId = `result-sink:${this.scopeKey}`;
    this.archive = new LocalBundleArchive(join(dirname(ledger.dir), `result-objects-${this.scopeKey}`));
  }
  private history(): ResultIngestReceipt[] {
    const entries = this.ledger.history(this.aggregateId);
    if (entries.length > MAX_RESULTS) throw new Conflict('Result history requires an authoritative archival index; no entries were dropped');
    const ids = new Set<string>(); const campaigns = new Set<string>();
    return entries.map(entry => {
      const receipt = ResultIngestReceipt.parse(entry.data.receipt);
      if (entry.type !== 'workflow.result.accepted' || !verifySelfDigest(receipt) || !sameScope(receipt.scope, this.scope) || ids.has(receipt.ref.id) || campaigns.has(receipt.campaignId)) throw new Conflict('Result index is inconsistent or outside the selected scope');
      ids.add(receipt.ref.id); campaigns.add(receipt.campaignId); return receipt;
    });
  }
  private checked(receipt: ResultIngestReceipt, snapshot = this.archive.read(receipt.manifestDigest)): RetainedResult {
    const records = snapshot.records;
    if (!sameDigest(records.manifestDigest, receipt.manifestDigest) || !sameScope(records.request.requestedScope, this.scope) || records.campaign.campaignId !== receipt.campaignId || !sameRef(records.campaign.ref, receipt.campaignRef) ||
        !sameRef(records.request.ref, receipt.requestRef) || !sameRef(records.selection.ref, receipt.selectionRef) ||
        !sameRef(records.request.fidelityPlanRef, receipt.fidelityPlanRef) || !sameDigest(digestOfValue(plannedLanes(records)), digestOfValue(receipt.plannedLanes)) ||
        records.campaign.outcome !== receipt.retainedOutcome || records.receipts.length !== receipt.receiptCount) throw new Conflict('Retained bundle differs from its indexed receipt');
    return { receipt: structuredClone(receipt), bundleDir: this.archive.path(receipt.manifestDigest), verification: records.verification };
  }
  async ingest(bundleDir: string, options: ResultIngestOptions = {}): Promise<RetainedResult & { replayed: boolean }> {
    const expected = options.expectedManifestDigest === undefined ? null : DigestSchema.parse(options.expectedManifestDigest);
    await this.authority.authorize(structuredClone(this.scope), 'ingest');
    const snapshot = VerifiedBundleSnapshot.open(bundleDir); const records = snapshot.records;
    if (expected && !sameDigest(expected, snapshot.manifestDigest)) throw new Conflict('Bundle differs from the expected manifest digest');
    if (!sameScope(records.request.requestedScope, this.scope)) throw new Conflict('Bundle belongs to another result scope');
    await this.authority.authorize(structuredClone(this.scope), 'ingest');
    // No async gap between the fresh authority check, durable object write, and fenced publication.
    const history = this.history(); const existing = history.find(record => record.campaignId === records.campaign.campaignId);
    if (existing) {
      if (!sameRef(existing.campaignRef, records.campaign.ref) || !sameDigest(existing.manifestDigest, records.manifestDigest)) throw new Conflict('Campaign identity is already retained with different evidence');
      return { ...this.checked(existing), replayed: true };
    }
    if (history.length === MAX_RESULTS) throw new Conflict('Result history is full; archive it explicitly before admitting more results');
    const retained = this.archive.put(snapshot);
    const receipt = ResultIngestReceipt.parse(freeze({ schemaVersion: 'workflow.result-ingest/v1' as const,
      ref: { id: `result-${digestOfValue({ scope: this.scope, campaign: records.campaign.ref, manifest: records.manifestDigest }).hex}`, revision: '1' },
      scope: this.scope, campaignId: records.campaign.campaignId, campaignRef: records.campaign.ref, requestRef: records.request.ref, selectionRef: records.selection.ref,
      manifestDigest: records.manifestDigest, retainedOutcome: records.campaign.outcome, receiptCount: records.receipts.length,
      fidelityPlanRef: records.request.fidelityPlanRef, plannedLanes: plannedLanes(records),
      acceptedAt: nowIso(), evidenceClass: 'integrity_checked_local_bundle' as const, issuerStatus: 'unverified' as const, qualificationStatus: 'not_evaluated' as const,
    }));
    const checked = this.checked(receipt, retained);
    this.ledger.append(this.aggregateId, history.length, 'workflow.result.accepted', { receipt });
    return { ...checked, replayed: false };
  }
  async get(id: string): Promise<RetainedResult> {
    IdString.parse(id); await this.authority.authorize(structuredClone(this.scope), 'read');
    const receipt = this.history().find(record => record.ref.id === id);
    if (!receipt) throw new Conflict('Result is not indexed in the selected scope');
    return this.checked(receipt);
  }
  async list(options: { cursor?: string; limit?: number } = {}): Promise<ResultPage> {
    const limit = z.number().int().min(1).max(100).parse(options.limit ?? 20);
    await this.authority.authorize(structuredClone(this.scope), 'read');
    const history = this.history(); let version = history.length; let offset = 0;
    if (options.cursor !== undefined) {
      try {
        if (options.cursor.length > 2048) throw new Error('oversize cursor');
        const cursor = Cursor.parse(JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8')));
        if (cursor.scope !== this.scopeKey || cursor.version > history.length || cursor.offset > cursor.version) throw new Error('foreign cursor');
        version = cursor.version; offset = cursor.offset;
      } catch { throw new Conflict('Invalid or foreign result cursor'); }
    }
    const records = history.slice(0, version).reverse().slice(offset, offset + limit); const next = offset + records.length;
    return { records, snapshotVersion: version, archiveStatus: 'not_checked', nextCursor: next < version
      ? Buffer.from(JSON.stringify({ scope: this.scopeKey, version, offset: next })).toString('base64url') : null };
  }
}
