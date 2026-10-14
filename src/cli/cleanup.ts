import { readFileSync, statSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { z } from 'zod';
import { verifyCleanupFollowup } from '../core/cleanupAttestation.ts';

const Trust = z.object({
  schemaVersion: z.literal('workflow.cleanup-observers/v1'),
  observers: z.array(z.object({ keyId: z.string().min(1).max(256), scopeId: z.string().min(1).max(256),
    observerId: z.string().min(1).max(256),
    publicKeyPem: z.string().max(8192).startsWith('-----BEGIN PUBLIC KEY-----'),
  }).strict()).min(1).max(100),
}).strict();
const read = (path: string): unknown => {
  if (statSync(path).size > 4 * 1024 * 1024) throw new Error('cleanup input exceeds 4 MiB');
  return JSON.parse(readFileSync(path, 'utf8'));
};

/** Offline integrity check only. Files supplied here cannot authorize hosted release. */
export function checkCleanupFiles(proofPath: string, expectationPath: string, trustPath: string) {
  const checkedAt = Date.now();
  try {
    const trust = Trust.parse(read(trustPath));
    if (new Set(trust.observers.map(item => item.keyId)).size !== trust.observers.length) {
      throw new Error('cleanup observer key IDs must be unique');
    }
    const trustedObservers = new Map(trust.observers.map(item => [item.keyId, {
      scopeId: item.scopeId, observerId: item.observerId, publicKey: createPublicKey(item.publicKeyPem),
    }]));
    const result = verifyCleanupFollowup(read(proofPath), read(expectationPath), { trustedObservers, observedAt: checkedAt });
    return { ok: true, checkedAt, validationScope: 'signature_and_expectation', hostedReleaseAdmitted: false,
      proofDigest: result.proofDigest, resourceCount: result.expectation.resources.length, problems: [] as string[] };
  } catch (error) {
    const problems = error instanceof z.ZodError
      ? error.issues.map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      : [error instanceof Error ? error.message : 'cleanup validation failed'];
    return { ok: false, checkedAt, validationScope: 'signature_and_expectation', hostedReleaseAdmitted: false,
      proofDigest: null, resourceCount: null, problems };
  }
}
