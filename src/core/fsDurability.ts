import { closeSync, fsyncSync, openSync } from 'node:fs';

/** Persist a completed file or directory entry before publishing its durable index. */
export function syncPath(path: string): void {
  const descriptor = openSync(path, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}
