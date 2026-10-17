# Docker Voting App fixture assessment — blocked, not qualified

This is source and capability evidence for the existing consolidated plan's Voting App candidate,
not another project plan or a completed golden fixture. No application/container journey ran.
The root-owned TodoMVC work and separate async fixture PR #22 are unaffected.

## Source and measured local capability

Public source was cloned once at exact commit
[`63e9150ca17af4ed05880d4245e486481f73fcb4`](https://github.com/dockersamples/example-voting-app/tree/63e9150ca17af4ed05880d4245e486481f73fcb4),
tree `c137bfa9fc286bb801e785ba8f98619ffa379c3e`, with a clean checkout. The root
[license](https://github.com/dockersamples/example-voting-app/blob/63e9150ca17af4ed05880d4245e486481f73fcb4/LICENSE)
is Apache-2.0; `result/package.json` separately declares MIT. A redistribution build must retain
applicable notices and inventory third-party package, image and vendored frontend licenses;
the root license alone does not establish every dependency's license.

The [machine-readable assessment](voting-app-assessment.json) records hashes for 20 inspected
source/license/runtime/dependency/frontend files and the read-only local Docker observations.
Docker client/server **28.4.0**, Compose **2.40.3**, Linux amd64 were available. There were zero
running containers. The **only cached image** was:

```text
node@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7
image ID sha256:b37a4d56eedb5e42bca59c8d4782fa550e741fba5dbce943c53767d3ceee57e6
```

This single Node image does not close the required application/runtime image set. The required
Redis, PostgreSQL, Python and .NET runtime images and three built application images were absent
from the inspected local image cache.
No registry pull or retry was attempted: the existing registry access hold remains in force.
No container, volume or network was created, and no security/network configuration was changed.

Actual read-only commands included:

```sh
docker version --format '{{json .}}'
docker image ls --digests --no-trunc --format '{{json .}}'
docker compose version
docker ps --format '{{.ID}} {{.Image}} {{.Names}}'
git ls-remote https://github.com/dockersamples/example-voting-app.git HEAD refs/heads/main
```

The public source clone resolved to the exact commit above; file hashes were computed from that
clean checkout. Repository inspection and Docker inventory are not application execution evidence.

## Closure gaps in the pinned upstream source

The pinned Compose setup connects Python voting frontend → Redis queue → .NET worker →
PostgreSQL → Node/Socket.IO results frontend. Its runtime/build closure is incomplete:

| Component | Inspected declaration | Required before a reproducible run |
| --- | --- | --- |
| Voting frontend | `python:3.11-slim`; requirements list Flask, Redis and gunicorn without versions; dev stage adds unpinned watchdog | Exact platform image digest and locked/hash-verified Python and OS package closure |
| Worker | .NET SDK/runtime `7.0`; direct NuGet versions in `Worker.csproj`, no lock file | Exact platform image digests and transitive dependency/build provenance |
| Results frontend | `node:18-slim`; npm lockfile v2; unpinned global nodemon and APT tools | Exact image/OS closure; use an explicitly qualified production command rather than the dev inspector |
| Queue/store | `redis:alpine`, `postgres:15-alpine` | Exact available platform manifests and owned ephemeral data lifecycle |
| Prebuilt app alternative | Unversioned `dockersamples/examplevotingapp_*` image names | Source-to-image build receipts and immutable digests; tag names do not prove this source pin |
| Voting-page assets | External Font Awesome, jquery-cookie and mutable `jquery-latest` script references | Exact asset bytes/licenses and reviewed offline packaging, or an explicitly limited baseline that records their absence; no external CDN access assumed |

The upstream development Compose file also publishes fixed host ports, uses bind mounts and
starts the results inspector. It is not an already-qualified isolated test configuration. No
upstream Compose startup, dependency install, image resolution, seed script or build ran here.

## Minimal four-case acceptance design — not executed

Use a fresh owned project per attempt, immutable approved image/source/asset closure, unique
synthetic voter cookies, loopback-only application endpoints, bounded startup/request/wall time,
and ledger-recorded ownership before resource acquisition. Never point this fixture at OrgX,
customer databases, an existing shared queue, staging or production. No upstream load-generator
seed script is needed. Seed any unrelated control voter through the owned voting application,
and verify it independently before testing the target voter.

Each source defect is a reviewed patch in an isolated copy, recorded by exact base/head and
patch digest. First prove all four cases on the unmodified baseline; then require the matching
seeded defect to fail while an unrelated control remains passing. No baseline/defect/control
outcome exists yet.

| Case | Required baseline assertion and independent readback | Targeted seeded defect | Unrelated positive control |
| --- | --- | --- | --- |
| Submit one vote | A fresh synthetic voter selects A; the queue/worker eventually yields exactly one matching owned database row, and the results page shows the corresponding count delta | Omit enqueue for that voter while returning HTTP success; HTTP 200 alone must not pass | Existing control voter's row/count and results-page health remain unchanged |
| Change the same voter's choice | A→B for one cookie updates that row without increasing total voter count; independent database read and results UI agree | Omit the existing-voter update for the target voter | A second synthetic voter's stored choice remains intact |
| Recover bounded worker delay | Stop only the owned worker, accept the target vote, observe non-consuming queue depth, restart that same owned worker and require bounded eventual database/UI agreement | Drop the target item after dequeue instead of persisting it | A previously confirmed control vote remains present and readable |
| Detect result projection divergence | Known stored A/B counts appear correctly in the native Socket.IO result and visible results UI | Swap the results projection's A/B mapping | Independent owned database counts and voting frontend health still pass |

Database observations here are proposed read-only checks against the future **owned synthetic
fixture only**. They do not authorize or replay any prohibited OrgX database/RLS/HTTP integrity
validation. Queue depth uses a non-consuming read; consuming a queue item is not an observation.
An empty queue is not proof that the worker persisted a vote. Source inspection shows destructive
dequeue before persistence, motivating the worker-boundary case; it is not an observed defect run.

Retain real request/response and correlation evidence, source/image/patch digests, native
queue/database/result receipts, browser recordings/screenshots, positive/negative assertions,
budgets/timings and all failed attempts. Mark every boundary as actual local fixture execution;
never elevate it to provider sandbox, signed-in host or OrgX workflow acceptance. Current product
execution remains on its reviewed adapters; a fixture test host must not silently add generic
Compose, database or queue dispatch to the CLI.

## Cleanup and the exact blocker

Any later runner must inventory its exact containers, network and volume by unique project/run
labels, stop owned processes, remove only that owned synthetic project and volume, and read back
absence before declaring cleanup. Do not use broad prune/reset commands, shared-volume deletion,
global Redis reset, daemon changes, host networking or automatic stale-owner takeover. Preserve
unknown cleanup and partial evidence on startup/dependency/timeout failures.

**Blocked action:** building or starting the five-service pinned Voting App fixture in this cloud.
**Reason:** the required approved immutable image/dependency/asset closure is unavailable locally,
and the existing registry access hold prohibits retrying a pull to supply it. The action was
**not attempted**; there is no new denial or uncertain container outcome. Source pin, license/file
hashes, read-only Docker inventory and the four-case acceptance design are complete.

The smallest enabling handoff is an approved runner that already has the complete pinned closure,
or supplied approved OCI archives plus digest/build/dependency/asset receipts for offline loading
and review. This does not require transmitting credentials or changing this cloud's network/security
settings. Until that handoff and the actual baseline/defect/control/cleanup matrix complete,
`golden: false`, `executed: false` and `verificationVerdict: not_evaluated` remain authoritative.
