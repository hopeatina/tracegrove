# Qualification registration and invalidation

`registerQualificationRound` creates a sealed pending admission before execution. It requires an exact scenario revision token, a structurally validated definition, its complete frozen selection matrix and fresh leased-state refs. A new campaign and per-cell execution/attempt identities are allocated together with the next monotonic round sequence.

The prototype uses `SelectionManifest` as the qualification matrix. Its policy, required case/persona/target strata and exclusions are frozen; the round selection must match them exactly. Every scenario case must retain a required matrix cell. Changed personas/targets, empty or duplicated cells, unexplained exclusions and dropped required cases are refused. The exported `qualificationStrataDigest` uses stable code-unit ordering across hosts.

`ScenarioPorts` are trusted host ports, never candidate/plugin inputs. `validateDefinition` must resolve and validate the exact review, replay-contract, matrix, policy and target-profile closure. `compareAndSwap` must atomically verify/reserve the submitted state leases, enforce ownership/fencing/freshness, append the admission and update the projection, or publish none of them. This API does not provision physical state or grant per-cell effects. It does not install that storage adapter.

Snapshots include all registered admissions, including rounds still pending or later failed; the admission itself carries no outcome claim. The projection's latest sequence must match complete, scoped, sealed history. Reused campaign/execution/attempt/lease identities and incomplete histories are conflicts. A lease cannot become fresh by changing its revision or digest. An exhausted 500-round prototype history blocks until an authoritative archival index is supplied; it never silently drops earlier registrations.

Registration increments aggregate version and latest-round sequence without activating coverage. Any older activation snapshot must therefore conflict even before the newest round completes. Concurrent registration/invalidation uses the same aggregate-version CAS. Losing writers publish no admission and do not advance the epoch.

`invalidateScenario` requires a new immutable definition revision of the same scenario, advances the invalidation epoch, clears activation authority and moves coverage to `degraded`. It retains historical round records. Retired coverage cannot be resurrected through this operation. An observed product regression does not itself call semantic invalidation or remove its detecting case.

Terminal campaign binding is available through [qualification result reduction](qualification-results.md), followed by [read-only replay assessment](replay-assessment.md) and [explicit activation](scenario-activation.md). [LocalScenarioStore](local-scenario-store.md) supplies durable local registration/invalidation and scoped lease-identity claims on the existing ledger, with required host authority callbacks. Promotion, structural-validation transitions and hosted persistence remain open. A registration record is neither a passing round nor release coverage.

## Executing a registered round

The SDK can prepare a new qualification request from an unchanged frozen trial or
work-proof plan. This creates new sealed request, fidelity and fixture documents;
it does not read, rewrite or promote trial receipts.

```ts
const owner = localQualificationExecutionOwner(store, authorizeEffects);
const qualified = await prepareQualificationExecution(
  frozenPlan, admission.ref, scope, ledger, owner,
);
const run = await executeBundle({
  bundle: qualified, scope, ledger, stateDir, qualification: owner,
});
```

The store must use this exact ledger and state directory. `authorizeEffects` is a
trusted host capability checked before host start, fixture creation and each
forward step. It must establish actual permission to affect the selected target;
read and registration permission alone do not suffice. The store rechecks current
definition, invalidation epoch, reviewed closure and physical leases around each
authorization await. Cleanup remains available after forward permission is revoked.
External authority synchronization and provider fencing remain host responsibilities.

Every cell uses its registered execution and attempt IDs. A single durable claim
binds the admission to the complete frozen request, independently of caller retry
keys. Terminal redelivery returns the recorded summary without repeating effects.
An incomplete claim, including a lost publication acknowledgement, requires
reconciliation; it never automatically replays preallocated effects. Execution
directories cannot overwrite existing evidence. The trusted controller must keep
its ledger and evidence directory inaccessible to candidate processes.

Pass resulting bundles to `reduceQualificationRound` with the persisted admission
resolver and independent issuer authentication. Structural bundle verification
alone does not establish an authentic qualification result. Local tests use real
native HTTP effects and durable registration, with explicitly simulated host
authorization, reviewed-source and physical-lease callbacks.

There is no automatic CLI qualification owner. Qualification without an explicit
runtime owner, a trial disguised with lifecycle refs, and activated regression
requests remain refused. This SDK path does not activate coverage or prove hosted
source, issuer, lease provisioning or release authority.
