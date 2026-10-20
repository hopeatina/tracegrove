---
name: tracegrove
description: Verify a web app's behaviour with tracegrove in any environment (local, docker, staging, production read-only). Use when asked to test, verify or check flows, run tracegrove, test against staging, or fix failing tracegrove flows. Wraps the loop env doctor -> explain -> test -> heal and respects each environment's agent policy.
---

# tracegrove: doctor, explain, test, heal

tracegrove runs behaviour flows (`tracegrove/**/*.flow.yaml`) against a real app and seals verified
evidence. Every command takes `--json` and returns `schemaVersion`. Exit codes: `0` pass, `1` assertion
failed (the app or the flow is wrong), `2` blocked (a prerequisite is missing), `3` infrastructure, `4` cancelled.
If the `tracegrove` MCP server is connected, call its tools (`env_doctor`, `explain`, `test`, `heal`)
instead of the shell commands. They return the same JSON.

## Starting from nothing

If `status` says there is no `tracegrove.config.yaml`, set the repo up before anything else:

1. `init` (or `tracegrove init --json`). Read `detection`: if the adapter is `command` or the reason says it
   guessed, check the start command before going on. Add the returned `snippet` to the app's test-mode auth
   so personas work, guarded so it can never run in production.
2. `discover` (or `tracegrove discover --json`). Draft flows for uncovered routes in risk order: writes over
   reads, money and permissions first. Every write gets a separate readback, and every owned resource gets
   a check that another persona is denied.
3. `check`, then `test` on `local`, then the loop below.

## Pick the environment

1. `tracegrove env list --json`. Use the environment the user named. Otherwise use `local`. Never pick
   staging or production on your own.
2. Read the environment's `class`, `writes` and `agents`:
   - `agents: deny` means stop. Tell the user that a person must run it.
   - `agents: ask` means your run will exit `2` with `approval_required`. Tell the user to run
     `tracegrove approve --env <env>` themselves, then continue. Never run `approve` yourself, and never
     create `.tracegrove/approvals/`.

## The loop

1. **Doctor.** Run `tracegrove env doctor <env> --json`.
   - Exit `0` (`status: ready`): continue.
   - Otherwise, for each failing check, act on its `fix` only if `owner` is `agent`. If `owner` is
     `developer` or `operator` (for example `aws sso login`, `eval $(op signin)`, a missing grant or a
     wrong persona secret), stop and give the user the exact `fix` command.
2. **Explain.** Run `tracegrove explain --env <env> --json`. Check `wouldRun`, `cells[]` (personas,
   writes, cleanup) and `skipped[]`. If `blockers[]` is not empty, report them with their `fix`.
3. **Test.** Run `tracegrove test --env <env> --json`, or `--grep <case>` for one flow.
   - Exit `0`: report the pass with `runDir`, and say that `bundleVerified` is true.
   - Exit `1`: read `cases[].failure` (`step`, `message`, `observed`). Decide whether the app or the flow
     is wrong.
   - Exit `2`: read the top-level `reasons[]` or `cases[].failure`. Run the `fix` only when `owner` is
     `agent`.
4. **Heal** (local only). Run `tracegrove heal --json` to fix setup and drifted flows. Heal keeps only
   fixes that a rerun proves. Review the diff it reports, and `tracegrove heal --undo latest` reverts it.

## Never

- Never weaken, delete or skip a step or expectation to make a run pass. A real product bug stays red;
  report it.
- Never change an environment's `class`, `writes` or `agents`, or a flow's `envs:`, to get past a block.
- Never print, log, copy or commit a persona secret. Configs hold references only (`env:`, `aws-sm://`,
  `op://`, `orgx-broker://`).
- Never treat these as flakes to retry. Each one goes to a person:
  - `persona_identity_mismatch` and `persona_identity_collision`: the wrong secret is stored.
  - `deployed_cleanup_unconfirmed`: staging kept records.
  - `persona_credential_expired`: the persona was revoked mid-run.
  - `environment_writes_forbidden`: a writing flow was pointed at production.
  - `identity_mismatch`: a different build is deployed.

## Editing config

Use validated commands, not raw YAML:

- `tracegrove env add <env> --url … --persona owner=<ref> --dry-run`
- `tracegrove config set <path> <value> --dry-run`
- `tracegrove config patch '<json>' --dry-run`

Show the user the diff before you write without `--dry-run`.
