/**
 * Execution-time records: frozen planning outputs, runtime bindings and sealed results.
 * These never embed their consuming receipt; requests reference admissions, never results.
 */
import { z } from 'zod';
import {
  Cents, DigestSchema, IdString, IsoDateTime, JsonValue, LIMITS, Millis, NonNegInt, PositiveInt,
  RefSchema, ScopeSchema, ShortText, Text, UrlString, idList, refList,
} from '../primitives.ts';
import { AccountClass, BoundaryMode, BoundaryRule, ComponentIdentity, ComponentKind, EnvironmentClass, FidelityLane, Limits } from './definitions.ts';
import { GitCommitObservation } from './gitSources.ts';

const record = <V extends string>(version: V) => ({
  schemaVersion: z.literal(version),
  ref: RefSchema,
  scope: ScopeSchema,
});

// ---------- source selection and target identity ----------

export const RepositoryOrigin = z.enum(['remote_object', 'snapshot_bundle']);

export const SourceSelection = z.object({
  ...record('workflow.source-selection/v1'),
  draftRevision: NonNegInt,
  strategy: z.enum(['pr_base', 'merge_base', 'commit_pair', 'deployed_baseline', 'head_only']),
  repositories: z.array(z.object({
    repositoryRole: IdString,
    canonicalUrl: UrlString,
    requestedExpression: ShortText,
    headCommit: z.string().regex(/^[0-9a-f]{40}$/),
    baseCommit: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    origin: RepositoryOrigin,
    sourceObjectsRef: RefSchema.nullable(),
    lockfileDigest: DigestSchema,
    resolvedAt: IsoDateTime,
    resolverRef: RefSchema.nullable(),
  }).strict()).max(32),
  excludedRoles: z.array(z.object({ repositoryRole: IdString, reasonRef: RefSchema.nullable() }).strict()).max(32),
  compatibilityRuleRefs: refList(32),
  revisionMatrixRef: RefSchema.nullable(),
}).strict();
export type SourceSelection = z.infer<typeof SourceSelection>;

export const TargetComponent = z.object({
  componentId: IdString,
  kind: ComponentKind,
  identity: ComponentIdentity.nullable(), // null only for an excluded component
}).strict();

export const TargetTuple = z.object({
  componentProfileRef: RefSchema,
  requiredComponents: idList(64),
  excludedComponents: z.array(z.object({ component: IdString, reason: Text }).strict()).max(64),
  components: z.array(TargetComponent).max(64),
  repositories: z.array(z.object({
    repositoryRole: IdString,
    canonicalUrl: UrlString,
    requestedRef: ShortText,
    resolvedCommit: z.string().regex(/^[0-9a-f]{40}$/),
    origin: RepositoryOrigin,
    sourceObjectsRef: RefSchema.nullable(),
    lockfileDigest: DigestSchema,
    dirty: z.literal(false),
  }).strict()).max(32),
  corpus: RefSchema,
  runner: RefSchema,
  evaluator: RefSchema,
  frontendRelease: ShortText.nullable(),
  backendRelease: ShortText.nullable(),
  workerRelease: ShortText.nullable(),
  schemaFingerprint: DigestSchema.nullable(),
  featureFlagsDigest: DigestSchema.nullable(),
  capabilityVersionsDigest: DigestSchema.nullable(),
  browserVersion: ShortText.nullable(),
  containerImageDigest: ShortText.nullable(),
  modelConfigDigest: DigestSchema.nullable(),
}).strict();
export type TargetTuple = z.infer<typeof TargetTuple>;

export const Provenance = z.object({
  runtime: z.enum(['live', 'replay', 'mocked']),
  data: z.enum(['seeded_real', 'sanitized_real', 'designated_production', 'mocked']),
  provider: z.enum(['live', 'replay', 'mocked', 'none']),
  faults: z.enum(['none', 'controlled']),
  interceptors: refList(32),
  injectedFaults: refList(32),
}).strict();
export type Provenance = z.infer<typeof Provenance>;

// ---------- selection, request ----------

export const SelectionCell = z.object({
  selectionCellId: IdString,
  required: z.boolean(),
  caseRef: RefSchema,
  personaRef: RefSchema,
  surfaceBindingRef: RefSchema,
  variantRef: RefSchema.nullable(), // null = explicit "no variant"
  sourceSelectionRef: RefSchema.nullable(),
  environmentRef: RefSchema,
  expectedTarget: TargetTuple,
  executionHostRef: RefSchema,
}).strict();

export const SelectionManifest = z.object({
  ...record('workflow.selection/v1'),
  policyRef: RefSchema.nullable(),
  cells: z.array(SelectionCell).max(LIMITS.list),
  excludedCells: z.array(z.object({ cellKey: IdString, reason: Text }).strict()).max(LIMITS.list),
}).strict();
export type SelectionManifest = z.infer<typeof SelectionManifest>;

export const RunRequest = z.object({
  schemaVersion: z.literal('workflow.request/v1'),
  ref: RefSchema,
  clientRequestId: IdString,
  idempotencyKey: IdString,
  requestedScope: ScopeSchema,
  campaignId: IdString,
  purpose: z.enum(['trial', 'work_proof', 'qualification', 'regression']),
  sourcePlanRef: RefSchema.nullable(),
  reviewRef: RefSchema.nullable(),
  scenarioRefs: refList(),
  qualificationRoundRef: RefSchema.nullable(),
  effectiveConfigRef: RefSchema,
  sourceSelectionRef: RefSchema.nullable(),
  executionHostRef: RefSchema.nullable(),
  intelligencePolicyRef: RefSchema,
  fidelityPlanRef: RefSchema,
  fixturePlanRef: RefSchema.nullable(),
  caseRefs: refList().min(1),
  personaRefs: refList().min(1),
  environmentRef: RefSchema.nullable(),
  expectedTarget: TargetTuple.nullable(),
  selectionManifestRef: RefSchema,
  workBinding: z.object({ workId: IdString, requirementRefs: refList() }).strict().nullable(),
  limits: Limits,
  replayOf: RefSchema.nullable(),
}).strict();
export type RunRequest = z.infer<typeof RunRequest>;

export const EffectiveConfig = z.object({
  ...record('workflow.effective-config/v1'),
  projectId: IdString,
  profileName: IdString,
  configDigest: DigestSchema,
  corpusRef: RefSchema,
  profile: JsonValue,
  overrides: JsonValue,
}).strict();
export type EffectiveConfig = z.infer<typeof EffectiveConfig>;

// ---------- runtime bindings ----------

export const HostCapabilityState = z.enum(['supported', 'unsupported', 'unknown', 'temporarily_unavailable']);

export const HostCapabilityObservation = z.object({
  ...record('workflow.host-observation/v1'),
  hostPlanRef: RefSchema,
  hostLeaseRef: RefSchema.nullable(),
  capabilities: z.array(z.object({
    capability: IdString,
    state: HostCapabilityState,
    probe: z.enum(['declared', 'probed']),
    evidenceRefs: refList(16),
  }).strict()).max(128),
  observedAt: IsoDateTime,
  expiresAt: IsoDateTime,
}).strict();
export type HostCapabilityObservation = z.infer<typeof HostCapabilityObservation>;

export const HostLease = z.object({
  ...record('workflow.host-lease/v1'),
  hostPlanRef: RefSchema,
  campaignId: IdString,
  executionId: IdString,
  attemptId: IdString,
  generation: NonNegInt,
  actorId: IdString,
  observedWorkspaceIdentityRef: RefSchema.nullable(),
  observedRuntimeIdentity: z.object({ node: ShortText, platform: ShortText, arch: ShortText, pid: NonNegInt.nullable() }).strict(),
  sessionHandleRef: RefSchema.nullable(),
  issuedAt: IsoDateTime,
  expiresAt: IsoDateTime,
}).strict();
export type HostLease = z.infer<typeof HostLease>;

export const RuntimeObservation = z.object({
  family: z.enum(['node', 'python']), version: z.string().regex(/^\d+\.\d+\.\d+$/),
  runtime: z.string().min(1).max(64), executable: z.string().min(1).max(4096),
  executableSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().superRefine((observation, ctx) => {
  const [major, minor] = observation.version.split('.');
  const expected = observation.family === 'node' ? `node${major}` : `python${major}.${minor}`;
  if (observation.runtime !== expected) ctx.addIssue({ code: 'custom', path: ['runtime'], message: 'Runtime identity disagrees with observed version' });
});
export type RuntimeObservation = z.infer<typeof RuntimeObservation>;

export const IdentityAttestation = z.object({
  ...record('workflow.identity-attestation/v1'),
  componentId: IdString,
  kind: ComponentKind,
  identity: ComponentIdentity,
  issuer: z.enum(['local_launcher', 'declared_binding']),
  trustPolicy: z.enum(['launcher_computed_source_digest', 'operator_declared_unverified']),
  evidence: z.object({ files: z.array(z.object({ path: z.string().max(LIMITS.shortText), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).max(256),
    runtimeProbe: RuntimeObservation.optional(), sourceSnapshotRef: RefSchema.optional(), gitSource: GitCommitObservation.optional(), observedHealthBody: JsonValue.nullable() }).strict(),
  observedAt: IsoDateTime,
}).strict().superRefine((attestation, ctx) => {
  if (attestation.identity.kind !== 'source_digest') return;
  const probe = attestation.evidence.runtimeProbe;
  if (probe && attestation.identity.runtime !== probe.runtime) {
    ctx.addIssue({ code: 'custom', path: ['identity', 'runtime'], message: 'Application identity disagrees with runtime probe' });
  }
  if (!probe && !/^node\d+$/.test(attestation.identity.runtime)) {
    ctx.addIssue({ code: 'custom', path: ['evidence', 'runtimeProbe'], message: 'A non-Node runtime requires an executable observation' });
  }
});
export type IdentityAttestation = z.infer<typeof IdentityAttestation>;

export const EnvironmentBinding = z.object({
  schemaVersion: z.literal('workflow.environment/v1'),
  ref: RefSchema,
  planRef: RefSchema,
  campaignId: IdString,
  executionId: IdString,
  attemptId: IdString,
  generation: NonNegInt,
  scope: ScopeSchema,
  class: EnvironmentClass,
  origins: z.array(UrlString).min(1).max(16),
  credentialLeaseRef: RefSchema,
  actionEnvelopeRef: RefSchema.nullable(),
  leaseExpiresAt: IsoDateTime,
  budgetReservationRef: RefSchema,
  admissionEvidenceRefs: refList(64),
  expected: TargetTuple,
  observed: TargetTuple.nullable(),
  provenance: Provenance,
  networkProfileRef: RefSchema.nullable(),
  clockProfileRef: RefSchema.nullable(),
}).strict();
export type EnvironmentBinding = z.infer<typeof EnvironmentBinding>;

export const BoundaryObservation = z.object({
  ...record('workflow.boundary-observation/v1'),
  campaignId: IdString,
  executionId: IdString,
  attemptId: IdString,
  selectionCellId: IdString,
  fidelityPlanRef: RefSchema,
  boundaryId: IdString,
  expectedMode: BoundaryMode,
  observedMode: z.union([BoundaryMode, z.literal('unknown')]),
  observedAccountClass: z.union([AccountClass, z.literal('unknown')]),
  adapterRef: RefSchema.nullable(),
  identityEvidenceRefs: refList(32),
  interactionEvidenceRefs: refList(64),
  resourceIdsRef: RefSchema.nullable(),
  interceptorRefs: refList(32),
  faultRefs: refList(32),
  observedAt: IsoDateTime,
  mismatchReasons: z.array(Text).max(32),
}).strict();
export type BoundaryObservation = z.infer<typeof BoundaryObservation>;

export const FixtureManifest = z.object({
  ...record('workflow.fixture-manifest/v1'),
  campaignId: IdString,
  executionId: IdString,
  attemptId: IdString,
  selectionCellId: IdString,
  campaignFixturePlanRef: RefSchema,
  caseFixturePlanRef: RefSchema,
  seedRecipeRef: RefSchema,
  logicalPayloadRef: RefSchema,
  materializedPayloadDigest: DigestSchema,
  observedSchemaIdentityRef: RefSchema.nullable(),
  migrationDigest: DigestSchema.nullable(),
  namespace: IdString,
  executionNonce: IdString,
  resourceLeaseRefs: refList(64),
  entities: z.array(z.object({
    entityKey: IdString,
    boundaryId: IdString,
    physicalId: ShortText,
    dataOrigin: z.enum(['generated_synthetic', 'sanitized_snapshot', 'designated_existing']),
    cleanupOwnership: z.enum(['allocated_by_attempt', 'borrowed_existing']),
    startingVersion: ShortText.nullable(),
    baselineRef: RefSchema.nullable(),
    compensationStrategyRef: RefSchema.nullable(),
    ownershipEvidenceRefs: refList(16),
    readbackEvidenceRefs: refList(16),
    cleanupHandle: z.object({ actionId: IdString, args: z.record(IdString, JsonValue) }).strict().nullable(),
  }).strict()).max(LIMITS.list),
  outputBindings: z.record(IdString, z.record(IdString, JsonValue)),
  lifecycleObservationRefs: refList(64),
  state: z.enum(['verified', 'failed', 'blocked', 'cancelled', 'unknown']),
  missingEntityKeys: idList(),
  unexpectedResourceRefs: refList(64),
  deadlineAt: IsoDateTime,
  finalizedAt: IsoDateTime,
}).strict();
export type FixtureManifest = z.infer<typeof FixtureManifest>;

// ---------- events and observations ----------

export const StepEvent = z.object({
  executionId: IdString,
  attemptId: IdString,
  generation: NonNegInt,
  sequence: NonNegInt,
  eventId: IdString,
  stepId: IdString.nullable(),
  kind: IdString,
  at: IsoDateTime,
  monotonicOffsetMs: NonNegInt,
  correlation: z.object({
    traceId: ShortText.nullable(),
    requestId: ShortText.nullable(),
    turnId: ShortText.nullable(),
    jobId: ShortText.nullable(),
    nativeRunId: ShortText.nullable(),
    providerRequestId: ShortText.nullable(),
  }).strict(),
  payloadDigest: DigestSchema,
  redactedPayload: z.record(z.string().max(LIMITS.id), JsonValue),
}).strict();
export type StepEvent = z.infer<typeof StepEvent>;

export const AssertionResult = z.enum(['pass', 'fail', 'not_observed', 'not_applicable']);

export const AssertionObservation = z.object({
  assertionId: IdString,
  required: z.boolean(),
  oracleRef: RefSchema,
  result: AssertionResult,
  reasonCode: ShortText.nullable(),
  actual: JsonValue,
  evidenceRefs: refList(32),
  producerRef: RefSchema,
  inputDigest: DigestSchema,
  observedFrom: IsoDateTime,
  observedTo: IsoDateTime,
  judge: z.object({
    requestedModel: ShortText,
    observedModel: ShortText.nullable(),
    rubricRef: RefSchema,
    confidence: z.number().min(0).max(1).nullable(),
    abstained: z.boolean(),
  }).strict().nullable(),
}).strict();
export type AssertionObservation = z.infer<typeof AssertionObservation>;

export const StepResult = z.enum(['completed', 'failed', 'not_run', 'cancelled']);

export const StepObservation = z.object({
  stepId: IdString,
  result: StepResult,
  reasonCode: ShortText.nullable(),
  eventIds: idList(),
  evidenceRefs: refList(32),
  inputDigest: DigestSchema,
  outputDigest: DigestSchema.nullable(),
  output: JsonValue.nullable(), // bounded, redacted observation the reducer evaluates
  timing: z.object({ startedAt: IsoDateTime, finishedAt: IsoDateTime, durationMs: NonNegInt }).strict().nullable(),
}).strict();
export type StepObservation = z.infer<typeof StepObservation>;

export const EvidenceArtifact = z.object({
  ref: RefSchema,
  privateObject: z.object({ provider: ShortText, bucket: ShortText, key: z.string().max(LIMITS.url) }).strict(),
  mediaType: ShortText,
  byteCount: NonNegInt,
  producerRef: RefSchema,
  stepIds: idList(),
  timeRange: z.object({ from: IsoDateTime, to: IsoDateTime }).strict(),
  redactionPolicyRef: RefSchema.nullable(),
  retentionPolicyRef: RefSchema.nullable(),
  accessPolicyRef: RefSchema.nullable(),
  derivativeOf: RefSchema.nullable(),
}).strict();
export type EvidenceArtifact = z.infer<typeof EvidenceArtifact>;

export const OperationOwner = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('authoring_job'), jobId: IdString }).strict(),
  z.object({ kind: z.literal('attempt'), campaignId: IdString, executionId: IdString, attemptId: IdString }).strict(),
]);

export const RoutingDecision = z.object({
  ...record('workflow.routing-decision/v1'),
  owner: OperationOwner,
  stage: z.enum(['analysis', 'drafting', 'discovery', 'diagnosis', 'evaluation', 'benchmark', 'replay']),
  inputDigest: DigestSchema,
  intelligencePolicyRef: RefSchema,
  catalogRef: RefSchema.nullable(),
  candidates: z.array(z.object({ modelId: ShortText, providerRoute: ShortText, eligible: z.boolean(), reasonCodes: idList(16) }).strict()).max(64),
  selected: z.object({
    modelId: ShortText, providerRoute: ShortText, snapshotId: ShortText.nullable(),
    effort: ShortText.nullable(), tools: idList(32), contextBand: ShortText,
  }).strict().nullable(),
  estimate: z.object({ amountCents: Cents.nullable(), unknownReason: Text.nullable() }).strict(),
  budgetReservationRef: RefSchema,
  escalationReason: Text.nullable(),
  decidedAt: IsoDateTime,
}).strict();
export type RoutingDecision = z.infer<typeof RoutingDecision>;

export const CostObservation = z.object({
  ...record('workflow.cost-observation/v1'),
  owner: OperationOwner,
  operationId: IdString,
  stage: IdString,
  billingRoute: z.enum(['api_invoice', 'subscription_quota', 'host_minutes', 'provider_operation', 'storage', 'egress']),
  providerRequestId: ShortText.nullable(),
  usageRef: RefSchema.nullable(),
  rateSnapshotRef: RefSchema.nullable(),
  quantity: z.object({ value: z.number().finite(), unit: ShortText }).strict().nullable(),
  amount: z.object({ value: z.number().finite(), currency: z.string().length(3), kind: z.enum(['measured', 'estimated']) }).strict().nullable(),
  reconciliation: z.enum(['pending', 'reconciled', 'unknown']),
  observedAt: IsoDateTime,
}).strict();
export type CostObservation = z.infer<typeof CostObservation>;

export const Accounting = z.object({
  reservations: z.array(z.object({ reservationId: IdString, kind: z.enum(['action', 'cleanup', 'uncertain']), cents: Cents }).strict()).max(16),
  runnerSeconds: z.number().min(0),
  browserSeconds: z.number().min(0),
  inferenceCalls: NonNegInt,
  inferenceTokens: NonNegInt,
  requestedModel: ShortText.nullable(),
  observedModel: ShortText.nullable(),
  providerRequestIds: z.array(ShortText).max(LIMITS.list),
  integrationOperations: NonNegInt,
  artifactBytes: NonNegInt,
  estimatedCents: Cents.nullable(),
  reconciledCents: Cents.nullable(),
  rateCardDigest: DigestSchema.nullable(),
  unknownCharges: z.array(z.object({ route: ShortText, reason: Text }).strict()).max(16),
  routingDecisionRefs: refList(32),
  costObservationRefs: refList(64),
}).strict();
export type Accounting = z.infer<typeof Accounting>;

export const PerformanceObservation = z.object({
  metric: IdString,
  boundary: ShortText,
  clock: z.enum(['monotonic', 'wall']),
  cellId: IdString,
  valueMs: NonNegInt.nullable(),
  censored: z.boolean(),
  warm: z.boolean(),
  strata: z.record(z.string().max(64), ShortText),
}).strict();

export const CleanupObservation = z.object({
  ownedResources: z.array(z.object({ entityKey: IdString, physicalId: ShortText, boundaryId: IdString }).strict()).max(LIMITS.list),
  attempted: idList(),
  confirmed: idList(),
  remainingUnknownMutations: NonNegInt,
  critical: idList(),
  janitorReceiptRef: RefSchema.nullable(),
  reasonCodes: idList(32),
}).strict();
export type CleanupObservation = z.infer<typeof CleanupObservation>;

export const Coverage = z.object({
  selected: NonNegInt,
  required: NonNegInt,
  attempted: NonNegInt,
  observed: NonNegInt,
  passed: NonNegInt,
  blocked: NonNegInt,
  excluded: NonNegInt,
  requiredCells: z.array(z.object({ selectionCellId: IdString, outcome: ShortText }).strict()).max(LIMITS.list),
  expectedSteps: NonNegInt,
  completedSteps: NonNegInt,
  requiredAssertions: NonNegInt,
  passedRequiredAssertions: NonNegInt,
}).strict();
export type Coverage = z.infer<typeof Coverage>;

export const Outcome = z.enum(['passed', 'assertion_failed', 'blocked', 'infrastructure_failed', 'inconclusive', 'cancelled']);
export type Outcome = z.infer<typeof Outcome>;

export const ExecutionReceipt = z.object({
  schemaVersion: z.literal('workflow.execution/v1'),
  ref: RefSchema,
  executionId: IdString,
  campaignId: IdString,
  attemptId: IdString,
  attemptNumber: PositiveInt,
  predecessorAttemptRef: RefSchema.nullable(),
  retryReason: Text.nullable(),
  scope: ScopeSchema,
  requesterId: IdString,
  caseRef: RefSchema,
  personaRef: RefSchema,
  surfaceBindingRef: RefSchema,
  variantRef: RefSchema.nullable(),
  executionHostRef: RefSchema,
  hostLeaseRef: RefSchema,
  hostObservationRefs: refList(16),
  environment: EnvironmentBinding,
  idempotencyKey: IdString,
  requestRef: RefSchema,
  selectionCellId: IdString,
  qualificationRoundRef: RefSchema.nullable(),
  fixtureManifestRef: RefSchema.nullable(),
  boundaryObservationRefs: refList(64),
  proofClaim: Text,
  coverage: Coverage,
  eventsDigest: DigestSchema,
  assertions: z.array(AssertionObservation).max(LIMITS.list),
  steps: z.array(StepObservation).max(LIMITS.list),
  artifacts: z.array(EvidenceArtifact).max(LIMITS.list),
  accounting: Accounting,
  performance: z.array(PerformanceObservation).max(LIMITS.list),
  cleanup: CleanupObservation,
  outcome: Outcome,
  reasonCodes: idList(64),
  proofEligible: z.boolean(),
  startedAt: IsoDateTime.nullable(),
  finalizedAt: IsoDateTime,
}).strict();
export type ExecutionReceipt = z.infer<typeof ExecutionReceipt>;

export const CampaignResult = z.object({
  ...record('workflow.campaign-result/v1'),
  campaignId: IdString,
  requestRef: RefSchema,
  selectionManifestRef: RefSchema,
  cellReceiptRefs: z.array(z.object({ selectionCellId: IdString, receiptRef: RefSchema }).strict()).max(LIMITS.list),
  missingCellIds: idList(),
  coverage: Coverage,
  outcome: Outcome,
  proofEligible: z.boolean(),
  finalizedAt: IsoDateTime,
}).strict();
export type CampaignResult = z.infer<typeof CampaignResult>;

export const BudgetReservation = z.object({
  ...record('workflow.budget-reservation/v1'),
  campaignId: IdString,
  executionId: IdString,
  attemptId: IdString,
  actionCents: Cents,
  cleanupCents: Cents,
  uncertainCents: Cents,
  state: z.enum(['reserved', 'consumed', 'refunded', 'reconciled']),
  reservedAt: IsoDateTime,
}).strict();
export type BudgetReservation = z.infer<typeof BudgetReservation>;

export const CredentialLease = z.object({
  ...record('workflow.credential-lease/v1'),
  authRecipeRef: RefSchema,
  personaRef: RefSchema,
  executionId: IdString,
  attemptId: IdString,
  credentialName: IdString.nullable(),
  issuedBy: z.enum(['local_launcher', 'environment', 'none']),
  expiresAt: IsoDateTime,
}).strict(); // Never contains the secret; the controller keeps it in memory for the attempt.
export type CredentialLease = z.infer<typeof CredentialLease>;

export const DeadlineMs = Millis;
