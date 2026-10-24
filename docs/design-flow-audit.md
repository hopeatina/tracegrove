# Tracegrove workbench: flow and design audit

Audited 23 October 2026 against the running 0.4.0 example at port 54434 and source commit `ac10d9b29`. Implementation lives on `codex/design-flows-audit`.

Follow-up: [three refinement rounds with Claude Opus 5.5](design-refinement-review.md), including cross-page coherence, phone evidence navigation and review-state continuity.

## Judgment

The bonsai is the product's strongest visual asset. The surrounding interface was making it harder to understand: eleven equal navigation choices, repeated status cards, dense technical provenance, two competing entry points in Discover, and empty states that explained absence without resolving it. The redesign should feel like tending one living system, with tools appearing when they are useful.

Use the tree to explain relationships and results. Use ordinary language to explain actions. Keep the distinction between a passing run, current evidence and human sign-off; simplifying those into one green badge would weaken the product.

## Observed issues and implemented changes

| Priority | Evidence from the running UI | Change |
| --- | --- | --- |
| High | Readiness → Open scenario showed “No steps.” for a scenario with three recorded steps. | Open the claim's recorded run, select a real step, and normalize selection across run/history changes. |
| High | Every section shared the same URL; refresh returned to Run. | Persist the page and Run selection in the URL; handle browser back/forward and retain existing comparison/import/map links. |
| High | A failed route scan could replace a different page after the user navigated away. | Request identity guards, a page-local error state and an explicit retry; no automatic failure loop. |
| High | The example exposed the enclosing repository's approximately fifty branches and offered to grow detached HEAD. | Mark the bundled example explicitly; isolate its repository controls and refuse example branch-growth requests on the server. Explain the path to a real project. |
| High | Secondary tools widened the header and overwhelmed the phone layout. | Four main pages plus one Tools disclosure, labelled icons, short tool descriptions and responsive targets. |
| Medium | Readiness repeated four green status dimensions and four or five actions for every already accepted claim. | Open claims first. Ready claims and technical review options expand on demand. Preserve all four underlying state dimensions. |
| Medium | Discover rendered every branch as a separate button, alongside full intent and route sections. | One native branch selector; one primary change flow; descriptions and route inspection fold away. |
| Medium | New disclosure could hide the destination of “Write this flow.” | Reveal destination ancestors before moving focus; keep the original typed intent through asynchronous scans. |
| Medium | Heal offered a prominent repair action even when all scenarios passed. | A quiet healthy state with “Back to the run” and an optional preview. |
| Medium | Compare exposed repeated hashes and unchanged scenarios at the same weight as regressions. Its empty state required users to find Run themselves. | Changes first; unchanged scenarios and receipt details expand on demand. The empty state links directly to Run. |
| Medium | Import and benchmark introductions led with producer/qualification/admission terminology. | Task-first copy and readable format names; exact provenance, cost caveats and timing details remain inspectable. |
| Medium | Snapshot selection occupied the default Settings view despite being an advanced path. | Fold application-file selection away; the Run input control reveals and focuses the exact destination. |
| Medium | Successful check detail repeated the same facts in expectation, response and raw assertion prose. | Keep the expected/observed result; expand successful check details on demand. Failed checks remain visible. |
| High | The self-test runner focused native disclosure controls without activating them in keyboard mode. | Activate native summaries with Enter; test mouse, keyboard and touch paths. |
| High | A nested branch proof allocated worktrees under a symlinked system temporary directory on macOS. | Resolve the temporary root before allocation; preserve source/artifact ownership checks and exercise a symlinked-temp proof. |
| Medium | A fresh run displayed the prior successful headline while it was running. | Show an explicit checking state and label retained results as the previous run. |
| Medium | Command search had no meaningful no-match state or focus return. | Empty search guidance, contained keyboard focus, an explicit close action and focus restoration. |

## Page state model

These states describe actual data and work. Loading never implies progress; an empty page never implies failure. Navigation does not erase operation state, and late responses cannot substitute for a newer request.

| Page | States and transitions | Primary question / action |
| --- | --- | --- |
| Run | No config → initialize; no result → run; running → cancel/settle; passed/failed/blocked/unverifiable → inspect selected step or rerun. | What happened, and which step needs me? |
| Discover | Example explanation; choose source → read/trace/draft → choose depth → prove → verdict; no route results and scan errors have separate recovery states. | What changed, and what is still unproven? |
| Readiness | Loading/error; no claims; open claims (unsupported/stale/pending/challenged); ready claims. Review decisions remain separate from execution. | What still needs review before handoff? |
| History | No runs → Run; recorded matrix → exact run/scenario. | What changed over time? |
| Heal | Healthy; preview; diagnosis/repair/proof; cancelled; changed/partially changed/product bugs/needs human; undo retained changes. | Is there a safe repair to review? |
| Compare | Fewer than two runs → Run; choose pair → loading → differences/error; swap and inspect either side. | Which checks changed between these runs? |
| Imports | No report; selected file → import; loading/error/retry; retained report → filter/select/download. | What did the existing test tool report? |
| Map | No runs → Run; choose run/search → loading/error/retry; no matches → clear search; recorded journey → step/citation/run. | Which recorded journey can I inspect? |
| Benchmark | Loading/unavailable/no runs/recorded usage/incomplete comparison; axis change invalidates old results; captured JSON remains evidence of that capture. | What timing and usage were actually recorded? |
| Environments | No setup → Run; configured/unchecked → check setup; ready/blocked → inspect checks; run in selected environment. | Where will this run, and is it ready? |
| Settings | Agent choice/model → save/error; advanced source preview → valid/blocked → select; project context. | Who helps, and which app files will the next run use? |

## Interaction and visual rules

- Bonsai forms carry relationships; small line icons carry navigation. No decorative dashboard cards or new palette.
- Preserve stone, moss, gold, vermilion, the existing serif headings and the existing type hierarchy.
- Empty states use the existing seedling drawing, one explanation and one meaningful next action. Healthy is calm, not a warning.
- Page arrival and seedling entry are brief. Press feedback is tactile. Existing live growth remains tied to real events. Reduced-motion preferences disable added motion.
- Disclosure remembers its state during asynchronous updates. Cross-links open the needed disclosure before focusing their target.
- Current page, operation busy state, selection and errors remain available in semantic DOM attributes. Main content has a skip link.
- At 375 px, navigation and primary actions stay inside the viewport; tables scroll within their section, and the run bonsai scales with its column.

## Scope and evidence

All eleven original navigation destinations were opened in the live browser. Additional checks covered readiness-to-scenario navigation, snapshot preview failure, workflow results, benchmark results, command search, phone layout and the contrast between the demo Run and Discover states. The isolated preview uses a copy of the same example's saved evidence; original example files and the npm-installed server remain separate.

Regression coverage includes page reachability at desktop/375 px, refresh/back navigation, real step selection, sample repository isolation, a late failing scan, explicit retry, disclosure preservation, command focus, and actionable no-run states. Existing comparison, imports, saved-evidence, benchmark, grow/drawer and host-operation suites exercise populated, corrupt, late-response and cancellation states. The dogfood browser journeys are updated to follow the disclosed controls.

Human sign-off is an actual decision and was not fabricated to make the example look ready. Real paid-model calls, remote-environment writes, publishing and deployment are outside this audit. The installed `21st` CLI was unavailable; deterministic source and browser checks were used with the existing project primitives.

## Product decisions still worth making

1. **Default demo:** the voice example proves a real run but does not naturally demonstrate branch discovery. A future branch-aware demo should be an explicit sample repository, with its own small history and spec. Do not silently bind the demo to a user's enclosing repository.
2. **Readiness language:** “claim” remains an exact protocol concept in evidence and review details. The main experience speaks in tests and review tasks. Avoid renaming protocol values to cosmetically match the interface.
3. **Advanced capabilities:** imported observations, timing records and saved maps have real front doors, but do not themselves establish independent verification or current production behavior. Keep those limits adjacent to the relevant detail.
4. **Motion:** richer growth choreography should use the existing tree and real event stream. Do not add ambient motion or artificial completion delays to empty states.

## Validation receipts

- Typecheck, all 115 schema checks, production build and built browser-script parsing passed locally.
- All four browser journeys passed through Tracegrove itself: `2026-10-23T11-27-26Z_pass_0d2157`. This includes a deterministic local stand-in for drafting, not a paid model call. Evidence and videos are under `dogfood/.tracegrove/runs/2026-10-23T11-27-26Z_pass_0d2157/`.
- The 49-test Grow suite passed, including branch worktrees, the symlinked-temp regression and the existing bonsai geometry/motion tests.
- The isolated voice example was run again from the UI: all four scenarios passed (`2026-10-23T10-53-01Z_pass_1b6c16`), making two real saved runs available for comparison.
- Use a canonical system temporary directory for local gates on macOS (for example `/private/tmp`), rather than the `/tmp` or `/var` symlink aliases.

- Final regression run: **210 passed across 16 suites**, saved at `artifacts/qa/design-audit/final-regressions.log`.
- Final conformance run: **29 passed**, saved at `artifacts/qa/design-audit/final-conformance.log`.
- Final self-test receipt: **4 passed**, saved at `artifacts/qa/design-audit/final-selftest.log`.
- All eleven pages were revisited at 375 px in the final build: document width equalled viewport width on every page, with no browser warnings or errors. Desktop and mobile captures are saved as `artifacts/qa/design-audit/final-<page>-desktop.png` and `final-<page>-mobile.png`.
- Preview: `http://127.0.0.1:51429/`. Changes are local and uncommitted; no merge, deployment or new npm publication was performed.

[Run, desktop](../artifacts/qa/design-audit/final-run-desktop.png) · [Readiness, desktop](../artifacts/qa/design-audit/final-readiness-desktop.png) · [Run, phone](../artifacts/qa/design-audit/final-run-mobile.png)

## Tree cohesion follow-up

Recorded runs now share Grow's spline, tapered wood, foliage silhouette, leaf geometry and material tokens through `uiTreeGeometry.ts`, including the round-12 refinements from PR #94. Run keeps its meaning: a branch is a recorded scenario, a leaf is a step, and roots describe recorded routes. Failures use Grow's bitten leaf; unrun and unavailable evidence remain outlined. Large runs default to eight branches, prioritizing the selected scenario and failures, with an explicit expansion control and the complete scenario list below.

The header and browser tab share one bonsai mark. The local SVG favicon supports light and dark appearances; empty-state seedlings use the same curves and leaf shape. Keyboard branch selection retains focus; mobile selection opens the real step detail.

Validation: 84 tests passed across the latest Grow, knot-name and navigation suites after integrating upstream #94 and #95. All 17 navigation tests passed again after the compact-tree guard, including favicon serving, keyboard selection, exact leaf counts and dense geometry bounds. Earlier saved-evidence/Grow drawer coverage passed 117 tests. Live 375 px branch targets measured approximately 57 × 46 px, document width remained 375 px, and no browser warnings or errors were recorded. Captures are local at `artifacts/qa/design-audit/tree-cohesion-desktop.png` and `tree-cohesion-mobile.png`.
