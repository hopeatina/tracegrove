/**
 * Trusted executor: admits a frozen request, prepares each selected cell on its host, applies
 * fixtures through registered actions, runs compiled steps through the surface driver, collects
 * boundary/host/identity observations and artifacts, cleans owned resources and seals a receipt.
 * The reducer derives every verdict; drivers and hosts only supply observations.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ActionRegistry, AuthRecipe, BoundaryObservation, BudgetReservation, CampaignFixturePlan, CaseFixturePlan, CaseSpec,
  CostObservation, CredentialLease, EnvironmentBinding, EnvironmentPlan, ExecutionReceipt, FidelityPlan, FixtureManifest,
  HostPlan, IntelligencePolicy, LogicalPayload, MockResponses, NativeJobAction, Persona, RoutingDecision, SeedRecipe,
  SelectionManifest, SurfaceBinding, digestOfValue, freeze, parseAs, refKey, sameDigest, selfDigest, verifySelfDigest,
  type Accounting, type CampaignResult, type Ref, type Scope, type Step, type StepObservation,
  type TargetTuple, type VariableSource, type BrowserObservation, type NativeJobObservation, type RunnerCapabilities,
} from '../protocol/index.ts';
import { HttpDriver, HttpStepError, bearerFor, captureValues, redactObservation, type HttpObservation } from '../adapters/http/driver.ts';
import { NativeJobError } from '../adapters/job/driver.ts';
import { BrowserStepError } from '../adapters/browser/driver.ts';
import { CaseBrowserSession } from '../adapters/browser/session.ts';
import { LocalProcessHost } from '../hosts/local.ts';
import { MockLoopbackHost } from '../hosts/mock.ts';
import type { ExecutorHost, HostSession } from '../hosts/types.ts';
import { LocalArtifactStore } from './artifacts.ts';
import { collectCleanup, type AllocatedFixture } from './cleanup.ts';
import { writeExecutionBundle } from './bundle.ts';
import { isoPlusMs, monotonicMs, newId, nowIso } from './clock.ts';
import { compileCase, applyTemplateDeep, type CompiledCase } from './compiler.ts';
import { Deadline } from './deadline.ts';
import { Blocked, Conflict, InfrastructureFailure, isInfrastructureStepFailure } from './errors.ts';
import { EventLog } from './events.ts';
import type { LocalLedger } from './ledger.ts';
import type { FrozenBundle } from './planner.ts';
import { frozenRunnerCapabilities } from './runnerCapabilities.ts';
import { REDUCER_REF, compareTargets, evaluateAssertions, evaluatePredicate, reduceCampaign, reduceCell } from './reducer.ts';
import { targetFromComponentAttestations } from './targetObservation.ts';

export const EXIT_CODES = { passed: 0, assertion_failed: 1, blocked: 2, inconclusive: 2, infrastructure_failed: 3, cancelled: 4 } as const;

export type RunSummary = {
  executionId: string; attemptId: string; generation: number; campaignId: string;
  outcome: CampaignResult['outcome']; exitCode: number; reasonCodes: string[];
  receipts: ExecutionReceipt[]; campaign: CampaignResult; executionDir: string; redelivered: boolean;
};

export type RunOptions = {
  bundle: FrozenBundle;
  stateDir: string;
  ledger: LocalLedger;
  scope: Scope;
  signal?: AbortSignal;
  onEvent?: (event: { kind: string; stepId: string | null; redactedPayload: Record<string, unknown>; at: string }) => void;
  hosts?: { local?: ExecutorHost; mock?: ExecutorHost };
};

class DocStore {
  private readonly docs = new Map<string, unknown>();
  constructor(documents: Record<string, unknown>) {
    for (const [key, doc] of Object.entries(documents)) this.docs.set(key, doc);
  }
  get<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, ref: Ref, label: string): T {
    const doc = this.docs.get(refKey(ref));
    if (!doc) throw new Blocked([{ code: 'unresolved_ref', detail: `${label}: ${refKey(ref)} is not in the frozen bundle`, owner: 'operator', action: 'plan again; the bundle must carry the executable closure' }]);
    if (!verifySelfDigest(doc as { ref: Ref }) || !sameDigest((doc as { ref: Ref }).ref.digest, ref.digest)) {
      throw new Blocked([{ code: 'digest_mismatch', detail: `${label}: ${refKey(ref)} bytes do not hash to the referenced digest`, owner: 'operator', action: 'plan again from reviewed definitions' }]);
    }
    const result = schema.safeParse(doc);
    if (!result.success || result.data === undefined) throw new Blocked([{ code: 'schema_violation', detail: `${label}: ${refKey(ref)}` }]);
    return result.data;
  }
  runnerCapabilities(expected: Ref): RunnerCapabilities { return frozenRunnerCapabilities(Object.fromEntries(this.docs), expected); }
}

type PreparedCell = {
  cell: SelectionManifest['cells'][number];
  spec: CaseSpec;
  compiled: CompiledCase;
  persona: Persona;
  authRecipe: AuthRecipe;
  binding: SurfaceBinding;
  environmentPlan: EnvironmentPlan;
  hostPlan: HostPlan;
  fixture: { plan: CaseFixturePlan; recipe: SeedRecipe; payload: LogicalPayload; registry: ActionRegistry } | null;
  fidelityCell: FidelityPlan['cells'][number];
};

function ownerFor(scope: Scope): string {
  return scope.ownerId;
}

export async function executeBundle(options: RunOptions): Promise<RunSummary> {
  const { bundle, stateDir, ledger, scope } = options;
  const signal = options.signal ?? new AbortController().signal;
  if (!bundle.request) throw new Blocked(bundle.blockers.map((b) => ({ code: b.code, detail: b.detail, owner: b.owner, action: b.action })));
  const request = bundle.request;
  if (!verifySelfDigest(request)) throw new Blocked([{ code: 'request_digest_mismatch', detail: 'the frozen request was modified after planning', owner: 'operator', action: 'plan again' }]);
  if (digestOfValue(request.requestedScope).hex !== digestOfValue(scope).hex) {
    throw new Blocked([{ code: 'scope_mismatch', detail: 'request scope differs from the authenticated controller owner' }]);
  }
  if (request.purpose === 'qualification' || request.purpose === 'regression' || request.sourcePlanRef || request.reviewRef || request.scenarioRefs.length || request.qualificationRoundRef) {
    throw new Blocked([{ code: 'scenario_lifecycle_unavailable', detail: 'reviewed source plans, qualification and activated regression admission require the unimplemented lifecycle authority' }]);
  }
  const docs = new DocStore(bundle.documents);
  const selection = docs.get<SelectionManifest>(SelectionManifest, request.selectionManifestRef, 'selection');
  if (digestOfValue(selection.scope).hex !== digestOfValue(scope).hex) throw new Blocked([{ code: 'selection_scope_mismatch', detail: 'selection is outside the admitted owner scope' }]);
  const selectedCases = [...new Set(selection.cells.map((cell) => refKey(cell.caseRef)))].sort();
  const requestedCases = request.caseRefs.map(refKey).sort();
  if (digestOfValue(selectedCases).hex !== digestOfValue(requestedCases).hex) throw new Blocked([{ code: 'request_selection_mismatch', detail: 'request cases must exactly match the frozen selection' }]);
  const fidelityPlan = docs.get<FidelityPlan>(FidelityPlan, request.fidelityPlanRef, 'fidelity plan');
  if (!sameDigest(fidelityPlan.selectionManifestRef.digest, selection.ref.digest)) throw new Blocked([{ code: 'fidelity_plan_foreign_selection', detail: 'fidelity plan binds a different selection manifest' }]);
  const campaignFixturePlan = request.fixturePlanRef ? docs.get<CampaignFixturePlan>(CampaignFixturePlan, request.fixturePlanRef, 'fixture plan') : null;
  if (campaignFixturePlan && !sameDigest(campaignFixturePlan.selectionManifestRef.digest, selection.ref.digest)) throw new Blocked([{ code: 'fixture_plan_foreign_selection', detail: 'fixture plan binds a different selection manifest' }]);
  const intelligencePolicy = docs.get<IntelligencePolicy>(IntelligencePolicy, request.intelligencePolicyRef, 'intelligence policy');
  const requiredCells = selection.cells.filter((c) => c.required);
  if (requiredCells.length === 0) throw new Blocked([{ code: 'empty_required_matrix', detail: 'no required cell selected' }]);

  // Resolve and compile every cell before any effect.
  const prepared: PreparedCell[] = selection.cells.map((cell) => {
    const spec = docs.get<CaseSpec>(CaseSpec, cell.caseRef, 'case');
    const persona = docs.get<Persona>(Persona, cell.personaRef, 'persona');
    const authRecipe = docs.get<AuthRecipe>(AuthRecipe, persona.authRecipeRef, 'auth recipe');
    const binding = docs.get<SurfaceBinding>(SurfaceBinding, cell.surfaceBindingRef, 'surface binding');
    const environmentPlan = docs.get<EnvironmentPlan>(EnvironmentPlan, cell.environmentRef, 'environment plan');
    const hostPlan = docs.get<HostPlan>(HostPlan, cell.executionHostRef, 'host plan');
    const capabilities = docs.runnerCapabilities(cell.expectedTarget.runner);
    const fidelityCell = fidelityPlan.cells.find((f) => f.selectionCellId === cell.selectionCellId);
    if (!fidelityCell) throw new Blocked([{ code: 'fidelity_cell_missing', detail: cell.selectionCellId }]);
    for (const required of spec.requiredBoundaries) {
      const rule = fidelityCell.boundaries.find((b) => b.boundaryId === required.boundaryId);
      if (!rule || rule.mode !== required.mode) throw new Blocked([{ code: 'fidelity_mode_mismatch', detail: `${spec.ref.id} requires ${required.boundaryId}=${required.mode}`, owner: 'operator', action: 'a live-required case cannot run under a substituted boundary' }]);
    }
    let fixture: PreparedCell['fixture'] = null;
    const fixtureCell = campaignFixturePlan?.cells.find((f) => f.selectionCellId === cell.selectionCellId) ?? null;
    if (spec.fixturePlanRef) {
      if (!fixtureCell?.caseFixturePlanRef || !sameDigest(fixtureCell.caseFixturePlanRef.digest, spec.fixturePlanRef.digest)) throw new Blocked([{ code: 'fixture_plan_missing', detail: `${spec.ref.id} requires its fixture plan in the campaign plan`, owner: 'operator', action: 'a null fixture plan cannot skip required starting state' }]);
      const plan = docs.get<CaseFixturePlan>(CaseFixturePlan, spec.fixturePlanRef, 'case fixture plan');
      const recipe = docs.get<SeedRecipe>(SeedRecipe, plan.seedRecipeRef, 'seed recipe');
      const payload = docs.get<LogicalPayload>(LogicalPayload, plan.logicalPayloadRef, 'logical payload');
      const registry = docs.get<ActionRegistry>(ActionRegistry, recipe.actionRegistryRef, 'action registry');
      fixture = { plan, recipe, payload, registry };
    }
    const compiled = compileCase(spec, capabilities, fixture?.recipe ?? null);
    return { cell, spec, compiled, persona, authRecipe, binding, environmentPlan, hostPlan, fixture, fidelityCell };
  });

  // Idempotent admission: the same frozen key reconciles the existing execution.
  const idemAggregate = `idempotency:${request.idempotencyKey}`;
  const existing = ledger.current(idemAggregate);
  let predecessor: Ref | null = null;
  let attemptNumber = 1;
  if (existing) {
    const executionId = String(existing.data.executionId);
    const admitted = ledger.history(`execution:${executionId}`).find((entry) => entry.type === 'admitted');
    if (admitted?.data.requestDigest !== request.ref.digest.hex) throw new Conflict('idempotency key is already bound to a different frozen request');
    const state = ledger.current(`execution:${executionId}`);
    if (state && state.type === 'finalized') {
      return { ...(state.data.summary as RunSummary), redelivered: true };
    }
    if (state && state.type !== 'interrupted') throw new Conflict(`request ${request.idempotencyKey} is already in flight as ${executionId} (${state.type}); redelivery reconciles, it does not start another attempt`);
    predecessor = (state?.data.receiptRef as Ref | undefined) ?? null;
    attemptNumber = Number(existing.data.attemptNumber ?? 1) + 1;
  }
  if (request.limits.costCeilingCents < bundle.estimatedCostCents) throw new Blocked([{ code: 'insufficient_budget_headroom', detail: `estimate ${bundle.estimatedCostCents} > ceiling ${request.limits.costCeilingCents}` }]);

  const executionId = newId('exec');
  const attemptId = newId('attempt');
  const generation = 1;
  const executionDir = join(stateDir, 'executions', executionId);
  mkdirSync(executionDir, { recursive: true });
  const reservation = parseAs(BudgetReservation, freeze({
    schemaVersion: 'workflow.budget-reservation/v1' as const, ref: { id: `${executionId}.reservation`, revision: '1' }, scope,
    campaignId: request.campaignId, executionId, attemptId, actionCents: request.limits.costCeilingCents, cleanupCents: 0, uncertainCents: 0, state: 'reserved' as const, reservedAt: nowIso(),
  }), 'budget reservation');
  ledger.append(`execution:${executionId}`, 0, 'admitted', { requestDigest: request.ref.digest.hex, idempotencyKey: request.idempotencyKey, attemptId, generation, attemptNumber, reservation: reservation.ref });
  ledger.append(idemAggregate, existing ? existing.version : 0, 'bound', { executionId, attemptNumber });
  const artifacts = new LocalArtifactStore(join(stateDir, 'artifacts'));
  const campaignDeadline = Deadline.in(request.limits.deadlineMs);
  const receipts: ExecutionReceipt[] = [];
  const hosts = { local: options.hosts?.local ?? new LocalProcessHost(), mock: options.hosts?.mock ?? new MockLoopbackHost() };
  let phaseVersion = ledger.version(`execution:${executionId}`);

  for (const item of prepared) {
    const receipt = await runCell({ item, request, selection, fidelityPlan, campaignFixturePlan, intelligencePolicy, docs, scope, executionId, attemptId, generation, attemptNumber, predecessor, reservation, campaignDeadline, signal, artifacts, executionDir, hosts, bundle, onEvent: options.onEvent });
    receipts.push(receipt);
    phaseVersion = ledger.append(`execution:${executionId}`, phaseVersion, 'cell.finalized', { selectionCellId: item.cell.selectionCellId, outcome: receipt.outcome, receiptRef: receipt.ref }).version;
  }
  const campaign = reduceCampaign({ scope, campaignId: request.campaignId, requestRef: request.ref, selection, receipts });
  writeExecutionBundle({ dir: executionDir, bundle, request, selection, receipts, campaign });
  const summary: RunSummary = {
    executionId, attemptId, generation, campaignId: request.campaignId, outcome: campaign.outcome, exitCode: EXIT_CODES[campaign.outcome],
    reasonCodes: [...new Set(receipts.flatMap((r) => r.reasonCodes))], receipts, campaign, executionDir, redelivered: false,
  };
  ledger.append(`execution:${executionId}`, phaseVersion, 'finalized', { outcome: campaign.outcome, campaignResultRef: campaign.ref, receiptRef: receipts[0]?.ref ?? null, summary: { ...summary, receipts: [], campaign } });
  return summary;
}

type CellContext = {
  item: PreparedCell; request: NonNullable<FrozenBundle['request']>; selection: SelectionManifest; fidelityPlan: FidelityPlan;
  campaignFixturePlan: CampaignFixturePlan | null; intelligencePolicy: IntelligencePolicy; docs: DocStore; scope: Scope;
  executionId: string; attemptId: string; generation: number; attemptNumber: number; predecessor: Ref | null; reservation: BudgetReservation;
  campaignDeadline: Deadline; signal: AbortSignal; artifacts: LocalArtifactStore; executionDir: string;
  hosts: { local: ExecutorHost; mock: ExecutorHost }; bundle: FrozenBundle; onEvent?: RunOptions['onEvent'];
};

async function runCell(ctx: CellContext): Promise<ExecutionReceipt> {
  const { item, request, scope, executionId, attemptId, generation, signal } = ctx;
  const { spec, compiled, cell, hostPlan, environmentPlan, authRecipe, fidelityCell } = item;
  const log = new EventLog(executionId, attemptId, generation, (event) => ctx.onEvent?.({ kind: event.kind, stepId: event.stepId, redactedPayload: event.redactedPayload, at: event.at }));
  const startedAt = nowIso();
  const cellDeadline = ctx.campaignDeadline.child(spec.limits.deadlineMs);
  const blockedReasons: string[] = [];
  const stepObservations: StepObservation[] = [];
  let session: HostSession | null = null;
  let fixtureManifest: FixtureManifest | null = null;
  let fixtureState: 'verified' | 'failed' | 'blocked' | 'cancelled' | 'unknown' | 'not_required' = item.fixture ? 'unknown' : 'not_required';
  let infrastructureFailure = false;
  let cancelled = false;
  const allocated: AllocatedFixture[] = [];
  const uncertainAllocations = new Set<string>();
  const fixtureOutputs: Record<string, Record<string, unknown>> = {};
  const costs: CostObservation[] = [];
  const hostStartedMs = monotonicMs();
  log.emit('cell.started', null, { selectionCellId: cell.selectionCellId, caseId: spec.ref.id, caseDigest: spec.ref.digest.hex, lane: fidelityCell.lane });

  const credentialNames = [...new Set([...(authRecipe.credentialName ? [authRecipe.credentialName] : []), ...compiled.credentialNames])];
  const workspaceDir = join(ctx.executionDir, 'host', cell.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_'));
  mkdirSync(workspaceDir, { recursive: true });
  const host = hostPlan.adapter === 'mock_loopback' ? ctx.hosts.mock : ctx.hosts.local;
  const mockResponses = hostPlan.mockResponsesRef ? ctx.docs.get<MockResponses>(MockResponses, hostPlan.mockResponsesRef, 'mock responses') : null;
  try {
    session = await host.start({ hostPlan, projectRoot: ctx.bundle.projectRoot, workspaceDir, scope, campaignId: request.campaignId, executionId, attemptId, generation, actorId: ownerFor(scope), credentialNames, signal, mockResponses });
    log.emit('host.started', null, { adapter: hostPlan.adapter, origin: session.origin, leaseRef: session.lease.ref, observationRef: session.observation.ref, attestations: session.attestations.map((a) => a.ref) });
  } catch (error) {
    if (error instanceof Blocked) blockedReasons.push(...error.reasons.map((r) => r.code));
    else { infrastructureFailure = true; log.emit('host.failed', null, { error: String((error as Error).message) }); }
  }

  // Host capability check: required capabilities need a probed, supported, current observation.
  let requiredCapabilitiesObserved = false;
  if (session) {
    const supported = new Set(session.observation.capabilities.filter((c) => c.state === 'supported' && c.probe === 'probed').map((c) => c.capability));
    const missing = hostPlan.requiredCapabilities.filter((c) => !supported.has(c));
    requiredCapabilitiesObserved = missing.length === 0;
    if (!requiredCapabilitiesObserved) blockedReasons.push(`host_capability_unobserved:${missing.join('/')}`);
  }

  // Identity: compare expected component identities with launcher attestations.
  let observedTarget: TargetTuple | null = null;
  let identityMatched: boolean | null = null;
  if (session) {
    observedTarget = targetFromComponentAttestations(cell.expectedTarget, session.attestations, hostPlan.launch, scope);
    const comparison = compareTargets(cell.expectedTarget, observedTarget);
    identityMatched = comparison.matched;
    log.emit('identity.compared', null, { matched: comparison.matched, mismatches: comparison.mismatches });
    if (comparison.matched === false) blockedReasons.push('identity_mismatch');
    if (comparison.matched === null) blockedReasons.push('required_identity_unknown');
  }

  const credentialLease = parseAs(CredentialLease, freeze({
    schemaVersion: 'workflow.credential-lease/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.credential-lease`, revision: '1' }, scope,
    authRecipeRef: authRecipe.ref, personaRef: item.persona.ref, executionId, attemptId, credentialName: authRecipe.credentialName,
    issuedBy: session ? (hostPlan.adapter === 'mock_loopback' ? 'environment' as const : 'local_launcher' as const) : 'none' as const, expiresAt: isoPlusMs(hostPlan.sessionLifetimeMs),
  }), 'credential lease');
  const origins = session ? environmentPlan.origins.map((o) => (o.startsWith('launch://') ? session!.origin : o)) : environmentPlan.origins;
  const provenance = fidelityCell.lane === 'mock_contract'
    ? { runtime: 'mocked' as const, data: 'mocked' as const, provider: 'none' as const, faults: 'none' as const, interceptors: session?.interceptorRefs ?? [], injectedFaults: [] }
    : { runtime: 'live' as const, data: 'seeded_real' as const, provider: 'none' as const, faults: 'none' as const, interceptors: [], injectedFaults: [] };
  const environment = parseAs(EnvironmentBinding, freeze({
    schemaVersion: 'workflow.environment/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.environment`, revision: '1' },
    planRef: environmentPlan.ref, campaignId: request.campaignId, executionId, attemptId, generation, scope, class: environmentPlan.class, origins,
    credentialLeaseRef: credentialLease.ref, actionEnvelopeRef: null, leaseExpiresAt: isoPlusMs(hostPlan.sessionLifetimeMs), budgetReservationRef: ctx.reservation.ref,
    admissionEvidenceRefs: session ? [session.lease.ref, session.observation.ref, ...session.attestations.map((a) => a.ref)] : [],
    expected: cell.expectedTarget, observed: observedTarget, provenance, networkProfileRef: null, clockProfileRef: null,
  }), 'environment binding');

  const driver = session ? new HttpDriver({ persona: authRecipe.credentialName ? session.credentials.get(authRecipe.credentialName) ?? null : null, named: Object.fromEntries(session.credentials) }, new Set([session.origin])) : null;
  const origin = session?.origin ?? '';
  const browser = new CaseBrowserSession({ origin, spec, persona: item.persona, bearer: authRecipe.credentialName ? session?.credentials.get(authRecipe.credentialName) ?? null : null,
    onNetwork: observation => { log.emit('browser.network', null, observation); },
  });
  const runtimeVariables: Record<string, unknown> = { execution_nonce: attemptId, lease_namespace: cell.selectionCellId, target_origin: origin };

  // ---- preparing: fixtures through registered actions with independent readback ----
  if (item.fixture && session && driver && blockedReasons.length === 0) {
    const { recipe, payload, registry } = item.fixture;
    const order = topoOrder(recipe);
    const manifestEntities: FixtureManifest['entities'] = [];
    const missing: string[] = [];
    let failed = false;
    for (const entityKey of order) {
      if (failed) { missing.push(entityKey); continue; }
      if (signal.aborted) { cancelled = true; missing.push(entityKey); continue; }
      const entity = recipe.entities.find((e) => e.entityKey === entityKey)!;
      const logical = payload.entities.find((e) => e.entityKey === entityKey)?.values ?? {};
      const variables: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(logical)) {
        if (value && typeof value === 'object' && '$entity' in (value as object)) { const v = value as { $entity: string; output: string }; variables[name] = fixtureOutputs[v.$entity]?.[v.output]; }
        else if (value && typeof value === 'object' && '$runtime' in (value as object)) variables[name] = runtimeVariables[(value as { $runtime: string }).$runtime];
        else variables[name] = value;
      }
      const action = registry.actions.find((a) => a.actionId === entity.actionId)!;
      const allocatingEvent = log.emit('fixture.allocating', null, { entityKey, actionId: action.actionId, effectKey: `${attemptId}:${entityKey}` });
      try {
        if (action.effect !== 'create') throw new HttpStepError('fixture_ownership_unavailable', 'only a registered create action can allocate an owned fixture');
        uncertainAllocations.add(entityKey);
        const observation = await driver.request({ origin, method: action.method, path: action.path, body: action.body, auth: action.auth, variables, deadline: cellDeadline.child(10_000), signal });
        if (action.expectStatus !== null && observation.status !== action.expectStatus) throw new HttpStepError('unexpected_status', `${action.actionId} returned ${observation.status}, expected ${action.expectStatus}`);
        const outputs = captureValues(observation, action.captures);
        fixtureOutputs[entityKey] = { ...variables, ...outputs };
        const observedId = outputs[entity.outputNames[0] ?? ''];
        if (typeof observedId !== 'string' && !(typeof observedId === 'number' && Number.isFinite(observedId))) {
          throw new HttpStepError('fixture_identity_unobserved', 'fixture allocation did not return a physical resource ID');
        }
        const parsedId = FixtureManifest.shape.entities.element.shape.physicalId.safeParse(String(observedId));
        if (!parsedId.success) throw new HttpStepError('fixture_identity_unobserved', 'captured fixture ID is invalid');
        const physicalId = parsedId.data;
        const cleanupHandle = entity.cleanup ? { actionId: entity.cleanup.actionId, args: { ...variables, ...outputs } } : null;
        const allocatedEvent = log.emit('fixture.allocated', null, { entityKey, physicalId, status: observation.status, requestId: observation.requestId, cleanupHandle }, { requestId: observation.requestId });
        allocated.push({ entityKey, physicalId, cleanup: cleanupHandle, absence: entity.cleanup ? entity.cleanup.absenceReadback : null });
        uncertainAllocations.delete(entityKey);
        let readbackRefs: Ref[] = [];
        if (entity.readback) {
          const readAction = registry.actions.find((a) => a.actionId === entity.readback!.actionId)!;
          const readback = await driver.request({ origin, method: readAction.method, path: readAction.path, body: readAction.body, auth: readAction.auth, variables: { ...variables, ...outputs }, deadline: cellDeadline.child(10_000), signal });
          const evaluation = evaluatePredicate(entity.readback.predicate, { status: readback.status, body: readback.body });
          const readEvent = log.emit('fixture.readback', null, { entityKey, pass: evaluation.pass, reason: evaluation.reason, observation: redactObservation(readback) }, { requestId: readback.requestId });
          readbackRefs = [EventLog.refOf(readEvent)];
          if (!evaluation.pass) throw new HttpStepError('readback_mismatch', `${entityKey}: ${evaluation.reason}`);
        }
        manifestEntities.push({ entityKey, boundaryId: 'application', physicalId, dataOrigin: 'generated_synthetic', cleanupOwnership: 'allocated_by_attempt', startingVersion: null, baselineRef: null, compensationStrategyRef: null, ownershipEvidenceRefs: [EventLog.refOf(allocatingEvent), EventLog.refOf(allocatedEvent)], readbackEvidenceRefs: readbackRefs, cleanupHandle });
      } catch (error) {
        failed = true;
        const code = error instanceof HttpStepError ? error.code : 'transport_failure';
        log.emit('fixture.failed', null, { entityKey, code, message: String((error as Error).message) });
        missing.push(entityKey);
        if (code === 'cancelled') cancelled = true;
      }
    }
    fixtureState = cancelled ? 'cancelled' : failed ? 'failed' : 'verified';
    fixtureManifest = parseAs(FixtureManifest, freeze({
      schemaVersion: 'workflow.fixture-manifest/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.fixtures`, revision: '1' }, scope,
      campaignId: request.campaignId, executionId, attemptId, selectionCellId: cell.selectionCellId,
      campaignFixturePlanRef: ctx.campaignFixturePlan!.ref, caseFixturePlanRef: item.fixture.plan.ref, seedRecipeRef: recipe.ref, logicalPayloadRef: payload.ref,
      materializedPayloadDigest: digestOfValue(fixtureOutputs), observedSchemaIdentityRef: null, migrationDigest: null,
      namespace: cell.selectionCellId, executionNonce: attemptId, resourceLeaseRefs: [], entities: manifestEntities,
      outputBindings: fixtureOutputs as Record<string, Record<string, unknown>>, lifecycleObservationRefs: [], state: fixtureState,
      missingEntityKeys: missing, unexpectedResourceRefs: [], deadlineAt: new Date(cellDeadline.at).toISOString(), finalizedAt: nowIso(),
    }), 'fixture manifest');
    log.emit('fixture.finalized', null, { state: fixtureState, manifestRef: fixtureManifest.ref, missing });
  }

  // ---- running: compiled steps in frozen order; every step gets one terminal observation ----
  const captured: Record<string, Record<string, unknown>> = {};
  let halted = blockedReasons.length > 0 || infrastructureFailure || !session || !driver || (fixtureState !== 'verified' && fixtureState !== 'not_required');
  for (const stepId of compiled.orderedStepIds) {
    const step = compiled.stepsById.get(stepId)!;
    const inputDigest = digestOfValue(step);
    if (halted || cancelled || signal.aborted) {
      if (signal.aborted && !cancelled) cancelled = true;
      stepObservations.push({ stepId, result: cancelled ? 'cancelled' : 'not_run', reasonCode: cancelled ? 'cancelled' : 'halted_by_prior_failure', eventIds: [log.emit('step.skipped', stepId, { reason: cancelled ? 'cancelled' : 'halted' }).eventId], evidenceRefs: [], inputDigest, outputDigest: null, output: null, timing: null });
      continue;
    }
    const variables: Record<string, unknown> = {};
    try {
      for (const [name, source] of Object.entries(step.inputs) as Array<[string, VariableSource]>) {
        switch (source.kind) {
          case 'literal': variables[name] = source.value; break;
          case 'capture': variables[name] = captured[source.stepId]?.[source.name]; break;
          case 'fixture': variables[name] = fixtureOutputs[source.entityKey]?.[source.outputName]; break;
          case 'credential': variables[name] = '<credential>'; break; // never expanded into variables or logs
          case 'runtime': variables[name] = runtimeVariables[source.name]; break;
        }
        if (variables[name] === undefined) throw new HttpStepError('unresolved_variable', `${stepId}.${name}`);
      }
    } catch (error) {
      stepObservations.push({ stepId, result: 'failed', reasonCode: (error as HttpStepError).code ?? 'unresolved_variable', eventIds: [log.emit('step.failed', stepId, { message: String((error as Error).message) }).eventId], evidenceRefs: [], inputDigest, outputDigest: null, output: null, timing: null });
      halted = true;
      continue;
    }
    const stepStart = nowIso();
    const stepStartedMs = monotonicMs();
    const startEvent = log.emit('step.started', stepId, { kind: step.kind, variables: Object.fromEntries(Object.entries(variables).filter(([k]) => step.inputs[k]?.kind !== 'credential')) });
    const deadline = cellDeadline.child(step.timeoutMs);
    try {
      let observation: HttpObservation | BrowserObservation | NativeJobObservation;
      if (step.kind === 'http.request') {
        observation = await driver!.request({ origin, method: step.method, path: step.path, headers: step.headers, body: step.body, auth: step.auth, variables, deadline, signal });
        if (step.expectStatus !== null && observation.status !== step.expectStatus) {
          const finished = log.emit('step.finished', stepId, { result: 'failed', reason: 'unexpected_status', observation: redactObservation(observation) }, { requestId: observation.requestId });
          stepObservations.push({ stepId, result: 'failed', reasonCode: `unexpected_status:${observation.status}`, eventIds: [startEvent.eventId, finished.eventId], evidenceRefs: [EventLog.refOf(finished)], inputDigest, outputDigest: digestOfValue(redactObservation(observation)), output: redactObservation(observation), timing: { startedAt: stepStart, finishedAt: nowIso(), durationMs: observation.durationMs } });
          halted = true;
          continue;
        }
        captured[stepId] = captureValues(observation, step.captures);
      } else if (step.kind === 'observe') {
        observation = await driver!.observe({ origin, method: step.readback.method, path: step.readback.path, auth: step.readback.auth, variables, deadline, signal }, step.predicate, step.pollIntervalMs);
        captured[stepId] = captureValues(observation, step.captures);
      } else if (step.kind === 'job.submit' || step.kind === 'job.observe' || step.kind === 'job.cancel') {
        if (!session?.nativeJobs) throw new NativeJobError('native_job_unavailable', 'The host did not establish a native job channel');
        const command = NativeJobAction.parse(applyTemplateDeep(step.command, variables));
        const credential = bearerFor(step, { persona: authRecipe.credentialName ? session.credentials.get(authRecipe.credentialName) ?? null : null, named: Object.fromEntries(session.credentials) });
        observation = step.kind === 'job.observe' && command.action === 'read'
          ? await session.nativeJobs.observe(command, credential, step.predicate, step.pollIntervalMs, deadline, signal)
          : await session.nativeJobs.request(command, credential, deadline, signal);
        captured[stepId] = captureValues({ body: observation }, step.captures);
      } else if (step.kind === 'ui.navigate' || step.kind === 'ui.action' || step.kind === 'ui.observe') {
        if (authRecipe.credentialName && !session?.credentials.get(authRecipe.credentialName)) throw new HttpStepError('missing_persona_credential', 'browser persona credential was not issued');
        observation = await browser.execute(step, variables, deadline, signal);
      } else {
        throw new HttpStepError('unsupported_operation', `${step.kind} is not implemented by the HTTP runner`);
      }
      const output = 'requestId' in observation ? redactObservation(observation) : observation;
      const finished = log.emit('step.finished', stepId, { result: 'completed', observation: output }, { requestId: 'requestId' in observation ? observation.requestId : null });
      stepObservations.push({ stepId, result: 'completed', reasonCode: null, eventIds: [startEvent.eventId, finished.eventId], evidenceRefs: [EventLog.refOf(finished)], inputDigest, outputDigest: digestOfValue(output), output, timing: { startedAt: stepStart, finishedAt: nowIso(), durationMs: monotonicMs() - stepStartedMs } });
    } catch (error) {
      const rawCode = error instanceof HttpStepError || error instanceof BrowserStepError || error instanceof NativeJobError ? error.code : 'transport_failure';
      const code = rawCode === 'browser_cancelled' ? 'cancelled' : rawCode;
      const finished = log.emit('step.finished', stepId, { result: code === 'cancelled' ? 'cancelled' : 'failed', reason: code, message: String((error as Error).message) });
      if (code === 'cancelled' || code === 'browser_cancelled') cancelled = true;
      else if (isInfrastructureStepFailure(code)) infrastructureFailure = true;
      stepObservations.push({ stepId, result: code === 'cancelled' ? 'cancelled' : 'failed', reasonCode: code, eventIds: [startEvent.eventId, finished.eventId], evidenceRefs: [EventLog.refOf(finished)], inputDigest, outputDigest: null, output: null, timing: { startedAt: stepStart, finishedAt: nowIso(), durationMs: 0 } });
      halted = true;
    }
  }

  // ---- collecting: boundary observations ----
  const boundaryObservations: BoundaryObservation[] = fidelityCell.boundaries.map((rule) => {
    let observedMode: BoundaryObservation['observedMode'] = 'unknown';
    let accountClass: BoundaryObservation['observedAccountClass'] = 'unknown';
    if (session) {
      if (rule.boundaryId === 'application') { observedMode = session.boundaryMode; accountClass = session.boundaryMode === 'real' ? 'local' : 'none'; }
      else if (rule.boundaryId === 'storage') { observedMode = session.dataDir ? 'real' : 'unknown'; accountClass = session.dataDir ? 'local' : 'unknown'; }
    }
    const mismatch = observedMode !== rule.mode ? [`expected ${rule.mode}, observed ${observedMode}`] : [];
    return parseAs(BoundaryObservation, freeze({
      schemaVersion: 'workflow.boundary-observation/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.boundary.${rule.boundaryId}`, revision: '1' }, scope,
      campaignId: request.campaignId, executionId, attemptId, selectionCellId: cell.selectionCellId, fidelityPlanRef: ctx.fidelityPlan.ref,
      boundaryId: rule.boundaryId, expectedMode: rule.mode, observedMode, observedAccountClass: accountClass, adapterRef: null,
      identityEvidenceRefs: session?.attestations.map((a) => a.ref) ?? [], interactionEvidenceRefs: stepObservations.flatMap((s) => s.evidenceRefs).slice(0, 64),
      resourceIdsRef: null, interceptorRefs: session?.interceptorRefs ?? [], faultRefs: [], observedAt: nowIso(), mismatchReasons: mismatch,
    }), 'boundary observation');
  });
  const fidelityMatched = boundaryObservations.filter((b) => fidelityCell.claimBoundaryIds.includes(b.boundaryId)).every((b) => b.mismatchReasons.length === 0);
  log.emit('boundaries.observed', null, { observations: boundaryObservations.map((b) => ({ boundaryId: b.boundaryId, expected: b.expectedMode, observed: b.observedMode, mismatches: b.mismatchReasons })) });

  // Flush browser evidence before host cleanup; an unavailable recording cannot satisfy required capture.
  const cleanupDeadline = Deadline.in(hostPlan.cleanupReserveMs);
  const media: Array<{ digest: string; bytes: Buffer }> = [];
  const mediaArtifacts: ExecutionReceipt['artifacts'] = [];
  try {
    const bytes = await browser.collectVideo(cleanupDeadline);
    if (bytes) {
      const artifact = ctx.artifacts.put({ id: `${executionId}.${cell.selectionCellId}.video`, bytes, mediaType: 'video/webm', producerRef: cell.expectedTarget.runner,
        stepIds: compiled.orderedStepIds.filter(id => compiled.stepsById.get(id)!.kind.startsWith('ui.')), from: startedAt, to: nowIso() });
      media.push({ digest: artifact.ref.digest.hex, bytes }); mediaArtifacts.push({ ...artifact, retentionPolicyRef: spec.capture.retentionPolicyRef });
      log.emit('browser.video.collected', null, { ref: artifact.ref, byteCount: artifact.byteCount });
    }
  } catch {
    infrastructureFailure = true; log.emit('browser.failed', null, { code: 'browser_evidence_collection_failed' });
  }

  // ---- cleaning: owned fixtures in reverse order, then the host; a cleanup deadline is reserved ----
  const { cleanup, criticalCleanupConfirmed } = await collectCleanup({ allocated,
    uncertainAllocations: uncertainAllocations.size, registry: item.fixture?.registry ?? null,
    driver, origin, deadline: cleanupDeadline, session, reason: cancelled ? 'cancelled' : 'cell complete', log });
  const hostSeconds = (monotonicMs() - hostStartedMs) / 1000;

  // ---- sealing ----
  const finishedAt = nowIso();
  const sealedEvents = log.toJsonl();
  const eventsArtifact = ctx.artifacts.put({ id: `${executionId}.${cell.selectionCellId}.events`, bytes: Buffer.from(sealedEvents, 'utf8'), mediaType: 'application/x-ndjson', producerRef: REDUCER_REF, stepIds: compiled.orderedStepIds, from: startedAt, to: finishedAt });
  const allArtifacts = [eventsArtifact, ...mediaArtifacts];
  const artifactsVerified = allArtifacts.every(artifact => ctx.artifacts.verify(artifact.ref.digest))
    && (spec.capture.video !== 'required' || mediaArtifacts.length > 0)
    && allArtifacts.reduce((sum, artifact) => sum + artifact.byteCount, 0) <= spec.limits.maxArtifactBytes;
  const assertions = evaluateAssertions(spec, environmentPlan.class, stepObservations, REDUCER_REF, startedAt, finishedAt);
  const reduction = reduceCell({ spec, expectedStepIds: compiled.orderedStepIds, steps: stepObservations, assertions, cancelled, fixtureState, identityMatched, fidelityMatched, requiredCapabilitiesObserved, artifactsVerified, unknownMutations: cleanup.remainingUnknownMutations, criticalCleanupConfirmed, infrastructureFailure, blockedReasons });
  const routing = parseAs(RoutingDecision, freeze({
    schemaVersion: 'workflow.routing-decision/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.routing`, revision: '1' }, scope,
    owner: { kind: 'attempt' as const, campaignId: request.campaignId, executionId, attemptId }, stage: 'replay' as const, inputDigest: spec.ref.digest,
    intelligencePolicyRef: ctx.intelligencePolicy.ref, catalogRef: null, candidates: [], selected: null,
    estimate: { amountCents: 0, unknownReason: null }, budgetReservationRef: ctx.reservation.ref, escalationReason: 'known case replay performs no authoring inference', decidedAt: nowIso(),
  }), 'routing decision');
  costs.push(parseAs(CostObservation, freeze({
    schemaVersion: 'workflow.cost-observation/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.cost.host`, revision: '1' }, scope,
    owner: { kind: 'attempt' as const, campaignId: request.campaignId, executionId, attemptId }, operationId: `${cell.selectionCellId}.host`, stage: 'execution',
    billingRoute: 'host_minutes' as const, providerRequestId: null, usageRef: null, rateSnapshotRef: null,
    quantity: { value: Number(hostSeconds.toFixed(3)), unit: 'seconds' }, amount: { value: 0, currency: 'USD', kind: 'measured' as const }, reconciliation: 'reconciled' as const, observedAt: nowIso(),
  }), 'cost observation'));
  const accounting: Accounting = {
    reservations: [{ reservationId: ctx.reservation.ref.id, kind: 'action', cents: ctx.reservation.actionCents }],
    runnerSeconds: Number(hostSeconds.toFixed(3)), browserSeconds: Number(browser.seconds.toFixed(3)), inferenceCalls: 0, inferenceTokens: 0, requestedModel: null, observedModel: null,
    providerRequestIds: stepObservations.flatMap((s) => (s.output && typeof s.output === 'object' && (s.output as { requestId?: string | null }).requestId ? [String((s.output as { requestId?: string | null }).requestId)] : [])),
    integrationOperations: 0, artifactBytes: allArtifacts.reduce((sum, artifact) => sum + artifact.byteCount, 0), estimatedCents: 0, reconciledCents: 0, rateCardDigest: null, unknownCharges: [],
    routingDecisionRefs: [routing.ref], costObservationRefs: costs.map((c) => c.ref),
  };
  const receipt = parseAs(ExecutionReceipt, freeze({
    schemaVersion: 'workflow.execution/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.receipt`, revision: '1' },
    executionId, campaignId: request.campaignId, attemptId, attemptNumber: ctx.attemptNumber, predecessorAttemptRef: ctx.predecessor, retryReason: ctx.predecessor ? 'redelivery after interrupted attempt' : null,
    scope, requesterId: ownerFor(scope), caseRef: spec.ref, personaRef: item.persona.ref, surfaceBindingRef: item.binding.ref, variantRef: null,
    executionHostRef: hostPlan.ref, hostLeaseRef: session?.lease.ref ?? { id: `${executionId}.host-lease.unissued`, revision: '0', digest: digestOfValue('unissued') }, hostObservationRefs: session ? [session.observation.ref] : [],
    environment, idempotencyKey: request.idempotencyKey, requestRef: request.ref, selectionCellId: cell.selectionCellId, qualificationRoundRef: null,
    fixtureManifestRef: fixtureManifest?.ref ?? null, boundaryObservationRefs: boundaryObservations.map((b) => b.ref), proofClaim: spec.proofClaim,
    coverage: reduction.coverage, eventsDigest: eventsArtifact.ref.digest, assertions, steps: stepObservations, artifacts: allArtifacts, accounting,
    performance: stepObservations.filter((s) => s.timing).map((s) => ({ metric: `step.${s.stepId}.duration`, boundary: compiled.stepsById.get(s.stepId)!.kind.startsWith('ui.') ? 'browser' : 'http', clock: 'monotonic' as const, cellId: cell.selectionCellId, valueMs: s.timing!.durationMs, censored: false, warm: false, strata: { host: hostPlan.adapter } })),
    cleanup, outcome: reduction.outcome, reasonCodes: reduction.reasonCodes, proofEligible: reduction.proofEligible, startedAt, finalizedAt: finishedAt,
  }), 'execution receipt');
  const finalization = log.emit('cell.finalized', null, { outcome: receipt.outcome, reasonCodes: receipt.reasonCodes, receiptRef: receipt.ref });
  // Persist cell-level records beside the receipt for the bundle writer. The events file carries the
  // sealed bytes the receipt hashes; the finalization event is recorded separately.
  writeExecutionBundle({ dir: ctx.executionDir, cell: { id: cell.selectionCellId, receipt, environment, fixtureManifest, boundaryObservations, hostLease: session?.lease ?? null, hostObservation: session?.observation ?? null, attestations: session?.attestations ?? [], credentialLease, routing, costs, eventsJsonl: sealedEvents, finalization, media } });
  return receipt;
}

function topoOrder(recipe: SeedRecipe): string[] {
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Blocked([{ code: 'cyclic_fixture_dependency', detail: key }]);
    visiting.add(key);
    const entity = recipe.entities.find((e) => e.entityKey === key);
    if (!entity) throw new Blocked([{ code: 'unknown_fixture_dependency', detail: key }]);
    for (const dep of entity.dependsOn) visit(dep);
    visiting.delete(key); visited.add(key); order.push(key);
  };
  for (const entity of recipe.entities) visit(entity.entityKey);
  return order;
}

export { selfDigest };
