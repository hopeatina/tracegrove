# Local acquisition recovery gate

The executable local path records ownership in the existing fsynced, single-writer ProjectionLedger. Each new execution initializes `ownership:<executionId>` with its scope, immutable request digest, campaign, attempt and generation. Host and fixture reservations precede workspace acquisition/host startup or application-API create. Observed physical IDs are acknowledged before readback/steps, and cleanup moves through pending to removed only after the existing trusted host stop or registered deletion plus absence readback confirms it. Internal typed host and fixture acknowledgements remain separate: a fixture named `host.process` or `host.workspace` cannot borrow a successful host acknowledgement from the legacy public display-key arrays.

No credentials or fixture request/cleanup arguments are added to this inventory. Physical resource IDs and native workspace/process identities remain private operational metadata in the existing private ledger. The owner must protect that directory.

After controller interruption, redelivery of the same frozen idempotency key checks the prior inventory before admitting a new attempt. Reserved, observed or cleanup-pending entries block with `ownership_reconciliation_required`. Legacy interrupted attempts without inventory block with `ownership_inventory_missing`. Wrong request/scope/attempt/generation cannot discharge the inventory. Cleanly recorded removed inventory permits a fresh attempt through the existing admission path; an empty initialized inventory means no acquisition was reserved. Existing finalized redelivery returns its existing result without replaying effects.

This is deliberately a recovery gate, not an automatic janitor. A controller crash after a real acquisition but before its acknowledgement leaves a durable reservation even if the native supervisor subsequently cleans up. No cleanup acknowledgement is invented from supervisor exit, workspace disappearance, an old PID or elapsed lease time. There is no automatic cross-process takeover/deletion or credential reconstruction, and no operator command to discharge unresolved inventory in this slice. Such cases remain blocked pending a separately reviewed reconciliation path with independent ownership and cleanup evidence. Do not edit ledger records to bypass the gate.

The actual local supervisor still handles ordinary controller disconnect and cleanup. A persistence failure must not prevent best-effort cleanup of resources already known in memory; it does prevent a successful durable completion acknowledgement. A process/power loss during the ledger write inherits the ledger's existing uncertain-write and corrupt-tail behavior.

Tests exercise real native acquisition and application-API fixture create in subprocesses, kill the controller before the executor receives their acknowledgements, reopen the actual persisted ledger, and prove redelivery performs no second acquisition. Other tests exercise native/sample cleanup, reservation/acknowledgement ordering, invalid cleanup transitions and foreign binding rejection. They do not qualify a remote provider, shared-resource fencing, distributed leases, machine power-loss recovery, or a durable supervisor-to-controller cleanup journal. Atomic artifact publication is a separate milestone.

## Read-only recovery inspection

```sh
tracegrove recovery-status --state-dir <owned-state> --execution <execution-id> --json
```

This command reads an existing checkpoint without opening `LocalLedger` for writing. It creates
no directories, locks or credentials, does not contact a controller, and never probes or kills a
PID. It does not append interrupted/finalized transitions, delete resources, discharge ownership,
sync a commit, resume a run or admit an acquisition. The existing execution path remains the
authority for all recovery and admission decisions.

The strict `tracegrove.recovery-status/v1` report includes a journal sequence/content digest,
lock presence (not process liveness), recorded phase, counts by resource kind/state, bounded
evidence status, static recovery guidance and an optional verified **historical** outcome.
It omits raw journal records, resource keys, physical IDs, PIDs, paths, controller tokens,
cleanup arguments and candidate diagnostics. The checkpoint digest identifies selected local
bytes; it is not a signature or an admission token. The local process scope and filesystem owner
must already be authorized to inspect the private state directory.

The journal uses the same schema/sequence/version parser as the existing writer. Inspection is
bounded to 16 MiB and 100,000 records; oversized, nonregular, linked, malformed or partial inputs
fail closed. The directory identity, journal bytes and lock fingerprint are checked before and
after capture and again after evidence inspection. Concurrent changes return an explicit changed
checkpoint rather than a ready result. This is a checkpoint observation, not a promise that a
live writer cannot change state after the command returns or confinement against hostile parent
replacement during filesystem operations.

Ownership counts describe the journal's recorded states, not newly observed absence. The
committed-bundle path reuses the executor's exact ledger/request/selection/scope/attempt/generation/
receipt binding checks and full bounded bundle reduction. Exit 0 means either matching finalized
historical evidence or a recorded interrupted commit available for normal readback; exit 2 means
another state or unavailable/invalid evidence. Every report says `actionAuthority: none`,
`execution: not_started_by_inspection` and `verificationVerdict: not_evaluated`. Unknown cleanup
remains unresolved even when a workspace disappeared or a controller exited. A stale lock does
not itself record interruption; only normal trusted writer reconciliation can do that.

Automatic janitor/discharge, durable supervisor acknowledgements and provider recovery remain
separate gates. The supervisor's current `host.cleaned` message is ephemeral IPC. Adding cleanup
authority requires bound ownership/cleanup evidence admitted by the existing exclusive ledger
writer; this status command provides neither that evidence nor a new journal.
