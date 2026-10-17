/** Safe reference-only SDK examples, not registered hosts or executable CLI configurations. */
import { PortableEnvironmentProfile, freeze, digestOfBytes, type Ref } from '../protocol/index.ts';
const placeholder = (id: string): Ref => ({ id: `example.${id}`, revision: '1', digest: digestOfBytes(`unresolved example reference: ${id}`) });
export function portableEnvironmentTemplate(mode: 'alongside_runner' | 'external_staging'): PortableEnvironmentProfile {
  return PortableEnvironmentProfile.parse(freeze({ schemaVersion: 'workflow.portable-environment-profile/v1' as const,
    ref: { id: `example.profile.${mode}`, revision: '1' }, scope: { ownerId: 'example.owner', tenantId: null, visibility: 'owner_private' as const },
    sourceSelectionRef: placeholder('source-selection'), buildRef: placeholder('build'), configurationRef: placeholder('non-secret-config'),
    target: mode === 'alongside_runner'
      ? { mode, workspaceRef: placeholder('workspace'), hostPlanRef: placeholder('host-plan'), launchRecipeRef: placeholder('launch-recipe') }
      : { mode, deploymentRef: placeholder('deployment') },
    endpoints: [{ id: 'app', resolverRef: placeholder('app-endpoint'), source: mode === 'alongside_runner' ? 'launch_reported' : 'external_deployment' }],
    readiness: { endpointId: 'app', path: '/health', method: 'GET', expectedStatus: 200, timeoutMs: 20_000 },
    capabilities: [{ id: 'surface.http', version: 1, required: true }], dependencyPlanRefs: [],
    personaCredentials: [{ personaRef: placeholder('persona.owner'), secretRef: placeholder('app-persona-credential') }],
    executionPolicyRef: placeholder('execution-policy'), executionSecretRefs: [],
    network: { policyRef: placeholder('network-policy'), enforcement: 'host', inbound: mode === 'alongside_runner' ? 'loopback_only' : 'none', egress: 'explicit_allowlist', allowedEndpointIds: ['app'] },
    data: { mode: 'none' },
    ownership: { leasePolicyRef: placeholder('lease-policy'), cleanupPlanRef: placeholder('cleanup-plan'), cleanupReserveMs: 10_000 },
    artifacts: { destinationRef: placeholder('artifact-destination'), durability: 'export_required', redactionPolicyRef: placeholder('redaction-policy'), retentionMs: 86_400_000, maxBytes: 16_777_216 },
    limits: { wallMs: 120_000, cpu: 1, memoryMb: 1024, diskMb: 256, maxRequests: 100, maxBrowserActions: 0,
      maxProviderCalls: 0, maxAgentCalls: 0, maxSpendCents: 0 },
    allowedReplayModes: ['fresh_execution', 'evidence_playback'],
  }));
}
