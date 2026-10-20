/**
 * Trusted executor: admits a frozen request, prepares each selected cell on its host, applies
 * fixtures through registered actions, runs compiled steps through the surface driver, collects
 * boundary/host/identity observations and artifacts, cleans owned resources and seals a receipt.
 * The reducer derives every verdict; drivers and hosts only supply observations.
 */
import { lstatSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ActionRegistry, AuthRecipe, BoundaryObservation, BudgetReservation, CampaignFixturePlan, CaseFixturePlan, CaseSpec,
  CredentialLease, EnvironmentBinding, EnvironmentPlan, ExecutionReceipt, FidelityPlan, FixtureManifest,
  HostPlan, IntelligencePolicy, LogicalPayload, MockResponses, NativeJobAction, McpToolCall, ConversationRun, Persona, RoutingDecision, SeedRecipe,
  SelectionManifest, SurfaceBinding, digestOfValue, freeze, parseAs, refKey, sameDigest, selfDigest, verifySelfDigest,
  type CampaignResult, type Ref, type RunRequest, type Scope, type Step, type StepObservation,
  type TargetTuple, type VariableSource, type BrowserObservation, type RunnerCapabilities, type NativeJobObservation, type McpToolObservation, type ConversationObservation,
} from '../protocol/index.ts';
import { HttpDriver, HttpStepError, bearerFor, captureValues, redactObservation, type HttpObservation } from '../adapters/http/driver.ts';
import { NativeJobError } from '../adapters/job/driver.ts';
import { BrowserStepError } from '../adapters/browser/driver.ts';
import { CaseBrowserSession } from '../adapters/browser/session.ts';
import { hostFor, type HostOverrides } from '../hosts/registry.ts';
import type { HostSession } from '../hosts/types.ts';
import { credentialFor, sessionCredentials } from '../credentials/access.ts';
import { LocalArtifactStore } from './artifacts.ts';
import { collectCleanup, type AllocatedFixture } from './cleanup.ts';
import { readVerifiedBundle, writeExecutionBundle } from './bundle.ts';
import { checkCommittedExecutionBinding } from './executionReadback.ts';
import { requireRealDirectory, syncDirectory } from './atomicFiles.ts';
import { authorizeRegressionExecution, type RegressionExecutionOwner } from './regressionExecution.ts';
import { isoPlusMs, monotonicMs, newId, nowIso } from './clock.ts';
import { applyTemplateDeep } from './compiler.ts';
import { Deadline } from './deadline.ts';
import { Blocked, Conflict, InfrastructureFailure, isInfrastructureStepFailure } from './errors.ts';
import { EventLog } from './events.ts';
import type { LocalLedger } from './ledger.ts';
import { ExecutionOwnership, assertInterruptedOwnershipResolved } from './executionOwnership.ts';
import type { FrozenBundle } from './planner.ts';
import { checkedFrozenRequest, prepareFrozenCells, type DocStore, type PreparedCell } from './executionPreparation.ts';
import { REDUCER_REF, compareTargets, evaluateAssertions, evaluatePredicate, reduceCampaign, reduceCell } from './reducer.ts';
import { targetFromComponentAttestations } from './targetObservation.ts';
import { authorizeQualificationExecution, type QualificationExecutionOwner } from './qualificationExecution.ts';
import { summarizeAttemptUsage } from './attemptUsage.ts';

/** Step failures that say the environment, not the app, stopped the run. */
const ENVIRONMENT_BLOCKS = new Set(['persona_credential_expired', 'environment_writes_forbidden', 'budget_exceeded']);

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
  hosts?: HostOverrides;
  qualification?: QualificationExecutionOwner;
  regression?: RegressionExecutionOwner;
};

function ownerFor(scope: Scope): string {
  return scope.ownerId;
}

/** Readback reconciles a local commit; it never acquires resources or trusts cached PASS/summary. */
function committedRunSummary(input: { stateDir: string; ledger: LocalLedger; request: RunRequest; selection: SelectionManifest; scope: Scope;
  executionId: string; attemptId: string; generation: number; attemptNumber: number }): RunSummary {
  const { executionId, attemptId, generation, attemptNumber, request, selection, scope, ledger } = input;
  if (!/^[A-Za-z0-9_-]+$/.test(executionId) || !Number.isInteger(generation) || generation < 1 || !Number.isInteger(attemptNumber) || attemptNumber < 1)
    throw new Conflict('committed_execution_binding_invalid');
  const executionDir = join(input.stateDir, 'executions', executionId);
  let checked: ReturnType<typeof readVerifiedBundle>;
  try { requireRealDirectory(executionDir); checked = readVerifiedBundle(executionDir); }
  catch { throw new Conflict('committed_execution_evidence_invalid; preserve the existing execution and reconcile its missing or corrupt evidence'); }
  checkCommittedExecutionBinding(ledger, checked, { executionId, attemptId, generation, attemptNumber, scope, campaignId: request.campaignId,
    requestDigest: request.ref.digest.hex, requestRef: request.ref, selectionRef: selection.ref });
  return { executionId, attemptId, generation, campaignId: request.campaignId, outcome: checked.campaign.outcome,
    exitCode: EXIT_CODES[checked.campaign.outcome], reasonCodes: [...new Set(checked.receipts.flatMap(receipt => receipt.reasonCodes))],
    receipts: checked.receipts, campaign: checked.campaign, executionDir, redelivered: true };
}

function hasCommittedManifest(executionDir: string): boolean {
  try { lstatSync(join(executionDir, 'manifest.json')); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw new Conflict('committed_execution_evidence_unreadable'); }
}

export async function executeBundle(options: RunOptions): Promise<RunSummary> {
  const { bundle, stateDir, ledger, scope } = options;
  const signal = options.signal ?? new AbortController().signal;
  const request = checkedFrozenRequest(bundle, scope);
  if ((request.purpose === 'qualification' || request.purpose === 'regression' || request.sourcePlanRef || request.reviewRef || request.scenarioRefs.length || request.qualificationRoundRef || request.regressionAdmissionRef) &&
      !(request.purpose === 'qualification' && options.qualification) && !(request.purpose === 'regression' && options.regression)) {
    throw new Blocked([{ code: 'scenario_lifecycle_unavailable', detail: 'qualification and activated regression require their authenticated runtime owner; source trials are unavailable' }]);
  }
  const { docs, selection, fidelityPlan, campaignFixturePlan, intelligencePolicy, prepared } = prepareFrozenCells(bundle, scope, request);

  // Idempotent admission: the same frozen key reconciles the existing execution.
  const qualification = options.qualification && request.purpose === 'qualification'
    ? await authorizeQualificationExecution(options.qualification, request, selection, ledger, null) : null;
  const regression = options.regression && request.purpose === 'regression'
    ? await authorizeRegressionExecution(options.regression, request, selection, ledger, null) : null;
  if (qualification && resolve(join(stateDir, 'ledger')) !== resolve(ledger.dir)) throw new Conflict('qualification state directory must belong to the registration owner ledger');
  if (regression && resolve(join(stateDir, 'ledger')) !== resolve(ledger.dir)) throw new Conflict('regression state directory must belong to the registration owner ledger');
  const idemAggregate = qualification ? `qualification-execution:${qualification.admission.ref.digest.hex}` : `idempotency:${request.idempotencyKey}`;
  const existing = ledger.current(idemAggregate);
  const regressionExecutionId = regression ? `regression_exec_${regression.admission.ref.digest.hex}` : null;
  if (regressionExecutionId && !existing && ledger.current(`execution:${regressionExecutionId}`))
    throw new Conflict('regression admission already exists without its index; preserve and reconcile it instead of replaying effects');
  let predecessor: Ref | null = null;
  let attemptNumber = 1;
  if (existing) {
    const admissionHistory = qualification ? ledger.history(idemAggregate) : ledger.history(`execution:${String(existing.data.executionId)}`);
    const admitted = admissionHistory.find((entry) => entry.type === 'admitted');
    const executionId = qualification ? String(admitted?.data.executionId) : String(existing.data.executionId);
    if (admitted?.data.requestDigest !== request.ref.digest.hex) throw new Conflict('idempotency key is already bound to a different frozen request');
    if (qualification && admitted?.data.stateDir !== resolve(stateDir)) throw new Conflict('qualification execution is already bound to another state directory');
    const state = qualification ? existing : ledger.current(`execution:${executionId}`);
    const binding = { executionId, attemptId: String(admitted?.data.attemptId), generation: Number(admitted?.data.generation),
      campaignId: request.campaignId, requestDigest: request.ref.digest.hex, scope };
    const checkedSummary = () => committedRunSummary({ stateDir, ledger, request, selection, scope, executionId,
      attemptId: binding.attemptId, generation: binding.generation, attemptNumber: Number(admitted?.data.attemptNumber) });
    if (qualification) {
      // Qualification rounds bind per-cell allocations on the registration owner's ledger; they never replay or self-recover.
      if (state && state.type === 'finalized') return { ...(state.data.summary as RunSummary), redelivered: true };
      throw new Conflict('qualification attempt is incomplete; reconcile it instead of replaying allocated effects');
    }
    if (state && state.type === 'finalized') {
      return checkedSummary();
    }
    if (!state || state.type !== 'interrupted') throw new Conflict(`request ${request.idempotencyKey} is already in flight as ${executionId} (${state?.type ?? 'missing execution state'}); redelivery reconciles, it does not start another attempt`);
    if (regression) throw new Conflict('interrupted regression needs owned-state reconciliation and a fresh registered run; effects were not replayed');
    assertInterruptedOwnershipResolved(ledger, binding);
    if (hasCommittedManifest(join(stateDir, 'executions', executionId))) {
      const recovered = checkedSummary();
      // A crashed publisher may have linked the valid manifest before syncing its directory.
      try { syncDirectory(recovered.executionDir); }
      catch { throw new Conflict('committed_execution_durability_unconfirmed; preserve the committed bytes; no acquisition was replayed'); }
      ledger.append(`execution:${executionId}`, state.version, 'finalized', { outcome: recovered.outcome, campaignResultRef: recovered.campaign.ref,
        receiptRef: recovered.receipts[0]?.ref ?? null, recoveredFromCommittedBundle: true, summary: { ...recovered, receipts: [], redelivered: false } });
      return recovered;
    }
    predecessor = (state?.data.receiptRef as Ref | undefined) ?? null;
    attemptNumber = Number(existing.data.attemptNumber ?? 1) + 1;
  }
  if (request.limits.costCeilingCents < bundle.estimatedCostCents) throw new Blocked([{ code: 'insufficient_budget_headroom', detail: `estimate ${bundle.estimatedCostCents} > ceiling ${request.limits.costCeilingCents}` }]);

  const executionId = qualification?.admission.attempts[0]!.executionId ?? regressionExecutionId ?? newId('exec');
  const attemptId = qualification?.admission.attempts[0]!.attemptId ?? (regression ? `regression_attempt_${regression.admission.ref.digest.hex}` : newId('attempt'));
  if (qualification && ledger.current(`execution:${executionId}`)) throw new Conflict('qualification allocation was already claimed; reconcile its execution');
  const generation = 1;
  const executionDir = join(stateDir, 'executions', executionId);
  mkdirSync(join(stateDir, 'executions'), { recursive: true });
  mkdirSync(executionDir, { recursive: !qualification && !regression });
  const executionAggregate = qualification ? idemAggregate : `execution:${executionId}`;
  const reservation = parseAs(BudgetReservation, freeze({
    schemaVersion: 'workflow.budget-reservation/v1' as const, ref: { id: `${executionId}.reservation`, revision: '1' }, scope,
    campaignId: request.campaignId, executionId, attemptId, actionCents: request.limits.costCeilingCents, cleanupCents: 0, uncertainCents: 0, state: 'reserved' as const, reservedAt: nowIso(),
  }), 'budget reservation');
  ledger.append(executionAggregate, 0, 'admitted', { requestDigest: request.ref.digest.hex, idempotencyKey: request.idempotencyKey, executionId, attemptId, generation, attemptNumber, reservation: reservation.ref,
    ...(qualification ? { stateDir: resolve(stateDir), qualificationRoundRef: qualification.admission.ref } : {}),
    ...(regression ? { regressionAdmissionRef: regression.admission.ref } : {}) });
  if (!qualification) ledger.append(idemAggregate, existing ? existing.version : 0, 'bound', { executionId, attemptNumber });
  const ownership = new ExecutionOwnership(ledger, { executionId, attemptId, generation, campaignId: request.campaignId, requestDigest: request.ref.digest.hex, scope });
  ownership.initialize();
  const artifacts = new LocalArtifactStore(join(stateDir, 'artifacts'));
  const campaignDeadline = Deadline.in(request.limits.deadlineMs);
  const receipts: ExecutionReceipt[] = [];
  const hosts = options.hosts;
  let phaseVersion = ledger.version(executionAggregate);

  for (const item of prepared) {
    const allocation = qualification?.admission.attempts.find(a => a.selectionCellId === item.cell.selectionCellId);
    const beforeEffect = qualification && options.qualification ? async () => {
      try { await authorizeQualificationExecution(options.qualification!, request, selection, ledger, item.cell.selectionCellId); }
      catch { throw new HttpStepError('qualification_authority_unavailable', 'Qualification registration, source, state or effect authority is no longer current'); }
    } : regression && options.regression ? async () => {
      try { await authorizeRegressionExecution(options.regression!, request, selection, ledger, item.cell.selectionCellId); }
      catch { throw new HttpStepError('regression_authority_unavailable', 'Active scenario, source, state or effect authority is no longer current'); }
    } : undefined;
    const receipt = await runCell({ item, request, selection, fidelityPlan, campaignFixturePlan, intelligencePolicy, docs, scope,
      executionId: allocation?.executionId ?? executionId, attemptId: allocation?.attemptId ?? attemptId,
      generation, attemptNumber, predecessor, reservation, campaignDeadline, signal, artifacts, ownership, executionDir, hosts, bundle, onEvent: options.onEvent, beforeEffect });
    receipts.push(receipt);
    phaseVersion = ledger.append(executionAggregate, phaseVersion, 'cell.finalized', { selectionCellId: item.cell.selectionCellId, outcome: receipt.outcome, receiptRef: receipt.ref }).version;
  }
  const campaign = reduceCampaign({ scope, campaignId: request.campaignId, requestRef: request.ref, selection, receipts });
  writeExecutionBundle({ dir: executionDir, bundle, request, selection, receipts, campaign });
  const summary: RunSummary = {
    executionId, attemptId, generation, campaignId: request.campaignId, outcome: campaign.outcome, exitCode: EXIT_CODES[campaign.outcome],
    reasonCodes: [...new Set(receipts.flatMap((r) => r.reasonCodes))], receipts, campaign, executionDir, redelivered: false,
  };
  ledger.append(executionAggregate, phaseVersion, 'finalized', { outcome: campaign.outcome, campaignResultRef: campaign.ref, receiptRef: receipts[0]?.ref ?? null, summary: { ...summary, receipts: [], campaign } });
  return summary;
}

type CellContext = {
  item: PreparedCell; request: NonNullable<FrozenBundle['request']>; selection: SelectionManifest; fidelityPlan: FidelityPlan;
  campaignFixturePlan: CampaignFixturePlan | null; intelligencePolicy: IntelligencePolicy; docs: DocStore; scope: Scope;
  executionId: string; attemptId: string; generation: number; attemptNumber: number; predecessor: Ref | null; reservation: BudgetReservation;
  campaignDeadline: Deadline; signal: AbortSignal; artifacts: LocalArtifactStore; ownership: ExecutionOwnership; executionDir: string;
  hosts: HostOverrides | undefined; bundle: FrozenBundle; onEvent?: RunOptions['onEvent'];
  beforeEffect?: (() => Promise<void>) | undefined;
};

async function runCell(ctx: CellContext): Promise<ExecutionReceipt> {
  const { item, request, scope, executionId, attemptId, generation, signal } = ctx;
  const { spec, compiled, cell, hostPlan, environmentPlan, authRecipe, fidelityCell } = item;
  const log = new EventLog(executionId, attemptId, generation, (event) => ctx.onEvent?.({ kind: event.kind, stepId: event.stepId, redactedPayload: event.redactedPayload, at: event.at }));
  const startedAt = nowIso();
  const cellDeadline = ctx.campaignDeadline.child(spec.limits.deadlineMs);
  const blockedReasons: string[] = [];
  const beforeEffect = async () => {
    try { await ctx.beforeEffect?.(); }
    catch (error) {
      if (error instanceof HttpStepError && ['qualification_authority_unavailable', 'regression_authority_unavailable'].includes(error.code)) {
        blockedReasons.push(error.code); log.emit('effect.authority_unavailable', null, { code: error.code });
      }
      throw error;
    }
  };
  const stepObservations: StepObservation[] = [];
  let session: HostSession | null = null;
  let fixtureManifest: FixtureManifest | null = null;
  let fixtureState: 'verified' | 'failed' | 'blocked' | 'cancelled' | 'unknown' | 'not_required' = item.fixture ? 'unknown' : 'not_required';
  let infrastructureFailure = false;
  let cancelled = false;
  const allocated: AllocatedFixture[] = [];
  const uncertainAllocations = new Set<string>();
  const fixtureOutputs: Record<string, Record<string, unknown>> = {};
  const hostStartedMs = monotonicMs();
  log.emit('cell.started', null, { selectionCellId: cell.selectionCellId, caseId: spec.ref.id, caseDigest: spec.ref.digest.hex, lane: fidelityCell.lane });

  const credentialNames = [...new Set([...(authRecipe.credentialName ? [authRecipe.credentialName] : []), ...compiled.credentialNames])];
  const workspaceDir = join(ctx.executionDir, 'host', cell.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_'));
  const hostOwnershipKey = `host:${cell.selectionCellId}`;
  ctx.ownership.reserve(hostOwnershipKey, 'host', cell.selectionCellId, hostPlan.ref);
  mkdirSync(workspaceDir, { recursive: true });
  const mockResponses = hostPlan.mockResponsesRef ? ctx.docs.get<MockResponses>(MockResponses, hostPlan.mockResponsesRef, 'mock responses') : null;
  try {
    await beforeEffect();
    const host = await hostFor(hostPlan.adapter, ctx.hosts);
    session = await host.start({ hostPlan, projectRoot: ctx.bundle.projectRoot, workspaceDir, scope, campaignId: request.campaignId, executionId, attemptId, generation, actorId: ownerFor(scope), credentialNames, signal, mockResponses });
    ctx.ownership.observed(hostOwnershipKey, session.ownedResources.map(r => r.physicalId));
    log.emit('host.started', null, { adapter: hostPlan.adapter, origin: session.origin, leaseRef: session.lease.ref, observationRef: session.observation.ref, attestations: session.attestations.map((a) => a.ref) });
    // Every request the app served, attributed to the step that was running when it arrived.
    session.traffic?.subscribe(({ stepId, ...request }) => { log.emit('app.request', stepId, { ...request, phase: stepId ? 'step' : 'setup' }); });
  } catch (error) {
    if (error instanceof Blocked) {
      blockedReasons.push(...error.reasons.map((r) => r.code));
      log.emit('host.blocked', null, { reasons: error.reasons.map(r => ({ code: r.code, detail: r.detail, owner: r.owner, action: r.action })) });
    }
    else { infrastructureFailure = true; log.emit('host.failed', null, { error: String((error as Error).message), code: error instanceof InfrastructureFailure ? error.code : 'infrastructure' }); }
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
    issuedBy: session ? (hostPlan.adapter === 'mock_loopback' || hostPlan.adapter === 'url' ? 'environment' as const : 'local_launcher' as const) : 'none' as const, expiresAt: isoPlusMs(hostPlan.sessionLifetimeMs),
    ...(session?.credentialRecords?.length ? { resolved: session.credentialRecords.map(r => ({ ...r, resolver: r.resolver as never })) } : {}),
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

  const admittedOrigins = session ? new Set([session.origin, ...Object.values(session.endpoints ?? {})]) : new Set<string>();
  const driver = session ? new HttpDriver(sessionCredentials(session, authRecipe.credentialName), admittedOrigins, { maxRequests: session.requestBudget ?? null, allowedMethods: session.allowedMethods ?? null }) : null;
  // Cleanup is never refused by the request budget: owned records must be removable.
  const cleanupDriver = session ? new HttpDriver(sessionCredentials(session, authRecipe.credentialName), admittedOrigins) : null;
  /** A 401 from a deployment may mean the issuer expired or revoked the persona mid-run; ask the issuer before blaming the app. */
  const credentialStillLive = async (status: number, auth: { kind: string; name?: string }) => {
    if (status !== 401 || auth.kind === 'none' || !session?.credentialCheck) return;
    const name = auth.kind === 'persona' ? authRecipe.credentialName : auth.name ?? null;
    const state = name ? await session.credentialCheck(name, signal) : 'unknown';
    if (state === 'expired' || state === 'revoked') throw new HttpStepError('persona_credential_expired', `${name} was ${state} by its issuer mid-run; the 401 says nothing about the app`);
  };
  if (session?.credentialRecords?.length) log.emit('credentials.resolved', null, { personas: session.credentialRecords });
  const origin = session?.origin ?? '';
  const browser = new CaseBrowserSession({ origin, spec, persona: item.persona, bearer: credentialFor(session, authRecipe.credentialName)?.bearer?.reveal() ?? null,
    onNetwork: observation => { log.emit('browser.network', null, observation); },
  });
  const runtimeVariables: Record<string, unknown> = { execution_nonce: attemptId, lease_namespace: cell.selectionCellId, target_origin: origin };

  // ---- preparing: fixtures through registered actions with independent readback ----
  if (item.fixture && session && driver && !infrastructureFailure && blockedReasons.length === 0) {
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
        await beforeEffect();
        ctx.ownership.reserve(`fixture:${cell.selectionCellId}:${entityKey}`, 'fixture', cell.selectionCellId, recipe.ref);
        uncertainAllocations.add(entityKey);
        const observation = await driver.request({ origin, method: action.method, path: action.path, body: action.body, auth: action.auth, variables, deadline: cellDeadline.child(10_000), signal });
        await credentialStillLive(observation.status, action.auth);
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
        // Keep the observed cleanup handle in memory before any fallible acknowledgement/export callback.
        allocated.push({ entityKey, physicalId, cleanup: cleanupHandle, absence: entity.cleanup ? entity.cleanup.absenceReadback : null });
        ctx.ownership.observed(`fixture:${cell.selectionCellId}:${entityKey}`, [physicalId]);
        const allocatedEvent = log.emit('fixture.allocated', null, { entityKey, physicalId, status: observation.status, requestId: observation.requestId, cleanupHandle }, { requestId: observation.requestId });
        uncertainAllocations.delete(entityKey);
        let readbackRefs: Ref[] = [];
        if (entity.readback) {
          const readAction = registry.actions.find((a) => a.actionId === entity.readback!.actionId)!;
          const readback = await driver.request({ origin, method: readAction.method, path: readAction.path, body: readAction.body, auth: readAction.auth, variables: { ...variables, ...outputs }, deadline: cellDeadline.child(10_000), signal });
          await credentialStillLive(readback.status, readAction.auth);
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
        if (ENVIRONMENT_BLOCKS.has(code)) blockedReasons.push(code);
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
  let integrationOperations = 0;
  let uncertainOperations = 0;
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
    session?.traffic?.setStep(stepId);
    const startEvent = log.emit('step.started', stepId, { kind: step.kind, variables: Object.fromEntries(Object.entries(variables).filter(([k]) => step.inputs[k]?.kind !== 'credential')) });
    const deadline = cellDeadline.child(step.timeoutMs);
    try {
      let observation: HttpObservation | BrowserObservation | NativeJobObservation | McpToolObservation | ConversationObservation;
      await beforeEffect();
      if (step.kind === 'http.request') {
        observation = await driver!.request({ origin, method: step.method, path: step.path, headers: step.headers, body: step.body, auth: step.auth, variables, deadline, signal });
        await credentialStillLive(observation.status, step.auth);
        if (step.expectStatus !== null && observation.status !== step.expectStatus) {
          const finished = log.emit('step.finished', stepId, { result: 'failed', reason: 'unexpected_status', observation: redactObservation(observation) }, { requestId: observation.requestId });
          stepObservations.push({ stepId, result: 'failed', reasonCode: `unexpected_status:${observation.status}`, eventIds: [startEvent.eventId, finished.eventId], evidenceRefs: [EventLog.refOf(finished)], inputDigest, outputDigest: digestOfValue(redactObservation(observation)), output: redactObservation(observation), timing: { startedAt: stepStart, finishedAt: nowIso(), durationMs: observation.durationMs } });
          halted = true;
          continue;
        }
        captured[stepId] = captureValues(observation, step.captures);
      } else if (step.kind === 'observe') {
        observation = await driver!.observe({ origin, method: step.readback.method, path: step.readback.path, auth: step.readback.auth, variables, deadline, signal }, step.predicate, step.pollIntervalMs);
        await credentialStillLive(observation.status, step.readback.auth);
        captured[stepId] = captureValues(observation, step.captures);
      } else if (step.kind === 'mcp.call') {
        if (!spec.effects.allowedHosts.includes(`launch://${hostPlan.launch?.componentId}`)) throw new HttpStepError('mcp_origin_not_admitted', 'MCP application origin is outside the frozen effect envelope');
        const command = McpToolCall.parse({ ...step.command, arguments: applyTemplateDeep(step.command.arguments, variables) });
        const credential = bearerFor(step, sessionCredentials(session, authRecipe.credentialName));
        let module: typeof import('../adapters/mcp/driver.ts');
        try { module = await import('../adapters/mcp/driver.ts'); }
        catch { throw new HttpStepError('mcp_driver_unavailable', 'Install the pinned optional MCP SDK before planning this flow'); }
        integrationOperations++;
        uncertainOperations++;
        observation = await new module.McpDriver(origin).call(command, credential, deadline, signal);
        if (!observation.isError) {
          uncertainOperations--;
          captured[stepId] = captureValues({ body: observation }, step.captures);
        }
      } else if (step.kind === 'conversation.run') {
        const command = ConversationRun.parse({ ...step.command, turns: applyTemplateDeep(step.command.turns, variables) });
        const credential = bearerFor(step, sessionCredentials(session, authRecipe.credentialName));
        const { ConversationDriver } = await import('../adapters/conversation/driver.ts');
        integrationOperations++;
        uncertainOperations++;
        observation = await new ConversationDriver(origin).run(command, credential, deadline, signal);
        uncertainOperations--;
        captured[stepId] = captureValues({ body: observation }, step.captures);
      } else if (step.kind === 'job.submit' || step.kind === 'job.observe' || step.kind === 'job.cancel') {
        if (!session?.nativeJobs) throw new NativeJobError('native_job_unavailable', 'The host did not establish a native job channel');
        const command = NativeJobAction.parse(applyTemplateDeep(step.command, variables));
        const credential = bearerFor(step, sessionCredentials(session, authRecipe.credentialName));
        observation = step.kind === 'job.observe' && command.action === 'read'
          ? await session.nativeJobs.observe(command, credential, step.predicate, step.pollIntervalMs, deadline, signal)
          : await session.nativeJobs.request(command, credential, deadline, signal);
        captured[stepId] = captureValues({ body: observation }, step.captures);
      } else if (step.kind === 'ui.navigate' || step.kind === 'ui.action' || step.kind === 'ui.observe') {
        if (authRecipe.credentialName && !credentialFor(session, authRecipe.credentialName)) throw new HttpStepError('missing_persona_credential', 'browser persona credential was not issued');
        observation = await browser.execute(step, variables, deadline, signal);
      } else {
        throw new HttpStepError('unsupported_operation', `${step.kind} is not implemented by the HTTP runner`);
      }
      const output = 'requestId' in observation ? redactObservation(observation) : observation;
      const toolError = 'kind' in observation && observation.kind === 'mcp_tool' && observation.isError;
      const result = toolError ? 'failed' as const : 'completed' as const;
      const finished = log.emit('step.finished', stepId, { result, observation: output }, { requestId: 'requestId' in observation ? observation.requestId : null });
      stepObservations.push({ stepId, result, reasonCode: toolError ? 'mcp_tool_error' : null, eventIds: [startEvent.eventId, finished.eventId], evidenceRefs: [EventLog.refOf(finished)], inputDigest, outputDigest: digestOfValue(output), output, timing: { startedAt: stepStart, finishedAt: nowIso(), durationMs: monotonicMs() - stepStartedMs } });
      if (toolError) halted = true;
    } catch (error) {
      const rawCode = error instanceof HttpStepError || error instanceof BrowserStepError || error instanceof NativeJobError ? error.code : 'transport_failure';
      const code = rawCode === 'browser_cancelled' ? 'cancelled' : rawCode;
      const finished = log.emit('step.finished', stepId, { result: code === 'cancelled' ? 'cancelled' : 'failed', reason: code, message: String((error as Error).message) });
      if (code === 'cancelled' || code === 'browser_cancelled') cancelled = true;
      else if (isInfrastructureStepFailure(code)) infrastructureFailure = true;
      if (ENVIRONMENT_BLOCKS.has(code)) blockedReasons.push(code);
      stepObservations.push({ stepId, result: code === 'cancelled' ? 'cancelled' : 'failed', reasonCode: code, eventIds: [startEvent.eventId, finished.eventId], evidenceRefs: [EventLog.refOf(finished)], inputDigest, outputDigest: null, output: null, timing: { startedAt: stepStart, finishedAt: nowIso(), durationMs: 0 } });
      halted = true;
    }
  }

  session?.traffic?.setStep(null);
  if (session?.traffic) log.emit('app.traffic', null, session.traffic.seal());

  // ---- collecting: boundary observations ----
  const boundaryObservations: BoundaryObservation[] = fidelityCell.boundaries.map((rule) => {
    let observedMode: BoundaryObservation['observedMode'] = 'unknown';
    let accountClass: BoundaryObservation['observedAccountClass'] = 'unknown';
    if (session) {
      if (rule.boundaryId === 'application') { observedMode = session.boundaryMode; accountClass = session.accountClass ?? (session.boundaryMode === 'real' ? 'local' : 'none'); }
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
  } catch (error) {
    // Preserve bounded driver facts without serializing arbitrary exception messages.
    const cause = error instanceof BrowserStepError && ['video_final_frame_unavailable', 'video_empty', 'browser_network_metadata_limit'].includes(error.code) ? error.code : null;
    const phase = error instanceof BrowserStepError && ['capture', 'frame', 'flush'].includes(error.phase ?? '') ? error.phase : null;
    infrastructureFailure = true; log.emit('browser.failed', null, { code: 'browser_evidence_collection_failed', cause, phase });
  }

  // ---- cleaning: owned fixtures in reverse order, then the host; a cleanup deadline is reserved ----
  // Journal failure must never prevent best-effort cleanup of already acquired resources.
  let ownershipWriteError: unknown;
  try {
    if (session) ctx.ownership.cleaning(hostOwnershipKey);
    for (const entry of allocated) ctx.ownership.cleaning(`fixture:${cell.selectionCellId}:${entry.entityKey}`);
  } catch (error) { ownershipWriteError = error; }
  const { cleanup, criticalCleanupConfirmed, confirmedFixtureKeys, hostCleanupConfirmed } = await collectCleanup({ allocated,
    uncertainAllocations: uncertainAllocations.size, uncertainOperations, registry: item.fixture?.registry ?? null,
    driver: cleanupDriver, origin, deadline: cleanupDeadline, session, reason: cancelled ? 'cancelled' : 'cell complete', log });
  if (!ownershipWriteError) {
    if (session && hostCleanupConfirmed) ctx.ownership.removed(hostOwnershipKey);
    for (const entry of allocated) if (confirmedFixtureKeys.includes(entry.entityKey)) ctx.ownership.removed(`fixture:${cell.selectionCellId}:${entry.entityKey}`);
  }
  if (ownershipWriteError) throw ownershipWriteError;
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
  const reduction = reduceCell({ spec, expectedStepIds: compiled.orderedStepIds, steps: stepObservations, assertions, cancelled, fixtureState, identityMatched, fidelityMatched, requiredCapabilitiesObserved, artifactsVerified, unknownMutations: cleanup.remainingUnknownMutations, criticalCleanupConfirmed, infrastructureFailure, blockedReasons, environmentClass: environmentPlan.class });
  const routing = parseAs(RoutingDecision, freeze({
    schemaVersion: 'workflow.routing-decision/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.routing`, revision: '1' }, scope,
    owner: { kind: 'attempt' as const, campaignId: request.campaignId, executionId, attemptId }, stage: 'replay' as const, inputDigest: spec.ref.digest,
    intelligencePolicyRef: ctx.intelligencePolicy.ref, catalogRef: null, candidates: [], selected: null,
    estimate: { amountCents: 0, unknownReason: null }, budgetReservationRef: ctx.reservation.ref, escalationReason: 'known case replay performs no authoring inference', decidedAt: nowIso(),
  }), 'routing decision');
  const { accounting, performance, costs } = summarizeAttemptUsage({
    owner: { kind: 'attempt', campaignId: request.campaignId, executionId, attemptId }, scope, cellId: cell.selectionCellId,
    runnerSeconds: hostSeconds, browserSeconds: browser.seconds, integrationOperations, hostAdapter: hostPlan.adapter,
    steps: stepObservations, stepKinds: new Map([...compiled.stepsById].map(([id, step]) => [id, step.kind])), artifacts: allArtifacts,
    reservation: ctx.reservation, routingRef: routing.ref, observedAt: nowIso(),
  });
  const receipt = parseAs(ExecutionReceipt, freeze({
    schemaVersion: 'workflow.execution/v1' as const, ref: { id: `${executionId}.${cell.selectionCellId}.receipt`, revision: '1' },
    executionId, campaignId: request.campaignId, attemptId, attemptNumber: ctx.attemptNumber, predecessorAttemptRef: ctx.predecessor, retryReason: ctx.predecessor ? 'redelivery after interrupted attempt' : null,
    scope, requesterId: ownerFor(scope), caseRef: spec.ref, personaRef: item.persona.ref, surfaceBindingRef: item.binding.ref, variantRef: null,
    executionHostRef: hostPlan.ref, hostLeaseRef: session?.lease.ref ?? { id: `${executionId}.host-lease.unissued`, revision: '0', digest: digestOfValue('unissued') }, hostObservationRefs: session ? [session.observation.ref] : [],
    environment, idempotencyKey: request.idempotencyKey, requestRef: request.ref, selectionCellId: cell.selectionCellId, qualificationRoundRef: request.qualificationRoundRef,
    fixtureManifestRef: fixtureManifest?.ref ?? null, boundaryObservationRefs: boundaryObservations.map((b) => b.ref), proofClaim: spec.proofClaim,
    coverage: reduction.coverage, eventsDigest: eventsArtifact.ref.digest, assertions, steps: stepObservations, artifacts: allArtifacts, accounting,
    performance,
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
