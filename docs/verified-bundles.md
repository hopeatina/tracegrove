# Verified bundle snapshots

`verifyBundle(directory)` retains its summary response shape; invalid bundles report a null outcome instead of echoing a producer's PASS label. `readVerifiedBundle(directory)` returns the checked request, selection, campaign, per-cell receipts, frozen document map and manifest byte digest; it throws instead of returning records for an invalid bundle. These records prepare whole-round qualification evaluation but do not themselves qualify or activate a scenario.

Both paths use one `BundleSnapshot`. Each listed payload is read once, checked against its sealed byte count/hash and retained privately. JSON decoding, assertion checks and campaign reduction consume those captured bytes. Mutating the directory after capture does not change that snapshot. Buffers returned by the snapshot are copies. A later verification call takes a fresh snapshot rather than caching a former success.

`VerifiedBundleSnapshot.open(directory)` exposes the exact verified manifest and
payload bytes as defensive copies for storage adapters. Its records and manifest
digest are copies too. The [local result sink](result-sink.md) writes those
captured bytes, verifies the completed archive, and publishes a scoped receipt
through the existing ledger. It does not re-open producer files during copying
or promote a storage receipt into qualification authority.

The reader refuses traversal, duplicate paths, symlinks and nonregular files. Reads are bounded to the expected size plus one byte so growth is detected without loading an arbitrarily larger file. Current prototype bounds are 1 MiB for the manifest, 16 MiB per file, 64 MiB of payload and 10,000 files. Oversize bundles fail verification; files are never truncated or silently omitted. Larger media packs need an explicitly supported bounded reader.

Campaign verification rechecks complete receipt bindings, missing cells, coverage and proof eligibility, as well as full request/selection/campaign scope and reference identity. Per-cell checks bind exact case/persona/surface/variant and qualification-admission refs. The outcome label alone cannot cover inconsistent campaign metadata.

Target comparison checks every target metadata field and each required component's
kind and identity. Current hosts supply component attestations only: repository,
release, schema, flag, browser, container and model metadata remain unobserved.
Requesting those fields cannot fill their observations; a required mismatch blocks
the run before fixtures or steps. The saved-bundle reader reconstructs the observed
tuple from the captured host attestations too, so inventing matching expected and
observed metadata and recomputing all file/document hashes cannot create passing
source or deployment evidence. Unsupported target observations need a real host
contract before they can qualify. Honest blocked attempts retain their evidence.

An optional source-snapshot binding covers local launch content. Its frozen
manifest must match the admitted scope and supervisor observation; every attested
identity file must belong to that manifest with the same bytes. The reader also
recomputes the source digest from those file observations. This binds captured
local content, without supplying unimplemented repository/deployment observations
or authenticating the manifest's Git resolver.

This is integrity and record-consistency verification. A passing mocked bundle retains its mocked proof boundary. It is not live qualification, trusted issuer identity, tenant authorization or production acceptance. The host must authorize a quiescent artifact directory and apply its own issuer/admission policy. The snapshot API is not a remote filesystem ACL or a defense against a hostile process replacing parent directories during capture.
