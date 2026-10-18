import { IdString, ScenarioProjection, ScenarioRevisionToken, ScenarioStructuralValidation, SourceSelection,
  digestOfValue, refKey, sameScope, verifySelfDigest } from '../protocol/index.ts';
import { StructuralActor, deriveScenarioStructure, structuralIntent, type ScenarioStructurePorts } from './scenarioStructure.ts';
import { storedDefinition, storedSelection } from './localScenarioState.ts';
import { validateScenarioSnapshot } from './scenario.ts';
import type { LocalScenarioOwner } from './localScenarioOwner.ts';
import { Conflict } from './errors.ts';
import { validateReviewedSourceSelection } from './sourceReviewEvidence.ts';

export type LocalScenarioStructureAuthority = Pick<ScenarioStructurePorts, 'authorizeValidation'>;
export function localScenarioStructurePorts(owner: LocalScenarioOwner, authority: LocalScenarioStructureAuthority): ScenarioStructurePorts {
  return { ...owner.readPorts,
    authorizeValidation: async (scope, digest) => {
      if (!sameScope(scope, owner.scope)) throw new Conflict('structural validation scope mismatch');
      return authority.authorizeValidation(structuredClone(scope), structuredClone(digest));
    },
    readStructuralValidation: async (id, scope) => {
      IdString.parse(id); await owner.authorizeRead(scope);
      return structuredClone(owner.entry(owner.current().state).structuralValidations.find(v => v.ref.id === id) ?? null);
    },
    compareAndSwapStructuralValidation: async (rawToken, rawNext, rawValidation, rawBundle) => {
      const token = ScenarioRevisionToken.parse(rawToken); const next = ScenarioProjection.parse(rawNext);
      const validation = ScenarioStructuralValidation.parse(rawValidation); const bundle = structuredClone(rawBundle);
      if (token.id !== owner.id || next.id !== owner.id || !sameScope(token.scope, owner.scope) ||
          !sameScope(next.scope, owner.scope) || !sameScope(validation.scope, owner.scope) || !verifySelfDigest(validation)) throw new Conflict('structural validation identity, scope or seal mismatch');
      await owner.authorizeRead(structuredClone(owner.scope));
      const { version, state } = owner.current(); const entry = owner.entry(state);
      if (entry.structuralValidations.some(v => v.ref.id === validation.ref.id)) return false;
      validateScenarioSnapshot({ projection: entry.projection, admissions: entry.admissions }, token);
      const definition = storedDefinition(entry, token.expectedDefinitionRef);
      const reviewed = await owner.checkDefinition(definition);
      if (reviewed && bundle.request?.sourceSelectionRef) validateReviewedSourceSelection(reviewed.documents,
        SourceSelection.parse(bundle.documents[refKey(bundle.request.sourceSelectionRef)]));
      const intent = structuralIntent(token, bundle);
      const actor = StructuralActor.parse(await authority.authorizeValidation(structuredClone(owner.scope), structuredClone(intent.digest)));
      const expected = deriveScenarioStructure(token, entry.projection, definition,
        storedSelection(entry, definition.qualificationMatrixRef), bundle, actor, validation.validatedAt);
      if (digestOfValue(expected.validation).hex !== digestOfValue(validation).hex || digestOfValue(expected.next).hex !== digestOfValue(next).hex) throw new Conflict('structural validation differs from compiled closure or current authority');
      if (owner.current().version !== version) return false;
      reviewed?.assertCurrent();
      entry.projection = next; entry.structuralValidations.push(validation);
      owner.write(version, state, 'workflow.scenario.structure-validated');
      return true;
    },
  };
}
