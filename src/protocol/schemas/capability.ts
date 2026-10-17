/** Additive adapter-boundary contracts. These records grant no execution authority. */
import { z } from 'zod';
import { DigestSchema, IdString, IsoDateTime, NonNegInt, PositiveInt, RefSchema, ScopeSchema, ShortText } from '../primitives.ts';
import { BrowserObservation } from './browser.ts';
import { HttpRequestStep, ObserveStep, BrowserNavigateStep, BrowserActionStep, BrowserObserveStep } from './definitions.ts';

export const ProtocolRequestId = z.union([z.string().min(1).max(512), z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)]);
export const StreamTransport = z.enum(['sse', 'ndjson', 'websocket', 'mcp.stdio', 'mcp.streamable_http', 'app.bridge']);

export const CapabilityBinding = z.object({
  campaignId: IdString, executionId: IdString, attemptId: IdString, generation: NonNegInt,
  requestRef: RefSchema, sourceSelectionRef: RefSchema.nullable(), caseRef: RefSchema, personaRef: RefSchema, targetRef: RefSchema, environmentRef: RefSchema, scope: ScopeSchema,
}).strict();
export type CapabilityBinding = z.infer<typeof CapabilityBinding>;
export const CapabilityEvidenceClass = z.enum(['local_real', 'deterministic_fake', 'sanitized_recording', 'provider_sandbox', 'protocol_client', 'widget_bridge_fixture', 'signed_in_host']);
export const CapabilityProducer = z.object({ adapterId: IdString, adapterVersion: ShortText, tool: ShortText, toolVersion: ShortText }).strict();
export const CapabilityRequirement = z.object({ id: IdString, version: PositiveInt, required: z.boolean() }).strict();
export const CapabilityExtensionDescriptor = z.object({ namespace: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*){2,}$/), version: PositiveInt, schemaRef: RefSchema }).strict();
export const CapabilityExtension = CapabilityExtensionDescriptor.extend({ required: z.boolean(), payloadRef: RefSchema }).strict();
export type CapabilityExtension = z.infer<typeof CapabilityExtension>;
export const CapabilityDescriptor = z.object({ schemaVersion: z.literal('workflow.capability-descriptor/v1'),
  id: IdString, version: PositiveInt, producer: CapabilityProducer,
  semantics: z.array(IdString).min(1).max(64), inputSchemaRef: RefSchema, resultSchemaRef: RefSchema,
  evidenceClasses: z.array(CapabilityEvidenceClass).min(1).max(7),
  protocols: z.array(z.object({ transport: StreamTransport, version: ShortText, features: z.array(IdString).max(64), semantics: z.array(IdString).min(1).max(32) }).strict()).max(32),
  availability: z.enum(['declared', 'observed_supported', 'unsupported', 'temporarily_unavailable']),
  evidenceRefs: z.array(RefSchema).max(32), extensions: z.array(CapabilityExtensionDescriptor).max(16),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.extensions.map(e => `${e.namespace}/v${e.version}`)).size !== value.extensions.length) ctx.addIssue({ code: 'custom', message: 'duplicate extension descriptor' });
  if (new Set(value.protocols.map(p => `${p.transport}/${p.version}`)).size !== value.protocols.length) ctx.addIssue({ code: 'custom', message: 'duplicate protocol descriptor' });
  if (new Set(value.semantics).size !== value.semantics.length) ctx.addIssue({ code: 'custom', message: 'duplicate capability semantics' });
  if (value.availability === 'observed_supported' && !value.evidenceRefs.length) ctx.addIssue({ code: 'custom', message: 'observed support requires evidence' });
});
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptor>;

export const ScopedResource = z.object({ schemaVersion: z.literal('workflow.scoped-resource/v1'), ref: RefSchema,
  binding: CapabilityBinding, kind: z.enum(['application', 'database', 'broker', 'worker', 'contract_fake', 'pipeline']),
  isolation: z.enum(['owned_isolated', 'read_only_external', 'production_observation']),
  leaseRef: RefSchema, identityRef: RefSchema.nullable(), provisioningPlanRef: RefSchema, expiresAt: IsoDateTime,
}).strict();
export type ScopedResource = z.infer<typeof ScopedResource>;

const lifecycle = z.object({ kind: z.literal('resource.lifecycle'), version: z.literal(1), action: z.enum(['provision', 'reset', 'teardown']), resourceKind: z.enum(['application', 'database', 'broker', 'worker', 'contract_fake', 'pipeline']), planRef: RefSchema }).strict();
const http = z.object({ kind: z.literal('http.step'), version: z.literal(1), step: z.union([HttpRequestStep, ObserveStep]) }).strict();
const browser = z.object({ kind: z.literal('browser.step'), version: z.literal(1), step: z.union([BrowserNavigateStep, BrowserActionStep, BrowserObserveStep]) }).strict();
const seed = z.object({ kind: z.literal('api.fixture'), version: z.literal(1), recipeRef: RefSchema, logicalPayloadRef: RefSchema, entityKey: IdString,
  action: z.enum(['seed', 'readback', 'cleanup']) }).strict();
const worker = z.object({ kind: z.literal('worker.job'), version: z.literal(1), action: z.enum(['submit', 'observe', 'cancel']),
  jobTypeRef: RefSchema, inputRef: RefSchema.nullable(), jobId: ShortText.nullable(), idempotencyKey: IdString,
  observationMode: z.literal('non_consuming') }).strict();
const fake = z.object({ kind: z.literal('wiremock.contract'), version: z.literal(1), action: z.enum(['install', 'observe', 'reset']),
  contractRef: RefSchema, mappingRef: RefSchema, interactionId: IdString, fidelity: z.literal('deterministic_fake') }).strict();
const database = z.object({ kind: z.literal('database.fixture'), version: z.literal(1), action: z.enum(['seed', 'observe', 'reset']),
  migrationRef: RefSchema, datasetRef: RefSchema, queryRef: RefSchema.nullable() }).strict();
const pipeline = z.object({ kind: z.literal('pipeline.check'), version: z.literal(1), tool: z.enum(['dbt', 'great_expectations']),
  projectRef: RefSchema, suiteRef: RefSchema, selection: z.array(IdString).min(1).max(64) }).strict();
const stream = z.object({ kind: z.literal('protocol.session'), version: z.literal(1), transport: StreamTransport,
  protocolVersion: ShortText, requiredFeatures: z.array(IdString).max(64),
  action: z.enum(['initialize', 'request', 'observe', 'cancel']),
  requestRef: RefSchema.nullable(), requestId: ProtocolRequestId.nullable(),
  semantics: z.enum(['generic_stream', 'mcp.initialize', 'mcp.tools', 'mcp.resources', 'mcp.progress', 'mcp.cancel', 'app.tool_result', 'app.widget_interaction']),
  evidenceClass: CapabilityEvidenceClass.exclude(['local_real']),
}).strict();
export const CapabilityInput = z.discriminatedUnion('kind', [lifecycle, http, browser, seed, worker, fake, database, pipeline, stream]);
export type CapabilityInput = z.infer<typeof CapabilityInput>;
export const CapabilityPhase = z.enum(['provision', 'seed', 'execute', 'observe', 'assert', 'reset', 'teardown']);
export function capabilityPhase(input: CapabilityInput): z.infer<typeof CapabilityPhase> {
  switch (input.kind) {
    case 'resource.lifecycle': return input.action;
    case 'http.step': return input.step.kind === 'observe' ? 'observe' : 'execute';
    case 'browser.step': return input.step.kind === 'ui.observe' ? 'observe' : 'execute';
    case 'api.fixture': return input.action === 'seed' ? 'seed' : input.action === 'readback' ? 'observe' : 'teardown';
    case 'worker.job': return input.action === 'observe' ? 'observe' : 'execute';
    case 'wiremock.contract': return input.action === 'install' ? 'seed' : input.action;
    case 'database.fixture': return input.action;
    case 'pipeline.check': return 'assert';
    case 'protocol.session': return input.action === 'observe' ? 'observe' : 'execute';
  }
}
export const CapabilityOperation = z.object({ schemaVersion: z.literal('workflow.capability-operation/v1'), binding: CapabilityBinding,
  operationId: IdString, logicalOperationId: IdString, idempotencyKey: IdString.nullable(), retryOf: RefSchema.nullable(), phase: CapabilityPhase, capability: CapabilityRequirement, resourceRef: RefSchema, deadlineAt: IsoDateTime,
  fixtureRef: RefSchema.nullable(), input: CapabilityInput, extensions: z.array(CapabilityExtension).max(16),
}).strict();
export type CapabilityOperation = z.infer<typeof CapabilityOperation>;

export const CorrelationLink = z.object({ kind: z.enum(['parent', 'span_link', 'request', 'job', 'message', 'entity']),
  namespace: IdString, id: ProtocolRequestId, relationship: z.enum(['observed', 'declared']), evidenceRefs: z.array(RefSchema).max(16),
}).strict().superRefine((value, ctx) => {
  if (value.relationship === 'observed' && !value.evidenceRefs.length) ctx.addIssue({ code: 'custom', message: 'observed correlation requires evidence' });
});
export const NativeEvidence = z.object({ ref: RefSchema, mediaType: ShortText, byteCount: NonNegInt, producer: CapabilityProducer,
  redaction: z.enum(['not_required', 'applied', 'unavailable']), redactionPolicyRef: RefSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.redaction === 'applied' && !value.redactionPolicyRef) ctx.addIssue({ code: 'custom', message: 'redaction requires a policy reference' });
});
const facts = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('http'), status: z.number().int().min(100).max(599), bodyRef: RefSchema.nullable(), requestId: ProtocolRequestId.nullable() }).strict(),
  z.object({ kind: z.literal('browser'), observation: BrowserObservation }).strict(),
  z.object({ kind: z.literal('resource'), state: z.enum(['present', 'absent']), resourceRef: RefSchema }).strict(),
  z.object({ kind: z.literal('worker'), jobId: ShortText, state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']), resultRef: RefSchema.nullable(), terminalReceiptRef: RefSchema.nullable() }).strict(),
  z.object({ kind: z.literal('contract'), contractRef: RefSchema, matched: NonNegInt, unmatched: NonNegInt, fidelity: z.literal('deterministic_fake') }).strict(),
  z.object({ kind: z.literal('database'), queryRef: RefSchema, rowCount: NonNegInt, rowsRef: RefSchema, schemaRef: RefSchema }).strict(),
  z.object({ kind: z.literal('pipeline'), suiteRef: RefSchema, passed: NonNegInt, failed: NonNegInt, skipped: NonNegInt, nativeReportRef: RefSchema }).strict(),
  z.object({ kind: z.literal('protocol_message'), requestId: ProtocolRequestId.nullable(), nativeMessageRef: RefSchema,
    resultState: z.enum(['result', 'protocol_error', 'tool_error', 'progress', 'cancel_observed', 'unsupported']),
    nativeErrorCode: ProtocolRequestId.nullable(),
    bridgeState: z.enum(['pending', 'ready', 'tool_result_received', 'widget_interaction_observed', 'error']).nullable(),
  }).strict(),
  z.object({ kind: z.literal('stream'), transcriptRef: RefSchema, logicalMessageRefs: z.array(RefSchema).max(500), completion: z.enum(['completed', 'transport_closed', 'cancelled', 'timed_out', 'failed']) }).strict(),
]);
export const CapabilityObservation = z.object({ schemaVersion: z.literal('workflow.capability-observation/v1'), binding: CapabilityBinding,
  operationId: IdString, eventId: IdString, sequence: NonNegInt, inputDigest: DigestSchema, producer: CapabilityProducer,
  source: z.enum(['observation', 'inference']), evidenceClass: CapabilityEvidenceClass, executionStatus: z.enum(['completed', 'failed', 'cancelled', 'timed_out', 'unsupported']),
  completeness: z.enum(['complete', 'partial', 'missing']), captureFailures: z.array(IdString).max(32),
  facts, factsRef: RefSchema.nullable(), evidence: z.array(NativeEvidence).max(64), correlations: z.array(CorrelationLink).max(64),
}).strict().superRefine((value, ctx) => {
  if (value.facts.kind === 'worker' && ['succeeded', 'failed', 'cancelled'].includes(value.facts.state) && !value.facts.terminalReceiptRef) ctx.addIssue({ code: 'custom', message: 'terminal job state requires a completion receipt' });
  if (value.facts.kind === 'worker' && value.facts.state === 'succeeded' && !value.facts.resultRef) ctx.addIssue({ code: 'custom', message: 'job success requires terminal output, including an explicit empty result' });
  if (value.completeness === 'complete' && (value.captureFailures.length || !value.evidence.length || !value.factsRef)) ctx.addIssue({ code: 'custom', message: 'complete capture requires evidence without capture failures' });
  if (value.facts.kind === 'resource' && value.facts.state === 'absent' && (value.completeness !== 'complete' || value.source !== 'observation')) ctx.addIssue({ code: 'custom', message: 'absence requires complete observed evidence' });
  if (value.completeness === 'complete' && value.evidence.some(e => e.redaction === 'unavailable')) ctx.addIssue({ code: 'custom', message: 'unavailable redaction cannot establish complete evidence' });
});
export type CapabilityObservation = z.infer<typeof CapabilityObservation>;

const event = { eventId: IdString, sequence: NonNegInt, direction: z.enum(['client_to_server', 'server_to_client', 'internal']), providerEventId: z.string().max(512).nullable() };
export const StreamEvent = z.discriminatedUnion('kind', [
  z.object({ ...event, kind: z.literal('chunk'), messageId: IdString, index: NonNegInt, payloadRef: RefSchema }).strict(),
  z.object({ ...event, kind: z.literal('message'), messageId: IdString, chunkCount: NonNegInt, payloadRef: RefSchema }).strict(),
  z.object({ ...event, kind: z.literal('progress'), requestId: ProtocolRequestId, progressRef: RefSchema }).strict(),
  z.object({ ...event, kind: z.literal('control'), action: z.enum(['cancel_requested', 'cancel_observed', 'transport_closed', 'backpressure_paused', 'backpressure_resumed']), requestId: ProtocolRequestId.nullable(), evidenceRef: RefSchema }).strict(),
  z.object({ ...event, kind: z.literal('terminal'), status: z.enum(['completed', 'transport_closed', 'cancelled', 'timed_out', 'failed']), reasonCode: IdString.nullable() }).strict(),
]);
export const StreamTranscript = z.object({ schemaVersion: z.literal('workflow.stream-transcript/v1'), binding: CapabilityBinding,
  operationId: IdString, connectionId: IdString, streamId: IdString, requestId: ProtocolRequestId.nullable(), reconnectAttemptId: IdString, transport: StreamTransport, protocolVersion: ShortText,
  negotiatedFeatures: z.array(IdString).max(64),
  resume: z.object({ priorTranscriptRef: RefSchema, lastEventId: IdString, lastProviderEventId: z.string().max(512).nullable(), lastSequence: NonNegInt }).strict().nullable(),
  events: z.array(StreamEvent).max(5000), completeness: z.enum(['complete', 'partial', 'missing']),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>(); const chunks = new Map<string, number>(); const closed = new Set<string>(); let terminal = false; let interrupted = false;
  value.events.forEach((item, index) => {
    if (ids.has(item.eventId) || item.sequence !== index || terminal) ctx.addIssue({ code: 'custom', message: 'stream events must be unique, contiguous and precede terminal' });
    ids.add(item.eventId);
    if (item.kind === 'chunk') {
      if (closed.has(item.messageId) || item.index !== (chunks.get(item.messageId) ?? 0)) ctx.addIssue({ code: 'custom', message: 'chunk ordering or logical message closure mismatch' });
      chunks.set(item.messageId, item.index + 1);
    } else if (item.kind === 'message') {
      if (closed.has(item.messageId) || item.chunkCount !== (chunks.get(item.messageId) ?? 0)) ctx.addIssue({ code: 'custom', message: 'logical message has missing or duplicate chunks' });
      closed.add(item.messageId);
    } else if (item.kind === 'control' && ['transport_closed', 'cancel_observed'].includes(item.action)) interrupted = true;
    else if (item.kind === 'terminal') terminal = true;
  });
  const last = value.events.at(-1);
  if (value.completeness === 'complete' && (interrupted || last?.kind !== 'terminal' || last.status !== 'completed' || [...chunks.keys()].some(id => !closed.has(id)))) ctx.addIssue({ code: 'custom', message: 'complete stream requires explicit success and complete logical messages' });
});
export type StreamTranscript = z.infer<typeof StreamTranscript>;
