# Execution admission inventory

```sh
tracegrove usage --state-dir .tracegrove/state --json
```

The SDK's `inspectAttemptInventory({stateDir, scope})` reads one bounded journal
checkpoint and enumerates its admission records. It includes ordinary execution
aggregates and qualification aggregates with their distinct cell allocations.
Successful, failed, unsealed, corrupt, duplicate and unsupported admissions remain
visible. Cached summaries, producer directory names and the passing subset cannot
substitute for this inventory.

Each usable bundle is freshly verified and bound to its recorded admission, request,
scope, ownership inventory, cell finalizations and campaign result. Qualification
readback checks its sealed registration and per-cell IDs; it does not re-authorize
the current scenario or trust a historical approval as current authority. The report
exposes counts and references, withholds physical resource IDs and cached payloads,
and grants no effect authority.

The reader never opens the ledger writer, breaks a lock, probes PIDs, repairs files,
starts a host or runs cleanup. A live writer lock can be present. The checkpoint is
checked again before publication; a changed journal or lock returns no mixed report.
Missing and invalid state remain unavailable. An existing empty checkpoint is
explicitly `no_attempts`, with null usage/pricing and no completeness claim. More
than 500 admissions blocks the report instead of silently truncating it.

`recordedUsageSubtotal` includes every verified retained receipt in the checkpoint,
including unsuccessful outcomes. Missing/unsealed admissions keep
`evidenceComplete: false` and exit 2. Selected cells without receipts and recorded
unresolved resources also prevent complete evidence. A complete inventory exits 0;
that status establishes neither product success nor priced usage.

Pricing fields are recorded subtotals, not authenticated provider invoices. Null
prices stay null; unavailable attempts never contribute an assumed zero. Unknown
charge and unpriced receipt counts remain explicit. Temperature counts retain
producer labels, including unknown values; they are not an equal-condition timing
benchmark. See [attempt usage](attempt-usage.md) for the measurement boundaries.

The scope is execution admissions present in this checkpoint. Journal integrity
cannot prove that an external history or authoring/model-call ledger was supplied
in full. Registered pricing, provider reconciliation, actual warm/cold observations
and equal cheap-model/driver comparisons remain separate benchmark requirements.
