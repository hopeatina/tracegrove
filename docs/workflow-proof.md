# Record and verify a business promise

## Browser authoring

Start a disposable local app and initialize its TraceGrove project. Install Chromium with `tracegrove setup browsers`. The recording session visits the local URL. Replay launches a fresh app from the project config with its own test persona and stand-ins.

For example, in a project with an upgrade page and a payments stand-in, a coding agent can send newline-delimited JSON to the session:

```sh
tracegrove record --url http://127.0.0.1:3000/upgrade --name charges-once --title "A team upgrade charges Acme once" <<'STEPS'
{"kind":"click","target":{"by":"role","role":"button","name":"Upgrade"}}
{"browser":{"kind":"read","target":{"by":"testId","name":"result"}},"expect":{"text":"Done"}}
{"standin":"payments","received":"POST /v1/charges","expect":{"calls":1,"json":{"calls[0].json.customer":"acme"}}}
"save"
STEPS
```

Each action emits the flow step. Responses suggest same-origin GET paths and the config supplies provider routes. Choose a check on the affected customer, record, or transaction. For example, `{"GET":"/account","observe":true,"expect":{"json":{"account.id":"acme","account.plan":"team"}}}` sends a separate request during replay. Use `--headed` to click and fill the form yourself, then enter your readback and `"save"` in the terminal. Use synthetic form values. The recorder supports named clicks, fills, navigations and text checks. A successful fresh replay publishes a new YAML file. A failed replay leaves its diagnostic run and preserves existing flows.

## Prove the check detects its intended fault

Place `tracegrove.faults.json` beside the project config. The test app implements a deterministic, local fault switch. The case and step IDs come from the healthy run. Pin the recorded comparison and the observation that characterizes this fault:

```json
[{
  "name": "drop_booking",
  "env": {"RECEPTIONIST_BUG": "drop_booking"},
  "caseId": "calls.books-a-cleaning",
  "step": "front_desk_sees_the_booking",
  "check": "status",
  "expected": 200,
  "got": 404
}]
```

Run `tracegrove test --prove-faults`. Grow challenges existing flows with matching declarations, and agent-assisted heal repeats the challenge before accepting a repaired flow. A successful challenge needs matching source and case digests, the declared launch environment change, a passing healthy check and the exact failed comparison. Fault executions have their own state directory. The ordinary suite history retains the healthy result. The PR card rechecks both bundles when reading an attempted challenge. A plain test run still reports its ordinary assertions.

Run `tracegrove try voice-receptionist --bug drop_booking` for the side-by-side demo. The healthy booking returns 200 on the appointment read. The faulty receptionist still confirms the booking, then the read returns 404. The billing demo uses `--bug double_charge` with `saas-billing`. It checks whether the second processor request reused the idempotency key.

## Run affected cases on a branch

Keep the named run directory from a passing full local suite on the merge base, including its bundle. Restore it under the same project's `.tracegrove/runs/` on the PR checkout.

```sh
tracegrove impact --base origin/main --baseline "$BASELINE_RUN_NAME" --json
```

Impact uses Grow's branch analysis, exact flow filenames and observed app requests. Its report names the selected cases, route and service evidence, selection time, execution times and missed failing cases. It widens to the suite for missing evidence, dirty trees and unmapped dependencies. By default it runs the selected cases and the full suite concurrently in separate workspaces. A failing reference run fails the command. Use `--selected-only` once the project's shadow results justify it. Both paths execute authored actions and fresh assertions without authoring-model calls.
