/**
 * Two layers keep N resolvers and M auth recipes from becoming N×M adapters:
 * a resolver turns a reference into a `Secret`; an auth recipe turns that secret into request
 * credentials. Neither layer ever returns a secret inside a serializable record.
 */
import type { z } from 'zod';
import { Secret } from './secret.ts';

export type ProbeState = {
  state: 'resolvable' | 'missing' | 'expired' | 'denied' | 'unavailable';
  detail: string;
  /** A command the owner can run to fix it, e.g. `aws sso login --profile x`. */
  fix?: string;
  expiresAt?: string | null;
};

export type ExecResult = { code: number | null; stdout: string; stderr: string };
export type ExecFn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; signal: AbortSignal; timeoutMs: number }) => Promise<ExecResult>;

export type ResolveContext = {
  root: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  /** Binds broker-minted personas to the run that owns them. */
  runId: string;
  persona: string;
  fetch: typeof fetch;
  exec: ExecFn;
};

export type CredentialCheck = 'valid' | 'expired' | 'revoked' | 'unknown';

export type ResolvedSecret = {
  value: Secret;
  expiresAt: string | null;
  /** The subject the issuer says this credential signs in as (a broker-minted persona); whoami must match it. */
  subject?: string;
  /** A run-owned identity (e.g. a broker persona) that cleanup must revoke. */
  owned?: { entityKey: string; physicalId: string; boundaryId: string };
  revoke?(signal: AbortSignal): Promise<{ confirmed: boolean; detail: string }>;
  check?(signal: AbortSignal): Promise<CredentialCheck>;
};

export type CredentialResolver<K extends string, R> = {
  kind: K;
  /** Parses the reference URI. References are never secret and may be recorded in bundles. */
  refSchema: z.ZodType<R>;
  /** Cheap check that never fetches or prints a secret value. */
  probe(ref: R, ctx: ResolveContext): Promise<ProbeState>;
  resolve(ref: R, ctx: ResolveContext): Promise<ResolvedSecret>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyResolver = CredentialResolver<string, any>;
export const defineResolver = <K extends string, R>(resolver: CredentialResolver<K, R>) => resolver;

export class ResolverError extends Error {
  constructor(readonly code: 'secret_ref_invalid' | 'secret_missing' | 'secret_expired' | 'secret_access_denied' | 'secret_store_unavailable', message: string, readonly fix?: string) {
    super(message); this.name = 'ResolverError';
  }
}

/** Request credentials produced by an auth recipe. Header values are secrets; names are not. */
export type RequestCredential = {
  recipe: string;
  headers: Record<string, Secret>;
  /** Present when the recipe is bearer-shaped, for drivers that only speak bearer (browser, MCP, jobs). */
  bearer: Secret | null;
  expiresAt: string | null;
};

export function bearerCredential(token: Secret | string, expiresAt: string | null = null, recipe = 'bearer'): RequestCredential {
  const secret = typeof token === 'string' ? Secret.of(token) : token;
  return { recipe, headers: { authorization: Secret.of(`Bearer ${secret.reveal()}`) }, bearer: secret, expiresAt };
}
