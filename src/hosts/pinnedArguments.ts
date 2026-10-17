import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { GitSourceSnapshot } from '../protocol/schemas/gitSources.ts';
import { Conflict } from '../core/errors.ts';
import { djangoBootstrap } from './launchTemplates.ts';

/** Bind qualified launch templates to pinned files; opaque eval/shell wrappers cannot claim a snapshot. */
export function pinnedArguments(args: string[], cwd: string, root: string, snapshot: GitSourceSnapshot, family: 'node' | 'python'): string[] {
  const files = new Set(snapshot.files.map(file => file.path));
  const pinned = (path: string) => {
    const within = relative(root, resolve(cwd, path)).split(sep).join('/');
    if (within.startsWith('..') || isAbsolute(within) || !files.has(within)) throw new Conflict('snapshot launch entry is not a pinned regular file');
  };
  if (family === 'node' && args.length === 1) {
    pinned(args[0]!);
    return [`./${relative(cwd, resolve(cwd, args[0]!)).split(sep).join('/')}`];
  }
  if (family === 'python' && args.length === 7 && args[0] === '-m' && args[1] === 'uvicorn' &&
      args[3] === '--host' && args[4] === '127.0.0.1' && args[5] === '--port' && /^\d+$/.test(args[6]!)) {
    const match = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*):([A-Za-z_]\w*)$/.exec(args[2]!);
    if (!match) throw new Conflict('snapshot FastAPI entry needs a qualified module:attribute');
    const module = match[1]!.replaceAll('.', '/');
    try { pinned(`${module}.py`); } catch { pinned(`${module}/__init__.py`); }
    return args;
  }
  if (family === 'python' && args.length === 2 && args[0] === '-c') {
    const port = /127\.0\.0\.1:(\d+)/.exec(args[1]!)?.[1];
    if (port && args[1] === djangoBootstrap(port)) { pinned('manage.py'); return args; }
  }
  throw new Conflict('snapshot launch requires a qualified Node, FastAPI or Django template');
}
