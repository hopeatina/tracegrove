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
and its runtime file measurements remains the issuer's job. Repository observations,
remote URLs, runtime `SourceSelection`, dependency/runtime provenance and source-bound
qualification are separate contracts; this change does not populate them or activate
coverage. Existing proof-less snapshots remain component-only and receive no Git
observation.

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
