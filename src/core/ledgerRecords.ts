/** One journal parser shared by the exclusive writer and read-only inspection. */
import { z } from 'zod';
import { Conflict } from './errors.ts';

export type JournalEntry = { seq: number; at: string; aggregateId: string; version: number; type: string; data: Record<string, unknown> };
export type LedgerReadView = { current(aggregateId: string): JournalEntry | null; history(aggregateId: string): JournalEntry[] };
export const JournalRecord = z.object({ seq: z.number().int().positive().safe(), at: z.string().datetime({ offset: true }),
  aggregateId: z.string().min(1).max(512), version: z.number().int().positive().safe(), type: z.string().min(1).max(256),
  data: z.record(z.string(), z.unknown()) }).strict();

export function parseJournal(text: string, maxRecords = Number.MAX_SAFE_INTEGER): JournalEntry[] {
  if (text && !text.endsWith('\n')) throw new Conflict('unterminated ledger record; reconcile the journal before writing');
  const entries: JournalEntry[] = []; const versions = new Map<string, number>();
  let start = 0;
  while (start < text.length) {
    const end = text.indexOf('\n', start); const line = text.slice(start, end); start = end + 1;
    if (!line.trim().length) continue;
    if (entries.length >= maxRecords) throw new Conflict('ledger record limit exceeded');
    const entry = JournalRecord.parse(JSON.parse(line));
    if (entry.seq !== entries.length + 1 || entry.version !== (versions.get(entry.aggregateId) ?? 0) + 1)
      throw new Conflict(`corrupt journal at sequence ${entry.seq}: non-contiguous sequence or aggregate version`);
    entries.push(entry); versions.set(entry.aggregateId, entry.version);
  }
  return entries;
}
