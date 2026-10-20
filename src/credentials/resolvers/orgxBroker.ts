/**
 * `orgx-broker://<environment>?role=…&workspace=fresh&ttl=…`: mint a short-lived persona in a
 * run-owned workspace, check it mid-run, and revoke it during cleanup. Wire contract:
 * docs/environments.md#broker. The broker is addressed by TRACEGROVE_ORGX_BROKER_URL and
 * authorized by the standing-grant key in TRACEGROVE_ORGX_TOKEN; neither value is recorded.
 */
import { z } from 'zod';
import { Secret } from '../secret.ts';
import { ResolverError, defineResolver, type CredentialCheck, type ResolveContext } from '../types.ts';

export const BrokerMint = z.object({
  persona: z.object({ id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/), subject: z.string().min(1).max(256), workspaceId: z.string().min(1).max(128), role: z.string().min(1).max(64) }).strict(),
  token: z.string().min(8).max(8192),
  expiresAt: z.string().datetime({ offset: true }),
  receiptId: z.string().max(128).nullable().optional(),
}).strict();
export const BrokerState = z.object({ id: z.string(), state: z.enum(['active', 'expired', 'revoked']), expiresAt: z.string().datetime({ offset: true }).nullable().optional() }).passthrough();

const base = (ctx: Pick<ResolveContext, 'env'>) => (ctx.env.TRACEGROVE_ORGX_BROKER_URL ?? 'https://useorgx.com').replace(/\/$/, '');
const grant = (ctx: Pick<ResolveContext, 'env'>) => {
  const token = ctx.env.TRACEGROVE_ORGX_TOKEN;
  if (!token) throw new ResolverError('secret_missing', 'TRACEGROVE_ORGX_TOKEN (the standing-grant key) is not set', 'export TRACEGROVE_ORGX_TOKEN=oxk_…');
  return { authorization: `Bearer ${token}` };
};
const bounded = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

async function call(ctx: Pick<ResolveContext, 'env' | 'fetch'>, method: string, path: string, signal: AbortSignal, body?: unknown): Promise<{ status: number; json: unknown }> {
  let response: Response;
  try {
    response = await ctx.fetch(`${base(ctx)}${path}`, { method, signal: bounded(signal),
      headers: { ...grant(ctx), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch (error) {
    if (error instanceof ResolverError) throw error;
    throw new ResolverError('secret_store_unavailable', `OrgX persona broker unreachable at ${base(ctx)}`, 'check TRACEGROVE_ORGX_BROKER_URL and your network');
  }
  const text = await response.text();
  let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json };
}

function refused(status: number, json: unknown): ResolverError {
  const code = (json as { error?: string } | null)?.error ?? String(status);
  if (status === 401) return new ResolverError('secret_expired', 'the OrgX grant key was rejected', 'export TRACEGROVE_ORGX_TOKEN=<a current oxk_ key>');
  if (status === 403) return new ResolverError('secret_access_denied', `the broker refused: ${code}`, 'ask an OrgX admin for the test-personas standing grant on this environment');
  if (status === 404) return new ResolverError('secret_missing', `the broker does not serve this environment (${code})`);
  return new ResolverError('secret_store_unavailable', `the broker returned ${status} ${code}`);
}

async function stateOf(ctx: Pick<ResolveContext, 'env' | 'fetch'>, id: string, signal: AbortSignal): Promise<CredentialCheck | 'gone'> {
  const result = await call(ctx, 'GET', `/api/test-personas/${encodeURIComponent(id)}`, signal);
  if (result.status === 404) return 'gone';
  if (result.status !== 200) return 'unknown';
  const parsed = BrokerState.safeParse(result.json);
  if (!parsed.success) return 'unknown';
  if (parsed.data.state === 'active' && parsed.data.expiresAt && Date.parse(parsed.data.expiresAt) <= Date.now()) return 'expired';
  return parsed.data.state === 'active' ? 'valid' : parsed.data.state;
}

export const orgxBroker = defineResolver({
  kind: 'orgx-broker',
  refSchema: z.string().regex(/^orgx-broker:\/\/[A-Za-z0-9._-]+(\?[^\s#]*)?$/).transform((uri, issue) => {
    const url = new URL(uri.replace(/^orgx-broker:\/\//, 'https://broker/'));
    const environment = url.pathname.slice(1);
    const ttl = Number(url.searchParams.get('ttl') ?? 900);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 86_400) { issue.addIssue({ code: 'custom', message: 'ttl must be 1..86400 seconds' }); return z.NEVER; }
    return { environment, role: url.searchParams.get('role') ?? 'member', workspace: url.searchParams.get('workspace') ?? 'fresh', ttlSeconds: ttl };
  }),
  async probe(ref, ctx) {
    try {
      const result = await call(ctx, 'GET', `/api/test-personas/capabilities?environment=${encodeURIComponent(ref.environment)}`, ctx.signal);
      if (result.status !== 200) { const error = refused(result.status, result.json); return { state: error.code === 'secret_access_denied' ? 'denied' : error.code === 'secret_missing' ? 'missing' : error.code === 'secret_expired' ? 'expired' : 'unavailable', detail: error.message, ...(error.fix ? { fix: error.fix } : {}) }; }
      const caps = result.json as { enabled?: boolean; roles?: string[] } | null;
      if (!caps?.enabled) return { state: 'denied', detail: `the broker has persona minting disabled for ${ref.environment}` };
      if (caps.roles && !caps.roles.includes(ref.role)) return { state: 'missing', detail: `the broker offers roles ${caps.roles.join(', ')}, not ${ref.role}` };
      return { state: 'resolvable', detail: `the broker can mint a ${ref.role} persona in a ${ref.workspace} workspace on ${ref.environment}` };
    } catch (error) {
      const e = error as ResolverError;
      return { state: e.code === 'secret_missing' ? 'missing' : 'unavailable', detail: e.message, ...(e.fix ? { fix: e.fix } : {}) };
    }
  },
  async resolve(ref, ctx) {
    const result = await call(ctx, 'POST', '/api/test-personas', ctx.signal, { environment: ref.environment, role: ref.role, workspace: ref.workspace, runId: ctx.runId, persona: ctx.persona, ttlSeconds: ref.ttlSeconds });
    if (result.status !== 201 && result.status !== 200) throw refused(result.status, result.json);
    const minted = BrokerMint.safeParse(result.json);
    if (!minted.success) throw new ResolverError('secret_store_unavailable', 'the broker returned an invalid mint response');
    const { persona, token, expiresAt } = minted.data;
    const id = persona.id;
    return {
      value: Secret.of(token), expiresAt, subject: persona.subject,
      owned: { entityKey: `persona.${ctx.persona}`, physicalId: id, boundaryId: 'identity' },
      check: (signal) => stateOf(ctx, id, signal).then(state => (state === 'gone' ? 'revoked' : state)),
      async revoke(signal) {
        try {
          const deleted = await call(ctx, 'DELETE', `/api/test-personas/${encodeURIComponent(id)}`, signal);
          if (deleted.status !== 204 && deleted.status !== 200 && deleted.status !== 404) return { confirmed: false, detail: `broker DELETE returned ${deleted.status}` };
          const after = await stateOf(ctx, id, signal);
          const confirmed = after === 'gone' || after === 'revoked';
          return { confirmed, detail: confirmed ? `persona ${id} revoked` : `persona ${id} still ${after} after DELETE` };
        } catch (error) { return { confirmed: false, detail: `revoke failed: ${(error as Error).message}` }; }
      },
    };
  },
});
export default orgxBroker;
