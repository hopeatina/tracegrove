import { ActionRegistry, CaseFixturePlan, SeedRecipe, refKey, type Ref, type WorkflowMapEntry } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
/** Project action metadata, never seed values, credentials or cached successful responses. */
export function workflowFixtureKnowledge(documents:Record<string,unknown>,ref:Ref|null):WorkflowMapEntry['prerequisites']['fixture'] {
  if(!ref)return null;
  const plan=CaseFixturePlan.parse(documents[refKey(ref)]),recipe=SeedRecipe.parse(documents[refKey(plan.seedRecipeRef)]),registry=ActionRegistry.parse(documents[refKey(recipe.actionRegistryRef)]);
  const action=(id:string)=>{const value=registry.actions.find(a=>a.actionId===id);if(!value)throw new Conflict('workflow fixture action is unresolved');
    return {actionId:value.actionId,effect:value.effect,method:value.method,path:value.path.split(/[?#]/,1)[0]!}};
  return {basis:'declared_recipe',planRef:plan.ref,recipeRef:recipe.ref,actionRegistryRef:registry.ref,cleanupStrategy:recipe.cleanupStrategy,
    entities:recipe.entities.map(entity=>({entityKey:entity.entityKey,modelId:entity.modelId,dependsOn:entity.dependsOn,setup:action(entity.actionId),
      readback:entity.readback?action(entity.readback.actionId):null,cleanup:entity.cleanup?action(entity.cleanup.actionId):null,
      absenceReadback:entity.cleanup?action(entity.cleanup.absenceReadback.actionId):null}))};
}
