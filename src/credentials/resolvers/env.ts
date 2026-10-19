/** `env:NAME`: read a persona secret from the process environment (CI). */
import { z } from 'zod';
import { Secret } from '../secret.ts';
import { ResolverError, defineResolver } from '../types.ts';

export const envResolver = defineResolver({
  kind: 'env',
  refSchema: z.string().regex(/^env:[A-Za-z_][A-Za-z0-9_]*$/).transform(uri => ({ name: uri.slice(4) })),
  async probe(ref, ctx) {
    return ctx.env[ref.name] ? { state: 'resolvable', detail: `environment variable ${ref.name} is set` }
      : { state: 'missing', detail: `environment variable ${ref.name} is not set`, fix: `export ${ref.name}=…  # or set it as a CI secret` };
  },
  async resolve(ref, ctx) {
    const value = ctx.env[ref.name];
    if (!value) throw new ResolverError('secret_missing', `environment variable ${ref.name} is not set`, `export ${ref.name}=…`);
    return { value: Secret.of(value), expiresAt: null };
  },
});
export default envResolver;
