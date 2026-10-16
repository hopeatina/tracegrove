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

The controller, CLI authoring compiler, reducer, bundle verifier, and Grove UI
still admit HTTP workflows only. The driver is exported for integration work;
it does not advertise a qualified browser runner or turn generic `ui.*` steps
into executable scenarios yet.
