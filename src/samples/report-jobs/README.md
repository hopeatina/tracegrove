# Report jobs

This sample runs a local HTTP API and a separate Node worker against one persisted
SQLite queue. Only the worker publishes report rows. Duplicate owner/request keys
reuse one job, cancellation waits for a worker acknowledgement, and failed jobs
leave no report. Fixture cleanup deletes its owned job and report atomically.

Generate the sample with `tracegrove sample-config --sample report-jobs --output
<empty-directory>`. From that directory, run `tracegrove test`. Sample generation
also compiles the low-level corpus and prints its config path; pass that exact
path to `workflow-verify plan` or `doctor`. Compilation checks the installed Node
runtime but does not start the API or worker.

All flows use the existing HTTP submit/readback/oracle contracts. A 202 submission
alone cannot satisfy the completion case: it polls job state, reads the persisted
report independently, checks one-job idempotency and verifies owner isolation.
`effects.maxJobs: 1` declares each flow's admitted job ceiling; it does not impose
a quota on an arbitrary external provider.

The `REPORTS_TEST_DROP_REPORT=1` application flag is a controlled defect: the
worker records success without inserting the report. The completion flow must
fail on independent report readback, while retaining its sealed failed attempt.
The flag is part of the frozen app launch configuration. It is not a normal
successful lane.

The package's pinned Node 22 range supplies `node:sqlite`; no database server,
account, model call or OrgX connection is needed. The core attests the complete
application source set, including worker and storage code. This is local
application/job behavior, not a separately issued worker attestation, hosted
provider qualification, a native `job.submit` adapter, or crash-recovery proof.
