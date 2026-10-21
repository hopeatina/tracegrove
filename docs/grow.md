# Grow: live discovery of a change

`tracegrove grow` reads a branch and its spec, grows the change as a tree, traces every part, drafts scenarios, asks how much to prove, and proves them with real flows. The terminal and the Discover tab in `tracegrove ui` draw the same run from the same event stream.

```sh
tracegrove grow                          # the checked-out branch against the default branch
tracegrove grow --branch feature/x --base main --mode std
tracegrove grow --jsonl > grow.jsonl     # the raw event stream, one JSON object per line
```

## What it does, in order

1. **Read.** The diff against the base, and the spec: `--spec <file>`, else the PR description, else an issue the PR closes (`Closes #12`), else the commit messages. Criteria are the list items under an acceptance-style heading, or the checkboxes. Prose never becomes a criterion.
2. **Grow.** Each changed route, command, screen, job and module becomes a branch (what people use). Tables, caches and third-party services become roots (what it depends on).
3. **Trace.** Every part is checked five ways: read the code, find its callers, follow its effects, look for tests, match it to the spec. The rules answer at once. An agent (Claude or Codex, read-only) then deepens each lane in parallel. tracegrove checks every `path:line` the agent cites against the branch and drops claims that do not exist, so they show as dropped, never as evidence. Where an effect leaves the repo (a third-party call), tracing stops and says so.
4. **Draft.** Happy, sad and edge scenarios per part, riskiest failure first. Scenarios that touch a third party get two lanes: a **mock** lane against a stand-in on every PR (it can fail, slow down or hang up on purpose), and a **real** lane against the provider's sandbox that names the key it needs. A fault the real service cannot produce on demand stays mock-only.
5. **Choose.** Minimum (every criterion plus the riskiest failure of each part), Standard (the remaining sad and edge cases) or Max (adds regression of every existing flow the change reaches). Nothing runs until you pick, or `--mode` picks for you.
6. **Prove.** Each scenario's flow runs for real. A branch that is not checked out is proved in its own temporary git worktree, so what runs is the branch under review.

## Honesty rules

- A criterion is **proved** only when every scenario serving it passed and none relies on an agent-written piece nobody has reviewed. Otherwise it reads **agent-checked**, **not proven yet**, **not found**, or **failed**.
- A scenario with no flow reads **no flow yet** and never turns green.
- Code the spec never mentions is flagged **in the code, not in the spec**.
- Everything an agent writes (a breakdown, a flow, an action) is listed with its path and state: needs review, not proven, or proven by a named passing scenario.

## The event stream

Every run is saved to `.tracegrove/discovery/<branch>.jsonl`. Each line is one event with `v: "tracegrove.discovery-event/v1"`, a sequence number `seq` and `ms` since the start. Fold the events with `applyGrow` from `src/authoring/growState.ts` to rebuild the state at any point; the terminal frame (`renderGrove`) and the Discover tab both draw from that state.

In the UI, `POST /api/grow` (session token required) streams `session`, `event`, `state` and `done` server-sent events, and `POST /api/grow/mode` answers the mode question. `GET /api/grow/last?branch=` returns the saved grow of a branch, which the Discover tab reopens on load.

## The tree in the browser

The Discover tab draws the change as a bonsai. The trunk is one tapered shape whose movement is seeded by the branch name, so a change keeps its posture between runs. Limbs leave the trunk low and wide and climb shorter, so the silhouette tapers; each carries a foliage pad that is tinted by proof (plain while drafted, deeper green once every scenario in the chosen mode passed, red when one failed, pulsing gold while one runs). Every scenario is a leaf on its own twig: filled when it passed, red when it failed, dashed when no flow proves it, hollow when it belongs to a larger mode. Gold roots below the soil are what the change depends on; a dashed red root is where tracing had to stop. Labels sit in two columns off the tree, joined by hairline leaders, with five pips under each for how deep the part was checked.

The page reads top down: the verdict, the phases, the tracers, the tree with its inspector, then the scenarios (grouped by part, only the selected part and failures open) beside the spec (one chip per criterion; pick one and the tree lights the parts that serve it). The outline view carries the same facts as a table for trees too large to draw.

## Exit codes

`0` everything that ran passed, `1` a scenario failed, `2` blocked (not a repo, no base, nothing changed), `4` cancelled.
