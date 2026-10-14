import { sign, verify, type KeyObject } from 'node:crypto';
import { canonicalBytes, sha256Hex } from '../protocol/canonical.ts';
import {
  CleanupExpectationSchema, CleanupFollowupSchema, SignedCleanupFollowupSchema,
  type CleanupExpectation, type SignedCleanupFollowup,
} from '../protocol/schemas/cleanup.ts';
import { Conflict } from './errors.ts';

const domain = 'tracegrove.signed-cleanup-followup/v1\0';
const digest = (value: unknown) => `sha256:${sha256Hex(canonicalBytes(value))}`;
const signedBytes = (value: Omit<SignedCleanupFollowup, 'signature'>) =>
  Buffer.concat([Buffer.from(domain, 'utf8'), canonicalBytes(value)]);

export function cleanupExpectationDigest(raw: unknown): string {
  return digest(CleanupExpectationSchema.parse(raw));
}

/** Only an independent collector holding its protected signing key may issue this follow-up. */
export function signCleanupFollowup(raw: unknown, keyId: string, privateKey: KeyObject): SignedCleanupFollowup {
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Conflict('Cleanup follow-up requires an Ed25519 private key');
  }
  const unsigned = {
    schemaVersion: 'workflow.signed-cleanup-followup/v1' as const, algorithm: 'ed25519' as const,
    keyId, followup: CleanupFollowupSchema.parse(raw),
  };
  return SignedCleanupFollowupSchema.parse({ ...unsigned,
    signature: sign(null, signedBytes(unsigned), privateKey).toString('base64url') });
}

export type CleanupObserver = { scopeId: string; observerId: string; publicKey: KeyObject };

/**
 * Integrity and expectation validation only. The storage owner must recheck the
 * current lease, manifest and time under its admission lock before releasing it.
 * Signature trust does not establish provider qualification or authorize effects.
 */
export function verifyCleanupFollowup(raw: unknown, expectedRaw: unknown, input: {
  trustedObservers: ReadonlyMap<string, CleanupObserver>; observedAt: number;
}): { followup: SignedCleanupFollowup['followup']; proofDigest: string; expectation: CleanupExpectation } {
  if (!Number.isSafeInteger(input.observedAt) || input.observedAt < 0) throw new Conflict('Cleanup clock is invalid');
  const envelope = SignedCleanupFollowupSchema.parse(raw);
  const expected = CleanupExpectationSchema.parse(expectedRaw);
  const observer = input.trustedObservers.get(envelope.keyId);
  const { signature, ...unsigned } = envelope;
  const proof = envelope.followup;
  if (!observer || observer.publicKey.type !== 'public' || observer.publicKey.asymmetricKeyType !== 'ed25519' ||
    observer.scopeId !== expected.scopeId || observer.observerId !== proof.observerId ||
    observer.observerId === expected.workerId ||
    !verify(null, signedBytes(unsigned), observer.publicKey, Buffer.from(signature, 'base64url'))) {
    throw new Conflict('Cleanup observer or signature is not trusted');
  }
  for (const key of ['scopeId', 'attemptId', 'workerId', 'generation', 'coordinationVersion'] as const) {
    if (proof[key] !== expected[key]) throw new Conflict('Cleanup follow-up has a stale or different binding');
  }
  if (proof.expectationDigest !== cleanupExpectationDigest(expected) || expected.unresolvedEffectIds.length) {
    throw new Conflict('Cleanup ownership/effect closure is unresolved or changed');
  }
  if (proof.observedAt > input.observedAt || proof.expiresAt <= input.observedAt) {
    throw new Conflict('Cleanup follow-up is expired or from the future');
  }
  if (proof.evidence.length !== expected.resources.length || expected.resources.some(resource =>
    !proof.evidence.some(item => item.entityKey === resource.entityKey && item.kind === resource.check))) {
    throw new Conflict('Cleanup follow-up does not cover every owned resource');
  }
  return { followup: proof, proofDigest: digest(envelope), expectation: expected };
}
