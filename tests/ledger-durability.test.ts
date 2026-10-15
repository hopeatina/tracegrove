import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const fault = vi.hoisted(() => ({ sync: false }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, fsyncSync: (fd: number) => { if (fault.sync) throw new Error('injected sync failure'); actual.fsyncSync(fd); } };
});
import { LocalLedger } from '../src/core/ledger.ts';

const dirs: string[] = []; const handles: LocalLedger[] = [];
function open(dir = mkdtempSync(join(tmpdir(), 'tracegrove-ledger-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const ledger = LocalLedger.open(dir); handles.push(ledger); return { dir, ledger };
}
afterEach(() => { fault.sync = false; for (const handle of handles.splice(0)) handle.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

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
  ledger.close();
  const reopened = open(dir).ledger;
  expect(reopened.current('review')?.version).toBe(1);
  expect(reopened.append('another-review', 0, 'draft', {}).seq).toBe(2);
});
it('refuses writes after ownership is replaced and preserves the other writer lock', () => {
  const { dir, ledger } = open(); const path = join(dir, 'ledger/lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8')); writeFileSync(path, JSON.stringify({ ...lock, writerId: 'other-owner' }));
  expect(() => ledger.append('review', 0, 'draft', {})).toThrow('ownership lost');
  ledger.close(); expect(JSON.parse(readFileSync(path, 'utf8')).writerId).toBe('other-owner');
});
it('preserves an unterminated journal for reconciliation rather than concatenating another record onto it', () => {
  const { dir, ledger } = open(); ledger.append('review', 0, 'draft', { value: 'saved' }); ledger.close();
  const path = join(dir, 'ledger/journal.jsonl'); const bytes = readFileSync(path, 'utf8').trimEnd();
  writeFileSync(path, bytes);
  expect(() => LocalLedger.open(dir)).toThrow('unterminated');
  expect(readFileSync(path, 'utf8')).toBe(bytes);
});
