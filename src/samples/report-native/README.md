# Native report jobs

Generate with `tracegrove sample-config --sample report-native --output <folder>`.
The generator composes this config and these flows with the shared report-jobs
application, SQLite store, and independent worker. No application code is copied
into a second source of truth in this sample directory.

Run `tracegrove test --config <folder>/tracegrove.config.yaml`. Submission,
readback, and cancellation use the native Node IPC bridge. HTTP serves only
application readiness. See `docs/native-jobs.md` for the typed bridge contract,
effect limits, scope, and qualification boundaries.
