# Retained evidence to Agent Work Receipt

This optional adapter exports a retained result as redacted AWR v0.2 and saves
an immutable delivery intent in the existing local ledger. Delivery uses OrgX's
existing workspace-scoped AWR importer. It does not execute a campaign, attach a
report to native work, complete work, qualify scenarios, or observe native outcomes.

Install the optional peer only when using this integration:

```sh
npm install --save-exact @useorgx/agent-work-receipt@0.3.0
```

Core SDK and ordinary CLI startup do not import that package. The optional adapter
uses its canonical validator and content-hash helpers, without copying AWR schemas
or implementing a competing canonicalizer.

After `result-ingest`, create a protected operator-owned destination file:

```json
{"origin":"https://useorgx.com","workspaceId":"00000000-0000-4000-8000-000000000001"}
```

Replace the example UUID with your authorized workspace. The HTTPS origin must
have no path, query, fragment, credentials, or trailing slash. The bundle cannot
choose its destination.

```sh
tracegrove awr-prepare --sink ./retained-results --id <result-id> --destination ./destination.json --json
tracegrove awr-inspect --sink ./retained-results --id <result-id> --json
tracegrove awr-deliver --sink ./retained-results --id <result-id> --json
```

Preparation and inspection make no network requests. Supply the credential through
a protected `TRACEGROVE_ORGX_TOKEN` environment variable. `--credential-env` selects
a different variable name; never pass a credential as an argument. Tokens are not
included in prepared records, journal entries, or transport diagnostics. Redirects
are refused. Responses have a 32 KiB bound and 15-second deadline.

The local operator controls configuration. The authenticated importer independently
checks workspace access and admission. SDK hosts must implement
`AwrDeliveryAuthority` against actual consumer-to-workspace policy. Local owner
labels and no-op callbacks do not authenticate a remote tenant or grant approval.

## Evidence and acceptance

The receipt describes export effort. A successful export of a failing campaign is
successful export work; the original product verdict remains visible in its summary
and `extensions["org.tracegrove.workflow"]`. A target regression is not assigned to
the evidence exporter as an operational failure.

The shared `workflow.evidence-projection/v1` schema preserves exact request,
selection, campaign and attempt refs, separate expected/observed target digests,
actual recorded provenance, planned lanes, and the frozen work binding. An unbound
run stays unbound. Raw observations, excerpts, local paths, media locations and
credentials are withheld. Refs/digests remain potentially sensitive metadata; use
authorized destinations. Full evidence stays in the private result archive.
Oversize exports fail rather than silently omitting attempts.

Verification remains `unverified`; acceptance remains `pending`; qualification is
not evaluated; native outcomes are not observed. The runtime is `tracegrove`, never
the reserved `orgx-verify`. The adapter cannot manufacture native proof, a second
verifier lens, task acceptance, or outcome attribution.

Per-attempt estimates, reconciled costs and unknown-charge counts remain in the
projection. AWR v0.2 requires a numeric total even when unknown. The export uses
zero with `estimated: true` and explicit `status: unknown` /
`zero_is_schema_placeholder: true` metadata. It is not a measured zero, campaign
total, invoice cap, or authoritative economic observation.

## Recovery

One retained result has one immutable destination and receipt. Preparing again
returns the same envelope. Changing workspace or origin conflicts; editing the
configuration cannot redirect a saved delivery. A new effort requires a new result.

Before network I/O, the outbox syncs an attempt record. Missing or invalid responses
leave `acknowledgement_unknown`. Retry with the same result ID: it reuses the exact
receipt, destination, and digest-bound key. Receiver admission followed by connection
loss reconciles one import. The same recovery covers a successful response followed
by failed local acknowledgement publication. No retry path calls a runner, seeds
data, or reruns product actions. Corrupt retained evidence blocks fresh delivery.

A validated response records `imported_unverified`. Repeating delivery returns the
saved acknowledgement without another network call; it does not renew archive
integrity or permission. Use `results --id` for a fresh archive check. The prototype
blocks at 1,000 attempts without evicting history. It inherits protected filesystem
and single-writer requirements, not distributed fencing.

The SDK subpath `workflow-verify/integrations/awr` exports `LocalAwrOutbox`, typed
destination/envelope/acknowledgement contracts, `AwrDeliveryAuthority`,
`AwrTransport`, and `OrgxAwrHttpTransport`. Supply the sink's same fenced ledger and
scope. Credentials are retrieved only for network delivery. Trusted hosts may
inject a transport; producers cannot select one through evidence.

Conformance uses real loopback HTTP with simulated authority and admission. The
receiver destroys the first connection after admission; reopen/retry must retain
one receiver record, identical request bytes, and no credentials in the journal.
This does not establish live OrgX import or native-work attachment; those require
their own authenticated provider receipts.
