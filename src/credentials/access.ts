/** One persona credential accessor (R3): every driver reads credentials through here. */
import type { HostSession } from '../hosts/types.ts';
import { bearerCredential, type RequestCredential } from './types.ts';

type CredentialSource = Pick<HostSession, 'credentials'> & Partial<Pick<HostSession, 'requestCredentials'>>;

export function credentialFor(session: CredentialSource | null | undefined, name: string | null): RequestCredential | null {
  if (!session || !name) return null;
  const recipe = session.requestCredentials?.get(name);
  if (recipe) return recipe;
  const bearer = session.credentials.get(name);
  return bearer ? bearerCredential(bearer, null, 'host_issued') : null;
}

export function namedCredentials(session: CredentialSource | null | undefined): Record<string, RequestCredential> {
  if (!session) return {};
  const names = new Set([...session.credentials.keys(), ...(session.requestCredentials?.keys() ?? [])]);
  return Object.fromEntries([...names].map(name => [name, credentialFor(session, name)!]));
}

/** Persona plus named credentials, the shape every surface driver takes. */
export function sessionCredentials(session: CredentialSource | null | undefined, personaCredentialName: string | null): { persona: RequestCredential | null; named: Record<string, RequestCredential> } {
  return { persona: credentialFor(session, personaCredentialName), named: namedCredentials(session) };
}
