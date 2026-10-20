/** `op://vault/item/field`: the 1Password CLI (`op read`). Probes check sign-in and the field label only. */
import { z } from 'zod';
import { Secret } from '../secret.ts';
import { ResolverError, defineResolver, type ResolveContext } from '../types.ts';

const OP = (ctx: Pick<ResolveContext, 'env'>) => ctx.env.TRACEGROVE_OP_BIN ?? 'op';
const INSTALL = 'install the 1Password CLI: https://developer.1password.com/docs/cli/get-started/';

function failure(stderr: string, code: number | null): ResolverError {
  if (code === null) return new ResolverError('secret_store_unavailable', 'the 1Password CLI (op) is not installed', INSTALL);
  if (/not (currently )?signed in|session expired|authorization/i.test(stderr)) return new ResolverError('secret_expired', '1Password CLI is not signed in', 'eval $(op signin)');
  if (/isn't an item|not found|no item|isn't a vault|could not find/i.test(stderr)) return new ResolverError('secret_missing', `1Password: ${stderr.trim().split('\n')[0]}`);
  return new ResolverError('secret_store_unavailable', `op exited ${code}: ${stderr.trim().split('\n')[0] ?? ''}`);
}

export const onePassword = defineResolver({
  kind: 'op',
  refSchema: z.string().regex(/^op:\/\/[^/\s]+\/[^/\s]+(\/[^/\s]+)?\/[^/\s]+$/).transform(uri => {
    const parts = uri.slice('op://'.length).split('/');
    return { uri, vault: parts[0]!, item: parts[1]!, field: parts.at(-1)! };
  }),
  async probe(ref, ctx) {
    const who = await ctx.exec(OP(ctx), ['whoami', '--format', 'json'], { env: ctx.env, signal: ctx.signal, timeoutMs: 10_000 });
    if (who.code !== 0) { const error = failure(who.stderr, who.code); return { state: error.code === 'secret_expired' ? 'expired' : 'unavailable', detail: error.message, ...(error.fix ? { fix: error.fix } : {}) }; }
    const item = await ctx.exec(OP(ctx), ['item', 'get', ref.item, '--vault', ref.vault, '--format', 'json'], { env: ctx.env, signal: ctx.signal, timeoutMs: 15_000 });
    if (item.code !== 0) { const error = failure(item.stderr, item.code); return { state: error.code === 'secret_missing' ? 'missing' : 'unavailable', detail: error.message }; }
    let labels: string[] = [];
    try { labels = ((JSON.parse(item.stdout) as { fields?: Array<{ label?: string; id?: string }> }).fields ?? []).flatMap(f => [f.label ?? '', f.id ?? '']); } catch { /* treat as missing */ }
    return labels.includes(ref.field) ? { state: 'resolvable', detail: `${ref.vault}/${ref.item} has field ${ref.field}` } : { state: 'missing', detail: `${ref.vault}/${ref.item} has no field ${ref.field}` };
  },
  async resolve(ref, ctx) {
    const result = await ctx.exec(OP(ctx), ['read', '--no-newline', ref.uri], { env: ctx.env, signal: ctx.signal, timeoutMs: 15_000 });
    if (result.code !== 0) throw failure(result.stderr, result.code);
    const value = result.stdout.replace(/\r?\n$/, '');
    if (!value) throw new ResolverError('secret_missing', `${ref.uri} is empty`);
    return { value: Secret.of(value), expiresAt: null };
  },
});
export default onePassword;
