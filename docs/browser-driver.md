# Local browser driver

`BrowserDriver` runs real Chromium in a fresh, nonpersistent context. It does
not connect to an existing browser profile. Install its pinned browser before
running browser tests or using the driver:

```sh
npm ci
npx --no-install playwright install chromium
npm test -- tests/browser-driver.test.ts
```

Linux CI uses `playwright install --with-deps chromium` to install the browser
and its system libraries.

Run the packaged browser sample through the same low-level CLI as an API case:

```sh
npm run build
node dist/cli/main.js sample-config --sample notes-browser --output /tmp/notes-browser
node dist/cli/main.js plan --config /tmp/notes-browser/verification/workflow.yaml --output /tmp/notes-browser-request.json
node dist/cli/main.js run --request /tmp/notes-browser-request.json
```

Use fresh output paths: sample generation refuses to overwrite a project. The
run prints its execution ID and bundle path. Pass that path to
`node dist/cli/main.js verify-bundle --bundle <path>` for independent verification.
The sample shares its real app, personas, fixture recipes, and cleanup with
`notes-api`; only its browser runner, binding, and case differ.

The exported `BrowserCommand`, `BrowserLocator`, and `BrowserObservation` Zod
schemas also have generated JSON Schemas. Commands navigate, click, fill, or
read visible text. Locators use exact roles, labels, or test IDs. Arbitrary
scripts and selectors are not accepted. Observations contain browser facts;
the driver does not decide whether a scenario passes.

Each operation has a deadline. Cancellation or a failed operation closes the
context and browser before returning. Calls on one driver are serialized by
rejecting concurrent operations. Closing is idempotent. A closure acknowledgement
does not prove cleanup of an operating-system process tree after controller death.

Page requests must stay on the admitted origin. Chromium's CDP Fetch interception
checks every redirect hop while retaining native response streaming. Service
workers and WebSockets are disabled, and extra pages are closed. This is page
request filtering, not an operating system network sandbox; arbitrary application
code, workers, and popups require a host network boundary for full confinement.

`collectVideo()` closes the browser, flushes the WebM recording, and reads at
most 32 MiB from a regular file without following a final symlink. `dispose()`
removes the private temporary recording directory. Recordings and DOM text are
raw and may contain application data; callers must apply their evidence access
and retention policy before storing or sharing them. This driver does not issue
credentials or copy an owner's authenticated session.

The real-browser tests submit a local form, check an independent server receipt,
read the resulting DOM, and inspect the flushed recording. Separate tests cover
cross-origin paths, page requests and redirects, cancellation, timeout, invalid
commands, and expired startup.

The core runner profile accepts `adapter: browser`. A typed `ui.navigate` step
has a path; `ui.action` carries a click or fill command; `ui.observe` carries a
semantic target, predicate, and poll interval. DOM predicates address
`browser.text` or `browser.url` through the `browser.observation/1` oracle.
HTTP steps and fixtures can run in the same case for independent readback.

Each poll counts against `maxBrowserActions`. Case method and resource-prefix
rules filter page requests; read-only cases allow only GET and HEAD. Persona
viewport, locale, timezone, and reduced motion are passed to the browser. Pointer
activation uses clicks, keyboard activation uses focus and Enter, and touch
activation uses taps. Host-issued bearer credentials are added only to admitted
page requests, never expanded into filled values or recorded commands.
Network events record methods, paths, and response statuses without request
headers or query strings. Recording more than 512 network events invalidates
collection. Required traces and declared redaction policies remain blocked.

The controller seals the recording bytes into the portable bundle and records
browser duration and artifact bytes. Verification reproduces the frozen runner
capabilities, independently reduces browser assertions, and checks video hashes
and byte counts. A required recording cannot be satisfied by an event log alone.

The integrated native tests cover pointer, keyboard, and 375px simulated touch,
combining an authenticated UI, DOM observation,
independent API assertions, fixture cleanup, video capture, and portable bundle
verification. This proves local behavior. Hosted admission, staging personas,
controller-death browser cleanup, short-flow authoring, and Grove media playback
remain separate integration work; no production qualification is claimed.
