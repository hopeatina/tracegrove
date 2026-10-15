import { z } from 'zod';
import { QualificationRoundAdmission, QualificationRoundIntent, RefSchema, ScenarioDefinition, ScenarioProjection, ScenarioRevisionToken,
  SelectionManifest, digestOfValue, freeze, refKey, sameDigest, sameRef, sameScope, verifySelfDigest,
  type Ref, type Scope } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import { newId } from './clock.ts';

export { ScenarioRevisionToken, QualificationRoundIntent } from '../protocol/index.ts';
export interface ScenarioSnapshot { projection: ScenarioProjection; admissions: QualificationRoundAdmission[] }
export interface ScenarioPorts {
  authorize(scope: Scope, action: 'register_round' | 'invalidate'): Promise<void>;
  read(id: string, scope: Scope): Promise<ScenarioSnapshot>;
  resolveDefinition(ref: Ref, scope: Scope): Promise<unknown>;
  resolveSelection(ref: Ref, scope: Scope): Promise<unknown>;
  /** Registered host resolves and validates review, replay, matrix, policy and target closure. */
  validateDefinition(definition: ScenarioDefinition): Promise<void>;
  /** Atomic owner verifies/reserves lease authority and publishes admission + projection, or neither. */
  compareAndSwap(expectedAggregateVersion: number, projection: ScenarioProjection, admission: QualificationRoundAdmission | null): Promise<boolean>;
}
const Snapshot = z.object({ projection: ScenarioProjection, admissions: z.array(QualificationRoundAdmission).max(500) }).strict();
const refKeys = (refs: Ref[]) => [...new Set(refs.map(refKey))].sort();
const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const qualificationStrataDigest = (selection: SelectionManifest) => digestOfValue({
  cells: [...selection.cells].sort((a, b) => compareIds(a.selectionCellId, b.selectionCellId)),
  excludedCells: [...selection.excludedCells].sort((a, b) => compareIds(a.cellKey, b.cellKey)), policyRef: selection.policyRef,
});

async function current(ports: ScenarioPorts, token: ScenarioRevisionToken): Promise<ScenarioSnapshot> {
  const snapshot = Snapshot.parse(await ports.read(token.id, structuredClone(token.scope)));
  const p = snapshot.projection;
  if (p.id !== token.id || !sameScope(p.scope, token.scope) || p.aggregateVersion !== token.expectedAggregateVersion ||
      !sameRef(p.definitionRef, token.expectedDefinitionRef) || p.invalidationEpoch !== token.expectedInvalidationEpoch ||
      p.latestRoundSequence !== token.expectedLatestRoundSequence) throw new Conflict('stale scenario version, definition, epoch or latest round');
  const history = [...snapshot.admissions].sort((a, b) => a.roundSequence - b.roundSequence);
  if (history.length !== p.latestRoundSequence || history.some((a, index) => !verifySelfDigest(a) || !sameScope(a.scope, p.scope) ||
      a.scenarioRef.id !== p.definitionRef.id || a.roundSequence !== index + 1 || a.invalidationEpoch > p.invalidationEpoch)) {
    throw new Conflict('scenario admission history is incomplete or substituted');
  }
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(history.map(a => a.campaignId)) || !unique(history.flatMap(a => a.attempts.map(attempt => attempt.executionId))) ||
      !unique(history.flatMap(a => a.attempts.map(attempt => attempt.attemptId))) ||
      !unique(history.flatMap(a => a.stateLeaseRefs.map(ref => ref.id)))) throw new Conflict('scenario history reuses campaign, attempt or leased-state identities');
  return snapshot;
}
async function definition(ports: ScenarioPorts, ref: Ref, scope: Scope): Promise<ScenarioDefinition> {
  const value = ScenarioDefinition.parse(await ports.resolveDefinition(structuredClone(ref), structuredClone(scope)));
  if (!sameRef(value.ref, ref) || !sameScope(value.scope, scope) || !verifySelfDigest(value)) throw new Conflict('scenario definition digest or scope mismatch');
  if (refKeys(value.caseRefs).length !== value.caseRefs.length) throw new Conflict('duplicate scenario case reference');
  await ports.validateDefinition(structuredClone(value));
  return value;
}
async function selection(ports: ScenarioPorts, ref: Ref, scope: Scope): Promise<SelectionManifest> {
  const value = SelectionManifest.parse(await ports.resolveSelection(structuredClone(ref), structuredClone(scope)));
  if (!sameRef(value.ref, ref) || !sameScope(value.scope, scope) || !verifySelfDigest(value)) throw new Conflict('qualification selection digest or scope mismatch');
  if (!value.cells.length || new Set(value.cells.map(c => c.selectionCellId)).size !== value.cells.length ||
      new Set(value.excludedCells.map(c => c.cellKey)).size !== value.excludedCells.length ||
      value.excludedCells.some(c => !c.reason.trim())) throw new Conflict('qualification selection is empty, duplicated or lacks exclusion reasons');
  return value;
}

/** Registers the complete pending round before execution; never activates coverage or admits effects. */
export async function registerQualificationRound(ports: ScenarioPorts, input: ScenarioRevisionToken, requested: QualificationRoundIntent): Promise<QualificationRoundAdmission> {
  const token = ScenarioRevisionToken.parse(input);
  const intent = QualificationRoundIntent.parse(requested);
  await ports.authorize(structuredClone(token.scope), 'register_round');
  const snapshot = await current(ports, token);
  const p = snapshot.projection;
  if (!['validating', 'active'].includes(p.state)) throw new Conflict('scenario must be structurally validated and not retired before round registration');
  const scenario = await definition(ports, p.definitionRef, token.scope);
  const matrix = await selection(ports, scenario.qualificationMatrixRef, token.scope);
  const selected = await selection(ports, intent.selectionManifestRef, token.scope);
  if (!matrix.policyRef || !sameRef(matrix.policyRef, scenario.qualificationPolicyRef) ||
      !sameDigest(qualificationStrataDigest(matrix), qualificationStrataDigest(selected)) ||
      !sameDigest(digestOfValue(refKeys(matrix.cells.filter(c => c.required).map(c => c.caseRef))), digestOfValue(refKeys(scenario.caseRefs))) ||
      matrix.cells.some(c => !scenario.caseRefs.some(ref => sameRef(ref, c.caseRef)))) throw new Conflict('qualification must retain the exact required case/persona/target matrix and policy');
  const usedLeases = new Set(snapshot.admissions.flatMap(a => a.stateLeaseRefs.map(ref => ref.id)));
  if (new Set(intent.stateLeaseRefs.map(ref => ref.id)).size !== intent.stateLeaseRefs.length || intent.stateLeaseRefs.some(ref => usedLeases.has(ref.id))) {
    throw new Conflict('qualification round needs fresh, nonduplicated leased state');
  }
  if (snapshot.admissions.length >= 500) throw new Conflict('scenario admission history needs an authoritative archival index before more rounds');
  const admission = QualificationRoundAdmission.parse(freeze({ schemaVersion: 'workflow.qualification-admission/v1',
    ref: { id: newId('qualification-admission'), revision: '1' }, scope: token.scope, scenarioRef: scenario.ref,
    replayContractRef: scenario.replayContractRef, qualificationPolicyRef: scenario.qualificationPolicyRef,
    qualificationMatrixRef: scenario.qualificationMatrixRef, targetProfileRef: scenario.qualificationTargetProfileRef,
    strataDigest: qualificationStrataDigest(matrix), invalidationEpoch: p.invalidationEpoch, roundSequence: p.latestRoundSequence + 1,
    campaignId: newId('qualification-campaign'), selectionManifestRef: selected.ref,
    attempts: selected.cells.map(cell => ({ selectionCellId: cell.selectionCellId, executionId: newId('execution'), attemptId: newId('attempt') })),
    stateLeaseRefs: intent.stateLeaseRefs,
  }));
  const next = ScenarioProjection.parse({ ...p, aggregateVersion: p.aggregateVersion + 1, latestRoundSequence: admission.roundSequence });
  if (!await ports.compareAndSwap(p.aggregateVersion, structuredClone(next), structuredClone(admission))) throw new Conflict('scenario changed during round registration');
  return admission;
}

/** Semantic replacement retains history, advances the epoch and clears activation authority. */
export async function invalidateScenario(ports: ScenarioPorts, input: ScenarioRevisionToken, nextRef: Ref): Promise<ScenarioProjection> {
  const token = ScenarioRevisionToken.parse(input); nextRef = RefSchema.parse(nextRef);
  await ports.authorize(structuredClone(token.scope), 'invalidate');
  const { projection: p } = await current(ports, token);
  if (p.state === 'retired') throw new Conflict('retired coverage cannot be resurrected');
  if (nextRef.id !== p.definitionRef.id || nextRef.revision === p.definitionRef.revision) throw new Conflict('semantic replacement needs a new immutable revision of the same scenario');
  await definition(ports, nextRef, token.scope);
  const next = ScenarioProjection.parse({ ...p, definitionRef: nextRef, aggregateVersion: p.aggregateVersion + 1,
    invalidationEpoch: p.invalidationEpoch + 1, state: 'degraded', activationDecisionRef: null });
  if (!await ports.compareAndSwap(p.aggregateVersion, structuredClone(next), null)) throw new Conflict('scenario changed during invalidation');
  return next;
}
