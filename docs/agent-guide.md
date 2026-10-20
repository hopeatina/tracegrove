# Agent and CI command guide

Use the installed binary through `npx --no-install tracegrove` so CI never fetches an unrelated package. Pass `--json` and check both exit status and report fields; do not classify a run from prose alone.

| Command | Effect | Result |
| --- | --- | --- |
| `status --json` | Reads the current project and run state | `tracegrove.status/v1` and ordered `next` commands |
| `discover --json` | Compares scanned routes, authored flows and the requests the last verified run served | `routes` with `provenance` and `observedBy`, `ambiguities` with a question for an agent; no app launch |
| `discover --jsonl` | The same discovery as one typed event per line, in drafting order, then a `coverage` line | `domain.found`, `surface.found` (with `risk.score`, `risk.why`, `risk.pii`), `flow.declared`, `surface.observed`, `flow.proven`, `flow.failed`, `question.asked`; the coverage line lists `riskyUntested` |
| `discover --save` | Records what discovery knows in `tracegrove/catalog.yaml` (commit it) | Routes with handler file, actions and the verified run that confirmed them |
| `check --json` | Compiles authoring files | `ok` and located issues; may evaluate trusted TypeScript authoring modules |
| `doctor --dir . --json` | Checks the native plan without app launch | `tracegrove.doctor/v1`, `checks`, `errors`, `blocked`, `execution: not_started` |
| `test --json` | Starts the selected app and executes scenarios | `tracegrove.run-summary/v1`, `outcome`, `cases`, `blockers`, `runDir`, `bundleVerified` |
| `verify-bundle --bundle <dir> --json` | Checks existing evidence | `ok`, `problems`, `outcome`, `receipts`; no app launch |
| `draft --intent '<goal>'` | Starts a coding agent to write flows, then runs each new flow end to end and sends failures back for up to 2 repairs (`--no-prove` skips the runs) | `prove.flows[]`, each `proven`, `failed` or `product_bug` with the routes it served; exit 1 unless all are proven |
| `heal --dry-run` | Runs and diagnoses the suite | Findings without retained agent edits |
| `setup browsers` | Installs the pinned headless shell and ffmpeg, then records a one-second test video | `probe.ok`, or a typed `browser_unavailable` / `video_encoder_missing` |
| `heal` | May retain bounded setup/flow edits | `tracegrove.heal/v1`; inspect saved diff and backups |

## MCP

`tracegrove mcp` serves the same results as MCP tools: `status`, `init`, `discover`, `check`, `test`, `show_run`, `heal`, `draft`, `readiness`, `challenge_check` and the environment tools. It starts in a repo with no config, so an agent can begin with `status`, then `init` and `discover`. Tools that need a config return `config_not_found` until `init` has run. The Claude Code plugin (`/plugin install tracegrove --marketplace hopeatina/tracegrove`) adds the server and the tracegrove skill together; for Codex, `codex mcp add tracegrove -- npx -y tracegrove mcp`.

Exit codes: 0 clean/passed; 1 assertion failure; 2 blocked/inconclusive; 3 infrastructure failure; 4 cancellation. A top-level JSON error uses `tracegrove.cli-error/v1`, with a public class, bounded reason codes and recovery actions. Normal reports and artifacts may contain application data; protect them with your usual workspace access controls. `--json=false` selects prose errors, while `--jsonl` keeps its event stream.

Agent drafting uses the configured Claude Code or Codex CLI and its existing permissions. Tracegrove's prompt is not a filesystem sandbox. The default models are explicit in the adapter, and one Claude model-alias retry is recorded when used. A requested `maxBudgetUsd` is supported by the Claude adapter; the Codex adapter blocks it rather than ignoring a spending limit. Commit or stash work before drafting or healing, review proposed changes, and preserve the original failed run. A passing compiled flow is not proof of intended behavior.

The same short flows compile into the strict `workflow.*/v1` corpus. The browser, native jobs, MCP, evidence and recovery guides are shipped in this package. General portable profiles are reference-only; they cannot be passed to the present CLI as an executable target.

## Reusable actions and the catalog

A step sequence more than one flow needs (sign in, create a resource, open a page) belongs in `tracegrove/actions/<area>/<verb>.action.yaml`, which is the action `<area>.<verb>`. It declares `inputs` (a default, or `null` when required), `outputs` (names its steps save), `routes` (quoted `"METHOD /path/{param}"`), `sources` (the handler files) and `steps`, and may call other actions. A flow calls it with `- use: notes.create`, `with: { title: X }`, optional `as:` and `save: { mine: noteId }`. Compile expands every call into ordinary steps named `<call> › <step>`, so runs, evidence and heal treat them like hand-written steps; saved names other than outputs stay private to each call.

Discovery groups routes into areas named after the code that declares them: the file (`billing.mjs` → `billing`), or its folder when the file name says nothing (`orders/views.py` → `orders`). Only when neither helps does it fall back to the first URL segment, and it says so. Routes are ranked by risk: writes over reads, money and permission changes first, personal data flagged. `discover`, the MCP tool and the UI's Discover tab all show the same coverage strip and the riskiest untested routes, so start drafting there.

`tracegrove/catalog.yaml` is what discovery has learned: each route, where it is handled, which actions exercise it and which verified run confirmed it. `draft` updates it after it proves new flows, and `discover --save` writes it on demand. Discovery reads it back, so a fresh clone with no runs still knows its routes, and a file the static scan cannot read stops being a question once an action that names it is confirmed by traffic. Agents are shown the action library and told to reuse it and to add new actions rather than repeat steps; an action they write counts as proven only when a flow using it passes.
