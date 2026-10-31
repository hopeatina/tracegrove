/**
 * Establish persona credentials for a target tracegrove did not issue tokens to: resolve each
 * reference, apply its auth recipe, and prove identity through the environment's whoami endpoint.
 * Values stay in memory; only resolver kind, reference, recipe, expiry and observed subject are recorded.
 */
import type { PersonaBinding, TargetBinding } from '../protocol/index.ts';
import { Blocked } from '../core/errors.ts';
import { getPath } from '../core/reducer.ts';
import { execFile } from '../credentials/exec.ts';
import { applyRecipe, RecipeError } from '../credentials/recipes.ts';
import { resolveSecret } from '../credentials/registry.ts';
import { ResolverError, type CredentialCheck, type RequestCredential, type ResolvedSecret } from '../credentials/types.ts';

export type CredentialRecord = { persona: string; credentialName: string; resolver: string; ref: string; recipe: string; expiresAt: string | null; subject: string | null; expectedSubject: string | null };
export type EstablishedPersonas = {
  credentials: Map<string, RequestCredential>;
  records: CredentialRecord[];
  owned: Array<{ entityKey: string; physicalId: string; boundaryId: string }>;
  check(name: string, signal: AbortSignal): Promise<CredentialCheck>;
  release(signal: AbortSignal): Promise<{ confirmed: boolean; detail: string }>;
};

/** Hosts the environment admits: the target, its named endpoints and network.allow. */
export function admittedHosts(binding: TargetBinding, origin: string): Set<string> {
  return new Set([new URL(origin).host, ...Object.values(binding.endpoints).map(url => new URL(url).host), ...binding.network.allow]);
}

export async function whoami(origin: string, path: string, subjectPath: string, credential: RequestCredential, signal: AbortSignal): Promise<{ status: number; subject: string | null }> {
  const headers = Object.fromEntries(Object.entries(credential.headers).map(([name, value]) => [name, value.reveal()]));
  const response = await fetch(`${origin}${path}`, { headers, redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  let body: unknown = null; try { body = await response.json(); } catch { body = null; }
  const found = getPath({ body }, `body.${subjectPath}`);
  return { status: response.status, subject: found.present && (typeof found.value === 'string' || typeof found.value === 'number') ? String(found.value) : null };
}

export async function establishPersonas(input: { binding: TargetBinding; origin: string; requested: readonly string[]; root: string; runId: string; signal: AbortSignal; hostId: string; verifyIdentity?: boolean }): Promise<EstablishedPersonas> {
  const { binding, origin } = input;
  const credentials = new Map<string, RequestCredential>();
  const records: CredentialRecord[] = [];
  const resolved = new Map<string, ResolvedSecret>();
  const hosts = admittedHosts(binding, origin);
  const release = async (signal: AbortSignal) => {
    const results = await Promise.all([...resolved.values()].map(async secret => (secret.revoke ? secret.revoke(signal) : { confirmed: true, detail: 'nothing to revoke' })));
    for (const secret of resolved.values()) secret.value.dispose();
    for (const credential of credentials.values()) { for (const value of Object.values(credential.headers)) value.dispose(); credential.bearer?.dispose(); credential.browserEntry?.dispose(); }
    const failed = results.filter(r => !r.confirmed);
    return { confirmed: failed.length === 0, detail: results.length ? results.map(r => r.detail).join('; ') : 'no run-owned identities' };
  };
  const needed = binding.personas.filter(p => input.requested.includes(p.credentialName));
  for (const name of input.requested) {
    if (!binding.personas.some(p => p.credentialName === name)) {
      throw new Blocked([{ code: 'credential_not_issuable', detail: `host ${input.hostId} cannot provide ${name}; the persona has no resolvable credential in environment ${binding.environment}`, owner: 'developer', action: `add personas.${name.replace(/_token$/, '')}.from under environments.${binding.environment}` }]);
    }
  }
  try {
    for (const persona of needed) {
      let secret: ResolvedSecret;
      try {
        secret = await resolveSecret(persona.from, { root: input.root, env: process.env, signal: input.signal, runId: input.runId, persona: persona.persona, fetch: globalThis.fetch.bind(globalThis), exec: execFile });
      } catch (error) {
        const e = error as ResolverError;
        throw new Blocked([{ code: 'persona_secret_unresolvable', detail: `${persona.persona} (${persona.from}): ${e instanceof ResolverError ? e.message : 'resolver failed'}`, owner: 'operator', action: e instanceof ResolverError && e.fix ? `run: ${e.fix}` : `tracegrove env doctor ${binding.environment}` }]);
      }
      resolved.set(persona.credentialName, secret);
      let credential: RequestCredential;
      try {
        credential = await applyRecipe(persona.auth, secret.value, { origin, fetch: globalThis.fetch.bind(globalThis), signal: input.signal, secretExpiresAt: secret.expiresAt, allowHost: url => hosts.has(new URL(url).host) });
      } catch (error) {
        const code = error instanceof RecipeError ? error.code : 'auth_recipe_failed';
        throw new Blocked([{ code, detail: `${persona.persona} (${persona.auth.kind}): ${(error as Error).message}`, owner: 'operator', action: `tracegrove whoami --env ${binding.environment} --as ${persona.persona}` }]);
      }
      if (secret.browserEntry) credential.browserEntry = secret.browserEntry;
      credentials.set(persona.credentialName, credential);
      records.push({ persona: persona.persona, credentialName: persona.credentialName, resolver: persona.from === 'host_issued' ? 'host_issued' : persona.from.split(':')[0]!, ref: persona.from, recipe: persona.auth.kind, expiresAt: credential.expiresAt ?? secret.expiresAt, subject: null, expectedSubject: persona.subject ?? secret.subject ?? null });
    }
    if (binding.whoami && input.verifyIdentity !== false) await proveIdentities(binding, origin, needed, credentials, records, input.signal);
  } catch (error) {
    await release(AbortSignal.timeout(10_000)).catch(() => undefined);
    throw error;
  }
  return {
    credentials, records,
    owned: [...resolved.values()].flatMap(secret => (secret.owned ? [secret.owned] : [])),
    async check(name, signal) {
      const secret = resolved.get(name);
      if (!secret) return 'unknown';
      if (secret.check) return secret.check(signal).catch(() => 'unknown' as const);
      const expiresAt = credentials.get(name)?.expiresAt ?? secret.expiresAt;
      return expiresAt && Date.parse(expiresAt) <= Date.now() ? 'expired' : 'unknown';
    },
    release,
  };
}

async function proveIdentities(binding: TargetBinding, origin: string, personas: PersonaBinding[], credentials: Map<string, RequestCredential>, records: CredentialRecord[], signal: AbortSignal): Promise<void> {
  const problems: Array<{ code: string; detail: string; persona: string }> = [];
  const seen = new Map<string, string>();
  for (const persona of personas) {
    const record = records.find(r => r.credentialName === persona.credentialName)!;
    let result: { status: number; subject: string | null };
    try { result = await whoami(origin, binding.whoami!.path, binding.whoami!.subject, credentials.get(persona.credentialName)!, signal); }
    catch { problems.push({ code: 'deployment_unreachable', detail: `whoami for ${persona.persona} did not answer`, persona: persona.persona }); continue; }
    record.subject = result.subject;
    if (result.status === 401 || result.status === 403) { problems.push({ code: 'auth_recipe_failed', detail: `${persona.persona}: whoami returned ${result.status}; the credential was not accepted`, persona: persona.persona }); continue; }
    if (record.expectedSubject && result.subject !== record.expectedSubject) problems.push({ code: 'persona_identity_mismatch', detail: `persona ${persona.persona} resolved to subject ${result.subject ?? 'unknown'}, expected ${record.expectedSubject}${result.subject && seen.has(result.subject) ? ` (${seen.get(result.subject)}'s subject)` : ''}`, persona: persona.persona });
    if (result.subject && seen.has(result.subject)) problems.push({ code: 'persona_identity_collision', detail: `personas ${seen.get(result.subject)} and ${persona.persona} both sign in as ${result.subject}`, persona: persona.persona });
    if (result.subject) seen.set(result.subject, persona.persona);
  }
  if (problems.length) throw new Blocked(problems.map(p => ({ code: p.code, detail: p.detail, owner: 'operator', action: `tracegrove whoami --env ${binding.environment} --as ${p.persona}` })));
}
