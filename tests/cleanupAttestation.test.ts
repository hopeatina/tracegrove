import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cleanupExpectationDigest, signCleanupFollowup, verifyCleanupFollowup } from '../src/core/cleanupAttestation.ts';
import type { CleanupExpectation, CleanupFollowup } from '../src/protocol/index.ts';

const keys = generateKeyPairSync('ed25519'); // Ephemeral test keys, never a provider credential.
const now = 10_000;
const expected: CleanupExpectation = {
  schemaVersion: 'workflow.cleanup-expectation/v1', scopeId: 'workspace:1', attemptId: 'attempt:1',
  workerId: 'worker:1', generation: 2, coordinationVersion: 4, effectIds: ['create:1'],
  unresolvedEffectIds: [], resources: [{ entityKey: 'fixture:1', physicalId: 'resource:1', boundaryId: 'api', check: 'http_absence' },
    { entityKey: 'host:1', physicalId: 'host:1', boundaryId: 'host', check: 'host_stop' }],
  ownershipLedgerHeadDigest: 'sha256:' + 'c'.repeat(64),
};
const proof = (expectation = expected): CleanupFollowup => ({
  schemaVersion: 'workflow.cleanup-followup/v1', scopeId: expectation.scopeId, attemptId: expectation.attemptId,
  workerId: expectation.workerId, generation: expectation.generation, coordinationVersion: expectation.coordinationVersion,
  observerId: 'janitor:1', expectationDigest: cleanupExpectationDigest(expectation), observedAt: now, expiresAt: now + 1000,
  evidence: [{ entityKey: 'fixture:1', kind: 'http_absence', method: 'GET', status: 404, receiptDigest: 'sha256:' + 'a'.repeat(64) },
    { entityKey: 'host:1', kind: 'host_stop', receiptDigest: 'sha256:' + 'b'.repeat(64) }],
});
const trust = { observedAt: now, trustedObservers: new Map([['janitor-key', {
  observerId: 'janitor:1', scopeId: 'workspace:1', publicKey: keys.publicKey,
}]]) };
const signed = (value = proof()) => signCleanupFollowup(value, 'janitor-key', keys.privateKey);

describe('independent signed cleanup follow-up', () => {
  it('validates an immutable follow-up against the complete trusted expectation', () => {
    const envelope = signed();
    const original = JSON.stringify(envelope);
    expect(verifyCleanupFollowup(envelope, expected, trust)).toMatchObject({
      expectation: expected, followup: proof(), proofDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(envelope)).toBe(original);
  });
  it('rejects tampering, untrusted keys, revoked keys and cross-workspace observer grants', () => {
    const envelope = signed();
    expect(() => verifyCleanupFollowup({ ...envelope, followup: { ...envelope.followup, expiresAt: now + 2000 } }, expected, trust)).toThrow(/signature/);
    expect(() => verifyCleanupFollowup({ ...envelope, keyId: 'unknown' }, expected, trust)).toThrow(/trusted/);
    expect(() => verifyCleanupFollowup(envelope, expected, { ...trust, trustedObservers: new Map() })).toThrow(/trusted/);
    expect(() => verifyCleanupFollowup(envelope, expected, { ...trust, trustedObservers: new Map([['janitor-key', {
      ...trust.trustedObservers.get('janitor-key')!, scopeId: 'workspace:2',
    }]]) })).toThrow(/trusted/);
  });
  it.each(['scopeId', 'attemptId', 'workerId', 'generation', 'coordinationVersion'] as const)('rejects stale %s', key => {
    const changed = { ...expected, [key]: typeof expected[key] === 'number' ? expected[key] + 1 : expected[key] + ':new' };
    expect(() => verifyCleanupFollowup(signed(), changed, trust)).toThrow();
  });
  it('retains uncertain effects and refuses a changed resource identity or effect set', () => {
    const unresolved = { ...expected, unresolvedEffectIds: ['create:1'] };
    expect(() => verifyCleanupFollowup(signed(proof(unresolved)), unresolved, trust)).toThrow(/unresolved/);
    expect(() => verifyCleanupFollowup(signed(), { ...expected, effectIds: ['create:1', 'create:2'] }, trust)).toThrow(/closure/);
    expect(() => verifyCleanupFollowup(signed(), { ...expected, resources: expected.resources.map(item => ({ ...item, physicalId: 'different' })) }, trust)).toThrow(/closure/);
  });
  it('refuses missing, extra, duplicate or wrong-kind evidence', () => {
    expect(() => verifyCleanupFollowup(signed({ ...proof(), evidence: proof().evidence.slice(1) }), expected, trust)).toThrow(/every/);
    expect(() => verifyCleanupFollowup(signed({ ...proof(), evidence: [...proof().evidence, { ...proof().evidence[1]!, entityKey: 'extra' }] }), expected, trust)).toThrow(/every/);
    expect(() => signed({ ...proof(), evidence: [proof().evidence[0]!, proof().evidence[0]!] })).toThrow();
    expect(() => verifyCleanupFollowup(signed({ ...proof(), evidence: [{ kind: 'host_stop', entityKey: 'fixture:1', receiptDigest: 'sha256:' + 'a'.repeat(64) }, proof().evidence[1]!] }), expected, trust)).toThrow(/every/);
  });
  it('rejects stale/future evidence and a signer that is the executing worker', () => {
    expect(() => verifyCleanupFollowup(signed(), expected, { ...trust, observedAt: now + 1000 })).toThrow(/expired/);
    expect(() => verifyCleanupFollowup(signed(), expected, { ...trust, observedAt: now - 1 })).toThrow(/future/);
    const envelope = signed({ ...proof(), observerId: expected.workerId });
    expect(() => verifyCleanupFollowup(envelope, expected, { ...trust, trustedObservers: new Map([['janitor-key', {
      scopeId: expected.scopeId, observerId: expected.workerId, publicKey: keys.publicKey,
    }]]) })).toThrow(/trusted/);
  });
  it('refuses worker flags, a success status as absence and noncanonical signature encodings', () => {
    expect(() => signed({ ...proof(), confirmed: true } as CleanupFollowup)).toThrow();
    expect(() => signed({ ...proof(), evidence: [{ ...proof().evidence[0]!, status: 200 }, proof().evidence[1]!] } as CleanupFollowup)).toThrow();
    const envelope = signed();
    expect(() => verifyCleanupFollowup({ ...envelope, signature: envelope.signature.slice(0, -1) + 'B' }, expected, trust)).toThrow();
  });
});
