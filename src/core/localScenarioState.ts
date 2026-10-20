import { z } from 'zod';
import { IdString, QualificationRoundAdmission, RegressionAdmission, ScenarioDefinition, ScenarioProjection, ScenarioStructuralValidation, ScopeSchema, SelectionManifest,
  digestOfValue, sameDigest, sameRef, sameScope, verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import { qualificationStrataDigest, validateQualificationMatrix, validateQualificationSelection, validateScenarioDefinition, validateScenarioSnapshot } from './scenario.ts';
import { Conflict } from './errors.ts';
import { StoredActivation, validateStoredActivations } from './localActivationState.ts';
import { validateStoredStructure } from './localStructureState.ts';
import { StoredPromotion, validateStoredPromotion } from './localPromotionState.ts';
import { validateStoredRegressions } from './localRegressionState.ts';

export const StoredScenario = z.object({ projection: ScenarioProjection, definitions: z.array(ScenarioDefinition).min(1).max(500),
  selections: z.array(SelectionManifest).min(1).max(500), admissions: z.array(QualificationRoundAdmission).max(500),
  activations: z.array(StoredActivation).max(500).default([]),
  regressionAdmissions: z.array(RegressionAdmission).max(500).default([]),
  structuralValidations: z.array(ScenarioStructuralValidation).max(500).default([]),
  promotion: StoredPromotion.nullable().default(null) }).strict();
export type StoredScenario = z.infer<typeof StoredScenario>;
export const LocalScenarioState = z.object({ schemaVersion: z.literal('workflow.local-scenario-state/v1'), scope: ScopeSchema,
  scenarios: z.array(StoredScenario).min(1).max(100) }).strict();
export type LocalScenarioState = z.infer<typeof LocalScenarioState>;
export function scenarioToken(p: ScenarioProjection) {
  return { id: p.id, scope: p.scope, expectedAggregateVersion: p.aggregateVersion, expectedDefinitionRef: p.definitionRef,
    expectedInvalidationEpoch: p.invalidationEpoch, expectedLatestRoundSequence: p.latestRoundSequence };
}
export function storedDefinition(state: Pick<StoredScenario, 'definitions'>, ref: Ref): ScenarioDefinition {
  const definition = state.definitions.find(item => sameRef(item.ref, ref));
  if (!definition) throw new Conflict('scenario definition is not stored'); return definition;
}
export function storedSelection(state: Pick<StoredScenario, 'selections'>, ref: Ref): SelectionManifest {
  const selection = state.selections.find(item => sameRef(item.ref, ref));
  if (!selection) throw new Conflict('scenario selection is not stored'); return selection;
}
export function checkAdmission(state: Pick<StoredScenario, 'definitions' | 'selections'>, admission: QualificationRoundAdmission): void {
  const definition = storedDefinition(state, admission.scenarioRef);
  const matrix = storedSelection(state, definition.qualificationMatrixRef);
  const selected = storedSelection(state, admission.selectionManifestRef);
  validateQualificationMatrix(definition, matrix, selected);
  const binding = [[admission.replayContractRef, definition.replayContractRef], [admission.qualificationPolicyRef, definition.qualificationPolicyRef],
    [admission.qualificationMatrixRef, definition.qualificationMatrixRef], [admission.targetProfileRef, definition.qualificationTargetProfileRef]] as const;
  if (binding.some(([a, b]) => !sameRef(a, b)) || !sameDigest(admission.strataDigest, qualificationStrataDigest(matrix)) ||
      digestOfValue(admission.attempts.map(a => a.selectionCellId)).hex !== digestOfValue(selected.cells.map(c => c.selectionCellId)).hex ||
      !admission.stateLeaseRefs.length) throw new Conflict('stored admission differs from its exact definition, matrix or allocation');
}
/** Complete bounded state, including all earlier epochs. A missing record never looks fresh. */
export function checkLocalScenarioState(raw: unknown, scope: Scope): LocalScenarioState {
  const state = LocalScenarioState.parse(raw);
  if (!sameScope(state.scope, scope)) throw new Conflict('local scenario registry scope mismatch');
  if (state.scenarios.reduce((n, s) => n + s.admissions.length, 0) > 500 ||
      state.scenarios.reduce((n, s) => n + s.activations.length, 0) > 500 ||
      state.scenarios.reduce((n, s) => n + s.regressionAdmissions.length, 0) > 500 ||
      state.scenarios.reduce((n, s) => n + s.structuralValidations.length, 0) > 500 ||
      state.scenarios.reduce((n, s) => n + s.definitions.length + s.selections.length, 0) > 2000) throw new Conflict('local scenario registry needs archival indexing before more history');
  const names = new Set<string>(); const documents = new Map<string, Ref>(); const activationKeys = new Set<string>(); const promotionKeys = new Set<string>();
  const claims = new Set<string>(); const regressionKeys = new Set<string>();
  const claim = (kind: string, id: string) => { const key = `${kind}:${id}`;
    if (claims.has(key)) throw new Conflict('scenario registry reuses a campaign, execution, attempt or leased-state identity'); claims.add(key); };
  for (const scenario of state.scenarios) {
    const p = scenario.projection; IdString.parse(p.id);
    if (names.has(p.id) || !sameScope(p.scope, scope)) throw new Conflict('duplicate or foreign scenario projection'); names.add(p.id);
    validateScenarioSnapshot({ projection: p, admissions: scenario.admissions }, scenarioToken(p));
    for (const list of [scenario.definitions, scenario.selections, scenario.admissions]) {
      if (new Set(list.map(document => JSON.stringify([document.ref.id, document.ref.revision]))).size !== list.length) throw new Conflict('duplicate local scenario document identity');
    }
    for (const document of [...scenario.definitions, ...scenario.selections, ...scenario.admissions]) {
      if (!verifySelfDigest(document) || !sameScope(document.scope, scope)) throw new Conflict('local scenario document digest or scope mismatch');
      const identity = JSON.stringify([document.ref.id, document.ref.revision]); const existing = documents.get(identity);
      if (existing && !sameRef(existing, document.ref)) throw new Conflict('local scenario document changes an immutable identity');
      documents.set(identity, document.ref);
    }
    const current = storedDefinition(scenario, p.definitionRef);
    for (const selection of scenario.selections) validateQualificationSelection(selection, selection.ref, scope);
    for (const definition of scenario.definitions) {
      validateScenarioDefinition(definition, definition.ref, scope);
      if (definition.ref.id !== current.ref.id) throw new Conflict('scenario definition identity changed');
      const matrix = storedSelection(scenario, definition.qualificationMatrixRef); validateQualificationMatrix(definition, matrix, matrix);
    }
    for (const admission of scenario.admissions) {
      checkAdmission(scenario, admission); claim('campaign', admission.campaignId);
      for (const attempt of admission.attempts) { claim('execution', attempt.executionId); claim('attempt', attempt.attemptId); }
      for (const lease of admission.stateLeaseRefs) claim('state', lease.id);
    }
    validateStoredActivations(scenario, activationKeys);
    validateStoredRegressions(scenario, regressionKeys);
    for (const admission of scenario.regressionAdmissions) {
      claim('campaign', admission.campaignId);
      for (const lease of admission.intent.stateLeaseRefs) claim('state', lease.id);
    }
    validateStoredStructure(scenario);
    validateStoredPromotion(scenario, promotionKeys);
  }
  return state;
}
export function appendImmutable<T extends { ref: Ref }>(documents: T[], document: T): void {
  const existing = documents.find(item => item.ref.id === document.ref.id && item.ref.revision === document.ref.revision);
  if (existing && !sameRef(existing.ref, document.ref)) throw new Conflict('staged scenario document changes an immutable identity');
  if (!existing) documents.push(document);
}
