# Tracegrove (`workflow-verify`)

Portable workflow verification: prepared state, independently observed actions, sealed
evidence. This is the Phase 1a implementation of the plan in
`orgx/docs/architecture/workflow-verification-platform.md`. Working name; private prototype;
nothing here is a shipped runner or a production claim.

What exists and is exercised by tests:

- Canonical JSON codec with shared vectors and SHA-256 self digests (`ref.digest` excluded).
- Strict versioned schemas (Zod 4) exported as JSON Schema under `schema/`, checked in sync.
- Project corpus loader: YAML/JSON beside the product source, `{ $file: ./path }` references
  frozen into exact refs, a frozen corpus manifest, digest-verified lookup.
- Compiler, planner (`plan` is side-effect free and returns blockers with owner and action),
  admission with idempotent redelivery, local single-writer ledger with stale-lock recovery.
- Executor: local process host with launcher-computed identity attestation and issued
  credentials, mock loopback host for the `mock_contract` lane, real HTTP driver with
  per-operation deadlines, registered fixture actions with independent readback and
  reverse-order cleanup, boundary observations, sealed receipts, trusted reducer.
- Evidence bundle writer and `verify-bundle`, which rehashes every file, rechecks every self
  digest, re-derives assertions from the frozen case and re-reduces the verdict.
- `workflow-verify` CLI: `sample-config`, `validate`, `doctor`, `plan`, `cases`, `rerun`, `controller`, `seed --preview`,
  `run`, `inspect`, `export`, `verify-bundle`, `schema`. Exit codes 0/1/2/3/4.
- A real file-backed notes API sample with its corpus, plus an offline contract lane.

The local controller owns an exclusive ledger and accepts authenticated loopback commands
for one project. CLI runs delegate to that writer; concurrent redelivery reconciles the same
execution. Case lookup uses bounded pages with snapshot-bound cursors. `rerun` freezes a fresh
campaign while preserving case digests and original request lineage.

The POSIX local host uses a trusted supervisor with an IPC ownership channel. If
the controller is killed, the supervisor terminates the application process group
and removes its owned workspace. A process-kill test checks both effects. This
does not establish recovery after the supervisor itself is killed, distributed
fencing, or cleanup of external provider resources. Windows local launches are
blocked until a process-tree ownership implementation exists.

Bundle verification checks sealed required files, host capability records, target attestations,
fixture completeness and boundary observations. It rejects empty/traversal manifests and
producer resealing that removes required observations. This verifies portable integrity and
record consistency; the importer still needs its own issuer trust and access policy.

`verifySourceCitation` checks exact repository/commit/path identity, document and
file digests, and inclusive line excerpt bytes through authorized trusted host ports.
It preserves UTF-8 and CRLF bytes, rejects traversal, unsupported files and unavailable
objects, and never falls back to the current checkout. These checks establish cited
source bytes; connecting citations to change elements and review policy remains open.

The initial Phase 2 review API (`editPlan`, `reviewPlan`) binds exact source-plan
digests and scopes. Every specification edit clears its review. Concurrent edits and
reviews use a host-owned atomic compare-and-swap port; losing writes publish neither
review nor projection. Reviewer identity and policy come from authenticated host
admission. Tests exercise stale tokens, concurrent writers, resolver tampering and
denied authority. This API has no hosted store, execution-admission integration or
scenario activation. Resolving and validating source citations and coverage policy
remain separate work; these records alone are not authority for product execution.

Not implemented yet (see `open-decisions.md` in the plan): browser/Playwright runner,
source selection resolver, complete review/qualification lifecycle, authoring inference, hosted
coordinator, `seed --apply`, distributed crash recovery and required media capture.

## Zero-OrgX quickstart

```text
npm install && npm run build
node dist/cli/main.js sample-config --sample notes-api --output ./notes
node dist/cli/main.js doctor --config ./notes/verification/workflow.yaml
node dist/cli/main.js plan --config ./notes/verification/workflow.yaml --output ./out/request.json
node dist/cli/main.js run --request ./out/request.json
node dist/cli/main.js verify-bundle --bundle ./notes/verification/.workflow-verify/executions/<id>
```

No OrgX account, database, Docker, Python or model call is involved. The real sample's
proof claim is local application behavior at the attested source digest, not deployment.

## Checks

```text
npm run verify            # typecheck, schema sync, unit and end-to-end tests
npm run test:conformance  # verifier conformance cases (refusals and non-green results)
```

## Repository provenance

This private repository was extracted with `git subtree split` from
`hopeatina/orgx:packages/tracegrove` at OrgX commit
`6da4205e0cef9fbd75b0e8e04cdfc6d5de669910`. The extracted bootstrap commit is
`92f163c49812e373bdb04550ea3771b278eab0cd`.

`codex/bootstrap` is the initial default branch. Changes remain reviewable in a PR;
no release has been published. The standalone sample installs a pinned package archive,
so its CI needs no cross-repository credential.
