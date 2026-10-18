# Recorded workflow knowledge

`WorkflowKnowledgeSnapshot.capture(VerifiedBundleSnapshot.open(bundle))` derives a
read-only, cited map from one completely verified execution bundle. It needs no
application checkout, running service, discovery, model, database or OrgX account.
The map is rebuildable knowledge; execution records remain its source of truth.

```sh
tracegrove workflow-map --bundle ./saved/bundle --json
tracegrove workflows --bundle ./saved/bundle --text Refresh --limit 5 --json
tracegrove workflows --bundle ./saved/bundle --route /ui --tag notes.ui --json
tracegrove workflow-map --bundle ./saved/bundle --cell <selection-cell> --json
```

SDK `search` accepts `text`, `caseId`, `workflowId`, `route`, `surface`, `tag`,
`limit` and `cursor`. Text matches purpose, aliases/tags, role scopes, routes and
accessible landmark names. Route filters match exact declared or recorded paths,
without query strings, credentials, hostnames or fragments. Pages contain at most
100 selections and 128 KiB. Reduce `limit` when a large workflow exceeds the page
bound. The snapshot/query-bound cursor rejects changed bundles and filters.

Each selection retains the exact case, persona, surface, environment, variant,
target tuple and recorded receipt references. Steps retain declared routes and
accessible locator metadata separately from recorded command results, observed
paths, input/output digests and event IDs. Fixture plans expose declared action
IDs, methods, paths, dependencies, readback and cleanup operations with their
recipe/registry references. Fixture values, fill values and response bodies are
not projected. Native-report imports cannot supply this map.

`completed` means a command completed; a separate assertion can still fail.
Transitions describe declared step order and whether both commands completed,
not observed causality. Missing receipts, target observations, steps and landmarks
remain explicit gaps. Excluded cells and overall campaign coverage remain visible
in the map. Source references are labelled declarations, not independently checked
source citations. Captured bundle reduction does not authenticate an issuer.

SDK `assess(cell, { caseRef, expectedTarget })` marks knowledge stale when the
caller-declared case revision or target changes. Matching declarations do not prove
current deployment identity, permission, fixture state or landmark availability.
Revalidate those at execution. No map, lookup, self-digest or cached selector
admits effects, weakens an assertion, heals a case, qualifies a scenario or activates
regression coverage. There is no restore-from-map authority API.

In Grove, open **Map**, select a retained run and search for a route, role,
landmark or workflow. Named run/cell links survive reloads. Keyboard `j`/`k`
selects results; the existing command palette and numeric tab shortcuts apply.
Every lookup and page reopens the execution evidence. A network error, corrupted
archive or changed page cursor clears prior facts. **Inspect recorded run** opens
the existing evidence inspector. Map navigation issues no execution requests.

Maps block above 500 selected workflows, 20,000 steps or 16 MiB rather than silently
truncating knowledge. Lookup state is local to the provided bundle; it is not a
hosted search service, tenant authorization broker or cross-run freshness index.
