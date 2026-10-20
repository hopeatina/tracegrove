/**
 * Read-only environment commands: `env list`, `env show`, `whoami`, `explain`, `capabilities`.
 * Each returns a versioned JSON shape; the CLI, the MCP server and the UI render the same objects.
 */
import { dirname, join } from 'node:path';
import { STATE_DIR, compileProject, loadAuthoringConfig, type CompileResult } from '../authoring/compile.ts';
import type { AuthoringConfig } from '../authoring/schema.ts';
import { loadProject, localScope } from '../core/corpus.ts';
import { plan } from '../core/planner.ts';
import { Blocked } from '../core/errors.ts';
import { CAPABILITIES, type CapabilityId } from '../core/capabilities.ts';
import { describeBlock } from '../core/blockCodes.ts';
import { defaultResolveContext, probeSecret, resolverKindOf } from '../credentials/registry.ts';
import { targetBinding } from './binding.ts';
import { environmentNames, resolveEnvironment } from './resolve.ts';
import { detectAgent, readApproval, type AgentIdentity } from './agents.ts';
import { identityChecks, type DoctorCheck } from './doctor.ts';
import type { ResolvedEnvironment } from './schema.ts';

const HOST_KIND = { launch: 'local_process', url: 'url', compose: 'compose', container: 'container' } as const;

export function targetLabel(environment: ResolvedEnvironment): string {
  const t = environment.config.target;
  return 'launch' in t ? 'launch app (this machine)' : 'url' in t ? t.url : 'compose' in t ? `compose ${t.compose} · ${t.service}:${t.port}` : `container ${t.container.image}:${t.container.port}`;
}

export type EnvPersonaRow = { persona: string; resolver: string; ref: string; auth: string; subject: string | null; state?: 'resolvable' | 'missing' | 'expired' | 'denied' | 'unavailable'; detail?: string; fix?: string | null };
export type EnvRow = { name: string; kind: string; class: string; target: string; writes: string; agents: string; implicit: boolean; personas: EnvPersonaRow[];
  budget: { maxRequests: number; maxSpendCents: number } | null; whoami: string | null; flows: number | null; error?: string };

function personaRows(config: AuthoringConfig, environment: ResolvedEnvironment): EnvPersonaRow[] {
  const launched = environment.kind !== 'url';
  return Object.entries(config.personas).flatMap(([name, persona]): EnvPersonaRow[] => {
    const bound = environment.config.personas?.[name];
    if (!bound && !launched) return [{ persona: name, resolver: 'none', ref: '(not configured)', auth: '-', subject: persona.subject, state: 'missing' as const, detail: `flows that use ${name} are blocked in ${environment.name}` }];
    const ref = bound?.from ?? 'host_issued';
    let resolver = 'invalid'; try { resolver = resolverKindOf(ref); } catch { resolver = 'invalid'; }
    return [{ persona: name, resolver, ref, auth: bound ? (bound.auth === 'bearer' ? 'bearer' : bound.auth.kind) : 'bearer', subject: bound?.subject ?? persona.subject }];
  });
}

export function envList(configPath: string): { schemaVersion: 'tracegrove.env-list/v1'; selected: string | null; environments: EnvRow[] } {
  const config = loadAuthoringConfig(configPath);
  const rows = environmentNames(config).map((name): EnvRow => {
    try {
      const environment = resolveEnvironment(config, name);
      return { name, kind: environment.kind, class: environment.class, target: targetLabel(environment), writes: environment.writes, agents: environment.agents, implicit: environment.implicit,
        personas: personaRows(config, environment), budget: environment.config.budget ?? null, whoami: environment.config.whoami ? `${environment.config.whoami.GET} → ${environment.config.whoami.subject}` : null, flows: null };
    } catch (error) {
      if (!(error instanceof Blocked)) throw error;
      return { name, kind: '?', class: '?', target: '?', writes: '?', agents: '?', implicit: false, personas: [], budget: null, whoami: null, flows: null, error: error.reasons.map(r => r.detail).join('; ') };
    }
  });
  return { schemaVersion: 'tracegrove.env-list/v1', selected: null, environments: rows };
}

/** One environment with each persona probed (resolvable, expired, missing), never showing a value. */
export async function envShow(configPath: string, name: string, signal?: AbortSignal): Promise<{ schemaVersion: 'tracegrove.env-show/v1'; environment: EnvRow; enabledFlows: string[]; approvalPending: boolean }> {
  const config = loadAuthoringConfig(configPath);
  const root = dirname(configPath);
  const environment = resolveEnvironment(config, name);
  const personas = await Promise.all(personaRows(config, environment).map(async row => {
    if (row.state === 'missing') return row;
    const probe = await probeSecret(row.ref, defaultResolveContext({ root, persona: row.persona, ...(signal ? { signal } : {}) }));
    return { ...row, state: probe.state, detail: probe.detail, fix: probe.fix ?? null };
  }));
  let enabledFlows: string[] = [];
  try { enabledFlows = compileFlowsFor(configPath, name).flows.map(f => f.caseId); } catch { enabledFlows = []; }
  return { schemaVersion: 'tracegrove.env-show/v1', approvalPending: !!readApproval(root, environment),
    environment: { name, kind: environment.kind, class: environment.class, target: targetLabel(environment), writes: environment.writes, agents: environment.agents, implicit: environment.implicit, personas,
      budget: environment.config.budget ?? null, whoami: environment.config.whoami ? `${environment.config.whoami.GET} → ${environment.config.whoami.subject}` : null, flows: enabledFlows.length },
    enabledFlows };
}

function compileFlowsFor(configPath: string, env: string, options: { grep?: string | undefined; tags?: string[] | undefined } = {}): CompileResult {
  return compileProject(configPath, { env, ...options });
}

export async function whoamiCommand(configPath: string, env: string, persona: string | null, signal: AbortSignal): Promise<{ schemaVersion: 'tracegrove.whoami/v1'; environment: string; checks: DoctorCheck[]; exitCode: 0 | 2 }> {
  const config = loadAuthoringConfig(configPath);
  const root = dirname(configPath);
  const environment = resolveEnvironment(config, env);
  if (persona && !Object.hasOwn(config.personas, persona)) throw new Blocked([{ code: 'unknown_persona', detail: `${persona} is not declared under personas:`, owner: 'agent', action: `use one of ${Object.keys(config.personas).join(', ')}` }]);
  const binding = targetBinding(environment, config, root, join(root, STATE_DIR, 'compiled'));
  if (!binding || binding.kind !== 'url') {
    const checks = Object.entries(config.personas).filter(([name]) => !persona || name === persona).map(([name, p]): DoctorCheck => ({ check: `whoami ${name}`, kind: 'identity', state: 'supported', required: false, code: 'host_issued',
      recovery: 'none', detail: `host-issued token minted per attempt for subject ${p.subject}; the launched app maps it`, fix: null, owner: null }));
    return { schemaVersion: 'tracegrove.whoami/v1', environment: env, checks, exitCode: 0 };
  }
  if (!binding.whoami) throw new Blocked([{ code: 'invalid_environment', detail: `environments.${env} has no whoami: endpoint`, owner: 'developer', action: `tracegrove config set environments.${env}.whoami '{GET: /me, subject: user.id}'` }]);
  const checks = await identityChecks(binding, root, environment, signal, persona ?? undefined);
  return { schemaVersion: 'tracegrove.whoami/v1', environment: env, checks, exitCode: checks.every(c => c.state === 'supported') ? 0 : 2 };
}

export type ExplainReport = {
  schemaVersion: 'tracegrove.explain/v1';
  environment: { name: string; class: string; kind: string; target: string; writes: string; agents: string; origin: string | null; expectedRelease: string | null };
  agent: { name: string | null; policy: string; wouldRun: boolean; reason: string; fix: string | null };
  cells: Array<{ caseId: string; title: string; file: string; personas: string[]; credentials: Array<{ persona: string; from: string; auth: string }>;
    assertions: { applicable: number; skipped: number }; writes: string[]; creates: string[]; cleanup: string[]; blockers: Array<{ code: string; detail: string; fix: string | null; owner: string }> }>;
  skipped: Array<{ caseId: string; reason: string }>;
  blockers: Array<{ code: string; detail: string; fix: string | null; owner: string }>;
  wouldRun: boolean;
  next: string;
};

/** Dry plan: compile and plan for the environment, run nothing. */
export function explain(configPath: string, input: { env: string; caseId?: string | null; grep?: string | undefined; tags?: string[] | undefined; agent?: AgentIdentity }): ExplainReport {
  const compiled = compileFlowsFor(configPath, input.env, { grep: input.caseId ?? input.grep, tags: input.tags });
  const environment = compiled.environment;
  const bundle = plan({ project: loadProject(compiled.workflowConfigPath), profileName: 'real', scope: localScope() });
  const binding = compiled.target;
  const config = compiled.config;
  const identity = input.agent ?? detectAgent(process.env);
  const approval = readApproval(compiled.root, environment);
  const agentDecision = !identity.agent ? { wouldRun: true, reason: 'run by a person', fix: null }
    : environment.agents === 'allow' ? { wouldRun: true, reason: `agents: allow`, fix: null }
      : environment.agents === 'deny' ? { wouldRun: false, reason: `agents: deny in ${environment.class}`, fix: null }
        : approval ? { wouldRun: true, reason: `agents: ask; approved by ${approval.approvedBy} until ${approval.expiresAt}`, fix: null }
          : { wouldRun: false, reason: 'agents: ask and no approval', fix: `tracegrove approve --env ${environment.name}` };
  const describe = (b: { code: string; detail: string; action: string }) => { const d = describeBlock(b.code, { env: environment.name }, b.action); return { code: b.code, detail: b.detail, fix: d.fix, owner: d.owner }; };
  const blockers = bundle.blockers.filter(b => !b.cellId).map(describe);
  const defaultPersona = Object.keys(config.personas)[0]!;
  const cells = compiled.flows.map(flow => {
    const personas = [...new Set(flow.steps.map(s => s.as).filter(as => as !== 'none'))];
    const credentials = personas.map(persona => {
      const bound = environment.config.personas?.[persona];
      return { persona, from: bound?.from ?? (environment.kind === 'url' ? '(not configured)' : 'host_issued'), auth: bound ? (bound.auth === 'bearer' ? 'bearer' : bound.auth.kind) : 'bearer' };
    });
    const cellBlockers = bundle.blockers.filter(b => b.cellId?.startsWith(`${flow.caseId}`) || b.detail.includes(flow.caseId)).map(describe);
    return {
      caseId: flow.caseId, title: flow.title, file: flow.file, personas: personas.length ? personas : [defaultPersona], credentials,
      assertions: { applicable: flow.steps.length, skipped: 0 },
      writes: flow.steps.filter(s => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(s.method)).map(s => `${s.method} ${s.path}`),
      creates: flow.fixtures.map(alias => `fixture ${alias}`),
      cleanup: flow.fixtures.map(alias => `delete fixture ${alias} and confirm it is gone${environment.class === 'isolated_candidate' ? '' : ' (unconfirmed cleanup fails the run)'}`),
      blockers: cellBlockers,
    };
  });
  const wouldRun = !!bundle.request && agentDecision.wouldRun;
  return {
    schemaVersion: 'tracegrove.explain/v1',
    environment: { name: environment.name, class: environment.class, kind: environment.kind, target: targetLabel(environment), writes: environment.writes, agents: environment.agents, origin: binding?.origin ?? null, expectedRelease: binding?.expectedRelease ?? null },
    agent: { name: identity.agent, policy: environment.agents, ...agentDecision },
    cells, skipped: compiled.skipped.map(s => ({ caseId: s.caseId, reason: `not enabled for ${environment.name} (envs: [${s.envs.join(', ')}])` })),
    blockers, wouldRun,
    next: wouldRun ? `tracegrove test${environment.name === 'local' ? '' : ` --env ${environment.name}`}${input.caseId ? ` --grep ${input.caseId}` : ''}` : agentDecision.fix ?? blockers[0]?.fix ?? cells.flatMap(c => c.blockers)[0]?.fix ?? `tracegrove env doctor ${environment.name}`,
  };
}

export type CapabilityMatrix = {
  schemaVersion: 'tracegrove.capabilities/v1';
  environments: Array<{ name: string; kind: string; class: string }>;
  capabilities: Array<{ id: CapabilityId; layer: string; summary: string; writes: boolean; docs: string;
    cells: Record<string, { state: 'supported' | 'missing' | 'denied'; reason: string | null; fix: string | null }> }>;
};

export function capabilityMatrix(configPath: string, only?: string | null): CapabilityMatrix {
  const config = loadAuthoringConfig(configPath);
  const envs = (only ? [only] : environmentNames(config)).flatMap(name => { try { return [resolveEnvironment(config, name)]; } catch (error) { if (only) throw error; return []; } });
  return {
    schemaVersion: 'tracegrove.capabilities/v1',
    environments: envs.map(e => ({ name: e.name, kind: e.kind, class: e.class })),
    capabilities: (Object.keys(CAPABILITIES) as CapabilityId[]).map(id => {
      const spec = CAPABILITIES[id];
      return { id, layer: spec.layer, summary: spec.summary, writes: spec.writes, docs: spec.docs,
        cells: Object.fromEntries(envs.map(e => {
          const host = HOST_KIND[e.kind];
          if (!(spec.providedBy as readonly string[]).includes(host)) return [e.name, { state: 'missing' as const, reason: `the ${host} host does not provide it (provided by ${spec.providedBy.join(', ')})`, fix: `use an environment whose target is ${spec.providedBy.map(k => k === 'local_process' ? 'launch' : k).join(' or ')}` }];
          if (spec.writes && e.writes === 'none') return [e.name, { state: 'denied' as const, reason: `${e.name} allows no writes (${e.class})`, fix: null }];
          return [e.name, { state: 'supported' as const, reason: null, fix: null }];
        })) };
    }),
  };
}
