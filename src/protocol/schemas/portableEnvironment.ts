/** Experimental placement-independent intent. References never contain credential values. */
import { z } from 'zod';
import { IdString, RefSchema, ScopeSchema, PositiveMillis, NonNegInt, PositiveInt, Cents } from '../primitives.ts';
import { CapabilityBinding, CapabilityRequirement } from './capability.ts';
import { CapabilityReplayPlan } from './capabilityLifecycle.ts';

export const PortableReplayMode = z.union([z.literal('fresh_execution'), CapabilityReplayPlan.shape.mode]);
const refList = z.array(RefSchema).max(32);
const endpoint = z.object({ id: IdString, resolverRef: RefSchema,
  source: z.enum(['launch_reported', 'service_discovery', 'external_deployment']) }).strict();
const target = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('alongside_runner'), workspaceRef: RefSchema, hostPlanRef: RefSchema, launchRecipeRef: RefSchema }).strict(),
  z.object({ mode: z.literal('external_staging'), deploymentRef: RefSchema }).strict(),
]);
const data = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('owned_synthetic'), seedRef: RefSchema, generatorRef: RefSchema, namespacePolicyRef: RefSchema,
    resetPlanRef: RefSchema, resourcePolicyRef: RefSchema }).strict(),
]);
export const PortableEnvironmentProfile = z.object({
  schemaVersion: z.literal('workflow.portable-environment-profile/v1'), ref: RefSchema, scope: ScopeSchema,
  sourceSelectionRef: RefSchema.nullable(), buildRef: RefSchema.nullable(), configurationRef: RefSchema,
  target, endpoints: z.array(endpoint).min(1).max(16),
  readiness: z.object({ endpointId: IdString, path: z.string().regex(/^\/(?!\/)[^?#\s]*$/).max(2048),
    method: z.literal('GET'), expectedStatus: z.number().int().min(200).max(299), timeoutMs: PositiveMillis.max(300_000) }).strict(),
  capabilities: z.array(CapabilityRequirement).max(64), dependencyPlanRefs: refList,
  personaCredentials: z.array(z.object({ personaRef: RefSchema, secretRef: RefSchema }).strict()).max(32),
  executionPolicyRef: RefSchema, executionSecretRefs: refList,
  network: z.object({ policyRef: RefSchema, enforcement: z.literal('host'),
    inbound: z.enum(['none', 'loopback_only']), egress: z.enum(['none', 'explicit_allowlist']), allowedEndpointIds: z.array(IdString).max(16) }).strict(),
  data,
  ownership: z.object({ leasePolicyRef: RefSchema, cleanupPlanRef: RefSchema, cleanupReserveMs: PositiveMillis.max(300_000) }).strict(),
  artifacts: z.object({ destinationRef: RefSchema, durability: z.enum(['ephemeral', 'export_required', 'durable']),
    redactionPolicyRef: RefSchema, retentionMs: PositiveMillis, maxBytes: PositiveInt }).strict(),
  limits: z.object({ wallMs: PositiveMillis.max(3_600_000), cpu: PositiveInt.max(64), memoryMb: PositiveInt.max(262144), diskMb: NonNegInt,
    maxRequests: NonNegInt, maxBrowserActions: NonNegInt, maxProviderCalls: NonNegInt, maxAgentCalls: NonNegInt, maxSpendCents: Cents }).strict(),
  allowedReplayModes: z.array(PortableReplayMode).min(1).max(5),
}).strict().superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!p.sourceSelectionRef && !p.buildRef) issue('source selection or immutable build identity required');
  const ids = p.endpoints.map(e => e.id);
  if (new Set(ids).size !== ids.length || !ids.includes(p.readiness.endpointId)) issue('readiness requires a unique declared endpoint');
  if (p.network.allowedEndpointIds.some(id => !ids.includes(id)) || new Set(p.network.allowedEndpointIds).size !== p.network.allowedEndpointIds.length) issue('network endpoint references must be unique and declared');
  if (p.network.egress === 'none' && p.network.allowedEndpointIds.length) issue('no-egress policy cannot allow external endpoints');
  if (p.target.mode === 'external_staging' && p.endpoints.some(e => e.source !== 'external_deployment')) issue('external staging cannot claim owned launch endpoints');
  if (p.target.mode === 'alongside_runner' && p.endpoints.some(e => e.source === 'external_deployment')) issue('alongside endpoint must be resolved from owned launch or discovery');
  if (p.ownership.cleanupReserveMs >= p.limits.wallMs) issue('cleanup reserve must fit inside wall budget');
  if (p.readiness.timeoutMs + p.ownership.cleanupReserveMs >= p.limits.wallMs) issue('startup/readiness must leave execution and cleanup time');
  if (new Set(p.capabilities.map(c => `${c.id}/v${c.version}`)).size !== p.capabilities.length) issue('duplicate capability requirement');
  if (new Set(p.allowedReplayModes).size !== p.allowedReplayModes.length) issue('duplicate replay mode');
  if (new Set(p.personaCredentials.map(c => c.personaRef.id)).size !== p.personaCredentials.length) issue('duplicate application persona credential');
  if (new Set(p.executionSecretRefs.map(r => r.id)).size !== p.executionSecretRefs.length) issue('duplicate execution credential');
  if (p.personaCredentials.some(c => p.executionSecretRefs.some(r => r.id === c.secretRef.id))) issue('application and execution credential references must remain separate');
});
export type PortableEnvironmentProfile = z.infer<typeof PortableEnvironmentProfile>;

export const PortableEnvironmentIntent = z.object({ schemaVersion: z.literal('workflow.portable-environment-intent/v1'),
  profileRef: RefSchema, binding: CapabilityBinding, actorRef: RefSchema,
  replayMode: PortableReplayMode, replayPlanRef: RefSchema.nullable(),
}).strict().superRefine((v, ctx) => {
  if ((v.replayMode === 'fresh_execution') !== (v.replayPlanRef === null)) ctx.addIssue({ code: 'custom', message: 'replay requires its exact plan; fresh execution has no replay plan' });
});
export type PortableEnvironmentIntent = z.infer<typeof PortableEnvironmentIntent>;

export const PortableProbeRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('capability'), requirement: CapabilityRequirement }).strict(),
  z.object({ kind: z.literal('workspace'), workspaceRef: RefSchema, sourceSelectionRef: RefSchema.nullable(), buildRef: RefSchema.nullable() }).strict(),
  z.object({ kind: z.literal('startup'), hostPlanRef: RefSchema, launchRecipeRef: RefSchema, dependencyPlanRefs: refList }).strict(),
  z.object({ kind: z.literal('deployment'), deploymentRef: RefSchema, sourceSelectionRef: RefSchema.nullable(), buildRef: RefSchema.nullable() }).strict(),
  z.object({ kind: z.literal('endpoint'), endpoint }).strict(),
  z.object({ kind: z.literal('readiness'), readiness: PortableEnvironmentProfile.shape.readiness }).strict(),
  z.object({ kind: z.literal('persona_credential'), personaRef: RefSchema, secretRef: RefSchema }).strict(),
  z.object({ kind: z.literal('execution_credential'), secretRef: RefSchema }).strict(),
  z.object({ kind: z.literal('authorization'), policyRef: RefSchema, actorRef: RefSchema }).strict(),
  z.object({ kind: z.literal('configuration'), configurationRef: RefSchema }).strict(),
  z.object({ kind: z.literal('network'), network: PortableEnvironmentProfile.shape.network }).strict(),
  z.object({ kind: z.literal('data'), data: PortableEnvironmentProfile.shape.data }).strict(),
  z.object({ kind: z.literal('cleanup'), ownership: PortableEnvironmentProfile.shape.ownership }).strict(),
  z.object({ kind: z.literal('artifacts'), artifacts: PortableEnvironmentProfile.shape.artifacts }).strict(),
  z.object({ kind: z.literal('limits'), limits: PortableEnvironmentProfile.shape.limits }).strict(),
  z.object({ kind: z.literal('replay'), mode: PortableReplayMode, planRef: RefSchema.nullable() }).strict(),
]);
export type PortableProbeRequest = z.infer<typeof PortableProbeRequest>;
export const PortableProbeObservation = z.object({ profileRef: RefSchema, binding: CapabilityBinding, actorRef: RefSchema,
  requestDigest: z.object({ algorithm: z.literal('sha256'), hex: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  state: z.enum(['supported', 'missing', 'denied', 'unknown', 'temporarily_unavailable']),
  evidenceRefs: refList, observedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
}).strict();
export type PortableProbeObservation = z.infer<typeof PortableProbeObservation>;

export const PortablePreflightReport = z.object({ schemaVersion: z.literal('workflow.portable-preflight/v1'),
  profileRef: RefSchema.nullable(), binding: CapabilityBinding.nullable(), actorRef: RefSchema.nullable(),
  status: z.enum(['ready', 'blocked']), exitCode: z.union([z.literal(0), z.literal(2)]),
  checks: z.array(z.object({ request: PortableProbeRequest, state: PortableProbeObservation.shape.state, required: z.boolean(), evidenceRefs: refList,
    code: IdString, recovery: z.enum(['none', 'install_or_select_capability', 'select_workspace_or_build', 'select_launch_adapter', 'verify_deployment_access', 'resolve_endpoint',
      'verify_readiness', 'configure_existing_secret_reference', 'request_owner_authorization', 'select_safe_configuration', 'select_enforceable_network_policy',
      'select_owned_synthetic_fixture', 'reconcile_owned_cleanup', 'select_exportable_artifact_destination', 'lower_or_enforce_limits', 'select_supported_replay_mode']) }).strict()).max(256),
  errors: z.array(z.enum(['invalid_environment_intent', 'profile_unavailable', 'invalid_environment_profile', 'profile_identity_mismatch', 'scope_mismatch',
    'unsupported_replay_mode', 'source_binding_mismatch', 'preflight_observations_expired', 'preflight_cancelled', 'preflight_deadline'])).max(8),
  execution: z.literal('not_started'), verificationVerdict: z.literal('not_evaluated'),
}).strict();
export type PortablePreflightReport = z.infer<typeof PortablePreflightReport>;
