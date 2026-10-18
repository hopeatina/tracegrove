import { afterEach, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const fault = vi.hoisted(() => ({ sync: false, directoryInode: null as number | null }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, fsyncSync: (fd: number) => { if (fault.sync || (fault.directoryInode !== null && actual.fstatSync(fd).ino === fault.directoryInode)) throw new Error('injected sync failure'); actual.fsyncSync(fd); } };
});
import { LocalLedger } from '../src/core/ledger.ts';
import { LocalResultSink } from '../src/core/resultSink.ts';
import { localScope } from '../src/core/corpus.ts';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { digestOfValue } from '../src/protocol/index.ts';

const dirs: string[] = []; const handles: LocalLedger[] = [];
function open(dir = mkdtempSync(join(tmpdir(), 'tracegrove-ledger-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const ledger = LocalLedger.open(dir); handles.push(ledger); return { dir, ledger };
}
afterEach(() => { fault.sync = false; fault.directoryInode = null; for (const handle of handles.splice(0)) handle.close(); cleanupTemps(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('does not publish a result when archive durability fails before the ledger append', async () => {
  const sample = sampleCopy(); const run = await runSample(planSample(sample.configPath, 'offline-contract'), sample.stateDir);
  const { ledger } = open(); const sink = new LocalResultSink(ledger, localScope(), { authorize: async () => {} });
  fault.sync = true; await expect(sink.ingest(run.executionDir)).rejects.toThrow('injected sync failure'); fault.sync = false;
  expect((await sink.list()).records).toEqual([]);
});

it('does not publish an orphan on retry while its archive namespace still cannot sync', async () => {
  const sample = sampleCopy(); const run = await runSample(planSample(sample.configPath, 'offline-contract'), sample.stateDir);
  const { dir, ledger } = open(); const sink = new LocalResultSink(ledger, localScope(), { authorize: async () => {} });
  const objects = join(dir, `result-objects-${digestOfValue(localScope()).hex}`); mkdirSync(objects);
  fault.directoryInode = statSync(objects).ino;
  await expect(sink.ingest(run.executionDir)).rejects.toThrow('injected sync failure');
  await expect(sink.ingest(run.executionDir)).rejects.toThrow('injected sync failure');
  expect((await sink.list()).records).toEqual([]);
  fault.directoryInode = null;
  const accepted = await sink.ingest(run.executionDir);
  expect(accepted.replayed).toBe(false); expect((await sink.list()).records).toHaveLength(1);
});

it('does not consume a sequence when serialization fails before writing', () => {
  const { dir, ledger } = open(); const circular: Record<string, unknown> = {}; circular.self = circular;
  expect(() => ledger.append('review', 0, 'draft', circular)).toThrow();
  expect(ledger.append('review', 0, 'draft', { value: 'saved' }).seq).toBe(1);
  ledger.close(); expect(open(dir).ledger.current('review')?.data).toEqual({ value: 'saved' });
});
it('isolates persisted state from caller mutation, returned entries, current and history reads', () => {
  const { dir, ledger } = open(); const data = { nested: { value: 'original' } };
  const written = ledger.append('review', 0, 'draft', data);
  data.nested.value = 'changed'; (written.data.nested as { value: string }).value = 'changed';
  const current = ledger.current('review')!; (current.data.nested as { value: string }).value = 'changed';
  ledger.history('review')[0]!.type = 'invented';
  expect(ledger.current('review')).toMatchObject({ type: 'draft', data: { nested: { value: 'original' } } });
  ledger.close(); expect(open(dir).ledger.current('review')).toMatchObject({ type: 'draft', data: { nested: { value: 'original' } } });
});
it('stops all further writes after an uncertain sync acknowledgement until the journal is reopened', () => {
  const { dir, ledger } = open(); fault.sync = true;
  expect(() => ledger.append('review', 0, 'draft', { value: 'written but unacknowledged' })).toThrow();
  fault.sync = false;
  expect(() => ledger.append('another-review', 0, 'draft', {})).toThrow('uncertain write');
  expect(() => ledger.current('review')).toThrow('uncertain write');
  expect(() => ledger.history('review')).toThrow('uncertain write');
  expect(() => ledger.version('review')).toThrow('uncertain write');
  ledger.close();
  const reopened = open(dir).ledger;
  expect(reopened.current('review')?.version).toBe(1);
  expect(reopened.append('another-review', 0, 'draft', {}).seq).toBe(2);
});
it('refuses writes after ownership is replaced and preserves the other writer lock', () => {
  const { dir, ledger } = open(); const path = join(dir, 'ledger/lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8')); writeFileSync(path, JSON.stringify({ ...lock, writerId: 'other-owner' }));
  expect(() => ledger.append('review', 0, 'draft', {})).toThrow('ownership lost');
  expect(() => ledger.current('review')).toThrow('ownership lost');
  ledger.close(); expect(JSON.parse(readFileSync(path, 'utf8')).writerId).toBe('other-owner');
});
it('does not present a closed writer cache as current state', () => {
  const { ledger } = open(); ledger.append('review', 0, 'draft', {}); ledger.close();
  expect(() => ledger.current('review')).toThrow('closed'); expect(() => ledger.history('review')).toThrow('closed');
});
it('preserves an unterminated journal for reconciliation rather than concatenating another record onto it', () => {
  const { dir, ledger } = open(); ledger.append('review', 0, 'draft', { value: 'saved' }); ledger.close();
  const path = join(dir, 'ledger/journal.jsonl'); const bytes = readFileSync(path, 'utf8').trimEnd();
  writeFileSync(path, bytes);
  expect(() => LocalLedger.open(dir)).toThrow('unterminated');
  expect(readFileSync(path, 'utf8')).toBe(bytes);
});
