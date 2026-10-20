import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import { Secret, SecretSerializationError, redactSecrets, redactValue } from '../src/credentials/secret.ts';
import { credentialFor, sessionCredentials } from '../src/credentials/access.ts';
import { issueHostCredentials } from '../src/credentials/resolvers/hostIssued.ts';
import { authHeaders, bearerFor } from '../src/adapters/http/driver.ts';
import { CAPABILITIES, capabilityGap, caseCapabilities } from '../src/core/capabilities.ts';
import { BLOCK_CODES, describeBlock } from '../src/core/blockCodes.ts';
import { HOSTS, hostFor } from '../src/hosts/registry.ts';
import { Blocked } from '../src/core/errors.ts';

describe('Secret', () => {
  it('cannot be serialized, printed or interpolated', () => {
    const secret = Secret.of('sk_live_very_secret_value');
    expect(() => JSON.stringify({ secret })).toThrow(SecretSerializationError);
    expect(String(secret)).toBe('<redacted>');
    expect(`${secret}`).toBe('<redacted>');
    expect(inspect({ secret })).not.toContain('very_secret');
    expect(secret.reveal()).toBe('sk_live_very_secret_value');
    expect(redactSecrets('Bearer sk_live_very_secret_value!')).toBe('Bearer <redacted>!');
    expect(redactValue({ a: ['x sk_live_very_secret_value'], b: secret })).toEqual({ a: ['x <redacted>'], b: '<redacted>' });
    secret.dispose();
    expect(() => secret.reveal()).toThrow();
    expect(redactSecrets('sk_live_very_secret_value')).toBe('sk_live_very_secret_value');
  });
});

describe('credential seams', () => {
  it('host_issued issues every requested credential and blocks the rest', () => {
    const issued = issueHostCredentials([{ name: 'owner_token', subject: 'alice' }], ['owner_token'], 'host');
    const token = issued.credentials.get('owner_token')!;
    expect(issued.tokenMap[token]).toBe('alice');
    expect(() => issueHostCredentials([], ['owner_token'], 'host')).toThrow(Blocked);
  });
  it('one accessor serves bearer and header recipes', () => {
    const session = { credentials: new Map([['owner_token', 'abc123456']]), requestCredentials: new Map([['key_token', { recipe: 'header', headers: { 'x-api-key': Secret.of('k-123456') }, bearer: null, expiresAt: null }]]) };
    expect(credentialFor(session, 'owner_token')?.bearer?.reveal()).toBe('abc123456');
    const creds = sessionCredentials(session, 'owner_token');
    expect(authHeaders({ auth: { kind: 'persona' } }, creds)).toEqual({ authorization: 'Bearer abc123456' });
    expect(authHeaders({ auth: { kind: 'credential', name: 'key_token' } }, creds)).toEqual({ 'x-api-key': 'k-123456' });
    expect(() => bearerFor({ auth: { kind: 'credential', name: 'key_token' } }, creds)).toThrow(/auth recipe cannot be used/);
    expect(authHeaders({ auth: { kind: 'persona' } }, { persona: 'legacy', named: {} })).toEqual({ authorization: 'Bearer legacy' });
  });
});

describe('typed registries', () => {
  it('capabilities name their hosts and the planner gap', () => {
    expect(caseCapabilities({ mcp: true, browser: false, fixtures: true })).toEqual(['http.request', 'observe', 'mcp.call', 'fixture.http']);
    expect(capabilityGap('mcp.call', 'local_process')).toBeNull();
    expect(capabilityGap('mcp.call', 'mock_loopback')).toMatch(/not provided by the mock_loopback host/);
    expect(capabilityGap('custom.thing', 'mock_loopback')).toBeNull();
    for (const spec of Object.values(CAPABILITIES)) expect(spec.providedBy.length).toBeGreaterThan(0);
  });
  it('block codes carry owner, action, fix and docs', () => {
    expect(describeBlock('approval_required', { env: 'staging' })).toMatchObject({ owner: 'operator', fix: 'tracegrove approve --env staging' });
    expect(describeBlock('something_new', {}, 'do the thing')).toEqual({ code: 'something_new', owner: 'developer', action: 'do the thing', fix: null, docs: null });
    for (const code of Object.keys(BLOCK_CODES)) expect(describeBlock(code).docs).toBeTruthy();
  });
  it('every host kind loads lazily and overrides keep their legacy names', async () => {
    for (const [kind, load] of Object.entries(HOSTS)) expect((await load()).kind).toBe(kind);
    const fake = { start: async () => { throw new Error('x'); } };
    expect(await hostFor('local_process', { local: fake })).toBe(fake);
  });
});
