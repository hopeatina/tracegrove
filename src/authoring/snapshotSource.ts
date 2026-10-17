import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { GitSnapshotBinding, Scope } from '../protocol/index.ts';
import { sameScope } from '../protocol/canonical.ts';
import { readGitSnapshotManifest, readGitSnapshotTree } from '../source/snapshotTree.ts';
import { Blocked } from '../core/errors.ts';

/** Scoped source descriptor. Execution rechecks bytes under its own supervisor. */
export class SnapshotSource {
  readonly snapshot: GitSnapshotBinding['snapshot'];
  readonly root: string;
  constructor(manifestPath: string, scope: Scope) {
    this.snapshot = readGitSnapshotManifest(manifestPath);
    if (!sameScope(this.snapshot.scope, scope)) throw new Blocked([{ code: 'snapshot_scope_mismatch', detail: 'snapshot belongs to another local owner' }]);
    this.root = join(dirname(manifestPath), 'source');
  }
  bind(cwd: string, compiledDir: string): GitSnapshotBinding {
    const within = relative(this.root, cwd);
    if (within.startsWith('..') || isAbsolute(within)) throw new Blocked([{ code: 'snapshot_app_outside_root', detail: 'app.root must be inside the materialized source tree' }]);
    readGitSnapshotTree(this.snapshot, this.root);
    return { snapshot: this.snapshot, root: relative(compiledDir, this.root).split(sep).join('/') || '.', cwd: within.split(sep).join('/') || '.' };
  }
}
