# Roadmap

What tracegrove does today, what's next and what's open for contributors. Dates aren't promised. Order reflects what unblocks the most apps first. To build any of it yourself, see [Extending tracegrove](docs/extending.md).

**Status key:** ✅ shipped · 🔨 next · 🧭 later · 🙋 wanted (open for a contributor)

## Shipped in 0.4

| Area | What works |
| --- | --- |
| Surfaces | HTTP, Chromium browser with video, MCP tools, background jobs, voice (Pipecat-compatible WebSocket) and chat, stand-ins for third parties |
| Launching apps | Node, FastAPI and Django presets; Docker container and Compose; any running or deployed URL |
| Environments | `env detect` and guided `env add`, per-PR previews, production observation (read-only), credentials from env, file, AWS Secrets Manager or Parameter Store, 1Password |
| Authoring | Flows in YAML or TypeScript, reusable actions, a committed catalog, live discovery ranked by risk, agent drafting and healing (Claude Code, Codex), MCP server |
| Evidence | Sealed, replayable bundles, `verify-bundle`, signed evidence, PR proof card and GitHub Action, readiness sign-off, client handoff reports, redaction and sealed runs |
| Imports | Playwright and JUnit results, Retell and Vapi call logs |

## Next 🔨

| Item | Why |
| --- | --- |
| **Launch any app**: an observed-process host plus framework packs for TypeScript (`tsx`), Next.js, NestJS, Rails and Go | Today those stacks need Docker or a URL. The host observes which process really serves the port instead of trusting a shell wrapper, so any start command can qualify. |
| **Ask the framework for routes**: inventory probes for Node, FastAPI, Django and Flask | Route discovery reads source text today and misses dynamic routing. The probe asks the running framework instead. |
| **Recorder**: `tracegrove record` | Click through your app in Chromium. Each click, typed value and visible check becomes a typed step that finds elements by role, label or test id (never CSS or XPath), and the API calls the page made become readback steps. Repeated sequences such as signing in are offered as reusable actions. tracegrove replays the recording once in a fresh browser before saving it, and flags any step it couldn't locate by role or name instead of guessing. |
| **Live discovery**: plan the tests for a branch in front of you | `discover --branch` reads the diff, grows the change's tree, works out which layers it touches (UI, API, jobs, database, cache, third parties), and drafts happy, sad and edge scenarios for each layer in parallel. The terminal and the UI show every step as it happens. Three modes: **minimum** (the smallest set that proves the change works), **standard**, and **max** (adds regression on the key surfaces the change can reach). |
| **Playwright converter** | Turns existing Playwright specs (`getByRole`, `getByLabel`, `getByTestId`, `goto`, `click`, `fill`, `toHaveText`) into flows and flags lines it can't map, the same way `import-call` does for call logs. |
| **Test impact**: run only the scenarios a change can affect | Per-scenario coverage maps from real runs, so a PR runs a fraction of the suite without missing a changed route. |
| **A grove that scales** | A zoomable layout for suites of 30 to 500 scenarios. |

## Later 🧭

| Pack | What it adds |
| --- | --- |
| Judge with evidence | Rubric verdicts that cite transcript lines, can abstain, and are measured against a golden set before they count |
| Data pipelines | `pipeline.check` with dbt and Great Expectations, table readback in DuckDB or Postgres, HL7, EDI and CSV fixtures |
| Databases | `database.fixture`: seed, read back and reset, with template databases instead of app code changes |
| Hosted voice platforms | Drive Vapi, Retell and SIP agents directly, with caller personas and latency checks |
| Mobile by import | Maestro and Appium results paired with backend readback steps |
| SaaS sandboxes | `integration.action` for Salesforce scratch orgs, Microsoft Graph test tenants and an email capture sink |
| Multi-service | Follow one request across services in Compose or a preview, with lost-message and duplicate checks |
| More fidelity lanes | Recorded replay, hybrid live and canary runs alongside today's live sandbox and mock contract lanes |
| Computer use | A desktop driver that records into replayable steps, next to the browser driver |

## Wanted 🙋 (good first adapters)

These are self-contained, follow an existing example, and need no kernel changes. Open an issue with the **adapter request** template to claim one.

| Kind | Adapters | Follow |
| --- | --- | --- |
| Credential source | Vault, Doppler, GCP Secret Manager, Azure Key Vault | `src/credentials/resolvers/op.ts`, `aws.ts` |
| Evidence importer | Cypress, Maestro, Appium, k6 | `src/imports/playwright.ts`, `junit.ts` |
| Deploy detector | Railway, Heroku `app.json`, Kubernetes manifests, Cloudflare `wrangler.toml` | `src/environments/detect.ts` |
| Host | Kubernetes namespace, E2B or Modal sandbox, Windows process trees | `src/hosts/container.ts`, `compose.ts` |

## Suggest something

Open an issue describing the app or stack you want to test and what a passing run should prove. Requests with a public repository we can test against move fastest, because every adapter ships with one.
