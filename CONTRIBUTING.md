# Contributing to tracegrove

Thanks for helping. Bug reports, flows for frameworks we don't cover yet, docs fixes and pull requests are all welcome.

## Setup

You need Node.js 22 (`>=22.22.0 <23`) and npm. Python 3.13 is only needed for the FastAPI and Django samples, and Chromium only for browser tests.

```bash
git clone https://github.com/hopeatina/tracegrove.git
cd tracegrove
npm ci
npx playwright install chromium     # optional: browser and dogfood tests
```

Run the CLI from source with `npx tsx src/cli/main.ts <command>`, or build with `npm run build` and use `node dist/cli/main.js`.

## Checks to run before a pull request

```bash
npm run verify            # typecheck, schema check, full test suite
npm run test:conformance  # protocol conformance vectors
npm run test:dogfood      # tracegrove testing its own UI server (needs Chromium)
```

If you change a schema under `src/protocol` or `src/authoring/schema.ts`, run `npm run schema:export` and commit the regenerated files in `schema/`.

For the Python samples, create a virtualenv with `src/samples/fastapi-notes/requirements.txt` and `src/samples/django-notes/requirements.txt` and point `TRACEGROVE_PYTHON` at its interpreter.

## How the code is laid out

- `src/protocol/` holds the versioned schemas (`workflow.*/v1`). Changes here are contract changes; keep them additive.
- `src/core/` is the kernel: compiler (admission rules), planner, executor, reducer (verdicts) and evidence bundles.
- `src/adapters/` holds the drivers: HTTP, browser, MCP, jobs, conversation (voice and chat).
- `src/authoring/` turns `tracegrove.config.yaml` and `*.flow.yaml` into kernel cases, and holds the UI, readiness and handoff.
- `src/samples/` are runnable sample apps; each has flows that must pass in CI.

[docs/architecture.md](docs/architecture.md) explains how a run flows through these pieces.

## Adding an adapter

New surfaces, hosts, framework presets, credential sources, evidence importers and deploy detectors each plug in behind a typed interface and one registry line. [docs/extending.md](docs/extending.md) walks through each kind and the files to touch, and [ROADMAP.md](ROADMAP.md) lists what's planned and which adapters are open for a contributor. Open an issue with the **Adapter request** template before you start, so two people don't build the same one.

## Ground rules

- **Never weaken a check to get green.** If a test seems wrong, say why in the pull request. The same rule applies to the coding agents tracegrove drives.
- **New behavior needs a test that fails without it.** For a new step kind or adapter, include a sample flow that passes and a deliberate bug that the flow catches.
- **Keep secrets out of everything.** Use synthetic data in samples and tests (555 phone numbers, `example.com` emails).
- **Keep evidence honest.** Docs and reports should say what a check does not cover.

## Pull requests

Keep them focused, describe the user-visible change, and include the commands you ran. By contributing, you agree your contribution is licensed under the [Apache License 2.0](LICENSE).

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, see [SECURITY.md](SECURITY.md) instead of opening a public issue.
