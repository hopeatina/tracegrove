# Capability schema foundation — review draft

This is a schema/admission boundary, not a provider installation or a new execution engine. Existing CLI behavior and workflow v1 records remain authoritative. No external operation is dispatched by this slice.

## Reuse and mapping

| Canonical concept | Existing source of truth | Minimal delta |
|---|---|---|
| Run | `workflow.request/v1` campaignId + `workflow.campaign-result/v1` | Do not add another Run entity |
| Scenario | `workflow.case/v1`; lifecycle `workflow.scenario/v1` | Keep executable case and lifecycle definition distinct |
| Attempt | `workflow.execution/v1` executionId, attemptId/number, predecessorAttemptRef | Reuse these IDs in every operation/evidence binding |
| Operation | Step + runner protocol operationId | Add one scoped operation envelope with typed semantics |
| Environment | EnvironmentPlan/EnvironmentBinding + HostLease | Refer to exact frozen environment/lease; do not invent a provider-owned tenant |
| Resource | HostSession.ownedResources and cleanup inventory | Add a scoped handle resolved by the trusted host; producer claims cannot grant ownership |
| Fixture | SeedRecipe + LogicalPayload + FixtureManifest | Preserve recipe/payload/ref digests; lifecycle policy stays application_api for existing execution |
| Capability | RunnerCapabilities + HostCapabilityObservation | Add versioned descriptors/requirements; declaration is distinct from observed availability |
| Assertion | Predicate + AssertionObservation | Preserve oracle/input/evidence refs and required flag; provider status is not a verdict |
| Observation | StepObservation + native HTTP/browser facts | Add typed transport facts with completeness and observation/inference distinction |
| Evidence | EvidenceArtifact + sealed bundle refs | Preserve native artifact digest, producer/tool version and redaction disposition |
| Correlation | Existing execution/attempt IDs | Add explicit parent/span links and request/job/message/entity identifiers; timestamps imply no causal edge |

## First slice

New `workflow.capability-operation/v1`, `workflow.capability-observation/v1`, descriptor and scoped-resource schemas use existing Ref/Scope primitives. TS types derive from Zod, and JSON Schemas derive from that same registry. A closed typed semantic union covers existing HTTP/browser/API-fixture paths and illustrative worker, WireMock, database and pipeline contracts. These latter variants are schema examples, not implemented capabilities.

Admission receives the current run/attempt binding, frozen requirements/descriptors and trusted resource lookup. Unsupported required capability/version/semantics fails explicitly. Optional unsupported requirements remain reported omissions. Mutations require host-resolved owned isolated resources, an exact scope/attempt/generation/environment binding and a live lease; production reset is impossible through this interface. No arbitrary SQL, script or provider URL bag is a universal operation.

Evidence validation checks exact operation/run/attempt binding, producer/version, native artifact digests, redaction disposition and completeness. Inference remains inference. Absence cannot be asserted from partial/missing capture. Execution status and verification verdict are separate fields; incomplete required evidence yields inconclusive even when the producer completed. The existing trusted reducer remains the execution verdict authority.

The event accumulator detects equal redeliveries, rejects conflicting duplicate IDs/sequences, preserves retry attempt identity, and never attaches stale/cross-run evidence by timestamp. Correlation links preserve parent and span-link relationships across asynchronous boundaries without promoting declared links to observed causality.

## Example provider mappings

- HTTP: existing typed HTTP request/observation; request ID link; independent API readback.
- Browser: existing BrowserCommand/BrowserObservation; step/recording refs; no arbitrary evaluate/selector escape hatch.
- API seed: existing recipe/logical payload/entity identity; application API readback and absence cleanup.
- Real worker: versioned job type/input artifact, job/message IDs, non-consuming state observation; queue publish acknowledgement is not completion.
- WireMock: mapping/contract refs and bounded interaction observation; fake-provider mode remains explicit and proves no real shipping/SSO integration.
- Database: migrations/dataset/query refs and typed rows/count/schema observation; seed/reset admitted only for a trusted owned isolated database handle. No production SQL/reset operation exists.
- Pipeline: dbt/GX project/suite/artifact refs and assertion observations; preserve native artifacts rather than treating a command exit as data-quality success.

## Compatibility and review gate

This additive boundary does not rewrite v1 receipts, runner frames, the current capability resolver or fixture lifecycle. Existing HTTP/browser adapters are mapped losslessly and remain operational through their present paths. Unknown versions/extensions fail closed; there is no fallback to a nearest schema. Provider-specific extensions require a namespaced version and an explicitly registered runtime schema; arbitrary bags are rejected.

Before broad integration, independent review must challenge ownership authority, evidence completeness, redaction, stale evidence and lossless mapping, and approve a migration from the current hardcoded runner resolver. Current release PR #19 remains separate. No broad provider integration or production mutation is included here.

## Streaming, MCP and application bridges

Transport input is version/capability pinned: SSE, NDJSON, WebSocket, MCP stdio, MCP Streamable HTTP and app bridge are distinguishable contracts, not a universal implemented transport. A transcript binds connection/stream/request/reconnect-attempt IDs and ordered local events while preserving opaque provider event/resume IDs. Byte chunks reference native artifacts; only an explicitly completed logical message is a message observation. Successful completion, transport close, timeout, partial failure, cancel request and observed cancellation stay distinct. Resume links reference the prior transcript; neither redelivery nor reconnect imports stale assertions into a fresh attempt.

The schema permits version-specific MCP initialization/request/resource/tool/progress/cancel semantics without requiring a legacy initialize exchange for every revision. The host must pin and negotiate the actual peer/SDK revision and features; unsupported cancellation, streaming or bridge semantics fail explicitly. No modern MCP version migration is performed by this slice.

Keep deterministic fakes (WireMock/MSW), sanitized replay, provider sandbox, Inspector/client protocol tests, local ext-apps/widget bridge fixtures and real signed-in ChatGPT/Claude evidence in separate fidelity/evidence classes. No mock, Inspector or local bridge success equals installed-host acceptance. WireMock WebSocket support must be version-qualified rather than assumed stable. Future real-transport conformance must exercise UTF-8/chunk fragmentation, backpressure, cancellation and reconnect in addition to in-process mocks. Parent/span links and request/job/message/entity IDs correlate side effects only when backed by observation; timestamps never establish causality.

## Retry, lifecycle, identity and replay audit

Actual current behavior: `createRerun` preserves frozen case identities while creating a new campaign/client request/idempotency identity and lineage. Redelivery reconciles an existing execution through the exclusive local ledger. Grove recording playback verifies media bytes and does not rerun actions; its Rerun action is a fresh execution path. Native host teardown owns a process group/workspace; startup cleanup acknowledgement and controller/supervisor crash cases already have tests. Distributed recovery, external-provider cleanup, general automatic step retries/backoff/Retry-After and a reusable multi-component teardown journal are not established. Step retry counts are declared in schemas; the current executor does not generally implement that retry policy. Those gaps are not silently repaired by this additive boundary.

New first-slice helpers are pure plans/validation, with no filesystem/provider effects:

- bounded transport/setup retry classification, first-attempt evidence retention, Retry-After and deadline/request/attempt budgets; assertions/cancellation/unsupported operations stop rather than being retried into green. Ambiguous effects require reconciliation; a bare idempotency key is not proof of replay safety. Actual dispatcher integration remains review-gated.
- host-scoped inventory checkpoints distinguish reserved/created/unacknowledged effect/cleanup pending/failed/removed. Partial provisioning and unknown side effects require reconciliation. Cleanup plans preserve every resource, reject cross-run/generation/lease drift and require removal evidence; no global prune/flush exists.
- caseRef.id is the stable logical scenario identity; the complete case ref binds immutable revision bytes. Campaign/execution/attempt IDs remain separate. Display slugs are derived hashes and never lookup authority. Domains remain existing workflow/corpus grouping until a concrete domain identity use case exists; no redundant Domain entity is introduced.
- deterministic sorted artifact manifests use content-hash filenames and closed extensions, excluding user labels/PII from names. This does not claim a universal PII detector for artifact contents; native evidence still needs the declared access/redaction policy.

The conformance cases exercise partial provisioning, interruption between side effect and acknowledgement, failed cleanup, stale/concurrent-run resources, seed/operation plan immutability, first-attempt retention, safe names and recorded-evidence versus new-action identity. They do not simulate those results as real provider executions. Flaky acceptance remains a reporting gap: earlier failures must remain visible, and passing a later retry is not permission to erase the first attempt or claim deterministic behavior.

## Evidence-derived review questions

Parent public-source research supplies design tests, not customer validation:

- [Twenty #6641](https://github.com/twentyhq/twenty/issues/6641): demonstrate reusable isolated modules and useful evidence beyond an existing Playwright trace; preserve separate auth/fixture ownership.
- [Activepieces #15445](https://github.com/activepieces/activepieces/issues/15445): an accepted webhook or queued status must not stand in for an observed run and terminal business output.
- [LibreChat #14096](https://github.com/LibreChat-AI/LibreChat/discussions/14096): retain sanitized, version/path-specific request evidence when UI preflight and configuration behavior disagree.
- [Trigger #4819](https://github.com/triggerdotdev/trigger.dev/issues/4819): single/batch retry identity semantics need provider-specific contracts; a retry does not universally imply a new external run.
- [dlt #4052](https://github.com/dlt-hub/dlt/issues/4052): parallel staging/state retries require unique scoped pipeline resources and interleaving evidence, not only a final count.
- [Data360 #145](https://github.com/worldbank/data360-mcp/issues/145): localhost success cannot qualify deployed host/origin behavior; do not weaken security to make a deployment matrix green.

Before broad integration, an independent reviewer must specifically assess host-owned frozen-operation/resource authority, duplicate/conflicting stream events, evidence-class escalation, raw-versus-normalized mapping loss, control/terminal ordering, retry side effects, incomplete cleanup, and source/binary provenance. No independent review approval is claimed by this draft.

## Explicit limits of this first implementation

The shared envelope separates logical operation ID, per-attempt operation ID, idempotency key and retry lineage. A frozen operation is resolved by the trusted host before admission; changing inputs, phase, seed refs or keys cannot mutate the planned request. Resource handles carry host-owned provisioning-plan and observed-identity refs. Unobserved handles cannot perform ordinary operations, and production/read-only handles cannot mutate.

Replay contracts distinguish evidence playback, fresh-fixture actions, recorded-I/O rerun and workflow-history replay. Seed, generator, fixture, runtime, config and clock refs are pinned together; a seed alone is insufficient. Playback has no target execution/effects. Action reruns require fresh execution/attempt/fixture identities. History/code changes require an explicit compatibility-review reference and a supported provider mode. These are consistency/admission checks, not authority to trust a producer's review reference or an implementation of an engine replay service.

Provider example variants are reviewable typed contracts, not a universal execution DSL and not new members of the executable v1 Step union. No worker/WireMock/database/pipeline/MCP/stream transport is installed or dispatched. The existing HTTP/browser resolver remains unchanged. Native protocol messages are preserved by hash, but peer SDK semantic validation remains a provider obligation; chunk/message consistency is not MCP compliance or installed-host acceptance.

New lifecycle checkpoints and incomplete/committed manifest states do not install a durable acquisition journal or atomic artifact writer. Real adapters must persist reservations before effects, use host-owned CAS/fencing and acknowledged cleanup, and atomically publish a manifest only after verified bytes exist. The pure teardown and retry helpers do not delete, reset or replay anything. Crash/interleaving tests for real provider effects and concurrent filesystem publication remain P0 integration gates; memory/structural conformance is not represented as those actual executions.

The existing failure/cleanup/crash tests and UI replay behavior remain regression gates. Broader flaky-status presentation, all-retry artifacts in UI, real backpressure/ignored-termination behavior, expired-lease recovery and external-provider fencing remain unimplemented. Future integration must not treat this boundary's `admissible` evidence as product PASS: every assessment returns `verificationVerdict: not_evaluated` until the existing trusted assertion reducer evaluates the observations.

Protocol request IDs retain string-versus-safe-integer identity (including numeric zero); opaque provider event IDs retain empty-string reset semantics. Neither is coerced into a filename or a local immutable ID. Operation bindings additionally preserve the existing persona and frozen target refs, avoiding a lossy same-case/different-persona projection. Generated JSON Schemas express structural syntax; Zod refinements and boundary helpers enforce cross-record authority, ordering, mapping and evidence semantics. A JSON-Schema-only check is not full admission or verification.

A typed protocol-message observation preserves native protocol/tool error codes, request identity, progress/cancellation state and app bridge/tool-result/widget state independently of transport completion. It requires the hashed native message artifact; successful receipt of an error message is not a successful tool/business operation. Native peer/SDK validation and actual widget/installed-host behavior remain provider/integration gates.

## Independent implementation review

An independent AI reviewer examined `79e2116c3bf7fc160b6eac5e2d4b829bf26093c8` and reproduced four boundary defects despite the existing 36 conformance cases passing: a different worker job with uncaptured result/terminal references could become admissible; a deterministic contract fake could acquire signed-in-host classification through a broad descriptor; progress/control events escaped native-byte and request correlation checks; and a rerun could label its source fixture as fresh.

Regression fixes bind worker and other typed result identities to the frozen request; require referenced native outputs in complete evidence; pin contract-fake fidelity; read/hash progress/control evidence and enforce request correlation; and reject reused source fixture IDs or duplicate fresh fixture IDs. Host resolution must still establish actual fixture ownership/freshness. This is an independent AI code review, not owner approval or an approval to integrate providers. Durable journals, atomic artifact publication and real-provider crash/interleaving validation remain unfinished.
