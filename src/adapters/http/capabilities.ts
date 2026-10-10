import { RunnerCapabilities, digestOfValue, parseAs } from '../../protocol/index.ts';

const base = {
  ref: { id: 'tracegrove.runner.http', revision: '0.1.0', digest: { algorithm: 'sha256' as const, hex: '0'.repeat(64) } },
  operations: ['http.request', 'observe'],
  oracles: ['http.observation/1', 'step.result/1'],
  fixtureOperations: ['fixture.http'],
  faultOperations: [],
  variableCaptureFormats: ['application/json'],
  cleanupOperations: ['fixture.http'],
  maxStepsPerCase: 50,
  environmentClasses: ['isolated_candidate', 'deployed_preview', 'deployed_canary', 'production_observation'] as const,
  captureFormats: ['application/json'],
  surfacePackRefs: [],
  hostConstraintRef: null,
  cancellation: 'confirmed' as const,
  protocol: 'http' as const,
  conformanceReceiptRef: null,
};
const digest = digestOfValue({ ...base, ref: { id: base.ref.id, revision: base.ref.revision } });
export const HTTP_RUNNER_CAPABILITIES: RunnerCapabilities = parseAs(RunnerCapabilities, { ...base, ref: { ...base.ref, digest } }, 'runner capabilities');
