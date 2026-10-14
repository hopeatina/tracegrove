import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { expect, it } from 'vitest';
import { canonicalBytes, sha256Hex, type CleanupExpectation } from '../src/protocol/index.ts';
import { cleanupExpectationDigest, signCleanupFollowup, verifyCleanupFollowup } from '../src/core/cleanupAttestation.ts';

it('signs a follow-up only after an independent local HTTP absence observation', async () => {
  let present = true;
  const provider = createServer((request, response) => {
    if (request.url !== '/resource/owned-1') { response.writeHead(404); response.end(); return; }
    if (request.method === 'DELETE') { present = false; response.writeHead(204); response.end(); return; }
    response.writeHead(present ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ present }));
  });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  if (!address || typeof address === 'string') throw new Error('local provider did not bind');
  const url = `http://127.0.0.1:${address.port}/resource/owned-1`;
  const expected: CleanupExpectation = {
    schemaVersion: 'workflow.cleanup-expectation/v1', scopeId: 'test:workspace', attemptId: 'test:attempt',
    workerId: 'executing-worker', generation: 1, coordinationVersion: 3, effectIds: ['create-owned-1'],
    unresolvedEffectIds: [], ownershipLedgerHeadDigest: 'sha256:' + 'c'.repeat(64),
    resources: [{ entityKey: 'fixture', physicalId: 'owned-1', boundaryId: 'application', check: 'http_absence' }],
  };
  const keys = generateKeyPairSync('ed25519'); // Independent collector's ephemeral test key.
  const observe = async () => {
    const response = await fetch(url);
    const body = await response.json();
    const observedAt = Date.now();
    return { schemaVersion: 'workflow.cleanup-followup/v1', scopeId: expected.scopeId, attemptId: expected.attemptId,
      workerId: expected.workerId, generation: expected.generation, coordinationVersion: expected.coordinationVersion,
      observerId: 'independent-collector', expectationDigest: cleanupExpectationDigest(expected),
      observedAt, expiresAt: observedAt + 1000, evidence: [{ kind: 'http_absence', entityKey: 'fixture', method: 'GET',
        status: response.status, receiptDigest: 'sha256:' + sha256Hex(canonicalBytes({ url, status: response.status, body })) }] };
  };
  try {
    const before = await observe();
    expect(() => signCleanupFollowup(before, 'collector', keys.privateKey)).toThrow();
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(204);
    const after = await observe();
    const envelope = signCleanupFollowup(after, 'collector', keys.privateKey);
    const result = verifyCleanupFollowup(envelope, expected, { observedAt: Date.now(), trustedObservers: new Map([
      ['collector', { scopeId: expected.scopeId, observerId: 'independent-collector', publicKey: keys.publicKey }],
    ]) });
    expect(result.followup.evidence[0]).toMatchObject({ kind: 'http_absence', status: 404 });
  } finally {
    provider.closeAllConnections();
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()));
  }
});
