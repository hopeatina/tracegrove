# Environments: run the same flows locally, in Docker, on staging and against production

By default tracegrove launches your app on this machine (`local`). An environment lets the same
flows run against a container, a Compose project, a deployed staging URL or production. Persona
credentials come from your secret store and are never written down. Each environment has a safety class,
which decides what a run may write, how cleanup is judged and whether a coding agent may run it.

```bash
tracegrove env list                          # targets, classes, policies, persona references
tracegrove env doctor staging                # reachable? ready? secrets resolvable? personas who you think?
tracegrove explain --env staging             # dry plan: what runs, as whom, what it writes and cleans up
tracegrove test --env staging                # or TRACEGROVE_ENV=staging tracegrove test
```

The environment is chosen in this order: `--env`, then `TRACEGROVE_ENV`, then `env` in
`.tracegrove/settings.json` (per developer, uncommitted), then `local`.

## Environments {#environments}

```yaml
# tracegrove.config.yaml
environments:
  docker:
    target:
      container: { image: "myapp:dev", port: 8080, env: { PORT: "8080" }, tokensEnv: TRACEGROVE_TOKENS }
      health: /health
  compose:
    target: { compose: docker-compose.test.yml, service: web, port: 8080, tokensEnv: TRACEGROVE_TOKENS }
  staging:
    target:
      url: https://staging.example.com
      health: /api/health
      release: { field: build, expect: "2026.10.19-rc1" }   # optional: block if a different build is deployed
    class: deployed_preview          # the default for url targets
    whoami: { GET: /api/me, subject: user.id }
    personas:
      owner:    { from: "aws-sm://myapp/staging/personas#owner" }
      stranger: { from: "orgx-broker://staging?role=member&workspace=fresh" }
    budget: { maxRequests: 500 }
    agents: ask
  prod-readonly:
    target: { url: https://example.com }
    class: production_observation    # writes: none, agents: deny
    personas: { owner: { from: "op://Eng/myapp-prod-observer/token" } }
```

| Target | Who starts it | Class | Personas |
| --- | --- | --- | --- |
| `launch: app` (local, implicit) | tracegrove, from `app:` | `isolated_candidate` | host-issued tokens (unchanged) |
| `container:` | tracegrove, `docker run` with a fresh name, port published on loopback | `isolated_candidate` | host-issued, injected through the Docker client's environment |
| `compose:` | tracegrove, `docker compose -p <run-owned project> up` | `isolated_candidate` | host-issued, passed through `tokensEnv` |
| `url:` | nobody; already deployed | `deployed_preview` (default), `deployed_canary` or `production_observation` | any resolver except `host_issued` |

Host-issued tokens reach a container through the Docker client's environment (`-e NAME` with no value
on the command line), so they never appear in `ps` output or in shell history. For Compose, list
`tokensEnv` under the service's `environment:` so it is passed through. `docker compose down -v` and a
`docker ps` check confirm that the run's containers are gone. If they are still present, cleanup is
unconfirmed.

## Flows opt in {#flows}

A flow runs only in the environments it lists. With no `envs:`, it runs only in `local`.

```yaml
title: A note is invisible to another tenant
envs: [local, docker, staging]
```

`tracegrove list --env staging` and `tracegrove explain --env staging` show what is enabled. If no flow is
enabled for the environment, the run blocks with `no_flows_for_environment`. Adding an environment to
`envs:` is a reviewed change, not a fix for a failing run.

## Credentials: resolvers, not a vault {#credentials}

A persona's `from:` names a resolver and a reference. tracegrove resolves the secret into memory for
one attempt. It is a branded `Secret` that throws on serialization and prints as `<redacted>`, and it is
scrubbed from events and summaries. The sealed bundle records only the resolver kind, the reference, the
recipe and the expiry (`credential-lease.resolved[]`).

| Resolver | Reference | Notes |
| --- | --- | --- |
| `host_issued` | `host_issued` | Launched targets only. The default for local, docker and compose. |
| `env` | `env:OWNER_TOKEN` | For CI secrets. |
| `file` | `file:.env.staging#OWNER` | A gitignored dotenv file inside the project. `doctor` suggests `chmod 600` when the file is group- or world-readable. |
| `aws-sm` | `aws-sm://myapp/staging/personas#owner` | Secrets Manager. `#field` selects a key of a JSON secret. `?region=` is optional. |
| `aws-ssm` | `aws-ssm:///myapp/staging/owner-token` | Parameter Store, `WithDecryption`. |
| `op` | `op://Vault/item/field` | The 1Password CLI (`op read`). Set `TRACEGROVE_OP_BIN` to use another binary. |
| `orgx-broker` | `orgx-broker://staging?role=owner&workspace=fresh&ttl=900` | A short-lived persona minted for this run, then revoked ([broker](#broker)). |

AWS uses SigV4 and the standard credential chain, with no SDK. The chain checks, in order:

1. `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (plus a session token).
2. `AWS_SHARED_CREDENTIALS_FILE` or `~/.aws/credentials`.
3. Static keys in `~/.aws/config`.
4. An IAM Identity Center profile, read from the `aws sso login` token cache.

The profile comes from `AWS_PROFILE` and the region from `AWS_REGION` or the profile. When the SSO session has
expired, doctor's fix is `aws sso login --profile <profile>`. `AWS_ENDPOINT_URL` (or
`AWS_ENDPOINT_URL_SECRETS_MANAGER` / `AWS_ENDPOINT_URL_SSM`) points the resolvers at a local endpoint,
such as LocalStack.

Probes (`env show`, `env doctor`) call metadata APIs only (`DescribeSecret`, `DescribeParameters`,
`op item get`, the broker's capabilities route) and never read a value. The only exception is `whoami`,
which signs in.

## Auth recipes {#recipes}

A recipe turns the resolved secret into request credentials, so any recipe combines with any resolver.
`auth:` defaults to `bearer`.

| Recipe | Config | The secret is |
| --- | --- | --- |
| `bearer` | `auth: bearer` | the token |
| `header` | `{ kind: header, name: X-Api-Key, prefix: "" }` | the header value |
| `form_login` | `{ kind: form_login, path: /login, cookie: session, username?: … }` | the password, or JSON `{username, password}`; the named session cookie is kept |
| `oauth_client_credentials` | `{ kind: oauth_client_credentials, tokenUrl, clientId, scope?, audience? }` | the client secret |
| `clerk_testing` | `{ kind: clerk_testing, frontendApi, backendApi?, userId }` | the Clerk secret key; testing token, then sign-in ticket, then session JWT |
| `supabase_password` | `{ kind: supabase_password, url, anonKey, email }` | the password |

Recipes that sign in contact only the target origin, `endpoints:` and `network.allow`. Any other host
fails with `origin_not_allowed` before the secret is sent.

## The OrgX persona broker {#broker}

`orgx-broker://<environment>?role=<role>&workspace=fresh&ttl=<seconds>` mints a persona that exists only
for this run. The broker base URL is `TRACEGROVE_ORGX_BROKER_URL` (default `https://useorgx.com`). Every
call carries `Authorization: Bearer $TRACEGROVE_ORGX_TOKEN`, the standing-grant key. Neither value is
recorded.

Wire contract (JSON over HTTPS):

| Call | Request | Success | Meaning |
| --- | --- | --- | --- |
| Capabilities (probe) | `GET /api/test-personas/capabilities?environment=<env>` | `200 { enabled: boolean, roles?: string[] }` | `enabled: false` means minting is disabled there; it must be false in production |
| Mint | `POST /api/test-personas` `{ environment, role, workspace, runId, persona, ttlSeconds }` | `201 { persona: { id, subject, workspaceId, role }, token, expiresAt, receiptId? }` | `subject` becomes the persona's expected whoami subject |
| Check | `GET /api/test-personas/<id>` | `200 { id, state: active\|expired\|revoked, expiresAt? }`; `404` when gone | used when the app answers 401 mid-run |
| Revoke | `DELETE /api/test-personas/<id>` | `204` (or `200`; `404` if already gone), then a check that reads `revoked` or `404` | cleanup; confirmed only by the follow-up check |

Errors: `401` means the grant key was rejected (`secret_expired`), `403` means the environment is not
enabled or the grant is missing (`secret_access_denied`), and `404` means the environment is not served.

Behaviour in a run:

- Minting happens when the host starts. The persona is a run-owned resource (`persona.<name>`, boundary
  `identity`), so the reducer requires its revocation to be confirmed.
- If the deployment answers `401` to a persona request, tracegrove asks the broker before blaming the
  app. If the persona is `expired` or `revoked`, the step fails with `persona_credential_expired` rather
  than an assertion about the app, and the run cannot pass.
- The fake in `examples/staging-notes/fakes/identity.mjs` implements this contract, including a control
  route that revokes the owner mid-run, and is what the tests use.

## whoami: is the persona who you think? {#whoami}

```yaml
whoami: { GET: /api/me, subject: user.id }
```

With `whoami:`, each run and `tracegrove whoami --env <env> [--as <persona>]` sign every persona in and
compare the returned subject with the persona's `subject:` (or with the broker-minted subject). A
different subject blocks with `persona_identity_mismatch`. Two personas with the same subject block with
`persona_identity_collision`, because a negative check between them would prove nothing. Both happen
before any step runs.

## env doctor {#doctor}

`tracegrove env doctor <env>` runs the portable-environment preflight first:

- authorization and agent policy
- artifacts
- limits
- the deployment and its release
- capabilities and endpoints
- readiness
- each persona's secret
- data and cleanup

Then it runs whoami for every persona, unless you pass `--no-whoami`.

Each failing check carries a `fix`, such as `aws sso login --profile x`, `eval $(op signin)` or
`export OWNER_TOKEN=…`, and an `owner`. Exit is `0` when ready and `2` when blocked. The result is cached in
`.tracegrove/doctor/<env>.json`, and `status --json` reports it under `environments[]`.

## Deployment identity {#identity}

A deployed target is not launched by tracegrove, so its identity is a declared release, not a verified
build. When `release.expect` is set, the url host reads `release.field` from the health body and blocks
with `identity_mismatch` if it differs. Container targets pin the image ID from `docker image inspect` at
compile time. Compose targets pin the compose file digest. The bundle records the observed release as an
`operator_declared_unverified` attestation.

## Safety classes {#safety}

| Class | Writes | Cleanup | Personas | Agents (default) |
| --- | --- | --- | --- | --- |
| `isolated_candidate` (local, docker, compose) | yes | owned and confirmed | host-issued or any resolver | allow |
| `deployed_preview` (staging) | `owned_namespace` only | confirmed, or the run **fails** (`deployed_cleanup_unconfirmed`) | any resolver or broker | ask |
| `deployed_canary` | `owned_namespace`, budgeted | confirmed, or the run fails | broker only | ask |
| `production_observation` | `none` (GET/HEAD only) | n/a | read-only observer | deny |

- Config may tighten a class, never loosen it. For example, `writes: owned_namespace` on
  `production_observation` is rejected with `invalid_environment`.
- On `writes: none`, the planner blocks any flow that writes, before running anything, with
  `environment_writes_forbidden`. The HTTP driver also refuses non-GET methods as a second line.
- On a deployed class, a run that created a record it could not confirm deleting is **failed**, not
  passed with a warning. The leftover physical ids are in the bundle.

## Agents {#agents}

tracegrove detects coding agents from the variables their CLIs set:

- `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT`
- `CODEX_*`
- `CURSOR_AGENT`
- `GEMINI_CLI`
- `TRACEGROVE_AGENT`

You can also name one with `--agent <name>`.

| Policy | An agent's run |
| --- | --- |
| `allow` | runs |
| `ask` | exits `2` with `approval_required` and the fix `tracegrove approve --env <env>`, which a person runs |
| `deny` | exits `2` with `agent_policy_denied` |

`tracegrove approve --env staging [--ttl 30] [--uses 1]` writes `.tracegrove/approvals/staging.json`. It
is single-use by default, expires after 30 minutes, and is bound to a digest of that environment's
config, so editing the environment voids it. `approve` refuses to run when it detects an agent
(`approval_requires_human`).

This is a guard against an agent drifting into staging. It is **not a security boundary**: anything with
shell access to the checkout can write that file. Real protection comes from what the credentials allow
and from the broker's grants.

Run reports record the agent, the policy, the decision and who approved the run.

## Network allowlist {#network}

A run may contact the target origin, the named `endpoints:` and the hosts in `network.allow`. Requests
to any other origin are refused before they leave the process, and auth recipes are held to the same
list. `env doctor` shows what is admitted.

## Budget {#budget}

`budget.maxRequests` (default 500 for url targets) caps the requests a run may make. The planner
estimates each flow's requests and blocks with `budget_exceeded` before starting if the plan would exceed
the cap. The driver enforces the same cap at run time. Cleanup is never refused by the budget.

## Docker {#docker}

Container and compose targets need a reachable Docker daemon (`docker info`). Without one, the run
blocks with `docker_unavailable`. Set `TRACEGROVE_DOCKER_BIN` to use another CLI. Container names and
compose project names are unique per attempt (`tg-<execution>-<random>`) and are labelled with the
execution id.

## Capabilities {#capabilities}

`tracegrove capabilities [--env <env>]` prints a capability-by-environment matrix (supported, missing or
denied) with the reason and fix for each gap. For example, url targets have no browser engine or MCP
transport, so browser and MCP flows stay local. The planner blocks a flow that needs a missing capability
with `capability_not_provided_by_host`.

## Config edits and `env add`

```bash
tracegrove env add staging --url https://staging.example.com \
  --persona owner=aws-sm://myapp/staging/personas#owner --persona stranger=env:STRANGER_TOKEN \
  --whoami '/api/me#user.id' --agents ask --dry-run
tracegrove config get environments.staging
tracegrove config set environments.staging.budget.maxRequests 200 --dry-run
tracegrove config patch '{"environments":{"staging":{"agents":"deny"}}}'
```

Edits go through the YAML document model, so comments and layout survive. Every result is validated
against the same schema as compile (`config_edit_invalid` otherwise). `--dry-run` prints the diff and
writes nothing.

## Machine-readable output and MCP

Every command takes `--json` and returns a versioned object:

- `tracegrove.env-list/v1`
- `tracegrove.env-show/v1`
- `tracegrove.env-doctor/v1`
- `tracegrove.whoami/v1`
- `tracegrove.explain/v1`
- `tracegrove.capabilities/v1`
- `tracegrove.config-get/v1`
- `tracegrove.config-edit/v1`
- `tracegrove.run-summary/v1`, with `environment`
- `tracegrove.status/v1`, with `environments[]`

Exit codes stay `0` pass, `1` assertion failure, `2` blocked, `3` infrastructure, `4` cancelled. A blocked
result lists `reasons[]` with `{code, detail, owner, fix}`. An agent runs the fix when `owner` is `agent`
and asks a person otherwise.

`tracegrove mcp` serves the same surface over MCP stdio. Its tools are:

- `status`
- `env_list`
- `env_doctor`
- `capabilities`
- `explain`
- `check`
- `test` (with `env`)
- `show_run`
- `heal`
- `draft`

It also serves the JSON schemas and AGENTS.md as resources. The server treats its caller as an agent, so
environment agent policies apply. Each session has ceilings: `--max-calls` (default 200) and
`--max-test-runs` (default 10, counting `test`, `heal` and `draft`).

```json
{ "mcpServers": { "tracegrove": { "command": "npx", "args": ["tracegrove", "mcp"] } } }
```

## Worked example

`examples/staging-notes/` runs one notes API in every way described above. `scripts/start-staging.sh`
starts the following:

- a fake identity platform: AWS Secrets Manager and SSM with an independent SigV4 check, the broker,
  Clerk and OAuth
- a staging deployment
- a preview whose DELETE keeps rows
- a production deployment

It writes generated secrets to a gitignored `.staging/` folder. `source scripts/env.sh` points the resolvers at
the fakes.
