# Persona pools

Tracegrove can select an admitted physical persona from a frozen pool in the
same coordination transition that reserves budget. Pool configuration binds a
logical persona and environment to explicit member IDs and limits. It contains
no passwords, cookies, tokens, or credential grants.

`transitionPersonaPools(snapshot, scopeId, expectedVersion, definitions)` is a
pure owner-side transition. The storage adapter must authenticate the owner,
check its admitted inventory, and commit atomically. Every existing lease must
be independently released before membership can change. Workers cannot change
membership through `commitCoordination`.

Submit `reserve_pool` with the exact frozen `poolRef`, `personaRef`, and
`environmentRef`, plus `attemptId`, `workerId`, `reservedCents`, and `ttlMs`.
Selection uses the least historically reserved available member, with ASCII ID
order breaking ties. One physical member can belong to only one configured
pool. Ordinary `reserve` cannot bypass pool admission for a pooled member.

`maxConcurrent` and `maxPerWorker` count every unreleased lease. Expiry does not
release a member or return reserved budget. Recovery transfers the fence for
cleanup only; it cannot emit new effects. Heartbeats and recovery must stay
within `maxLeaseMs`. Each new reservation must also fit
`reservationCeilingCents` and the shared remaining budget. These limits provide
bounded allocation, not a durable fair queue between tenants.

The trusted storage owner must independently admit cleanup evidence before
reuse. A worker-supplied cleanup claim is refused by `commitCoordination`.
Changing pool definitions does not erase historical reservations or their
original pool references. Existing snapshots without `personaPools` retain
their original shape and ordinary admission behavior.

For a recorded operator view:

```sh
tracegrove pools --snapshot coordination-snapshot.json --json
tracegrove pools --snapshot coordination-snapshot.json --pool pool:test
```

`inspectPersonaPools(snapshot)` returns the same typed report. Both inspect the
supplied snapshot without contacting a broker, validating a live lease clock,
reserving a member, or issuing credentials. Availability means recorded
availability in that snapshot. The trusted adapter must recheck it under its
lock and clock when admitting a reservation.

The SDK and CLI do not configure a live environment. Qualifying an OrgX
deployment, an issuer, and application-specific persona credentials remains a
separate integration step.
