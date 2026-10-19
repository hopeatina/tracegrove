# tracegrove

**Check what your local app actually did, not just the response it returned.** Tracegrove runs authored behavior checks against an app it launches locally, makes separate requests to observe the resulting state, and saves evidence you can inspect and verify again. It is for engineers testing stateful Node, FastAPI, and Django APIs, including authorization and cleanup behavior.

In the synthetic Notes sample, an owner creates a note and reads it back, a stranger's read is denied, the owner deletes the note, and another read confirms it is gone. The saved run below held 2/2 scenarios and 10/10 steps; its evidence was freshly verified. This is a crop of the real local sample UI, not a hosted run.

![Tracegrove Notes sample run: create 201, independent read 200, stranger read 403, delete 204, final read 404, and verified evidence](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/images/notes-run.png)

## Try it on a sample API

You need Node.js >=22.22.0 and <23, npm, a POSIX shell, writable temporary storage, and local loopback sockets. Use a provisioned Node 22 runtime; Node 24 has not been qualified. This sample needs no Docker, browser, Python, cloud account, or coding agent. Install from npm in an empty directory:

```bash
mkdir tracegrove-demo && cd tracegrove-demo
npm init -y
npm install --save-dev --save-exact tracegrove@0.3.2
```

Run this block in the same directory. It creates a synthetic Notes API with isolated data and in-memory test personas, checks the plan and flows, runs two scenarios, and verifies the saved evidence. The `TRACEGROVE_CLI` override is for maintainers testing a local build.

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

Success means `doctor` reports `blocked: false`, `check` reports `ok: true`, `test` reports `outcome: passed` and `bundleVerified: true`, and `verify-bundle` reports `ok: true`. Read `$TRACEGROVE_RUN/summary.md` for the step report or run `node "$TRACEGROVE_CLI" ui --dir "$TRACEGROVE_DEMO"` for the local UI. The run also contains `summary.json`, `junit.xml`, and `bundle/`. Keep the evidence directory if you need the receipts; after exporting it, remove the temporary sample with `rm -rf "$TRACEGROVE_DEMO"` in that same shell. A passing sample does not qualify your app or host.

To explore, select the `gone` step in the UI and compare the owner's `DELETE 204` with the following `GET 404`. In a disposable copy of the sample, change that final expected status to `200` and rerun `test`: it reports an assertion failure and retains a failed run for inspection. Restore the expectation before running the passing sample again.

## What the check proves

The sample flow sends a `POST`, saves the new ID, and issues a separate `GET` with `observe: true`. Later it checks an intruder's read, deletes the note, and independently checks that the note is gone. This excerpt is from the packaged [Notes flow](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/samples/notes-api/tracegrove/notes/create-read-delete.flow.yaml):

```yaml
steps:
  - name: create
    POST: /notes
    json: { title: Fresh note, body: Written through the real API. }
    expect: { status: 201 }
    save: { noteId: note.id }
  - name: read back
    GET: /notes/{noteId}
    observe: true
    expect: { status: 200, json: { note.title: Fresh note, note.body: Written through the real API. } }
  - name: intruder is denied
    GET: /notes/{noteId}
    as: intruder
    expect: { status: 403, absent: [note] }
  - name: delete
    DELETE: /notes/{noteId}
    expect: 204
  - name: gone
    GET: /notes/{noteId}
    observe: true
    expect: 404
```

The same run at phone width makes the sequence readable on a narrow screen. Its selected final read observed `404` after the delete. The UI shows the status; the authored expectation and saved bundle supply the check.

![Phone-width view of the same Notes run: create 201, read back 200, intruder denied 403, delete 204, gone 404, and selected final observation 404](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/images/notes-run-mobile.png)

Verification rechecks saved file integrity and recomputes the verdict without rerunning the app. Bundles are unsigned: a receiving system still needs to trust who produced them.

## Use it with your app

Install `tracegrove@0.3.2` as an exact development dependency in your repository, then run `npx --no-install tracegrove init`. It creates `tracegrove.config.yaml` and a starter flow. Review the generated `node`, `fastapi`, or `django` adapter, app entry, health route, source paths, and personas. Write flows at `tracegrove/<area>/<behavior>.flow.yaml`, following the sample's separate reads for effects you care about. Then run:

```bash
npx --no-install tracegrove check --json
npx --no-install tracegrove test --json
npx --no-install tracegrove ui
```

`check` compiles without starting the app. `test` launches it and writes `.tracegrove/runs/<run>/`; `ui` presents the saved run locally. Use `npx --no-install tracegrove verify-bundle --bundle <runDir>/bundle --json` on a retained bundle. Inspect the first failed run before retrying; a failed assertion differs from a blocked prerequisite.

Your app must accept the per-run test persona tokens provided through `TRACEGROVE_TOKENS`, or use another reviewed test-only authentication path. Keep that path disabled in production. The adapters start the app on an assigned local port with an owned data directory. Django's migration step must point at a database inside `TRACEGROVE_DATA_DIR`; check its settings before running so it cannot migrate another database. Tracegrove does not provision a database or cloud runner for you.

Press Ctrl-C once to request cancellation and wait for cleanup. If cleanup is unconfirmed, inspect the receipts before another attempt.

[Getting started with your app](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/getting-started.md) · [Verified bundles and cleanup](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/verified-bundles.md) · [Recovery inspection](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/local-execution-recovery.md)

## Where it runs

| Placement | Current status |
| --- | --- |
| Local macOS | The installed Notes sample passed on a Mac. Broader Mac qualification is open. Provide the Node range, writable storage, loopback, and your app's test-only setup. |
| Linux CI | The repository's Ubuntu CI exercises Node, FastAPI, Django, browser, and evidence lanes. Pin dependencies, provision Python for Python apps and Chromium for browser flows, and retain run artifacts. |
| Codex or another cloud sandbox | Conditional on allowed package installation, local child processes and loopback, writable owned storage, required runtimes, and evidence export. Tracegrove does not provide a hosted runner. |
| OrgX-triggered environment | No built-in trigger or runner integration. An authorized external orchestrator would need to provide the pinned source/build, permitted host/network, scoped synthetic identities, isolated data and cleanup, and artifact/result mapping. |
| Windows | Process-tree execution is unsupported in this 0.x release. |

## For coding agents and CI

Browser flows use pinned Playwright Chromium and can pair DOM assertions with an independent API read and a recording. Native jobs and MCP Streamable HTTP have separate guides; they are optional, not part of the Notes quickstart. External staging, arbitrary shell launchers, and a general cloud runner are not current CLI targets.

Use `status --json` to find the next action, `discover --json` to compare routes and flows, `check --json` to compile, and `test --json` to execute. The `test` summary uses `tracegrove.run-summary/v1` and includes `outcome`, `runDir`, `bundleVerified`, `cases`, and `blockers`. `doctor` uses `tracegrove.doctor/v1`; top-level JSON errors use `tracegrove.cli-error/v1`. Keep the first failed run and its evidence when diagnosing a retry.

| Exit | Meaning |
| --- | --- |
| 0 | Passed or clean |
| 1 | Assertion failed |
| 2 | Blocked or inconclusive |
| 3 | Infrastructure failed |
| 4 | Cancelled |

`draft` runs a configured Claude Code or Codex CLI and may edit flow files. `heal` runs the suite and may retain bounded setup or flow edits after its checks. Commit or stash your work before either command; review every proposed diff. `heal --dry-run` inspects without keeping edits. An agent verdict or a successful compile does not prove that a changed test still expresses your intent.

[Agent command and JSON guide](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/agent-guide.md) · [Browser driver](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/browser-driver.md) · [Native jobs](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/native-jobs.md) · [MCP driver](https://cdn.jsdelivr.net/npm/tracegrove@0.3.2/docs/mcp-driver.md)

Apache-2.0 licensed.
