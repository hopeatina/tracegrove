import { Accounting, CostObservation, PerformanceObservation, freeze, type BudgetReservation, type EvidenceArtifact,
  type Ref, type Scope, type Step, type StepObservation } from '../protocol/index.ts';

type AttemptUsageInput = {
  owner: Extract<CostObservation['owner'], { kind: 'attempt' }>; scope: Scope; cellId: string; observedAt: string;
  runnerSeconds: number; browserSeconds: number; integrationOperations: number; hostAdapter: string;
  steps: StepObservation[]; stepKinds: ReadonlyMap<string, Step['kind']>; artifacts: EvidenceArtifact[];
  reservation: BudgetReservation; routingRef: Ref;
};

function boundary(kind: Step['kind'] | undefined): string {
  if (kind?.startsWith('ui.')) return 'browser';
  if (kind?.startsWith('job.')) return 'native_job';
  if (kind === 'mcp.call') return 'mcp';
  if (kind === 'conversation.run') return 'conversation';
  if (kind === 'http.request' || kind === 'observe') return 'http';
  return 'unknown';
}

export function stepPerformance(steps: StepObservation[], kinds: ReadonlyMap<string, Step['kind']>, cellId: string, host: string) {
  return steps.filter(step => step.timing !== null).map(step => PerformanceObservation.parse({
    metric: `step.${step.stepId}.duration`, boundary: boundary(kinds.get(step.stepId)), clock: 'monotonic',
    cellId, valueMs: step.timing!.durationMs,
    censored: step.result === 'cancelled' || ['deadline_exceeded', 'browser_timeout', 'cancelled'].includes(step.reasonCode ?? ''),
    warm: null, strata: { host },
  }));
}

/** Recorded usage is not a price quote, invoice reconciliation or observed cache state. */
export function summarizeAttemptUsage(input: AttemptUsageInput) {
  const seconds = Number(input.runnerSeconds.toFixed(3));
  const hostCost = CostObservation.parse(freeze({ schemaVersion: 'workflow.cost-observation/v1',
    ref: { id: `${input.owner.executionId}.${input.cellId}.cost.host`, revision: '1' }, scope: input.scope,
    owner: input.owner, operationId: `${input.cellId}.host`, stage: 'execution', billingRoute: 'host_minutes',
    providerRequestId: null, usageRef: null, rateSnapshotRef: null,
    quantity: { value: seconds, unit: 'runner_wall_seconds' }, amount: null, reconciliation: 'unknown', observedAt: input.observedAt,
  }));
  const accounting = Accounting.parse({
    reservations: [{ reservationId: input.reservation.ref.id, kind: 'action', cents: input.reservation.actionCents }],
    runnerSeconds: seconds, browserSeconds: Number(input.browserSeconds.toFixed(3)),
    inferenceCalls: 0, inferenceTokens: 0, requestedModel: null, observedModel: null,
    providerRequestIds: input.steps.flatMap(step => {
      const id = step.output && typeof step.output === 'object' ? (step.output as { requestId?: unknown }).requestId : null;
      return typeof id === 'string' && id.length > 0 ? [id] : [];
    }),
    integrationOperations: input.integrationOperations, artifactBytes: input.artifacts.reduce((sum, artifact) => sum + artifact.byteCount, 0),
    estimatedCents: null, reconciledCents: null, rateCardDigest: null,
    unknownCharges: [{ route: 'host_minutes', reason: 'Runner elapsed time was observed; host pricing and billing were not observed.' },
      ...(input.integrationOperations ? [{ route: 'provider_operation', reason: 'Integration operations were observed; downstream usage and charges were not reconciled.' }] : [])],
    routingDecisionRefs: [input.routingRef], costObservationRefs: [hostCost.ref],
  });
  const performance = stepPerformance(input.steps, input.stepKinds, input.cellId, input.hostAdapter);
  return { accounting, performance, costs: [hostCost] };
}
