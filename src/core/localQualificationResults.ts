import { z } from 'zod';
import { DigestSchema, QualificationRound, QualificationRoundAdmission, RefSchema, ScopeSchema,
  digestOfValue, sameDigest, sameRef, sameScope, verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import { LocalLedger } from './ledger.ts';
import { LocalResultSink } from './resultSink.ts';
import { readQualificationEvidence, type QualificationResultPorts, type QualificationRoundInput } from './qualification.ts';
import { Conflict } from './errors.ts';
import { readVerifiedBundle } from './bundle.ts';

const IndexedRound = z.object({ round: QualificationRound, resultRef: RefSchema, manifestDigest: DigestSchema }).strict();
type IndexedRound = z.infer<typeof IndexedRound>;
export interface LocalQualificationResultAuthority extends QualificationResultPorts {
  /** Explicit write permission; read and issuer authentication do not imply retention permission. */
  authorizeRetention(scope: Scope): Promise<void>;
}
export type RetainedQualificationRound = { round: QualificationRound; bundleDir: string; replayed: boolean };

/** Durable local terminal-round index. Reuses the immutable result sink; never records readiness or activates coverage. */
export class LocalQualificationResults {
  private readonly scope: Scope;
  private readonly aggregate: string;
  private readonly sink: LocalResultSink;
  constructor(private readonly ledger: LocalLedger, scope: Scope, private readonly authority: LocalQualificationResultAuthority) {
    this.scope = ScopeSchema.parse(scope); this.aggregate = `qualification-results:${digestOfValue(this.scope).hex}`;
    this.sink = new LocalResultSink(ledger, this.scope, { authorize: async (requested, action) => {
      if (action === 'ingest') await this.authority.authorizeRetention(requested);
      else await this.authority.authorize(requested);
    } });
  }
  private scoped(scope: Scope): void {
    if (!sameScope(scope, this.scope)) throw new Conflict('qualification result belongs to another scope');
  }
  private history(): IndexedRound[] {
    const entries = this.ledger.history(this.aggregate);
    if (entries.length > 500) throw new Conflict('qualification result history requires archival indexing');
    const admissions = new Set<string>(); const results = new Set<string>();
    return entries.map(entry => {
      const record = IndexedRound.parse(entry.data); const round = record.round;
      const identity = JSON.stringify([round.admissionRef.id, round.admissionRef.revision]);
      if (entry.type !== 'workflow.qualification.retained' || !verifySelfDigest(round) || !sameScope(round.scope, this.scope) ||
          admissions.has(identity) || results.has(record.resultRef.id)) throw new Conflict('qualification result index is inconsistent');
      admissions.add(identity); results.add(record.resultRef.id); return record;
    });
  }
  private find(history: IndexedRound[], admissionRef: Ref): IndexedRound | undefined {
    const record = history.find(item => item.round.admissionRef.id === admissionRef.id && item.round.admissionRef.revision === admissionRef.revision);
    if (record && !sameRef(record.round.admissionRef, admissionRef)) throw new Conflict('qualification admission identity changed');
    return record;
  }
  private intact(record: IndexedRound, bundleDir: string): void {
    if (!sameDigest(readVerifiedBundle(bundleDir).manifestDigest, record.manifestDigest)) throw new Conflict('qualification archive changed during authorization');
  }
  private async checked(record: IndexedRound): Promise<{ round: QualificationRound; bundleDir: string }> {
    const retained = await this.sink.get(record.resultRef.id);
    if (!sameRef(retained.receipt.ref, record.resultRef) || !sameDigest(retained.receipt.manifestDigest, record.manifestDigest)) throw new Conflict('qualification result differs from retained evidence');
    const evidence = await readQualificationEvidence(this.authority, { admissionRef: record.round.admissionRef, scope: this.scope, bundleDir: retained.bundleDir });
    if (!sameDigest(evidence.bundle.manifestDigest, record.manifestDigest) || !sameRef(evidence.round.ref, record.round.ref)) throw new Conflict('qualification round differs from authenticated evidence');
    await this.authority.authorize(structuredClone(this.scope));
    this.intact(record, retained.bundleDir);
    return { round: structuredClone(record.round), bundleDir: retained.bundleDir };
  }
  async retain(input: QualificationRoundInput): Promise<RetainedQualificationRound> {
    const scope = ScopeSchema.parse(input.scope); this.scoped(scope);
    const admissionRef = RefSchema.parse(input.admissionRef); const bundleDir = z.string().min(1).max(2048).parse(input.bundleDir);
    await this.authority.authorizeRetention(structuredClone(scope));
    const evidence = await readQualificationEvidence(this.authority, { admissionRef, bundleDir, scope });
    const previous = this.find(this.history(), evidence.admission.ref);
    if (previous) {
      if (!sameDigest(previous.manifestDigest, evidence.bundle.manifestDigest) || !sameRef(previous.round.ref, evidence.round.ref)) throw new Conflict('qualification round already retains different evidence');
      return { ...await this.checked(previous), replayed: true };
    }
    if (this.history().length === 500) throw new Conflict('qualification result history is full');
    // Immutable archive and its generic result receipt precede qualification publication.
    // A crash between them leaves retained integrity-checked bytes, never a phantom qualifying round.
    const retained = await this.sink.ingest(bundleDir, { expectedManifestDigest: evidence.bundle.manifestDigest });
    if (!sameDigest(retained.receipt.manifestDigest, evidence.bundle.manifestDigest)) throw new Conflict('qualification input changed during retention');
    const record = IndexedRound.parse({ round: evidence.round, resultRef: retained.receipt.ref, manifestDigest: evidence.bundle.manifestDigest });
    const checked = await this.checked(record);
    await this.authority.authorizeRetention(structuredClone(scope));
    this.intact(record, checked.bundleDir);
    const history = this.history(); const raced = this.find(history, evidence.admission.ref);
    if (raced) {
      if (digestOfValue(raced).hex !== digestOfValue(record).hex) throw new Conflict('qualification publication conflicts with retained evidence');
      return { ...checked, replayed: true };
    }
    if (history.length === 500) throw new Conflict('qualification result history is full');
    this.ledger.append(this.aggregate, history.length, 'workflow.qualification.retained', record);
    return { ...checked, replayed: false };
  }
  /** ReplayAssessmentPorts.resolveRound: null is pending only for an authentic registered admission. */
  async resolveRound(raw: QualificationRoundAdmission): Promise<{ roundRef: Ref; bundleDir: string } | null> {
    const admission = QualificationRoundAdmission.parse(raw); this.scoped(admission.scope);
    if (!verifySelfDigest(admission)) throw new Conflict('qualification admission seal changed');
    await this.authority.authorize(structuredClone(this.scope));
    const actual = QualificationRoundAdmission.parse(await this.authority.resolveAdmission(structuredClone(admission.ref), structuredClone(this.scope)));
    if (!verifySelfDigest(actual) || !sameScope(actual.scope, this.scope) || !sameRef(actual.ref, admission.ref)) throw new Conflict('qualification admission is not authentically registered');
    const record = this.find(this.history(), admission.ref);
    if (!record) { await this.authority.authorize(structuredClone(this.scope)); return null; }
    const checked = await this.checked(record);
    return { roundRef: checked.round.ref, bundleDir: checked.bundleDir };
  }
}
