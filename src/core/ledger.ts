/**
 * Local single-writer ProjectionLedger: a serialized append-only JSONL journal with
 * expected-version CAS, guarded by a lock file naming the live controller process.
 * It does not claim distributed fencing. A stale lock (dead pid) may be broken after
 * recording a recovery event; a live lock refuses a second writer with a specific reason.
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { Conflict } from './errors.ts';
import { nowIso } from './clock.ts';

export type JournalEntry = { seq: number; at: string; aggregateId: string; version: number; type: string; data: Record<string, unknown> };
export type LockFile = { writerId: string; pid: number; startedAt: string; host: string; endpoint: string | null; tokenDigest: string | null };
const JournalRecord = z.object({ seq: z.number().int().positive().safe(), at: z.string().datetime({ offset: true }),
  aggregateId: z.string().min(1).max(512), version: z.number().int().positive().safe(), type: z.string().min(1).max(256),
  data: z.record(z.string(), z.unknown()) }).strict();

function syncPath(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export class LocalLedger {
  private readonly entries: JournalEntry[] = [];
  private readonly versions = new Map<string, number>();
  private readonly latest = new Map<string, JournalEntry>();
  private seq = 0;
  private closed = false;
  private writeFailed = false;
  private readonly writerId = randomUUID();
  readonly recovered: Array<{ aggregateId: string; lastType: string }> = [];

  private constructor(readonly dir: string, private readonly lockPath: string, private readonly journalPath: string) {}

  static open(stateDir: string): LocalLedger {
    const dir = join(stateDir, 'ledger');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const lockPath = join(dir, 'lock.json');
    const journalPath = join(dir, 'journal.jsonl');
    const ledger = new LocalLedger(dir, lockPath, journalPath);
    const guardPath = join(dir, 'acquire.lock');
    let guard: number;
    try { guard = openSync(guardPath, 'wx', 0o600); }
    catch { throw new Conflict(`ledger acquisition in progress at ${dir}; reconcile an abandoned acquire.lock before retrying`); }
    try {
      let staleLock: LockFile | null = null;
      if (existsSync(lockPath)) {
        const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as LockFile;
        if (lock.host !== hostname()) throw new Conflict(`ledger ${dir} belongs to another host; local fencing cannot recover it`);
        if (pidAlive(lock.pid)) {
          throw new Conflict(`ledger at ${dir} is held by live process ${lock.pid} (started ${lock.startedAt}); delegation endpoint ${lock.endpoint ?? 'not published'}`);
        }
        ledger.load();
        staleLock = lock;
        rmSync(lockPath);
      } else ledger.load();
      const lock: LockFile = { writerId: ledger.writerId, pid: process.pid, startedAt: nowIso(), host: hostname(), endpoint: null, tokenDigest: null };
      writeFileSync(lockPath, JSON.stringify(lock), { flag: 'wx', mode: 0o600 });
      if (staleLock) ledger.recoverInterrupted(staleLock);
    } catch (error) {
      ledger.close();
      throw error;
    } finally { closeSync(guard); rmSync(guardPath); }
    return ledger;
  }

  private load(): void {
    if (!existsSync(this.journalPath)) return;
    const text = readFileSync(this.journalPath, 'utf8');
    if (text && !text.endsWith('\n')) throw new Conflict('unterminated ledger record; reconcile the journal before writing');
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const entry = JournalRecord.parse(JSON.parse(line));
      if (entry.seq !== this.seq + 1 || entry.version !== this.version(entry.aggregateId) + 1) {
        throw new Conflict(`corrupt journal at sequence ${entry.seq}: non-contiguous sequence or aggregate version`);
      }
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
    return structuredClone(this.latest.get(aggregateId) ?? null);
  }

  history(aggregateId: string): JournalEntry[] {
    return structuredClone(this.entries.filter((entry) => entry.aggregateId === aggregateId));
  }

  /** Atomic transition: fails with Conflict unless the aggregate is at `expectedVersion`. */
  append(aggregateId: string, expectedVersion: number, type: string, data: Record<string, unknown>): JournalEntry {
    if (this.closed) throw new Conflict('ledger closed');
    if (this.writeFailed) throw new Conflict('ledger has an uncertain write; close and reconcile the persisted journal before continuing');
    const lock = JSON.parse(readFileSync(this.lockPath, 'utf8')) as LockFile;
    if (lock.writerId !== this.writerId) throw new Conflict('ledger ownership lost');
    const current = this.version(aggregateId);
    if (current !== expectedVersion) {
      throw new Conflict(`${aggregateId}: expected version ${expectedVersion}, current ${current}`);
    }
    // Serialization and validation happen before any state/IO change. Cache exactly the bytes written.
    const line = `${JSON.stringify({ seq: this.seq + 1, at: nowIso(), aggregateId, version: current + 1, type, data })}\n`;
    const entry = JournalRecord.parse(JSON.parse(line));
    try {
      appendFileSync(this.journalPath, line, { mode: 0o600 });
      syncPath(this.journalPath);
      syncPath(this.dir); // Persist the directory entry too when this append created the journal.
    } catch (error) {
      this.writeFailed = true;
      throw error;
    }
    this.seq = entry.seq;
    this.entries.push(entry);
    this.versions.set(aggregateId, entry.version);
    this.latest.set(aggregateId, entry);
    return structuredClone(entry);
  }

  publishController(endpoint: string, tokenDigest: string): void {
    const lock = JSON.parse(readFileSync(this.lockPath, 'utf8')) as LockFile;
    if (lock.writerId !== this.writerId || this.closed) throw new Conflict('ledger ownership lost');
    writeFileSync(this.lockPath, JSON.stringify({ ...lock, endpoint, tokenDigest }), { mode: 0o600 });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      const lock = JSON.parse(readFileSync(this.lockPath, 'utf8')) as LockFile;
      if (lock.writerId === this.writerId) rmSync(this.lockPath, { force: true });
    } catch { /* lock already gone */ }
  }
}
