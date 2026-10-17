# Local MCP SDK stdio conformance

This is an executable **test host**, not a product MCP adapter or an OrgX acceptance result.
The ordinary compiler still rejects `mcp.call`. Nothing adds arbitrary server commands, remote
targets, installed-host access, widget dispatch, model calls or product assertion authority.

## Exact dependency and reproduction

Registry metadata read on 2026-10-17 confirmed `@modelcontextprotocol/sdk@1.31.0`, MIT,
Node >=18, with tarball integrity:

```text
sha512-UvTMgnNlnIBO/22ob2RcVGDlcvOslQs8T59+FTGdA0L27a39fdGF/EDETNtDVK4DZGpwomlsYpRdA8UXcVL/pw==
```

The SDK is an exact **dev dependency**, resolved in `package-lock.json`. The test also checks
the installed package version/license against the lock. Do not reuse mounted OrgX modules:
the inspected `orgx-mcp` lock declared 1.31.0 while its installed package was 1.26.0; the mounted
OrgX app had 1.29.0 despite its 1.31.0 declaration. Those installations were not used here.

With the repository's documented Node 22 toolchain and a writable npm cache:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test -- tests/mcp-stdio.test.ts
```

The initial focused run passed eight tests in 4.16 seconds. This reused the existing cloud
runtime but installed this worktree's dependencies from its exact lock. It was not an independently
performed README journey, npm-published install, or qualification of another coding environment.

## Actual boundary and evidence

The official SDK `Client` uses `StdioClientTransport` to launch exactly the adjacent owned tee.
The tee launches exactly the adjacent synthetic server, which uses official SDK `Server` and
`StdioServerTransport`. The server exposes only synthetic echo, rejection, wait, disconnect and
bounded overflow behaviors. No socket, arbitrary command, authentication or external API is used.

An owned temporary directory is the server's HOME/TMPDIR. Its environment contains only
`PATH`, `HOME`, `TMPDIR` and the fixture directory reference. SDK default environment names are
explicitly overridden for the tee; no inherited environment dump or secret value is captured.

The tee records real directional bytes before parsing, plus contiguous raw chunk offsets and
lengths. It forwards without JSON reserialization and honors writable-stream backpressure.
Stderr is drained with a 4096-byte ceiling and recorded only as a byte count. Total observed
protocol bytes are bounded (default 128 KiB, hard fixture maximum 256 KiB); wall time has an
independent hard bound. On overflow, already captured bytes remain, the offending chunk is not
exported, and a byte-limit close receipt prevents a complete-exchange claim.

Each test retains its wire files, chunk/control/close records, server request/cancel observations
and cleanup result under `artifacts/qa/mcp-stdio/<test-name>/<unique-attempt>/`, preserving prior
attempts. Success additionally retains
`typed-evidence.json`, including hashes of the fixture server and tee source, and exact referenced
bytes under `native-artifacts/`. These are conformance receipts, not a product verified bundle.
Cleanup closes
stdin, permits normal exit, escalates only against the owned child if necessary, and confirms
both recorded tee/server PIDs are absent before deleting temporary files. A cleanup failure
retains an explicit unconfirmed directory and fails the test. This does not establish recovery
after abrupt controller/tee death or across host reboots.

Harness limits are validated before allocating a directory or spawning. If connection startup
fails, its original error remains the thrown error's `cause`, and a startup-failure receipt is
retained even when cleanup itself fails. Missing PID/close receipts yield `cleanup: unknown`;
they never establish confirmed absence. Unknown-cleanup temporary directories remain retained.
The controlled early-tee-exit regression exercises this case without launching a server.

The retrospective test bridge parses the original newline-framed messages, derives JSON-RPC
request/result correlation and result-versus-tool-error facts, then verifies their original byte
digests through the existing capability evidence boundary. Per-request transcripts preserve
intersections with the raw chunk records; whole-session files retain other requests and progress
messages. The complete echo exchange is assessed as `protocol_client` evidence and always
`verificationVerdict: not_evaluated`. Its operation is a readback record constructed after the
test exchange, **not** a pre-execution admission or authority token. Protocol success is not a
business assertion; an MCP tool rejection remains a rejection even when the response is complete.

## What the tests establish

- Exact SDK pin/license/integrity, actual initialize/initialized exchange, advertised tools,
  negotiated protocol revision, tools discovery and a Unicode echo response.
- Native tool `isError` distinguished from JSON-RPC method error `-32601`.
- Actual progress followed by client cancellation, correlated cancel notification and separately
  observed cancellation in the server handler.
- An absolute request deadline despite progress resetting the shorter idle timeout.
- Peer disconnect remains missing response, rather than success or cancellation acknowledgement.
- Byte overflow and independent wall expiry stop the owned fixture with confirmed cleanup.
- Incompatible limits reject before allocation/spawn; early tee exit retains its original
  connection error and startup diagnostics with explicit unknown cleanup.
- Native byte tampering, foreign attempt/request identity and fidelity escalation are rejected
  by the core evidence verification boundary.

## Remaining gates

This tranche does **not** force UTF-8 fragmentation, coalesce/reorder arbitrary messages, inject
malformed/truncated frames, exhaust backpressure, exercise concurrent progress-token isolation,
late-response races, unsupported negotiated revisions, reconnect/resume, parent death or durable
artifact publication. These require additional fault cases; the current tests must not be described
as full MCP conformance. Streamable HTTP/SSE, resources, tasks, sampling, elicitation, authorization,
widget bridges and signed-in hosts remain unimplemented/unqualified here.

Product integration still requires reviewed host-owned launch/admission/resource enforcement,
frozen request/method/tool envelopes and budgets, executable redaction where needed, durable
acquisition/recovery, and explicit trusted assertion semantics. Schema/evidence tests cannot
clear those gates. None of these results qualify the actual OrgX server or three OrgX workflow
acceptance outcomes.

Protocol references: official [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[lifecycle/version negotiation](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle),
[progress](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress) and
[cancellation](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation).
The tests check the SDK's actual negotiated revision instead of treating a package version as a
protocol revision. No protocol support beyond the observed exchange is inferred.
