# Durable local scenario registration

`LocalScenarioStore` implements `ScenarioPorts` on the existing `LocalLedger`.
It persists definitions, selections, pending qualification admissions and semantic
invalidation together. It supplies `resolveAdmission(ref, scope)` for reading an
actual registered record, rather than accepting a producer document as registration.

```ts
const store = new LocalScenarioStore(ledger, scenarioId, scope, authority);
await store.initialize(definition, [qualificationMatrix, selectedRound]);
const admission = await registerQualificationRound(store.ports(), token, {
  selectionManifestRef: selectedRound.ref,
  stateLeaseRefs: provisionedStateLeaseRefs,
});
```

The authenticated host must provide all three authority methods. There is no
permissive default:

- `authorize(scope, action)` checks the current owner and policy. Reads are
  authorized too; registration/invalidation recheck authorization before publication.
- `validateDefinition(definition)` checks the complete reviewed source, replay,
  policy, target and matrix closure. Initialization requires the host to have
  already authorized promotion and structural validation. It does not create an
  approval or turn a draft into an accepted native plan.
- `validateStateLeases(admission)` is a read-only check that the host actually
  provisioned fresh state and can reserve the supplied leases for this admission.
  The store does not provision resources, establish an issuer or infer freshness
  from a caller-generated UUID. The host remains responsible for synchronizing its
  external authority and physical lease checks with its controller.

Repeated identical input documents are stored once, including when the selected
round is the qualification matrix itself. Different bytes under the same immutable
document identity are refused.

One bounded registry per scope makes lease claims atomic across scenarios sharing
that registry. A commit checks the scenario version, exact allowed projection
transition, complete selection/allocation, epoch and immutable definition bindings.
It then rechecks authorization and the registry version and appends the projection
and admission in one synced record. Competing writers publish one winner. A lease
identity cannot be reused by changing its revision/digest or by selecting another
scenario in the same scope. Other scopes and distributed resource pools need their
own trusted coordination owner; this is not a tenant isolation boundary.

`stage(definition, selections)` stores an immutable replacement without changing
the current definition, epoch, approval or coverage. Re-staging identical bytes
is a no-op. `invalidateScenario` must name a new revision of the same definition;
it retains history, advances the epoch, clears activation authority and degrades
the projection. Invalidation that commits while registration checks state makes
the older registration lose its CAS. Direct port calls cannot manufacture an
active projection or skip the epoch/version rules.

Reopening the ledger recovers admission and projection together. If a commit's
acknowledgement is lost, inspect the registered history and resolve its immutable
admission reference. An old token conflicts; it does not register another attempt.
Historical reads do not establish current execution or activation authority.
Caller mutations cannot rewrite returned or stored records. Closed, ownership-lost
or uncertain ledger handles retain the underlying ledger's refusal behavior.

The prototype permits 100 scenarios, 500 total admissions and 2,000 definition/
selection records in one registry. Exhaustion requires archival indexing; history
is never silently dropped. The state directory must stay private to the trusted
controller and inaccessible to candidate processes. Local hashes and projection
states are not signatures or hosted approval receipts.

The [terminal result index](qualification-results.md#durable-local-terminal-results)
retains complete rounds through the existing result sink. The
[activation adapter](scenario-activation.md#local-atomic-storage) publishes the active
projection, receipt and assessment records in one scenario-registry append.
This adapter does not install physical lease provisioning, hosted source/issuer
authorization, promotion/structural-validation transitions or CLI lifecycle commands.
[Registered qualification execution](qualification-registration.md#executing-a-registered-round)
requires a separate authenticated runtime owner and uses the admission's allocated
cell identities. Requests without that owner and all activated regression requests
remain refused. A registration record cannot relabel trial evidence as qualification.

Tests use real journal bytes, reopen recovery and competing operations. Host
authentication, structural promotion and physical lease checks are explicitly
simulated in those storage tests. No live database, paid model or OrgX decision is
created or approved by this adapter.
