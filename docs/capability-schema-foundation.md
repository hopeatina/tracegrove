# Tracegrove consolidated implementation and release plan

This is the single progress plan for Hope's request. Update it with actual code and evidence; the linked audit and environment guide are specifications/receipts, not parallel plans. Hope authorized normal merges of complete scoped changes and continued implementation. That does not waive unfinished drafts, permissions, required checks or environment qualification. No npm release is claimed.

## Verified checkpoint and ownership

- Default release integration [PR #19](https://github.com/hopeatina/tracegrove/pull/19) merged at `9d7fb9cb4b45744f215722d3e2b520e13c7ad73b`. Reviewed source head `00a3773ebbbced98ee963349bc919df8409fe2c3` [CI succeeded](https://github.com/hopeatina/tracegrove/actions/runs/39074503446). [Post-merge CI39074857291](https://github.com/hopeatina/tracegrove/actions/runs/39074857291) also succeeded. The default squash `833d9e7` and previously integrated authoring `8732932` had identical trees; the history reconciliation discarded no source.
- Atomic export [PR #23](https://github.com/hopeatina/tracegrove/pull/23) merged into the foundation at `ff7ea9867af46831ad52748d063353d64e8a4ca1`; exact 5557336 [CI succeeded](https://github.com/hopeatina/tracegrove/actions/runs/39074599848). Foundation then incorporated default through normal merge `050d4b8485a7615810458816cd6d838b123475b8`, source tree 19549cc471d0fc5e7df7fedfcf76d1fe297e0480, verified identical to the local integration tree.
- [Foundation #21](https://github.com/hopeatina/tracegrove/pull/21) merged normally into default as `871fdd81ef78ff6d73fb4ce4fd626e1952c6ea9e` after exact d3e57bc CI39077004199 succeeded. [Recovery #24](https://github.com/hopeatina/tracegrove/pull/24) at `a6a9e98269f441296df78fcb40572ad831668c52` is independently reviewed; its exact-head CI passed and it merged into the foundation as `5f6ab507ad8801f5822ed95fb56b943f68fb9092`. [Native doctor #25](https://github.com/hopeatina/tracegrove/pull/25) at `80f98b520bfc74889df932b812bec504672526e9` is independently reviewed with 27 focused tests; exact-head CI passed and it merged as `eb445675b9d53331360520481599ab478803a0d6`.
- Existing schema/preflight checkpoint dc4b35b [CI succeeded](https://github.com/hopeatina/tracegrove/actions/runs/39073076577). Local verification: 378 passed/two Python skips, 47 files, 85 schemas/build. The 18 portable conformance cases use synthetic ports and do not qualify actual environments. Later atomic checks 390 passed/two skips; original recovery gate 384 passed/two skips, then 16 focused cleanup/recovery checks and independent 8 fault tests at collision fix. Counts belong to their source checkpoints, not a combined total.
- Combined local integration checkpoint before read-only recovery inspection and TodoMVC, including exact-lock SDK conformance, structured errors and original execution seal: **459 passed, two Python skips, 55 files, 86 schemas; build passed**. Earlier doctor-only integration passed 412/two skips/51 files. These are local verification receipts; each remote combined head still needs its own CI. No full-plan or provider qualification follows from these counts.
- The old `tracegrove@0.3.0` tarball at 7fe001f is historical: 390 allowlisted entries, bounded scan no findings, clean packed-install positive/negative browser smoke. It excludes later UI/foundation/atomic/recovery/doctor changes. Final integrated source must be freshly built, packed, inspected and clean-installed before authorized publication.
- Reviewed prerequisite heads 3–18 are included through #19; their historical PRs may still appear open drafts because their bases are old feature branches. No claim that each PR was separately merged. Five old Actions budget-only failures 4–8 were rerun normally and passed; no billing/security change. Browser #18 head 452c898 remains a historical source checkpoint; its unmet-expectation defect is fixed in #19.
- Concurrent [typed-authoring #20](https://github.com/hopeatina/tracegrove/pull/20) at `d2846b2ccc3a372b737d58abd45afb8595dd5437` and [async-job #22](https://github.com/hopeatina/tracegrove/pull/22) at `bbb382f3e575d7211dd93177e711ac0c671c478d` remain separate drafts. #22 has recent author activity and a reproduced delayed-body worker-readiness race awaiting owner correction; do not duplicate its async fixture or silently merge it.
- Shell Git authentication became unavailable after #23 merged. Existing authorized GitHub connector object/commit/ref actions remain functional; source-tree hashes are checked before normal fast-forward updates. No credentials copied/created, force updates or network bypass.

## Implemented / in progress / planned / blocked

| Area | State | Actual result and remaining boundary |
| --- | --- | --- |
| Agent CLI and small human UI audit | Implemented | First-use, structured run output/exit codes, evidence privacy/provenance, setup friction, desktop/375px Grove and recovery audited in the [release audit](release-audit-2026-10-17.md). Delayed-body duplicate draft/test admission fixed with actual HTTP regressions and independent review in #19. Uniform top-level JSON error envelopes are implemented in a reviewed follow-up; better first-use Next.js launch, accessible UI traversal and hosted client acceptance remain gaps. |
| Native HTTP/Chromium execution | Implemented | Real isolated fixture journeys, DOM/API readback, verified recordings and cleanup; read-only timeout recording defects fixed and concurrent browser-author work reconciled. No general hosted/network-containment qualification. |
| Typed core and domain extensions | Implemented | Additive scoped operations/observations, versioned typed semantics/extensions, native provenance and lossless existing mappings. Worker/contract/database/pipeline examples are contracts, not executable adapters. Existing v1 compiler/executor remains authoritative. |
| Retry, ownership, identity and replay | Implemented | Pure bounded retry/Retry-After, ambiguous-effect reconciliation, teardown inventory, safe artifact naming, logical/run/attempt separation and explicit replay validation. These helpers do not perform provider effects or engine replay. |
| Streams / MCP / app bridges | Contracts and local SDK fixture implemented | Typed transport/revision/features, chunks versus logical messages, correlation, errors, cancel/disconnect/resume and fidelity classes; negative conformance. Official SDK 1.31.0 local stdio conformance through local `2d35af0` has 13 tests with actual owned SDK processes/native wire capture, including five startup/limit regressions; independent review closed early-failure evidence loss. It is protocol_client/not_evaluated, not product dispatch or OrgX/installed-host acceptance. SSE/WebSocket, remaining transport faults, widget bridge and signed-in hosts remain unqualified. |
| Structured CLI errors | Implemented | Strict tracegrove.cli-error/v1, controlled reason/recovery vocabulary and existing exit codes, bounded reasons/omission count; no arbitrary candidate diagnostics in new envelopes. Doctor reports, completed run/test outputs, explicit-false prose and JSONL remain compatible.16 new cases plus independent 43 focused cases; one old JSON-error assertion updated with immutable-output/privacy/prose checks retained. Exact-head CI39076314132 passed; #27 merged as `613712c75b608ef03b8b4360ce79ad494c59053c`. This does not redact existing doctor/success/artifact contents. |
| Native doctor discovery | Implemented | Authoring --dir/default nested discovery through the existing compiler/planner, source/runtime/HostPlan provenance and dependency metadata, doctor-scoped structured errors.27 focused tests and independent review pass; no app launch or runs in actual built smoke. Derived corpus files/version probes are explicit; no app/profile readiness claim. |
| Environment profile and preflight | Implemented | Reference-only profile/intent schemas, generated alongside/staging examples and bounded SDK metadata probes. Separate persona secrets from execution actor/policy; stale/foreign/unknown/denied requirements fail closed. No general profile-to-CLI dispatch, secret broker or cloud adapter is installed. |
| README-only onboarding | Implemented | One minimal source quickstart, Node/npm prerequisites/bootstrap, doctor/check/test JSON, expected artifacts and cleanup/retry instructions. Independent fresh Linux checkout/toolchain/cache/sample passed in 39 seconds with no source/flow repair; original/copied bundles verified and owned processes/workspaces absent. Final command block is unchanged. |
| Ephemeral-host onboarding artifacts | Implemented | CI runs the exact README block and a deliberate assertion-failure regression. Both locally and independently passed: original/copied bundles verify, failed CLI exit 1 remains nonpassing, and cleanup is checked. Available failed-run evidence exports before rethrow; absent capture/export failure stays explicit. Exact checkpoint CI passed and retained the positive/negative artifacts. |
| Ecosystem adapter reuse | Planned | Reuse Playwright, native JUnit output and typed lifecycle ports. Next qualify one async app/store/worker fixture using controlled Compose/Testcontainers where available. OpenAPI-assisted authoring, Playwright/JUnit import, optional OTLP span links, Allure/SARIF views and provider adapters remain proposals. No universal shell/action DSL. |
| Mocks versus real boundaries | Planned | Keep whole-app mock, component fake/WireMock, sanitized recording, sandbox, protocol-client/Inspector, widget fixture and actual installed-host evidence distinct. Fake success never qualifies a real provider, SSO or client. |
| Golden fixture tranche | In progress / partly blocked | TodoMVC (4) has actual development campaigns and retained failures, but its final reviewed-source campaign and CI are pending. Cypress Real World App (6), Docker Voting App (4), then FastAPI full-stack/Petclinic remain candidates. The [source-pinned Voting App assessment](voting-app-assessment.md) records actual execution blocked on missing Redis/Postgres/Python/.NET images; only the Node image is cached, and prior registry denial is not retried. Verify license/source/dependency/runtime/image pins, owned seeds/reset, clean baseline, seeded defects, unrelated controls, independent readback and cleanup first. |
| Real environment qualification | Blocked | Hope's Mac is offline; other Codex/Claude clouds, OrgX-triggered runtime and external staging have no qualified runner/broker/access journey here. Discover capabilities; never assume Docker, root, persistent disks, public inbound access or permission to change network policy. |
| Original bundle commit/readback | Implemented | Original payloads and directory entries persist before complete candidate reduction and exclusive manifest-last commit. Fully verified committed readback binds trusted ledger request/selection/receipt refs, scope, attempt and generation; recovers after pre-finalization controller death without another acquisition and replaces blind cached summaries. Independent 18 focused tests include real SIGKILL, sync-fault and missing/corrupt/foreign/unknown-inventory negatives. Exact-head CI39076462309 passed; #28 merged into the foundation as `ba307ccd91e5e7e005e3832dad253a0d4fcd83c1`. Physical power loss, hostile-parent races and distributed/provider recovery remain unqualified. |
| Atomic verified local export | Implemented | CLI export and authoring test publish one verified snapshot through private staging and an exclusive cooperating-writer lock, fsync files/ancestors and atomically rename; immutable object writes use exclusive links. Independent review closed parent-durability and preexisting-symlink findings. Local 390 passed/two skips,85 schemas; actual concurrent-process and writer-SIGKILL tests; exact-head CI passed and #23 merged into foundation. Original execution-directory durability is covered by the separate bounded commit/readback milestone; power-loss and distributed/provider publication remain unqualified. |
| Durable safety/recovery integration | Local gate implemented; broader recovery planned | Existing-ledger host/fixture intent, observed ownership and cleanup records plus unresolved-interruption replay gate implemented in an isolated reviewed milestone; real native/HTTP-create lost-ack SIGKILL tests pass. Independent review reproduced a host/fixture cleanup-key collision; typed acknowledgements fix it and actual native collision regressions passed. #24 passed exact-head CI and merged into the foundation. No automatic janitor/discharge or durable supervisor acknowledgement. Expired leases, distributed fencing, host network confinement, executable redaction and real-provider recovery remain open. |
| Read-only local recovery inspection | Implemented, CI gate pending | `recovery-status --state-dir <dir> --execution <id> --json` uses a bounded stable journal snapshot without opening the writer or changing state. Static guidance, recorded resource counts and fully verified historical bundle binding never grant admission or cleanup authority. Independent43 focused tests across4 files pass; author typecheck/build and87-schema export pass. The guide ships in the package. Automatic discharge, physical absence and hostile-parent confinement remain unqualified. |
| Independent review | Implemented | Independent AI reviews reproduced/fixed four capability defects and one preflight deadline defect; code and README were re-reviewed. This is not named-expert feedback, human owner approval or provider integration approval. The harness failure-retention finding is fixed and independently rechecked on positive and deliberate-failure paths. |
| Npm publication / protected merge | Partly implemented / blocked |#19 merged normally and #23 merged into the foundation. Local recovery, doctor, SDK and structured-error milestones merged into the foundation; the final foundation check passed and #21 merged. Later complete milestones retain their own review and CI gates. Npm publisher authentication/name ownership is unresolved (22:51 UTC registry E404 and whoami ENEEDAUTH; E404 does not prove name entitlement). No credentials or publication attempted; registry integrity/install verification remains unperformed. |

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

1. **Close the bounded local foundation milestone:** #19 and #23–27 merged after review and exact-head checks. #28 passed exact-head CI and merged into the foundation. Final combined #21 CI39077004199 passed and the PR merged as `871fdd81ef78ff6d73fb4ce4fd626e1952c6ea9e`. Its acceptance scope is additive contracts/preflight plus the implemented native doctor, structured errors, local ownership interruption gate, atomic bundles and test-only actual SDK conformance. Independent review and real local crash/interleaving checks cover these paths. Provider dispatch, automatic recovery, redaction, confinement and external host qualification remain separate full-plan gates; merging this complete local milestone does not enable or qualify them. TodoMVC is a separately reviewed fixture milestone. Subsequent scoped milestones require current independent review and exact-head CI before normal merge; none waives the remaining full-plan gates.
2. **Wire native onboarding:** native doctor discovery is implemented, reviewed and integrated in the foundation. Full portable profile selection/dispatch still requires authoritative adapters; reuse the existing compiler/HostPlan resolver. Scenarios stay shared; each environment resolves
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

Independent review challenged ownership authority, evidence completeness, stale evidence and lossless mapping for the additive local milestone; the findings and fixes are recorded below. Release #19 is merged. A future migration from the current resolver, executable redaction or any provider dispatcher requires its own independent review and actual environment qualification. No broad provider integration or production mutation is included here.

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

Before broad integration, an independent reviewer must specifically assess host-owned frozen-operation/resource authority, duplicate/conflicting stream events, evidence-class escalation, raw-versus-normalized mapping loss, control/terminal ordering, retry side effects, incomplete cleanup, and source/binary provenance. The completed independent AI reviews cover the bounded local implementations and recorded fixes; they do not approve future provider integration or substitute for host qualification.

## Explicit limits of this first implementation

The shared envelope separates logical operation ID, per-attempt operation ID, idempotency key and retry lineage. A frozen operation is resolved by the trusted host before admission; changing inputs, phase, seed refs or keys cannot mutate the planned request. Resource handles carry host-owned provisioning-plan and observed-identity refs. Unobserved handles cannot perform ordinary operations, and production/read-only handles cannot mutate.

Replay contracts distinguish evidence playback, fresh-fixture actions, recorded-I/O rerun and workflow-history replay. Seed, generator, fixture, runtime, config and clock refs are pinned together; a seed alone is insufficient. Playback has no target execution/effects. Action reruns require fresh execution/attempt/fixture identities. History/code changes require an explicit compatibility-review reference and a supported provider mode. These are consistency/admission checks, not authority to trust a producer's review reference or an implementation of an engine replay service.

Provider example variants are reviewable typed contracts, not a universal execution DSL and not new members of the executable v1 Step union. No product worker/WireMock/database/pipeline/MCP/stream adapter is installed or dispatched. The existing HTTP/browser resolver remains unchanged. Native protocol messages are preserved by hash, but test-only local SDK semantic conformance is recorded above, while arbitrary peer validation remains a provider obligation; chunk/message consistency is not MCP compliance or installed-host acceptance.

The original pure lifecycle checkpoint schemas did not install a durable acquisition journal or atomic artifact writer. Follow-up #23 implements owned local atomic export; #24 adds the existing-ledger interruption gate, with the remaining boundaries recorded above. These do not establish distributed/provider recovery. Real adapters must persist reservations before effects, use host-owned CAS/fencing and acknowledged cleanup, and atomically publish a manifest only after verified bytes exist. The pure teardown and retry helpers do not delete, reset or replay anything. Actual local concurrent-publisher, writer-SIGKILL, native-host and HTTP-fixture lost-ack crash tests now cover these bounded implementations. Real provider effects, power loss, distributed fencing and automatic discharge remain P0 gates before those future capabilities are enabled; memory/structural conformance is not represented as those actual executions.

The existing failure/cleanup/crash tests and UI replay behavior remain regression gates. Broader flaky-status presentation, all-retry artifacts in UI, real backpressure/ignored-termination behavior, expired-lease recovery and external-provider fencing remain unimplemented. Future integration must not treat this boundary's `admissible` evidence as product PASS: every assessment returns `verificationVerdict: not_evaluated` until the existing trusted assertion reducer evaluates the observations.

Protocol request IDs retain string-versus-safe-integer identity (including numeric zero); opaque provider event IDs retain empty-string reset semantics. Neither is coerced into a filename or a local immutable ID. Operation bindings additionally preserve the existing persona and frozen target refs, avoiding a lossy same-case/different-persona projection. Generated JSON Schemas express structural syntax; Zod refinements and boundary helpers enforce cross-record authority, ordering, mapping and evidence semantics. A JSON-Schema-only check is not full admission or verification.

A typed protocol-message observation preserves native protocol/tool error codes, request identity, progress/cancellation state and app bridge/tool-result/widget state independently of transport completion. It requires the hashed native message artifact; successful receipt of an error message is not a successful tool/business operation. Native peer/SDK validation and actual widget/installed-host behavior remain provider/integration gates.

## Independent implementation review

An independent AI reviewer examined `79e2116c3bf7fc160b6eac5e2d4b829bf26093c8` and reproduced four boundary defects despite the existing 36 conformance cases passing: a different worker job with uncaptured result/terminal references could become admissible; a deterministic contract fake could acquire signed-in-host classification through a broad descriptor; progress/control events escaped native-byte and request correlation checks; and a rerun could label its source fixture as fresh.

Regression fixes bind worker and other typed result identities to the frozen request; require referenced native outputs in complete evidence; pin contract-fake fidelity; read/hash progress/control evidence and enforce request correlation; and reject reused source fixture IDs or duplicate fresh fixture IDs. Host resolution must still establish actual fixture ownership/freshness. This is an independent AI code review, not owner approval or an approval to integrate providers. Local atomic export #23 is implemented and reviewed; durable interruption gating #24 is independently reviewed. Automatic/provider/distributed recovery and real-provider crash/interleaving qualification remain unfinished.
