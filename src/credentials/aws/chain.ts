/**
 * The standard AWS credential chain, without the SDK: environment variables, the shared
 * credentials file, static keys in the config file, then an IAM Identity Center (SSO) profile using
 * the token cache `aws sso login` writes. An expired SSO session is reported with the login command.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ResolverError } from '../types.ts';
import type { AwsCredentials } from './sigv4.ts';

export function parseIni(text: string): Map<string, Record<string, string>> {
  const sections = new Map<string, Record<string, string>>();
  let current: Record<string, string> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[#;].*$/, '').trim();
    if (!line) continue;
    const head = line.match(/^\[(.+)\]$/);
    if (head) { current = {}; sections.set(head[1]!.trim(), current); continue; }
    const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (kv && current) current[kv[1]!.trim()] = kv[2]!.trim();
  }
  return sections;
}

const readIni = (path: string) => (existsSync(path) ? parseIni(readFileSync(path, 'utf8')) : new Map<string, Record<string, string>>());

export type AwsContext = { env: NodeJS.ProcessEnv; fetch: typeof fetch; signal: AbortSignal };

export function awsProfileName(env: NodeJS.ProcessEnv): string { return env.AWS_PROFILE ?? env.AWS_DEFAULT_PROFILE ?? 'default'; }

function files(env: NodeJS.ProcessEnv) {
  const home = env.HOME ?? homedir();
  return { config: readIni(env.AWS_CONFIG_FILE ?? join(home, '.aws', 'config')), credentials: readIni(env.AWS_SHARED_CREDENTIALS_FILE ?? join(home, '.aws', 'credentials')), home };
}
const profileSection = (config: Map<string, Record<string, string>>, profile: string) => config.get(profile === 'default' ? 'default' : `profile ${profile}`);

export function awsRegion(env: NodeJS.ProcessEnv, override?: string | null): string {
  return override ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? profileSection(files(env).config, awsProfileName(env))?.region ?? 'us-east-1';
}

/** Endpoint for a service, honoring AWS_ENDPOINT_URL_<SERVICE> and AWS_ENDPOINT_URL (used by local fakes). */
export function awsEndpoint(env: NodeJS.ProcessEnv, service: 'secretsmanager' | 'ssm', region: string): string {
  const specific = service === 'secretsmanager' ? env.AWS_ENDPOINT_URL_SECRETS_MANAGER : env.AWS_ENDPOINT_URL_SSM;
  return (specific ?? env.AWS_ENDPOINT_URL ?? `https://${service}.${region}.amazonaws.com`).replace(/\/$/, '');
}

export async function awsCredentials(ctx: AwsContext): Promise<AwsCredentials> {
  const { env } = ctx;
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) return { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN, source: 'environment' };
  const profile = awsProfileName(env);
  const { config, credentials, home } = files(env);
  const shared = credentials.get(profile);
  if (shared?.aws_access_key_id && shared.aws_secret_access_key) return { accessKeyId: shared.aws_access_key_id, secretAccessKey: shared.aws_secret_access_key, sessionToken: shared.aws_session_token, source: `shared credentials [${profile}]` };
  const section = profileSection(config, profile);
  if (section?.aws_access_key_id && section.aws_secret_access_key) return { accessKeyId: section.aws_access_key_id, secretAccessKey: section.aws_secret_access_key, sessionToken: section.aws_session_token, source: `config [${profile}]` };
  const login = `aws sso login --profile ${profile}`;
  if (section && (section.sso_session || section.sso_start_url)) {
    const session = section.sso_session ? config.get(`sso-session ${section.sso_session}`) : undefined;
    const startUrl = session?.sso_start_url ?? section.sso_start_url;
    const ssoRegion = session?.sso_region ?? section.sso_region ?? awsRegion(env);
    if (!startUrl || !section.sso_account_id || !section.sso_role_name) throw new ResolverError('secret_store_unavailable', `AWS profile ${profile} is missing sso_start_url, sso_account_id or sso_role_name`, `aws configure sso --profile ${profile}`);
    const cacheFile = join(env.AWS_SSO_CACHE_DIR ?? join(home, '.aws', 'sso', 'cache'), `${createHash('sha1').update(section.sso_session ?? startUrl).digest('hex')}.json`);
    if (!existsSync(cacheFile)) throw new ResolverError('secret_expired', `no AWS SSO session for profile ${profile}`, login);
    const token = JSON.parse(readFileSync(cacheFile, 'utf8')) as { accessToken?: string; expiresAt?: string };
    if (!token.accessToken || !token.expiresAt || Date.parse(token.expiresAt) <= Date.now()) throw new ResolverError('secret_expired', `the AWS SSO session for profile ${profile} has expired`, login);
    const portal = (env.AWS_ENDPOINT_URL_SSO ?? `https://portal.sso.${ssoRegion}.amazonaws.com`).replace(/\/$/, '');
    const response = await ctx.fetch(`${portal}/federation/credentials?role_name=${encodeURIComponent(section.sso_role_name)}&account_id=${encodeURIComponent(section.sso_account_id)}`,
      { headers: { 'x-amz-sso_bearer_token': token.accessToken }, signal: ctx.signal });
    if (response.status === 401 || response.status === 403) throw new ResolverError('secret_expired', `AWS SSO rejected the cached session for ${profile}`, login);
    if (!response.ok) throw new ResolverError('secret_store_unavailable', `AWS SSO returned ${response.status}`);
    const role = ((await response.json()) as { roleCredentials?: { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: number } }).roleCredentials;
    if (!role) throw new ResolverError('secret_store_unavailable', 'AWS SSO returned no role credentials');
    return { accessKeyId: role.accessKeyId, secretAccessKey: role.secretAccessKey, sessionToken: role.sessionToken, expiration: new Date(role.expiration).toISOString(), source: `sso [${profile}]` };
  }
  throw new ResolverError('secret_store_unavailable', `no AWS credentials found (environment, shared credentials or SSO profile ${profile})`, login);
}
