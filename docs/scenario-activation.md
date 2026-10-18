# Explicit scenario activation

`activateScenario(ports, intent)` consumes an exact scenario revision token, replay/policy/matrix/target references, an explicit selection of terminal round references and a scoped idempotency key. It returns a sealed `workflow.scenario-activation/v1` receipt. Actor identity and the authorization policy come from the authenticated host's `authorizeActivation(scope, intentDigest)`; callers cannot submit an actor, approval flag or readiness result.

The operation requires a validating scenario, checks all expected definition bindings and re-derives replay qualification from authenticated complete evidence. The selected set must satisfy the policy's independent-round minimum and include the latest admitted qualifying round. Duplicate or foreign rounds, mock-only proof, a newer pending round and stale scope/version/epoch are refused. Existing matrix, history, issuer and bundle guards are shared with replay assessment.

`compareAndSwapActivation` is an atomic authority boundary. In one transaction, the host must compare validating state, aggregate version, definition and replay/policy/matrix/target digests, epoch, latest admitted sequence, exact immutable selected result refs and current activation authorization. It must enforce the scoped idempotency key and publish the assessment/finding records, activation receipt and active projection together, or publish none. The selected-result check still matters when a result index changes without advancing the scenario version. A registered newer round or semantic invalidation must conflict with an older activation attempt. The local adapter below uses the existing journal; hosted transaction storage remains a separate host integration.

Repeated round order is normalized. An already committed identical intent returns its original receipt without another write, including after a lost commit acknowledgement or concurrent identical delivery. Reusing the key for a different intent conflicts. Authorization runs before historical receipt lookup too. Returning an earlier activation receipt does not assert that coverage remains active now: a later semantic invalidation or retirement remains in effect, and retries cannot resurrect it. Read the current projection to establish current state.

This API cannot activate proposed, degraded, active or retired projections through a fresh intent. Promotion and successful structural validation must first establish validating state through their own authority. Product regressions remain visible through qualification/release evidence; they do not implicitly call semantic invalidation or remove the detecting case.

## Local atomic storage

`LocalScenarioStore.activationPorts(results, authority)` connects explicit activation
to the scenario registry and `LocalQualificationResults` on the same `LocalLedger`.
It reuses the public decision validator and independently rederives replay assessment
inside the commit boundary. Submitted readiness flags, actors, reports and projections
are compared with freshly derived values; they cannot grant authority.

```ts
const ports = store.activationPorts(results, {
  resolvePolicy,
  authorizeActivation, // Current authenticated owner and policy for this exact intent digest.
});
const activation = await activateScenario(ports, intent);
```

The adapter checks the scenario registry version, complete result-index version and
captured archive manifest digests after its final activation authorization await.
There is no await between those checks and the single synced append containing the
active projection, receipt and full assessment/finding records. An unrelated change
to the scope's registry or result index can conflict conservatively; retry from a
fresh snapshot. Revocation and physical/provider fencing outside this local writer
still require the host to synchronize its authority checks with its controller.

Idempotency keys are unique across scenarios in the scope. Reopen reads the complete
activation and projection from the same journal entry. A write failure publishes
neither; a committed entry with a lost acknowledgement returns its original receipt
on retry. Historical retrieval requires current activation authorization and never
reverses a later invalidation. Existing registration-only journals read with empty
activation history; an active projection without its persisted receipt is refused.
The scope permits 500 retained activations before explicit archival indexing is needed.

Tests use actual registered native/mock execution, the immutable result sink and
durable scenario journal, alongside the earlier in-memory consumer tests. They cover
concurrency, lost acknowledgement with reopen, pre-write failure, forged submissions,
registration/invalidation/revocation/archive/index races and corrupt persisted reports.
Host, reviewed-source, physical-lease and issuer authority are explicitly simulated.
These proofs do not establish hosted activation, deployed staging qualification or
live regression admission. [Structural transitions](scenario-structure.md) have a local
adapter. Source-plan promotion, hosted persistence and
activated regression execution remain open.
