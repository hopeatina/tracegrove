import { RepositoryPath } from '../protocol/primitives.ts';
import { Conflict } from '../core/errors.ts';

/** Shared Git/transport path rules; prevent aliases before any filesystem write. */
export function assertSnapshotPaths(paths: string[]): void {
  const seen = new Set<string>(); const spellings = new Map<string, string>();
  for (const raw of paths) {
    const path = RepositoryPath.parse(raw); const canonical = path.normalize('NFC').toLowerCase();
    const parts = path.split('/');
    if (seen.has(canonical) || parts.some(part => /^(?:\.git|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /[. ]$/.test(part) || /[<>"|?*]/.test(part))) {
      throw new Conflict('Git snapshot path is not portable or is duplicated');
    }
    seen.add(canonical);
    for (let length = 1; length <= parts.length; length++) {
      const prefix = parts.slice(0, length).join('/'); const key = prefix.normalize('NFC').toLowerCase();
      if (spellings.has(key) && spellings.get(key) !== prefix) throw new Conflict('Git snapshot contains aliased directory names');
      spellings.set(key, prefix);
    }
  }
}
