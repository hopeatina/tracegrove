/** Local owned-filesystem durability primitives; not distributed fencing or hostile-parent confinement. */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';

export function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function writeExclusiveDurable(path: string, bytes: Uint8Array): void {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

/** Persist an existing bounded-reader-checked payload without following a final symlink. */
export function syncRegularFile(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!fstatSync(fd).isFile()) throw new Error('artifact payload must be a regular file'); fsyncSync(fd); }
  finally { closeSync(fd); }
}

/** Caller owns this quiescent tree; reject preexisting symlink ancestors instead of following them. */
export function requireRealDirectory(path: string): void {
  let current = resolve(path);
  while (true) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('artifact parent must be a real owned directory');
    if (current === parse(current).root) return;
    current = dirname(current);
  }
}

/** Anchor new directory entries as well as their contents; callers retain exclusive tree ownership. */
export function syncDirectoryAncestors(path: string): void {
  let current = resolve(path);
  while (true) {
    syncDirectory(current);
    if (current === parse(current).root) return;
    current = dirname(current);
  }
}

export function createDurableDirectory(path: string): void {
  let ancestor = resolve(path);
  while (true) {
    try { lstatSync(ancestor); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = dirname(ancestor); }
  }
  // Check existing ancestors before recursive mkdir can follow a preexisting link.
  requireRealDirectory(ancestor);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  requireRealDirectory(path);
  syncDirectoryAncestors(path);
}
