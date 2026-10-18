# Git object checks for pinned snapshots

New `materializeGitSnapshot` outputs include the raw commit/tree object proof and each
file's Git blob identity. The resolver reads immutable Git objects with its existing
restricted environment; materialization verifies the complete proof before creating
an output directory. No fetch, checkout, helper, signature verification or application
execution is added.

`verifyGitSnapshotCommit(snapshot, files)` independently hashes every actual file as a
Git blob, checks paths and modes against the complete raw tree closure, and hashes that
tree/commit chain against the selected commit. Both SHA-1 and SHA-256 object formats
are supported. Its observation has `verification: actual_file_bytes` and binds the
computed commit, root tree, object algorithm and proof digest. It needs captured bytes
and proof objects and captures each supplied file buffer once before both hash checks,
so it continues to work after the Git store and source directory
are unavailable.

```ts
const files = readGitSnapshotTree(snapshot, sourceRoot);
const observed = verifyGitSnapshotCommit(snapshot, files);
```

`verifyGitSnapshotProofMetadata(snapshot)` checks object/manifest links without reading
source files. Its distinct `verification: object_links_only` result is not a runtime
observation. A resealed manifest could pair a new SHA-256 file checksum with an old Git
blob ID; metadata alone cannot prove that association. Actual-file verification rejects
it even when the new checksums and manifest seal agree.

## Launch and saved evidence

Snapshot reads now verify object proofs when present. The trusted supervisor copies the
pinned files into its owned tree and verifies the private copy again before launching
the application. It sends the computed Git observation over its existing IPC channel.
The parent refuses missing/mismatched observations for proof-bearing snapshots, and
the sealed identity attestation records the observed fields. The application cannot
establish this observation through its health response.

Saved-bundle verification checks the proof's metadata, snapshot ref, component file
closure and recorded Git observation after the private launch directory is removed.
It does not regain the full source bytes from that observation. Authenticating the host
and its runtime file measurements remains the issuer's job. Existing proof-less snapshots
remain component-only and receive no Git observation. Repository binding is a separate,
explicit option described below; remote ownership and dependency-install provenance are
not inferred from Git object hashes.

## Bind a repository role

Materialization also saves a sealed `resolution.json` next to `snapshot.json`. To connect
the selected resolver head to a repository role:

```sh
tracegrove test --config ./head/source/tracegrove.config.yaml \
  --source-snapshot ./head/snapshot.json --source-repository-role application
```

The same flags work with `compile`. Compilation verifies the complete source tree,
checks the sealed resolution sidecar against the snapshot, and emits `SourceSelection`,
the original `RevisionMatrix`, and snapshot documents in the normal frozen corpus. The
planner binds that selection to the request and every cell. Existing component-only
snapshot runs do not change unless a repository role is provided. Old snapshots can
be rematerialized to obtain a sidecar; no network access is required.

The descriptor uses `urn:tracegrove:git-object:<algorithm>:<commit>` and origin
`snapshot_bundle`. It identifies the actual Git object, not ownership of a GitHub URL.
`requestedRef` in the target is the immutable commit; `requestedExpression` in source
selection retains the resolver's original expression. Both Git SHA-1 and SHA-256 work.
`dirty: false` describes the supervisor's complete private pinned copy, not the checkout.

Lockfile identity v1 hashes a sorted manifest of complete pinned path, mode and SHA-256
digest for `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`,
`bun.lock`, `bun.lockb`, `uv.lock`, `poetry.lock`, `Pipfile.lock`, `Cargo.lock`, `Gemfile.lock`,
`composer.lock` and `go.sum` at any depth. No recognized lockfile produces an explicit
empty-manifest digest. This identifies pinned lockfiles; it does not establish which
dependencies were installed.

Repository observation is derived only after the supervisor's `actual_file_bytes`
observation matches the proof. Planning, execution preflight, saved-bundle checks and
revision assessment share the frozen source-closure checks. They reject different
roles, remote URLs, lockfile identities, missing closure documents and source plans
whose reviewed matrix differs. Base snapshots and multi-repository resolution sidecars
cannot use this single-head binding; companion repositories are never silently dropped.
They remain available for component-only runs until a complete multi-host binding exists.

Two independent native campaigns can now meet a revision-level local qualification
policy and activate through the durable scenario store. The tests simulate issuer and
physical-lease authority explicitly. This does not establish hosted issuer trust, live
staging coverage, remote repository ownership, or a reviewed-source promotion by itself.

Proofs fail on missing or duplicate trees, unrelated objects, malformed/canonicalization
errors, changed file/object/mode bindings, incomplete actual file coverage and unsupported
tree entries. Symlinks, submodules, empty Git directories and nonportable paths cannot
be silently omitted. Prototype bounds are 1 MiB per commit, 4 MiB per tree, 8 MiB total
tree bytes, 8,192 distinct trees and 20,000 traversal entries, in addition to the existing
10,000-file/32 MiB snapshot bound. Unsupported coverage blocks instead of truncating it.

Tests use real SHA-1/SHA-256 repositories, binary files and reused subtrees; remove the
Git/source paths before pure verification; and exercise resealed forged commits, trees,
files and runtime attestations. Native pinned launches and independent bundle reads
verify the observation path. These are local integrity/runtime facts, not hosted issuer
authentication, author identity, a signed release or remote repository ownership.
