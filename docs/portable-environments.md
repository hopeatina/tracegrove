# Portable environment setup — experimental foundation

Use the README's single first-run quickstart before adapting your app. This document defines a
profile/admission boundary; it does not install another runner. The executable scenario remains
the existing case/flow with its assertions, fixtures and personas. A separate execution profile
selects where and under what authority that same scenario runs. A host brand or a placement enum
is not a supported capability.

## Current versus needed configuration

| Concern | Current executable CLI | New reusable contract / remaining integration |
| --- | --- | --- |
| Scenario versus placement | Short authoring config combines app setup and personas; low-level corpus separates cases, profiles, EnvironmentPlan and HostPlan | Reference-only PortableEnvironmentProfile plus per-attempt intent; profile never embeds scenario steps. Selection/compiler/CLI integration remains gated. |
| Workspace / source / build | Native launch hashes selected source files and observes the interpreter; Git resolver freezes exact base/head | Host-resolved workspace, immutable source-selection/build/config refs. Verify actual installed dependency/build closure; a launch-file hash is not a complete installed closure. |
| Start app alongside runner | Node, FastAPI and Django native process hosts, fresh directory/port, GET readiness; command wrapper blocked | Reuse frozen host/launch/dependency plan refs. Discover process/runtime/loopback/filesystem capabilities. No arbitrary shell execution DSL. |
| Existing hosted staging | Declared origins and environment classes exist; general authenticated external-host execution is not wired | Resolve exact deployment and endpoint, confirm authorized access and identity, then read readiness. Never restart or tear down a borrowed deployment. Not qualified here. |
| Endpoints | Native host reports/reserves loopback port; browser and HTTP use that observed origin | Host endpoint resolver refs distinguish owned launch, service discovery and external deployment. No embedded credential-bearing URLs, tunnels or assumed inbound access. |
| Browser / dependencies | Chromium driver; explicit Playwright binary/system libraries. Python environments separate. Docker sample harness exists | Required versioned capabilities and pinned dependency plans; unsupported/missing features block. No automatic Docker, services, root, persistent-volume or browser-library assumption. |
| Network | Browser/API effect envelopes constrain adapter actions; arbitrary launched app egress is not proven confined | Host-enforced policy ref, explicit allowed endpoints, inbound none/loopback. Current native host cannot attest full network containment; a strict profile must remain blocked there. No policy changes or gateway bypass. |
| Application persona | Sample host issues attempt-local synthetic bearer tokens; adapters consume in-memory credentials | personaRef + secretRef, resolved by that environment's authorized broker. No values in scenarios/profiles/artifacts. Declaring the ref grants no access. |
| Execution authority | Current local process runs with the environment's existing OS/sandbox permissions | Independent execution actor, policy ref and optional execution secret refs. App personas cannot grant workspace/service/admin authority. Host must validate scope/lease/operation permission. |
| Synthetic data / reset | API fixture create/readback/reverse cleanup; isolated sample data dirs | Versioned seed/generator/namespace/reset/resource policy refs. Reset only host-resolved owned isolated resources; no production reset, global prune or database integrity replay. General DB/service provisioning is not installed. |
| Artifacts / redaction | Local verified bundles, JSON/Markdown/JUnit, WebM and media integrity. Raw bodies/video can be private | Destination/durability/retention/redaction policy/size bound. Ephemeral hosts must prove authorized export before completion; executable redaction and general destination adapters remain unfinished. |
| Resource/time/spend | Existing request/action deadlines and budgets; native/Docker enforcement differs; draft provider caps differ | Explicit wall/cleanup reserve, CPU/memory/disk/request/browser/provider/agent/spend limits. Host must prove enforceability, including zero calls/spend. A number in YAML is not enforced accounting. |
| Ownership / cleanup | Scoped process/data/fixture inventory, acknowledged stop, unresolved cleanup retained | Lease/cleanup policy refs and per-attempt bindings; acquired resources only. Durable acquisition CAS/fencing, atomic artifacts, expired-lease recovery and real-provider crash/interleaving remain integration gates. |
| Replay | Verify/play existing evidence; `test` creates fresh actions; low-level rerun preserves lineage | Explicit fresh execution, evidence playback, fresh-fixture, recorded-I/O or history mode; host-supported replay plan required. Source fixture reuse is rejected by the existing lifecycle validator. No replay engine installed. |
| Agent output / onboarding | check/doctor/test JSON and exit codes; doctor discovers authoring projects and reports native compiled-plan provenance, dependencies and structured errors. Other top-level errors sometimes prose | SDK preflight returns typed checks, omissions, stable errors and recovery; ready is execution not started and verification not evaluated. It is not an admission token. Portable profile dispatch remains gated. |

## Reference-only profiles

Generated, schema-validated examples:

- [App alongside runner](examples/portable-environments/alongside_runner.json)
- [Existing staging](examples/portable-environments/external_staging.json)

Every `example.*` ref is an unresolved placeholder, including its illustrative digest. Neither
file registers a host, authorizes a target or can be passed to the current CLI config loader.
The source is `src/authoring/environmentTemplates.ts`; `node --import tsx
scripts/export-environment-examples.ts` regenerates them. Tests compare generated bytes/records
and parse them through the same Zod schemas exported to JSON Schema. Do not maintain another
handwritten environment DSL or copy credentials into these files.

Recommended setup is one shared scenario tree plus one small profile selection per environment:
`mac-local`, `coding-cloud-local`, `workflow-cloud`, and separately `authorized-staging`. Each
selection resolves the same logical source/build/configuration refs to that host's workspace and
resolves credential refs in that host. These names are recommendations, not installed adapters.
Start with the native no-service API sample, then Chromium, then OrgX with its isolated dependency
and fixture prerequisites; qualify each stage before enabling it in onboarding.

For application credentials, have the environment's existing broker bind a logical secret ref
to the intended test persona under an attempt-scoped lease. For execution permissions, separately
bind the execution actor to an existing policy and any required execution credential refs. The
preflight interface checks access metadata without fetching or returning secret values. Actual
dispatch must obtain an in-memory handle from that broker and erase/revoke it at teardown. No
universal environment-variable/token export, copied browser session, persistent credential setup
or transfer between Mac/Codex/Claude/OrgX environments is implemented or authorized.

The optional non-secret configuration ref is also host-resolved: its resolver must reject secret
values and must not evaluate arbitrary project code during preflight. Existing `app.env` is
serialized into frozen inputs; use it only for non-secret test configuration. Hashes/ref names are
not an automatic secret detector or evidence-content redactor.

## Read-only SDK preflight

`preflightPortableEnvironment(intent, ports, {signal, timeoutMs})` resolves a self-digested frozen
profile, validates scope and requested replay mode, and invokes bounded trusted read-only probes.
Each observation binds the exact profile, execution/attempt/generation, actor and request digest,
has an observed/expiry time and references host evidence. Unknown/stale/unsupported required
capabilities block. Optional omissions remain visible. Authorization is checked before target or
secret metadata. Errors returned by a port are never serialized into the report.

The host probes inspect launch/readiness capability and existing target metadata. Preflight never
starts a server, changes permissions, installs dependencies, issues credentials, creates fixtures,
resets data, creates tunnels or performs cleanup. Actual post-launch readiness, identity, actions,
artifact byte verification and cleanup need their own execution receipts. Ready preflight reports
must be re-admitted under a live lease before effects; they are not reusable permission tokens.

Examples of actionable machine output:

| Code | Meaning / recovery |
| --- | --- |
| `capability_missing` | Install through an already authorized dependency path or choose a provisioned host; do not assume Docker/root. |
| `persona_credential_missing` | Bind the existing logical secret reference in this host's broker. Never paste the value into a scenario. |
| `authorization_denied` | Stop before target/secret probing; obtain owner review or select an already authorized target. Do not change permissions automatically. |
| `network_unknown` | No observed enforcement for this policy; select a host/policy with proof, preserving current restrictions. |
| `artifacts_missing` | Select an authorized exportable destination before an ephemeral host run. |
| `probe_binding_mismatch` | Reject stale/cross-run, wrong actor or wrong request evidence; collect a fresh scoped observation. |
| `preflight_deadline` / `preflight_cancelled` | Stop bounded probes; preserve the blocked report. No execution started. |

The report uses `status: ready|blocked`, `exitCode: 0|2`, `checks[]` with request/state/required/
evidenceRefs/code/recovery, `errors[]`, `execution: not_started` and
`verificationVerdict: not_evaluated`. CLI `doctor --dir <project> --json` discovers an authoring
config and reuses the existing compiler and planner; low-level `--config`/`--profile` remain
supported. Its separate `tracegrove.doctor/v1` report includes selected host/corpus refs,
source/runtime digests, dependency checks and recovery actions. Compilation writes derived
files and interpreter version probes may run; the app never starts. Required Chromium executable
presence is installation metadata, not a tested engine or environment qualification. No portable
profile execution flag is advertised.

## Environment acceptance and rollout

1. **This slice:** frozen reference-only schemas/templates, bounded SDK probes, negative
   conformance and README first-use checks. Synthetic probe tests establish contract behavior,
   not host support. Independent review must challenge secret/actor separation, stale observations,
   ignored cancellation, scope, startup-versus-staging and security/spend enforcement claims.
2. **Native selection/onboarding:** doctor now resolves the existing native authoring/HostPlan
   selection and reports source/runtime/dependency inspection. General portable profile dispatch
   and host-specific missing-ref recovery remain gated; no silent policy downgrade. Repeat the clean API/browser
   first run independently on each actual machine. Mac remains unqualified while offline.
3. **External staging:** install a reviewed read-only external-host adapter and existing secret
   broker integration. Prove deployment/endpoint identity and authorized test-persona access;
   fixtures require separately scoped owned synthetic-resource authority. No denied staging retry
   is part of this work. Do not infer support from local notes or Inspector/mock tests.
4. **OrgX-triggered/workflow cloud:** bind an actual authorized runner/workspace/lease, discover
   capabilities and enforce budgets/export/cleanup. Reuse existing dispatch ownership; a task
   record is not a running verifier. Add real interruption/interleaving recovery before broader
   resource/provider integration; keep journals/atomic-publication gates open until tested.

For every claimed environment retain: clean dependency/runtime install, exact tool/source/build
and profile pins; setup elapsed time and manual steps (including failures); fresh capability and
authorization observations; the actual API/browser/client journey with positive/negative
assertions; verified artifacts exported before ephemeral storage expires; owned-resource cleanup
readback; and measured cost or explicitly unmeasured infrastructure cost. Preserve failed attempts
and distinguish preflight, execution, verification and business acceptance. No environment becomes
supported from templates, schemas, host brand, CI color or prose alone.

Current evidence is limited to this Codex Linux cloud's isolated native/API/browser fixtures and
the hosted Linux sample CI lanes already linked in the release audit. Actual OrgX #3620 proved a
settings heading, #3614 a method boundary, and #3645 failed receipt lookup with unavailable offline
workspace/store. None proves full OrgX workflow/client acceptance. Local Docker registry HTTPS
was refused; hosted CI's Docker success is separate evidence. Claude coding cloud, Hope's Mac,
OrgX-triggered runtime and authenticated external staging remain unqualified.

## Recorded clean-room onboarding

An independent AI reviewer followed only the README at source
`3894ed6e43b32c0177be03397e22df757405ed6c` in a fresh Linux x86_64 checkout, with a new toolchain,
dependency tree, cache and sample. Default Node 24.19.0/npm 11.9.0 required the documented optional
bootstrap to Node 22.23.3/npm 10.9.9. The reviewer preserved PATH/cache across stateless shell
calls; the README now explicitly recommends one shell session. No source/flow repair or
undocumented install was needed. Observed setup through bundle verification took 39 seconds,
including README inspection and orchestration; it is not a benchmark or measured infrastructure cost.

Doctor/check, both real notes scenarios, independent API readbacks, stranger 403/empty-list,
anonymous 401 and deletion 404 assertions passed. Original and copied evidence bundles verified
with two receipts and no problems. Fixture/process/workspace cleanup was confirmed, with independent
readback finding both owned process entries and workspaces absent. The private receipt and run are
retained in the saved cloud environment under `/workspace/tracegrove-readme-review-3894ed6/`;
they are not shipped in npm. One stale “any command” table claim was corrected after review.
The canonical executed quickstart is unchanged by that documentation correction.

The automated README journey separately passed using the existing build/dependencies. Its first
harness run misread the receipt's `critical` IDs as errors; the corrected harness requires all
attempted and critical IDs to be confirmed. That initial harness failure receipt is preserved.
Neither run exercises portable-profile dispatch, a browser, another cloud, Mac, authenticated
staging or an npm registry installation. Those environment acceptance gates remain open.
