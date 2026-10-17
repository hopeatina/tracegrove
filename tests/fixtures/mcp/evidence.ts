/** Test-only retrospective bridge. It grants no product execution or assertion authority. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CapabilityDescriptor, CapabilityObservation, CapabilityOperation, StreamTranscript, digestOfBytes, digestOfValue,
  type Ref, type StreamTranscript as Transcript } from '../../../src/protocol/index.ts';
import { frames, jsonLines, type WireChunk } from './harness.ts';

export function capturedExchange(root: string, tool: string) {
  const request = frames(root, 'client_to_server').find(frame => 'method' in frame.message && frame.message.method === 'tools/call' &&
    (frame.message.params as { name?: string } | undefined)?.name === tool);
  if (!request || !('id' in request.message)) throw new Error('native_request_missing');
  const requestId = request.message.id;
  const response = frames(root, 'server_to_client').find(frame => 'id' in frame.message && frame.message.id === requestId);
  const initialize = frames(root, 'server_to_client').find(frame => 'result' in frame.message && 'protocolVersion' in frame.message.result);
  if (!response || !initialize || !('result' in initialize.message)) throw new Error('native_response_or_handshake_missing');
  const capabilities = initialize.message.result.capabilities;
  if (!capabilities || typeof capabilities !== 'object' || !('tools' in capabilities)) throw new Error('native_tools_capability_missing');
  const protocolVersion = String(initialize.message.result.protocolVersion);
  const blobs = new Map<string, Buffer>();
  const artifacts = join(root, 'native-artifacts'); mkdirSync(artifacts, { recursive: true });
  const store = (id: string, bytes: Buffer): Ref => {
    const ref = { id, revision: '1', digest: digestOfBytes(bytes) };
    blobs.set(id, Buffer.from(bytes)); writeFileSync(join(artifacts, id), bytes); return ref;
  };
  const named = (id: string) => store(id, Buffer.from(id));
  const binding = { campaignId: 'local.mcp.conformance', executionId: basename(root), attemptId: `${basename(root)}.attempt`, generation: 1,
    requestRef: named('session.request'), sourceSelectionRef: null, caseRef: named('case'), personaRef: named('synthetic.persona'), targetRef: named('owned.fixture'), environmentRef: named('local.stdio'),
    scope: { ownerId: 'conformance', tenantId: null, visibility: 'owner_private' as const } };
  const producer = { adapterId: 'tracegrove.test.mcp-wire', adapterVersion: '1', tool: '@modelcontextprotocol/sdk', toolVersion: '1.31.0' };
  const requestRef = store('native.request', request.bytes); const responseRef = store('native.response', response.bytes);
  const initializeRef = store('native.initialize.response', initialize.bytes);
  const descriptor = CapabilityDescriptor.parse({ schemaVersion: 'workflow.capability-descriptor/v1', id: 'fixture.mcp', version: 1, producer,
    semantics: ['protocol.session'], inputSchemaRef: named('input.schema'), resultSchemaRef: named('result.schema'), evidenceClasses: ['protocol_client'],
    protocols: [{ transport: 'mcp.stdio', version: protocolVersion, features: ['tools'], semantics: ['mcp.tools'] }], availability: 'observed_supported', evidenceRefs: [initializeRef], extensions: [] });
  const operation = CapabilityOperation.parse({ schemaVersion: 'workflow.capability-operation/v1', binding, operationId: 'captured.tools.call', logicalOperationId: 'fixture.exchange', idempotencyKey: null,
    retryOf: null, phase: 'observe', capability: { id: descriptor.id, version: 1, required: true }, resourceRef: named('owned.resource'), deadlineAt: '2099-01-01T00:00:00Z', fixtureRef: null,
    input: { kind: 'protocol.session', version: 1, transport: 'mcp.stdio', protocolVersion, requiredFeatures: ['tools'], action: 'observe', requestRef, requestId, semantics: 'mcp.tools', evidenceClass: 'protocol_client' }, extensions: [] });
  const responseMessage = response.message;
  const facts = { kind: 'protocol_message' as const, requestId, nativeMessageRef: responseRef,
    resultState: 'error' in responseMessage ? 'protocol_error' as const : 'result' in responseMessage && responseMessage.result.isError === true ? 'tool_error' as const : 'result' as const,
    nativeErrorCode: 'error' in responseMessage ? responseMessage.error.code : null, bridgeState: null };
  const factsRef = store('mapped.facts', Buffer.from(JSON.stringify(facts)));
  const observation = CapabilityObservation.parse({ schemaVersion: 'workflow.capability-observation/v1', binding, operationId: operation.operationId,
    eventId: 'captured.response', sequence: 0, inputDigest: digestOfValue(operation.input), producer, source: 'observation', evidenceClass: 'protocol_client',
    executionStatus: 'completed', completeness: 'complete', captureFailures: [], facts, factsRef,
    evidence: [requestRef, responseRef, initializeRef, factsRef].map(ref => ({ ref, mediaType: 'application/json', byteCount: blobs.get(ref.id)!.length, producer, redaction: 'not_required', redactionPolicyRef: null })), correlations: [] });
  const chunks = jsonLines(root, 'wire-events.jsonl').filter(event => event.kind === 'chunk') as unknown as WireChunk[];
  const events: Transcript['events'] = [];
  for (const [direction, frame, messageId] of [['client_to_server', request, 'request'], ['server_to_client', response, 'response']] as const) {
    let count = 0;
    for (const chunk of chunks.filter(chunk => chunk.direction === direction)) {
      const start = Math.max(chunk.offset, frame.offset); const end = Math.min(chunk.offset + chunk.byteCount, frame.offset + frame.bytes.length);
      if (end <= start) continue;
      events.push({ kind: 'chunk', eventId: `${messageId}.chunk.${count}`, sequence: events.length, direction, providerEventId: null,
        messageId, index: count++, payloadRef: store(`${messageId}.chunk.${count}`, frame.bytes.subarray(start - frame.offset, end - frame.offset)) });
    }
    events.push({ kind: 'message', eventId: `${messageId}.message`, sequence: events.length, direction, providerEventId: null, messageId,
      chunkCount: count, payloadRef: messageId === 'request' ? requestRef : responseRef });
  }
  events.push({ kind: 'terminal', eventId: 'exchange.terminal', sequence: events.length, direction: 'internal', providerEventId: null, status: 'completed', reasonCode: null });
  const transcript = StreamTranscript.parse({ schemaVersion: 'workflow.stream-transcript/v1', binding, operationId: operation.operationId,
    connectionId: 'owned.connection', streamId: `request.${requestId}`, requestId, reconnectAttemptId: 'initial', transport: 'mcp.stdio', protocolVersion, negotiatedFeatures: ['tools'], resume: null, events, completeness: 'complete' });
  return { operation, descriptor, observation, transcript, blobs, responseMessage,
    readArtifact: async (ref: Ref) => { if (!blobs.has(ref.id)) throw new Error('native_evidence_missing'); return readFileSync(join(artifacts, ref.id)); },
    sourceDigests: Object.fromEntries(['server.mjs', 'tee.mjs'].map(name => [name, digestOfBytes(readFileSync(join(import.meta.dirname, name))).hex])) };
}
