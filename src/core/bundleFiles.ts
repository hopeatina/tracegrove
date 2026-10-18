import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VerifiedBundleSnapshot } from './bundle.ts';
import { Conflict } from './errors.ts';
import { syncPath } from './fsDurability.ts';

export function ensureBundleDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Conflict('Bundle archive path is not a real directory');
}
export function bundlePathPresent(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Internal writer for an already allocated, owned empty directory. Reads captured bytes only. */
export function writeCapturedBundleFiles(snapshot: VerifiedBundleSnapshot, ownedDirectory: string): void {
  ensureBundleDirectory(ownedDirectory);
  if (readdirSync(ownedDirectory).length) throw new Conflict('Captured bundle destination must be empty');
  const directories = new Set([ownedDirectory]);
  // A partially written export must never expose a complete manifest.
  const paths = snapshot.paths().filter(path => path !== 'manifest.json'); paths.push('manifest.json');
  for (const path of paths) {
    const parts = path.split('/'); let parent = ownedDirectory;
    for (const part of parts.slice(0, -1)) { parent = join(parent, part); ensureBundleDirectory(parent); directories.add(parent); }
    const file = join(ownedDirectory, ...parts);
    writeFileSync(file, snapshot.read(path), { flag: 'wx', mode: 0o600 }); syncPath(file);
  }
  for (const path of [...directories].sort((a, b) => b.length - a.length)) syncPath(path);
}
