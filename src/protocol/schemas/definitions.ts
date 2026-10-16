/**
 * Reviewed, immutable authoring definitions: case, persona, auth recipe, action registry,
 * seed recipe, fidelity profile, surface pack/binding, component profile, environment plan,
 * host plan. Each carries `schemaVersion`, `ref` and `scope`; `ref.digest` is the self digest.
 */
import { z } from 'zod';
import {
  Cents, IdString, IsoDateTime, JsonValue, LIMITS, Millis, NonNegInt, PositiveInt, PositiveMillis,
  RefSchema, ScopeSchema, ShortText, Text, UrlString, idList, refList,
} from '../primitives.ts';

const defined = <V extends string>(version: V) => ({
  schemaVersion: z.literal(version),
  ref: RefSchema,
  scope: ScopeSchema,
});

export const EnvironmentClass = z.enum([
  'isolated_candidate', 'deployed_preview', 'deployed_canary', 'production_observation',
]);

export const BoundaryMode = z.enum(['real', 'stubbed', 'recorded_replay', 'synthetic_runtime']);
export const FidelityLane = z.enum([
  'mock_contract', 'recorded_replay', 'hybrid_live_product', 'full_live_sandbox', 'full_live_canary',
]);
export const AccountClass = z.enum(['local', 'test_sandbox', 'designated_production', 'none']);

// ---------- variables, predicates, steps ----------

export const VariableSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: JsonValue }).strict(),
  z.object({ kind: z.literal('fixture'), entityKey: IdString, outputName: IdString }).strict(),
  z.object({ kind: z.literal('capture'), stepId: IdString, name: IdString }).strict(),
  z.object({ kind: z.literal('credential'), name: IdString }).strict(),
  z.object({ kind: z.literal('runtime'), name: z.enum(['execution_nonce', 'lease_namespace', 'target_origin']) }).strict(),
]);
export type VariableSource = z.infer<typeof VariableSource>;

export const JsonPath = z.string().min(1).max(LIMITS.shortText).regex(/^[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?)*$/);

export const Predicate: z.ZodType<PredicateT> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('status_equals'), value: z.number().int().min(100).max(599) }).strict(),
    z.object({ kind: z.literal('json_path_equals'), path: JsonPath, value: JsonValue }).strict(),
    z.object({ kind: z.literal('json_path_present'), path: JsonPath }).strict(),
    z.object({ kind: z.literal('json_path_absent'), path: JsonPath }).strict(),
    z.object({ kind: z.literal('json_path_count'), path: JsonPath, count: NonNegInt }).strict(),
    z.object({ kind: z.literal('step_result'), value: z.enum(['completed', 'failed', 'not_run', 'cancelled']) }).strict(),
    z.object({ kind: z.literal('all'), predicates: z.array(Predicate).min(1).max(32) }).strict(),
  ]),
);
export type PredicateT =
  | { kind: 'status_equals'; value: number }
  | { kind: 'json_path_equals'; path: string; value: unknown }
  | { kind: 'json_path_present'; path: string }
  | { kind: 'json_path_absent'; path: string }
  | { kind: 'json_path_count'; path: string; count: number }
  | { kind: 'step_result'; value: 'completed' | 'failed' | 'not_run' | 'cancelled' }
  | { kind: 'all'; predicates: PredicateT[] };

export const HttpAuth = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('persona') }).strict(),
  z.object({ kind: z.literal('credential'), name: IdString }).strict(),
]);
export const HttpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
export const Capture = z.object({
  name: IdString,
  from: z.enum(['status', 'json', 'header']),
  path: z.string().max(LIMITS.shortText).nullable(),
}).strict();
export const HttpTemplatePath = z.string().min(1).max(LIMITS.url).regex(/^\//);

const stepCommon = {
  id: IdString,
  timeoutMs: PositiveMillis,
  inputs: z.record(IdString, VariableSource),
  retry: z.object({ attempts: z.number().int().min(1).max(3) }).strict(),
};

export const HttpRequestStep = z.object({
  ...stepCommon,
  kind: z.literal('http.request'),
  method: HttpMethod,
  path: HttpTemplatePath,
  headers: z.record(z.string().max(100), z.string().max(LIMITS.text)),
  body: JsonValue.nullable(),
  auth: HttpAuth,
  expectStatus: z.number().int().min(100).max(599).nullable(),
  captures: z.array(Capture).max(32),
}).strict();

export const HttpReadback = z.object({
  kind: z.literal('http'),
  method: z.enum(['GET', 'HEAD']),
  path: HttpTemplatePath,
  auth: HttpAuth,
}).strict();

export const ObserveStep = z.object({
  ...stepCommon,
  kind: z.literal('observe'),
  readback: HttpReadback,
  predicate: Predicate,
  pollIntervalMs: PositiveMillis,
  captures: z.array(Capture).max(32),
}).strict();

/** Declared but unimplemented in the HTTP runner; capability checks must block these. */
export const UnsupportedStep = z.object({
  ...stepCommon,
  kind: z.enum(['ui.navigate', 'ui.action', 'job.submit', 'integration.action', 'mcp.call', 'widget.action', 'native.action', 'computer.action']),
  parameters: z.record(z.string().max(LIMITS.id), JsonValue),
}).strict();

export const Step = z.discriminatedUnion('kind', [HttpRequestStep, ObserveStep, UnsupportedStep]);
export type Step = z.infer<typeof Step>;

export const Assertion = z.object({
  id: IdString,
  required: z.boolean(),
  environmentClasses: z.array(EnvironmentClass).min(1).max(4),
  oracle: z.object({ name: z.enum(['http.observation', 'step.result']), version: z.literal('1') }).strict(),
  stepId: IdString,
  predicate: Predicate,
  coverageTags: idList(32),
}).strict();
export type Assertion = z.infer<typeof Assertion>;

export const ActionEnvelope = z.object({
  mode: z.enum(['read_only', 'designated_writes']),
  allowedHosts: z.array(ShortText).max(32),
  allowedMethods: z.array(HttpMethod).max(6),
  allowedResourcePrefixes: z.array(z.string().max(LIMITS.shortText)).max(64),
  maxCreates: NonNegInt,
  maxMessages: NonNegInt,
  maxJobs: NonNegInt,
  cleanupRecipeRef: RefSchema.nullable(),
}).strict();

export const Limits = z.object({
  deadlineMs: PositiveMillis,
  maxProviderRequests: NonNegInt,
  maxTokens: NonNegInt,
  costCeilingCents: Cents,
  maxBrowserActions: NonNegInt,
  maxArtifactBytes: NonNegInt,
  diagnosticRetries: z.number().int().min(0).max(3),
  concurrencyGroup: IdString,
}).strict();
export type Limits = z.infer<typeof Limits>;

export const CaseSpec = z.object({
  ...defined('workflow.case/v1'),
  purpose: Text,
  workflowId: IdString,
  requirementRefs: refList(),
  sourceRefs: refList(),
  sourceAnalysisRef: RefSchema.nullable(),
  risk: z.enum(['critical', 'standard', 'exploratory']),
  surface: z.enum(['ui', 'api', 'job', 'integration', 'hybrid']),
  surfaceBindingRef: RefSchema,
  proofClaim: Text,
  environmentClasses: z.array(EnvironmentClass).min(1).max(4),
  requiredCapabilities: idList(64),
  requiredBoundaries: z.array(z.object({ boundaryId: IdString, mode: BoundaryMode }).strict()).max(32),
  dependencyCases: refList(),
  personaRef: RefSchema,
  datasetRef: RefSchema.nullable(),
  fixturePlanRef: RefSchema.nullable(),
  navigationRef: RefSchema.nullable(),
  preconditions: z.array(Assertion).max(64),
  steps: z.array(Step).min(1).max(LIMITS.list),
  assertions: z.array(Assertion).min(1).max(LIMITS.list),
  effects: ActionEnvelope,
  limits: Limits,
  capture: z.object({
    stepEvents: z.literal(true),
    networkMetadata: z.literal(true),
    trace: z.enum(['required', 'failure', 'optional']),
    video: z.enum(['required', 'failure', 'optional']),
    redactionPolicyRef: RefSchema.nullable(),
    retentionPolicyRef: RefSchema.nullable(),
  }).strict(),
  baselineRef: RefSchema.nullable(),
  generation: z.object({
    agent: ShortText,
    requestedModel: ShortText,
    observedModel: ShortText.nullable(),
    promptDigest: z.object({ algorithm: z.literal('sha256'), hex: z.string() }).strict(),
    changeDigest: z.object({ algorithm: z.literal('sha256'), hex: z.string() }).strict(),
    sourceMapRefs: refList(),
  }).strict().nullable(),
}).strict();
export type CaseSpec = z.infer<typeof CaseSpec>;

// ---------- persona and auth ----------

export const AuthRecipe = z.object({
  ...defined('workflow.auth-recipe/v1'),
  kind: z.enum(['none', 'host_issued', 'env_credential']),
  credentialName: IdString.nullable(),
  header: z.enum(['authorization']).nullable(),
  scheme: z.enum(['Bearer']).nullable(),
}).strict();
export type AuthRecipe = z.infer<typeof AuthRecipe>;

export const Persona = z.object({
  ...defined('workflow.persona/v1'),
  traits: idList(32),
  accountBindingRef: RefSchema.nullable(),
  roleScopes: idList(32),
  stateRecipeRef: RefSchema.nullable(),
  dataVolumeRecipeRef: RefSchema.nullable(),
  entitlementRef: RefSchema.nullable(),
  connectorStateRef: RefSchema.nullable(),
  authRecipeRef: RefSchema,
  locale: z.string().min(2).max(16),
  timezone: z.string().min(1).max(64),
  viewport: z.object({ width: PositiveInt, height: PositiveInt }).strict(),
  inputMode: z.enum(['pointer', 'touch', 'keyboard']),
  reducedMotion: z.boolean(),
  cleanupPolicyRef: RefSchema.nullable(),
}).strict();
export type Persona = z.infer<typeof Persona>;

// ---------- action registry and seed recipe ----------

export const RegisteredAction = z.object({
  actionId: IdString,
  kind: z.literal('http.request'),
  effect: z.enum(['create', 'read', 'update', 'delete', 'invoke']),
  method: HttpMethod,
  path: HttpTemplatePath,
  body: JsonValue.nullable(),
  auth: HttpAuth,
  expectStatus: z.number().int().min(100).max(599).nullable(),
  captures: z.array(Capture).max(32),
}).strict();

export const ActionRegistry = z.object({
  ...defined('workflow.action-registry/v1'),
  actions: z.array(RegisteredAction).min(1).max(LIMITS.list),
}).strict();
export type ActionRegistry = z.infer<typeof ActionRegistry>;

export const SeedValue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: JsonValue }).strict(),
  z.object({ kind: z.literal('entity_ref'), entityKey: IdString, outputName: IdString }).strict(),
  z.object({ kind: z.literal('generator'), generatorId: z.enum(['uuid', 'slug', 'words', 'int']), args: z.record(z.string().max(32), JsonValue) }).strict(),
  z.object({ kind: z.literal('runtime_binding'), name: z.enum(['execution_nonce', 'lease_namespace']) }).strict(),
]);
export type SeedValue = z.infer<typeof SeedValue>;

export const SeedEntity = z.object({
  entityKey: IdString,
  modelId: IdString,
  actionId: IdString,
  dependsOn: idList(32),
  traits: idList(16),
  values: z.record(IdString, SeedValue),
  outputNames: idList(32),
  readback: z.object({ actionId: IdString, predicate: Predicate }).strict().nullable(),
  cleanup: z.object({ actionId: IdString, absenceReadback: z.object({ actionId: IdString, expectStatus: z.number().int().min(100).max(599) }).strict() }).strict().nullable(),
}).strict();

export const SeedRecipe = z.object({
  ...defined('workflow.seed-recipe/v1'),
  intent: Text,
  modelCatalogRef: RefSchema.nullable(),
  actionRegistryRef: RefSchema,
  entities: z.array(SeedEntity).min(1).max(LIMITS.list),
  relationBindings: z.array(z.object({ relationId: IdString, fromEntity: IdString, toEntity: IdString }).strict()).max(LIMITS.list),
  cleanupStrategy: z.enum(['reverse_dependency_order']),
  lifecyclePolicy: z.enum(['application_api']),
  generation: z.object({
    logicalSeed: ShortText,
    generatorVersion: z.literal('1'),
    locale: z.string().min(2).max(16),
    timezone: z.string().min(1).max(64),
    logicalClock: IsoDateTime,
  }).strict(),
}).strict();
export type SeedRecipe = z.infer<typeof SeedRecipe>;

export const LogicalPayload = z.object({
  ...defined('workflow.logical-payload/v1'),
  seedRecipeRef: RefSchema,
  entities: z.array(z.object({ entityKey: IdString, values: z.record(IdString, JsonValue) }).strict()).max(LIMITS.list),
}).strict();
export type LogicalPayload = z.infer<typeof LogicalPayload>;

export const CaseFixturePlan = z.object({
  ...defined('workflow.fixture-plan/v1'),
  kind: z.literal('case'),
  seedRecipeRef: RefSchema,
  modelCatalogRef: RefSchema.nullable(),
  logicalPayloadRef: RefSchema,
  outputBindingsSchemaRef: RefSchema.nullable(),
  effectEnvelopeRef: RefSchema.nullable(),
  limitPolicyRef: RefSchema.nullable(),
}).strict();
export type CaseFixturePlan = z.infer<typeof CaseFixturePlan>;

export const CampaignFixturePlan = z.object({
  ...defined('workflow.fixture-plan/v1'),
  kind: z.literal('campaign'),
  selectionManifestRef: RefSchema,
  cells: z.array(z.object({ selectionCellId: IdString, caseFixturePlanRef: RefSchema.nullable() }).strict()).max(LIMITS.list),
}).strict();
export type CampaignFixturePlan = z.infer<typeof CampaignFixturePlan>;

// ---------- fidelity ----------

export const BoundaryRule = z.object({
  boundaryId: IdString,
  adapterRef: RefSchema.nullable(),
  mode: BoundaryMode,
  required: z.boolean(),
  exclusionReasonRef: RefSchema.nullable(),
  accountClass: AccountClass,
  readbackOracleRef: RefSchema.nullable(),
  interceptorRef: RefSchema.nullable(),
}).strict();
export type BoundaryRule = z.infer<typeof BoundaryRule>;

export const FidelityProfile = z.object({
  ...defined('workflow.fidelity-profile/v1'),
  lane: FidelityLane,
  boundaryProfileRef: RefSchema.nullable(),
  boundaryRules: z.array(BoundaryRule).min(1).max(64),
}).strict();
export type FidelityProfile = z.infer<typeof FidelityProfile>;

export const FidelityPlan = z.object({
  ...defined('workflow.fidelity-plan/v1'),
  profileRef: RefSchema,
  selectionManifestRef: RefSchema,
  cells: z.array(z.object({
    selectionCellId: IdString,
    lane: FidelityLane,
    boundaryProfileRef: RefSchema.nullable(),
    boundaries: z.array(BoundaryRule).min(1).max(64),
    claimBoundaryIds: idList(64).min(1),
  }).strict()).max(LIMITS.list),
}).strict();
export type FidelityPlan = z.infer<typeof FidelityPlan>;

// ---------- surfaces and components ----------

export const SurfacePack = z.object({
  ...defined('workflow.surface-pack/v1'),
  kind: z.enum(['web', 'http_api', 'job', 'integration', 'mcp', 'mcp_widget', 'ios', 'android']),
  protocol: z.enum(['playwright', 'cdp', 'http', 'native_job', 'integration', 'computer_use', 'mcp', 'mcp_widget', 'mobile']),
  stepKinds: idList(32).min(1),
  oracles: idList(32).min(1),
  captureFormats: idList(16),
}).strict();
export type SurfacePack = z.infer<typeof SurfacePack>;

export const SurfaceBinding = z.object({
  ...defined('workflow.surface-binding/v1'),
  kind: z.enum(['web', 'http_api', 'job', 'integration', 'mcp', 'mcp_widget', 'ios', 'android']),
  packRef: RefSchema,
  driverProfileRef: RefSchema.nullable(),
  componentProfileRef: RefSchema,
  interaction: z.enum(['semantic', 'computer_use', 'protocol', 'native_ui', 'hybrid']),
  configurationSchemaRef: RefSchema.nullable(),
  configurationRef: RefSchema.nullable(),
  variantPolicyRef: RefSchema.nullable(),
  requiredCapabilities: idList(64),
}).strict();
export type SurfaceBinding = z.infer<typeof SurfaceBinding>;

export const ComponentKind = z.enum([
  'application', 'service', 'worker', 'schema', 'flag_set', 'protocol_server', 'host', 'widget',
  'mobile_binary', 'device_runtime', 'model_endpoint', 'other',
]);

export const ComponentIdentity = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('source_digest'), sourceDigest: z.object({ algorithm: z.literal('sha256'), hex: z.string().regex(/^[0-9a-f]{64}$/) }).strict(), runtime: ShortText }).strict(),
  z.object({ kind: z.literal('declared_release'), release: ShortText }).strict(),
]);
export type ComponentIdentity = z.infer<typeof ComponentIdentity>;

export const ComponentProfile = z.object({
  ...defined('workflow.component-profile/v1'),
  components: z.array(z.object({
    componentId: IdString,
    kind: ComponentKind,
    required: z.boolean(),
    expectedIdentity: ComponentIdentity.nullable(),
    exclusionReason: Text.nullable(),
  }).strict()).min(1).max(64),
}).strict();
export type ComponentProfile = z.infer<typeof ComponentProfile>;

export const EnvironmentPlan = z.object({
  ...defined('workflow.environment-plan/v1'),
  class: EnvironmentClass,
  origins: z.array(UrlString).min(1).max(16), // `launch://<componentId>` resolves at kickoff
  componentProfileRef: RefSchema,
  credentialRecipeRef: RefSchema,
  actionEnvelopeRef: RefSchema.nullable(),
  personaLeasePolicyRef: RefSchema.nullable(),
  budgetPolicyRef: RefSchema.nullable(),
  networkProfileRef: RefSchema.nullable(),
  clockProfileRef: RefSchema.nullable(),
}).strict();
export type EnvironmentPlan = z.infer<typeof EnvironmentPlan>;

export const LaunchRecipe = z.object({
  componentId: IdString,
  command: ShortText,
  args: z.array(z.string().max(LIMITS.shortText)).max(32),
  cwd: z.string().max(LIMITS.shortText),
  env: z.record(z.string().max(64), z.string().max(LIMITS.text)),
  portEnv: z.string().min(1).max(64),
  dataDirEnv: z.string().min(1).max(64),
  credentialsEnv: z.string().min(1).max(64),
  readiness: z.object({ path: HttpTemplatePath, timeoutMs: PositiveMillis }).strict(),
  identitySourceFiles: z.array(z.string().max(LIMITS.shortText)).min(1).max(256),
  issuedCredentials: z.array(z.object({ name: IdString, subject: ShortText }).strict()).max(32),
  // reported (absent): the app prints `listening <port>` after binding PORT=0.
  // assigned: the launcher reserves a free loopback port, substitutes {port}/{dataDir}
  // in args and env values, and waits on the readiness path alone.
  portMode: z.enum(['reported', 'assigned']).optional(),
  runtime: ShortText.optional(), // compiler-observed hint; launch attestation uses a fresh interpreter probe
}).strict();
export type LaunchRecipe = z.infer<typeof LaunchRecipe>;

export const RunnerProfile = z.object({
  ...defined('workflow.runner-profile/v1'),
  adapter: z.enum(['http']),
  maxStepsPerCase: PositiveInt,
  cancellation: z.enum(['confirmed', 'best_effort']),
}).strict();
export type RunnerProfile = z.infer<typeof RunnerProfile>;

export const HostPlan = z.object({
  ...defined('workflow.host-plan/v1'),
  placement: z.enum(['local', 'agent_cli', 'agent_cloud', 'container', 'managed_sandbox', 'cloud_vm', 'customer_ci', 'device_service']),
  adapter: z.enum(['local_process', 'mock_loopback']),
  launch: LaunchRecipe.nullable(), // null when the target is bound rather than launched
  mockResponsesRef: RefSchema.nullable(),
  transportPolicy: z.literal('in_process'),
  isolationPolicy: z.enum(['fresh_directory_and_port', 'none']),
  networkRules: z.array(ShortText).max(16),
  requestedResources: z.object({ cpu: NonNegInt, memoryMb: NonNegInt, diskMb: NonNegInt }).strict(),
  requiredCapabilities: idList(64),
  captureRequirements: idList(16),
  sessionLifetimeMs: PositiveMillis,
  cleanupReserveMs: PositiveMillis,
}).strict();
export type HostPlan = z.infer<typeof HostPlan>;

export const MockResponses = z.object({
  ...defined('workflow.mock-responses/v1'),
  routes: z.array(z.object({
    method: HttpMethod,
    path: HttpTemplatePath,
    status: z.number().int().min(100).max(599),
    body: JsonValue.nullable(),
    requireBearer: z.boolean(),
  }).strict()).min(1).max(LIMITS.list),
}).strict();
export type MockResponses = z.infer<typeof MockResponses>;

export const IntelligencePolicy = z.object({
  ...defined('workflow.intelligence-policy/v1'),
  stages: z.record(z.enum(['analysis', 'drafting', 'discovery', 'diagnosis', 'evaluation', 'benchmark']), z.object({
    allowed: z.boolean(),
    maxCalls: NonNegInt,
    maxTokens: NonNegInt,
    costCeilingCents: Cents,
  }).strict()),
  replayInference: z.literal('none'),
}).strict();
export type IntelligencePolicy = z.infer<typeof IntelligencePolicy>;

export const RunnerCapabilities = z.object({
  ref: RefSchema,
  operations: idList(64),
  oracles: idList(64),
  fixtureOperations: idList(64),
  faultOperations: idList(64),
  variableCaptureFormats: idList(16),
  cleanupOperations: idList(64),
  maxStepsPerCase: PositiveInt,
  environmentClasses: z.array(EnvironmentClass).min(1).max(4),
  captureFormats: idList(16),
  surfacePackRefs: refList(16),
  hostConstraintRef: RefSchema.nullable(),
  cancellation: z.enum(['confirmed', 'best_effort']),
  protocol: z.enum(['playwright', 'cdp', 'http', 'native_job', 'integration', 'computer_use', 'mcp', 'mcp_widget', 'mobile']),
  conformanceReceiptRef: RefSchema.nullable(),
}).strict();
export type RunnerCapabilities = z.infer<typeof RunnerCapabilities>;

export const Millis_ = Millis;
