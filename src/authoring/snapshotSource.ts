import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { GitSnapshotBinding, type Scope } from '../protocol/index.ts';
import { sameScope } from '../protocol/canonical.ts';
import { readGitSnapshotManifest, readGitSnapshotTree } from '../source/snapshotTree.ts';
import { Blocked } from '../core/errors.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { snapshotSourceSelection } from '../core/snapshotRepository.ts';

/** Scoped source descriptor. Execution rechecks bytes under its own supervisor. */
export class SnapshotSource {
  readonly snapshot: GitSnapshotBinding['snapshot'];
  readonly root: string;
  private readonly resolutionPath: string;
  constructor(manifestPath: string, scope: Scope) {
    this.snapshot = readGitSnapshotManifest(manifestPath);
    if (!sameScope(this.snapshot.scope, scope)) throw new Blocked([{ code: 'snapshot_scope_mismatch', detail: 'snapshot belongs to another local owner' }]);
    this.root = join(dirname(manifestPath), 'source');
    this.resolutionPath = join(dirname(manifestPath), 'resolution.json');
  }
  bind(cwd: string, compiledDir: string, repositoryRole?: string): GitSnapshotBinding {
    const within = relative(this.root, cwd);
    if (within.startsWith('..') || isAbsolute(within)) throw new Blocked([{ code: 'snapshot_app_outside_root', detail: 'app.root must be inside the materialized source tree' }]);
    try { readGitSnapshotTree(this.snapshot, this.root); }
    catch (error) { throw new Blocked([{ code: 'snapshot_source_changed', detail: `Selected snapshot files are missing, unreadable, or differ from the manifest: ${(error as Error).message}`, action: 'restore the pinned files or materialize and review a new snapshot in Settings' }]); }
    return GitSnapshotBinding.parse({ snapshot: this.snapshot, root: relative(compiledDir, this.root).split(sep).join('/') || '.', cwd: within.split(sep).join('/') || '.', ...(repositoryRole === undefined ? {} : { repositoryRole }) });
  }
  selection(pin: GitSnapshotBinding) {
    try { return snapshotSourceSelection(pin, JSON.parse(readBoundedFile(this.resolutionPath, 64 * 1024 * 1024).toString('utf8'))); }
    catch (error) { throw new Blocked([{ code: 'snapshot_repository_unbound', detail: (error as Error).message, action: 'materialize the selected resolver head with its resolution.json sidecar; bind one complete repository role' }]); }
  }
}
