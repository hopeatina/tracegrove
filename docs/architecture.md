# Tracegrove: architecture, current UX flow, and adapter gaps

Status as of 2026-10-16, for this repository. "Intended" means what the protocol schemas already declare (enums for surfaces, lanes, boundaries, hosts) and what the README lists as not implemented yet.

## 1. High-level architecture

```text
 you write                     compiled (derived)              kernel (unchanged)                 evidence
 ─────────                     ──────────────────              ──────────────────                 ────────
 tracegrove.config.yaml ─┐
 tracegrove/**/*.flow.yaml ├─► authoring compiler ─► .tracegrove/compiled/   ─► corpus loader (freeze + sha256 refs)
 tracegrove/fixtures/*.yaml┘    (src/authoring)        workflow.yaml, cases,     ─► planner  (side-effect free, blockers w/ owner+action)
                                                       host, persona, recipe…    ─► admission + local ledger (single writer, idempotent)
                                                                                 ─► executor
                                                                                      host adapter:  local_process │ mock_loopback
                                                                                      fixtures:      registered API actions, readback, cleanup
                                                                                      surface driver: http │ Chromium browser
                                                                                 ─► trusted reducer (outcome from observations)
                                                                                 ─► bundle writer ─► verify-bundle ───────► .tracegrove/runs/<run>/
                                                                                                                              summary.md/json, junit.xml,
                                                                                                                              request.json, bundle/
 tracegrove ui ─► reads config, flows, runs, git; runs `test`; scans routes for discovery
```

The [Chromium browser runner](browser-driver.md) supports short flows and the low-level corpus, with typed UI steps, DOM assertions, authenticated local personas, and sealed recordings in Grove. Supporting modules that exist but aren't wired into the everyday flow yet include shared coordination, signed cleanup follow-ups, source citations, and the plan review API.

## 2. The current UX flow, end to end

| Step | Today (this branch) | Intended |
| --- | --- | --- |
| Install | Private package; install a packed archive | `npm i -D tracegrove`, `pipx`/`uvx` shim for Python repos |
| Set up | `tracegrove init` detects FastAPI, Django or Node and writes config + example flow | Same, plus discovery proposes the first flows |
| Discover what to test | `tracegrove ui` scans routes (FastAPI, Django, Express/Fastify/Hono) and shows which have no flow, at a folder or a git branch | Source-selection resolver: diff-aware selection, coverage policy, AI-drafted flows reviewed through the plan review API |
| Write tests | `*.flow.yaml` with HTTP steps, personas, saved values, fixtures | Plus browser steps, job steps, integration steps, MCP calls |
| Run | `tracegrove test` (local process host, real lane) | Lanes: mock contract, recorded replay, hybrid, full live sandbox, canary; hosts: container, CI, cloud sandbox |
| Read results | Terminal table, run folder, JUnit, `tracegrove show`, UI run history | Trace/video media, flaky-history, PR comments |
| Prove it | `verify-bundle` re-derives the verdict from sealed evidence | Importer with issuer trust; hosted qualification lifecycle |

## 3. Gaps versus intended, by layer

| Layer | Supported now | Declared but not implemented |
| --- | --- | --- |
| Surfaces (step kinds) | `http.request`, `observe`, `ui.navigate`, `ui.action`, `ui.observe`; browser short flows compile into the same core | `job.submit`, `integration.action`, `mcp.call`, `widget.action`, native and computer-use |
| Hosts | `local_process` (POSIX), `mock_loopback` | container, managed sandbox, cloud VM, customer CI, device service; Windows process trees |
| Fidelity lanes | `full_live_sandbox`, `mock_contract` | `recorded_replay`, `hybrid_live_product`, `full_live_canary` |
| Boundaries | `application`, `storage` observed as real/stubbed | per-provider boundaries with interceptors and readback oracles |
| Auth | host-issued bearer tokens per persona | `env_credential` recipes, login flows (form/cookie/OAuth), account bindings and persona leases in use |
| Fixtures/seeding | API-created entities with readback and confirmed 404/410 cleanup; deterministic generators | DB-level seeding, snapshots/restore, factories, datasets, relation bindings in use, `update` lifecycle |
| Oracles | HTTP status/JSON path, step result | DB readback, queue/job state, email/webhook capture, visual baseline, LLM judge (policy exists, all stages disabled) |
| Environments | `isolated_candidate` | deployed preview, canary, production observation |
| Discovery | Route scan in `tracegrove ui` (heuristic) | source selection resolver, intelligence-policy-gated drafting |
| Media | step events, network metadata | trace and video capture (`required` currently unsatisfiable) |

### Integration with the verified core

The integration branch also includes the immutable Git pair resolver, source citation
validation, durable local plan review, qualification reduction and activation contracts.
Those APIs do not make heuristic route discovery independent source confirmation or
hosted qualification. The workbench remains a local authoring and replay interface.

Node and Python presets use the same bounded interpreter observation during compilation
and launch. Django runs migrations and starts its server through that Python executable.
Generic shell wrappers remain blocked until a qualified host can observe their actual
application runtime. A corrupt exported evidence bundle marks the overall run inconclusive,
uses an inconclusive run directory and adds an evidence-integrity JUnit error, even when
individual HTTP checks passed.

## 4. Adapter gap analysis for full-stack and data-engineering work

"Adapter" here means anything tracegrove needs to start, seed, fake, observe or clean up. Priority is what blocks the most real repos first.

### Seeding

| Need | Now | Gap and proposed adapter | Priority |
| --- | --- | --- | --- |
| Create records through the app's API | Yes (fixtures) | — | — |
| Seed straight into the database (fast, bypasses API) | No | `seed.sql` adapter: run SQL/fixtures against a per-run DB, readback by SELECT, cleanup by transaction rollback or DB drop | P0 |
| Framework factories (factory_boy, Django fixtures, Prisma seed) | No | `seed.command` adapter: run a repo command with `{dataDir}`/`DATABASE_URL`, capture emitted ids as JSON | P0 |
| Snapshot and restore a known state | No | `seed.snapshot`: SQLite file copy / `pg_dump` template DB / `CREATE DATABASE … TEMPLATE` | P1 |
| Large synthetic datasets for data pipelines | Generators only (words, slug, uuid, int) | dataset recipes: CSV/Parquet generators with seeds, row counts, schemas; `datasetRef` is already in the case schema | P1 |

### Databases

| Need | Now | Gap and proposed adapter | Priority |
| --- | --- | --- | --- |
| SQLite per run | Works if the app reads `TRACEGROVE_DATA_DIR` (Django/FastAPI samples) | Built-in `db: sqlite` that sets `DATABASE_URL` | P0 |
| Postgres/MySQL per run | No | `db: postgres` service adapter: start a container or use a local server, create a throwaway database per run, inject `DATABASE_URL`, drop it on cleanup, record server version in identity | P0 |
| Migrations | Django preset runs `migrate` | `app.setup:` commands (alembic upgrade, prisma migrate, knex) run before readiness | P0 |
| Assert on DB state | No | `observe: { sql: "select … ", expect: … }` read-only oracle with a separate read-only connection | P1 |
| Redis, Mongo, Elasticsearch | No | generic `services:` block with per-service health + isolation recipe | P1 |

### Asynchronous jobs

| Need | Now | Gap and proposed adapter | Priority |
| --- | --- | --- | --- |
| Start workers next to the app | No (one component per host) | `components:` list in config: app + `celery worker`, RQ, Sidekiq, BullMQ, Dramatiq, Temporal worker; each its own supervised process, attested identity, health check | P0 |
| Broker | No | `services: redis/rabbitmq` with per-run vhost/db index | P0 |
| Wait for a job to finish | Only by polling an HTTP readback | `job.submit` + `observe: { job: id, state: SUCCESS }` via Celery result backend / Flower API, BullMQ queue API; eager mode is explicitly not a real boundary | P1 |
| Scheduled jobs (beat, cron) | No | logical clock control (`clockProfileRef` exists in the schema) plus a "tick" step | P2 |

### Third-party services and mocks

| Need | Now | Gap and proposed adapter | Priority |
| --- | --- | --- | --- |
| Whole-app mock (contract lane) | `mock_loopback` host with declared routes, not in the authoring layer yet | `lanes: { mock: { from: recordings/ } }` in config | P1 |
| Fake one dependency while the app is real (Stripe, SendGrid, S3, OpenAI) | No | outbound interceptor proxy: app gets `HTTPS_PROXY`/base URL env; routes are stubbed, recorded or passed through per boundary; observations sealed as boundary evidence (`interceptorRef` exists) | P0 |
| Record once, replay in CI | No | `recorded_replay` lane: record real calls in a sandbox account, redact, replay deterministically | P1 |
| Provider sandboxes (Stripe test mode, etc.) | No | `env_credential` auth + `test_sandbox` account class + provider cleanup actions with signed follow-ups (verifier exists) | P2 |
| Email/webhook capture | No | built-in inbox (SMTP sink) and webhook catcher with assertions | P1 |
| Object storage | No | MinIO/localstack service adapter | P2 |

### Data engineering

| Need | Now | Gap and proposed adapter | Priority |
| --- | --- | --- | --- |
| Run a pipeline (Airflow DAG, Dagster job, dbt run, Spark job) | No | `job` surface with a `runner: command` that runs the pipeline against seeded inputs and records exit state and logs | P1 |
| Assert on outputs | No | table oracles: row counts, schema, uniqueness, not-null, freshness, golden-file diff on CSV/Parquet | P1 |
| Warehouses (BigQuery, Snowflake, DuckDB) | No | DuckDB local first; warehouse adapters with per-run schema/dataset and cleanup | P2 |

## 5. Suggested order

1. **P0 for full-stack repos:** `app.setup` commands, `services:` (Postgres, Redis), `components:` (workers), `db: sqlite|postgres` that injects `DATABASE_URL`, SQL and command seeding, and the outbound interceptor for third parties.
2. **P1 for coverage:** job observe, DB-state oracle, mock lane in the authoring layer, record/replay, email/webhook capture, data-pipeline job surface with table oracles.
3. **Qualify browser execution beyond local runs**, including staging personas, controller-death cleanup, trace/redaction collectors, and host network confinement.

Each adapter keeps the kernel's rules: launched or reserved per run, identity attested, effects inside the declared envelope, cleanup confirmed by an independent read, and evidence sealed in the bundle.
