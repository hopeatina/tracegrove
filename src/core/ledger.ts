/**
 * Local single-writer ProjectionLedger: a serialized append-only JSONL journal with
 * expected-version CAS, guarded by a lock file naming the live controller process.
 * It does not claim distributed fencing. A stale lock (dead pid) may be broken after
 * recording a recovery event; a live lock refuses a second writer with a specific reason.
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { Conflict } from './errors.ts';
import { nowIso } from './clock.ts';

export type JournalEntry = { seq: number; at: string; aggregateId: string; version: number; type: string; data: Record<string, unknown> };
type LockFile = { pid: number; startedAt: string; host: string; endpoint: string | null; tokenDigest: string | null };

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export class LocalLedger {
  private readonly entries: JournalEntry[] = [];
  private readonly versions = new Map<string, number>();
  private readonly latest = new Map<string, JournalEntry>();
  private seq = 0;
  private closed = false;
  readonly recovered: Array<{ aggregateId: string; lastType: string }> = [];

  private constructor(readonly dir: string, private readonly lockPath: string, private readonly journalPath: string) {}

  static open(stateDir: string): LocalLedger {
    const dir = join(stateDir, 'ledger');
    mkdirSync(dir, { recursive: true });
    const lockPath = join(dir, 'lock.json');
    const journalPath = join(dir, 'journal.jsonl');
    const ledger = new LocalLedger(dir, lockPath, journalPath);
    ledger.load();
    if (existsSync(lockPath)) {
      let lock: LockFile | null = null;
      try { lock = JSON.parse(readFileSync(lockPath, 'utf8')) as LockFile; } catch { lock = null; }
      if (lock && lock.pid !== process.pid && pidAlive(lock.pid)) {
        throw new Conflict(`ledger at ${dir} is held by live process ${lock.pid} (started ${lock.startedAt}); ` +
          `delegation endpoint ${lock.endpoint ?? 'not published'}; stop that process or use its controller`);
      }
      if (lock) {
        ledger.recoverInterrupted(lock);
      }
    }
    const lock: LockFile = { pid: process.pid, startedAt: nowIso(), host: hostname(), endpoint: null, tokenDigest: null };
    writeFileSync(lockPath, JSON.stringify(lock));
    return ledger;
  }

  private load(): void {
    if (!existsSync(this.journalPath)) return;
    const lines = readFileSync(this.journalPath, 'utf8').split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const entry = JSON.parse(line) as JournalEntry;
      this.entries.push(entry);
      this.seq = Math.max(this.seq, entry.seq);
      this.versions.set(entry.aggregateId, entry.version);
      this.latest.set(entry.aggregateId, entry);
    }
  }

  private recoverInterrupted(staleLock: LockFile): void {
    for (const [aggregateId, entry] of this.latest) {
      if (!aggregateId.startsWith('execution:')) continue;
      if (['finalized', 'interrupted'].includes(entry.type)) continue;
      this.recovered.push({ aggregateId, lastType: entry.type });
      this.append(aggregateId, entry.version, 'interrupted', { reason: 'stale_lock_recovered', stalePid: staleLock.pid, previousState: entry.type });
    }
    this.append('ledger', this.version('ledger'), 'lock.recovered', { stalePid: staleLock.pid, startedAt: staleLock.startedAt, interrupted: this.recovered.length });
  }

  version(aggregateId: string): number {
    return this.versions.get(aggregateId) ?? 0;
  }

  current(aggregateId: string): JournalEntry | null {
    return this.latest.get(aggregateId) ?? null;
  }

  history(aggregateId: string): JournalEntry[] {
    return this.entries.filter((entry) => entry.aggregateId === aggregateId);
  }

  /** Atomic transition: fails with Conflict unless the aggregate is at `expectedVersion`. */
  append(aggregateId: string, expectedVersion: number, type: string, data: Record<string, unknown>): JournalEntry {
    if (this.closed) throw new Conflict('ledger closed');
    const current = this.version(aggregateId);
    if (current !== expectedVersion) {
      throw new Conflict(`${aggregateId}: expected version ${expectedVersion}, current ${current}`);
    }
    const entry: JournalEntry = { seq: ++this.seq, at: nowIso(), aggregateId, version: current + 1, type, data };
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(this.journalPath, line);
    const fd = openSync(this.journalPath, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    this.entries.push(entry);
    this.versions.set(aggregateId, entry.version);
    this.latest.set(aggregateId, entry);
    return entry;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      const lock = JSON.parse(readFileSync(this.lockPath, 'utf8')) as LockFile;
      if (lock.pid === process.pid) rmSync(this.lockPath, { force: true });
    } catch { /* lock already gone */ }
  }
}
