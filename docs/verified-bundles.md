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
kind and identity. Current hosts supply component attestations and, when explicitly
bound, verified pinned Git-object repository observations. Remote ownership,
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
local content. The [Git proof guide](git-object-proof.md) describes the separate
actual-file object check and opt-in repository role. Neither establishes remote
ownership, deployment identity or hosted issuer trust.

This is integrity and record-consistency verification. A passing mocked bundle retains its mocked proof boundary. It is not live qualification, trusted issuer identity, tenant authorization or production acceptance. The host must authorize a quiescent artifact directory and apply its own issuer/admission policy. The snapshot API is not a remote filesystem ACL or a defense against a hostile process replacing parent directories during capture.

## Atomic local export

`exportVerifiedBundle(source, output)` captures and reduces one bounded snapshot, writes only its sealed bytes into a private sibling staging directory, verifies the staged copy, and renames it into a fresh output directory. The manifest comes from that same snapshot; unlisted host/private files are excluded. The CLI `export` and authoring `test` use this path. CLI JSON includes `published`; invalid source evidence publishes no output. Existing outputs are never merged or overwritten, including an empty directory.

Files and directory entries are synced before acknowledgement, including newly created ancestor entries. Content-addressed object publication uses an exclusive hard link, unique temporary storage, bounded no-follow readback and a single digest-checked read. A preexisting corrupt object is retained and reported, never silently replaced. Preexisting symlink ancestors are rejected before directory creation. These operations require a supported owned local filesystem with directory fsync and hard links; unsupported filesystem behavior fails rather than claiming durability.

Cooperating exporters share an exclusive sibling publication lock. A writer crash can leave its private staging directory and lock; the destination is absent or contains the complete verified bundle. Locks are never automatically broken. The operator must establish that the writer is gone and inspect the owned staging/output state before a separately authorized cleanup/retry; do not blindly remove a lock belonging to another writer. If final parent sync fails after rename, the command reports that publication durability is unconfirmed: the complete output may exist, so verify it before retrying and do not overwrite it.

Tests include concurrent independent publishers, actual writer SIGKILL during a payload write, source mutation after snapshot capture, corrupt objects, symlink/no-effect refusal and injected write/sync failures. This establishes local process-crash behavior and fsync ordering, not physical power-loss qualification, arbitrary hostile-parent confinement, distributed fencing, automatic recovery or provider attestation.

## Durable original execution seal

`writeExecutionBundle` now persists the original execution records before acknowledging the
source seal, rather than relying on a later exported copy. Cell and final payload files are created
exclusively and fsynced. Existing cell payloads are re-read through the bounded no-follow reader,
synced as regular files, and their directories are synced before final publication. Existing
payloads or manifests are never overwritten, including corrupt bytes left by an interrupted write.

The writer builds the existing v1 manifest in a unique private `.bundle-pending-*` directory.
An internal candidate snapshot checks its bounded payload hashes and performs the same complete
frozen-record, assertion and campaign reduction as the public verifier. The verified receipt set
must also match the final records supplied by the executor. Only then does an exclusive hard link
publish `manifest.json`, followed by directory fsync. The executor's ledger finalization follows
the returned source seal. The bundle format and public reader contract are unchanged: a candidate
without a published manifest is never a valid public bundle.

The caller must own a quiescent local execution tree and retain its existing ledger writer.
An exclusive `.bundle-write.lock` serializes cooperating source writers. A write/sync/candidate
failure or process death retains its incomplete records, lock and any manifest staging for explicit
reconciliation; no stale lock is automatically removed and no assertion is retried. A manifest
that became visible before a later directory sync failure is reported as published with durability
unconfirmed, rather than removed or overwritten. Verify that existing bundle before any retry.

Tests cover actual SIGKILL before the manifest link and after its first directory fsync, injected
payload write/fsync failures, corruption during manifest staging, a hash-consistent candidate
whose campaign disagrees with reduction, existing corrupt payload preservation, linked-parent
refusal and post-publication sync uncertainty. A process crash can leave an invalid incomplete
source or a complete verifiable source with reconciliation remnants. These bounded local tests
do not simulate physical power loss, establish hostile-writer confinement, distributed fencing,
provider/host qualification, or transactional recovery across the separate ledger and bundle seal.

## Local commit-window readback

If a controller dies after the original manifest commits but before ledger finalization, local
redelivery first requires the existing durable ownership inventory to show acknowledged removal
of every resource. It then verifies and reduces the entire committed bundle and binds its exact
request/selection, scope, execution/attempt/generation, attempt number, idempotency key and
per-cell receipt references to the trusted ledger. Only a matching commit can reconstruct the
original summary, sync the manifest's directory and append the missing `finalized` transition.
A failed recovery directory sync leaves finalization blocked with durability unconfirmed.
It returns checked receipts and
starts no second host or fixture. A manifest's mere presence or a producer PASS label is insufficient.

Finalized redelivery also reads this bound committed evidence instead of trusting the cached
summary containing an empty receipt list. Missing, corrupt or foreign finalized evidence fails
closed without acquisition. Interrupted attempts without a committed manifest retain the existing
retry policy and ownership gate; this readback does not repair incomplete files or invent cleanup.
Actual controller SIGKILL immediately before the ledger finalization write, zero-launch readback,
unknown ownership, corrupt/foreign/missing evidence and false cached summary are regression-tested.
This is local reconciliation under one ledger writer, not a distributed transaction or a claim that
physical power loss was simulated.

## Inspect and hand off a frozen run

```sh
tracegrove inspect --request ./frozen.json --json
tracegrove rerun --request ./frozen.json --output ./next-attempt.json
tracegrove run --request ./next-attempt.json --state-dir ./state
tracegrove inspect --execution <id> --state-dir ./state --json
tracegrove inspect --bundle ./exported-evidence --failed-step --json
tracegrove export --execution <id> --state-dir ./state --output ./new-export
```

`inspect --request` uses the typed frozen transport envelope and static executable
closure checks. It reports requested refs, selected cells, a closure digest, blockers
and whether a qualification owner is required. `executionAuthority: not_checked`
means exactly that: inspection does not query an approval owner, probe a runtime,
start an application, provision state or grant effects. It needs no mutable project
YAML. A blocked structure exits 2; a valid structure exits 0.

The CLI reads frozen envelopes from bounded regular files (96 MiB maximum), rejects
unknown envelope fields and checks document keys and seals before rerun. A trial or
work-proof rerun retains the exact frozen case/persona/target selection, assigns fresh
campaign/request identities and records `replayOf`. Its documents are independent
copies of the original. Qualification/lifecycle requests cannot use `rerun` to erase
registration; use the current owning registry to admit a new independent round and
`prepareQualificationExecution` to bind it.

Execution inspection first captures and independently verifies the complete evidence
bundle. It never reports an unverified producer PASS. `--bundle` supports evidence
outside the original state directory; `--execution` requires one safe path segment
and a state directory. `--failed-step` is the explicit path for failed observation
payloads. Ordinary summaries retain compact step/assertion labels. Successful
inspection exits 0 even when the verified product outcome is a failure; read `outcome`.
Invalid evidence exits 2 and reports no success summary.

The CLI `export` uses the atomic local export described above. The library also exports
`exportCapturedBundle(snapshot, output)`, which writes a `VerifiedBundleSnapshot`'s captured
sealed bytes through the same file writer as the result archive. It never rereads the producer directory or copies
unlisted scratch files or workspaces. The output must be a new directory. Files are
exclusive, the manifest is written last, and completed output is reverified. Failed
writes remove only the newly allocated output; existing destinations and links are
left intact. Capturing before the producer disappears still permits export afterward.

The library exports the `FrozenBundle`, `FrozenPlanInspection`, `ExecutionInspection`
and `FailedStepInspection` Zod schemas with the corresponding reader/inspection
functions. These local projections are not new execution authority or outcome records.
