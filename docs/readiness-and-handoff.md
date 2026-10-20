# Readiness, sign-off and client handoff

A green test run answers one question: did the checks pass this time. Before you ship an agent to a client you need four answers, and they can disagree:

| State | Question | Values |
| --- | --- | --- |
| **Ran** (execution) | Did the check actually run to the end? | `completed`, `blocked`, `interrupted`, `not_run` |
| **Evidence** (assessment) | What does the saved evidence support? | `supported`, `contradicted`, `inconclusive` |
| **Still valid** (validity) | Is that evidence about this code and this check? | `current`, `stale` (the app changed), `superseded` (the check changed) |
| **Sign-off** (decision) | Who accepted it? | `auto`, `accepted`, `pending`, `waived`, `rejected`, `challenged` |

Each flow is one **claim**. `tracegrove readiness` lists them all:

```text
$ npx --no-install tracegrove readiness
bright-smile-voice  not ready: 1 of 4 claims open
  claim                       ran         evidence      still valid   sign-off
● calls.books-a-cleaning      completed   supported     current       pending
● calls.after-hours           completed   supported     current       auto
● calls.cancel-by-phone       completed   supported     current       auto
● calls.emergency-and-advice  completed   supported     current       auto

next
  tracegrove accept calls.books-a-cleaning  critical claim: a person signs off
```

It exits `0` only when every claim is ready, so it works as a release gate in CI.

## Who has to sign off

Routine claims (`risk: standard`, the default) are accepted automatically once the evidence supports them and is current. Claims marked `risk: critical` in the flow need a person:

```bash
npx --no-install tracegrove accept calls.books-a-cleaning --by "Hope" --reason "Listened to the transcript, readback matches"
```

`accept` refuses a claim that is not supported and current. Decisions are written to `tracegrove/decisions.yaml`; commit it next to your flows so the record travels with the code.

Every decision is bound to the exact check and source it was made on. Edit the flow and the claim becomes `superseded`; change the app and it becomes `stale`. Either way, an earlier `accept` no longer counts and the claim asks for a fresh run and a fresh decision. Waivers and challenges are tied to the check, so they survive app changes but not edits to the flow.

## Disagreeing without weakening the test

| Command | Use it when | Effect |
| --- | --- | --- |
| `waive <case> --reason …` | You are shipping knowingly without this evidence | Claim counts as ready, but stays marked unsupported and the report shows the waiver |
| `reject <case> --reason …` | The check passes but the behavior is not what the client wants | Claim is not ready |
| `challenge <case> --reason … [--step …]` | You think the check itself is wrong | Claim stays open; the check is not changed |

A challenge is the rule for people and coding agents alike: anyone can dispute a check and say why, but nobody silently loosens it. Fix the flow in a reviewed change, rerun, and decide again.

## Evidence channels

Each claim lists the channels its evidence came from, for example `voice, http readback`. A voice step on its own only proves what the agent said. A separate readback from the backend, ideally as a different persona, is a second channel that proves what the agent did. Prefer a second channel over more assertions on the same one.

## The handoff report

```bash
npx --no-install tracegrove handoff --client "Bright Smile Dental"
# wrote .tracegrove/handoff/bright-smile-voice-2026-10-20.html
```

One self-contained HTML file (no external requests, light and dark mode) you can email or attach to a delivery. It shows:

- the verdict and counts,
- every claim with its four states, the conversation transcript as chat bubbles, tool calls, and the backend readbacks,
- who signed off on what, and every waiver with its reason,
- **what this does not cover**: for example, that text-injected voice tests skip speech recognition and telephony, that bundles are unsigned, and whether redaction was on.

If the run contains client data, turn on redaction first ([security.md](security.md)).

## In the UI

`tracegrove ui` has a **Readiness** tab with the same claims. Each card has Accept, Waive, Reject and Challenge buttons (they ask for a reason where one is required) and a link to open the handoff report. The **Run** tab shows voice and chat steps as transcripts.

## For coding agents

`tracegrove mcp` exposes `readiness` and `challenge_check`. An agent can read every claim and dispute a check with a reason (recorded as `agent:<name>` in `decisions.yaml`), but there is no MCP tool to accept, waive or reject. Those are a person's call.
