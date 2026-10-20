# Recorded benchmark evidence

```sh
tracegrove benchmark --state-dir .tracegrove/state --axis runner --json
tracegrove benchmark --state-dir .tracegrove/state --axis model
```

The SDK equivalent is `inspectBenchmark({ stateDir, scope, axis })`. It reads all
execution admissions at one unchanged ledger checkpoint. It opens no writer,
starts no host, performs no inference, and runs no recovery or cleanup.

In `tracegrove ui`, open **Benchmark** to inspect the same project checkpoint.
The comparison axis survives reload through `?benchmark-axis=runner` or `model`.
Refresh clears prior results before checking the ledger again. Changing axis or
leaving the view invalidates late responses. A missing, changed or unreadable
checkpoint is distinct from a readable empty ledger; unavailable counts never
become a known zero-history display.

The view retains every admission, including unavailable attempts, and shows
recorded outcomes, condition references, pricing gaps and warm/cold/unknown
timing strata. **Download captured JSON** saves the displayed capture without
rereading a newer checkpoint. Condition pages and bounded cohort/timing previews
keep the interface usable; their additional rows remain in that JSON. Keyboard
shortcuts for running and healing do not execute from the Benchmark view.

Every admission remains in the inventory, including failed, cancelled,
interrupted, unsealed and unavailable attempts. The report cites each retained
receipt by admission sequence, execution, attempt and cell. It retains actual
outcomes rather than filtering to passing runs. Unavailable admissions prevent a
complete report; missing charges never become zero.

Cohorts share a digest of recorded conditions: frozen case/persona/surface,
environment, host, target components and repositories, evaluator, fidelity,
limits, selection and intelligence policies, network and clock profiles, and
provenance. `runner` varies only the recorded runner reference. `model` requires
recorded inference and an observed model name, with the runner held constant.
Opaque model-configuration digests remain bound; changing them creates a separate
condition group. A matching digest shows equality of recorded fields. It does not
prove experimental control, issuer identity or causal independence.

Recorded usage includes unsuccessful outcomes. Pricing remains a subtotal with
explicit unpriced, unreconciled and unknown-charge counts. These values are not
authenticated provider invoices. Shared reservation IDs are counted once, and
conflicting amounts make the retained-reservation total unavailable. Reservation
budgets are separate from actual charges and are not added to invoice subtotals.

Timings stay separate by metric, boundary, clock, recorded warm/cold/unknown
temperature and strata digest. Medians and ranges use numeric uncensored points
only; censored and missing points retain their counts. Unknown temperature is
never inferred from repetition or elapsed time. Failed attempts still contribute
their recorded timings. The report performs no significance test or winner
selection and establishes no qualification.

Exit 0 means the report contains descriptive evidence with complete checkpoint
inventory, observed cohort identities, matching condition groups, recorded
pricing and matching warm/cold timing coverage for every cohort and condition
group. Clocks, metrics and strata must match, with numeric uncensored samples in
each temperature. Exit 2 names missing evidence. Both are
read-only results. The native executor currently records unknown pricing and
temperature, so its ordinary execution receipts do not satisfy a priced warm/cold
benchmark by themselves.

Bounds are 500 admissions, 5,000 receipts, 50,000 timing points, 1,000 condition
groups, 32 MiB of captured benchmark inputs and 8 MiB of report output. Inventory
reads do not retain benchmark inputs. Exceeding a bound clears captured evidence
and fails the report rather than
selecting a smaller successful subset. Cell detail remains available through
`usage` and the sealed bundles; this report retains per-admission inventory and
citations without copying every cell into the inventory again.

This reader does not run the live equal-condition cheap-model/driver experiment,
reconcile billing, independently observe cache temperature, or establish a
statistically powered benchmark. Those require an admitted experiment and actual
provider/host observations. Execution admissions in this checkpoint also cannot
prove completeness of an external authoring or provider billing history.
