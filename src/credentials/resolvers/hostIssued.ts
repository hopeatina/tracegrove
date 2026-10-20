/** `host_issued`: the launcher mints a random per-attempt token and hands the app its subject. */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Blocked } from '../../core/errors.ts';
import { Secret } from '../secret.ts';
import { defineResolver } from '../types.ts';

const mint = () => randomBytes(24).toString('base64url');

export const hostIssued = defineResolver({
  kind: 'host_issued',
  refSchema: z.object({ subject: z.string().min(1) }).strict(),
  async probe() { return { state: 'resolvable', detail: 'issued by the launcher for each attempt' }; },
  async resolve() { return { value: Secret.of(mint()), expiresAt: null }; },
});
export default hostIssued;

/**
 * Issue every requested credential the launch recipe declares. Returns the in-memory credentials
 * and the token → subject map the app receives; a persona without an issuable credential blocks.
 */
export function issueHostCredentials(issued: ReadonlyArray<{ name: string; subject: string }>, requested: readonly string[], hostId: string): { credentials: Map<string, string>; tokenMap: Record<string, string> } {
  const credentials = new Map<string, string>();
  const tokenMap: Record<string, string> = {};
  for (const entry of issued) {
    if (!requested.includes(entry.name)) continue;
    const secret = mint();
    credentials.set(entry.name, secret);
    tokenMap[secret] = entry.subject;
  }
  for (const name of requested) {
    if (!credentials.has(name)) throw new Blocked([{ code: 'credential_not_issuable', detail: `host ${hostId} cannot issue ${name}; the persona has no resolvable credential in this environment`, owner: 'operator', action: 'declare the credential in the launch recipe, or give the persona a from: reference in this environment' }]);
  }
  return { credentials, tokenMap };
}
