/** Experimental, pure admission/readback helpers; no provider dispatch or lifecycle effects. */
import { z } from 'zod';
import { CapabilityBinding, CapabilityDescriptor, CapabilityObservation, CapabilityOperation, ScopedResource,
  CapabilityInput, type CapabilityExtension, capabilityPhase, StreamTranscript, CaseFixturePlan, LogicalPayload, verifySelfDigest, Step, sameRef, sameScope, digestOfBytes, digestOfValue,
  type Ref } from '../protocol/index.ts';

export class CapabilityBoundaryError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'CapabilityBoundaryError'; }
}
const deny = (code: string): never => { throw new CapabilityBoundaryError(code); };
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    if (result.error.issues.some(issue => issue.path.includes('schemaVersion'))) return deny('unsupported_schema_version');
    if (result.error.issues.some(issue => issue.path.includes('version'))) return deny('unsupported_semantic_version');
    return deny('invalid_capability_record');
  }
  return result.data;
};
const equal = (a: unknown, b: unknown) => digestOfValue(a).hex === digestOfValue(b).hex;

/** Preserve the complete existing typed step, including captures/retries/auth/predicates. */
export function mapExistingStep(value: unknown): CapabilityInput {
  const step = parse(Step, value);
  if (step.kind === 'http.request' || step.kind === 'observe') return { kind: 'http.step', version: 1, step };
  if (step.kind === 'ui.navigate' || step.kind === 'ui.action' || step.kind === 'ui.observe') return { kind: 'browser.step', version: 1, step };
  return deny('unsupported_semantics');
}
/** Keep full frozen fixture identity while projecting the existing application-API operation. */
export function mapExistingApiFixture(planValue: unknown, payloadValue: unknown, entityKey: string, action: 'seed' | 'readback' | 'cleanup') {
  const plan = parse(CaseFixturePlan, planValue); const payload = parse(LogicalPayload, payloadValue);
  if (!verifySelfDigest(plan) || !verifySelfDigest(payload) || !sameRef(plan.logicalPayloadRef, payload.ref) || !sameRef(plan.seedRecipeRef, payload.seedRecipeRef) || !sameScope(plan.scope, payload.scope)) deny('fixture_identity_mismatch');
  if (payload.entities.filter(entity => entity.entityKey === entityKey).length !== 1) deny('fixture_entity_ambiguous_or_missing');
  const input = parse(CapabilityInput, { kind: 'api.fixture', version: 1, recipeRef: plan.seedRecipeRef, logicalPayloadRef: plan.logicalPayloadRef, entityKey, action });
  return { fixtureRef: structuredClone(plan.ref), definitionScope: structuredClone(plan.scope), input };
}
export function mutates(input: CapabilityInput): boolean {
  switch (input.kind) {
    case 'resource.lifecycle': return true;
    case 'http.step': return input.step.kind === 'http.request' && !['GET', 'HEAD'].includes(input.step.method);
    // Navigation executes application code; only an explicit DOM observation is read-only.
    case 'browser.step': return input.step.kind !== 'ui.observe';
    case 'api.fixture': return input.action !== 'readback';
    case 'worker.job': return input.action !== 'observe';
    case 'wiremock.contract': return input.action !== 'observe';
    case 'database.fixture': return input.action !== 'observe';
    case 'pipeline.check': return true;
    case 'protocol.session': return input.action !== 'observe';
  }
}
export type ExtensionRegistration = { namespace: string; version: number; schemaRef: Ref; schema: z.ZodType };
export type BoundaryPorts = {
  resolveOperation(operationId: string, binding: CapabilityBinding): Promise<unknown>;
  resolveResource(ref: Ref): Promise<unknown>;
  authorize(operation: CapabilityOperation, resource: ScopedResource, mutation: boolean): Promise<void>;
  readArtifact(ref: Ref): Promise<Uint8Array>;
  extensions: readonly ExtensionRegistration[];
};
async function extensions(values: CapabilityExtension[], ports: BoundaryPorts, descriptor: CapabilityDescriptor): Promise<string[]> {
  const omitted: string[] = []; const seen = new Set<string>();
  for (const extension of values) {
    const key = `${extension.namespace}/v${extension.version}`;
    if (seen.has(key)) deny('duplicate_extension'); seen.add(key);
    const declaration = descriptor.extensions.find(e => e.namespace === extension.namespace && e.version === extension.version);
    const registration = ports.extensions.find(r => r.namespace === extension.namespace && r.version === extension.version);
    if (!registration || !declaration) { if (extension.required) deny('unsupported_extension'); omitted.push(key); continue; }
    if (!sameRef(declaration.schemaRef, extension.schemaRef) || !sameRef(registration.schemaRef, extension.schemaRef)) deny('extension_schema_mismatch');
    const bytes = Buffer.from(await ports.readArtifact(structuredClone(extension.payloadRef)));
    if (bytes.byteLength > 65536 || !equal(digestOfBytes(bytes), extension.payloadRef.digest)) deny('extension_payload_mismatch');
    let json: unknown; try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return deny('invalid_extension_payload'); }
    if (!registration.schema.safeParse(json).success) deny('invalid_extension_payload');
  }
  return omitted;
}
export function negotiateCapabilities(requirements: unknown[], descriptorValues: unknown[]) {
  const descriptors = descriptorValues.map(d => parse(CapabilityDescriptor, d));
  const required = z.array(CapabilityOperation.shape.capability).max(64).parse(requirements);
  if (new Set(descriptors.map(d => `${d.id}/v${d.version}`)).size !== descriptors.length) deny('duplicate_capability_descriptor');
  if (new Set(required.map(d => `${d.id}/v${d.version}`)).size !== required.length) deny('duplicate_capability_requirement');
  const omitted: string[] = [];
  for (const item of required) {
    const descriptor = descriptors.find(d => d.id === item.id && d.version === item.version);
    if (!descriptor || descriptor.availability !== 'observed_supported') {
      if (item.required) deny(descriptors.some(d => d.id === item.id) ? 'unsupported_capability_version_or_state' : 'unsupported_capability');
      omitted.push(`${item.id}/v${item.version}`);
    }
  }
  return { descriptors, omitted };
}
/** Host-supplied descriptor/resource ports are the trust boundary, never producer claims. */
export async function admitCapabilityOperation(value: unknown, currentValue: unknown, descriptorValue: unknown, ports: BoundaryPorts, now = Date.now()) {
  const operation = parse(CapabilityOperation, value); const current = parse(CapabilityBinding, currentValue);
  if (operation.phase !== capabilityPhase(operation.input)) deny('unsupported_lifecycle_phase');
  if (!sameScope(operation.binding.scope, current.scope)) deny('scope_mismatch');
  if (!equal(operation.binding, current)) deny('stale_or_cross_run_operation');
  if (Date.parse(operation.deadlineAt) <= now) deny('deadline_expired');
  const frozen = parse(CapabilityOperation, await ports.resolveOperation(operation.operationId, structuredClone(current)));
  if (!equal(frozen, operation)) deny('operation_plan_mismatch');
  const descriptor = parse(CapabilityDescriptor, descriptorValue);
  if (descriptor.id !== operation.capability.id || descriptor.version !== operation.capability.version || descriptor.availability !== 'observed_supported') deny('unsupported_capability');
  if (!descriptor.semantics.includes(operation.input.kind)) deny('unsupported_semantics');
  if (operation.input.kind === 'protocol.session') {
    const input = operation.input;
    const protocol = descriptor.protocols.find(p => p.transport === input.transport && p.version === input.protocolVersion);
    if (!protocol) deny('unsupported_protocol_version');
    if (!protocol!.semantics.includes(input.semantics)) deny('unsupported_protocol_semantics');
    if (!descriptor.evidenceClasses.includes(input.evidenceClass)) deny('unsupported_evidence_class');
    if (input.requiredFeatures.some(feature => !protocol!.features.includes(feature))) deny('unsupported_protocol_feature');
  }
  const resource = parse(ScopedResource, await ports.resolveResource(operation.resourceRef));
  if (!sameRef(resource.ref, operation.resourceRef) || !equal(resource.binding, current)) deny('resource_binding_mismatch');
  if (Date.parse(resource.expiresAt) <= now) deny('resource_lease_expired');
  if (operation.input.kind === 'resource.lifecycle' && operation.input.action === 'provision') {
    if (resource.kind !== operation.input.resourceKind || !sameRef(resource.provisioningPlanRef, operation.input.planRef)) deny('resource_plan_mismatch');
  } else if (!resource.identityRef) deny('resource_identity_unobserved');
  const mutation = mutates(operation.input);
  if (mutation && resource.isolation !== 'owned_isolated') deny('isolated_ownership_required');
  await ports.authorize(structuredClone(operation), structuredClone(resource), mutation);
  const omittedExtensions = await extensions(operation.extensions, ports, descriptor);
  // These are validation facts, not an execution capability or permission token.
  return { operation: structuredClone(operation), descriptor: structuredClone(descriptor), omittedExtensions };
}

const verified = new WeakMap<object, CapabilityObservation>();
export type VerifiedCapabilityObservation = { readonly validated: true };
/** Capture a verified immutable snapshot; callers cannot mutate its backing record. */
export async function verifyCapabilityObservation(value: unknown, operationValue: unknown, descriptorValue: unknown,
  readArtifact: BoundaryPorts['readArtifact']): Promise<VerifiedCapabilityObservation> {
  const observation = parse(CapabilityObservation, value); const operation = parse(CapabilityOperation, operationValue);
  const descriptor = parse(CapabilityDescriptor, descriptorValue);
  if (!equal(observation.binding, operation.binding) || observation.operationId !== operation.operationId) deny('stale_or_cross_run_evidence');
  if (!equal(observation.inputDigest, digestOfValue(operation.input))) deny('input_digest_mismatch');
  if (!equal(observation.producer, descriptor.producer)) deny('producer_mismatch');
  if (!descriptor.evidenceClasses.includes(observation.evidenceClass)) deny('unsupported_evidence_class');
  if (operation.input.kind === 'protocol.session' && observation.evidenceClass !== operation.input.evidenceClass) deny('evidence_class_mismatch');
  const permittedFacts: Record<CapabilityInput['kind'], readonly CapabilityObservation['facts']['kind'][]> = {
    'resource.lifecycle': ['resource'], 'http.step': ['http'], 'browser.step': ['browser'], 'api.fixture': ['resource', 'http'],
    'worker.job': ['worker'], 'wiremock.contract': ['contract'], 'database.fixture': ['database', 'resource'],
    'pipeline.check': ['pipeline'], 'protocol.session': ['stream', 'protocol_message'],
  };
  if (!permittedFacts[operation.input.kind].includes(observation.facts.kind)) deny('observation_semantics_mismatch');
  if (observation.facts.kind === 'protocol_message') {
    const facts = observation.facts;
    if (operation.input.kind !== 'protocol.session' || facts.requestId !== operation.input.requestId) deny('request_correlation_mismatch');
    if (!observation.evidence.some(item => sameRef(item.ref, facts.nativeMessageRef))) deny('native_message_evidence_missing');
  }
  let bytesRead = 0; const refs = new Set<string>(); const snapshots = new Map<string, Buffer>();
  for (const artifact of observation.evidence) {
    if (!equal(artifact.producer, descriptor.producer)) deny('untrusted_native_producer');
    const key = `${artifact.ref.id}:${artifact.ref.revision}`; if (refs.has(key)) deny('duplicate_evidence'); refs.add(key);
    const bytes = Buffer.from(await readArtifact(structuredClone(artifact.ref))); bytesRead += bytes.byteLength;
    if (bytes.byteLength > 16 * 1024 * 1024 || bytesRead > 64 * 1024 * 1024) deny('evidence_byte_limit');
    if (bytes.byteLength !== artifact.byteCount || !equal(digestOfBytes(bytes), artifact.ref.digest)) deny('evidence_digest_mismatch');
    snapshots.set(JSON.stringify(artifact.ref), bytes);
  }
  if (observation.factsRef) {
    const bytes = snapshots.get(JSON.stringify(observation.factsRef)); if (!bytes) deny('facts_evidence_missing');
    let captured: unknown; try { captured = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return deny('facts_evidence_invalid'); }
    if (!CapabilityObservation.shape.facts.safeParse(captured).success || !equal(captured, observation.facts)) deny('facts_mapping_loss');
  }
  if (observation.facts.kind === 'stream') {
    const transcriptBytes = snapshots.get(JSON.stringify(observation.facts.transcriptRef)); if (!transcriptBytes) deny('stream_evidence_missing');
    let transcript: unknown; try { transcript = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(transcriptBytes)); } catch { return deny('stream_evidence_invalid'); }
    const streamResult = await verifyCapabilityStream(transcript, operation, async ref => { const bytes = snapshots.get(JSON.stringify(ref)); if (!bytes) return deny('stream_evidence_missing'); return Buffer.from(bytes); });
    if (observation.completeness === 'complete' && streamResult.evidenceVerdict !== 'admissible') deny('incomplete_stream_evidence');
  }
  const token = Object.freeze({ validated: true as const }); verified.set(token, structuredClone(observation)); return token;
}
/** Evidence admissibility is separate from execution status and from product assertions. */
export function assessCapabilityEvidence(token: VerifiedCapabilityObservation) {
  const observation = verified.get(token); if (!observation) return deny('unverified_observation');
  const evidenceVerdict = observation.source === 'inference' ? 'untrusted_inference' as const
    : observation.completeness !== 'complete' || observation.executionStatus === 'unsupported' ? 'inconclusive' as const
    : observation.facts.kind === 'stream' && observation.facts.completion !== 'completed' ? 'inconclusive' as const
    : 'admissible' as const;
  return { executionStatus: observation.executionStatus, evidenceVerdict, observation: structuredClone(observation),
    verificationVerdict: 'not_evaluated' as const }; // only the existing trusted assertion reducer may decide product PASS
}

/** Bounded per-attempt accumulator. Redelivery is idempotent; conflicting identities fail. */
export class CapabilityEventIndex {
  private readonly rows = new Map<string, string>();
  private readonly ids = new Map<string, string>();
  private readonly binding: CapabilityBinding;
  private readonly maxEvents: number;
  constructor(binding: CapabilityBinding, maxEvents = 5000) {
    this.binding = structuredClone(parse(CapabilityBinding, binding));
    if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 5000) deny('invalid_event_limit');
    this.maxEvents = maxEvents;
  }
  append(value: unknown): 'added' | 'duplicate' {
    const item = parse(CapabilityObservation, value);
    if (!equal(item.binding, this.binding)) deny('stale_or_cross_run_evidence');
    const sequence = `${item.operationId}:${item.sequence}`; const digest = digestOfValue(item).hex;
    const prior = this.rows.get(sequence); const priorId = this.ids.get(item.eventId);
    if (prior !== undefined || priorId !== undefined) {
      if (prior === digest && priorId === digest) return 'duplicate';
      return deny('conflicting_redelivery');
    }
    if (this.rows.size >= this.maxEvents) deny('event_limit');
    this.rows.set(sequence, digest); this.ids.set(item.eventId, digest); return 'added';
  }
}

/** Verify wire ordering and byte assembly without asserting protocol/business acceptance. */
export async function verifyCapabilityStream(value: unknown, operationValue: unknown, readArtifact: BoundaryPorts['readArtifact']) {
  const transcript = parse(StreamTranscript, value); const operation = parse(CapabilityOperation, operationValue);
  if (operation.input.kind !== 'protocol.session') return deny('unsupported_semantics');
  if (!equal(transcript.binding, operation.binding) || transcript.operationId !== operation.operationId) deny('stale_or_cross_run_evidence');
  if (transcript.requestId !== operation.input.requestId) deny('request_correlation_mismatch');
  if (transcript.resume && !transcript.negotiatedFeatures.includes('resume')) deny('unsupported_resume_semantics');
  if (transcript.transport !== operation.input.transport || transcript.protocolVersion !== operation.input.protocolVersion) deny('unsupported_protocol_version');
  if (operation.input.requiredFeatures.some(feature => !transcript.negotiatedFeatures.includes(feature))) deny('unsupported_protocol_feature');
  const chunks = new Map<string, Buffer[]>(); let bytesRead = 0;
  const read = async (ref: Ref) => {
    const bytes = Buffer.from(await readArtifact(structuredClone(ref))); bytesRead += bytes.byteLength;
    if (bytes.byteLength > 16 * 1024 * 1024 || bytesRead > 64 * 1024 * 1024) deny('evidence_byte_limit');
    if (!equal(digestOfBytes(bytes), ref.digest)) deny('evidence_digest_mismatch'); return bytes;
  };
  for (const item of transcript.events) {
    if (item.kind === 'chunk') { const bytes = await read(item.payloadRef); chunks.set(item.messageId, [...(chunks.get(item.messageId) ?? []), bytes]); }
    if (item.kind === 'message') {
      const bytes = await read(item.payloadRef); const parts = chunks.get(item.messageId);
      if (parts && !Buffer.concat(parts).equals(bytes)) deny('logical_message_bytes_mismatch');
    }
  }
  return { transcript: structuredClone(transcript), evidenceVerdict: transcript.completeness === 'complete' ? 'admissible' as const : 'inconclusive' as const,
    verificationVerdict: 'not_evaluated' as const };
}
