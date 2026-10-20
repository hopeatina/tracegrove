import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tryExample } from '../src/cli/try.ts';
import { checkSignature, keygen, loadSigningKey, signRun, summarizeSignatures } from '../src/authoring/signing.ts';
import { renderCard } from '../src/authoring/card.ts';
import { renderHandoff } from '../src/authoring/handoff.ts';
import { resolveRun } from '../src/authoring/run.ts';

let root = '';
let runDir = '';
const signers = () => join(root, 'tracegrove', 'signers');
beforeAll(async () => {
  root = join(mkdtempSync(join(tmpdir(), 'tg-sign-')), 'notes');
  let facts: Record<string, unknown> = {};
  const code = await tryExample({ example: 'notes-api', bug: null, out: root, open: false, port: null, json: true, samplesRoot: join(import.meta.dirname, '../src/samples'), write: (v) => { facts = v as Record<string, unknown>; } });
  expect(code).toBe(0);
  runDir = facts.runDir as string;
}, 60_000);
afterAll(() => { if (root) rmSync(join(root, '..'), { recursive: true, force: true }); });

describe('signed evidence', () => {
  it('generates a key whose private half stays private and whose public half is committed', () => {
    const made = keygen(root, 'tracegrove', 'hope');
    expect(made.fingerprint).toMatch(/^SHA256:/);
    expect(statSync(made.privateKey).mode & 0o077).toBe(0);
    expect(made.privateKey).toContain(join('.tracegrove', 'keys'));
    expect(existsSync(join(signers(), 'hope.pub'))).toBe(true);
    expect(() => keygen(root, 'tracegrove', 'hope')).toThrow();
  });

  it('is unsigned until signed, then trusted', () => {
    expect(checkSignature(runDir, signers())).toEqual({ state: 'unsigned' });
    const signed = signRun(runDir, loadSigningKey(root, null, {}));
    expect(signed).toMatchObject({ outcome: 'passed', signer: { name: 'hope' } });
    expect(checkSignature(runDir, signers())).toMatchObject({ state: 'trusted', signer: 'hope' });
    expect(readdirSync(join(runDir, 'bundle'))).not.toContain('signature.json');
  });

  it('reports a valid signature from an uncommitted key as untrusted', () => {
    const other = mkdtempSync(join(tmpdir(), 'tg-key-'));
    const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    writeFileSync(join(other, 'ci.pem'), pem);
    const saved = readFileSync(join(runDir, 'signature.json'));
    signRun(runDir, loadSigningKey(root, null, { TRACEGROVE_SIGNING_KEY: pem, TRACEGROVE_SIGNER: 'ci' }));
    expect(checkSignature(runDir, signers())).toMatchObject({ state: 'untrusted', signer: 'ci' });
    writeFileSync(join(runDir, 'signature.json'), saved);
    rmSync(other, { recursive: true, force: true });
  });

  it('calls a signature invalid when it or the bundle changes', () => {
    const saved = readFileSync(join(runDir, 'signature.json'), 'utf8');
    writeFileSync(join(runDir, 'signature.json'), saved.replace('"outcome": "passed"', '"outcome": "assertion_failed"'));
    expect(checkSignature(runDir, signers())).toMatchObject({ state: 'invalid', detail: 'the signature does not match' });
    writeFileSync(join(runDir, 'signature.json'), saved);
    expect(checkSignature(runDir, signers()).state).toBe('trusted');
  });

  it('shows on the PR card and in the handoff report, and an invalid signature fails the card', () => {
    expect(summarizeSignatures(root, 'tracegrove', [runDir.split('/').at(-1)!], (r) => resolveRun(root, r))).toMatchObject({ runs: 1, trusted: 1, signers: ['hope'] });
    const card = renderCard({ dirs: [root] });
    expect(card.verdict).toBe('holds');
    expect(card.signatures).toMatchObject({ trusted: 1, invalid: 0 });
    expect(card.markdown).toContain('Signed by hope');
    expect(renderHandoff(root).html).toContain('signed by hope');
    const saved = readFileSync(join(runDir, 'signature.json'), 'utf8');
    writeFileSync(join(runDir, 'signature.json'), saved.replace(/"signedAt": "\d{4}/, '"signedAt": "1999'));
    const tampered = renderCard({ dirs: [root] });
    expect(tampered.verdict).toBe('fails');
    expect(tampered.markdown).toContain('signed evidence was changed after it was signed');
    writeFileSync(join(runDir, 'signature.json'), saved);
  });

  it('refuses to sign a bundle that does not verify', () => {
    const campaign = join(runDir, 'bundle', 'campaign.json');
    const saved = readFileSync(campaign);
    writeFileSync(campaign, Buffer.concat([saved, Buffer.from('\n')]));
    expect(() => signRun(runDir, loadSigningKey(root, null, {}))).toThrow(/bundle|verif/i);
    writeFileSync(campaign, saved);
  });
});
