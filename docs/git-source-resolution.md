# Immutable Git source resolution

`workflow-verify source-resolve --input repositories.json --output source.json --json` freezes explicit local base/head selections across repositories. It exports a sealed owner-private source-resolution document containing the `RevisionMatrix`, full binary-capable diffs, changed paths and before/after blob bytes. Exit zero means source resolution succeeded; it is not a case review, execution verdict or deployment proof.

Create a local request using the public typed SDK (the repository reference below is a local label, not a registered remote identity):

```js
import { writeFileSync } from 'node:fs';
import { localScope, digestOfValue } from 'workflow-verify';

writeFileSync('repositories.json', JSON.stringify({
  scope: localScope(),
  repositories: [{
    repositoryRef: { id: 'application', revision: '1',
      digest: digestOfValue({ kind: 'local-git-binding', name: 'application' }) },
    root: '.', base: 'HEAD~1', head: 'HEAD',
  }],
}, null, 2), { flag: 'wx', mode: 0o600 });
```

Roots in CLI requests resolve relative to the request file. Library callers supply their own trusted local mappings. Both worktrees and bare repositories are supported; selecting a nested directory cannot silently bind its parent repository. The CLI accepts only the process's `localScope()` and writes new output files privately without overwriting existing evidence. Public JSON schemas include the Git request and resolution contracts.

`resolveGitSources(request, authorize)` requires a trusted host authorization callback before reading each repository. `GitSourceReader(matrix, bindings, authorize)` implements citation object reads and full-diff reads after restart. Bindings contain only `repositoryRef` and `root`; they do not re-resolve branch expressions. A reader refuses another scope/repository, substituted matrix rows, unavailable objects and changed full-diff bytes. Citation validation still checks exact file/excerpt digests. A later dirty checkout or moved branch does not change the selected immutable commit identities.

Git invocation uses argument arrays and [documented end-of-options handling](https://git-scm.com/docs/git-rev-parse), reads commit objects rather than worktree files, and disables replacement objects, inherited Git routing variables, external diff/text-conversion helpers, terminal prompts and lazy fetching. [Git's diff options](https://git-scm.com/docs/git-diff) define the helper exclusions. Selected commits and their tree closure are checked against Git object hashes; captured/read blobs are rehashed independently too. SHA-1 and SHA-256 Git object IDs are preserved in full. This does not create an authenticated issuer or attest a remote repository or deployed target; the host owns the Git executable, source mappings, protected object storage and admission policy.

No fetch, checkout, model call or review approval occurs. Missing or multiple merge bases block until a registered alternative revision policy exists; an empty base is never invented. Renames are represented as deletion/addition with detection disabled. Changed symlinks, submodules, unsupported paths/modes, oversized blobs and incomplete output block instead of dropping coverage.

Bounds: 32 repositories, 500 changed paths, 1 MiB per captured/cited blob, 4 MiB per full diff/tree listing/tree object, 8,192 trees per selected commit, 32 MiB of captured payload bytes and ten seconds per Git command. CLI input is at most 256 KiB. The artifact includes changed blobs and full diffs, not every source object: later citation reads require the selected objects in an authorized Git store. Full source-object transport remains separate work.

The output is a `RevisionMatrix`, not a complete runtime `SourceSelection` or qualified source-to-target proof. Independent element/coverage checking, reviewed source admission, hosted lifecycle storage and execution wiring remain separate gates. Tests use real temporary repositories, including dirty/moved checkouts, bare and SHA-256 repositories, corrupt objects, denied/revoked scope, missing objects, oversized blobs, configured helpers and the actual source/built CLI.

## Run selected revisions independently

Materialize complete regular-file trees from the frozen resolution using an explicit
authorized local repository mapping. Relative `--root` paths resolve beside the
input JSON. Output directories must not exist, and their parent must already exist.

```sh
tracegrove source-materialize --input source.json --repository application --root . --side base --output ./base-snapshot
tracegrove source-materialize --input source.json --repository application --root . --side head --output ./head-snapshot
tracegrove test --config ./base-snapshot/source/tracegrove.config.yaml --source-snapshot ./base-snapshot/snapshot.json
tracegrove test --config ./head-snapshot/source/tracegrove.config.yaml --source-snapshot ./head-snapshot/snapshot.json
```

Each output contains `source/` and a sealed `snapshot.json` with the resolution and
repository references, exact commit, side, and every file's original Git mode,
byte count and SHA-256 digest. `materializeGitSnapshot(input, authorize)` exposes
the same operation through the SDK. Authorization runs before object reads and
again before output allocation. No fetch, checkout, dependency installation, app
execution, Git filters or hooks occur during materialization. Later `test` runs
execute trusted project code and use the ordinary compiler and app identity checks.

The reader validates the commit/tree closure and independently rehashes every blob,
including unchanged files. It refuses an empty tree, symlinks, submodules, unsupported
modes, nonportable names, case/Unicode aliases, more than 10,000 files, blobs over
1 MiB, or more than 32 MiB of file bytes. These are complete-coverage limits: it
never silently excludes a file to make a snapshot pass. A private output is created
only after all object reads succeed; the manifest is written last, and write failure
removes only the directory this operation exclusively created. Existing output is
preserved. The host filesystem and Git executable remain trusted.

The CLI regression test creates a real authorization bug and its fix in separate
commits, freezes them, dirties the checkout and moves its branch. Separate CLI
processes run the identical saved flow against both materialized revisions: the
base fails the ownership assertion and the head passes. Both bundles are re-read
and re-reduced, app digests match the snapshot's source bytes, and cleanup is
confirmed. CI repeats this through the built distribution and retains both sealed
bundles, source trees, snapshot manifests and resolution in `source-regression-proof`.
Another process can verify those bundles or rerun either snapshot without discovery;
the artifact README gives the exact commands. Locally, set
`TRACEGROVE_SOURCE_PROOF_DIR` to a new directory when running
`tests/cliGitSnapshot.test.ts` to retain the same proof.

A snapshot is mutable after publication; its manifest describes the captured
bytes. `test` and `compile` accept `--source-snapshot` for an explicit per-command
binding. Compilation checks the manifest, local owner scope and every pinned file.
The frozen launch plan includes that binding; the trusted supervisor checks the
files again, copies only pinned inputs into its private owned workspace, and
starts the app there. Untracked files cannot enter the launch copy. Post-plan drift
in any pinned file, including files outside the entrypoint's source glob, blocks
startup. The supervisor owns and removes the private copy after stop, startup
failure or controlling-client disconnect.

Pinned launches support the Node file, FastAPI module and canonical Django launch
templates. Opaque eval/shell wrappers and entrypoints outside the snapshot are
refused. The attestation binds the supervisor-computed source digest and snapshot
reference; saved-bundle verification rechecks the exact file closure and manifest
digests. Dependency installations, interpreter binaries and application environment
remain separately supplied inputs; this is not a process sandbox or a complete
dependency attestation. The CLI refuses snapshots from another local scope.

This is local source-content binding, not authenticated Git/remote/deployment
identity or a runtime `SourceSelection`. A self-sealed manifest does not prove
who resolved its commit. The host does not yet populate repository observations
or promote qualification from this manifest. Authenticated resolver/admission
policy, reviewed lifecycle execution and hosted activation remain separate work.
