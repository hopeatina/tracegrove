import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { cleanupExpectationDigest, signCleanupFollowup } from '../src/core/cleanupAttestation.ts';

it('CLI reports integrity separately from hosted release and returns 2 for untrusted proof', () => {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-cleanup-cli-'));
  const keys = generateKeyPairSync('ed25519');
  const now = Date.now();
  const expected = { schemaVersion: 'workflow.cleanup-expectation/v1', scopeId: 'test', attemptId: 'a',
    workerId: 'worker', generation: 1, coordinationVersion: 1, effectIds: [], unresolvedEffectIds: [], resources: [] };
  const proof = signCleanupFollowup({ schemaVersion: 'workflow.cleanup-followup/v1', scopeId: 'test', attemptId: 'a',
    workerId: 'worker', generation: 1, coordinationVersion: 1, observerId: 'janitor',
    expectationDigest: cleanupExpectationDigest(expected), observedAt: now, expiresAt: now + 30_000, evidence: [] }, 'key', keys.privateKey);
  const proofPath = join(root, 'proof.json'); const expectationPath = join(root, 'expected.json'); const trustPath = join(root, 'trust.json');
  const trust = { schemaVersion: 'workflow.cleanup-observers/v1', observers: [{ keyId: 'key', scopeId: 'test', observerId: 'janitor',
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }) }] };
  const cli = () => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/main.ts', 'verify-cleanup',
    '--proof', proofPath, '--expectation', expectationPath, '--trust', trustPath, '--json'], { encoding: 'utf8' });
  try {
    writeFileSync(proofPath, JSON.stringify(proof)); writeFileSync(expectationPath, JSON.stringify(expected));
    writeFileSync(trustPath, JSON.stringify(trust));
    const good = cli();
    expect(good.status, good.stderr).toBe(0);
    expect(JSON.parse(good.stdout)).toMatchObject({ ok: true, hostedReleaseAdmitted: false,
      validationScope: 'signature_and_expectation', resourceCount: 0 });
    writeFileSync(trustPath, JSON.stringify({ ...trust, observers: [{ ...trust.observers[0], keyId: 'revoked' }] }));
    const denied = cli();
    expect(denied.status, denied.stderr).toBe(2);
    expect(JSON.parse(denied.stdout)).toMatchObject({ ok: false, hostedReleaseAdmitted: false });
    writeFileSync(proofPath, '{');
    expect(cli().status).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
