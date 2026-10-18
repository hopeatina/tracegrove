# Test a local MCP tool through the existing verification path

Install the optional protocol adapter dependency when using MCP flows:

```sh
npm install --save-dev --save-exact @modelcontextprotocol/sdk@1.32.1
tracegrove sample-config --sample notes-mcp --output ./mcp-notes
tracegrove test --config ./mcp-notes/tracegrove.config.yaml
```

The core, HTTP, browser and native job startup paths do not load this peer. Planning
an MCP flow without it reports `mcp_sdk_missing` with the installation command.
The package pins the SDK version and lockfile integrity. This driver uses the
[official v1 client](https://ts.sdk.modelcontextprotocol.io/client) and its
Streamable HTTP transport. Conformance exercises the negotiated `2025-11-25`
protocol with JSON and SSE responses. Other protocol revisions, legacy HTTP+SSE
fallback, stdio servers, OAuth discovery and hosted targets are not qualified here.

## Author a flow

```yaml
title: A created note is independently readable
effects:
  maxMcpCalls: 1
  allowedMcpTools: [notes.create]
steps:
  - name: create
    mcp:
      endpoint: /mcp
      tool: notes.create
      arguments: {title: Protocol proof, body: Native persistence}
    save: {noteId: structuredContent.note.id}
    expect:
      json: {structuredContent.note.title: Protocol proof}
  - GET: /notes/{noteId}
    expect:
      status: 200
      json: {note.title: Protocol proof}
```

MCP steps use the ordinary persona selector, saved-value bindings, deadlines and
JSON captures. The endpoint stays on the launched application's admitted origin.
Tool and endpoint names are frozen; only arguments can contain saved values.
The compiler requires the tool allowlist, call ceiling, designated-write mode,
POST permission and endpoint prefix before any host starts. A tool's
`readOnlyHint` or other server-supplied annotation cannot grant authority.
The ceiling bounds calls, not the number or financial cost of downstream effects.
Use an isolated application with run-owned data and known tool effects. Hosted,
paid, messaging and external-provider tool qualifications remain separate gates.
MCP and HTTP can share a flow; browser/native-job combinations remain blocked
until jointly qualified.

## Results and recovery

The existing planner, executor, bundle writer and independent reducer handle the
flow. Each observation includes the tool, endpoint, negotiated protocol version,
observed server name/version, content, structured content, `isError`, duration and
attempt count. Server identity is self-reported protocol metadata; target source
and runtime identity still come from the local host's attestation.

The default required assertion checks `isError: false` in addition to configured
facts. A tool error is retained as a failed step, skips dependent effects, and
keeps potentially partial mutations unknown. An independently readable record is
stronger evidence than the tool saying it saved one: the sample's controlled
success-without-persistence defect fails on HTTP readback. Independent bundle
verification uses the frozen MCP runner and typed oracle; substituting an HTTP
runner or oracle is rejected.

Each call establishes a protocol connection with the same step deadline. There is
one tool attempt and no automatic tool replay or transport fallback. Throttling,
connection loss, cancellation or expiry does not prove that remote work stopped.
Potential effects remain unknown in cleanup accounting after an ambiguous call.
Local process/workspace cleanup is confirmed separately. Inspect the native
application before requesting another run; MCP has no generic idempotency-key or
rollback guarantee. SDK transport reconnection is disabled.

Requests and each response stream are bounded to 64 KiB. Credentials stay in
memory, are sent only to the admitted endpoint, and cannot be expanded into tool
arguments. Redirects are refused. Results echoing an issued bearer are withheld;
raw protocol/provider error messages are not saved. Resource links are inert
evidence: the driver does not fetch them, render embedded UI or call other tools.

The native `notes-mcp` sample uses file-backed notes and a JSON-response subset of
the `2025-11-25` transport. Separate tests interoperate with the official SDK server
using JSON and SSE. These are local protocol proofs, not an actual ChatGPT/Claude
widget-host, mobile, production authorization or complete MCP-server conformance
claim. No inference model or external account is used in these tests.
