/** Resolve a named environment with class defaults, and pick the active one (flag > TRACEGROVE_ENV > settings > local). */
import { Blocked } from '../core/errors.ts';
import type { AuthoringConfig } from '../authoring/schema.ts';
import { CLASS_POLICY, DEFAULT_CLASS, LOCAL_ENVIRONMENT, targetKind, type EnvironmentConfig, type ResolvedEnvironment } from './schema.ts';

export function environmentNames(config: Pick<AuthoringConfig, 'environments'>): string[] {
  const declared = Object.keys(config.environments ?? {});
  return declared.includes('local') ? declared : ['local', ...declared];
}

export function resolveEnvironment(config: Pick<AuthoringConfig, 'environments'>, name: string): ResolvedEnvironment {
  const declared = config.environments?.[name];
  if (!declared && name !== 'local') {
    throw new Blocked([{ code: 'unknown_environment', detail: `no environment named ${name}; declared: ${environmentNames(config).join(', ')}`, owner: 'agent', action: 'run tracegrove env list, or add it with tracegrove env add' }]);
  }
  const env: EnvironmentConfig = declared ?? LOCAL_ENVIRONMENT;
  const kind = targetKind(env.target);
  const cls = env.class ?? DEFAULT_CLASS[kind];
  const policy = CLASS_POLICY[cls];
  const writes = env.writes ?? policy.writes;
  const problems: string[] = [];
  if (!(policy.allowedWrites as readonly string[]).includes(writes)) problems.push(`${cls} allows writes: ${policy.allowedWrites.join(' or ')}, not ${writes}`);
  if (kind === 'url' && cls === 'isolated_candidate') problems.push('a url target is a deployment, not an isolated candidate; use deployed_preview, deployed_canary or production_observation');
  if (kind !== 'url' && cls !== 'isolated_candidate') problems.push(`a ${kind} target is launched by tracegrove, so its class is isolated_candidate`);
  for (const [persona, binding] of Object.entries(env.personas ?? {})) {
    if (kind === 'url' && binding.from === 'host_issued') problems.push(`personas.${persona}: a deployment cannot accept host-issued tokens; use env:, file:, aws-sm://, op:// or orgx-broker://`);
    if (policy.resolvers === 'broker_only' && !binding.from.startsWith('orgx-broker://')) problems.push(`personas.${persona}: ${cls} admits only broker-minted personas (orgx-broker://)`);
  }
  if (problems.length) throw new Blocked(problems.map(detail => ({ code: 'invalid_environment', detail: `environments.${name}: ${detail}`, owner: 'developer', action: `edit environments.${name} in tracegrove.config.yaml` })));
  return { name, config: env, kind, class: cls, writes, agents: env.agents ?? policy.agents, implicit: !declared };
}

export type EnvironmentSource = 'flag' | 'TRACEGROVE_ENV' | 'settings' | 'default';
export function selectEnvironment(input: { flag?: string | null | undefined; env?: NodeJS.ProcessEnv; settings?: { env?: string | undefined } | null }): { name: string; source: EnvironmentSource } {
  if (input.flag) return { name: input.flag, source: 'flag' };
  const fromEnv = (input.env ?? process.env).TRACEGROVE_ENV;
  if (fromEnv) return { name: fromEnv, source: 'TRACEGROVE_ENV' };
  if (input.settings?.env) return { name: input.settings.env, source: 'settings' };
  return { name: 'local', source: 'default' };
}

/** Flows run in local unless they opt in with envs:. */
export function flowEnabledIn(flow: { envs?: string[] | undefined }, environment: string): boolean {
  return (flow.envs ?? ['local']).includes(environment);
}
