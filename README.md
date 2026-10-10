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
- `workflow-verify` CLI: `sample-config`, `validate`, `doctor`, `plan`, `seed --preview`,
  `run`, `inspect`, `export`, `verify-bundle`, `schema`. Exit codes 0/1/2/3/4.
- A real file-backed notes API sample with its corpus, plus an offline contract lane.

Not implemented yet (see `open-decisions.md` in the plan): browser/Playwright runner,
source selection resolver, review/qualification lifecycle, authoring inference, hosted
coordinator, CLI delegation to a running local controller, `seed --apply`.

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

## Moving this directory to its own repository

The package is self-contained. From the orgx checkout:

```text
git subtree split --prefix=packages/tracegrove -b tracegrove-main
git push <tracegrove-remote> tracegrove-main:main
```

`.github/workflows/ci.yml` in this directory becomes the new repository's CI.
