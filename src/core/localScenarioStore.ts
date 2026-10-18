import { IdString, QualificationRoundAdmission, ScenarioDefinition, ScenarioProjection, ScopeSchema, SelectionManifest,
  digestOfValue, sameRef, sameScope, verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import { LocalLedger } from './ledger.ts';
import { Conflict } from './errors.ts';
import { appendImmutable, checkAdmission, checkLocalScenarioState, storedDefinition, storedSelection,
  type LocalScenarioState, type StoredScenario } from './localScenarioState.ts';
import type { ScenarioPorts, ScenarioSnapshot } from './scenario.ts';

export interface LocalScenarioAuthority {
  authorize(scope: Scope, action: 'initialize' | 'stage' | 'read' | 'register_round' | 'invalidate'): Promise<void>;
  /** Authenticated host checks promotion/structural validation and the complete reviewed definition closure. */
  validateDefinition(definition: ScenarioDefinition): Promise<void>;
  /** Read-only admission check of actual, fresh host state; the registry atomically claims these lease identities. */
  validateStateLeases(admission: QualificationRoundAdmission): Promise<void>;
}

/** Single-writer local owner. No hosted IAM, physical provisioning, approval creation or execution fallback. */
export class LocalScenarioStore {
  private readonly scope: Scope;
  private readonly aggregate: string;
  constructor(private readonly ledger: LocalLedger, private readonly id: string, scope: Scope, private readonly authority: LocalScenarioAuthority) {
    IdString.parse(id); this.scope = ScopeSchema.parse(scope);
    this.aggregate = `workflow-scenarios:${digestOfValue(this.scope).hex}`;
  }
  private scoped(id: string, scope: Scope): void {
    if (id !== this.id || !sameScope(scope, this.scope)) throw new Conflict('local scenario identity or scope mismatch');
  }
  private scopedDocument(document: { scope: Scope; ref: Ref }): void {
    if (!sameScope(document.scope, this.scope) || !verifySelfDigest(document)) throw new Conflict('scenario input document digest or scope mismatch');
  }
  private current(): { version: number; state: LocalScenarioState } {
    const entry = this.ledger.current(this.aggregate);
    if (!entry) return { version: 0, state: { schemaVersion: 'workflow.local-scenario-state/v1', scope: this.scope, scenarios: [] } };
    if (!entry.type.startsWith('workflow.scenario.')) throw new Conflict('local scenario registry entry has a foreign event type');
    return { version: entry.version, state: checkLocalScenarioState(entry.data, this.scope) };
  }
  private entry(state: LocalScenarioState): StoredScenario {
    const entry = state.scenarios.find(item => item.projection.id === this.id);
    if (!entry) throw new Conflict('local scenario is not initialized'); return entry;
  }
  private write(version: number, state: LocalScenarioState, event: string): void {
    this.ledger.append(this.aggregate, version, event, checkLocalScenarioState(state, this.scope));
  }
  async initialize(raw: unknown, selections: unknown[]): Promise<void> {
    const definition = ScenarioDefinition.parse(raw); const parsed = selections.map(selection => SelectionManifest.parse(selection));
    for (const document of [definition, ...parsed]) this.scopedDocument(document);
    const uniqueSelections: SelectionManifest[] = [];
    for (const selection of parsed) appendImmutable(uniqueSelections, selection);
    await this.authority.authorize(structuredClone(this.scope), 'initialize');
    await this.authority.validateDefinition(structuredClone(definition));
    await this.authority.authorize(structuredClone(this.scope), 'initialize');
    const { version, state } = this.current();
    if (state.scenarios.some(item => item.projection.id === this.id)) throw new Conflict('local scenario is already initialized');
    const projection = ScenarioProjection.parse({ id: this.id, scope: this.scope, aggregateVersion: 1, definitionRef: definition.ref,
      state: 'validating', invalidationEpoch: 0, latestRoundSequence: 0, qualificationRoundRefs: [], activationDecisionRef: null });
    state.scenarios.push({ projection, definitions: [definition], selections: uniqueSelections, admissions: [] });
    this.write(version, state, 'workflow.scenario.initialized');
  }
  async stage(raw: unknown, selections: unknown[] = []): Promise<void> {
    const definition = ScenarioDefinition.parse(raw); const parsed = selections.map(selection => SelectionManifest.parse(selection));
    for (const document of [definition, ...parsed]) this.scopedDocument(document);
    await this.authority.authorize(structuredClone(this.scope), 'stage');
    const { version, state } = this.current(); const entry = this.entry(state); const before = digestOfValue(entry);
    appendImmutable(entry.definitions, definition); for (const selection of parsed) appendImmutable(entry.selections, selection);
    if (digestOfValue(entry).hex !== before.hex) this.write(version, state, 'workflow.scenario.documents-staged');
  }
  async read(id: string, scope: Scope): Promise<ScenarioSnapshot> {
    this.scoped(id, scope); await this.authority.authorize(structuredClone(this.scope), 'read');
    const entry = this.entry(this.current().state);
    return structuredClone({ projection: entry.projection, admissions: entry.admissions });
  }
  async resolveDefinition(ref: Ref, scope: Scope): Promise<ScenarioDefinition> {
    this.scoped(this.id, scope); await this.authority.authorize(structuredClone(this.scope), 'read');
    return structuredClone(storedDefinition(this.entry(this.current().state), ref));
  }
  async resolveSelection(ref: Ref, scope: Scope): Promise<SelectionManifest> {
    this.scoped(this.id, scope); await this.authority.authorize(structuredClone(this.scope), 'read');
    return structuredClone(storedSelection(this.entry(this.current().state), ref));
  }
  async resolveAdmission(ref: Ref, scope: Scope): Promise<QualificationRoundAdmission> {
    const snapshot = await this.read(this.id, scope); const admission = snapshot.admissions.find(item => sameRef(item.ref, ref));
    if (!admission) throw new Conflict('qualification admission is not registered'); return structuredClone(admission);
  }
  private async commit(expected: number, raw: ScenarioProjection, rawAdmission: QualificationRoundAdmission | null): Promise<boolean> {
    const next = ScenarioProjection.parse(raw); this.scoped(next.id, next.scope);
    const admission = rawAdmission === null ? null : QualificationRoundAdmission.parse(rawAdmission);
    if (admission) this.scopedDocument(admission);
    const action = admission ? 'register_round' : 'invalidate';
    await this.authority.authorize(structuredClone(this.scope), action);
    const { version, state } = this.current(); const entry = this.entry(state); const previous = entry.projection;
    if (previous.aggregateVersion !== expected) return false;
    let allowed: ScenarioProjection;
    let definition: ScenarioDefinition;
    if (admission) {
      if (!['validating', 'active'].includes(previous.state) || !sameRef(admission.scenarioRef, previous.definitionRef) ||
          admission.roundSequence !== previous.latestRoundSequence + 1 || admission.invalidationEpoch !== previous.invalidationEpoch) throw new Conflict('qualification admission has a stale state, definition, epoch or sequence');
      checkAdmission(entry, admission);
      definition = storedDefinition(entry, previous.definitionRef);
      allowed = { ...previous, aggregateVersion: previous.aggregateVersion + 1, latestRoundSequence: admission.roundSequence };
      entry.admissions.push(admission);
    } else {
      definition = storedDefinition(entry, next.definitionRef);
      if (previous.state === 'retired' || definition.ref.id !== previous.definitionRef.id || definition.ref.revision === previous.definitionRef.revision) throw new Conflict('semantic invalidation requires a new revision of the same non-retired scenario');
      allowed = { ...previous, definitionRef: definition.ref, aggregateVersion: previous.aggregateVersion + 1,
        invalidationEpoch: previous.invalidationEpoch + 1, state: 'degraded', activationDecisionRef: null };
    }
    if (digestOfValue(next).hex !== digestOfValue(allowed).hex) throw new Conflict('scenario commit attempts an unauthorized projection transition');
    entry.projection = next; checkLocalScenarioState(state, this.scope);
    await this.authority.validateDefinition(structuredClone(definition));
    if (admission) await this.authority.validateStateLeases(structuredClone(admission));
    await this.authority.authorize(structuredClone(this.scope), action);
    if (this.current().version !== version) return false;
    this.write(version, state, admission ? 'workflow.scenario.round-registered' : 'workflow.scenario.invalidated');
    return true;
  }
  ports(): ScenarioPorts {
    return { authorize: async (scope, action) => { this.scoped(this.id, scope); await this.authority.authorize(structuredClone(scope), action); },
      read: (id, scope) => this.read(id, scope), resolveDefinition: (ref, scope) => this.resolveDefinition(ref, scope),
      resolveSelection: (ref, scope) => this.resolveSelection(ref, scope),
      validateDefinition: async definition => {
        this.scopedDocument(definition); await this.authority.authorize(structuredClone(this.scope), 'read');
        await this.authority.validateDefinition(structuredClone(definition));
      },
      compareAndSwap: (version, projection, admission) => this.commit(version, projection, admission) };
  }
}
