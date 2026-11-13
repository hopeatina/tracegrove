# Checking work that is not code

Tracegrove checks what an app actually did. `tracegrove artifact check` applies the same method to
work that is not code: a send plan, a launch post, a research brief, an audit. The piece is checked
against a spec written for that one piece, and the run ends in a verdict, a fix list and a receipt.

```
tracegrove artifact check examples/artifacts/send-plan/send-plan.check.yaml
```

```
READY  Send plan: clinic owners, reactivation
  send-plan.md  sha256 ed5a8dcaa75e  14 ok, 0 failed, 0 unproven, 0 blocked, 0 excluded

  Can each check fail?
  yes  contract: 1 of 1 planted defects caught
  yes  forbid: 2 of 2 planted defects caught
  yes  audience: 2 of 2 planted defects caught
  yes  numbers: 2 of 2 planted defects caught
  yes  claims: 2 of 2 planted defects caught
  yes  links: 1 of 1 planted defects caught
```

Change `38%` to `41%` in the plan and run it again: the run exits `1` and the fix list says
`line 9: change 41 to 38`.

## What carries over from code

| For code | For other work |
| --- | --- |
| A flow asserts on a separate readback, not on the app's own response | A claim is checked against its source, read separately, not against the piece's own wording |
| A check that never failed proves nothing | Every check must first fail on a planted defect, or it does not count |
| `blocked` and `unproven` are not passes | Same four verdicts, same exit codes |
| Evidence is pinned by hash | The receipt pins the bytes of the piece, the spec and every source |
| The judge is advisory | The judge is advisory until people's sign-offs earn it more |

## The spec

A spec is written for one piece, from its own brief. It does not describe what a "send plan" or a
"launch post" looks like, and `kind` never selects checks. Every part is optional.

```yaml
schemaVersion: tracegrove.artifact-check/v1
id: clinic-reactivation-send-plan
artifact: send-plan.md          # a path next to the spec, or an http(s) URL
kind: sales.send_plan           # a label only
afterlife: once                 # once | living | hypothesis

promises:                       # plain words from the brief, graded by a judge with cited lines
  - The message offers one concrete next step and says how long it takes.

invariants:
  contract:                     # things this piece itself promised to state
    fields: [Owner, Send date, Stop condition]
  numbers:                      # recomputed from the source
    - id: clinics-reached
      find: 'reached ([\d,]+) clinics'
      source: { ref: sources/metrics.json, path: pilot.clinics_reached }
  require:                      # wording the brief says must appear
    - pattern: 'RUN-\d{8}'
      reason: the brief asks for the run reference
  length: { maxWords: 400 }     # or minWords
  claims:                       # a quoted passage with a link on its line must appear word for word in that source
    mustCite: ['\d+% of']       # lines like this must carry a link
    unsourcedQuotes: note       # note (default) | block | ignore: quotes with no link on the line
  links: {}                     # every link resolves; requireParams: [utm_source] to require tracking
  forbid:
    - pattern: 'HIPAA[- ]compliant'
      example: HIPAA-compliant  # lets the check be shown to fail
      reason: not certified
      unless: '\bnot\b'         # a line that also matches this only names the wording, to rule it out
  audience:
    recipients: sources/recipients.csv
    noneIn: [sources/suppressed.csv, sources/customers.csv]
```

Each invariant takes `severity: block | warn | note` (default `block`). Only `block` findings move
the verdict.

### What each check does

| Check | Passes when | Unproven when | Blocked when |
| --- | --- | --- | --- |
| `contract` | each field is stated, as a heading, a `Label:` line or a table row, with content | | |
| `require` | each pattern appears | | |
| `forbid` | the pattern appears nowhere, or only on lines matching `unless` | | |
| `length` | the word count is within `minWords` and `maxWords` | | |
| `audience` | no recipient is in any `noneIn` list | | a list cannot be read |
| `numbers` | the number in the piece equals the source, within `tolerance` | the piece no longer states it | the source cannot be read |
| `claims` | each linked quote is in its source, word for word | a `mustCite` line has no link, or a quote has none and `unsourcedQuotes: block` | no linked source can be read |
| `links` | each link answers | a relative link cannot be followed | the host does not answer (a 404 or 410 fails) |

Quotation marks are also how people write draft copy, defined terms and slogans, so a quote with no
link on its line is counted and reported but does not block. Set `unsourcedQuotes: block` for a
piece where every quotation is a claim about what someone said.

A run in which no check found anything of its kind (no links, no quotes, no numbers) and no promise
was judged ends `unproven` with "nothing was examined". An empty piece cannot come out ready.

## Drafting the spec from the brief

Write the spec before the work, from the brief, so every piece starts with its check attached:

```
tracegrove artifact draft brief.md --artifact send-plan.md --sources sources/
```

Claude Code or Codex reads the brief and the listed sources and proposes promises and checks; with
`--no-agent`, plain rules turn each bullet of the brief (or each sentence, when it has no bullets)
into a promise and switch on the checks that need no knowledge of the piece. The piece does not have
to exist yet.

The drafter is never shown the piece, even when it exists. A check written while looking at the work
describes the work, and the work then passes it. If the piece exists, the finished draft is run
against it once, with the promises judged and nothing recorded, so a check that matches nothing
shows up immediately.

The drafter proposes; it cannot excuse. Whatever it writes, the saved spec has no exclusions, no
extra seeded defects, the default ship rule, every check at `block` with zero tolerance, and every
promise as advice, no `unless` on a forbid rule, and unsourced quotes at the default unless it asked
for `block`. A drafted `require` is kept only when its wording is in the brief or a source: a pattern
guessing how the piece will phrase something is removed, because that is a promise. A number check pointing at a source that was not listed is removed. The output
says what was removed. A reply that does not fit the schema is sent back once, then the draft fails.

The spec records the brief's path and hash (`brief`) and who drafted it (`draftedBy`). A later
check says when the brief has changed since. `draft` refuses to overwrite an existing spec without
`--force`: a spec is redrafted when the brief changes, not when the work falls short.

## Verdicts

| Verdict | Exit | Meaning |
| --- | --- | --- |
| `ready` | 0 | every blocking check passed, and every check was shown to fail on a planted defect |
| `fix` | 1 | something was read and is wrong; the fix list says what to change, by line |
| `blocked` | 2 | something could not be read; fix the setup, don't retry |
| `unproven` | 3 | a claim has nothing to check it against, or a check could not be shown to fail |

`--allow-unproven` exits `0` on unproven and records that it was allowed. `shipRule.maxUnproven`
and `shipRule.requireProvenChecks` set the bar per spec.

## Planted defects

Before a check counts, the run plants the defect that check exists to catch and confirms the check
notices: it changes a number, alters a verified quote, removes a stated field, adds a recipient from
the suppression list, adds a dead link, adds the forbidden phrase, removes the required wording,
pads the piece past its length. This is automatic and uses the
sources already read, so it adds no network calls. Add your own under `seededDefects` when a piece
has a failure the automatic ones miss:

```yaml
seededDefects:
  - check: numbers
    replace: { find: "1,204 clinics", with: "12,040 clinics" }
```

A forbidden pattern that is not a plain phrase needs an `example`. Without one the check cannot be
shown to fail and the verdict is `unproven`.

## Exclusions

```yaml
exclusions:
  - check: links
    match: recording-page       # only findings whose subject or detail contains this; leave out for the whole check
    reason: the page goes live on send day
    owner: Dana
    expires: "2026-11-18"
```

An exclusion needs a reason, an owner and an end date. An excluded finding is reported as
`excluded`, never as a pass. When the date passes the finding counts again and the run says so.

## Promises and the judge

`promises` are statements a check cannot decide, written in plain words. `--judge` sends the piece,
with numbered lines, to Claude Code or Codex (the same judge as `tracegrove judge`) and asks for
`met`, `not_met` or `unclear` with the lines that show it. An answer that cites no line becomes
`unclear`.

A judge starts as advice: a missed promise appears in the fix list and does not change the verdict.
Sign off runs with `tracegrove artifact accept <spec>` or `tracegrove artifact reject <spec> --reason "..."`.
Each sign-off on a judged run records whether the person and the judge agreed. A promise marked
`authority: gate` blocks only once the judge has 30 sign-offs for that `kind` at 90% agreement:

```yaml
promises:
  - { text: "The plan says when to stop sending, in terms someone can measure.", authority: gate }
```

## Where the piece lives, and when it runs again

The piece stays where it is. The receipt holds a pointer and the SHA-256 of the bytes read, plus the
hash of every source. Receipts are written to `.tracegrove/artifact-runs/<id>/`, and each one names
the hash of the run before it.

`afterlife` says what happens after a ready verdict:

- `once`: shipped and done. Running again with the same bytes and spec returns the saved receipt
  without checking anything (`--rerun` forces it).
- `living`: checked on every run, because its sources change.
- `hypothesis`: needs a `reviewDate`; on that date the run asks for the prediction to be compared
  with what happened.

## Running it after an agent finishes

The command is one process with a stable exit code and `--json`, so it fits anywhere an agent's work
is accepted.

**As a task's acceptance check.** In a system that accepts a task on a command (OrgX acceptance
supports `kind: command`), the maker cannot mark the work done until the piece is ready:

```json
{ "verify": { "kind": "command", "command": "npx tracegrove artifact check plan.check.yaml --json", "expect_exit": 0 } }
```

**As a Claude Code Stop hook.** The agent cannot end its turn while the check fails; the fix list
goes back to it as the reason:

```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "npx tracegrove artifact check >&2 || exit 2" }] }] } }
```

**In CI.** `npx tracegrove artifact check` with no arguments runs every `*.check.yaml` under
`tracegrove/artifacts/` and exits with the worst verdict.

An agent that reads `--json` gets `verdict`, `reasons`, `findings` (each with `check`, `status`,
`line`, `detail`, `source`, `fix`), `proofs`, `promises` and `fixList`. The loop is: check, apply
the fix list, check again.

The spec should be written before the work, by whoever briefs it, and the maker should not be the
one who edits it to get to ready. The receipt records the spec's hash, so a changed spec is visible.

## From code

```ts
import { runArtifactCheck } from 'tracegrove/artifacts';

const receipt = await runArtifactCheck('plan.check.yaml', { ask: myJudge });
if (receipt.verdict !== 'ready') console.log(receipt.fixList);
```

Pass `fetcher` to read pieces and sources from your own store (a signed URL, a document API) instead
of files and public URLs.

## Not here yet

- Readers for media (video, audio, images, decks). Today a piece must be text: Markdown, HTML, JSON or plain.
- Pieces behind a login. A private URL ends `blocked` with `artifact_unreadable`; pass a `fetcher` from code to read your own store.
- Finding claims in the piece with a model. Today a claim is a quoted passage, a declared number or a `mustCite` line.
- Craft judged against chosen references by a panel of critics.
- A second, independent judge family, which a promise would need before it could decide alone.
- A page for a release in the Grove UI.
- A source cache between runs.
