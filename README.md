# tracegrove

Tracegrove runs behavior checks against an app you launch locally, then saves an evidence bundle you can inspect and verify again. This 0.x release supports Node, FastAPI, and Django samples on POSIX hosts. Linux is exercised in CI; Windows process-tree execution is unsupported. Other hosts need their own qualification.

![Tracegrove showing a verified sample run](https://cdn.jsdelivr.net/npm/tracegrove@0.3.0/docs/images/ui-run.png)

## Try the sample

You need Node.js >=22.22.0 and <23, npm, a POSIX shell, writable temporary storage, and local loopback sockets. Use a provisioned Node 22 runtime; the Node 24 line has not been qualified. The notes sample needs no Docker, browser, Python, cloud account, or coding agent. Install from npm in an empty directory:

```bash
mkdir tracegrove-demo && cd tracegrove-demo
npm init -y
npm install --save-dev --save-exact tracegrove@0.3.1
```

Run this block in the same directory. It creates a synthetic Notes API, checks prerequisites, runs two scenarios, and verifies the saved evidence. The `TRACEGROVE_CLI` override is for maintainers testing a local build.

<!-- onboarding-quickstart:start -->
```bash
set -euo pipefail
TRACEGROVE_CLI="${TRACEGROVE_CLI:-$PWD/node_modules/tracegrove/dist/cli/main.js}"
TRACEGROVE_DEMO="$(mktemp -d "$PWD/tracegrove-notes-XXXXXX")"
node "$TRACEGROVE_CLI" sample-config --sample notes-api --output "$TRACEGROVE_DEMO"
node "$TRACEGROVE_CLI" doctor --config "$TRACEGROVE_DEMO/verification/workflow.yaml" --json
node "$TRACEGROVE_CLI" check --dir "$TRACEGROVE_DEMO" --json
node "$TRACEGROVE_CLI" test --config "$TRACEGROVE_DEMO/tracegrove.config.yaml" --json | tee "$TRACEGROVE_DEMO/run.json"
TRACEGROVE_RUN="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).runDir' "$TRACEGROVE_DEMO/run.json")"
node "$TRACEGROVE_CLI" verify-bundle --bundle "$TRACEGROVE_RUN/bundle" --json
printf 'Evidence retained at %s\n' "$TRACEGROVE_RUN"
```
<!-- onboarding-quickstart:end -->

Success means `doctor` reports `blocked: false`, `check` reports `ok: true`, `test` reports `outcome: passed` and `bundleVerified: true`, and `verify-bundle` reports `ok: true`. Keep the evidence directory if you need the receipts; after exporting it, remove the temporary sample with `rm -rf "$TRACEGROVE_DEMO"` in that same shell. The sample uses in-memory synthetic persona tokens and an isolated app data directory. A passing sample does not qualify your app or host.

## Test your app

Run `npx --no-install tracegrove init` in a project with Tracegrove installed. It creates `tracegrove.config.yaml` and a starter flow. Adjust the app entry, health route, source paths, and personas, then run `npx --no-install tracegrove check` followed by `npx --no-install tracegrove test --json`. For a human view, run `npx --no-install tracegrove ui`.

Your app must accept the per-run test persona tokens provided through `TRACEGROVE_TOKENS`, or use another reviewed test-only authentication path. Keep that path disabled in production. The Node, FastAPI, and Django adapters start the app on an assigned local port. Django's migration step must point at a database inside `TRACEGROVE_DATA_DIR`; check its settings before running so it cannot migrate another database. Tracegrove does not provision a database or cloud runner for you.

Results are saved under `.tracegrove/runs/<run>/` with `summary.json`, `summary.md`, `junit.xml`, and `bundle/`. Bundle verification checks file integrity and recomputes the verdict; bundles are unsigned, so a receiving system still needs to trust their producer. Press Ctrl-C once to request cancellation and wait for cleanup. If cleanup is unconfirmed, inspect the receipts before another attempt.

[Getting started with your app](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/getting-started.md) · [Verified bundles and cleanup](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/verified-bundles.md) · [Recovery inspection](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/local-execution-recovery.md)

## For coding agents and CI

Use `status --json` to find the next action, `discover --json` to compare routes and flows, `check --json` to compile, and `test --json` to execute. The `test` summary uses `tracegrove.run-summary/v1` and includes `outcome`, `runDir`, `bundleVerified`, `cases`, and `blockers`. `doctor` uses `tracegrove.doctor/v1`; top-level JSON errors use `tracegrove.cli-error/v1`. Keep the first failed run and its evidence when diagnosing a retry.

| Exit | Meaning |
| --- | --- |
| 0 | Passed or clean |
| 1 | Assertion failed |
| 2 | Blocked or inconclusive |
| 3 | Infrastructure failed |
| 4 | Cancelled |

`draft` runs a configured Claude Code or Codex CLI and may edit flow files. `heal` runs the suite and can edit setup or flow files after its checks. Commit or stash your work before either command; review every proposed diff. `heal --dry-run` inspects without keeping edits. An agent verdict or a successful compile does not prove that a changed test still expresses your intent.

[Agent command and JSON guide](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/agent-guide.md) · [Portable environment setup and limits](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/portable-environments.md) · [Browser driver](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/browser-driver.md) · [Architecture](https://cdn.jsdelivr.net/npm/tracegrove@0.3.1/docs/architecture.md)

Apache-2.0 licensed. The repository is [hopeatina/tracegrove](https://github.com/hopeatina/tracegrove); repository access is separate from the public npm package.
