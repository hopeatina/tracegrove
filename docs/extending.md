# Extending tracegrove

tracegrove is built to be extended at two levels:

1. **In your own repository, without changing tracegrove.** Reusable actions, stand-ins for third parties, credential sources, environments, imported evidence and rubrics are all plain files next to your flows.
2. **In tracegrove itself, as an adapter.** Each kind of adapter is one file and one registry line behind a typed interface. The kernel's rules stay untouched: it plans, runs, judges and seals your adapter's steps the same way it handles the built-in ones.

This page covers both. The [roadmap](../ROADMAP.md) lists the adapters that are planned and the ones nobody has claimed yet.

## What's built in

| Kind | Built in today |
| --- | --- |
| Step kinds (surfaces) | `http`, `browser` (Chromium), `mcp` (tools), `job` (background jobs), `voice` and `chat`, `standin` readback, `use` (actions) |
| App launch presets | `node`, `fastapi`, `django` |
| Hosts (where the app runs) | local process, mock loopback, `url` (an app that's already running or deployed), `compose`, `container` |
| Credential sources | `host_issued`, `env`, `file`, `aws-sm`, `aws-ssm`, `op` (1Password), `orgx-broker` |
| Deploy detection (`env detect`) | Docker Compose, Fly, Render, Vercel, Netlify, `.env.<stage>` |
| Evidence imports | Playwright JSON and JUnit XML reports (`import-observations`), Retell, Vapi and plain-text call logs (`import-call`) |
| Coding agents | Claude Code and Codex (`draft`, `heal`, the UI's Ask Claude), plus any MCP client through `tracegrove mcp` |

## Part 1: extend it in your own repository

### Reusable actions

Any sequence of steps that more than one flow needs, such as signing in, creating a record or opening the settings page, belongs in an action:

```yaml
# tracegrove/actions/notes/create.action.yaml  →  the action notes.create
inputs:  { title: null, body: "" }        # null means required
outputs: [noteId]
routes:  ["POST /api/notes"]
steps:
  - name: create the note
    post: /api/notes
    json: { title: "{title}", body: "{body}" }
    expect: { status: 201 }
    save: { noteId: id }
```

Flows call it with `- use: notes.create`, plus `with:`, `as:` and `save:`. Actions can call other actions. At compile time they expand into ordinary steps, so every step inside one is executed, checked and sealed like a hand-written step. Agents are shown your action library and told to reuse it. See [reusable actions and the catalog](agent-guide.md#reusable-actions-and-the-catalog).

### Stand-ins for any third party

Your app's calendar, CRM, payment API or n8n webhook can be replaced with a recording stand-in declared in `tracegrove.config.yaml`. Flows then check exactly what your app sent and can make the service fail, slow down or hang up. You need no code and no mock library, only a base-URL environment variable your app already reads. See [stand-ins](stand-ins.md).

### Any stack, through a container or a URL

The `node`, `fastapi` and `django` presets launch the app for you. Any other stack (Rails, Go, Next.js, Java) can be tested today in one of two ways:

- Declare a `container:` or `compose:` target. tracegrove starts the app in Docker, waits for it to come up and tears it down afterwards.
- Point a `url:` environment at an app you started yourself, or at a deployed preview.

See [environments](environments.md). Launching these stacks directly, without Docker, is on the [roadmap](../ROADMAP.md).

### Any secret store

Personas get their credentials through `from:` references: `env:`, `file:`, `aws-sm://`, `aws-ssm://`, `op://` and `orgx-broker://`. For a store that isn't on that list, such as Vault, Doppler or GCP Secret Manager, have your CI step export the value and use `env:NAME`. The reference is recorded in the evidence; the value never is. A native resolver is a small contribution (Part 2).

### Evidence from the tools you already use

- `tracegrove import-observations` keeps Playwright JSON and JUnit XML results as sealed evidence next to tracegrove's own runs. Anything that writes JUnit XML can feed it, including pytest, Jest, Go and Maestro. See [imported observations](native-observation-import.md).
- `tracegrove import-call call.json` turns a real Retell, Vapi or plain-text call log into a draft voice flow. See [voice and chat](voice-and-chat.md).

### Your own pass criteria

Checks decide pass or fail. For model output that a check can't judge, rubric files grade transcripts and feed the readiness assessment, and `risk: critical` claims wait for a person's sign-off. See [readiness and handoff](readiness-and-handoff.md).

### Flows in TypeScript

A `*.flow.ts` file that default-exports plain JSON data is read the same way as YAML. It runs in a separate process with a time limit, so you can generate cases from a table or share constants with your app.

## Part 2: add an adapter to tracegrove

Every adapter follows the same pattern:

1. Implement a typed interface in one file.
2. Add one line to that kind's registry. The registry's TypeScript `satisfies` check fails the build if any declared kind has no implementation.
3. If the adapter adds a new name to a protocol enum, change `src/protocol/` additively and run `npm run schema:export`.
4. Ship a **golden fixture**: a sample that passes, at least one seeded defect that fails with its own reason code, and an unrelated control that keeps passing.

The fourth step is what makes an adapter trustworthy. It proves the adapter can fail as well as pass.

### Credential source

*Interface:* `defineResolver` in `src/credentials/types.ts`. *Registry:* `src/credentials/registry.ts`. *Enum:* `SECRET_RESOLVER_KINDS` in `src/protocol/schemas/targetBinding.ts`.

A resolver needs three things:

- `refSchema`, which parses the reference URI. References are never secret and are recorded in the evidence.
- `probe`, a cheap check used by `env doctor` that never fetches or prints a value.
- `resolve`, which returns the value.

Map failures to the existing `ResolverError` codes (`secret_missing`, `secret_expired`, `secret_access_denied` and the rest), so the CLI tells people how to fix them. `src/credentials/resolvers/op.ts` shows how to wrap a CLI, and `aws.ts` shows how to call an HTTP API.

*Good first adapters:* `vault`, `doppler`, `gcp-sm`, `azure-kv`.

### Host

*Interface:* `defineHost` in `src/hosts/types.ts` (`start()` returns a session with an `origin`, the persona tokens and `stop()`). *Registry:* `src/hosts/registry.ts`.

A host decides where the app runs and how tracegrove reaches it. It must report what it really observed: which process or container served the port, what it was built from, and whether `stop()` confirmed the app is gone. That's why the bare `command` adapter is refused today, since a shell wrapper can't vouch for what it started. `compose.ts` and `container.ts` are the models to follow.

*Wanted:* an observed-process host (see the roadmap), Kubernetes namespaces, cloud sandboxes (E2B, Modal), Windows process trees.

### App launch preset

*Where:* the `app.adapter` enum in `src/authoring/schema.ts`, the launch recipe in `src/authoring/appLaunch.ts`, detection in `tracegrove init`, and route scanning in `src/authoring/discover.ts`.

A preset bundles four things: a detector, a launch recipe, a readiness check and a route inventory. It must be pinned to a real open-source repository it is tested against. Framework presets are planned as versioned packs on top of the observed-process host; open an issue before starting one so the work lines up with that design.

### Step kind (surface)

*Where:*

- the driver and capabilities in `src/adapters/<name>/`;
- the flow syntax in `src/authoring/schema.ts`;
- the compile mapping in `src/authoring/compile.ts`;
- dispatch in `src/core/executor.ts`.

This is the largest kind of adapter. Its capabilities file declares the operations it performs and the facts (oracles) it can observe, and the compiler refuses a flow that needs something the runner doesn't declare. Every effect a step claims has to be readable back by a separate step, so the reducer never trusts the step's own reply. `src/adapters/conversation/` (voice and chat) is a compact example that builds on the HTTP runner.

*Already declared in the protocol, waiting for an executor:* `database.fixture`, `pipeline.check` (dbt, Great Expectations), `wiremock.contract`, `integration.action`, and the `ios`, `android` and `mcp_widget` surfaces.

### Evidence importer

*Where:* `src/imports/` (`playwright.ts` and `junit.ts` are the models).

An importer parses another tool's report into imported observations. It is bounded, keeps the original bytes and never claims verification it didn't do. Pin it with real reports produced by that tool.

*Wanted:* Cypress, Maestro, Appium, k6.

### Deploy detector

*Where:* `detectEnvironments` in `src/environments/detect.ts`.

A detector reads a deploy file the repository already has and proposes an environment. Be conservative: an unnamed deployment is proposed as read-only production, and only URL-shaped values are ever read from `.env` files.

*Wanted:* Railway, Heroku `app.json`, Kubernetes manifests, Cloudflare `wrangler.toml`.

## Before you start

- Open an issue with the **adapter request** template. Say which kind of adapter it is, the tool or service, and the golden fixture you have in mind. Someone may already be working on it, and the roadmap shows what is claimed.
- Read [CONTRIBUTING.md](../CONTRIBUTING.md). Its ground rules apply: never weaken a check to get green, a new behavior needs a test that fails without it, and samples use synthetic data only.
- Keep `src/protocol/` changes additive. Those schemas are versioned contracts that saved evidence depends on.
