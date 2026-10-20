/**
 * Resolver registry. One typed interface, lazily loaded per kind so a run only imports the resolvers
 * its personas name. `vault` and `doppler` slot in here with the same interface.
 */
import { SECRET_RESOLVER_KINDS, type SecretResolverKind } from '../protocol/index.ts';
import { execFile } from './exec.ts';
import { ResolverError, type AnyResolver, type ProbeState, type ResolveContext, type ResolvedSecret } from './types.ts';

export const RESOLVERS = {
  host_issued: () => import('./resolvers/hostIssued.ts').then(m => m.hostIssued as AnyResolver),
  env: () => import('./resolvers/env.ts').then(m => m.envResolver as AnyResolver),
  file: () => import('./resolvers/file.ts').then(m => m.fileResolver as AnyResolver),
  'aws-sm': () => import('./resolvers/aws.ts').then(m => m.awsSecretsManager as AnyResolver),
  'aws-ssm': () => import('./resolvers/aws.ts').then(m => m.awsParameterStore as AnyResolver),
  op: () => import('./resolvers/op.ts').then(m => m.onePassword as AnyResolver),
  'orgx-broker': () => import('./resolvers/orgxBroker.ts').then(m => m.orgxBroker as AnyResolver),
} satisfies Record<SecretResolverKind, () => Promise<AnyResolver>>;

export function resolverKindOf(uri: string): SecretResolverKind {
  if (uri === 'host_issued') return 'host_issued';
  const kind = uri.match(/^([a-z-]+):/)?.[1];
  if (kind && (SECRET_RESOLVER_KINDS as readonly string[]).includes(kind)) return kind as SecretResolverKind;
  throw new ResolverError('secret_ref_invalid', `${uri} names no known resolver (${SECRET_RESOLVER_KINDS.join(', ')})`);
}

export function defaultResolveContext(input: Partial<ResolveContext> & Pick<ResolveContext, 'root' | 'persona'>): ResolveContext {
  return { env: process.env, signal: new AbortController().signal, runId: 'doctor', fetch: globalThis.fetch.bind(globalThis), exec: execFile, ...input };
}

async function loaded(uri: string): Promise<{ resolver: AnyResolver; ref: unknown }> {
  const kind = resolverKindOf(uri);
  const resolver = await RESOLVERS[kind]();
  const parsed = resolver.refSchema.safeParse(kind === 'host_issued' ? { subject: 'host' } : uri);
  if (!parsed.success) throw new ResolverError('secret_ref_invalid', `${uri}: ${parsed.error.issues[0]?.message ?? 'invalid reference'}`);
  return { resolver, ref: parsed.data };
}

/** Never fetches a value; turns every failure into a typed state with a fix when one exists. */
export async function probeSecret(uri: string, ctx: ResolveContext): Promise<ProbeState & { kind: string }> {
  let kind = 'unknown';
  try { kind = resolverKindOf(uri); const { resolver, ref } = await loaded(uri); return { kind, ...(await resolver.probe(ref, ctx)) }; }
  catch (error) { return { kind, state: error instanceof ResolverError && error.code === 'secret_ref_invalid' ? 'missing' : 'unavailable', detail: (error as Error).message, ...(error instanceof ResolverError && error.fix ? { fix: error.fix } : {}) }; }
}

export async function resolveSecret(uri: string, ctx: ResolveContext): Promise<ResolvedSecret & { kind: SecretResolverKind }> {
  const kind = resolverKindOf(uri);
  const { resolver, ref } = await loaded(uri);
  return { kind, ...(await resolver.resolve(ref, ctx)) };
}
