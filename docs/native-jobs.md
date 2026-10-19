# Native job bridge

The `native_job` runner uses Node IPC for job submission, independent readback,
and cancellation. HTTP remains available for fixtures and application readiness;
an HTTP response cannot satisfy a `job.observation/1` assertion. The core,
planner, reducer, evidence bundle, CLI, and Grove use the same frozen contracts.

```sh
tracegrove sample-config --sample report-native --output ./native-example
tracegrove test --config ./native-example/tracegrove.config.yaml
tracegrove ui --dir ./native-example
```

The example reuses the report-jobs application's real SQLite store and separate
worker. It exercises duplicate delivery, a conflicting idempotency key, another
persona's denied read, persisted output, worker-confirmed cancellation, and a
failed job. The application and worker are stopped and their attempt-owned data
directory removed. The native sample uses no HTTP job endpoint.

## Authoring

Set `app.nativeJobs: node_ipc/v1` on a Node preset. The application must implement
the explicit handshake below; setting the option alone cannot establish a native
capability. Declare `effects.maxJobs`; every submit invocation, including a
duplicate or conflicting invocation, consumes one position in that ceiling.
The compiler derives the allowed queues from the flow. Low-level corpus authors
must supply `effects.allowedJobQueues` explicitly. Read-only envelopes refuse
submission and cancellation. Job steps require one attempt; there is no implicit
submission retry.

```yaml
effects: { maxJobs: 1 }
steps:
  - job:
      action: submit
      queue: reports
      requestKey: one-report
      payload: { title: Example, mode: succeed }
    save: { jobId: jobId }
    expect: { present: [jobId] }
  - job: { action: read, queue: reports, jobId: '{jobId}' }
    expect:
      json: { status: succeeded, output.report.content: 'Report: Example' }
      present: [workerId]
```

These compile to `job.submit`, `job.observe`, and `job.cancel`. Expectations
refer to the typed job observation, using `expect.json`, `present`, `absent`, or
`count`. HTTP status expectations are rejected. `as` uses the same attempt-issued
persona credentials as HTTP. Credentials cross the private IPC channel and are
excluded from protocol results and recorded observations. Provider output still
needs the application's ordinary data-redaction policy.
An output that echoes the issued credential is withheld with a typed adapter
failure; the credential is not sealed into observations.

The read operation polls to its step deadline. A completed readback survives a
later timeout, so `succeeded` without the required report is an assertion failure
with retained evidence. Cancellation or a transport failure remains a failure of
the attempt. Request and response IDs are correlated, read/cancel results must
name the requested job, and submitted results must retain the requested key.

## Application protocol

Schemas are exported through `tracegrove/protocol` and JSON Schema:
`workflow.native-job-{action,request,response,ready,observation}/v1`.
The supervisor opens IPC only for an opted-in Node application and sets
`TRACEGROVE_NATIVE_JOBS=node_ipc/v1`. After its worker/provider is ready, the
application sends:

```json
{"kind":"tracegrove.job.ready","version":1,"queues":["reports"]}
```

It receives `tracegrove.job.request` messages with a UUID `id`, nullable
`credential`, and a typed `command`. Commands are `submit` (queue, requestKey,
payload), `read` (queue, jobId), or `cancel` (queue, jobId). The application owns
credential validation, tenant isolation, idempotency, actual submission, readback,
and cancellation semantics. It replies with the same UUID:

```json
{"kind":"tracegrove.job.response","id":"00000000-0000-4000-8000-000000000001","result":{"jobId":"example","status":"queued","requestKey":"one-report","output":null,"workerId":null}}
```

Messages are bounded to 32 KiB. Malformed, missing, oversized, mismatched, or
late responses cannot become successful observations. Only job-namespace
messages are forwarded from the application; application output cannot impersonate
the supervisor's source or cleanup observations. The same supervisor owns the
application process group, including workers, and removes its workspace when the
controller disconnects. Snapshot-pinned launches use the same bridge from the
private pinned source copy.

This is a local Node provider seam. It does not qualify a hosted queue, a remote
provider account, production cancellation, or distributed crash recovery. The
handshake declares supported queues; it does not independently certify the
provider's implementation. Python bridges and mixed browser/native-job packs
require separate conformance work and currently block rather than downgrade.
