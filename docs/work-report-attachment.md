# Attach a retained report to existing work

Receipt import and work attachment are separate delivery stages. An import can be
acknowledged while attachment is still prepared, unknown, or awaiting review.
Neither stage approves or completes work.

Bind the work before execution. For example, an operator-owned `work-binding.json`:

```json
{"workId":"00000000-0000-4000-8000-000000000003","requirementRefs":[]}
```

Replace the example with the actual work UUID and agreed requirement refs. Empty
requirement refs do not assert a native work contract or permission to complete it.
Planning freezes the parsed binding into the request digest:

```sh
tracegrove plan --config ./verification/workflow.yaml --purpose work_proof --work-binding ./work-binding.json --output ./request.json
tracegrove run --request ./request.json --state-dir ./run-state --json
```

An unbound historical campaign cannot acquire a work binding during export.
Run a new, explicitly bound campaign if it is genuinely a new requested effort.
Normal unbound planning remains unchanged. SDK callers supply the same typed
`workBinding` to `plan`; it is copied and validated before planning.

Ingest and import the result using the [result sink](result-sink.md) and
[AWR delivery](awr-delivery.md). After import acknowledgement, create a protected
`target.json` with the actual work type, the same full UUID, its native workspace,
and the exact native `updated_at` value. Preserve timestamp precision and offset:

```json
{"entityType":"task","entityId":"00000000-0000-4000-8000-000000000003","workspaceId":"00000000-0000-4000-8000-000000000001","expectedUpdatedAt":"2026-10-18T01:00:00.123456Z"}
```

```sh
tracegrove report-prepare --sink ./retained-results --id <result-id> --target ./target.json --json
tracegrove report-inspect --sink ./retained-results --id <result-id> --json
tracegrove report-attach --sink ./retained-results --id <result-id> --json
```

Preparation and inspection are offline. Attachment uses the protected credential
environment described in the AWR guide. It calls the existing authenticated receipt
read endpoint with the frozen workspace UUID, then the existing artifact-create
endpoint with a stable Idempotency-Key header and deterministic artifact UUID.
The snapshot workspace must match the frozen import destination. Preparation
requires a timestamp supplied from an authorized native work read; it does not
fetch or invent one. The examples are placeholders, not observed work state.
The API receives `expected_scope.workspace_id` and
`expected_scope.expected_updated_at` on every attempt. The snapshot is a condition
on attachment admission, not proof that execution tested that work revision.
The returned artifact must match the exact workspace, work type/ID, report link,
evidence metadata, and artifact UUID before the sender records acknowledgement.

The report link is the existing private OrgX work-ledger receipt page. It does not
create another object store or save an expiring signed URL. Before each fresh
attachment attempt, the sender compares the full hosted receipt's canonical bytes
with the frozen receipt digest and freshly checks the retained local archive.
A substituted report, missing import, foreign target ID, or corrupted archive blocks
the attempt. Changing a target type, workspace or timestamp after preparation also
conflicts. Projects, initiatives, workstreams, milestones and tasks are supported.

The artifact is born `in_review`, with `external_unverified` provenance and an
explicit product verdict in its preview. A failed product campaign stays failed;
attaching its evidence does not label the product as passing. The link serves the
redacted imported report, not the full local bundle, recordings or raw observations.
Protected publication of those additional bytes remains a separate integration.

## Independent retries

The attachment outbox stores a separate immutable intent and acknowledgement from
the AWR import. Both stages reuse `LocalDeliveryJournal`, which owns bounded
attempt history, synced intent/attempt/acknowledgement records, version checks and
in-flight exclusion on the existing fenced ledger. Existing AWR journal event names
and receipt shapes remain readable; no migration or extra database is introduced.

If artifact creation succeeds but the response is lost, attachment becomes
`acknowledgement_unknown`. Reopen and retry with the same result ID: the exact
payload, artifact UUID and idempotency key are reused. A failed local acknowledgement
write is recovered the same way. Receipt import is not repeated, and no runner,
fixture seeder or completion service is invoked. A confirmed retry reports
`attached`, with a separate `recordedArtifactStatus`. Evaluation or human review
may have changed that status since creation; a retry records the returned status
without confusing it with delivery or native work acceptance. Historical
acknowledgement is not a fresh read; acknowledged retries make no network call.

The scoped intent uses `workflow.report-attachment/v2`. A v1 journal has no atomic
snapshot and is refused with a reconciliation message. Keep that journal and
reconcile any prior artifact with the original sender; this version does not
rewrite it, silently attach a snapshot later, or generate a replacement identity.

## Host authority and limits

`LocalReportAttachmentOutbox` exports typed `ReportAttachmentAuthority` and
`ReportAttachmentTransport` ports. The authority must resolve the target's actual
type, owner and workspace and authorize the side effects, including any artifact
evaluation costs. It is checked after readback and immediately before recording a
POST attempt. A lost response does not turn into a new approval grant.

The CLI represents a local operator's explicit configuration. Local labels and
no-op callbacks do not authenticate a tenant. Scoped attachment requires the
native attachment API and migration on the OrgX side.
That transaction checks workspace ownership, locks the work target, and compares
the frozen workspace and timestamp before insertion. Matching historical retries
return the original artifact after a work change, subject to current workspace
access. The sender makes no separate mutable target read before POST and has no
unscoped fallback. An older strict API rejects the unknown scope field; a missing
native function must fail without a direct insert. Deploy the native migration
and API before using scoped delivery. Hosted tenant qualification still needs
live acceptance evidence; local transport tests do not establish it.

A native HTTP 409 produces a conflict with instructions to preserve the delivery
and reconcile its receipt. HTTP 400/401/403/404/422 blocks delivery and asks the
operator to check scope, access and contract support. Provider response text is
discarded. Connection loss, throttling and unavailable services retain an unknown
acknowledgement and the same retry key. None of these errors refreshes the
timestamp, strips the assertion, reimports the receipt or reruns the campaign.

`OrgxReportAttachmentHttpTransport` reuses the import transport's credential,
same-origin, redirect, deadline and bounded-response handling. It exposes no work
completion or outcome API. Full native proof, task acceptance, delayed outcomes,
live hosted qualification, and actual widget-host/mobile packs remain separate gates.

Conformance runs import/readback/attachment over real loopback HTTP with simulated
native authorization and storage. It drops the first artifact acknowledgement after
admission, reopens the sender, and requires one import, one artifact, identical POST
bytes, separate stage states, and no completion calls. It is not live OrgX evidence.
