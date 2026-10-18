# Independent local result retention

The result sink retains complete verified bundles independently of the producer's
run directory. It reuses the existing fenced `LocalLedger` for its index; there is
no second database, mutable status file, or hosted service in this implementation.

```sh
tracegrove result-ingest --bundle ./run/bundle --sink ./retained-results --json
tracegrove results --sink ./retained-results --limit 20 --json
tracegrove results --sink ./retained-results --id <result-id> --json
```

`result-ingest` captures a bounded verified snapshot, checks the selected consumer
scope, copies only sealed files, reads the completed archive back, and publishes
an immutable `workflow.result-ingest/v1` receipt. Manifest and payload bytes come
from the same snapshot that passed complete evidence reduction; the source is
not reopened during copy. Binary artifacts retain their exact bytes. Unsealed
files, including accidental scratch files, are not imported.

The receipt records the actual retained outcome, exact campaign/request/selection
and fidelity-plan refs, planned fidelity lanes, manifest digest, receipt count,
and acceptance time. A failed, cancelled, blocked, or mocked result never becomes
a passing live result through storage. Every receipt explicitly says:

```json
{"evidenceClass":"integrity_checked_local_bundle","issuerStatus":"unverified","qualificationStatus":"not_evaluated"}
```

Exit 0 from ingestion means durable retention succeeded, including retention of
an honestly failed attempt. Check `receipt.retainedOutcome` for the result's
verdict. The ordinary CLI error convention remains stderr plus a nonzero exit;
invalid or inconsistent evidence is a conflict (exit 2).

## Reading and replaying deliveries

Listing returns stored receipt metadata with `archiveStatus: not_checked`. It
does not renew an earlier integrity check. Inspecting a result by ID captures and
re-verifies the retained archive against its exact indexed manifest and refs.
Missing or corrupted archives fail rather than echoing the recorded verdict as a
fresh verification. Inspection keeps working when the original run is removed.

Delivering the identical campaign and manifest again returns the original receipt
with `replayed: true`; it does not append another result. Reusing that scoped
`campaignId` with different evidence is a conflict, including renaming its result
document reference. Even a differently serialized
manifest is different evidence. Preserve the original manifest bytes for retries.

List pages are bounded to 100 records. An opaque cursor binds the selected scope,
index version, and offset; later deliveries do not change that page sequence.
Cursors are pagination positions, not access grants. An exhausted 10,000-record
prototype index blocks new admissions until an authoritative archival index is
provided. Entries are never silently evicted.

## Durability and scope

Archive files and directories are synced before their immutable content-addressed
directory is published. The archive namespace is synced before the ledger receipt
is appended and synced. A crash between those operations can leave an unindexed
complete object, but cannot publish an accepted receipt for an incomplete copy.
A retry verifies that object and syncs its namespace again before publishing one receipt. Partial
staging directories are not indexed; only a staging directory created by the
current operation is removed on an ordinary write failure. Existing content is
not replaced or silently repaired. The test suite includes an actual SIGKILL at
the archive/index boundary, reopen/retry, and injected sync failure.

The SDK exports `ResultSink`, `ResultSinkAuthority`, `LocalResultSink`, and
`VerifiedBundleSnapshot`. A host supplies consumer authorization; ingestion
rechecks it after capture and commits without an asynchronous gap. The CLI uses
the same local operator scope as ordinary runs, with no producer-supplied scope
override. The journal and objects are namespaced by that complete scope.

The operator must provide protected, quiescent source and storage directories
and authorize the source location before calling the SDK. The existing local
ledger supplies one writer and stale-process recovery; this is not distributed
fencing or a filesystem ACL against a hostile same-user process. Local owner
labels, including `WORKFLOW_VERIFY_OWNER`, do not authenticate a remote tenant.

This sink verifies integrity and record consistency. It does not authenticate an
issuer, approve a source plan, provision qualification leases, activate coverage,
or publish an OrgX AWR record. Hosted receiver authentication, tenant delivery,
and scoped OrgX projection require their own trusted adapters. A storage receipt
cannot stand in for those acceptance gates.
