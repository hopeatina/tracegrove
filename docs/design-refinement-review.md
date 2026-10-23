# Tracegrove: three rounds with Claude Opus 5.5

23 October 2026. Follow-up to [the original flow audit](design-flow-audit.md). These refinements are local on `codex/design-flows-audit`.

## Collaboration and evidence

Used the installed Claude Code CLI, pinned to `claude-opus-5-5`, through the existing signed-in subscription. Three review turns resumed the same session (`c4da81c0-10e6-4762-bb88-dc5bd9e3493a`). Each response reports only `claude-opus-5-5` in model usage, no error and no permission denials. No fallback model was configured. An initial launch stalled on unrelated connector startup; it was stopped and restarted with those connectors excluded. Normal permission checks remained enabled.

The exact model ID follows [Anthropic's current Opus 5.5 documentation](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide); the saved CLI responses establish which model actually handled these reviews.

Claude had read-only access to the relevant local code, audit and synthetic example screenshots. It did not edit code or operate the browser. Implementation, tests and live browser validation were performed in this worktree. The JSON model receipts, prompts and readable reviews are saved under `artifacts/qa/design-audit/opus-round-{1,2,3}.*`.

## Where Claude added a distinct perspective

1. **Coherence across pages.** The first audit evaluated each page's states; Claude noticed that a healthy Run could conceal an outstanding human decision on Readiness. Run now offers a direct sign-off link without combining passing and approval into one state.
2. **Phone task completion.** The first audit proved fit and reachability at 375 px. Claude identified that selecting a step still left its evidence far below the visible screen. Selection now brings detail into view with keyboard focus and a clear return to the selected step. Tiny SVG labels are hidden on phones; scenario names remain in the accessible list and routes remain in step detail.
3. **Continuity during change.** Claude shifted attention from static screens to refreshes, decisions and typing. Existing evidence stays visible while updating. Drafts, cursor position and focus survive redraws; errors stay beside the relevant decision. Concurrent refreshes coalesce and fetch again after a decision rather than displaying an obsolete pending result.
4. **Truth in simpler language.** Claude corrected our mistaken description of `superseded`: the check changed, rather than a newer run necessarily existing. Current evidence and run age are now separate facts. Stale checks do not say they merely need sign-off, and waivers remain explicitly visible even when handoff is allowed.

## Revision rounds

| Round | Input | Adopted changes |
| --- | --- | --- |
| 1 | Original audit, implementation, Run/Readiness/Discover screenshots at desktop and phone sizes | Cross-page review link; visible evidence summary; calm pending tone; retained review data during updates; phone detail navigation; quieter page arrival. |
| 2 | The revised implementation and backend readiness contract | Accurate changed-check wording; shared review-stage logic; explicit waiver labels and reasons; nonblocking Run load; inline reason forms; persistent errors and neutral receipts; concurrent refresh handling. |
| 3 | Revised code and four new desktop/375 px screenshots | Draft isolation across rows and decisions; caret/focus preservation; honest waived-handoff headline; scoped save errors; waiting behavior during refresh; removal of duplicated failure/protocol prose; active decision indication; more room for header freshness. |

## Suggestions challenged or bounded

- Kept successful status text: colour alone is insufficient, particularly for small leaves and pips.
- Rejected wording that claimed the evidence came from the latest run without that fact being established.
- Did not add ornamental ambient motion, delays, containers or dependencies. Arrival motion is subtle and respects reduced motion; phone scrolling responds directly to selection.
- Kept decision submission explicit. Viewing the form and taking screenshots did not record any real sign-off, waiver or challenge. Decision-write tests intercept the endpoint with synthetic responses.
- Preserved the original Discover example front door and its explicit boundary from a real repository; changing the default demo is a separate product decision.

## Verification

Navigation coverage now includes review continuity, phone selection and return, failed saves, reason preservation, changed-check and waiver language, typing focus/caret during refresh, and decisions on separate rows. All eleven destinations remain covered at desktop and 375 px.

- Final UI/readiness regression gate: **86 passed across 11 suites**, including 15 navigation tests. Receipt: `artifacts/qa/design-audit/opus-final-regressions.log`.
- Final typecheck, production build, built browser-script parsing and `git diff --check` passed.
- Live desktop and 375 px browser checks covered the sign-off link, inline reason field, retained draft during refresh, Escape/cancel focus return, step selection and return. Phone document width equalled the viewport (375 px). The browser reported no warnings or errors.
- Captures: `opus-final-readiness-desktop.png`, `opus-final-reason-desktop.png`, `opus-final-reason-mobile.png`, `opus-final-step-mobile.png`, all under `artifacts/qa/design-audit/`.
- The original audit's Grow, conformance and product-self-test receipts remain separately documented; they were not repeated in this refinement round. No backend decision/evidence protocol was changed.

The local preview is [127.0.0.1:51429](http://127.0.0.1:51429/). No new npm version, PR, merge or deployment was performed during these refinement rounds.
