# Promoting an approved source plan

`promoteScenario(ports, intent, definition, selections)` registers an approved source
scenario as `proposed`. It returns a sealed `workflow.scenario-promotion/v1` manifest.
It creates no plan approval, structural validation, runtime PASS or active coverage.

The intent names the scenario, immutable definition and selection refs, exact editable
plan revision token, and scoped idempotency key. The definition binds the source plan
and current review. Promotion requires the stored review to be approved for that exact
plan/edit revision and to retain its atomically stored source validation. Each promoted
case must belong to approved runnable candidates whose source elements were independently
validated. Blocked/excluded candidates and non-scenario plan dispositions cannot become
promoted cases. The matrix and every supplied selection retain the exact case/persona/
target strata and policy.

```ts
const ports = scenarios.promotionPorts(reviews, { authorizePromotion });
const manifest = await promoteScenario(ports, {
  scenarioId,
  definitionRef: definition.ref,
  reviewToken,
  selectionManifestRefs: selections.map(selection => selection.ref),
  idempotencyKey,
}, definition, selections);
```

`LocalReviewStore.approvedSnapshot(ledger, token, reviewRef)` resolves actual approved
storage on the same writer. It requires current review authority without writing a
review or approving anything. Its documents are copies; its runtime `assertCurrent`
checks the review aggregate version. The local promotion adapter resolves that snapshot
again inside its commit, compares the submitted context, rechecks creation/promotion
authority and verifies both review and scenario versions after the final await.
One synced scenario-registry entry contains the proposed definition, selections,
manifest, full reviewed plan, review and source-validation snapshot. Gaps, withheld
flows, excluded candidates and diagnostics remain in that immutable snapshot.

The manifest binds the review/source-validation refs and storage version as well as
the authenticated promoter and policy. Selection order is normalized. Repeated or
concurrent identical intent returns one manifest; a changed scoped key binding or an
attempt to overwrite an existing scenario conflicts. A pre-write failure publishes
nothing; a lost acknowledgement recovers the committed manifest after reopen. The
registry's existing 100-scenario bound applies. Older journals have no promotion record.

## Current review checks after promotion

Compose the review guard with the host's other definition checks:

```ts
validateDefinition: async definition => {
  const reviewed = await reviews.definitionSnapshot(ledger, definition);
  await validateReplayPolicyAndTarget(definition);
  reviewed.assertCurrent();
}
```

An edit clears the current plan review. This guard then refuses later structural,
qualification and activation admission against the old review. Use `invalidateScenario`
with a replacement definition to advance its epoch and clear activation. Historical
promotion retries return the original receipt without renewing approval or altering
the scenario. Promotion registers new entries; replacing an existing scenario remains
an explicit semantic edit and review flow.

All ports belong to the trusted host. A saved source plan or producer-supplied approval
object cannot supply them. Protect the state directory and synchronize external IAM,
revocation and provider fencing with the controller. Local hashes and receipts do not
establish a hosted issuer or deployed revision. Source-bound activation still requires
independent runtime revision proof; source inspection alone cannot grant it.

Tests compose immutable Git reads, an actual bounded TypeScript AST predicate, source
validation, durable review, promotion, structural validation and native execution.
Authentication, coverage policy, physical leases and issuer authority are explicitly
simulated. The AST oracle proves a declared POST branch only. These proofs do not
establish full semantic coverage, a deployed source tuple or hosted qualification.
