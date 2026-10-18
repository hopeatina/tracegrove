# Complete terminal qualification rounds

`reduceQualificationRound(ports, { admissionRef, scope, bundleDir })` reads a single verified bundle snapshot and binds its entire campaign to an authentic previously registered admission. It returns a sealed `workflow.qualification-round/v1` document containing the exact admission, campaign and terminal receipt references. Redelivery of identical evidence produces the same result reference and digest.

Every selected cell needs exactly one terminal receipt with its preallocated execution and attempt identity. Missing cells, duplicate allocations, substituted scope/campaign/selection/policy/strata, mismatched scenario references and invalid raw evidence are rejected. The bundle reader reapplies the full saved cell and campaign guards, including assertions, identity observations, capture, cleanup and receipt bindings. No caller-supplied success count replaces those checks.

The host owns `authorize`, `resolveAdmission` and `authenticateEvidence`. The admission resolver must read authentic persisted registration and reserved state, not accept an imported producer document as registration. Evidence authentication must validate the exact definition/replay/policy/matrix/target closure and issuer/effect authority against the captured bundle manifest digest. A host without those implementations must refuse the operation. Callbacks receive separate copies so mutation cannot rewrite the result being sealed. The reducer publishes no persistence write; a host must store the result with its immutable admission binding and enforce idempotency/conflict handling.

Complete failed, blocked, cancelled, inconclusive and mock campaigns remain terminal evidence. A result has neither `qualifies` nor a live proof level. It does not activate coverage. [Replay assessment](replay-assessment.md) derives independent-round readiness, latest-round and epoch checks and policy-specific revision proof. [Explicit activation](scenario-activation.md) supplies an atomic host contract and local journal adapter. A historical terminal result can be retained after invalidation without becoming eligible for current activation.

[Registered SDK execution](qualification-registration.md#executing-a-registered-round)
uses actual persisted admissions and allocated cell identities with an explicit runtime
owner. Qualification without that owner and activated regression execution remain blocked.
Older consumer fixtures simulate registration around real observations; they do not prove
authentic hosted qualification.

## Durable local terminal results

`LocalQualificationResults` connects this reducer to the existing `LocalResultSink` and
`LocalLedger`. It retains a complete immutable bundle before atomically publishing the
admission-to-round index. It does not create a second archive, database or readiness flag.

```ts
const results = new LocalQualificationResults(ledger, scope, {
  authorize: authorizeResultRead,
  authorizeRetention: authorizeResultRetention,
  resolveAdmission: (ref, scope) => store.resolveAdmission(ref, scope),
  authenticateEvidence,
});
const saved = await results.retain({ admissionRef: admission.ref, scope, bundleDir });
// Supply this resolver to ReplayAssessmentPorts:
const resolveRound = (admission) => results.resolveRound(admission);
```

All authority callbacks are required. Read permission, retention permission and issuer
authentication are distinct. Registration must come from an authoritative owner; the
result sink's integrity check does not authenticate a producer. Every historical lookup
rechecks permission, persisted admission, raw bundle integrity, issuer authentication,
manifest digest and exact terminal round bindings. Pending work returns null only after
checking authentic registration. Broken or inaccessible retained evidence raises an error.

Both outcomes and raw bytes remain available after the producer's directory is deleted.
Duplicate and concurrent retention of the same admission/manifest converge on one index
record. Different bytes under an existing round conflict. The sink accepts an expected
manifest digest, so bytes changed after issuer authentication cannot claim the campaign
in the generic index. A crash before index publication
can leave an integrity-checked generic result, which stays pending as a qualification round;
retry reconciles it. A lost acknowledgement after publication recovers the original round
after reopening the ledger. Neither recovery path executes the candidate again.

The bounded index permits 500 rounds per scope and requires archival indexing at capacity;
it never drops failures or pending admissions to make coverage pass. The controller must
protect the state directory from candidate writes. This is local single-writer storage,
not distributed fencing, hosted IAM, physical lease provisioning or atomic activation.
Tests include real registration and native HTTP effects, producer deletion, journal reopen,
lost publication acknowledgements, concurrent retention, permission/issuer revocation and
byte replacement across authorization awaits. Two independent real registered campaigns
feed replay assessment through this index. Host, source, physical-lease and issuer authority
are explicitly simulated; hosted qualification and release coverage remain unproven.
