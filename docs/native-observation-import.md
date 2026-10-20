# Import native observations

Keep the application's existing reporter. Tracegrove imports Playwright JSON and
JUnit XML as foreign observations with captured native bytes and attachment digests.
This starts no test, fetches no network resource and grants no execution authority.

```sh
tracegrove import-observations --format playwright_json --input ./results.json \
  --artifact-root . --output ./imported-run-1 --json
tracegrove observations --archive ./imported-run-1 --json
```

For XML use `--format junit_xml`. The output parent must exist, and the selected
output directory must be new. Existing directories, files, symlinks and publisher
locks are never overwritten or automatically recovered. A final directory appears
only after its captured payloads and normalized report have been synced.

The JSON reporter includes every reported retry result. Failed attempts stay
visible when a later retry passes. Expected failures retain their actual failed
outcome and separate expected outcome/classification. Skips, timeouts, interrupted
and missing results remain distinct. Native error/step details are referenced by
digest and retained in the original report; they are not copied into terminal errors.
Conflicting aggregate counts and missing retry positions remain explicit warnings.

JUnit formats vary. The importer supports core testcase/failure/error/skipped
records, nested suites, global errors, Surefire flaky/rerun diagnostics and
Playwright's `[[ATTACHMENT|path]]` markers. Encoded retry failures become additional
observations. JUnit does not guarantee complete retry or assertion history, so that
limitation remains visible. Unknown testcase extensions produce an unknown outcome
with a warning. No attempt is deduplicated by title or a producer-supplied ID.
Observation identities bind the native source digest and record position. Copying
the same report does not create an independent attempt; different reports cannot
accidentally share observation identities merely because their row positions match.

Playwright producer/version metadata comes from the report. When producer metadata
is unavailable, optionally add both `--producer <name> --producer-version <version>`.
Those values are labeled `operator_declared`, never authenticated. A declaration
cannot contradict an available reported Playwright version. Unknown metadata stays
unknown; installed packages and filenames do not establish a report's producer.

## Capture and readback

`report.observations` distinguishes `attempt_result`, `testcase_summary`,
`retry_diagnostic` and `test_without_result`. JUnit testcase summaries are not a
complete attempt history. Array order is not cross-framework chronological order.

```ts
import { NativeObservationSnapshot, exportImportedObservations,
  readImportedObservations } from 'tracegrove/imports';

const captured = NativeObservationSnapshot.open({
  file: './results.json', format: 'playwright_json', scope,
  artifactRoot: process.cwd(), // Explicit permission to capture files under this owned root.
});
const retained = exportImportedObservations(captured, './imported-run-1');
const reopened = readImportedObservations('./imported-run-1');
const report = reopened.report;
```

Source bytes bind the report by SHA-256. Captured attachment bytes have their own
digests; traces remain native ZIP bytes for Playwright's viewer, without extraction.
`snapshot.source()` and `snapshot.artifact(digest)` return copies. Export reads
captured bytes, so a later producer mutation cannot change that capture. Readback
reparses the native source and rederives its normalized observations; resealing a
forged pass in `import.json` cannot override a recorded failure. Missing or changed
source/captured media blocks readback. Files use mode 0600 in private directories.

Inline attachments are decoded from the report. File attachments are captured only
with an explicit `artifactRoot`. Relative paths resolve beside the source report;
absolute paths must still be inside that root. Escapes, URI paths and symlinks are
refused. Missing, invalid, refused and unrequested attachments remain listed with
no digest or assumed zero-byte success. Importing a reference does not prove the
producer created the file or that it demonstrates a durable application effect.

Bounds: 8 MiB UTF-8 report, 16 MiB per captured artifact, 64 MiB total captured bytes,
counting each attachment reference even when stored bytes deduplicate,
1,000 attachment references, 20,000 attempt observations and nesting depth 100.
Exceeded bounds block; records are never silently truncated. XML DTDs, external
entities, malformed XML and unsupported encodings are rejected. No custom XML
parser, external entity resolver or remote media downloader is installed.

## Inspect in Grove

Use `tracegrove ui --dir <project>` and open **Imports** to upload a report or
inspect retained native archives. Uploads have an 8 MiB limit, capture inline
attachments, and never read report-supplied local paths. The SDK equivalent is
`NativeObservationSnapshot.fromBytes(bytes, { format, scope })`.

To capture local traces and media, choose an explicit owned artifact root:

```sh
tracegrove import-observations --format playwright_json --input report.json \
  --artifact-root ./test-results --into .
```

`--into <project>` and `--output <new-archive>` are mutually exclusive. Managed
imports live under `.tracegrove/imports/<report-digest>`. An identical capture
rechecks existing bytes; it never overwrites a damaged archive. The collection
blocks above 500 entries rather than hiding older records. Directory listings
are metadata only; opening an entry rederives observations from the source bytes.

The view supports filtering by title, kind, suite or outcome, keyboard `j`/`k`
selection, reloadable named-import links, and pagination without dropping records.
Source and captured attachments download as opaque files after fresh archive
inspection. A changed or unreadable archive clears the displayed facts. Imports
never start a test, heal, qualification or scenario activation.

## Observation versus verification

Exit 0 means capture/readback succeeded, including when the native producer failed.
The report always says `verificationVerdict: not_evaluated`,
`qualification: not_evaluated`, `issuerTrust: not_authenticated` and `authority: none`.
Reported source locations, timings and producer labels are foreign claims. This
import neither attests installed code/fixture/host identity nor admits required
coverage. Missing assertion or identity evidence cannot be inferred from a screenshot,
trace, output filename or foreign pass.

An observation archive is not a Tracegrove execution bundle. `verify-bundle`,
qualification and the result sink cannot treat it as one. There is no automatic
activation, review approval, work completion, AWR delivery or live replay. OTLP,
Allure, SARIF, arbitrary trace schemas and authenticated issuer adapters remain
separate integrations.

Formats follow the [Playwright reporter documentation](https://playwright.dev/docs/test-reporters)
and the installed 1.64.1 reporter types/producers. XML uses the public
[saxes API](https://github.com/lddubeau/saxes), pinned to 6.0.0, with DTD rejection
and explicit input/structure limits. Real producer fixtures retain positive tests,
expected failures, failures, skips, retries, timeouts, traces and their nonzero exit.
