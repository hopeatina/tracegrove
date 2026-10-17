import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/** Example application storage, separate from Tracegrove's authority and ledger. */
export class JobStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_key TEXT NOT NULL,
        title TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
        worker_pid INTEGER, UNIQUE(owner_id,request_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS reports (
        job_id TEXT PRIMARY KEY, content TEXT NOT NULL, worker_pid INTEGER NOT NULL
      ) STRICT;`);
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = action(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(id) { return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) ?? null; }
  list(owner) { return this.db.prepare('SELECT * FROM jobs WHERE owner_id=? ORDER BY id').all(owner); }
  submit(owner, input) {
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM jobs WHERE owner_id=? AND request_key=?').get(owner, input.requestKey);
      if (existing) return existing.title === input.title && existing.mode === input.mode
        ? { job: existing, duplicate: true } : { conflict: true };
      const id = randomUUID();
      this.db.prepare('INSERT INTO jobs(id,owner_id,request_key,title,mode,status) VALUES(?,?,?,?,?,?)')
        .run(id, owner, input.requestKey, input.title, input.mode, 'queued');
      return { job: this.get(id), duplicate: false };
    });
  }
  claim() {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM jobs WHERE status IN ('queued','cancel_requested') ORDER BY rowid LIMIT 1").get();
      if (!row) return null;
      if (row.status === 'cancel_requested') {
        this.db.prepare("UPDATE jobs SET status='cancelled', worker_pid=? WHERE id=?").run(process.pid, row.id);
        return null;
      }
      this.db.prepare("UPDATE jobs SET status='running', worker_pid=? WHERE id=?").run(process.pid, row.id);
      return this.get(row.id);
    });
  }
  requestCancel(id) {
    return this.db.prepare("UPDATE jobs SET status='cancel_requested' WHERE id=? AND status IN ('queued','running','cancel_requested')").run(id).changes > 0;
  }
  finish(id, dropReport = false) {
    return this.transaction(() => {
      const job = this.get(id);
      if (!job || !['running', 'cancel_requested'].includes(job.status)) return;
      const status = job.status === 'cancel_requested' ? 'cancelled' : job.mode === 'fail' ? 'failed' : 'succeeded';
      if (status === 'succeeded' && !dropReport) this.db.prepare('INSERT INTO reports(job_id,content,worker_pid) VALUES(?,?,?)')
        .run(id, `Report: ${job.title}`, process.pid);
      this.db.prepare('UPDATE jobs SET status=?, worker_pid=? WHERE id=?').run(status, process.pid, id);
    });
  }
  report(id) { return this.db.prepare('SELECT * FROM reports WHERE job_id=?').get(id) ?? null; }
  remove(id) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM reports WHERE job_id=?').run(id);
      this.db.prepare('DELETE FROM jobs WHERE id=?').run(id);
    });
  }
  close() { this.db.close(); }
}
