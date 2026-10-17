import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CapabilityDescriptor, CapabilityOperation, capabilityPhase, CapabilityObservation, StreamTranscript, freeze, digestOfBytes, digestOfValue,
  type Ref, type CapabilityInput } from '../src/protocol/index.ts';
import { admitCapabilityOperation, assessCapabilityEvidence, CapabilityEventIndex, mapExistingApiFixture, mapExistingStep, negotiateCapabilities,
  verifyCapabilityObservation, verifyCapabilityStream } from '../src/core/capabilityBoundary.ts';

const ref = (id: string, bytes: Buffer = Buffer.from(id)): Ref => ({ id, revision: '1', digest: digestOfBytes(bytes) });
const producer = { adapterId: 'test.adapter', adapterVersion: '1.2.0', tool: 'fixture', toolVersion: '3.0.0' };
const binding = { campaignId: 'campaign.1', executionId: 'exec.1', attemptId: 'attempt.1', generation: 1,
  requestRef: ref('request'), sourceSelectionRef: ref('source-selection'), caseRef: ref('case'), personaRef: ref('persona'), targetRef: ref('target'), environmentRef: ref('env'), scope: { ownerId: 'owner', tenantId: null, visibility: 'owner_private' as const } };
const step = { kind: 'http.request' as const, id: 'read', timeoutMs: 1000, inputs: {}, retry: { attempts: 2 }, method: 'GET' as const,
  path: '/notes?order=asc', headers: { accept: 'application/json' }, body: null, auth: { kind: 'persona' as const }, expectStatus: 200,
  captures: [{ name: 'id', from: 'json' as const, path: 'note.id' }] };
function fixture(input: CapabilityInput = mapExistingStep(step)) {
  const blobs = new Map<string, Buffer>();
  const store = (id: string, bytes: Buffer) => { const r = ref(id, bytes); blobs.set(id, Buffer.from(bytes)); return r; };
  const descriptor = CapabilityDescriptor.parse({ schemaVersion: 'workflow.capability-descriptor/v1', id: 'cap.test', version: 1, producer,
    semantics: ['resource.lifecycle', 'http.step', 'browser.step', 'api.fixture', 'worker.job', 'wiremock.contract', 'database.fixture', 'pipeline.check', 'protocol.session'],
    inputSchemaRef: ref('input-schema'), resultSchemaRef: ref('result-schema'), availability: 'observed_supported', evidenceRefs: [ref('probe')],
    evidenceClasses: ['local_real', 'protocol_client'], protocols: [{ semantics: ['mcp.tools', 'mcp.progress'], transport: 'mcp.streamable_http', version: 'peer-pinned-revision', features: ['tools', 'progress', 'cancel'] }], extensions: [] });
  const operation = CapabilityOperation.parse({ schemaVersion: 'workflow.capability-operation/v1', binding, operationId: 'operation.1', logicalOperationId: 'case.read', idempotencyKey: null, retryOf: null, phase: capabilityPhase(input),
    capability: { id: 'cap.test', version: 1, required: true }, resourceRef: ref('resource'), deadlineAt: '2099-01-01T00:00:00Z', fixtureRef: null, input, extensions: [] });
  const resource = { schemaVersion: 'workflow.scoped-resource/v1', ref: ref('resource'), binding, kind: input.kind === 'resource.lifecycle' ? input.resourceKind : 'application', isolation: 'owned_isolated',
    leaseRef: ref('lease'), identityRef: ref('observed-identity'), provisioningPlanRef: input.kind === 'resource.lifecycle' ? input.planRef : ref('provision-plan'), expiresAt: '2099-01-01T00:00:00Z' };
  const ports = { resolveOperation: vi.fn(async () => structuredClone(operation)), resolveResource: vi.fn(async () => structuredClone(resource)), authorize: vi.fn(async () => {}),
    readArtifact: vi.fn(async (r: Ref) => { const bytes = blobs.get(r.id); if (!bytes) throw new Error('missing artifact'); return bytes; }), extensions: [] as Array<{namespace: string; version: number; schemaRef: Ref; schema: z.ZodType}> };
  const facts = { kind: 'http', status: 200, bodyRef: null, requestId: 'request.1' };
  const bytes = Buffer.from(JSON.stringify(facts)); const factsRef = store('facts', bytes);
  const observation = CapabilityObservation.parse({ schemaVersion: 'workflow.capability-observation/v1', binding, operationId: operation.operationId,
    eventId: 'event.1', sequence: 0, inputDigest: digestOfValue(input), producer, source: 'observation', evidenceClass: 'local_real', executionStatus: 'completed',
    completeness: 'complete', captureFailures: [], facts, factsRef,
    evidence: [{ ref: factsRef, byteCount: bytes.length, mediaType: 'application/json', producer, redaction: 'not_required', redactionPolicyRef: null }], correlations: [] });
  return { operation, descriptor, resource, ports, store, observation };
}

it('maps existing HTTP/browser steps without losing headers, auth, capture, retry or predicate fields', () => {
  expect(mapExistingStep(step)).toEqual({ kind: 'http.step', version: 1, step });
  const ui = { id: 'ui', kind: 'ui.observe', timeoutMs: 1000, inputs: {}, retry: { attempts: 1 }, target: { by: 'testId', name: 'note' },
    predicate: { kind: 'json_path_equals', path: 'browser.text', value: 'visible' }, pollIntervalMs: 20 };
  expect(mapExistingStep(ui)).toEqual({ kind: 'browser.step', version: 1, step: ui });
  expect(() => mapExistingStep({ ...step, kind: 'job.submit', parameters: {} })).toThrow();
});
it('admits an exact scoped operation through trusted resource/authorization ports', async () => {
  const f = fixture(); const result = await admitCapabilityOperation(f.operation, binding, f.descriptor, f.ports);
  expect(result.operation).toEqual(f.operation); expect(f.ports.authorize).toHaveBeenCalledOnce();
});
it('reports optional omissions but blocks unknown required capabilities and ambiguous descriptors', () => {
  const f = fixture(); expect(negotiateCapabilities([{ id: 'missing', version: 1, required: false }], [f.descriptor]).omitted).toEqual(['missing/v1']);
  expect(() => negotiateCapabilities([{ id: 'missing', version: 1, required: true }], [f.descriptor])).toThrow('unsupported_capability');
  expect(() => negotiateCapabilities([], [f.descriptor, f.descriptor])).toThrow('duplicate_capability_descriptor');
});
it.each(['production_observation', 'read_only_external'])('refuses reset on %s even when a caller claims ownership', async isolation => {
  const f = fixture({ kind: 'database.fixture', version: 1, action: 'reset', migrationRef: ref('migration'), datasetRef: ref('dataset'), queryRef: null });
  f.ports.resolveResource.mockResolvedValue({ ...f.resource, isolation });
  await expect(admitCapabilityOperation(f.operation, binding, f.descriptor, f.ports)).rejects.toThrow('isolated_ownership_required');
  expect(f.ports.authorize).not.toHaveBeenCalled();
});
it('rejects unknown schema/semantic versions and foreign/stale resource bindings before effects', async () => {
  const f = fixture();
  await expect(admitCapabilityOperation({ ...f.operation, schemaVersion: 'workflow.capability-operation/v2' }, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_schema_version');
  await expect(admitCapabilityOperation({ ...f.operation, input: { ...f.operation.input, version: 2 } }, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_semantic_version');
  await expect(admitCapabilityOperation({ ...f.operation, binding: { ...binding, attemptId: 'other' } }, binding, f.descriptor, f.ports)).rejects.toThrow('stale_or_cross_run');
  f.ports.resolveResource.mockResolvedValue({ ...f.resource, binding: { ...binding, generation: 0 } });
  await expect(admitCapabilityOperation(f.operation, binding, f.descriptor, f.ports)).rejects.toThrow('resource_binding_mismatch');
});
it('validates registered typed extensions and rejects schema substitution or unknown required versions', async () => {
  const f = fixture(); const schemaRef = ref('extension.schema'); const payloadRef = f.store('extension.payload', Buffer.from('{"mode":"readonly"}'));
  f.descriptor.extensions.push({ namespace: 'org.example.fixture', version: 1, schemaRef });
  f.ports.extensions.push({ namespace: 'org.example.fixture', version: 1, schemaRef, schema: z.object({ mode: z.literal('readonly') }).strict() });
  const extension = { namespace: 'org.example.fixture', version: 1, required: true, schemaRef, payloadRef };
  f.ports.resolveOperation.mockResolvedValue({ ...f.operation, extensions: [extension] });
  await expect(admitCapabilityOperation({ ...f.operation, extensions: [extension] }, binding, f.descriptor, f.ports)).resolves.toMatchObject({ omittedExtensions: [] });
  f.ports.resolveOperation.mockResolvedValue({ ...f.operation, extensions: [{ ...extension, version: 2 }] });
  await expect(admitCapabilityOperation({ ...f.operation, extensions: [{ ...extension, version: 2 }] }, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_extension');
  f.ports.resolveOperation.mockResolvedValue({ ...f.operation, extensions: [{ ...extension, schemaRef: ref('wrong') }] });
  await expect(admitCapabilityOperation({ ...f.operation, extensions: [{ ...extension, schemaRef: ref('wrong') }] }, binding, f.descriptor, f.ports)).rejects.toThrow('extension_schema_mismatch');
});
it('binds facts to immutable native bytes and rejects mapping loss, changed bytes and foreign evidence', async () => {
  const f = fixture();
  await expect(verifyCapabilityObservation({ ...f.observation, facts: { ...f.observation.facts, status: 201 } }, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('facts_mapping_loss');
  await expect(verifyCapabilityObservation({ ...f.observation, binding: { ...binding, executionId: 'foreign' } }, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('cross_run');
  f.ports.readArtifact.mockResolvedValue(Buffer.from('changed'));
  await expect(verifyCapabilityObservation(f.observation, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('evidence_digest_mismatch');
});
it('separates completed execution from evidence completeness and inference; never invents product PASS', async () => {
  const f = fixture();
  const complete = await verifyCapabilityObservation(f.observation, f.operation, f.descriptor, f.ports.readArtifact);
  expect(assessCapabilityEvidence(complete)).toMatchObject({ executionStatus: 'completed', evidenceVerdict: 'admissible', verificationVerdict: 'not_evaluated' });
  const partial = await verifyCapabilityObservation({ ...f.observation, completeness: 'partial', captureFailures: ['truncated'] }, f.operation, f.descriptor, f.ports.readArtifact);
  expect(assessCapabilityEvidence(partial).evidenceVerdict).toBe('inconclusive');
  const inference = await verifyCapabilityObservation({ ...f.observation, source: 'inference' }, f.operation, f.descriptor, f.ports.readArtifact);
  expect(assessCapabilityEvidence(inference).evidenceVerdict).toBe('untrusted_inference');
  f.observation.facts = { kind: 'http', status: 500, bodyRef: null, requestId: null };
  expect(assessCapabilityEvidence(complete).observation.facts).toMatchObject({ status: 200 });
  expect(() => assessCapabilityEvidence({ validated: true })).toThrow('unverified_observation');
});
it('rejects absence from incomplete capture and unavailable or unbound redaction', () => {
  const f = fixture();
  expect(CapabilityObservation.safeParse({ ...f.observation, facts: { kind: 'resource', state: 'absent', resourceRef: ref('resource') }, completeness: 'partial' }).success).toBe(false);
  expect(CapabilityObservation.safeParse({ ...f.observation, evidence: [{ ...f.observation.evidence[0], redaction: 'unavailable' }] }).success).toBe(false);
  expect(CapabilityObservation.safeParse({ ...f.observation, evidence: [{ ...f.observation.evidence[0], redaction: 'applied' }] }).success).toBe(false);
});
it('retains retry identity and rejects conflicting redelivery, stale attempts and mutation of the index binding', () => {
  const f = fixture(); const current = structuredClone(binding); const index = new CapabilityEventIndex(current, 2);
  expect(index.append(f.observation)).toBe('added'); expect(index.append(f.observation)).toBe('duplicate');
  expect(() => index.append({ ...f.observation, executionStatus: 'failed' })).toThrow('conflicting_redelivery');
  current.attemptId = 'moved'; expect(index.append(f.observation)).toBe('duplicate');
  expect(() => index.append({ ...f.observation, binding: { ...binding, attemptId: 'retry' } })).toThrow('cross_run');
});

function streamFixture() {
  const f = fixture({ kind: 'protocol.session', version: 1, transport: 'mcp.streamable_http', protocolVersion: 'peer-pinned-revision',
    requiredFeatures: ['tools'], action: 'observe', requestRef: null, requestId: 'request.1', semantics: 'mcp.tools', evidenceClass: 'protocol_client' });
  const bytes = Buffer.from('a€z'); const a = f.store('chunk.0', bytes.subarray(0, 2)); const b = f.store('chunk.1', bytes.subarray(2)); const full = f.store('logical', bytes);
  const common = { direction: 'server_to_client', providerEventId: null };
  const transcript = StreamTranscript.parse({ schemaVersion: 'workflow.stream-transcript/v1', binding, operationId: f.operation.operationId,
    connectionId: 'connection.1', streamId: 'stream.1', requestId: 'request.1', reconnectAttemptId: 'reconnect.0', transport: 'mcp.streamable_http',
    protocolVersion: 'peer-pinned-revision', negotiatedFeatures: ['tools'], resume: null, completeness: 'complete', events: [
      { ...common, kind: 'chunk', eventId: 's0', sequence: 0, messageId: 'message.1', index: 0, payloadRef: a },
      { ...common, kind: 'chunk', eventId: 's1', sequence: 1, messageId: 'message.1', index: 1, payloadRef: b },
      { ...common, kind: 'message', eventId: 's2', sequence: 2, messageId: 'message.1', chunkCount: 2, payloadRef: full },
      { ...common, kind: 'terminal', eventId: 's3', sequence: 3, status: 'completed', reasonCode: null },
    ] }); return { ...f, transcript };
}
it('preserves fragmented UTF-8 bytes and logical messages without equating protocol-client evidence to host acceptance', async () => {
  const f = streamFixture(); const result = await verifyCapabilityStream(f.transcript, f.operation, f.ports.readArtifact);
  expect(result).toMatchObject({ evidenceVerdict: 'admissible', verificationVerdict: 'not_evaluated' });
  expect(f.operation.input).toMatchObject({ evidenceClass: 'protocol_client' });
});
it('rejects missing/out-of-order/duplicate chunks and implicit stream completion', () => {
  const f = streamFixture(); const events = structuredClone(f.transcript.events);
  expect(StreamTranscript.safeParse({ ...f.transcript, events: [events[1], events[0], events[2], events[3]] }).success).toBe(false);
  expect(StreamTranscript.safeParse({ ...f.transcript, events: events.slice(0, -1) }).success).toBe(false);
  expect(StreamTranscript.safeParse({ ...f.transcript, events: [...events, events[3]] }).success).toBe(false);
  expect(StreamTranscript.safeParse({ ...f.transcript, events: [events[0], { ...events[3], sequence: 1 }] }).success).toBe(false);
});
it('keeps disconnect/cancel request/timeout partial rather than successful protocol completion', async () => {
  const f = streamFixture(); const events = structuredClone(f.transcript.events); events[3] = { ...events[3]!, kind: 'terminal', eventId: 's3', sequence: 3, status: 'transport_closed', reasonCode: 'disconnect', direction: 'internal', providerEventId: null };
  expect(StreamTranscript.safeParse({ ...f.transcript, events }).success).toBe(false);
  expect((await verifyCapabilityStream({ ...f.transcript, events, completeness: 'partial' }, f.operation, f.ports.readArtifact)).evidenceVerdict).toBe('inconclusive');
});
it('pins peer protocol/features and refuses resealed assembled-message substitution', async () => {
  const f = streamFixture();
  const unsupported = { ...f.operation, input: { ...f.operation.input, protocolVersion: 'other-revision' } };
  f.ports.resolveOperation.mockResolvedValue(unsupported as typeof f.operation);
  await expect(admitCapabilityOperation(unsupported, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_protocol_version');
  await expect(verifyCapabilityStream({ ...f.transcript, negotiatedFeatures: [] }, f.operation, f.ports.readArtifact)).rejects.toThrow('unsupported_protocol_feature');
  const altered = f.store('different-logical', Buffer.from('a different message')); const events = structuredClone(f.transcript.events); events[2] = { ...events[2]!, kind: 'message', messageId: 'message.1', chunkCount: 2, payloadRef: altered, direction: 'server_to_client', providerEventId: null, eventId: 's2', sequence: 2 };
  await expect(verifyCapabilityStream({ ...f.transcript, events }, f.operation, f.ports.readArtifact)).rejects.toThrow('logical_message_bytes_mismatch');
});

it('refuses changes to a frozen planned operation even on an owned isolated resource', async () => {
  const f = fixture();
  await expect(admitCapabilityOperation({ ...f.operation, input: mapExistingStep({ ...step, method: 'POST' }) }, binding, f.descriptor, f.ports)).rejects.toThrow('operation_plan_mismatch');
  expect(f.ports.authorize).not.toHaveBeenCalled();
  await expect(admitCapabilityOperation({ ...f.operation, phase: 'reset' }, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_lifecycle_phase');
});
it('keeps protocol-client and bridge fixtures separate from signed-in host evidence', async () => {
  const f = streamFixture(); const op = CapabilityOperation.parse({ ...f.operation, input: { ...f.operation.input, evidenceClass: 'signed_in_host' } });
  f.ports.resolveOperation.mockResolvedValue(op);
  await expect(admitCapabilityOperation(op, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_evidence_class');
  await expect(verifyCapabilityObservation({ ...f.observation, evidenceClass: 'signed_in_host' }, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('unsupported_evidence_class');
});
it('supports typed provider example contracts without implementing external provider execution', async () => {
  const inputs: CapabilityInput[] = [
    { kind: 'api.fixture', version: 1, action: 'seed', recipeRef: ref('recipe'), logicalPayloadRef: ref('payload'), entityKey: 'order' },
    { kind: 'worker.job', version: 1, action: 'submit', jobTypeRef: ref('job-type'), inputRef: ref('job-input'), jobId: null, idempotencyKey: 'job-key', observationMode: 'non_consuming' },
    { kind: 'wiremock.contract', version: 1, action: 'install', contractRef: ref('shipping-contract'), mappingRef: ref('mapping'), interactionId: 'shipping.1', fidelity: 'deterministic_fake' },
    { kind: 'database.fixture', version: 1, action: 'seed', migrationRef: ref('migration'), datasetRef: ref('dataset'), queryRef: null },
    { kind: 'pipeline.check', version: 1, tool: 'dbt', projectRef: ref('dbt-project'), suiteRef: ref('suite'), selection: ['orders'] },
    { kind: 'resource.lifecycle', version: 1, action: 'provision', resourceKind: 'broker', planRef: ref('broker-plan') },
  ];
  for (const input of inputs) { const f = fixture(input); await expect(admitCapabilityOperation(f.operation, binding, f.descriptor, f.ports)).resolves.toMatchObject({ operation: { input } }); }
});
it('requires explicit protocol semantics and resume capability and does not promote observed cancel to success', async () => {
  const f = streamFixture(); const op = CapabilityOperation.parse({ ...f.operation, input: { ...f.operation.input, semantics: 'app.widget_interaction' } });
  f.ports.resolveOperation.mockResolvedValue(op);
  await expect(admitCapabilityOperation(op, binding, f.descriptor, f.ports)).rejects.toThrow('unsupported_protocol_semantics');
  await expect(verifyCapabilityStream({ ...f.transcript, requestId: 'foreign' }, f.operation, f.ports.readArtifact)).rejects.toThrow('request_correlation_mismatch');
  await expect(verifyCapabilityStream({ ...f.transcript, resume: { priorTranscriptRef: ref('prior'), lastEventId: 'old', lastProviderEventId: 'opaque-provider-event', lastSequence: 2 } }, f.operation, f.ports.readArtifact)).rejects.toThrow('unsupported_resume_semantics');
  const events = structuredClone(f.transcript.events); events.splice(3, 0, { kind: 'control', action: 'cancel_observed', requestId: 'request.1', evidenceRef: ref('cancel'), eventId: 'cancel', sequence: 3, direction: 'server_to_client', providerEventId: null });
  events[4] = { kind: 'terminal', status: 'completed', reasonCode: null, eventId: 's4', sequence: 4, direction: 'server_to_client', providerEventId: null };
  expect(StreamTranscript.safeParse({ ...f.transcript, events }).success).toBe(false);
});
it('rejects expired authority, foreign producers and unverified declared capability support', async () => {
  const f = fixture();
  await expect(admitCapabilityOperation(f.operation, binding, { ...f.descriptor, availability: 'declared' }, f.ports)).rejects.toThrow('unsupported_capability');
  await expect(admitCapabilityOperation(f.operation, binding, f.descriptor, f.ports, Date.parse('2100-01-01T00:00:00Z'))).rejects.toThrow('deadline_expired');
  f.ports.resolveResource.mockResolvedValue({ ...f.resource, expiresAt: '2000-01-01T00:00:00Z' });
  await expect(admitCapabilityOperation(f.operation, binding, f.descriptor, f.ports)).rejects.toThrow('resource_lease_expired');
  await expect(verifyCapabilityObservation({ ...f.observation, producer: { ...producer, toolVersion: 'unadmitted' } }, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('producer_mismatch');
  await expect(verifyCapabilityObservation({ ...f.observation, evidence: [{ ...f.observation.evidence[0], producer: { ...producer, adapterId: 'foreign' } }] }, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('untrusted_native_producer');
});

it('does not mistake a queued job acknowledgement for terminal business output', () => {
  const f = fixture();
  expect(CapabilityObservation.safeParse({ ...f.observation, facts: { kind: 'worker', jobId: 'job', state: 'succeeded', resultRef: null, terminalReceiptRef: null } }).success).toBe(false);
  expect(CapabilityObservation.safeParse({ ...f.observation, facts: { kind: 'worker', jobId: 'job', state: 'running', resultRef: null, terminalReceiptRef: null } }).success).toBe(true);
});

it('retains cancel-request/late-success races and refuses forever-progress as completed evidence', () => {
  const f = streamFixture(); const events = structuredClone(f.transcript.events);
  events.splice(3, 0, { kind: 'control', action: 'cancel_requested', requestId: 'request.1', evidenceRef: ref('cancel-request'), eventId: 'cancel-request', sequence: 3, direction: 'client_to_server', providerEventId: null });
  events[4] = { kind: 'terminal', status: 'completed', reasonCode: null, eventId: 'late-success', sequence: 4, direction: 'server_to_client', providerEventId: null };
  expect(StreamTranscript.parse({ ...f.transcript, events }).events).toEqual(events);
  const progress = [{ kind: 'progress', eventId: 'progress', sequence: 0, requestId: 'request.1', progressRef: ref('progress'), direction: 'server_to_client', providerEventId: null }];
  expect(StreamTranscript.safeParse({ ...f.transcript, events: progress }).success).toBe(false);
  expect(StreamTranscript.safeParse({ ...f.transcript, completeness: 'partial', events: progress }).success).toBe(true);
});
it('does not attach old-attempt resources to an action rerun or change deterministic seed pins under a frozen operation', async () => {
  const input: CapabilityInput = { kind: 'api.fixture', version: 1, action: 'seed', recipeRef: ref('recipe.v1'), logicalPayloadRef: ref('seed.v1'), entityKey: 'order' };
  const f = fixture(input);
  await expect(admitCapabilityOperation({ ...f.operation, input: { ...input, logicalPayloadRef: ref('seed.changed') } }, binding, f.descriptor, f.ports)).rejects.toThrow('operation_plan_mismatch');
  const current = { ...binding, executionId: 'rerun-exec', attemptId: 'rerun-attempt', requestRef: ref('fresh-request') };
  const fresh = { ...f.operation, binding: current, operationId: 'fresh-op', retryOf: ref('original-attempt') };
  f.ports.resolveOperation.mockResolvedValue(fresh);
  await expect(admitCapabilityOperation(fresh, current, f.descriptor, f.ports)).rejects.toThrow('resource_binding_mismatch');
});

it('maps an existing API fixture without losing frozen recipe/payload/plan identity', () => {
  const recipe = ref('recipe');
  const payload = freeze({ schemaVersion: 'workflow.logical-payload/v1' as const, ref: { id: 'payload', revision: '1' }, scope: binding.scope,
    seedRecipeRef: recipe, entities: [{ entityKey: 'order', values: { label: 'deterministic fixture' } }] });
  const plan = freeze({ schemaVersion: 'workflow.fixture-plan/v1' as const, kind: 'case' as const, ref: { id: 'fixture-plan', revision: '1' }, scope: binding.scope,
    seedRecipeRef: recipe, logicalPayloadRef: payload.ref, modelCatalogRef: null, outputBindingsSchemaRef: null, effectEnvelopeRef: null, limitPolicyRef: null });
  expect(mapExistingApiFixture(plan, payload, 'order', 'seed')).toMatchObject({ fixtureRef: plan.ref, definitionScope: binding.scope,
    input: { kind: 'api.fixture', recipeRef: recipe, logicalPayloadRef: payload.ref, entityKey: 'order' } });
  expect(() => mapExistingApiFixture(plan, { ...payload, entities: [] }, 'order', 'seed')).toThrow('fixture_identity_mismatch');
  expect(() => mapExistingApiFixture(plan, payload, 'foreign', 'cleanup')).toThrow('fixture_entity_ambiguous_or_missing');
});

it('preserves numeric protocol request IDs and empty provider event IDs without coercing native identity', async () => {
  const f = streamFixture();
  const operation = CapabilityOperation.parse({ ...f.operation, input: { ...f.operation.input, requestId: 0 } });
  const transcript = StreamTranscript.parse({ ...f.transcript, requestId: 0, events: f.transcript.events.map(event => ({ ...event, providerEventId: '' })) });
  expect((await verifyCapabilityStream(transcript, operation, f.ports.readArtifact)).transcript.requestId).toBe(0);
  await expect(verifyCapabilityStream({ ...transcript, requestId: '0' }, operation, f.ports.readArtifact)).rejects.toThrow('request_correlation_mismatch');
});

it('keeps protocol/tool errors and app bridge state separate from transport completion and product verdict', async () => {
  const f = streamFixture();
  const native = f.store('native-error', Buffer.from('{"jsonrpc":"2.0","id":"request.1","error":{"code":-32601,"message":"unsupported"}}'));
  const facts = { kind: 'protocol_message', requestId: 'request.1', nativeMessageRef: native, resultState: 'protocol_error', nativeErrorCode: -32601, bridgeState: 'error' };
  const bytes = Buffer.from(JSON.stringify(facts)); const factsRef = f.store('protocol-facts', bytes);
  const observation = { ...f.observation, evidenceClass: 'protocol_client', inputDigest: digestOfValue(f.operation.input), facts, factsRef,
    evidence: [{ ref: factsRef, byteCount: bytes.length, mediaType: 'application/json', producer, redaction: 'not_required', redactionPolicyRef: null },
      { ref: native, byteCount: (await f.ports.readArtifact(native)).length, mediaType: 'application/json', producer, redaction: 'not_required', redactionPolicyRef: null }] };
  const token = await verifyCapabilityObservation(observation, f.operation, f.descriptor, f.ports.readArtifact);
  expect(assessCapabilityEvidence(token)).toMatchObject({ executionStatus: 'completed', verificationVerdict: 'not_evaluated', observation: { facts: { resultState: 'protocol_error', bridgeState: 'error' } } });
  await expect(verifyCapabilityObservation({ ...observation, evidence: observation.evidence.slice(0, 1) }, f.operation, f.descriptor, f.ports.readArtifact)).rejects.toThrow('native_message_evidence_missing');
});
