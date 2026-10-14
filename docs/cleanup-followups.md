# Signed cleanup follow-ups

An executing worker's cleanup report cannot release a hosted persona. A separate
collector may sign a follow-up after observing the execution-owned resources.
The follow-up is a new immutable record; it does not rewrite the attempt receipt.

The ownership ledger supplies a `CleanupExpectation` containing the exact scope,
attempt, worker, fencing generation, coordination version, admitted effects,
unresolved effects and owned resource identities. HTTP absence and host stop are
distinct obligations. The collector signs the canonical follow-up with an
Ed25519 key kept outside the executing worker. Its scope-bound observer grant
comes from protected control-plane configuration, not from the submitted proof.

`verifyCleanupFollowup` validates the signature against that configuration and
the complete expected manifest. It rejects unknown/revoked keys, executing-worker
signers, altered bindings, changed resource/effect closure, unresolved effects,
missing or wrong-kind observations, duplicate identities and stale/future evidence.
The evidence window is at most five minutes. Status-only HTTP absence requires a
GET/HEAD observation returning 404 or 410; a 200 response cannot qualify.

The signature includes the algorithm, key ID and follow-up under the
`tracegrove.signed-cleanup-followup/v1` domain separator. The signature field is
excluded from signed bytes; the returned proof digest covers the complete envelope.
The expectation digest includes every expectation field. Base64url signatures
must use canonical unpadded encoding. Key IDs select configured public keys;
the verifier never trusts a public key carried by the proof itself.

## Offline inspection

```sh
workflow-verify verify-cleanup --proof followup.json \
  --expectation expected.json --trust observers.json --json
```

The trust file uses this shape, containing public keys only:

```json
{
  "schemaVersion": "workflow.cleanup-observers/v1",
  "observers": [{
    "keyId": "configured-collector-key",
    "scopeId": "workspace-scope",
    "observerId": "independent-collector",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
  }]
}
```

Exit 0 means the supplied files pass signature and expectation checks. Exit 2
means validation failed. JSON output always reports `hostedReleaseAdmitted: false`.
Inputs are limited to 4 MiB per file. A local trust file is useful for inspection
and cannot configure a hosted authority or provision a signing key.

## Remaining hosted requirements

The control plane must independently establish ownership and provider receipts,
qualify the collector and provision/revoke its protected signing authority.
The storage owner must load the current expectation and lease, recheck time and
fencing under its admission lock, then append cleanup admission and persona
release atomically. This verifier does not implement that storage transaction,
prove provider absence from a digest alone, or authorize compensation actions.
Worker release through the ordinary coordination port remains refused.

Local tests use ephemeral keys. One native HTTP case rejects observed presence,
deletes an owned test resource and verifies a separately observed absence; it is
local conformance evidence, not a qualified staging or provider receipt.
