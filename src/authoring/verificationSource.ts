import { relative, resolve, sep } from 'node:path';
import { localScope } from '../core/corpus.ts';
import { Blocked } from '../core/errors.ts';
import { sameRef } from '../protocol/canonical.ts';
import type { GitSourceSnapshot } from '../protocol/index.ts';
import { pinnedArguments } from '../hosts/pinnedArguments.ts';
import type { AuthoringConfig } from './schema.ts';
import { SnapshotSource } from './snapshotSource.ts';
import { readLocalSettings, writeLocalSettings } from './localSettings.ts';
import { applicationCwd } from './appLocation.ts';
import { VerificationSourceBinding, VerificationSourceSelection } from './sourceSelection.ts';
import { applicationLaunch } from './appLaunch.ts';

export function describeSnapshot(snapshot: GitSourceSnapshot): VerificationSourceBinding {
  return { kind: 'snapshot', ref: snapshot.ref, commit: snapshot.commit, files: snapshot.files.length, bytes: snapshot.files.reduce((sum, file) => sum + file.bytes, 0) };
}
export function savedVerificationSource(root: string): VerificationSourceSelection {
  return readLocalSettings(root).verification?.source ?? { kind: 'working_tree' };
}
export function resolveVerificationSource(root: string, override?: string): SnapshotSource | null {
  const selected = override === undefined ? savedVerificationSource(root) : null;
  const path = override ?? (selected?.kind === 'snapshot' ? selected.path : null);
  if (path === null) return null;
  const source = new SnapshotSource(resolve(root, path), localScope());
  if (selected?.kind === 'snapshot' && !sameRef(source.snapshot.ref, selected.ref)) throw new Blocked([{ code: 'source_selection_changed', detail: 'The selected manifest has changed since it was saved', action: 'review and select the snapshot again in Settings' }]);
  return source;
}

/** Read-only candidate validation; no compile output, runtime probe, or application starts. */
export function previewVerificationSource(root: string, path: string, config: AuthoringConfig) {
  const absolute = resolve(root, path); const source = new SnapshotSource(absolute, localScope());
  const cwd = applicationCwd(config.app, resolve(source.root, config.app.root));
  source.bind(cwd, root);
  const launch = applicationLaunch(config, root, resolve(source.root, config.app.root));
  pinnedArguments(launch.args.map(arg => arg.replaceAll('{port}', '1')), cwd, source.root, source.snapshot, config.app.adapter === 'node' ? 'node' : 'python');
  return { selection: VerificationSourceSelection.parse({ kind: 'snapshot', path: relative(root, absolute).split(sep).join('/') || '.', ref: source.snapshot.ref }), binding: describeSnapshot(source.snapshot) };
}
export function saveVerificationSource(root: string, input: unknown, config: AuthoringConfig) {
  const selected = VerificationSourceSelection.parse(input);
  if (selected.kind === 'snapshot') {
    const candidate = previewVerificationSource(root, selected.path, config);
    if (candidate.selection.kind !== 'snapshot' || !sameRef(candidate.selection.ref, selected.ref)) throw new Blocked([{ code: 'source_selection_changed', detail: 'Snapshot changed after preview', action: 'check the snapshot again before saving' }]);
  }
  writeLocalSettings(root, { ...readLocalSettings(root), verification: { source: selected } });
}
