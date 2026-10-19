# Agent and CI command guide

Use the installed binary through `npx --no-install tracegrove` so CI never fetches an unrelated package. Pass `--json` and check both exit status and report fields; do not classify a run from prose alone.

| Command | Effect | Result |
| --- | --- | --- |
| `status --json` | Reads the current project and run state | `tracegrove.status/v1` and ordered `next` commands |
| `discover --json` | Compares discovered routes and authored flows | Coverage suggestions, no app launch |
| `check --json` | Compiles authoring files | `ok` and located issues; may evaluate trusted TypeScript authoring modules |
| `doctor --dir . --json` | Checks the native plan without app launch | `tracegrove.doctor/v1`, `checks`, `errors`, `blocked`, `execution: not_started` |
| `test --json` | Starts the selected app and executes scenarios | `tracegrove.run-summary/v1`, `outcome`, `cases`, `runDir`, `bundleVerified` |
| `verify-bundle --bundle <dir> --json` | Checks existing evidence | `ok`, `problems`, `outcome`, `receipts`; no app launch |
| `draft --intent '<goal>'` | Starts a coding agent to edit drafts | Review changed files and compile/run afterward |
| `heal --dry-run` | Runs and diagnoses the suite | Findings without retained agent edits |
| `heal` | May retain bounded setup/flow edits | `tracegrove.heal/v1`; inspect saved diff and backups |

Exit codes: 0 clean/passed; 1 assertion failure; 2 blocked/inconclusive; 3 infrastructure failure; 4 cancellation. A top-level JSON error uses `tracegrove.cli-error/v1`, with a public class, bounded reason codes and recovery actions. Normal reports and artifacts may contain application data; protect them with your usual workspace access controls. `--json=false` selects prose errors, while `--jsonl` keeps its event stream.

Agent drafting uses the configured Claude Code or Codex CLI and its existing permissions. Tracegrove's prompt is not a filesystem sandbox. The default models are explicit in the adapter, and one Claude model-alias retry is recorded when used. A requested `maxBudgetUsd` is supported by the Claude adapter; the Codex adapter blocks it rather than ignoring a spending limit. Commit or stash work before drafting or healing, review proposed changes, and preserve the original failed run. A passing compiled flow is not proof of intended behavior.

The same short flows compile into the strict `workflow.*/v1` corpus. The browser, native jobs, MCP, evidence and recovery guides are shipped in this package. General portable profiles are reference-only; they cannot be passed to the present CLI as an executable target.
