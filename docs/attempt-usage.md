# Attempt usage and pricing

Each sealed cell receipt retains usage for its recorded attempt, including failed
and cancelled outcomes. `runnerSeconds` measures the monotonic elapsed execution
window through cleanup. `browserSeconds`, integration operation count and retained
artifact byte count keep their existing observation boundaries. They are usage
quantities; a provider's billable duration or invoice can use different boundaries.

The native executor has no host rate snapshot or invoice reconciliation. Its host
cost observation therefore records `runner_wall_seconds`, `amount: null` and
`reconciliation: unknown`. Accounting totals `estimatedCents` and `reconciledCents`
remain null with explicit `unknownCharges`. MCP operations also retain an unknown
provider-operation charge. Zero direct authoring inference calls/tokens remain zero;
downstream operations and infrastructure still require pricing observations.

Step timings keep HTTP, browser, native-job and MCP boundaries separate. Timeouts
and cancellations mark their elapsed duration as censored; a fully observed failed
HTTP status keeps an uncensored duration. Untimed steps supply no timing point.
`warm: null` means startup/cache temperature was not observed. Existing boolean
labels remain readable as producer-reported labels. New readers accept null; older
schema readers can reject new receipts and need the matching verifier version.

The redacted AWR workflow extension preserves null prices and unknown-charge count.
The AWR envelope's required numeric placeholder already carries explicit unknown-cost
metadata. It cannot be used as an observed campaign total.

A complete benchmark still needs every admitted attempt, unresolved/crashed attempt
inventory, registered pricing and usage sources, actual warm/cold observations and
equal model/driver conditions. Receipt integrity alone does not authenticate a billing
issuer or establish that every attempt was retained. Historical bundles keep their
original recorded values; this change does not rewrite or reprice them.
