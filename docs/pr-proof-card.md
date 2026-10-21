# The PR proof card

One comment on each pull request, updated in place, saying whether every claim held on that commit. It is built from the same readiness state as `tracegrove readiness`, from runs saved on disk, so it can't say more than the evidence does.

```yaml
# .github/workflows/tracegrove.yml
name: tracegrove
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  proof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - uses: hopeatina/tracegrove@codex/bootstrap
```

## What the card shows

- **The verdict:** every claim holds, some claim fails (with the step and message), or some claims didn't run to a verdict.
- **Critical claims waiting for a person.** They pass, but `risk: critical` claims need `tracegrove accept` before readiness is green.
- **Every claim**, folded: which channels it checks (HTTP, browser, voice, chat, MCP, jobs), whether the evidence holds, and who signed off.
- **A link to the handoff reports**, uploaded as a workflow artifact.

A failing claim also becomes an error annotation on its flow file, and the step fails unless `fail-on-contradiction: false`.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `directories` | `.` | Folders with a `tracegrove.config.yaml`, one per line |
| `run` | `true` | Run `tracegrove test` in each folder first; `false` when an earlier step already ran them |
| `env` | `local` | Environment to test |
| `tracegrove` | `npx --yes tracegrove` | The command that runs tracegrove |
| `title` | `tracegrove` | The card's heading |
| `comment` | `true` | Post or update the PR comment; the card always goes to the job summary |
| `fail-on-contradiction` | `true` | Fail the step when a claim fails |
| `preview-url` | | This PR's preview address, exported as `PREVIEW_URL` ([per-PR previews](environments.md#previews)) |
| `signing-key` | | Ed25519 private key (PEM) that signs every verified run ([signed evidence](signed-evidence.md)) |
| `attest` | `false` | Also publish a keyless GitHub artifact attestation for each handoff report |

On pull requests from forks the token is read-only, so the comment is skipped and the card appears in the job summary only.

## Without GitHub Actions

`tracegrove card [<dir>...] [--commit <sha>] [--link <url>] [--out card.md] [--json]` prints the same Markdown. The JSON (`tracegrove.card/v1`) has the verdict, totals and failures, with flow paths relative to the current folder.

## Limits

"Verified" means the bundle's digests check out on the runner. Without `signing-key` or `attest`, that doesn't tell a third party who produced it. With them, runs are signed by a key committed in `tracegrove/signers/` and handoff reports carry a GitHub attestation of the workflow that made them ([signed evidence](signed-evidence.md)).
