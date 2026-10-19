/**
 * Additive host-plan binding for targets tracegrove does not launch as a local process: a deployed
 * URL, a Docker Compose service, or a single container. It carries secret *references* only, never
 * values; the bundle can therefore record exactly which resolver, reference and recipe each persona used.
 */
import { z } from 'zod';
import { IdString, PositiveMillis, NonNegInt, Cents, LIMITS } from '../primitives.ts';

export const SECRET_RESOLVER_KINDS = ['host_issued', 'env', 'file', 'aws-sm', 'aws-ssm', 'op', 'orgx-broker'] as const;
export type SecretResolverKind = typeof SECRET_RESOLVER_KINDS[number];

/** A secret reference URI: `env:NAME`, `file:path#KEY`, `aws-sm://name#field`, `aws-ssm://param`, `op://vault/item/field`, `orgx-broker://env?role=…`, or `host_issued`. */
export const SecretRefUri = z.string().min(1).max(LIMITS.shortText)
  .regex(/^(?:host_issued|env:[A-Za-z_][A-Za-z0-9_]*|file:[^#\s]+#[A-Za-z_][A-Za-z0-9_.-]*|aws-sm:\/\/[^\s#]+(?:#[A-Za-z0-9_.-]+)?|aws-ssm:\/\/[^\s]+|op:\/\/[^\s]+|orgx-broker:\/\/[A-Za-z0-9._-]+(?:\?[^\s#]*)?)$/,
    'use host_issued, env:NAME, file:path#KEY, aws-sm://name#field, aws-ssm://parameter, op://vault/item/field or orgx-broker://env?role=…')
  .describe('Where the persona secret comes from. A reference, never a value.');

const HttpsOrLoopback = z.string().url().max(LIMITS.url).refine(value => /^https:\/\//.test(value) || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(value),
  'use https, or http only for loopback');
const PathString = z.string().regex(/^\/(?!\/)[^?#\s]*$/).max(LIMITS.shortText);

export const AuthRecipeConfig = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bearer') }).strict().describe('Authorization: Bearer <secret>.'),
  z.object({ kind: z.literal('header'), name: z.string().regex(/^[A-Za-z0-9-]+$/).max(64), prefix: z.string().max(32).default('') }).strict().describe('<name>: <prefix><secret>.'),
  z.object({ kind: z.literal('form_login'), path: PathString, username: z.string().min(1).max(256).optional(),
    usernameField: z.string().max(64).default('username'), passwordField: z.string().max(64).default('password'), cookie: z.string().regex(/^[A-Za-z0-9_.-]+$/).max(128) }).strict()
    .describe('POST a login form; keep the named session cookie. The secret is the password, or JSON {username,password}.'),
  z.object({ kind: z.literal('oauth_client_credentials'), tokenUrl: HttpsOrLoopback, clientId: z.string().min(1).max(256), scope: z.string().max(512).optional(), audience: z.string().max(512).optional() }).strict()
    .describe('OAuth 2.0 client credentials grant; the secret is the client secret.'),
  z.object({ kind: z.literal('clerk_testing'), frontendApi: HttpsOrLoopback, backendApi: HttpsOrLoopback.default('https://api.clerk.com'), userId: z.string().min(1).max(128) }).strict()
    .describe('Clerk testing token plus a sign-in ticket exchanged for a session token; the secret is the Clerk secret key.'),
  z.object({ kind: z.literal('supabase_password'), url: HttpsOrLoopback, anonKey: z.string().min(1).max(4096), email: z.string().min(3).max(320) }).strict()
    .describe('Supabase password grant; the secret is the password. The anon key is public by design.'),
]);
export type AuthRecipeConfig = z.infer<typeof AuthRecipeConfig>;
export const AUTH_RECIPE_KINDS = AuthRecipeConfig.options.map(option => option.shape.kind.value);
export type AuthRecipeKind = AuthRecipeConfig['kind'];

export const PersonaBinding = z.object({
  persona: IdString,
  credentialName: IdString,
  from: SecretRefUri,
  auth: AuthRecipeConfig,
  /** Expected subject; whoami and doctor compare the signed-in identity with it. */
  subject: z.string().min(1).max(256).nullable(),
}).strict();
export type PersonaBinding = z.infer<typeof PersonaBinding>;

export const TargetBinding = z.object({
  kind: z.enum(['url', 'compose', 'container']),
  environment: IdString,
  /** The authoring project root, relative to the compiled folder: `file:` refs and compose files resolve against it. */
  projectRoot: z.string().max(LIMITS.shortText),
  /** Deployed origin for url targets; null for owned targets until launch reports one. */
  origin: HttpsOrLoopback.nullable(),
  readiness: z.object({ path: PathString, timeoutMs: PositiveMillis.max(300_000) }).strict(),
  /** Deployment identity: a health-body field compared with an expected release. */
  identity: z.object({ field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]*$/).max(128).nullable(), expect: z.string().min(1).max(256).nullable() }).strict(),
  endpoints: z.record(IdString, HttpsOrLoopback),
  network: z.object({ allow: z.array(z.string().regex(/^[A-Za-z0-9.-]+(?::\d+)?$/).max(255)).max(32) }).strict(),
  writes: z.enum(['none', 'owned_namespace']),
  personas: z.array(PersonaBinding).max(32),
  whoami: z.object({ path: PathString, subject: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/).max(256) }).strict().nullable(),
  budget: z.object({ maxRequests: NonNegInt, maxSpendCents: Cents }).strict().nullable(),
  compose: z.object({ file: z.string().min(1).max(LIMITS.shortText), service: IdString, port: z.number().int().min(1).max(65535), tokensEnv: z.string().max(64), fileDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable(),
  container: z.object({ image: z.string().min(1).max(LIMITS.shortText), port: z.number().int().min(1).max(65535), env: z.record(z.string().max(64), z.string().max(LIMITS.shortText)), tokensEnv: z.string().max(64) }).strict().nullable(),
}).strict().superRefine((binding, ctx) => {
  if (binding.kind === 'url' && !binding.origin) ctx.addIssue({ code: 'custom', message: 'url targets need an origin' });
  if (binding.kind === 'compose' && !binding.compose) ctx.addIssue({ code: 'custom', message: 'compose targets need a compose section' });
  if (binding.kind === 'container' && !binding.container) ctx.addIssue({ code: 'custom', message: 'container targets need a container section' });
  if (new Set(binding.personas.map(p => p.credentialName)).size !== binding.personas.length) ctx.addIssue({ code: 'custom', message: 'duplicate persona credential' });
});
export type TargetBinding = z.infer<typeof TargetBinding>;
