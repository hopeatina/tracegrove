/**
 * `aws-sm://name#field` (Secrets Manager) and `aws-ssm://parameter` (SSM Parameter Store), called over
 * the AWS JSON API with SigV4 and the standard credential chain. Probes use metadata calls only
 * (DescribeSecret, DescribeParameters) so `env doctor` never reads a secret value.
 */
import { z } from 'zod';
import { Secret } from '../secret.ts';
import { ResolverError, defineResolver, type ResolveContext } from '../types.ts';
import { signRequest } from '../aws/sigv4.ts';
import { awsCredentials, awsEndpoint, awsProfileName, awsRegion } from '../aws/chain.ts';

type Service = 'secretsmanager' | 'ssm';
const TARGET_PREFIX: Record<Service, string> = { secretsmanager: 'secretsmanager', ssm: 'AmazonSSM' };

export async function awsJson(service: Service, operation: string, payload: unknown, ctx: Pick<ResolveContext, 'env' | 'fetch' | 'signal'>, region?: string | null): Promise<unknown> {
  const credentials = await awsCredentials(ctx);
  const resolvedRegion = awsRegion(ctx.env, region);
  const url = `${awsEndpoint(ctx.env, service, resolvedRegion)}/`;
  const body = JSON.stringify(payload);
  const headers = signRequest({ method: 'POST', url, body, service, region: resolvedRegion, credentials,
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `${TARGET_PREFIX[service]}.${operation}` } });
  delete headers.host;
  let response: Response;
  try { response = await ctx.fetch(url, { method: 'POST', headers, body, signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(10_000)]) }); }
  catch (error) { throw new ResolverError('secret_store_unavailable', `AWS ${service} unreachable: ${(error as Error).message}`); }
  const text = await response.text();
  if (response.ok) return text ? JSON.parse(text) : {};
  const type = (() => { try { return String((JSON.parse(text) as { __type?: string }).__type ?? ''); } catch { return ''; } })().split('#').pop() ?? '';
  const login = `aws sso login --profile ${awsProfileName(ctx.env)}`;
  if (/ResourceNotFound|ParameterNotFound/.test(type)) throw new ResolverError('secret_missing', `${service} ${operation}: not found`);
  if (/ExpiredToken|UnrecognizedClient|InvalidSignature/.test(type) || response.status === 401) throw new ResolverError('secret_expired', `${service} rejected the AWS credentials (${type || response.status})`, login);
  if (/AccessDenied/.test(type) || response.status === 403) throw new ResolverError('secret_access_denied', `${service} ${operation}: access denied`, `ask an admin to grant ${service}:${operation} to your role`);
  throw new ResolverError('secret_store_unavailable', `${service} ${operation} returned ${response.status} ${type}`);
}

function pickField(raw: string, field: string | null, label: string): string {
  if (!field) return raw;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ResolverError('secret_ref_invalid', `${label} is not JSON, so #${field} cannot select a field`); }
  const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[field] : undefined;
  if (value === undefined || value === null || value === '') throw new ResolverError('secret_missing', `${label} has no field ${field}`);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const probeFrom = async (call: () => Promise<unknown>, describe: string) => {
  try { await call(); return { state: 'resolvable' as const, detail: describe }; }
  catch (error) {
    if (!(error instanceof ResolverError)) return { state: 'unavailable' as const, detail: (error as Error).message };
    const state = error.code === 'secret_missing' ? 'missing' as const : error.code === 'secret_expired' ? 'expired' as const : error.code === 'secret_access_denied' ? 'denied' as const : 'unavailable' as const;
    return { state, detail: error.message, ...(error.fix ? { fix: error.fix } : {}) };
  }
};

const regionParam = (uri: string) => { const q = uri.match(/[?&]region=([a-z0-9-]+)/); return q ? q[1]! : null; };

export const awsSecretsManager = defineResolver({
  kind: 'aws-sm',
  refSchema: z.string().regex(/^aws-sm:\/\/[^\s#?]+(\?region=[a-z0-9-]+)?(#[A-Za-z0-9_.-]+)?$/).transform(uri => {
    const [head, field] = uri.slice('aws-sm://'.length).split('#') as [string, string | undefined];
    return { secretId: head.split('?')[0]!, field: field ?? null, region: regionParam(uri) };
  }),
  probe: (ref, ctx) => probeFrom(() => awsJson('secretsmanager', 'DescribeSecret', { SecretId: ref.secretId }, ctx, ref.region), `secret ${ref.secretId} exists and your AWS credentials can see it`),
  async resolve(ref, ctx) {
    const result = await awsJson('secretsmanager', 'GetSecretValue', { SecretId: ref.secretId }, ctx, ref.region) as { SecretString?: string };
    if (typeof result.SecretString !== 'string') throw new ResolverError('secret_missing', `secret ${ref.secretId} has no SecretString`);
    return { value: Secret.of(pickField(result.SecretString, ref.field, `secret ${ref.secretId}`)), expiresAt: null };
  },
});

export const awsParameterStore = defineResolver({
  kind: 'aws-ssm',
  refSchema: z.string().regex(/^aws-ssm:\/\/[^\s#?]+(\?region=[a-z0-9-]+)?(#[A-Za-z0-9_.-]+)?$/).transform(uri => {
    const [head, field] = uri.slice('aws-ssm://'.length).split('#') as [string, string | undefined];
    const name = head.split('?')[0]!;
    return { name: name.startsWith('/') ? name : `/${name}`, field: field ?? null, region: regionParam(uri) };
  }),
  probe: (ref, ctx) => probeFrom(async () => {
    const found = await awsJson('ssm', 'DescribeParameters', { ParameterFilters: [{ Key: 'Name', Option: 'Equals', Values: [ref.name] }] }, ctx, ref.region) as { Parameters?: unknown[] };
    if (!found.Parameters?.length) throw new ResolverError('secret_missing', `parameter ${ref.name} not found`);
  }, `parameter ${ref.name} exists and your AWS credentials can see it`),
  async resolve(ref, ctx) {
    const result = await awsJson('ssm', 'GetParameter', { Name: ref.name, WithDecryption: true }, ctx, ref.region) as { Parameter?: { Value?: string } };
    if (typeof result.Parameter?.Value !== 'string') throw new ResolverError('secret_missing', `parameter ${ref.name} has no value`);
    return { value: Secret.of(pickField(result.Parameter.Value, ref.field, `parameter ${ref.name}`)), expiresAt: null };
  },
});
