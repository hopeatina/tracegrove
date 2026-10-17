/** Read an existing local checkpoint without opening the writer, creating locks or recovering it. */
import { lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { digestOfBytes } from '../protocol/index.ts';
import { requireRealDirectory } from './atomicFiles.ts';
import { readBoundedFile } from './boundedFile.ts';
import { parseJournal, type LedgerReadView } from './ledgerRecords.ts';

export const LEDGER_INSPECTION_LIMITS = { journalBytes: 16 * 1024 * 1024, lockBytes: 8192, records: 100000 } as const;
export class LedgerInspectionError extends Error {
  constructor(readonly code: 'ledger_snapshot_unavailable' | 'ledger_snapshot_changed' | 'ledger_snapshot_invalid') { super(code); }
}
export function inspectLedger(stateDir: string): LedgerReadView & {
  head: { sequence: number; digest: string }; writerLock: 'present' | 'absent'; assertUnchanged(): void;
} {
  const dir = join(resolve(stateDir), 'ledger'); const journal = join(dir, 'journal.jsonl');
  const lock = join(dir, 'lock.json');
  const fingerprint = () => { requireRealDirectory(dir); const stat = lstatSync(dir); return `${stat.dev}:${stat.ino}`; };
  const lockDigest = () => {
    try { return digestOfBytes(readBoundedFile(lock, LEDGER_INSPECTION_LIMITS.lockBytes)).hex; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  };
  let directory: string; let lockBefore: string | null; let bytes: Buffer;
  try { directory = fingerprint(); lockBefore = lockDigest(); bytes = readBoundedFile(journal, LEDGER_INSPECTION_LIMITS.journalBytes); }
  catch { throw new LedgerInspectionError('ledger_snapshot_unavailable'); }
  const digest = digestOfBytes(bytes).hex;
  const assertUnchanged = () => {
    try {
      if (fingerprint() !== directory || lockDigest() !== lockBefore || digestOfBytes(readBoundedFile(journal, LEDGER_INSPECTION_LIMITS.journalBytes)).hex !== digest)
        throw new Error('changed');
    } catch { throw new LedgerInspectionError('ledger_snapshot_changed'); }
  };
  assertUnchanged();
  let entries: ReturnType<typeof parseJournal>;
  try { entries = parseJournal(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), LEDGER_INSPECTION_LIMITS.records); }
  catch { throw new LedgerInspectionError('ledger_snapshot_invalid'); }
  return {
    head: { sequence: entries.at(-1)?.seq ?? 0, digest }, writerLock: lockBefore === null ? 'absent' : 'present',
    current(id) { return structuredClone(entries.filter(entry => entry.aggregateId === id).at(-1) ?? null); },
    history(id) { return structuredClone(entries.filter(entry => entry.aggregateId === id)); }, assertUnchanged,
  };
}
