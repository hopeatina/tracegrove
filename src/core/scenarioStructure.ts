import { z } from 'zod';
import { IdString, RefSchema, RunRequest, ScenarioProjection, ScenarioRevisionToken, ScenarioStructuralValidation,
  digestOfValue, freeze, refKey, sameDigest, sameRef, sameScope, verifySelfDigest,
  type Digest, type Ref, type Scope, type ScenarioDefinition, type SelectionManifest } from '../protocol/index.ts';
import { checkedFrozenRequest, prepareFrozenCells } from './executionPreparation.ts';
import type { FrozenBundle } from './planner.ts';
import { readScenarioSnapshot, resolveScenarioDefinition, resolveQualificationSelection, validateQualificationMatrix, type ScenarioReadPorts } from './scenario.ts';
import { Blocked, Conflict } from './errors.ts';
import { nowIso } from './clock.ts';

export const StructuralActor = z.object({ actorId: IdString, policyRef: RefSchema }).strict();
export interface ScenarioStructurePorts extends ScenarioReadPorts {
  authorizeValidation(scope: Scope, intentDigest: Digest): Promise<z.infer<typeof StructuralActor>>;
  readStructuralValidation(id: string, scope: Scope): Promise<unknown | null>;
  /** Recompile and recheck authority; atomically persist the receipt and validating projection, or neither. */
  compareAndSwapStructuralValidation(token: ScenarioRevisionToken, next: ScenarioProjection,
    validation: ScenarioStructuralValidation, bundle: FrozenBundle): Promise<boolean>;
}
export function structuralIntentBinding(snapshot: ScenarioRevisionToken, requestRef: Ref, executableClosureDigest: Digest) {
  const digest = digestOfValue({ snapshot, requestRef, executableClosureDigest });
  return { digest, id: `structural-validation-${digest.hex}` };
}
export function structuralIntent(token: ScenarioRevisionToken, bundle: FrozenBundle) {
  const request = RunRequest.parse(checkedFrozenRequest(bundle, token.scope));
  const executableClosureDigest = digestOfValue({ request, documents: bundle.documents });
  return { request, executableClosureDigest, ...structuralIntentBinding(token, request.ref, executableClosureDigest) };
}
export function deriveScenarioStructure(token: ScenarioRevisionToken, projection: ScenarioProjection, definition: ScenarioDefinition,
  matrix: SelectionManifest, bundle: FrozenBundle, actor: z.infer<typeof StructuralActor>, validatedAt: string) {
  const intent = structuralIntent(token, bundle); const { request } = intent;
  if (!['proposed', 'degraded'].includes(projection.state)) throw new Conflict('structural validation requires a proposed or degraded scenario');
  if (!['trial', 'work_proof'].includes(request.purpose) || request.sourcePlanRef || request.reviewRef || request.scenarioRefs.length || request.qualificationRoundRef) throw new Conflict('structural validation requires an unchanged non-lifecycle frozen plan');
  if (bundle.blockers.length) throw new Blocked(bundle.blockers);
  validateQualificationMatrix(definition, matrix, matrix);
  const { selection } = prepareFrozenCells(bundle, token.scope, request);
  const cells = (s: SelectionManifest) => ({ cells: s.cells, excludedCells: s.excludedCells });
  if (digestOfValue(cells(selection)).hex !== digestOfValue(cells(matrix)).hex ||
      digestOfValue([...request.caseRefs].map(refKey).sort()).hex !== digestOfValue([...definition.caseRefs].map(refKey).sort()).hex) throw new Conflict('structural plan differs from the scenario case/persona/target matrix');
  const validation = ScenarioStructuralValidation.parse(freeze({ schemaVersion: 'workflow.scenario-structure/v1',
    ref: { id: intent.id, revision: '1' }, scope: token.scope, snapshot: token, requestRef: request.ref,
    qualificationMatrixRef: definition.qualificationMatrixRef, executableClosureDigest: intent.executableClosureDigest,
    actorId: actor.actorId, authorizationPolicyRef: actor.policyRef, validatedAt }));
  const next = ScenarioProjection.parse({ ...projection, aggregateVersion: projection.aggregateVersion + 1,
    state: 'validating', qualificationRoundRefs: [], activationDecisionRef: null });
  return { validation, next };
}
/** Static validation grants neither effect permission nor live qualification. Historical retries cannot reverse edits. */
export async function validateScenarioStructure(ports: ScenarioStructurePorts, input: ScenarioRevisionToken, rawBundle: FrozenBundle): Promise<ScenarioStructuralValidation> {
  const token = ScenarioRevisionToken.parse(input); const bundle = structuredClone(rawBundle);
  const intent = structuralIntent(token, bundle);
  const actor = StructuralActor.parse(await ports.authorizeValidation(structuredClone(token.scope), structuredClone(intent.digest)));
  const prior = async () => {
    const raw = await ports.readStructuralValidation(intent.id, structuredClone(token.scope));
    if (raw === null) return null;
    const stored = ScenarioStructuralValidation.parse(raw);
    if (!verifySelfDigest(stored) || stored.ref.id !== intent.id || stored.ref.revision !== '1' || !sameScope(stored.scope, token.scope) ||
        digestOfValue(stored.snapshot).hex !== digestOfValue(token).hex || !sameRef(stored.requestRef, intent.request.ref) ||
        !sameDigest(stored.executableClosureDigest, intent.executableClosureDigest)) throw new Conflict('structural validation history differs from the frozen intent');
    return stored;
  };
  const existing = await prior(); if (existing) return existing;
  const { projection } = await readScenarioSnapshot(ports, token);
  const definition = await resolveScenarioDefinition(ports, projection.definitionRef, token.scope);
  const matrix = await resolveQualificationSelection(ports, definition.qualificationMatrixRef, token.scope);
  const { validation, next } = deriveScenarioStructure(token, projection, definition, matrix, bundle, actor, nowIso());
  if (!await ports.compareAndSwapStructuralValidation(token, structuredClone(next), structuredClone(validation), structuredClone(bundle))) {
    const raced = await prior(); if (raced) return raced;
    throw new Conflict('scenario changed during structural validation');
  }
  return validation;
}
