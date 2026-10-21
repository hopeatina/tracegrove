/**
 * `environments:` in tracegrove.config.yaml. Zod is the single source: the config JSON Schema,
 * `env show`, the compiled host-plan binding and the docs all derive from these definitions.
 */
import { z } from 'zod';
import { AuthRecipeConfig, EnvironmentClass, SecretRefUri } from '../protocol/index.ts';

const Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'use letters, digits, - and _ (start with a letter)');
const Path = z.string().regex(/^\/(?!\/)[^?#\s]*$/, 'paths start with /');
const Url = z.string().url().refine(value => /^https:\/\//.test(value) || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(value), 'use https, or http only for loopback (127.0.0.1, localhost)');

/** `env:NAME`: a value only known at run time, such as a preview deployment's URL in CI. */
export const EnvRef = z.string().regex(/^env:[A-Z_][A-Z0-9_]*$/, 'use env:NAME');
export const URL_RULE = Url;

export const WRITE_POLICIES = ['none', 'owned_namespace'] as const;
export const AGENT_POLICIES = ['allow', 'ask', 'deny'] as const;
export type AgentPolicy = typeof AGENT_POLICIES[number];
export type EnvironmentClassName = z.infer<typeof EnvironmentClass>;

/** `auth: bearer` shorthand or a full recipe object. */
export const AuthShorthand = z.union([z.enum(['bearer']), AuthRecipeConfig]).describe('Auth recipe that turns the secret into request credentials: bearer, header, form_login, oauth_client_credentials, clerk_testing or supabase_password.');

export const EnvironmentPersona = z.object({
  from: SecretRefUri,
  auth: AuthShorthand.default('bearer'),
  subject: z.string().min(1).max(256).optional().describe('Expected signed-in subject; defaults to the persona subject under personas:.'),
}).strict();
export type EnvironmentPersona = z.infer<typeof EnvironmentPersona>;

export const EnvironmentTarget = z.union([
  z.object({ launch: z.literal('app').describe('Launch the app from app: on this machine (the default local environment).') }).strict(),
  z.object({
    url: z.union([Url, EnvRef]).describe('Deployed origin tracegrove does not launch, e.g. https://staging.example.com, or env:PREVIEW_URL for a per-PR preview read at run time.'),
    health: Path.default('/health').describe('GET path that answers 2xx when the deployment is ready.'),
    release: z.object({ field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]*$/).describe('Health-body field holding the deployed release, e.g. build or version.'),
      expect: z.string().min(1).max(256).optional().describe('Expected release; a different deployment blocks the run with identity_mismatch. env:GITHUB_SHA reads it at run time.') }).strict().optional(),
    readyTimeoutMs: z.number().int().positive().max(300_000).default(20_000),
  }).strict(),
  z.object({
    compose: z.string().min(1).describe('Compose file, relative to this config.'),
    service: Name.describe('Service that serves the app.'),
    port: z.number().int().min(1).max(65535).describe('Container port the service listens on.'),
    health: Path.default('/health'),
    tokensEnv: z.string().default('TRACEGROVE_TOKENS').describe('Env var the compose file passes through to the app for host-issued persona tokens.'),
    readyTimeoutMs: z.number().int().positive().max(300_000).default(120_000),
  }).strict(),
  z.object({
    container: z.object({ image: z.string().min(1), port: z.number().int().min(1).max(65535), env: z.record(z.string(), z.string()).default({}), tokensEnv: z.string().default('TRACEGROVE_TOKENS') }).strict(),
    health: Path.default('/health'),
    readyTimeoutMs: z.number().int().positive().max(300_000).default(60_000),
  }).strict(),
]);
export type EnvironmentTarget = z.infer<typeof EnvironmentTarget>;
export type TargetKind = 'launch' | 'url' | 'compose' | 'container';
export function targetKind(target: EnvironmentTarget): TargetKind {
  return 'launch' in target ? 'launch' : 'url' in target ? 'url' : 'compose' in target ? 'compose' : 'container';
}

export const EnvironmentConfig = z.object({
  target: EnvironmentTarget,
  class: EnvironmentClass.optional().describe('isolated_candidate (local, docker), deployed_preview (staging), deployed_canary or production_observation. Defaults from the target.'),
  writes: z.enum(WRITE_POLICIES).optional().describe('none: only GET/HEAD and read tools. owned_namespace: writes only to records the run creates and deletes. Defaults from the class.'),
  personas: z.record(Name, EnvironmentPersona).optional().describe('Where each persona credential comes from in this environment. Launched targets default to host-issued tokens.'),
  whoami: z.object({ GET: Path, subject: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/) }).strict().optional()
    .describe('Endpoint that returns the signed-in identity, and the dot path of its subject. Lets doctor prove each persona is who you think.'),
  endpoints: z.record(Name, Url).optional().describe('Extra origins this environment admits (API, MCP, realtime), by name.'),
  network: z.object({ allow: z.array(z.string()).max(32).default([]) }).strict().optional().describe('Hostnames recipes and drivers may contact besides the target and endpoints.'),
  budget: z.object({ maxRequests: z.number().int().nonnegative().max(1_000_000).default(500), maxSpendCents: z.number().int().nonnegative().default(0) }).strict().optional(),
  agents: z.enum(AGENT_POLICIES).optional().describe('allow, ask (agents need a human approval) or deny. Defaults from the class.'),
}).strict();
export type EnvironmentConfig = z.infer<typeof EnvironmentConfig>;

/** Safety policy by class (the spec's table). Explicit config may tighten, never loosen, these. */
export const CLASS_POLICY = {
  isolated_candidate: { writes: 'owned_namespace', allowedWrites: ['none', 'owned_namespace'], cleanup: 'confirmed', resolvers: 'any', agents: 'allow' },
  deployed_preview: { writes: 'owned_namespace', allowedWrites: ['none', 'owned_namespace'], cleanup: 'confirmed_or_failed', resolvers: 'any', agents: 'ask' },
  deployed_canary: { writes: 'owned_namespace', allowedWrites: ['none', 'owned_namespace'], cleanup: 'confirmed_or_failed', resolvers: 'broker_only', agents: 'ask' },
  production_observation: { writes: 'none', allowedWrites: ['none'], cleanup: 'not_applicable', resolvers: 'any', agents: 'deny' },
} as const satisfies Record<EnvironmentClassName, { writes: typeof WRITE_POLICIES[number]; allowedWrites: readonly typeof WRITE_POLICIES[number][]; cleanup: string; resolvers: 'any' | 'broker_only'; agents: AgentPolicy }>;

export const DEFAULT_CLASS: Record<TargetKind, EnvironmentClassName> = { launch: 'isolated_candidate', compose: 'isolated_candidate', container: 'isolated_candidate', url: 'deployed_preview' };

export type ResolvedEnvironment = {
  name: string; config: EnvironmentConfig; kind: TargetKind; class: EnvironmentClassName;
  writes: typeof WRITE_POLICIES[number]; agents: AgentPolicy; implicit: boolean;
};

export const LOCAL_ENVIRONMENT: EnvironmentConfig = { target: { launch: 'app' } };
