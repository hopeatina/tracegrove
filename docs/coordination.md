# Shared coordination transitions

`transitionCoordination` implements a deterministic state transition for one
shared budget/persona domain. Its snapshot is separate from execution receipts.
It does not grant provider authority or establish a workflow verdict.

Reserve the full attempt cap and exclusive persona together. Reservations remain
charged after failure, expiry, recovery and cleanup. An attempt ID cannot be
reserved twice. A provider effect ID can be admitted once; a lost response
requires provider readback rather than another write.

Expiry does not release a persona. Recovery assigns a higher generation and a
new worker in `reconciling` state. That worker can collect provider state and
cleanup evidence; it cannot admit another effect. Old workers fail their fence
check. A separately admitted cleanup proof permits release and persona reuse.
The ordinary `commitCoordination` port refuses release commands.

The storage adapter must authenticate the owner and worker, verify immutable
scope/budget policy, and compare-and-swap the entire shared domain atomically.
It must obtain and recheck authoritative time at the transaction's admission
point. A timestamp returned by an earlier read is insufficient for distributed
lease admission. Protected output writes must validate the same generation.
The adapter independently verifies cleanup evidence before accepting a release.
Snapshot validation or an in-memory CAS test cannot establish those guarantees.

Local tests cover simultaneous last-budget admission, persona exclusion, expired
lease quarantine, takeover fencing, persisted uncertain effects, retained spend,
scope/version substitution and ordinary-caller cleanup rejection. The storage
adapter, live PostgreSQL race tests and provider reconciliation remain required
before enabling hosted execution.

## Recovery ownership

Takeover requires an explicit bounded `ttlMs` (at most five minutes) and creates
a fresh reconciliation lease. The current worker may heartbeat that lease, but
cannot admit new effects. Expired heartbeat and release commands fail; another
worker must recover with a higher fence before cleanup can release the persona.
