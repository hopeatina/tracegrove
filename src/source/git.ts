import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { devNull } from 'node:os';
import { resolve } from 'node:path';
import { Conflict } from '../core/errors.ts';
import { GitObjectId, GitRevision, RepositoryPath } from '../protocol/primitives.ts';

export type GitChange = { path: string; oldMode: string; newMode: string; oldId: string; newId: string; status: 'A' | 'D' | 'M' | 'T' };

/** Read-only Git object commands. Never inherit Git routing/config variables or perform lazy fetches. */
export class GitRepository {
  readonly root: string;
  private readonly verified = new Set<string>();
  constructor(root: string) {
    this.root = realpathSync(resolve(root));
    const bare = this.run(['rev-parse', '--is-bare-repository'], 1024).toString().trim() === 'true';
    const actual = this.run(['rev-parse', bare ? '--absolute-git-dir' : '--show-toplevel'], 8192).toString().trim();
    if (realpathSync(actual) !== this.root) throw new Conflict('repository binding must name its exact worktree or bare root');
  }
  run(args: string[], maxBuffer: number): Buffer {
    try {
      return execFileSync('git', ['-C', this.root, '--no-replace-objects', '--literal-pathspecs', ...args], {
        encoding: 'buffer', maxBuffer, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull,
          GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
      });
    } catch {
      // Git stderr can contain private source or paths; retain a bounded operation label only.
      throw new Conflict(`Git ${args[0]} failed: required objects may be unavailable, unsupported or exceed the read/time bound`);
    }
  }
  commit(revision: string): string {
    GitRevision.parse(revision);
    const id = GitObjectId.parse(this.run(['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], 1024).toString().trim());
    this.verifyRevision(id); return id;
  }
  private object(type: 'commit' | 'tree' | 'blob', id: string, bound: number): Buffer {
    GitObjectId.parse(id);
    const bytes = this.run(['cat-file', type, id], bound);
    const actual = createHash(id.length === 40 ? 'sha1' : 'sha256').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== id) throw new Conflict(`Git ${type} bytes disagree with the immutable object identity`);
    return bytes;
  }
  private verifyRevision(id: string): void {
    GitObjectId.parse(id); if (this.verified.has(id)) return;
    const commit = this.object('commit', id, 1_048_576);
    const root = /^tree ([a-f0-9]{40}|[a-f0-9]{64})\n/.exec(commit.toString('utf8'))?.[1];
    if (!root) throw new Conflict('Git commit has no valid root tree');
    const listing = this.run(['ls-tree', '-r', '-t', '--format=%(objecttype) %(objectname)', id], 4 * 1024 * 1024).toString('utf8').trim();
    const trees = new Set([root]);
    for (const entry of listing ? listing.split('\n') : []) {
      const match = /^(tree|blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})$/.exec(entry);
      if (!match) throw new Conflict('unsupported Git tree identity listing');
      if (match[1] === 'tree') trees.add(match[2]!);
    }
    if (trees.size > 8192) throw new Conflict('selected Git tree closure exceeds supported coverage');
    for (const tree of trees) this.object('tree', tree, 4 * 1024 * 1024);
    this.verified.add(id);
  }
  mergeBase(base: string, head: string): { commit: string | null; reason: string | null } {
    // Require an unambiguous observed merge base; missing history never becomes an invented empty base.
    let bytes: Buffer;
    try { bytes = this.run(['merge-base', '--all', base, head], 8192); }
    catch {
      // A missing base cannot be silently accepted: policy-specific alternatives remain a host obligation.
      throw new Conflict('merge base unavailable; resolve complete history or use a registered alternative revision policy');
    }
    const commits = bytes.toString().trim().split('\n').filter(Boolean).map(value => GitObjectId.parse(value));
    if (commits.length !== 1) throw new Conflict('ambiguous merge base requires a registered revision policy');
    return { commit: commits[0]!, reason: null };
  }
  diff(base: string, head: string, raw = false): Buffer {
    this.verifyRevision(base); this.verifyRevision(head);
    return this.run(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', '--ignore-submodules=none',
      ...(raw ? ['--raw', '--no-abbrev', '-z'] : ['--patch', '--binary', '--full-index', '--src-prefix=a/', '--dst-prefix=b/']),
      base, head, '--'], 4 * 1024 * 1024);
  }
  changes(base: string, head: string): GitChange[] {
    const fields = new TextDecoder('utf-8', { fatal: true }).decode(this.diff(base, head, true)).split('\0');
    if (fields.pop() !== '') throw new Conflict('unterminated Git change list');
    if (fields.length % 2 || fields.length > 1000) throw new Conflict('Git change list exceeds supported complete coverage');
    const changes: GitChange[] = [];
    for (let index = 0; index < fields.length; index += 2) {
      const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([a-f0-9]{40}|[a-f0-9]{64}) ([ADMT])$/.exec(fields[index]!);
      if (!match) throw new Conflict('unsupported Git change record');
      const [, oldMode, newMode, oldId, newId, status] = match;
      if (![oldMode, newMode].every(mode => ['000000', '100644', '100755'].includes(mode!))) {
        throw new Conflict('changed symlink, submodule or unsupported file mode needs an explicit source adapter');
      }
      changes.push({ path: RepositoryPath.parse(fields[index + 1]), oldMode: oldMode!, newMode: newMode!, oldId: oldId!, newId: newId!, status: status as GitChange['status'] });
    }
    return changes;
  }
  blob(id: string): Buffer {
    return this.object('blob', id, 1_048_576);
  }
  file(commit: string, path: string): Buffer {
    this.verifyRevision(commit); RepositoryPath.parse(path);
    const tree = this.run(['ls-tree', '-z', commit, '--', path], 16_384);
    const record = new TextDecoder('utf-8', { fatal: true }).decode(tree);
    const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/.exec(record);
    if (!match || match[3] !== path) throw new Conflict('selected source is missing or is not a regular Git blob');
    return this.blob(match[2]!);
  }
}
