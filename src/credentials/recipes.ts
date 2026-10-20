/**
 * Auth recipes turn a resolved secret into request credentials. Any recipe combines with any
 * resolver. Recipes that sign in (form login, OAuth, Clerk, Supabase) talk only to hosts the
 * environment admits, and return header values as `Secret`s.
 */
import type { AuthRecipeConfig, AuthRecipeKind } from '../protocol/index.ts';
import { Secret } from './secret.ts';
import { bearerCredential, type RequestCredential } from './types.ts';

export class RecipeError extends Error {
  constructor(readonly code: 'auth_recipe_failed' | 'origin_not_allowed', message: string) { super(message); this.name = 'RecipeError'; }
}

export type RecipeContext = { origin: string; fetch: typeof fetch; signal: AbortSignal; secretExpiresAt: string | null; allowHost(url: string): boolean };
type Recipe<K extends AuthRecipeKind> = { kind: K; apply(secret: Secret, config: Extract<AuthRecipeConfig, { kind: K }>, ctx: RecipeContext): Promise<RequestCredential> };
const defineRecipe = <K extends AuthRecipeKind>(recipe: Recipe<K>) => recipe;

const bounded = (ctx: RecipeContext) => AbortSignal.any([ctx.signal, AbortSignal.timeout(15_000)]);
async function post(ctx: RecipeContext, url: string, init: { headers: Record<string, string>; body: string }, what: string): Promise<{ response: Response; json: Record<string, unknown> | null }> {
  if (!ctx.allowHost(url)) throw new RecipeError('origin_not_allowed', `${what}: ${new URL(url).host} is not in this environment's network allowlist`);
  let response: Response;
  try { response = await ctx.fetch(url, { method: 'POST', ...init, redirect: 'manual', signal: bounded(ctx) }); }
  catch (error) { throw new RecipeError('auth_recipe_failed', `${what}: ${new URL(url).host} unreachable (${(error as Error).name})`); }
  const text = await response.text();
  let json: Record<string, unknown> | null = null; try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { json = null; }
  return { response, json };
}
const jwtExpiry = (jwt: string): string | null => {
  try { const exp = (JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number }).exp; return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : null; }
  catch { return null; }
};
const inSeconds = (seconds: unknown) => (typeof seconds === 'number' && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null);
const form = (values: Record<string, string | undefined>) => new URLSearchParams(Object.entries(values).filter((e): e is [string, string] => e[1] !== undefined)).toString();

export const AUTH_RECIPES = {
  bearer: defineRecipe({ kind: 'bearer', async apply(secret, _config, ctx) { return bearerCredential(secret, ctx.secretExpiresAt); } }),
  header: defineRecipe({ kind: 'header', async apply(secret, config, ctx) {
    return { recipe: 'header', headers: { [config.name.toLowerCase()]: Secret.of(`${config.prefix}${secret.reveal()}`) }, bearer: null, expiresAt: ctx.secretExpiresAt };
  } }),
  form_login: defineRecipe({ kind: 'form_login', async apply(secret, config, ctx) {
    let username = config.username; let password = secret.reveal();
    try { const parsed = JSON.parse(password) as { username?: string; password?: string }; if (parsed && typeof parsed.password === 'string') { password = parsed.password; username = parsed.username ?? username; } } catch { /* plain password */ }
    if (!username) throw new RecipeError('auth_recipe_failed', 'form_login needs username: in the recipe or a JSON {username,password} secret');
    const { response } = await post(ctx, `${ctx.origin}${config.path}`, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ [config.usernameField]: username, [config.passwordField]: password }) }, 'form login');
    if (response.status >= 400) throw new RecipeError('auth_recipe_failed', `form login returned ${response.status}`);
    const cookie = response.headers.getSetCookie().map(line => line.split(';')[0]!).find(pair => pair.startsWith(`${config.cookie}=`));
    if (!cookie || cookie === `${config.cookie}=`) throw new RecipeError('auth_recipe_failed', `form login set no ${config.cookie} cookie`);
    return { recipe: 'form_login', headers: { cookie: Secret.of(cookie) }, bearer: null, expiresAt: null };
  } }),
  oauth_client_credentials: defineRecipe({ kind: 'oauth_client_credentials', async apply(secret, config, ctx) {
    const { response, json } = await post(ctx, config.tokenUrl, { headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: secret.reveal(), scope: config.scope, audience: config.audience }) }, 'OAuth token request');
    const token = json?.access_token;
    if (response.status !== 200 || typeof token !== 'string') throw new RecipeError('auth_recipe_failed', `OAuth token endpoint returned ${response.status}${typeof json?.error === 'string' ? ` ${json.error}` : ''}`);
    return bearerCredential(token, inSeconds(json?.expires_in), 'oauth_client_credentials');
  } }),
  clerk_testing: defineRecipe({ kind: 'clerk_testing', async apply(secret, config, ctx) {
    const backend = { authorization: `Bearer ${secret.reveal()}`, 'content-type': 'application/json' };
    const testing = await post(ctx, `${config.backendApi.replace(/\/$/, '')}/v1/testing_tokens`, { headers: backend, body: '{}' }, 'Clerk testing token');
    if (testing.response.status !== 200 || typeof testing.json?.token !== 'string') throw new RecipeError('auth_recipe_failed', `Clerk testing_tokens returned ${testing.response.status}`);
    const ticket = await post(ctx, `${config.backendApi.replace(/\/$/, '')}/v1/sign_in_tokens`, { headers: backend, body: JSON.stringify({ user_id: config.userId, expires_in_seconds: 300 }) }, 'Clerk sign-in token');
    if (ticket.response.status !== 200 || typeof ticket.json?.token !== 'string') throw new RecipeError('auth_recipe_failed', `Clerk sign_in_tokens returned ${ticket.response.status}`);
    const signIn = await post(ctx, `${config.frontendApi.replace(/\/$/, '')}/v1/client/sign_ins?__clerk_testing_token=${encodeURIComponent(testing.json.token)}`,
      { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ strategy: 'ticket', ticket: ticket.json.token }) }, 'Clerk ticket sign-in');
    const sessions = ((signIn.json?.client as { sessions?: Array<{ id?: string; last_active_token?: { jwt?: string } }> } | undefined)?.sessions) ?? [];
    const created = (signIn.json?.response as { created_session_id?: string } | undefined)?.created_session_id;
    const jwt = sessions.find(s => s.id === created)?.last_active_token?.jwt ?? sessions[0]?.last_active_token?.jwt;
    if (signIn.response.status !== 200 || typeof jwt !== 'string') throw new RecipeError('auth_recipe_failed', `Clerk ticket sign-in returned ${signIn.response.status}`);
    return bearerCredential(jwt, jwtExpiry(jwt), 'clerk_testing');
  } }),
  supabase_password: defineRecipe({ kind: 'supabase_password', async apply(secret, config, ctx) {
    const { response, json } = await post(ctx, `${config.url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, { headers: { apikey: config.anonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email: config.email, password: secret.reveal() }) }, 'Supabase sign-in');
    const token = json?.access_token;
    if (response.status !== 200 || typeof token !== 'string') throw new RecipeError('auth_recipe_failed', `Supabase token endpoint returned ${response.status}`);
    const credential = bearerCredential(token, inSeconds(json?.expires_in) ?? jwtExpiry(token), 'supabase_password');
    return { ...credential, headers: { ...credential.headers, apikey: Secret.of(config.anonKey) } };
  } }),
} satisfies { [K in AuthRecipeKind]: Recipe<K> };

export function applyRecipe(config: AuthRecipeConfig, secret: Secret, ctx: RecipeContext): Promise<RequestCredential> {
  const recipe = AUTH_RECIPES[config.kind] as Recipe<AuthRecipeKind>;
  return recipe.apply(secret, config as never, ctx);
}
