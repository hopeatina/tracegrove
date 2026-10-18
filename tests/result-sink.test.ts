import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemps, editFile, planSample, resealBundle, runSample, sampleCopy, sampleIdentityDigest } from '../conformance/helpers.ts';
import { localScope } from '../src/core/corpus.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalResultSink, type ResultSinkAuthority } from '../src/core/resultSink.ts';
import { LocalBundleArchive } from '../src/core/bundleArchive.ts';
import { VerifiedBundleSnapshot, verifyBundle } from '../src/core/bundle.ts';
import { digestOfBytes, freeze } from '../src/protocol/index.ts';

const directories: string[] = []; const handles: LocalLedger[] = [];
const authority: ResultSinkAuthority = { authorize: async () => {} }; // Host policy is simulated; no producer identity is granted.
function directory() { const path = mkdtempSync(join(tmpdir(), 'tracegrove-results-')); directories.push(path); return path; }
function store(path = directory(), policy = authority) {
  const ledger = LocalLedger.open(path); handles.push(ledger);
  return { path, ledger, sink: new LocalResultSink(ledger, localScope(), policy) };
}
async function evidence(mock = false) {
  const sample = sampleCopy(); return runSample(planSample(sample.configPath, mock ? 'offline-contract' : 'native-real'), sample.stateDir);
}
afterEach(() => { for (const handle of handles.splice(0)) handle.close(); cleanupTemps(); for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

it('retains exact bytes independently of the producer, deduplicates concurrent delivery, and survives reopen', async () => {
  const run = await evidence(); const { path, ledger, sink } = store();
  const bytes = Buffer.from([0, 255, 13, 10, 128, 42]); writeFileSync(join(run.executionDir, 'binary-proof.bin'), bytes);
  const manifestPath = join(run.executionDir, 'manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.files.push({ path: 'binary-proof.bin', sha256: digestOfBytes(bytes).hex, bytes: bytes.length }); writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(join(run.executionDir, 'unsealed.secret'), 'must not be copied');
  const results = await Promise.all([sink.ingest(run.executionDir), sink.ingest(run.executionDir)]);
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
  const accepted = results[0]!;
  expect(accepted.receipt).toMatchObject({ retainedOutcome: 'passed', issuerStatus: 'unverified', qualificationStatus: 'not_evaluated', plannedLanes: ['full_live_sandbox'] });
  expect(existsSync(join(accepted.bundleDir, 'unsealed.secret'))).toBe(false);
  expect(readFileSync(join(accepted.bundleDir, 'binary-proof.bin'))).toEqual(bytes);
  expect((await sink.list()).records).toHaveLength(1);
  writeFileSync(join(run.executionDir, 'campaign.json'), '{}');
  expect((await sink.get(accepted.receipt.ref.id)).verification.ok).toBe(true);
  ledger.close(); const reopened = store(path).sink;
  expect((await reopened.get(accepted.receipt.ref.id)).receipt).toEqual(accepted.receipt);
});

it('copies the captured snapshot even when source bytes change after verification', async () => {
  const run = await evidence(true); let calls = 0;
  const { sink } = store(directory(), { authorize: async (_scope, action) => {
    if (action === 'ingest' && ++calls === 2) writeFileSync(join(run.executionDir, 'campaign.json'), '{}');
  } });
  const accepted = await sink.ingest(run.executionDir);
  expect(verifyBundle(run.executionDir).ok).toBe(false);
  expect(verifyBundle(accepted.bundleDir)).toMatchObject({ ok: true, outcome: 'passed' });
  expect(accepted.receipt.plannedLanes).toEqual(['mock_contract']);
  expect(accepted.receipt.qualificationStatus).toBe('not_evaluated');
});

it('refuses foreign scope, corrupt input, and revoked admission without publishing a result', async () => {
  const run = await evidence(true); const { ledger, sink } = store();
  const foreign = new LocalResultSink(ledger, { ...localScope(), ownerId: 'another-owner' }, authority);
  await expect(foreign.ingest(run.executionDir)).rejects.toThrow('another result scope');
  expect((await foreign.list()).records).toEqual([]);
  let attempts = 0; const denied = store(directory(), { authorize: async (_scope, action) => {
    if (action === 'ingest' && ++attempts === 2) throw new Error('owner revoked admission');
  } });
  await expect(denied.sink.ingest(run.executionDir)).rejects.toThrow('revoked');
  expect(readdirSync(denied.path)).toEqual(['ledger']);
  writeFileSync(join(run.executionDir, 'campaign.json'), '{}');
  await expect(sink.ingest(run.executionDir)).rejects.toThrow();
  expect((await sink.list()).records).toEqual([]);
});

it('retains actual failed counterevidence with its failed verdict', async () => {
  const sample = sampleCopy(root => editFile(join(root, 'app/app.mjs'), text => text.replace(
    "if (note.ownerId !== userId) return send(res, 403, { error: 'forbidden' });",
    "if (note.ownerId !== userId && req.method !== 'GET') return send(res, 403, { error: 'forbidden' });")));
  const digest = sampleIdentityDigest(sample.root).hex;
  editFile(join(sample.root, 'verification/components/notes-api.profile.yaml'), text => text.replace(/hex: "?[0-9a-f]{64}"?/, `hex: "${digest}"`));
  const run = await runSample(planSample(sample.configPath), sample.stateDir);
  expect(run.outcome).toBe('assertion_failed');
  const { sink } = store(); const result = await sink.ingest(run.executionDir);
  expect(result.receipt.retainedOutcome).toBe('assertion_failed');
  expect((await sink.get(result.receipt.ref.id)).verification).toMatchObject({ ok: true, outcome: 'assertion_failed' });
});

it('refuses evidence replacement under an existing campaign and refuses a tampered archive on read', async () => {
  const run = await evidence(true); const { sink } = store(); const accepted = await sink.ingest(run.executionDir);
  const path = join(run.executionDir, 'manifest.json'); const manifest = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify({ ...manifest, createdAt: new Date().toISOString() }));
  expect(verifyBundle(run.executionDir).ok).toBe(true);
  await expect(sink.ingest(run.executionDir)).rejects.toThrow('different evidence');
  const campaignPath = join(run.executionDir, 'campaign.json'); const campaign = JSON.parse(readFileSync(campaignPath, 'utf8'));
  writeFileSync(campaignPath, JSON.stringify(freeze({ ...campaign, ref: { ...campaign.ref, id: `${campaign.ref.id}-renamed` } })));
  resealBundle(run.executionDir); expect(verifyBundle(run.executionDir).ok).toBe(true);
  await expect(sink.ingest(run.executionDir)).rejects.toThrow('different evidence');
  writeFileSync(join(accepted.bundleDir, 'campaign.json'), '{}');
  await expect(sink.get(accepted.receipt.ref.id)).rejects.toThrow();
  expect(await sink.list()).toMatchObject({ snapshotVersion: 1, archiveStatus: 'not_checked' });
});

it('pages a fixed scoped index snapshot while later deliveries arrive', async () => {
  const { sink, ledger } = store();
  for (let i = 0; i < 3; i++) await sink.ingest((await evidence(true)).executionDir);
  const first = await sink.list({ limit: 1 }); expect(first.nextCursor).not.toBeNull();
  const later = await sink.ingest((await evidence(true)).executionDir);
  const next = await sink.list({ limit: 2, cursor: first.nextCursor! });
  expect(next.records).toHaveLength(2); expect(next.nextCursor).toBeNull(); expect(next.snapshotVersion).toBe(3);
  expect([...first.records, ...next.records].some(r => r.ref.id === later.receipt.ref.id)).toBe(false);
  expect((await sink.list()).records[0]!.ref).toEqual(later.receipt.ref);
  const foreign = new LocalResultSink(ledger, { ...localScope(), ownerId: 'another-owner' }, authority);
  await expect(foreign.list({ cursor: first.nextCursor! })).rejects.toThrow('foreign result cursor');
});

it('does not replace a pre-existing symlink at the content-addressed destination', async () => {
  const run = await evidence(true); const snapshot = VerifiedBundleSnapshot.open(run.executionDir);
  const root = join(directory(), 'archive'); mkdirSync(root); const archive = new LocalBundleArchive(root);
  const target = archive.path(snapshot.records.manifestDigest); symlinkSync(join(root, 'absent'), target);
  expect(() => archive.put(snapshot)).toThrow(); expect(lstatSync(target).isSymbolicLink()).toBe(true);
});

it('recovers after a real process crash between durable archive creation and index publication', async () => {
  const run = await evidence(true); const path = directory();
  const child = spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'fixtures/resultSinkCrash.ts'), run.executionDir, path], { encoding: 'utf8', timeout: 15000 });
  expect(child.signal, child.stderr).toBe('SIGKILL');
  const { sink } = store(path); expect((await sink.list()).records).toEqual([]);
  const objects = readdirSync(path).filter(name => name.startsWith('result-objects-'));
  expect(objects).toHaveLength(1); expect(readdirSync(join(path, objects[0]!))).toHaveLength(1);
  const recovered = await sink.ingest(run.executionDir);
  expect(recovered.replayed).toBe(false); expect(recovered.verification.ok).toBe(true);
  expect((await sink.list()).records).toHaveLength(1);
});
