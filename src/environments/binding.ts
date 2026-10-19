/**
 * Compile a resolved environment into the host-plan `binding` (R6): secret references, recipes,
 * readiness, identity and write policy, never values. Launched-app environments have no binding.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { composeDigest } from '../hosts/compose.ts';
import { TargetBinding, parseAs, type AuthRecipeConfig } from '../protocol/index.ts';
import type { AuthoringConfig } from '../authoring/schema.ts';
import type { ResolvedEnvironment } from './schema.ts';

export const credentialNameFor = (persona: string) => `${persona}_token`;

function recipeOf(auth: 'bearer' | AuthRecipeConfig): AuthRecipeConfig {
  return auth === 'bearer' ? { kind: 'bearer' } : auth;
}

export function targetBinding(environment: ResolvedEnvironment, config: Pick<AuthoringConfig, 'personas'>, root: string, compiledDir: string): TargetBinding | null {
  const { target } = environment.config;
  if ('launch' in target) return null;
  const env = environment.config;
  const launched = !('url' in target);
  const personas = Object.entries(config.personas).flatMap(([name, persona]) => {
    const declared = env.personas?.[name];
    if (!declared && !launched) return [];
    return [{ persona: name, credentialName: credentialNameFor(name), from: declared?.from ?? 'host_issued', auth: recipeOf(declared?.auth ?? 'bearer'),
      // A broker mints a fresh identity; its own reported subject is what whoami must match.
      subject: declared?.subject ?? (declared?.from.startsWith('orgx-broker://') ? null : persona.subject) }];
  });
  const projectRoot = relative(compiledDir, root).split(sep).join('/') || '.';
  let compose: TargetBinding['compose'] = null;
  if ('compose' in target) {
    const file = resolve(root, target.compose);
    if (!existsSync(file)) throw new Blocked([{ code: 'invalid_environment', detail: `environments.${environment.name}.target.compose: ${target.compose} does not exist`, owner: 'developer', action: 'point compose: at a compose file relative to tracegrove.config.yaml' }]);
    compose = { file: relative(root, file).split(sep).join('/'), service: target.service, port: target.port, tokensEnv: target.tokensEnv, fileDigest: composeDigest(file) };
  }
  return parseAs(TargetBinding, {
    kind: 'url' in target ? 'url' : 'compose' in target ? 'compose' : 'container',
    environment: environment.name, projectRoot,
    origin: 'url' in target ? target.url.replace(/\/$/, '') : null,
    readiness: { path: target.health, timeoutMs: target.readyTimeoutMs },
    identity: 'url' in target ? { field: target.release?.field ?? null, expect: target.release?.expect ?? null } : { field: null, expect: null },
    endpoints: env.endpoints ?? {}, network: { allow: env.network?.allow ?? [] }, writes: environment.writes, personas,
    whoami: env.whoami ? { path: env.whoami.GET, subject: env.whoami.subject } : null,
    budget: env.budget ? { maxRequests: env.budget.maxRequests, maxSpendCents: env.budget.maxSpendCents } : 'url' in target ? { maxRequests: 500, maxSpendCents: 0 } : null,
    compose, container: 'container' in target ? { image: target.container.image, port: target.container.port, env: target.container.env, tokensEnv: target.container.tokensEnv } : null,
  }, `environments.${environment.name}`);
}

/** The release the plan expects the target to report, or null when the environment does not pin one. */
export function expectedRelease(binding: TargetBinding): string | null {
  if (binding.kind === 'url') return binding.identity.expect;
  if (binding.kind === 'compose') return `compose:${binding.compose!.fileDigest}`;
  const image = spawnSync(process.env.TRACEGROVE_DOCKER_BIN ?? 'docker', ['image', 'inspect', '--format', '{{.Id}}', binding.container!.image], { encoding: 'utf8', timeout: 15_000 });
  return image.status === 0 && image.stdout.trim() ? `image:${image.stdout.trim()}` : null;
}
