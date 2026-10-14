import { z } from 'zod';
import * as D from './schemas/definitions.ts';
import * as E from './schemas/execution.ts';
import { Suite, WorkflowConfig } from './schemas/config.ts';
import { HostFrame, PluginFrame } from './schemas/protocol.ts';
import { CorpusManifest } from './schemas/corpus.ts';
import { CleanupExpectationSchema, CleanupFollowupSchema, SignedCleanupFollowupSchema, WorkflowOwnershipSchema } from './schemas/cleanup.ts';
import { SourcePlan, PlanReview, PlanEditProjection } from './schemas/review.ts';

export * from './canonical.ts';
export * from './primitives.ts';
export * from './schemas/definitions.ts';
export * from './schemas/execution.ts';
export * from './schemas/config.ts';
export * from './schemas/protocol.ts';
export * from './schemas/corpus.ts';
export * from './schemas/cleanup.ts';
export * from './schemas/review.ts';

/** Every versioned document schema, keyed by its `schemaVersion` literal. */
export const SCHEMA_REGISTRY = {
  'workflow.config/v1': WorkflowConfig,
  'workflow.suite/v1': Suite,
  'workflow.corpus/v1': CorpusManifest,
  'workflow.source-plan/v1': SourcePlan,
  'workflow.plan-review/v1': PlanReview,
  'workflow.case/v1': D.CaseSpec,
  'workflow.persona/v1': D.Persona,
  'workflow.auth-recipe/v1': D.AuthRecipe,
  'workflow.action-registry/v1': D.ActionRegistry,
  'workflow.seed-recipe/v1': D.SeedRecipe,
  'workflow.logical-payload/v1': D.LogicalPayload,
  'workflow.fixture-plan/v1': z.discriminatedUnion('kind', [D.CaseFixturePlan, D.CampaignFixturePlan]),
  'workflow.fidelity-profile/v1': D.FidelityProfile,
  'workflow.fidelity-plan/v1': D.FidelityPlan,
  'workflow.surface-pack/v1': D.SurfacePack,
  'workflow.surface-binding/v1': D.SurfaceBinding,
  'workflow.component-profile/v1': D.ComponentProfile,
  'workflow.environment-plan/v1': D.EnvironmentPlan,
  'workflow.host-plan/v1': D.HostPlan,
  'workflow.mock-responses/v1': D.MockResponses,
  'workflow.runner-profile/v1': D.RunnerProfile,
  'workflow.intelligence-policy/v1': D.IntelligencePolicy,
  'workflow.source-selection/v1': E.SourceSelection,
  'workflow.selection/v1': E.SelectionManifest,
  'workflow.request/v1': E.RunRequest,
  'workflow.effective-config/v1': E.EffectiveConfig,
  'workflow.host-observation/v1': E.HostCapabilityObservation,
  'workflow.host-lease/v1': E.HostLease,
  'workflow.identity-attestation/v1': E.IdentityAttestation,
  'workflow.environment/v1': E.EnvironmentBinding,
  'workflow.boundary-observation/v1': E.BoundaryObservation,
  'workflow.fixture-manifest/v1': E.FixtureManifest,
  'workflow.routing-decision/v1': E.RoutingDecision,
  'workflow.cost-observation/v1': E.CostObservation,
  'workflow.execution/v1': E.ExecutionReceipt,
  'workflow.campaign-result/v1': E.CampaignResult,
  'workflow.budget-reservation/v1': E.BudgetReservation,
  'workflow.credential-lease/v1': E.CredentialLease,
} as const;

export type SchemaVersion = keyof typeof SCHEMA_REGISTRY;

export const NON_DOCUMENT_SCHEMAS = {
  'workflow.ownership/v1': WorkflowOwnershipSchema,
  'workflow.cleanup-expectation/v1': CleanupExpectationSchema,
  'workflow.cleanup-followup/v1': CleanupFollowupSchema,
  'workflow.signed-cleanup-followup/v1': SignedCleanupFollowupSchema,
  'workflow.plan-edit-projection/v1': PlanEditProjection,
  'workflow.runner-capabilities/v1': D.RunnerCapabilities,
  'workflow.step-event/v1': E.StepEvent,
  'workflow.runner-protocol/v1.host': HostFrame,
  'workflow.runner-protocol/v1.plugin': PluginFrame,
} as const;

export class SchemaViolation extends Error {
  readonly issues: string[];
  constructor(schemaVersion: string, issues: string[]) {
    super(`${schemaVersion}: ${issues.join('; ')}`);
    this.name = 'SchemaViolation';
    this.issues = issues;
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`);
}

/** Validate an untrusted document against the schema its `schemaVersion` names. */
export function validateDocument(input: unknown): { schemaVersion: SchemaVersion; value: unknown } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SchemaViolation('<unknown>', ['document must be an object']);
  }
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'string' || !(version in SCHEMA_REGISTRY)) {
    throw new SchemaViolation(String(version), ['unknown schemaVersion']);
  }
  const schema = SCHEMA_REGISTRY[version as SchemaVersion] as z.ZodType<unknown>;
  const result = schema.safeParse(input);
  if (!result.success) throw new SchemaViolation(version, formatIssues(result.error));
  return { schemaVersion: version as SchemaVersion, value: result.data };
}

export function parseAs<T extends z.ZodType<unknown>>(schema: T, input: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new SchemaViolation(label, formatIssues(result.error));
  return result.data as z.infer<T>;
}

export function exportJsonSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries({ ...SCHEMA_REGISTRY, ...NON_DOCUMENT_SCHEMAS })) {
    out[name] = z.toJSONSchema(schema as z.ZodType<unknown>, { target: 'draft-2020-12' });
  }
  return out;
}
