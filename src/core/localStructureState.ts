import { sameRef, sameScope, verifySelfDigest } from '../protocol/index.ts';
import { structuralIntentBinding } from './scenarioStructure.ts';
import { Conflict } from './errors.ts';
import type { StoredScenario } from './localScenarioState.ts';

export function validateStoredStructure(entry: StoredScenario): void {
  const p = entry.projection; const ids = new Set<string>();
  for (const record of entry.structuralValidations) {
    const token = record.snapshot;
    const definition = entry.definitions.find(d => sameRef(d.ref, token.expectedDefinitionRef));
    if (ids.has(record.ref.id) || !verifySelfDigest(record) || record.ref.revision !== '1' ||
        record.ref.id !== structuralIntentBinding(token, record.requestRef, record.executableClosureDigest).id ||
        !sameScope(record.scope, p.scope) || !sameScope(token.scope, p.scope) || token.id !== p.id ||
        token.expectedAggregateVersion >= p.aggregateVersion || token.expectedInvalidationEpoch > p.invalidationEpoch ||
        token.expectedLatestRoundSequence > p.latestRoundSequence || !definition ||
        !sameRef(record.qualificationMatrixRef, definition.qualificationMatrixRef)) throw new Conflict('stored structural validation identity, history or bindings changed');
    ids.add(record.ref.id);
  }
  if (p.state === 'validating' && entry.structuralValidations.length && !entry.structuralValidations.some(record =>
    sameRef(record.snapshot.expectedDefinitionRef, p.definitionRef) && record.snapshot.expectedInvalidationEpoch === p.invalidationEpoch)) throw new Conflict('validating scenario lacks current structural validation');
}
