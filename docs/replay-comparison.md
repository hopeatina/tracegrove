# Compare recorded executions

```sh
tracegrove compare --baseline ./before-bundle --candidate ./after-bundle --json
```

Both inputs must pass fresh bounded bundle verification. The SDK accepts already
captured `VerifiedBundleSnapshot` values through `compareReplays(baseline, candidate)`;
it can compare them after their producer directories disappear. Reads never launch
an app, discover current YAML, repair metadata, acquire a ledger or grant authority.

Rows align by case, persona, surface, variant and environment IDs. Full references
and comparison digests distinguish edited definitions from their prior revisions.
Every selected cell remains visible, including added/removed strata, ambiguous
matches and missing receipts. Both selection exclusion lists and complete campaign
coverage are retained; the common subset cannot stand in for the entire selection.

A `passed_to_failed` or `failed_to_passed` row requires unchanged case/persona/surface/
variant contracts, requiredness, execution context, fidelity and campaign limits.
Changing an assertion is `contract_changed`, even if the edited test passes.
Changing a host, environment, runner, evaluator, provenance, intelligence policy,
fidelity or campaign limits is `context_changed`. Pinned source changes can also
change the host/environment refs, so a conservative context change is expected there.
These labels describe recorded differences; they do not establish causal product
regressions, equivalent hardware, statistical significance or independent agent work.

Each point retains receipt refs, reason codes, step/assertion result summaries,
declared/observed component identities and observed repository commits. Raw response
bodies, configuration values and media are not copied into this projection. Digests
bind the complete targets; use explicit evidence inspection for underlying details.
Distinct recorded execution IDs are reported separately from copying the same campaign;
neither authenticates an issuer nor establishes fresh fixtures or independent qualification.
Different owner/workspace scopes are refused.

CLI exit 0 means the comparison completed, including when a recorded case failed.
Invalid evidence or incompatible scopes exit 2 and produce no comparison. The strict
`tracegrove.replay-comparison/v1` schema is exported with the protocol JSON Schemas.
The report is scoped to the two provided bundles; it is not an all-attempt history,
provider invoice, cost/performance benchmark, current review or activation decision.
