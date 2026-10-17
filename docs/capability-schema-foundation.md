# Tracegrove consolidated implementation and release plan — review draft

This is the single progress plan for the work discussed with Hope. Update this document as
scope and evidence change; the linked audit and environment guide are detailed specifications
and receipts, not parallel delivery plans. Changes are already in progress in existing
[foundation PR #21](https://github.com/hopeatina/tracegrove/pull/21), stacked on
[release PR #19](https://github.com/hopeatina/tracegrove/pull/19). Both remain unmerged; #21 remains
draft. No npm release is claimed.

## Verified checkpoint and ownership

Implementation checkpoint: `2a146bfc8be87589b9e536890d600c5230cb34c8`,
[terminal green CI](https://github.com/hopeatina/tracegrove/actions/runs/39072367321).
Runtime/profile source is identical to independently reviewed
`3894ed6e43b32c0177be03397e22df757405ed6c`; subsequent changes clarify documentation and make
the lease-expiry regression deterministic. Local verification: 378 passed, two Python sample
skips, 47 files, 85 schemas, build passed. The 18 portable conformance cases use synthetic host
ports and do not qualify actual environments. Any later commit requires its own exact-head checks.

Release #19 remains at `7fe001f3cb59fdd9a03341d9ecebfe1d9cc8b41a`,
[green CI](https://github.com/hopeatina/tracegrove/actions/runs/39057963180), inspected
`tracegrove@0.3.0` tarball and clean packed-install positive/negative browser smoke. That tarball
does not contain this later draft foundation. Browser prerequisite
[#18](https://github.com/hopeatina/tracegrove/pull/18) remains intentionally draft at
`452c898a11c2d7a061fa71bc57ddabc1945b96e1`; its original GitHub author is `hopeatina`, but no
linked active cloud-task reference was verifiable. Its broader qualification gaps are not waived.
Concurrent [typed-authoring #20](https://github.com/hopeatina/tracegrove/pull/20) at
`d2846b2ccc3a372b737d58abd45afb8595dd5437` is preserved separately. Do not duplicate or merge it
silently, force-push shared work, or bypass draft/review/branch holds.

## Implemented / in progress / planned / blocked

| Area | State | Actual result and remaining boundary |
| --- | --- | --- |
| Agent CLI and small human UI audit | Implemented | First-use, structured run output/exit codes, evidence privacy/provenance, setup friction, desktop/375px Grove and recovery audited in the [release audit](release-audit-2026-10-17.md). Uniform top-level JSON errors, better first-use Next.js launch, accessible UI traversal and hosted client acceptance remain gaps. |
| Native HTTP/Chromium execution | Implemented | Real isolated fixture journeys, DOM/API readback, verified recordings and cleanup; read-only timeout recording defects fixed and concurrent browser-author work reconciled. No general hosted/network-containment qualification. |
| Typed core and domain extensions | Implemented | Additive scoped operations/observations, versioned typed semantics/extensions, native provenance and lossless existing mappings. Worker/contract/database/pipeline examples are contracts, not executable adapters. Existing v1 compiler/executor remains authoritative. |
| Retry, ownership, identity and replay | Implemented | Pure bounded retry/Retry-After, ambiguous-effect reconciliation, teardown inventory, safe artifact naming, logical/run/attempt separation and explicit replay validation. These helpers do not perform provider effects or engine replay. |
| Streams / MCP / app bridges | Implemented | Typed transport/revision/features, chunks versus logical messages, correlation, errors, cancel/disconnect/resume and fidelity classes; negative conformance. Actual SSE/WebSocket/MCP SDK transports, widget bridge and installed signed-in hosts remain unimplemented/unqualified. |
| Environment profile and preflight | Implemented | Reference-only profile/intent schemas, generated alongside/staging examples and bounded SDK metadata probes. Separate persona secrets from execution actor/policy; stale/foreign/unknown/denied requirements fail closed. No general profile-to-CLI dispatch, secret broker or cloud adapter is installed. |
| README-only onboarding | Implemented | One minimal source quickstart, Node/npm prerequisites/bootstrap, doctor/check/test JSON, expected artifacts and cleanup/retry instructions. Independent fresh Linux checkout/toolchain/cache/sample passed in 39 seconds with no source/flow repair; original/copied bundles verified and owned processes/workspaces absent. Final command block is unchanged. |
| Ephemeral-host onboarding artifacts | Implemented, CI gate pending | CI runs the exact README block and a deliberate assertion-failure regression. Both locally and independently passed: original/copied bundles verify, failed CLI exit 1 remains nonpassing, and cleanup is checked. Available failed-run evidence exports before rethrow; absent capture/export failure stays explicit. Final committed-head CI must pass. |
| Ecosystem adapter reuse | Planned | Reuse Playwright, native JUnit output and typed lifecycle ports. Next qualify one async app/store/worker fixture using controlled Compose/Testcontainers where available. OpenAPI-assisted authoring, Playwright/JUnit import, optional OTLP span links, Allure/SARIF views and provider adapters remain proposals. No universal shell/action DSL. |
| Mocks versus real boundaries | Planned | Keep whole-app mock, component fake/WireMock, sanitized recording, sandbox, protocol-client/Inspector, widget fixture and actual installed-host evidence distinct. Fake success never qualifies a real provider, SSO or client. |
| Golden fixture tranche | Planned | Candidates: TodoMVC (4), Cypress Real World App (6), Docker Voting App (4), then FastAPI full-stack/Petclinic if useful. None is golden or run here. Verify license/source/dependency/runtime/image pins, owned seeds/reset, clean baseline, seeded defects, unrelated controls, independent readback and cleanup first. |
| Real environment qualification | Blocked | Hope's Mac is offline; other Codex/Claude clouds, OrgX-triggered runtime and external staging have no qualified runner/broker/access journey here. Discover capabilities; never assume Docker, root, persistent disks, public inbound access or permission to change network policy. |
| Durable safety/recovery integration | Blocked | Durable acquisition journals/CAS/fencing, atomic artifact publication, expired-lease recovery, host network confinement, executable redaction and real-provider crash/interleaving tests remain unfinished integration gates. Pure/schema tests cannot close them. |
| Independent review | Implemented | Independent AI reviews reproduced/fixed four capability defects and one preflight deadline defect; code and README were re-reviewed. This is not named-expert feedback, human owner approval or provider integration approval. The harness failure-retention finding is fixed and independently rechecked on positive and deliberate-failure paths. |
| Npm publication / protected merge | Blocked | Draft prerequisite stack and review/qualification gates remain. Npm publisher authentication/name ownership is unresolved (`ENEEDAUTH`; prior E404 does not prove name entitlement). No credentials or publication attempted; registry integrity/install verification remains unperformed. |

## Actual three-PR OrgX outcomes

Exact base/head commits, acceptance criteria, argv, timings and receipts are in the
[release audit](release-audit-2026-10-17.md#three-real-orgx-pr-trials) and its recovered-host section.

| Real PR trial | Observed host outcome | What it does not prove |
| --- | --- | --- |
| [#3620](https://github.com/hopeatina/orgx/pull/3620), settings UI | HTTP 200, visible Autopilot permissions heading, verified 436507-byte video; 64.550 seconds | No approval/revocation interaction, production persona or complete permissions workflow |
| [#3614](https://github.com/hopeatina/orgx/pull/3614), client/MCP retry contract | Liveness 200, GET on POST-only save-plan route 405, verified bundle; 38.381 seconds | No real Redis idempotency, installed MCP-client exchange or write acceptance |
| [#3645](https://github.com/hopeatina/orgx/pull/3645), receipt workflow | Liveness 200; receipt search 503 workspace_access_unavailable; verified failed bundle; 59.262 seconds | No passing receipt/worker/business workflow; missing offline workspace/store prerequisite remains |

The separate 76 mocked OrgX tests are not host acceptance. Dependency reuse differed from PR
lockfiles. No production/customer mutation, live approval, prohibited database/RLS/HTTP integrity
replay, denied staging retry, paid service/model call, credential transfer or security change is
authorized by these results. Local Docker registry HTTPS was refused; hosted CI Docker samples
passed separately. Preserve all original failed attempts and limits.

## Expert review lenses and prospective pilots

Apply independent architecture/type-system, agent/human onboarding, security/ownership,
distributed recovery/async, protocol/streaming and evidence/data-quality lenses. Challenge actual
authority, source/build closure, normalized-versus-native mapping loss, missing capture, partial
provisioning, retry effects, cancellation, cleanup and replay before broad integration. Existing
AI review is concrete code review; research-derived expert lenses are not expert endorsements.

Parent public-source research suggested Twenty, Activepieces, LibreChat, Trigger.dev, dlt and
Data360 MCP as pain/compatibility references and possible pilot prospects; the linked questions
below preserve those sources. No prospect interview, outreach, access grant, paid commitment,
customer validation or measured customer value is established. Reuse any existing central pilot
owner; do not create competing outreach or imply GitHub issues are customers.

## Execution order and acceptance gates

1. **Close current first-slice checks:** success and available failed-run evidence retention,
   copied-byte verification and the deliberate-failure regression passed local independent review.
   Complete exact-head CI and retain its artifacts; preserve failure/cleanup uncertainty. Keep #21 draft.
2. **Review and wire native onboarding:** reuse the existing compiler/HostPlan resolver for profile
   selection and doctor capability discovery. Scenarios stay shared; each environment resolves
   workspace/build, endpoint, existing secret refs, scoped execution authority and artifact storage.
   Follow the [current-versus-needed matrix and typed templates](portable-environments.md).
3. **Qualify each actual environment:** independently follow only the README from clean setup,
   record manual steps/failures/time, actual positive/negative journey, authorization/capability
   evidence, verified exported artifacts and owned-resource cleanup. Test Mac when available and
   each selected coding/workflow cloud separately. Do not promote a host from schema/fixture tests.
4. **External staging and OrgX-triggered execution:** implement reviewed host/broker integrations
   only with existing access. Distinguish reading a borrowed deployment from provisioning beside
   the runner; never restart/delete a borrowed app or broaden privileges. Denied paths remain held.
5. **Expand reusable ecosystem coverage:** qualify one real async fixture across request, broker,
   worker, durable store and UI with non-consuming observations and observed correlation; add
   provider-specific contracts only where they solve measured onboarding/verification gaps. Keep
   native artifacts and all attempt identities, and exercise partial failure/crash/interleaving.
6. **Release:** reconcile stacked owners/reviews, finish the declared release scope and required
   checks, build/pack/inspect the final merged source and clean-install it. Hope personally completes
   supported npm login/OTP/name confirmation without sharing credentials in chat. Publish through
   the reviewed normal process; then verify actual registry version/integrity and clean registry
   install. Existing source tags and green tests never establish npm publication.

The sections below retain the detailed schema design, provider mappings, research questions and
unfinished recovery gates. They remain part of this consolidated plan.

---

## Capability foundation design

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
