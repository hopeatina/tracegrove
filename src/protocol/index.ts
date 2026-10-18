import { z } from 'zod';
import { CliErrorReport } from './schemas/cli.ts';
import { RecoveryStatusReport } from './schemas/recoveryStatus.ts';
import { ReplayComparison } from './schemas/replayComparison.ts';
import { AttemptInventoryReport } from './schemas/attemptInventory.ts';
import { RegressionAdmission } from './schemas/regression.ts';
import { ImportedObservations } from './schemas/importedObservations.ts';
import * as C from './schemas/capability.ts';
import * as L from './schemas/capabilityLifecycle.ts';
import * as P from './schemas/portableEnvironment.ts';
import * as D from './schemas/definitions.ts';
import * as E from './schemas/execution.ts';
import { Suite, WorkflowConfig } from './schemas/config.ts';
import { HostFrame, PluginFrame } from './schemas/protocol.ts';
import { CorpusManifest } from './schemas/corpus.ts';
import { CleanupExpectationSchema, CleanupFollowupSchema, SignedCleanupFollowupSchema, WorkflowOwnershipSchema } from './schemas/cleanup.ts';
import { SourcePlan, PlanReview, PlanEditProjection } from './schemas/review.ts';
import { ScenarioPromotion } from './schemas/promotion.ts';
import { RevisionMatrix, ChangeModel, PlanSourceValidation } from './schemas/source.ts';
import { GitSourceRequest, GitSourceResolution, GitSourceSnapshot } from './schemas/gitSources.ts';
import { BrowserCommand, BrowserLocator, BrowserObservation, BrowserNetworkObservation } from './schemas/browser.ts';
import { NativeJobAction, NativeJobObservation, NativeJobRequest, NativeJobResponse, NativeJobReady } from './schemas/nativeJob.ts';
import { ResultIngestReceipt } from './schemas/resultSink.ts';
import { WorkflowEvidenceProjection } from './schemas/evidenceProjection.ts';
import { McpToolCall, McpToolObservation } from './schemas/mcp.ts';
import { ScenarioDefinition, ScenarioProjection, QualificationRoundAdmission, QualificationRound, QualificationPolicy,
  ReplayFinding, ReplayAssessment, ScenarioReplayAssessment, ScenarioRevisionToken, QualificationRoundIntent,
  ScenarioActivationIntent, ScenarioActivation, ScenarioStructuralValidation } from './schemas/scenario.ts';

export * from './schemas/capability.ts';
export * from './schemas/cli.ts';
export * from './schemas/recoveryStatus.ts';
export * from './schemas/replayComparison.ts';
export * from './schemas/attemptInventory.ts';
export * from './schemas/regression.ts';
export * from './schemas/importedObservations.ts';
export * from './schemas/capabilityLifecycle.ts';
export * from './schemas/portableEnvironment.ts';
export * from './canonical.ts';
export * from './primitives.ts';
export * from './schemas/definitions.ts';
export * from './schemas/execution.ts';
export * from './schemas/config.ts';
export * from './schemas/protocol.ts';
export * from './schemas/corpus.ts';
export * from './schemas/cleanup.ts';
export * from './schemas/review.ts';
export * from './schemas/promotion.ts';
export * from './schemas/source.ts';
export * from './schemas/gitSources.ts';
export * from './schemas/browser.ts';
export * from './schemas/mcp.ts';
export * from './schemas/nativeJob.ts';
export * from './schemas/resultSink.ts';
export * from './schemas/evidenceProjection.ts';
export * from './schemas/scenario.ts';

/** Every versioned document schema, keyed by its `schemaVersion` literal. */
export const SCHEMA_REGISTRY = {
  'tracegrove.imported-observations/v1': ImportedObservations,
  'workflow.regression-admission/v1': RegressionAdmission,
  'workflow.result-ingest/v1': ResultIngestReceipt,
  'workflow.evidence-projection/v1': WorkflowEvidenceProjection,
  'workflow.config/v1': WorkflowConfig,
  'workflow.suite/v1': Suite,
  'workflow.corpus/v1': CorpusManifest,
  'workflow.source-plan/v1': SourcePlan,
  'workflow.plan-review/v1': PlanReview,
  'workflow.scenario-promotion/v1': ScenarioPromotion,
  'workflow.revisions/v1': RevisionMatrix,
  'workflow.change-model/v1': ChangeModel,
  'workflow.source-validation/v1': PlanSourceValidation,
  'workflow.scenario/v1': ScenarioDefinition,
  'workflow.qualification-admission/v1': QualificationRoundAdmission,
  'workflow.qualification-round/v1': QualificationRound,
  'workflow.qualification-policy/v1': QualificationPolicy,
  'workflow.replay-finding/v1': ReplayFinding,
  'workflow.replay-assessment/v1': ReplayAssessment,
  'workflow.scenario-activation/v1': ScenarioActivation,
  'workflow.scenario-structure/v1': ScenarioStructuralValidation,
  'workflow.git-source-resolution/v1': GitSourceResolution,
  'workflow.git-source-snapshot/v1': GitSourceSnapshot,
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
  'tracegrove.cli-error/v1': CliErrorReport,
  'tracegrove.recovery-status/v1': RecoveryStatusReport,
  'tracegrove.replay-comparison/v1': ReplayComparison,
  'tracegrove.attempt-inventory/v1': AttemptInventoryReport,
  'workflow.portable-environment-profile/v1': P.PortableEnvironmentProfile,
  'workflow.portable-environment-intent/v1': P.PortableEnvironmentIntent,
  'workflow.portable-preflight/v1': P.PortablePreflightReport,
  'workflow.capability-replay-plan/v1': L.CapabilityReplayPlan,
  'workflow.capability-retry-policy/v1': L.CapabilityRetryPolicy,
  'workflow.capability-retry-state/v1': L.CapabilityRetryState,
  'workflow.capability-lifecycle-checkpoint/v1': L.CapabilityLifecycleCheckpoint,
  'workflow.capability-artifact-manifest/v1': L.CapabilityArtifactManifest,
  'workflow.capability-descriptor/v1': C.CapabilityDescriptor,
  'workflow.scoped-resource/v1': C.ScopedResource,
  'workflow.capability-operation/v1': C.CapabilityOperation,
  'workflow.capability-observation/v1': C.CapabilityObservation,
  'workflow.stream-transcript/v1': C.StreamTranscript,
  'workflow.native-job-action/v1': NativeJobAction,
  'workflow.native-job-observation/v1': NativeJobObservation,
  'workflow.mcp-tool-call/v1': McpToolCall,
  'workflow.mcp-tool-observation/v1': McpToolObservation,
  'workflow.native-job-request/v1': NativeJobRequest,
  'workflow.native-job-response/v1': NativeJobResponse,
  'workflow.native-job-ready/v1': NativeJobReady,
  'workflow.browser-command/v1': BrowserCommand,
  'workflow.browser-locator/v1': BrowserLocator,
  'workflow.browser-observation/v1': BrowserObservation,
  'workflow.browser-network-observation/v1': BrowserNetworkObservation,
  'workflow.ownership/v1': WorkflowOwnershipSchema,
  'workflow.cleanup-expectation/v1': CleanupExpectationSchema,
  'workflow.cleanup-followup/v1': CleanupFollowupSchema,
  'workflow.signed-cleanup-followup/v1': SignedCleanupFollowupSchema,
  'workflow.plan-edit-projection/v1': PlanEditProjection,
  'workflow.scenario-projection/v1': ScenarioProjection,
  'workflow.scenario-revision-token/v1': ScenarioRevisionToken,
  'workflow.qualification-intent/v1': QualificationRoundIntent,
  'workflow.scenario-replay-assessment/v1': ScenarioReplayAssessment,
  'workflow.scenario-activation-intent/v1': ScenarioActivationIntent,
  'workflow.git-source-request/v1': GitSourceRequest,
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
