/**
 * `tracegrove env doctor <env>` (R6). The environment compiles into a PortableEnvironmentProfile and
 * runs through the kernel's read-only `preflightPortableEnvironment`; the ports below are the real
 * probes (deployment reachable, readiness, each persona resolvable, network, budget, cleanup). A second,
 * opt-out phase signs each persona in and asks the environment's whoami endpoint who it is.
 * Probes never print or record a secret value.
 */
import { join } from 'node:path';
import { STATE_DIR } from '../authoring/compile.ts';
import type { AuthoringConfig } from '../authoring/schema.ts';
import { localScope } from '../core/corpus.ts';
import { Blocked } from '../core/errors.ts';
import { preflightPortableEnvironment, type PortableEnvironmentPorts } from '../core/environmentPreflight.ts';
import { CAPABILITIES } from '../core/capabilities.ts';
import { describeBlock } from '../core/blockCodes.ts';
import { defaultResolveContext, probeSecret } from '../credentials/registry.ts';
import { PortableEnvironmentProfile, digestOfValue, freeze, type PortableEnvironmentIntent, type PortableProbeObservation, type PortableProbeRequest, type Ref, type TargetBinding } from '../protocol/index.ts';
import { establishPersonas, whoami } from '../hosts/personas.ts';
import { dockerCli, requireDocker } from '../hosts/docker.ts';
import { HOSTS } from '../hosts/registry.ts';
import { targetBinding } from './binding.ts';
import { detectAgent, readApproval, type AgentIdentity } from './agents.ts';
import type { ResolvedEnvironment } from './schema.ts';

type State = PortableProbeObservation['state'];
export type DoctorCheck = { check: string; kind: PortableProbeRequest['kind'] | 'identity'; state: State; required: boolean; code: string; recovery: string; detail: string; fix: string | null; owner: string | null };
export type DoctorReport = {
  schemaVersion: 'tracegrove.env-doctor/v1';
  environment: { name: string; class: string; kind: string; origin: string | null; writes: string; agents: string };
  status: 'ready' | 'blocked'; exitCode: 0 | 2;
  checks: DoctorCheck[];
  preflight: { status: 'ready' | 'blocked'; errors: string[]; profileDigest: string };
  next: string | null;
};

const HOST_KIND = { launch: 'local_process', url: 'url', compose: 'compose', container: 'container' } as const;

export function portableProfile(project: string, environment: ResolvedEnvironment, binding: TargetBinding | null, config: Pick<AuthoringConfig, 'app' | 'personas'>): PortableEnvironmentProfile {
  const ref = (id: string, value: unknown): Ref => ({ id: `${project}.env.${environment.name}.${id}`, revision: '1', digest: digestOfValue(value ?? null) });
  const url = binding?.kind === 'url';
  const extra = Object.entries(binding?.endpoints ?? environment.config.endpoints ?? {});
  const endpoints = [{ id: 'app', resolverRef: ref('endpoint.app', binding?.origin ?? 'launch://app'), source: url ? 'external_deployment' as const : 'launch_reported' as const },
    ...extra.map(([id, value]) => ({ id: `endpoint.${id}`, resolverRef: ref(`endpoint.${id}`, value), source: url ? 'external_deployment' as const : 'service_discovery' as const }))];
  const hostKind = HOST_KIND[environment.kind];
  const personas = binding?.personas ?? Object.keys(config.personas).map(persona => ({ persona, from: 'host_issued' }));
  return PortableEnvironmentProfile.parse(freeze({
    schemaVersion: 'workflow.portable-environment-profile/v1' as const, ref: { id: `${project}.env.${environment.name}`, revision: '1' }, scope: localScope(),
    sourceSelectionRef: null, buildRef: ref('build', binding ? { kind: binding.kind, identity: binding.identity, compose: binding.compose, container: binding.container } : config.app),
    configurationRef: ref('configuration', environment.config),
    target: url ? { mode: 'external_staging' as const, deploymentRef: ref('deployment', { origin: binding!.origin, identity: binding!.identity }) }
      : { mode: 'alongside_runner' as const, workspaceRef: ref('workspace', environment.name), hostPlanRef: ref('host', hostKind), launchRecipeRef: ref('launch', environment.config.target) },
    endpoints,
    readiness: { endpointId: 'app', path: binding?.readiness.path ?? config.app.health, method: 'GET' as const, expectedStatus: 200, timeoutMs: binding?.readiness.timeoutMs ?? config.app.readyTimeoutMs },
    capabilities: Object.entries(CAPABILITIES).filter(([, spec]) => (spec.providedBy as readonly string[]).includes(hostKind) && spec.layer === 'host').map(([id, spec]) => ({ id, version: spec.version, required: true })),
    dependencyPlanRefs: [],
    personaCredentials: personas.map(p => ({ personaRef: ref(`persona.${p.persona}`, p.persona), secretRef: ref(`secret.${p.persona}`, p.from) })),
    executionPolicyRef: ref('agents', environment.agents), executionSecretRefs: [],
    network: { policyRef: ref('network', binding?.network ?? null), enforcement: 'host' as const, inbound: url ? 'none' as const : 'loopback_only' as const, egress: 'explicit_allowlist' as const, allowedEndpointIds: endpoints.map(e => e.id) },
    data: { mode: 'none' as const },
    ownership: { leasePolicyRef: ref('lease', environment.class), cleanupPlanRef: ref('cleanup', environment.writes), cleanupReserveMs: 15_000 },
    artifacts: { destinationRef: ref('artifacts', `${STATE_DIR}/runs`), durability: 'durable' as const, redactionPolicyRef: ref('redaction', 'tracegrove.secret-redaction/v1'), retentionMs: 30 * 86_400_000, maxBytes: 64 * 1024 * 1024 },
    limits: { wallMs: 900_000, cpu: 1, memoryMb: 1024, diskMb: 256, maxRequests: binding?.budget?.maxRequests ?? 500, maxBrowserActions: 0, maxProviderCalls: 0, maxAgentCalls: 0, maxSpendCents: binding?.budget?.maxSpendCents ?? 0 },
    allowedReplayModes: ['fresh_execution' as const],
  }));
}

async function fetchStatus(url: string, signal: AbortSignal): Promise<{ status: number | null; body: unknown }> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) });
    let body: unknown = null; try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body };
  } catch { return { status: null, body: null }; }
}

const fieldOf = (body: unknown, path: string) => path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), body);

export async function envDoctor(input: { config: AuthoringConfig; root: string; environment: ResolvedEnvironment; signal?: AbortSignal; identity?: boolean; agent?: AgentIdentity }): Promise<DoctorReport> {
  const { config, root, environment } = input;
  const signal = input.signal ?? new AbortController().signal;
  const binding = targetBinding(environment, config, root, join(root, STATE_DIR, 'compiled'));
  const profile = portableProfile(config.project, environment, binding, config);
  const agent = input.agent ?? detectAgent(process.env);
  const scope = profile.scope;
  const ref = (id: string, value: unknown): Ref => ({ id: `doctor.${id}`, revision: '1', digest: digestOfValue(value ?? null) });
  const intent: PortableEnvironmentIntent = { schemaVersion: 'workflow.portable-environment-intent/v1', profileRef: profile.ref,
    binding: { campaignId: 'doctor', executionId: `doctor-${Date.now()}`, attemptId: 'a1', generation: 0, requestRef: ref('request', environment.name), sourceSelectionRef: null,
      caseRef: ref('case', '*'), personaRef: ref('persona', '*'), targetRef: profile.target.mode === 'external_staging' ? profile.target.deploymentRef : profile.target.hostPlanRef, environmentRef: profile.ref, scope },
    actorRef: ref('actor', agent.agent ?? 'person'), replayMode: 'fresh_execution', replayPlanRef: null };
  const details = new Map<string, { label: string; detail: string; fix: string | null; code?: string }>();
  const resolveRoot = root;
  const label = (request: PortableProbeRequest): string => {
    switch (request.kind) {
      case 'persona_credential': return `persona ${request.personaRef.id.split('.persona.')[1] ?? request.personaRef.id}`;
      case 'capability': return `capability ${request.requirement.id}`;
      case 'endpoint': return `endpoint ${request.endpoint.id}`;
      default: return request.kind;
    }
  };
  const ports: PortableEnvironmentPorts = {
    async resolveProfile() { return profile; },
    async probe(request, _intent, probeSignal) {
      const key = digestOfValue(request).hex;
      const observe = (state: State, detail: string, fix: string | null = null, code?: string): PortableProbeObservation => {
        details.set(key, { label: label(request), detail, fix, ...(code ? { code } : {}) });
        const now = Date.now();
        return { profileRef: profile.ref, binding: intent.binding, actorRef: intent.actorRef, requestDigest: digestOfValue(request), state,
          evidenceRefs: state === 'supported' ? [ref(`evidence.${request.kind}`, detail)] : [], observedAt: new Date(now - 1).toISOString(), expiresAt: new Date(now + 120_000).toISOString() };
      };
      switch (request.kind) {
        case 'authorization': {
          if (!agent.agent) return observe('supported', `run by a person; agent policy for ${environment.name} is ${environment.agents}`);
          if (environment.agents === 'deny') return observe('denied', `agents: deny; ${agent.agent} (${agent.source}) may not use ${environment.name}`, null, 'agent_policy_denied');
          if (environment.agents === 'ask') return observe('supported', readApproval(root, environment) ? `agents: ask; an unexpired approval is waiting` : `agents: ask; ${agent.agent} may inspect, but a run needs: tracegrove approve --env ${environment.name}`, readApproval(root, environment) ? null : `tracegrove approve --env ${environment.name}`);
          return observe('supported', `agents: allow (${agent.agent})`);
        }
        case 'artifacts': return observe('supported', `runs are written to ${STATE_DIR}/runs; secrets are redacted before anything is written`);
        case 'limits': return observe('supported', binding?.budget ? `at most ${binding.budget.maxRequests} requests per run` : 'no request budget (launched target)');
        case 'replay': return observe('supported', 'fresh execution');
        case 'configuration': return observe('supported', `class ${environment.class}, writes ${environment.writes}, agents ${environment.agents}`);
        case 'data': return observe('supported', environment.writes === 'none' ? 'read-only: flows may not create data' : 'flows create owned records and delete them during cleanup');
        case 'network': {
          const hosts = [binding?.origin, ...Object.values(binding?.endpoints ?? {})].filter((v): v is string => !!v).map(v => new URL(v).host);
          return observe('supported', url(environment) ? `admits ${[...hosts, ...(binding?.network.allow ?? [])].join(', ')}` : 'loopback only');
        }
        case 'workspace': return observe('supported', `project root ${root}`);
        case 'startup': {
          if (environment.kind === 'launch') return observe('supported', `tracegrove launches the ${config.app.adapter} app (checked by tracegrove doctor)`);
          try { await requireDocker(dockerCli(), probeSignal, environment.kind === 'compose'); }
          catch (error) { const reason = error instanceof Blocked ? error.reasons[0]! : { code: 'docker_unavailable', detail: String(error) }; return observe('missing', reason.detail, 'docker info', reason.code); }
          return observe('supported', environment.kind === 'compose' ? `docker compose can start ${binding!.compose!.file} (service ${binding!.compose!.service})` : `docker can run ${binding!.container!.image}`);
        }
        case 'deployment': {
          const health = await fetchStatus(`${binding!.origin}${binding!.readiness.path}`, probeSignal);
          if (health.status === null) return observe('missing', `${binding!.origin} did not answer`, `curl -sS ${binding!.origin}${binding!.readiness.path}`, 'deployment_unreachable');
          const release = binding!.identity.field ? fieldOf(health.body, binding!.identity.field) : null;
          if (binding!.identity.expect && String(release) !== binding!.identity.expect) return observe('missing', `the deployment reports ${binding!.identity.field}=${String(release)}, the environment expects ${binding!.identity.expect}`, `tracegrove config set environments.${environment.name}.target.release.expect ${String(release)}`, 'identity_mismatch');
          return observe('supported', `${binding!.origin} answered ${health.status}${release !== null && release !== undefined ? ` · release ${String(release)}` : ''}`);
        }
        case 'readiness': {
          if (!url(environment)) return observe('supported', `${request.readiness.path} is polled after launch (up to ${request.readiness.timeoutMs} ms)`);
          const health = await fetchStatus(`${binding!.origin}${request.readiness.path}`, probeSignal);
          if (health.status !== null && health.status >= 200 && health.status < 300) return observe('supported', `GET ${request.readiness.path} -> ${health.status}`);
          return observe('missing', `GET ${request.readiness.path} -> ${health.status ?? 'no answer'}`, `tracegrove env doctor ${environment.name}`, health.status === null ? 'deployment_unreachable' : 'deployment_not_ready');
        }
        case 'capability': {
          const spec = CAPABILITIES[request.requirement.id as keyof typeof CAPABILITIES];
          if (spec?.probe === 'docker') {
            try { await requireDocker(dockerCli(), probeSignal); } catch { return observe('missing', 'the Docker daemon is not reachable', 'docker info', 'docker_unavailable'); }
          }
          return observe('supported', spec ? spec.summary : request.requirement.id);
        }
        case 'endpoint': {
          if (request.endpoint.source === 'launch_reported') return observe('supported', 'reported by the launched app');
          const value = request.endpoint.id === 'app' ? binding?.origin : binding?.endpoints[request.endpoint.id.replace(/^endpoint\./, '')] ?? environment.config.endpoints?.[request.endpoint.id.replace(/^endpoint\./, '')];
          if (!value) return observe('missing', 'endpoint not configured');
          const answer = await fetchStatus(value, probeSignal);
          return answer.status === null ? observe('missing', `${value} did not answer`, `curl -sS ${value}`, 'deployment_unreachable') : observe('supported', `${value} answered ${answer.status}`);
        }
        case 'persona_credential': {
          const persona = request.personaRef.id.split('.persona.')[1]!;
          const bound = binding?.personas.find(p => p.persona === persona);
          const from = bound?.from ?? 'host_issued';
          if (!binding && from === 'host_issued') return observe('supported', 'host_issued: minted by tracegrove for each attempt');
          if (url(environment) && !bound) return observe('missing', `no credential for ${persona} in ${environment.name}; flows using it are blocked`, `tracegrove config set environments.${environment.name}.personas.${persona}.from <env:NAME|aws-sm://…|op://…|orgx-broker://…>`, 'credential_not_issuable');
          const probe = await probeSecret(from, defaultResolveContext({ root: resolveRoot, persona, signal: probeSignal }));
          const state: State = probe.state === 'resolvable' ? 'supported' : probe.state === 'denied' ? 'denied' : probe.state === 'unavailable' ? 'temporarily_unavailable' : 'missing';
          return observe(state, `${from} (${bound?.auth.kind ?? 'bearer'}): ${probe.detail}${probe.expiresAt ? ` · expires ${probe.expiresAt}` : ''}`, probe.fix ?? null, state === 'supported' ? undefined : 'persona_secret_unresolvable');
        }
        case 'execution_credential': return observe('supported', 'none');
        case 'cleanup': {
          const policy = environment.class === 'isolated_candidate' ? 'owned and confirmed; the launched target is removed' : environment.writes === 'none' ? 'not applicable: read-only' : 'owned records are deleted and confirmed; an unconfirmed cleanup fails the run';
          const brokered = binding?.personas.filter(p => p.from.startsWith('orgx-broker://')).map(p => p.persona) ?? [];
          return observe('supported', `${policy}${brokered.length ? `; broker personas (${brokered.join(', ')}) are revoked and confirmed` : ''}`);
        }
      }
    },
  };
  const preflight = await preflightPortableEnvironment(intent, ports, { signal, timeoutMs: 30_000 });
  const checks: DoctorCheck[] = preflight.checks.map(check => {
    const info = details.get(digestOfValue(check.request).hex);
    const code = info?.code ?? check.code;
    const described = check.state === 'supported' ? null : describeBlock(code, { env: environment.name });
    return { check: info?.label ?? check.request.kind, kind: check.request.kind, state: check.state, required: check.required, code, recovery: check.recovery,
      detail: info?.detail ?? check.code, fix: check.state === 'supported' ? info?.fix ?? null : info?.fix ?? described?.fix ?? null, owner: described?.owner ?? null };
  });
  const personasReady = checks.filter(c => c.kind === 'persona_credential').every(c => c.state === 'supported');
  const deploymentReady = checks.filter(c => c.kind === 'deployment' || c.kind === 'readiness').every(c => c.state === 'supported');
  if (input.identity !== false && binding?.whoami && url(environment) && personasReady && deploymentReady) checks.push(...await identityChecks(binding, root, environment, signal));
  const ready = preflight.status === 'ready' && checks.every(c => !c.required || c.state === 'supported');
  const failing = checks.find(c => c.required && c.state !== 'supported');
  return {
    schemaVersion: 'tracegrove.env-doctor/v1',
    environment: { name: environment.name, class: environment.class, kind: environment.kind, origin: binding?.origin ?? null, writes: environment.writes, agents: environment.agents },
    status: ready ? 'ready' : 'blocked', exitCode: ready ? 0 : 2, checks,
    preflight: { status: preflight.status, errors: preflight.errors, profileDigest: profile.ref.digest.hex },
    next: ready ? `tracegrove explain --env ${environment.name}` : failing?.fix ?? null,
  };
}

const url = (environment: ResolvedEnvironment) => environment.kind === 'url';

/** Sign each persona in (in memory), ask whoami, compare subjects, then revoke anything minted. */
export async function identityChecks(binding: TargetBinding, root: string, environment: ResolvedEnvironment, signal: AbortSignal, only?: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const seen = new Map<string, string>();
  for (const persona of binding.personas.filter(p => !only || p.persona === only)) {
    const check = (state: State, code: string, detail: string): DoctorCheck => {
      const described = state === 'supported' ? null : describeBlock(code, { env: environment.name, persona: persona.persona });
      return { check: `whoami ${persona.persona}`, kind: 'identity', state, required: true, code, recovery: state === 'supported' ? 'none' : 'configure_existing_secret_reference', detail, fix: described?.fix ?? null, owner: described?.owner ?? null };
    };
    let established;
    try { established = await establishPersonas({ binding, origin: binding.origin!, requested: [persona.credentialName], root: join(root, STATE_DIR, 'compiled', binding.projectRoot), runId: `doctor-${Date.now()}`, signal, hostId: `env.${environment.name}`, verifyIdentity: false }); }
    catch (error) { const reason = error instanceof Blocked ? error.reasons[0]! : { code: 'auth_recipe_failed', detail: String((error as Error).message) }; checks.push(check('missing', reason.code, reason.detail)); continue; }
    const expected = established.records[0]?.expectedSubject ?? null;
    try {
      const result = await whoami(binding.origin!, binding.whoami!.path, binding.whoami!.subject, established.credentials.get(persona.credentialName)!, signal);
      if (result.status === 401 || result.status === 403) checks.push(check('denied', 'auth_recipe_failed', `${binding.whoami!.path} answered ${result.status}: the credential was not accepted`));
      else if (expected && result.subject !== expected) checks.push(check('denied', 'persona_identity_mismatch', `persona ${persona.persona} resolved to subject ${result.subject ?? 'unknown'}, expected ${expected}${result.subject && seen.has(result.subject) ? ` (that is ${seen.get(result.subject)}'s subject)` : ''}`));
      else if (result.subject && seen.has(result.subject)) checks.push(check('denied', 'persona_identity_collision', `personas ${seen.get(result.subject)} and ${persona.persona} both sign in as ${result.subject}`));
      else checks.push(check('supported', 'observed_supported', `signs in as ${result.subject ?? 'unknown'}${expected ? ' (as expected)' : ''}`));
      if (result.subject && !seen.has(result.subject)) seen.set(result.subject, persona.persona);
    } catch { checks.push(check('temporarily_unavailable', 'deployment_unreachable', `${binding.whoami!.path} did not answer`)); }
    finally { await established.release(AbortSignal.timeout(10_000)).catch(() => undefined); }
  }
  return checks;
}

/** Hosts known to this build, for messages. */
export const hostKinds = () => Object.keys(HOSTS);
