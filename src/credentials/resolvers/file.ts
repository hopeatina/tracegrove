/** `file:path#KEY`: a gitignored per-developer dotenv file, relative to the project root. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { Secret } from '../secret.ts';
import { ResolverError, defineResolver, type ResolveContext } from '../types.ts';

export function parseDotenv(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values.set(match[1]!, value);
  }
  return values;
}

const fileOf = (ref: { path: string }, ctx: Pick<ResolveContext, 'root'>) => {
  const abs = resolve(ctx.root, ref.path);
  const rel = relative(ctx.root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new ResolverError('secret_ref_invalid', `${ref.path} is outside the project`);
  return abs;
};

export const fileResolver = defineResolver({
  kind: 'file',
  refSchema: z.string().regex(/^file:[^#\s]+#[A-Za-z_][A-Za-z0-9_.-]*$/).transform(uri => { const [path, key] = uri.slice(5).split('#') as [string, string]; return { path, key }; }),
  async probe(ref, ctx) {
    try {
      const abs = fileOf(ref, ctx);
      if (!existsSync(abs)) return { state: 'missing', detail: `${ref.path} does not exist`, fix: `echo '${ref.key}=…' >> ${ref.path}  # keep it gitignored` };
      if ((statSync(abs).mode & 0o077) !== 0 && process.platform !== 'win32') {
        const has = parseDotenv(readFileSync(abs, 'utf8')).has(ref.key);
        return has ? { state: 'resolvable', detail: `${ref.path} has ${ref.key} (tip: chmod 600 ${ref.path})` } : { state: 'missing', detail: `${ref.path} has no ${ref.key}`, fix: `add ${ref.key}=… to ${ref.path}` };
      }
      return parseDotenv(readFileSync(abs, 'utf8')).has(ref.key) ? { state: 'resolvable', detail: `${ref.path} has ${ref.key}` } : { state: 'missing', detail: `${ref.path} has no ${ref.key}`, fix: `add ${ref.key}=… to ${ref.path}` };
    } catch (error) { return { state: 'missing', detail: (error as Error).message }; }
  },
  async resolve(ref, ctx) {
    const abs = fileOf(ref, ctx);
    if (!existsSync(abs)) throw new ResolverError('secret_missing', `${ref.path} does not exist`, `create ${ref.path} with ${ref.key}=…`);
    const value = parseDotenv(readFileSync(abs, 'utf8')).get(ref.key);
    if (!value) throw new ResolverError('secret_missing', `${ref.path} has no ${ref.key}`, `add ${ref.key}=… to ${ref.path}`);
    return { value: Secret.of(value), expiresAt: null };
  },
});
export default fileResolver;
