import { z } from 'zod';
import { BrowserLocator } from './browser.ts';
import { CaseSpec, Persona, SeedEntity, RegisteredAction } from './definitions.ts';
import { EnvironmentBinding, Outcome, StepResult, SelectionManifest, Coverage } from './execution.ts';
import { DigestSchema, IdString, IsoDateTime, RefSchema, ScopeSchema, ShortText, refList, idList } from '../primitives.ts';

export const WorkflowMapStep = z.object({
  stepId: IdString, operation: ShortText, declaredRoute: z.string().max(4096).nullable(),
  declaredLandmark: BrowserLocator.nullable(),
  observation: z.object({ result: StepResult, reasonCode: ShortText.nullable(),
    observedRoute: z.string().max(4096).nullable(), browserCommandObserved: z.boolean(),
    inputDigest: DigestSchema, outputDigest: DigestSchema.nullable(), eventIds: idList(),
  }).strict().nullable(),
}).strict();
export type WorkflowMapStep = z.infer<typeof WorkflowMapStep>;
const RecipeOperation = RegisteredAction.pick({actionId:true,effect:true,method:true,path:true});
export const WorkflowFixtureKnowledge = z.object({basis:z.literal('declared_recipe'),planRef:RefSchema,recipeRef:RefSchema,actionRegistryRef:RefSchema,
  cleanupStrategy:z.literal('reverse_dependency_order'),entities:z.array(z.object({entityKey:IdString,modelId:IdString,
    dependsOn:SeedEntity.shape.dependsOn,setup:RecipeOperation,readback:RecipeOperation.nullable(),cleanup:RecipeOperation.nullable(),absenceReadback:RecipeOperation.nullable(),
  }).strict()).max(500)}).strict();
export const WorkflowMapEntry = z.object({
  selectionCellId: IdString, required: z.boolean(), caseRef: RefSchema, workflowId: IdString,
  purpose: CaseSpec.shape.purpose, surface: CaseSpec.shape.surface,
  surfaceBindingRef:RefSchema,variantRef:RefSchema.nullable(),navigationRef:RefSchema.nullable(),
  aliases: z.array(ShortText).max(1024), coverageTags: z.array(IdString).max(4096),
  declaredSourceRefs: refList(),
  prerequisites: z.object({ personaRef: RefSchema, roleScopes: Persona.shape.roleScopes, traits: Persona.shape.traits,
    recipeRefs: refList(32), fixturePlanRef: RefSchema.nullable(), cleanupRecipeRef: RefSchema.nullable(),fixture:WorkflowFixtureKnowledge.nullable(),
  }).strict(),
  environmentRef: RefSchema, expectedTarget: EnvironmentBinding.shape.expected,
  recordedTarget: EnvironmentBinding.shape.observed,
  gaps:z.array(z.object({stepId:IdString.nullable(),reason:z.enum(['receipt_unavailable','target_unobserved','landmark_unobserved','step_unobserved'])}).strict()).max(2048),
  receipt: z.object({ ref: RefSchema, eventsDigest: DigestSchema, finalizedAt: IsoDateTime, outcome: Outcome, proofEligible: z.boolean() }).strict().nullable(),
  steps: z.array(WorkflowMapStep).max(1024),
  transitions: z.array(z.object({ fromStepId: IdString, toStepId: IdString,
    basis: z.literal('declared_sequence'), bothCommandsCompleted: z.boolean() }).strict()).max(1024),
  assertionCoverage: z.array(z.object({ assertionId: IdString, stepId: IdString, required: z.boolean(),phase:z.enum(['precondition','assertion']),
    tags: idList(32), result: z.enum(['pass','fail','not_observed','not_applicable']).nullable() }).strict()).max(1024),
}).strict();
export type WorkflowMapEntry = z.infer<typeof WorkflowMapEntry>;
export const WorkflowKnowledge = z.object({
  schemaVersion: z.literal('tracegrove.workflow-knowledge/v1'), ref: RefSchema, scope: ScopeSchema,
  operation: z.literal('read_only'), authority: z.literal('none'), issuerTrust: z.literal('not_authenticated'),
  freshness: z.literal('recorded_only_revalidate_at_execution'), qualification: z.literal('not_evaluated'),
  evidence: z.object({ manifestDigest: DigestSchema, requestRef: RefSchema, selectionRef: RefSchema, campaignRef: RefSchema,
    campaignOutcome:Outcome,coverage:Coverage }).strict(),
  workflows: z.array(WorkflowMapEntry).max(500), excludedCells:SelectionManifest.shape.excludedCells,
}).strict();
export type WorkflowKnowledge = z.infer<typeof WorkflowKnowledge>;
export const WorkflowKnowledgeQuery = z.object({ text: z.string().min(1).max(256).optional(),
  caseId: IdString.optional(), workflowId: IdString.optional(), route: z.string().min(1).max(4096).startsWith('/').optional(),
  surface: CaseSpec.shape.surface.optional(), tag: IdString.optional(),
  limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(1024).optional(),
}).strict();
export type WorkflowKnowledgeQuery = z.input<typeof WorkflowKnowledgeQuery>;
export const WorkflowKnowledgePage = z.object({ schemaVersion: z.literal('tracegrove.workflow-knowledge-page/v1'),
  snapshotRef: RefSchema, operation: z.literal('read_only'), authority: z.literal('none'),
  evidence:WorkflowKnowledge.shape.evidence,
  freshness: z.literal('recorded_only_revalidate_at_execution'), results: z.array(WorkflowMapEntry).max(100),
  total: z.number().int().nonnegative().max(500), cursor: z.string().max(1024).nullable(),
}).strict();
export type WorkflowKnowledgePage = z.infer<typeof WorkflowKnowledgePage>;
