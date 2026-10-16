# Tracegrove developer UX redesign

Status: phase 1 is implemented in the draft PR (see Phasing). Node, FastAPI and Django samples pass end to end through it.

## The problem today

Writing one HTTP test for the notes sample takes **19 YAML files across 13 folders** (`workflow.yaml`, suite, case, persona, auth recipe, component profile with a hand-pinned sha256, environment plan, host plan, runner, surface pack, surface binding, fidelity profile, intelligence policy, action registry, seed recipe, fixture plan, a materialized payload with a pinned digest, …). Every file carries `schemaVersion`, `ref.id` and `ref.revision`. Running it is four commands (`doctor`, `plan --output request.json`, `run --request`, `verify-bundle`) and the results land in `.workflow-verify/executions/<uuid>/`, a folder name nobody can find again.

The kernel underneath (frozen corpus, digests, independent readback, owned cleanup, sealed bundles) is the valuable part, and it stays exactly as it is. What is missing is a front door.

## Design principles

1. **One config, one file per test.** Everything else is derived, with an escape hatch to the strict v1 corpus when you need it.
2. **Convention over configuration.** Paths, ids, names and defaults come from where files live. Nothing has an id you have to invent.
3. **Compile, don't replace.** The new files compile into the existing `workflow.*/v1` documents, so every guarantee (digests, attestation, cleanup proof, `verify-bundle`) still holds and the evidence is identical in kind.
4. **One command to run.** `tracegrove test` plans, runs, reports and verifies. The frozen request is still written, just not by you.
5. **Framework presets, not framework plugins.** FastAPI, Django and Node are a few lines of launch defaults, not a dependency on the user's stack.
6. **Results you can find.** Human-named run folders, a `latest` pointer, Markdown + JSON + JUnit next to the sealed bundle.

## What a user's repo looks like

```text
my-app/
  tracegrove.config.yaml          # the only config file
  tracegrove/                     # tests live here (configurable: testDir)
    notes/
      create-read-delete.flow.yaml
      authz.flow.yaml
    fixtures/
      existing-note.fixture.yaml
  .tracegrove/                    # generated, gitignored
    runs/
      2026-10-16T14-22-03Z_pass_3f9a1c/
        summary.md  summary.json  junit.xml  bundle/
      latest -> 2026-10-16T14-22-03Z_pass_3f9a1c
    compiled/                     # the derived v1 corpus, for inspection or ejection
    state/                        # ledger
```

## Naming conventions

| Thing | Convention | Derived id |
| --- | --- | --- |
| Test file | `tracegrove/<area>/<behavior>.flow.yaml`, kebab-case | case id `<area>.<behavior>` |
| Fixture file | `tracegrove/fixtures/<name>.fixture.yaml` | entity key `<name>` |
| Step | `name:` in plain words, optional | `snake_case(name)`, else `<method>_<n>` |
| Assertion | from a step's `expect:` | `<step>.expect` |
| Persona | key under `personas:` | credential `<persona>_token` |
| Saved value | `save: { noteId: note.id }` | referenced as `{noteId}` anywhere later |
| Fixture output | `{existing.noteId}` | input from fixture `existing`, output `noteId` |
| Tags | `tags: [smoke, authz]` | coverage tags; filter with `--tag` |
| Run folder | `<UTC timestamp>_<outcome>_<short execution id>` | sortable, greppable |

## The config file

```yaml
# tracegrove.config.yaml
project: notes
app:
  adapter: node                 # node | fastapi | django | command
  entry: app/app.mjs            # node: script; fastapi: module:app; django: manage.py dir
  health: /health
  sources: [app/**]             # files whose digest is attested as "what was tested"
  env:
    NOTES_BUILD: sample
  inject:                       # where tracegrove hands the app its port, data dir and tokens
    port: PORT
    dataDir: NOTES_DIR
    tokens: NOTES_TOKENS
personas:
  owner: { subject: alice }     # first persona is the default caller
  intruder: { subject: bob }
```

Defaults when omitted: `testDir: tracegrove`, `inject` = `PORT`, `TRACEGROVE_DATA_DIR`, `TRACEGROVE_TOKENS`, `health: /health`, deadline 60 s, sources = all tracked-looking files under the app dir excluding `node_modules`, `.venv`, `__pycache__`, `.git`, `.tracegrove`.

## Adapter presets

| `adapter` | Launch it compiles to | Notes |
| --- | --- | --- |
| `node` | `node <entry>` with `PORT` set | Any Express/Fastify/Hono/Nest app that reads `PORT`. |
| `fastapi` | `<python> -m uvicorn <entry> --host 127.0.0.1 --port {port}` | `python:` defaults to `.venv/bin/python` if present, else `python3`. |
| `django` | `<python> manage.py migrate --noinput && <python> manage.py runserver 127.0.0.1:{port} --noreload` | Point `DATABASES` at `TRACEGROVE_DATA_DIR` for a fresh database per run (the sample does). |
| `command` | `run: "npm start"` (any shell command) | Escape hatch for anything else (Rails, Go, Docker compose wrappers). |

`{port}` and `{dataDir}` are substituted in `args` and `env` values. Tracegrove picks a free loopback port itself (the "assigned" port mode), so apps no longer need to print `listening <port>`.

**Auth hook.** Tracegrove issues a random bearer token per persona per run and passes `{token: subject}` as JSON in the `tokens` env var. The app adds about five lines in test mode to accept them:

```python
# FastAPI
tokens = json.loads(os.environ.get("TRACEGROVE_TOKENS", "{}"))
def current_user(authorization: str = Header("")):
    sub = tokens.get(authorization.removeprefix("Bearer "))
    if not sub: raise HTTPException(401)
    return sub
```

```python
# Django middleware
TOKENS = json.loads(os.environ.get("TRACEGROVE_TOKENS", "{}"))
def tracegrove_auth(get_response):
    def mw(request):
        sub = TOKENS.get(request.headers.get("Authorization", "").removeprefix("Bearer "))
        if sub: request.user = User.objects.get_or_create(username=sub)[0]
        return get_response(request)
    return mw
```

```js
// Express
const tokens = JSON.parse(process.env.TRACEGROVE_TOKENS ?? '{}');
app.use((req, _res, next) => { req.user = tokens[(req.headers.authorization ?? '').slice(7)]; next(); });
```

`tracegrove init` prints the right snippet for the detected framework.

## A test

```yaml
# tracegrove/notes/create-read-delete.flow.yaml
title: Create a note, read it back, keep other notes intact, delete it
risk: critical                  # critical | standard (default) | exploratory
tags: [notes]
given:
  existing: existing-note       # tracegrove/fixtures/existing-note.fixture.yaml
steps:
  - name: create
    POST: /notes
    json: { title: Fresh note, body: Written through the real API. }
    expect: { status: 201 }
    save: { noteId: note.id }

  - name: read back
    GET: /notes/{noteId}
    observe: true               # independent readback, polled until it holds
    expect: { status: 200, json: { note.title: Fresh note } }

  - name: intruder is denied
    GET: /notes/{noteId}
    as: intruder
    expect: { status: 403, absent: [note] }

  - name: delete
    DELETE: /notes/{noteId}
    expect: { status: 204 }

  - name: gone
    GET: /notes/{noteId}
    observe: true
    expect: { status: 404 }

  - name: existing note untouched
    GET: /notes/{existing.noteId}
    observe: true
    expect: { status: 200, json: { note.title: Existing note } }
```

Rules: one HTTP verb key per step; use block style (or quotes) for values containing `{` or `[`, because YAML reads them as inline maps and lists; `json:` is the request body; `expect.json` keys are dot paths into the response body; `absent` lists paths that must not exist; the effect envelope (allowed methods, path prefixes, max creates) is derived from the steps and fixtures, so the safety rails stay on without being written by hand.

## A fixture

```yaml
# tracegrove/fixtures/existing-note.fixture.yaml
create:
  POST: /notes
  json: { title: Existing note, body: { words: 6 } }
  expect: 201
save: { noteId: note.id }
readback:
  GET: /notes/{noteId}
  expect: { status: 200, json: { note.title: Existing note } }
cleanup:
  DELETE: /notes/{noteId}
  expect: 204
  gone: { GET: "/notes/{noteId}", status: 404 }
```

`{ words: 6 }` uses the deterministic generator; the logical payload is materialized at compile time, so there is no digest to paste.

## Commands

```text
tracegrove init                     detect FastAPI / Django / Node, write config + an example flow + .gitignore entry
tracegrove test [--grep notes] [--tag smoke] [--json]
                                    compile, plan, run, write the run folder, verify the bundle
tracegrove list                     list flows with their derived ids, tags and steps
tracegrove show [--run latest]      print a run's summary
tracegrove compile                  write the derived v1 corpus to .tracegrove/compiled (to inspect or eject)
```

Exit codes are unchanged (0 pass, 1 assertion failure, 2 blocked, 3 infrastructure, 4 cancelled). `workflow-verify` and all of its low-level commands keep working; the compiled folder is a normal `workflow.yaml` project, so `workflow-verify plan --config .tracegrove/compiled/workflow.yaml` still works.

## Output a human reads first

```text
tracegrove · notes · app sha 3e8d13bc9bd1

  PASS    notes.create-read-delete   6 steps  28 ms
  FAIL    notes.authz                3 steps  14 ms
          step "intruder is denied": expected status 403, got 200
          GET /notes/9c1e… -> 200 {"note":{"id":"9c1e…","title":"Fresh note"}}
  ERROR   notes.crud                 5 steps   0 ms
          (app startup): application exited before becoming ready; last app output:
          | ERROR:    Error loading ASGI app. Could not import module "app.mian".

1 passed, 1 failed · run .tracegrove/runs/2026-10-16T14-22-03Z_fail_3f9a1c
```

`summary.md` carries the same table plus per-step request/response excerpts; `junit.xml` lets GitHub Actions, GitLab and Buildkite annotate failures with no plugin.

## Forking it into your own repo

1. `npm i -D tracegrove` once it is published (today: install the packed archive, as the `tracegrove-notes-api` repo does).
2. `npx tracegrove init` writes `tracegrove.config.yaml`, `tracegrove/example.flow.yaml` and adds `.tracegrove/` to `.gitignore`.
3. Paste the printed auth snippet into the app's test-mode auth.
4. `npx tracegrove test`.
5. CI: one step, `npx tracegrove test`, then upload `.tracegrove/runs/latest` as an artifact.

## Phasing

| Phase | Scope | In the draft PR |
| --- | --- | --- |
| 1 | Config + flow + fixture compiler, node/fastapi/django/command presets, assigned port mode, app-output-on-startup-failure, `test`/`list`/`compile`/`show`/`init`, run folders with summary.md/json/junit, Node/FastAPI/Django samples | Yes |
| 2 | `lanes:` with an offline mock lane compiled from recorded responses; `--update-snapshots` to record them | No |
| 3 | `tracegrove.config.ts` with `defineConfig` and a typed `flow()` builder for editor autocompletion; JSON Schema for the YAML files so VS Code validates them today | Schema export only |
| 4 | Login-recipe personas (POST /login, cookie or token capture) for apps whose auth can't be patched; external `url:` targets with declared, unverified identity | No |
| 5 | Browser surface (Playwright) using the same flow file shape with `visit:` / `click:` steps | No |

## Found along the way

- The bundle verifier re-derived "infrastructure failed" only from step reason codes, so any run whose app never started produced a bundle that failed its own verification. The PR fixes this by also reading the sealed `host.failed` event; that evidence can only move a cell away from passed.

## Open questions for Hope

- Package and binary name: `tracegrove` for both (recommended), keeping `workflow-verify` as an alias.
- Default test folder: `tracegrove/` (recommended) versus `tests/tracegrove/` to sit beside pytest/jest.
