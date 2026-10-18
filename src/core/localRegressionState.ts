import { digestOfValue, sameRef, sameScope, verifySelfDigest } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import type { StoredScenario } from './localScenarioState.ts';
import { validateQualificationMatrix } from './scenario.ts';

/** Historical structural checks; registered documents never authenticate their own issuer. */
export function validateStoredRegressions(entry: StoredScenario, keys: Set<string>): void {
  for (const admission of entry.regressionAdmissions) {
    const intent = admission.intent, token = intent.snapshot, p = entry.projection;
    const activation = entry.activations.find(record => sameRef(record.activation.ref, admission.activationRef))?.activation;
    const definition = entry.definitions.find(value => sameRef(value.ref, token.expectedDefinitionRef));
    const selection = entry.selections.find(value => sameRef(value.ref, intent.selectionManifestRef));
    if (!verifySelfDigest(admission) || !sameScope(admission.scope, p.scope) || !sameScope(token.scope, p.scope) ||
        !activation || !definition || !selection || token.id !== p.id || token.expectedAggregateVersion >= p.aggregateVersion ||
        token.expectedAggregateVersion <= activation.intent.snapshot.expectedAggregateVersion ||
        token.expectedInvalidationEpoch !== activation.intent.snapshot.expectedInvalidationEpoch ||
        !sameRef(token.expectedDefinitionRef, activation.intent.snapshot.expectedDefinitionRef) ||
        token.expectedLatestRoundSequence > p.latestRoundSequence ||
        admission.ref.id !== `regression-admission-${digestOfValue(intent).hex}` || admission.ref.revision !== '1' ||
        keys.has(intent.idempotencyKey)) throw new Conflict('stored regression admission differs from its active scenario or scoped intent');
    keys.add(intent.idempotencyKey);
    const matrix = entry.selections.find(value => sameRef(value.ref, definition.qualificationMatrixRef));
    if (!matrix) throw new Conflict('stored regression matrix is missing');
    validateQualificationMatrix(definition, matrix, selection);
  }
}
