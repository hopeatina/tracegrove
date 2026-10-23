/** Expand source globs into the explicit file list the local launcher attests. */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Blocked } from '../core/errors.ts';

const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.tracegrove', '.workflow-verify', 'dist', 'build', '.pytest_cache', '.mypy_cache', '.next', 'coverage']);
const DEFAULT_EXTENSIONS = ['py', 'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx'];
export const MAX_SOURCE_FILES = 256;

export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) { out += '\\{'; continue; }
      out += `(?:${glob.slice(i + 1, end).split(',').map((part) => part.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function walk(root: string, rel: string, into: string[], skip: Set<string>): void {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { if (!skip.has(entry.name) && !skip.has(path)) walk(root, path, into, skip); }
    else if (entry.isFile()) into.push(path);
  }
}

/** The source files among `files` (paths relative to the launch folder, as a git tree lists them): the ones the launcher's walk
 *  would reach, past the same skipped folders, that the globs match. */
export function sourcesAmong(files: string[], globs: string[], extraSkip: string[] = []): string[] {
  const skip = new Set([...SKIP_DIRS, ...extraSkip]); const patterns = globs.map(globToRegExp);
  return files.filter((file) => {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) if (skip.has(parts[i - 1]!) || skip.has(parts.slice(0, i).join('/'))) return false;
    return patterns.some((pattern) => pattern.test(file));
  }).sort();
}

/** Default globs: source files under the app root, minus dependency, cache and test-tool folders. */
export function defaultSourceGlobs(): string[] {
  return [`**/*.{${DEFAULT_EXTENSIONS.join(',')}}`];
}

export function expandSources(root: string, globs: string[], extraSkip: string[] = []): string[] {
  const files: string[] = [];
  walk(root, '', files, new Set([...SKIP_DIRS, ...extraSkip]));
  const patterns = globs.map(globToRegExp);
  const matched = files.filter((file) => patterns.some((pattern) => pattern.test(file))).sort();
  if (matched.length === 0) throw new Blocked([{ code: 'no_source_files', detail: `app.sources ${JSON.stringify(globs)} matched no files under ${root}`, owner: 'test author', action: 'set app.sources to the files that make up the app' }]);
  if (matched.length > MAX_SOURCE_FILES) throw new Blocked([{ code: 'too_many_source_files', detail: `app.sources matched ${matched.length} files; the attestation holds at most ${MAX_SOURCE_FILES}`, owner: 'test author', action: 'narrow app.sources, e.g. [app/**/*.py]' }]);
  return matched;
}
