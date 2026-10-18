# Structural validation before qualification

`LocalScenarioStore.propose(definition, selections)` stores an authorized immutable
scenario in `proposed` state. Qualification registration refuses that state.
`validateScenarioStructure(ports, token, frozenPlan)` performs static checks and
records the transition to `validating`. It can also revalidate a `degraded` revision
after semantic invalidation. It does not run the candidate or claim functional PASS.

```ts
await store.propose(definition, [qualificationMatrix, selectedRound]);
const validation = await validateScenarioStructure(
  store.structuralPorts({ authorizeValidation }),
  exactScenarioRevisionToken,
  frozenTrialPlan,
);
```

The plan must be a sealed trial/work-proof request without lifecycle refs or plan
blockers. Its cases, personas, target cells and exclusions must exactly match the
scenario matrix. The implementation shares the executor's actual document resolution,
capability reproduction, fixture/fidelity checks and case compiler. Missing fixture
plans, changed fidelity, unsupported capabilities and unresolved/modified documents
fail before a host, fixture operation or provider starts. Matrix policy is taken from
the scenario's reviewed definition; this operation cannot change that matrix.

The authenticated host supplies `authorizeValidation(scope, intentDigest)`, returning
the current actor and authorization policy for the exact token, frozen request and
executable-closure digest. Source/review/definition checking remains the store's
required `validateDefinition` responsibility. No permission or independent source
validation is inferred from a caller's success flag. Proposed storage is not the
source-plan promotion manifest; that integration remains separate unfinished work.

The local adapter recompiles the supplied closure and rechecks definition and actor
authority before publishing the sealed `workflow.scenario-structure/v1` receipt and
validating projection in one synced registry entry. A competing edit, invalidation or
authorization change publishes no validation. The receipt records the exact scenario
token, request, qualification matrix, executable closure, actor, policy and timestamp.
It clears current qualification/activation refs without deleting historical evidence.

Repeated identical deliveries recover one receipt, including after lost acknowledgement
or journal reopen. Historical receipt retrieval requires current validation permission;
it does not reverse later invalidation or prove that coverage remains validating now.
Revalidation of a replacement definition uses a new token and preserves its advanced
invalidation epoch. Keep the original frozen plan alongside the receipt: the digest
binds that plan but does not make the receipt an executable bundle.

The index is bounded to 500 structural records per scope and refuses exhaustion rather
than dropping history. Existing journals read with empty structural history. The earlier
`initialize` API remains a trusted-host import of an already structurally validated
scenario; it does not produce this receipt and requires the host to establish both
promotion and validation authority before calling it.

This is protected local single-writer storage. It does not install hosted IAM, physical
state leases, source-plan promotion, CLI lifecycle commands, live qualification or
activation. Tests use real journal bytes and static compilation; one positive test then
executes two newly admitted native cells. Host/source/review/effect authority is explicitly
simulated, and structural success alone is never reported as application success.
