# Tracegrove release and usability audit — 2026-10-17

## State and claim boundary

Inspected private `hopeatina/tracegrove` through GitHub and a fresh cloud checkout. The default branch is `codex/bootstrap`; `main` does not exist. PR #1 is merged. Open implementation PRs are #3–13 and #15–18, stacked through `codex/browser-driver`. No independent active owner was verified; this work preserves those branches and uses `codex/release-audit-20261017` on PR #18 head `a9bc3869533255cb6cb175c838149ac27bb0841b` (base `71ac22e84a0f4e03541426b4843135caa112f9da`).

[CI 39051921446](https://github.com/hopeatina/tracegrove/actions/runs/39051921446/job/117452073855) actually checked merge `8cbc2dca0004be13e0512a3912691e11c138ea98`: 316 tests passed, one unchanged-page recording test failed with `video_final_frame_unavailable`. The later missing container artifact was secondary: the container lane never ran.

This audit does **not** claim three authenticated OrgX workflow passes. Three actual PRs were selected, their immutable source frozen, onboarding attempted, and focused local tests executed. Their host replay remains blocked. No customer data, production mutation, live approval, database/RLS/HTTP integrity validation, paid inference, or provider configuration was used.

## First use and agent CLI

Actual clean-install journey: Node 22.23.3 → `npm install <packed archive>` in a fresh prefix/cache → installed `tracegrove --help` → `sample-config --sample notes-browser --output <empty directory>` → `test --config <generated config> --grep notes.browser --json` → `ui --dir <sample>`.

The successful browser flow launched a real isolated notes app, used an issued persona bearer, read the DOM, independently read the API, cleaned its fixture/host, recorded WebM and verified its saved bundle. It took 2.437 seconds between report timestamps; the case reported 952 ms. These are local elapsed measurements, not a performance benchmark. No inference cost was incurred; infrastructure cost was not measured.

Strengths:

- Short config/flow/fixture authoring compiles to the existing frozen corpus. `test` performs planning, execution, reporting and bundle verification.
- JSON run reports include a schema version, outcome, exit code, source digest, execution ID, timestamps, cases/steps, observed text, verified-bundle flag, video digest and byte count. Markdown/JSON/JUnit and a latest run pointer are discoverable.
- Exit contract: 0 passed; 1 assertion failure; 2 blocked/inconclusive; 3 infrastructure failure; 4 cancelled. Successful `source-resolve` and `check` establish their own operation, not a product PASS.
- Unknown options fail before admission; owner/action fields explain recovery. `check --dir` surfaces `command_adapter_unqualified` without starting the product.
- Browser errors deliberately avoid raw Playwright diagnostics; network metadata omits headers and query strings. Credentials are not expanded into browser commands.

Friction and gaps:

1. **Next.js/real OrgX launch is unsupported through first-use detection.** `init` detects a package start script and writes `adapter: command; run: npm start`; `check` then blocks it because shell wrappers cannot establish application-runtime identity. Generic “use node/fastapi/django” recovery does not supply a working Next.js adapter. External URL/login-recipe admission and MCP stdio are not implemented.
2. **Error output is not uniformly machine readable.** `test --json` returns structured completed runs, but top-level argument/prerequisite errors still go to stderr as prose and can leave stdout empty. Agents need to parse exit status plus stderr. The blanket help claim about `--config` was wrong for `check`; it now names which commands use `--config` and which use `--dir`.
3. **Setup is not one install.** Node is constrained to `>=22.22.0 <23`; the cloud default was Node 24. Chromium and Linux libraries require explicit installation. Python/Django environments are separate. No missing-browser automatic repair was demonstrated. Sample output directories must be empty.
4. **Drafting requires installed/authenticated Claude Code or Codex.** Detection/settings exist; no paid model calls or auth availability were tested. Codex spend ceilings fail closed when its adapter cannot enforce them.
5. **Raw evidence needs policy.** Browser recordings, DOM text, response bodies, frozen inputs and source payloads may contain private application data. Header/query filtering is not video/DOM redaction. Required trace and executable redaction policies remain blocked. Retention/access and trusted issuer admission remain operator obligations; portable hash consistency does not attest production identity.
6. Git source closure verification took 23–37 seconds per OrgX PR in this environment (separate from app tests). It checks the selected tree closure using individual object reads. Report this setup cost rather than describing it as instant discovery.

## Small human UI

The installed Grove UI was exercised in Chromium at 1280px and 375px. Both document widths matched the viewport. The scenario tree, expected/observed pane, counts, independent API readback, verified-bundle banner and receipt-bound recording were visible. Screenshots and DOM summaries are retained under ignored `artifacts/qa/release-audit/`.

The surface is small: Run, Discover, History, Settings; a scenario tree; one step detail panel. “Held” wording differs from CLI “passed” and may slow first use. The successful filtered run correctly labels two other scenarios NOT RUN and counts only 1/1; preserve that distinction. Mobile puts the recording well below the tree, so a compact jump-to-recording/failure would help. No screen-reader audit, broad keyboard traversal, hosted login or client workflow completion is claimed by these captures.

## Three real OrgX PR trials

All PR refs were fetched into an independent shared-object clone and detached worktrees; the mounted OrgX checkout was unchanged. Each trial ran the compiled CLI with a private local scope and exact Git base/head, then `init --dir`, `check --dir --json` and `test --config ... --json`. Source resolutions contain complete diff/blob payloads, so the raw artifacts remain local/private. Receipts record actual argv, exit codes, elapsed seconds and stdout/stderr hashes.

| PR / reason | Exact base | Exact head | Observed result |
|---|---|---|---|
| [#3620](https://github.com/hopeatina/orgx/pull/3620), settings UI and owner acknowledgement | `b3257e9858c105a032d5e33a941bf45784056969` | `a08e9968330f8499cec76b7af1fcd2822a46db81` | source resolution 0, 20 changed files, 28.292s; init 0; check/test 2, `command_adapter_unqualified`; local component tests 3 passed after explicitly selecting jsdom |
| [#3614](https://github.com/hopeatina/orgx/pull/3614), client/MCP write retry contract | `57a811485aafb8c1ebf5f088245b32194019f5fe` | `8d66b1694e5ffc888abb919894de457490237a43` | source resolution 0, 25 changed files, 36.826s; init 0; check/test 2, same launch blocker; 53 local route/idempotency tests passed |
| [#3645](https://github.com/hopeatina/orgx/pull/3645), run brief → receipt → work-memory workflow | `61ac393e3813954ea48cb0ed53eefda0ffd0e6f4` | `e374c101765e05ab1a54ba569b1f8f786c2317f5` | source resolution 0, 22 changed files, 22.996s; init 0; check/test 2, same launch blocker; 20 local briefing/receipt/link tests passed |

Acceptance criteria and local checks:

- #3620: permission loading never approves; acknowledgement plus explicit click gates the mocked action; configuration files a pending request; failed revocation remains visibly unconfirmed. Command: `node node_modules/vitest/vitest.mjs run tests/settings/autopilotPermissions.spec.tsx --environment jsdom --maxWorkers=2 --no-file-parallelism`. No real authorization was activated.
- #3614: same normalized key/request replays; changed request conflicts; owner/workspace/auth boundaries remain enforced; retryable errors are not made durable success. Command: `node node_modules/vitest/vitest.mjs run tests/writeRoute.idempotency.spec.ts tests/api.v1.mcp-plan-operations.spec.ts --maxWorkers=2 --no-file-parallelism`.
- #3645: briefing kill switch works; conforming receipt reaches the observation path; malformed/missing receipt is skipped; memory bookkeeping failure does not fail a completed run; missing suggestions do not perform unnecessary lookups. Command: `node node_modules/vitest/vitest.mjs run lib/server/consoleWorker/runContextPack.spec.ts lib/server/runCompletion/receiptObservation.spec.ts lib/server/sessions/pendingLinkSuggestions.spec.ts tests/runCompletionReceiptWriteback.spec.ts --maxWorkers=2 --no-file-parallelism`.

Limits: these focused tests use repository mocks, including in-memory Supabase and mocked UI API calls. The mounted dependency tree uses Vitest 3.1.3; #3620's newer project configuration initially ran without a DOM, so all three UI tests failed `document is not defined`. That failed attempt is retained; explicitly selecting jsdom then passed. This was not a clean frozen OrgX dependency installation. No PR-specific authenticated server/browser recording, real Redis replay, database state, worker execution, MCP transport or third-party integration was established. Local notes recordings are sample evidence, not recordings of these OrgX hosts.

Source resolution self-digests:

- #3620 `41292bbe58831b09ed79e912b9a7558e577a563888734a085b3f70743a6f0837`
- #3614 `4c580a92e34fa2d65126ef20df046eb2ca87aa672126165138e2187f16d4567e`
- #3645 `49dc8c4ffdeca41d59fe9d261aa1472d369e074a453599328a708509cba3f274`

## Existing fixtures, assertions and container support

Actual `src/samples` directories: `notes-api`, `notes-browser`, `fastapi-notes`, `notes-django`, `django-notes`. These are notes variants, not five independently broad application families. Native process and mock hosts exist; surface adapters are HTTP and Chromium. Persona/fixture setup, foreign-principal denial, independent readback, reverse cleanup and file persistence are exercised. Predicates include status, JSON-path values, absence and boolean combinations; browser observations expose visible bounded text/URL. Polling consumes action/time budgets. Physical mobile, widgets, native apps and MCP stdio are absent.

`containers/Dockerfile` and `scripts/container-conformance.mjs` run the verifier plus native app in one fixed container. The harness pins its base image, uses `--network none`, read-only root, dropped capabilities, no-new-privileges, explicit CPU/memory/PID/tmp limits and a narrow evidence bind. It verifies the saved bundle outside the container and reads back removal of its labelled container. This is not a Docker execution host adapter, Compose discovery, dependency inspection, customer image admission, network containment proof for arbitrary apps, or general Docker introspection. No Docker socket mount or privileged container is required. Current cloud Docker 28.4.0 was reachable. Initial builds could not write the default read-only Docker config path. A retry used a fresh temporary config without copying credentials; the pinned image build then failed at `npm ci --ignore-scripts` with npm “Exit handler never called!” after about 158 seconds. No runtime lane started. The duplicate offline build was stopped after the shared build prerequisite failed; neither lane is qualified. Blocked receipts retain removal readback with no owned runtime container. No network setting or gateway bypass was attempted.

Browser recording uses public Playwright screencast callbacks and a final capture barrier. Read-only observation timeouts keep the browser available for final collection; cancellation and failed mutating operations still close it. Sealing binds bytes/digests to the receipt and Grove media route; media is not independently trusted provider evidence. Local final-frame pixel checks cover actual decoded output. Required traces/redaction and controller-death browser process-tree cleanup remain open.

## Minimal staged golden-fixture contract (proposal)

Do not start with the Cartesian product of every stack and change type. Use one versioned manifest per independently qualified fixture:

- immutable upstream repository/SHA, license and local license evidence; lockfile/runtime/browser/image digests;
- declared surfaces, isolated launch command, actual discovered ports and semantic readiness; explicit dependency modes (`fake`, local real, provider test account), with no mode silently promoted;
- deterministic seed specification/hash, owned resource namespace, reset/cleanup and independent readback;
- exact base/head plus mutation patch hash and expected verdict; unchanged control, intended behavior change, per-layer seeded defect, unrelated/no-op change;
- source/workflow acceptance criteria, bounded polling/budgets, positive and negative assertions, expected failure attribution;
- versioned receipt: tool commands and versions, observed identity, seed/cleanup proof, screenshots/video/source references, elapsed time and measured cost or `not measured`, explicit unsupported boundaries.

Promote a fixture to golden only when its baseline passes and each seeded defect produces its specified failure, while unrelated controls remain stable. Keep authoring/config/startup friction as separate measured outcomes from correctness.

Parent-provided public-source research proposes: 4 [TodoMVC](https://github.com/tastejs/todomvc) cases for frontend behavior/persistence, 6 [Cypress Real World App](https://github.com/cypress-io/cypress-realworld-app) cases for React/Express/lowdb UI/API/data agreement, then 4 [Docker Voting App](https://github.com/dockersamples/example-voting-app) cases for Python→Redis→worker→Postgres→Node UI. These are **candidates, not run or golden here**. Verify actual licenses, pins and baselines before inclusion. [FastAPI full-stack template](https://github.com/fastapi/full-stack-fastapi-template) and [Spring Petclinic](https://github.com/spring-projects/spring-petclinic) can follow only after the first tranche qualifies.

For async work, correlate run/voter ID through accepted request, worker observation, durable row and UI. Wait on bounded semantic completion; include delayed-but-healthy and lost/duplicate/result-mismatch defects. Never consume a queue item merely to observe it. Docker “running” is not “ready”: migrations, seed, API and browser probes must complete. Third-party fakes such as WireMock/Mailpit prove adapter contracts only; provider/SSO claims need separate authorized test accounts and independent provider readback. No Docker socket mounts, privilege escalation, environment dumps, production seeds or new infrastructure permissions.

## Release gates

Before this branch, package name was `workflow-verify`, version `0.2.0`, `private: true`, Apache-2.0, with `tracegrove` and `workflow-verify` bins. Candidate metadata names `tracegrove`, retains the alias/license/version/Node contract, and removes the private publication guard as explicitly authorized. This is preparation, not registry publication.

Both `npm view tracegrove ... --json` and `npm view workflow-verify ... --json` returned E404 on 2026-10-17. This establishes no visible version; it does not establish ownership or entitlement to a new name. `npm whoami` returned ENEEDAUTH. No credential was generated, read, transmitted, or installed. Only `.github/workflows/ci.yml` exists; no established npm release workflow was found. Required action: an owner must authenticate the intended publisher through npm's supported interactive path (including OTP/agreements if requested), verify name entitlement, and establish/authorize the release workflow. No publish call should substitute for that missing prerequisite.

Before actual publication: current-head CI/review and the stacked normal merge gates, final build/pack inspection/clean smoke, ownership confirmation, then supported publication. Afterwards independently read registry version/tarball/integrity and install that registry version in a clean prefix/cache. Tag creation or green source tests alone do not establish release.

Raw local receipts, source snapshots, candidate tarball, screenshots and sample run recordings are in ignored `artifacts/qa/release-audit/`; the raw OrgX source is not shipped in the npm file allowlist. The source report and PR are durable review artifacts; local QA evidence persists only with this saved environment unless explicitly uploaded.

## Ecosystem reuse: current boundaries and smallest extensions

Source inventory: `src/adapters/browser/driver.ts` already delegates browser execution, semantic locators, CDP request filtering, screenshots and screencast recording to Playwright; it does not need a replacement browser automation stack. `src/authoring/run.ts` writes Markdown/JSON/JUnit. `src/authoring/workspace.ts` discovers routes from source heuristics. The package dependencies are Playwright, YAML and Zod. There is no current OpenTelemetry/OTLP, OpenAPI importer, Allure/SARIF importer, general Playwright trace importer, Compose discovery or Testcontainers host adapter.

The reusable unit should be a small set of typed ports, not a new bespoke adapter for each framework:

1. **Lifecycle host port:** launch, observed runtime/source identity, discovered endpoints, semantic readiness, owned seed/reset and cleanup acknowledgement. A controlled Compose/Testcontainers implementation could reuse the existing native HTTP/browser surfaces while provisioning local dependencies. Keep Docker orchestration outside the app container; do not mount its socket or expose broad daemon authority. A healthy container is insufficient without migration, seed, API and browser probes.
2. **Discovery/source input:** OpenAPI can supply route/request/response shapes and authentication requirements as authoring inputs. It does not establish authorization behavior, real effect completion, independent source confirmation or a passing scenario. Continue using the existing compiler/admission/reducer after import.
3. **Evidence import port:** normalize external Playwright/JUnit/Allure reports into explicitly imported observations with exact tool/version/source/test/run and artifact digests. Never relabel a foreign pass as a host-attested replay, infer provenance from filenames, or assume a trace screenshot proves a durable effect. SARIF fits static findings/coverage gaps, not runtime execution receipts. JUnit's broad CI support makes its existing output useful immediately; ingestion is additional work.
4. **Optional telemetry sink/source:** OTLP spans correlated by campaign/execution/attempt and resource ID could explain async worker behavior. Telemetry is supporting evidence; a job span marked successful is not an independently read durable row or visible UI result. Make it optional and retain a local bundle without requiring a hosted observability service.

Recommended first extension: qualify one Compose/Testcontainers-backed async fixture through those lifecycle ports and the existing HTTP+Playwright surfaces. Add OpenAPI-assisted configuration only where it removes measured onboarding friction. Keep report/trace import and OTLP correlation separately labelled, bounded, secret-filtered and optional. These are proposed extension points, not shipped integrations or verified third-party ecosystems.

For the parent research's interoperability order, JUnit output is already present; the first additional import should normalize Playwright JSON/custom-reporter events plus JUnit while preserving `trace.zip` for Playwright's native viewer. Trace capture alone does not establish assertions. Keep retry attempts, expected/observed assertions, producer/version, code/fixture identity and artifact hashes, and report evidence completeness separately from execution status. OTLP/W3C correlation should preserve span links as well as parents: async work need not share a single trace ID. Missing/sampled spans are insufficient evidence, not a passing absence. Compose fixture qualification can precede broader schema-driven cases; Schemathesis/OpenAPI can later draft negative contract cases. Allure and SARIF remain optional views/imports, and MCP invocation is not an evidence format.

## Local verification of the prepared change

The raw-CDP navigation/surface race was reproduced locally at the original PR head. Collection now uses Playwright's public screenshot API while preserving the existing fresh-frame callback/encoder-flush barrier and decoded terminal-pixel assertions. Unchanged-page checks cover pointer, keyboard and touch.

The deliberately wrong browser expectation initially returned infrastructure failure and discarded a completed DOM read. Browser polling now retains its last observation at the deadline; a read-only timeout keeps the browser alive for recording. Failed mutating operations and cancellation still close it. Added tests cover the exact failed expectation, retained DOM text, failed assertion, recorded video, verified failed bundle and fixture/process cleanup, plus direct read timeout recovery and read cancellation. Intermediate recording failures were investigated; the final implementation has no compositor overlay, synthetic frame or fixed recording delay.

Final source verification: `npm run verify` passed typecheck, 72 schema checks and 320 tests across 44 files, with two Python sample tests skipped because `TRACEGROVE_PYTHON` was unset. Node 22.23.3 was on PATH for the controller and launched application. The cloud container's PID 1 does not reap orphans; a temporary parent subreaper was used for the unchanged process-kill test after the first unwrapped run failed on zombie liveness. No test assertion or timeout was weakened. Build and `git diff --check` pass.

The clean packed CLI runs a positive browser case with independently verified bundle/video and a deliberately wrong text expectation with exit 1, retained `Existing note` observation and verified failed evidence. Candidate pack inspection checks its explicit file allowlist, private/generated paths and credential patterns; no findings were detected in 390 entries. This is bounded inspection, not an exhaustive secret-detection claim. `artifacts/qa/release-audit/pack-inspection.json`, `pack.json` and `final-clean-smoke.json` hold the final local package integrity and command receipts. No registry release is claimed.

## Concurrent-author reconciliation

PR #18 advanced during preparation to `452c898a11c2d7a061fa71bc57ddabc1945b96e1`, after the final pre-push ref check still showed `a9bc386`. Its author independently repaired recording freshness with two layout-aware captures and stable capture/frame/flush diagnostics. This branch merges that commit normally and adopts its entire collection barrier, preserving the separate read-only polling/recording-lifetime fix and additional regressions. No shared branch was force-pushed or overwritten. Earlier candidate package receipts describe the pre-integration candidate; final pack/verification receipts must be read for the integrated head.
