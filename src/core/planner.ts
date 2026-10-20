/**
 * `plan`: resolve a mutable profile/suite choice into an immutable, fully resolved request.
 * Side-effect free. Returns frozen selection/fidelity/fixture/request documents plus every
 * blocker with owner and action. A blocked plan produces no executable request.
 */
import { createHash } from 'node:crypto';
import {
  ActionRegistry, AuthRecipe, CampaignFixturePlan, CaseFixturePlan, CaseSpec, ComponentProfile, EffectiveConfig,
  EnvironmentPlan, FidelityPlan, FidelityProfile, HostPlan, IntelligencePolicy, LogicalPayload, Persona,
  RunRequest, RunnerProfile, SeedRecipe, SelectionManifest, SurfaceBinding, SurfacePack, SourceSelection, digestOfValue, freeze,
  parseAs, refKey, sameDigest, type Ref, type Scope, type TargetTuple,
} from '../protocol/index.ts';
import { runnerCapabilitiesFor } from './runnerCapabilities.ts';
export { runnerCapabilitiesFor } from './runnerCapabilities.ts';
import { compileCase } from './compiler.ts';
import { cleanupActionError } from './cleanupActions.ts';
import { mcpSdkAvailable } from '../adapters/mcp/capabilities.ts';
import { Blocked } from './errors.ts';
import { capabilityGap } from './capabilities.ts';
import { materializeLogicalPayload } from './generators.ts';
import { REDUCER_REF } from './reducer.ts';
import { snapshotRepository } from './snapshotRepository.ts';
import { repositorySelectionProblems } from './repositorySelectionEvidence.ts';
import type { LoadedProject } from './corpus.ts';
import { newId } from './clock.ts';

import type { Blocker, FrozenBundle } from './frozenBundle.ts';
export { FrozenBundle } from './frozenBundle.ts';
export type { Blocker } from './frozenBundle.ts';

export type PlanInput = { project: LoadedProject; profileName: string; scope: Scope; purpose?: RunRequest['purpose']; workBinding?: RunRequest['workBinding'] };

/** What a case would write: non-read HTTP verbs, owned fixtures, tool calls, jobs and browser actions. */
export function caseWrites(spec: CaseSpec): string[] {
  const writes = new Set<string>();
  for (const step of spec.steps) {
    if (step.kind === 'http.request' && step.method !== 'GET' && step.method !== 'HEAD') writes.add(step.method);
    if (step.kind === 'mcp.call') writes.add('mcp.call');
    if (step.kind === 'conversation.run') writes.add('conversation.run');
    if (step.kind.startsWith('job.')) writes.add(step.kind);
    if (step.kind === 'ui.action') writes.add('ui.action');
  }
  if (spec.fixturePlanRef) writes.add('owned fixtures');
  return [...writes];
}
/** Upper-bound request estimate: one per step, four per fixture entity, plus readback polling slack. */
function estimatedRequests(spec: CaseSpec): number {
  return spec.steps.reduce((n, step) => n + (step.kind === 'observe' ? 5 : 1), 0) + (spec.fixturePlanRef ? 8 : 0);
}

function cellId(caseId: string, personaId: string): string {
  return `${caseId}__${personaId}`.replace(/[^A-Za-z0-9._:/-]/g, '_');
}

export function plan(input: PlanInput): FrozenBundle {
  const { project, profileName, scope } = input;
  const workBinding = RunRequest.shape.workBinding.parse(input.workBinding ?? null);
  const corpus = project.corpus;
  const blockers: Blocker[] = [];
  const documents: Record<string, unknown> = {};
  const keep = (doc: { ref: Ref }) => { documents[refKey(doc.ref)] = doc; };
  for (const doc of corpus.documents()) documents[refKey(doc.ref)] = doc.value;
  keep(corpus.manifest);

  const profile = project.config.profiles[profileName];
  if (!profile) throw new Blocked([{ code: 'unknown_profile', detail: profileName, owner: 'operator', action: `choose one of ${Object.keys(project.config.profiles).join(', ')}` }]);
  const fileRef = (rel: string) => {
    const ref = project.fileRefs.get(rel);
    if (!ref) throw new Blocked([{ code: 'unresolved_config_file', detail: rel }]);
    return ref;
  };
  const environmentPlan = corpus.getAs(EnvironmentPlan, fileRef(profile.environmentPlanRef));
  const persona = corpus.getAs(Persona, fileRef(profile.personaRef));
  const authRecipe = corpus.getAs(AuthRecipe, persona.authRecipeRef);
  const fidelityProfile = corpus.getAs(FidelityProfile, fileRef(profile.fidelityProfileRef));
  const runnerProfile = corpus.getAs(RunnerProfile, fileRef(profile.runnerRef));
  const hostPlan = corpus.getAs(HostPlan, fileRef(profile.hostPlanRef ?? project.config.executionHostRef));
  const intelligencePolicy = corpus.getAs(IntelligencePolicy, fileRef(project.config.intelligencePolicyRef));
  const componentProfile = corpus.getAs(ComponentProfile, environmentPlan.componentProfileRef);
  const capabilities = runnerCapabilitiesFor(runnerProfile);
  const sourceSelection = project.config.sourceSelectionRef ? corpus.getAs(SourceSelection, fileRef(project.config.sourceSelectionRef)) : null;
  void authRecipe;

  if (environmentPlan.class !== profile.class) {
    blockers.push({ code: 'environment_class_mismatch', detail: `profile ${profileName} declares ${profile.class}; environment plan ${environmentPlan.ref.id} is ${environmentPlan.class}`, owner: 'operator', action: 'align the profile and environment plan', cellId: null });
  }
  if (hostPlan.adapter === 'local_process' && !hostPlan.launch) {
    blockers.push({ code: 'host_launch_missing', detail: hostPlan.ref.id, owner: 'operator', action: 'declare a launch recipe or bind an existing target', cellId: null });
  }
  if ((hostPlan.adapter === 'url' || hostPlan.adapter === 'compose' || hostPlan.adapter === 'container') && hostPlan.binding?.kind !== hostPlan.adapter) {
    blockers.push({ code: 'host_binding_missing', detail: `${hostPlan.ref.id} is a ${hostPlan.adapter} host without a matching target binding`, owner: 'developer', action: 'compile the project with --env <environment>', cellId: null });
  }
  if (hostPlan.adapter === 'mock_loopback' && !hostPlan.mockResponsesRef) {
    blockers.push({ code: 'mock_responses_missing', detail: hostPlan.ref.id, owner: 'operator', action: 'declare mock responses for the loopback host', cellId: null });
  }
  if (hostPlan.adapter === 'mock_loopback' && fidelityProfile.lane !== 'mock_contract') {
    blockers.push({ code: 'mock_host_with_live_lane', detail: `${hostPlan.ref.id} cannot satisfy lane ${fidelityProfile.lane}`, owner: 'operator', action: 'use a live host for a live lane', cellId: null });
  }

  const expectedTarget: TargetTuple = {
    componentProfileRef: componentProfile.ref,
    requiredComponents: componentProfile.components.filter((c) => c.required).map((c) => c.componentId),
    excludedComponents: componentProfile.components.filter((c) => !c.required).map((c) => ({ component: c.componentId, reason: c.exclusionReason ?? 'excluded by profile' })),
    components: componentProfile.components.map((c) => ({ componentId: c.componentId, kind: c.kind, identity: c.expectedIdentity })),
    repositories: hostPlan.launch?.sourceSnapshot?.repositoryRole ? [snapshotRepository(hostPlan.launch.sourceSnapshot)] : [],
    corpus: corpus.manifest.ref,
    runner: capabilities.ref,
    evaluator: REDUCER_REF,
    frontendRelease: null, backendRelease: null, workerRelease: null,
    schemaFingerprint: null, featureFlagsDigest: null, capabilityVersionsDigest: null,
    browserVersion: null, containerImageDigest: null, modelConfigDigest: null,
  };

  const cells: SelectionManifest['cells'] = [];
  const excludedCells: Array<{ cellKey: string; reason: string }> = [];
  const fidelityCells: FidelityPlan['cells'] = [];
  const fixtureCells: CampaignFixturePlan['cells'] = [];
  const caseRefs: Ref[] = [];
  const requirements = new Set<string>();

  for (const entry of project.suiteCases) {
    const spec = corpus.getAs(CaseSpec, entry.ref);
    const suiteEntry = project.suite.cases.find((c) => project.fileRefs.get(`./${['cases', c.caseRef.replace(/^\.\//, '')].join('/')}`)?.digest.hex === entry.ref.digest.hex) ?? null;
    const applicable = suiteEntry?.profiles ? suiteEntry.profiles.includes(profileName) : true;
    const id = cellId(spec.ref.id, persona.ref.id);
    if (!applicable) { excludedCells.push({ cellKey: id, reason: `suite entry applies only to profiles ${suiteEntry?.profiles?.join(', ')}` }); continue; }
    const cellBlock = (code: string, detail: string, owner = 'case author', action = 'revise the case or choose a compatible profile') => blockers.push({ code, detail, owner, action, cellId: id });
    if (spec.steps.some(step => step.kind.startsWith('job.')) && (hostPlan.adapter !== 'local_process' || hostPlan.launch?.nativeJobs !== 'node_ipc/v1')) cellBlock('native_job_host_unavailable', 'Native jobs require an explicitly enabled local Node IPC host');
    if (spec.steps.some(step => step.kind === 'mcp.call')) {
      if (hostPlan.adapter !== 'local_process' || profile.class !== 'isolated_candidate') cellBlock('mcp_host_unqualified', 'MCP calls currently require an isolated local application host');
      if (!hostPlan.launch || !spec.effects.allowedHosts.includes(`launch://${hostPlan.launch.componentId}`)) cellBlock('mcp_origin_not_admitted', 'MCP effects must explicitly allow the launched application component');
      if (!mcpSdkAvailable()) cellBlock('mcp_sdk_missing', 'The pinned optional MCP SDK is unavailable', 'operator', 'install @modelcontextprotocol/sdk@1.32.1 before planning this MCP flow');
    }

    if (!spec.environmentClasses.includes(profile.class)) cellBlock('environment_class_not_applicable', `${spec.ref.id} does not apply to ${profile.class}`);
    const binding = corpus.getAs(SurfaceBinding, spec.surfaceBindingRef);
    const pack = corpus.getAs(SurfacePack, binding.packRef);
    for (const kind of new Set(spec.steps.map((s) => s.kind))) {
      if (!pack.stepKinds.includes(kind)) cellBlock('surface_pack_step_unsupported', `${spec.ref.id}: ${kind} not in pack ${pack.ref.id}`);
    }
    const advertised = new Set([...capabilities.operations, ...capabilities.fixtureOperations, ...capabilities.cleanupOperations]);
    for (const cap of [...spec.requiredCapabilities, ...binding.requiredCapabilities]) {
      if (!advertised.has(cap)) cellBlock('unwired_capability', `${spec.ref.id} requires ${cap}, which runner ${capabilities.ref.id} does not implement`, 'runner owner', 'add a conforming adapter or exclude the case explicitly');
    }
    const writes = caseWrites(spec);
    if (hostPlan.binding?.writes === 'none' && writes.length) cellBlock('environment_writes_forbidden', `${spec.ref.id} writes (${writes.join(', ')}) but environment ${hostPlan.binding.environment} allows no writes`, 'developer', `run only read-only flows in ${hostPlan.binding.environment}; see tracegrove explain --env ${hostPlan.binding.environment}`);
    if (hostPlan.binding?.budget && estimatedRequests(spec) > hostPlan.binding.budget.maxRequests) cellBlock('budget_exceeded', `${spec.ref.id} needs about ${estimatedRequests(spec)} requests; environment ${hostPlan.binding.environment} allows ${hostPlan.binding.budget.maxRequests}`, 'operator', 'raise budget.maxRequests or select fewer flows');
    for (const cap of new Set(spec.requiredCapabilities)) {
      const gap = capabilityGap(cap, hostPlan.adapter);
      if (gap) cellBlock('capability_not_provided_by_host', `${spec.ref.id}: ${gap}`, 'operator', 'choose an environment whose host provides it; run tracegrove capabilities');
    }
    for (const required of spec.requiredBoundaries) {
      const rule = fidelityProfile.boundaryRules.find((r) => r.boundaryId === required.boundaryId);
      if (!rule) cellBlock('fidelity_boundary_missing', `${spec.ref.id} requires boundary ${required.boundaryId}; profile ${fidelityProfile.ref.id} declares none`, 'operator', 'choose a fidelity profile that declares the boundary');
      else if (rule.mode !== required.mode) cellBlock('fidelity_mode_mismatch', `${spec.ref.id} requires ${required.boundaryId}=${required.mode}; profile ${fidelityProfile.ref.id} declares ${rule.mode}`, 'operator', 'a profile cannot downgrade a case requirement; choose a matching profile or a different case');
    }
    for (const method of new Set(spec.steps.flatMap((s) => (s.kind === 'http.request' ? [s.method] : s.kind === 'observe' ? [s.readback.method] : [])))) {
      if (!spec.effects.allowedMethods.includes(method)) cellBlock('effect_envelope_method', `${spec.ref.id} uses ${method} outside its envelope`);
    }
    for (const path of spec.steps.flatMap((s) => (s.kind === 'http.request' ? [s.path] : s.kind === 'observe' ? [s.readback.path] : []))) {
      if (!spec.effects.allowedResourcePrefixes.some((prefix) => path.startsWith(prefix))) cellBlock('effect_envelope_path', `${spec.ref.id} touches ${path} outside allowed prefixes`);
    }

    let recipe: SeedRecipe | null = null;
    let caseFixturePlan: CaseFixturePlan | null = null;
    if (spec.fixturePlanRef) {
      caseFixturePlan = corpus.getAs(CaseFixturePlan, spec.fixturePlanRef);
      recipe = corpus.getAs(SeedRecipe, caseFixturePlan.seedRecipeRef);
      const payload = corpus.getAs(LogicalPayload, caseFixturePlan.logicalPayloadRef);
      const regenerated = materializeLogicalPayload(recipe, payload.scope);
      if (!sameDigest(regenerated.ref.digest, payload.ref.digest)) cellBlock('stale_logical_payload', `${caseFixturePlan.logicalPayloadRef.id} no longer matches recipe ${recipe.ref.id}; rematerialize and review`, 'case author', 'run materialize-payload and review the diff');
      const registry = corpus.getAs(ActionRegistry, recipe.actionRegistryRef);
      for (const entity of recipe.entities) {
        const allocation = registry.actions.find(action => action.actionId === entity.actionId);
        if (allocation && allocation.effect !== 'create') cellBlock('fixture_ownership_unavailable',
          `${recipe.ref.id}.${entity.entityKey}: ${allocation.actionId} does not allocate an owned resource`,
          'case author', 'use a registered create action; borrowed resources require a separately qualified adapter');
        if (entity.cleanup) {
          const cleanup = entity.cleanup;
          const error = cleanupActionError(
            registry.actions.find(action => action.actionId === cleanup.actionId),
            registry.actions.find(action => action.actionId === cleanup.absenceReadback.actionId),
            cleanup.absenceReadback.expectStatus);
          if (error) cellBlock('fixture_cleanup_invalid', `${recipe.ref.id}.${entity.entityKey}: ${error}`,
            'case author', 'register a delete action and a GET/HEAD absence readback with status 404 or 410');
        }
        for (const actionId of [entity.actionId, entity.readback?.actionId, entity.cleanup?.actionId, entity.cleanup?.absenceReadback.actionId].filter((a): a is string => !!a)) {
          if (!registry.actions.some((a) => a.actionId === actionId)) cellBlock('unregistered_action', `${recipe.ref.id}.${entity.entityKey}: ${actionId}`);
        }
      }
      if (profile.fixturePlanRef && !sameDigest(fileRef(profile.fixturePlanRef).digest, caseFixturePlan.ref.digest)) cellBlock('fixture_plan_mismatch', `profile default fixture plan differs from ${spec.ref.id}'s own plan`, 'operator', 'remove the profile default or make it match');
    }
    try { compileCase(spec, capabilities, recipe); } catch (error) {
      if (error instanceof Blocked) for (const reason of error.reasons) blockers.push({ ...reason, cellId: id });
      else throw error;
    }
    for (const tag of spec.assertions.flatMap((a) => a.coverageTags)) requirements.add(tag);

    cells.push({
      selectionCellId: id, required: entry.required, caseRef: spec.ref, personaRef: persona.ref,
      surfaceBindingRef: binding.ref, variantRef: null, sourceSelectionRef: sourceSelection?.ref ?? null,
      environmentRef: environmentPlan.ref, expectedTarget, executionHostRef: hostPlan.ref,
    });
    caseRefs.push(spec.ref);
    fidelityCells.push({ selectionCellId: id, lane: fidelityProfile.lane, boundaryProfileRef: fidelityProfile.boundaryProfileRef, boundaries: fidelityProfile.boundaryRules, claimBoundaryIds: spec.requiredBoundaries.length > 0 ? spec.requiredBoundaries.map((b) => b.boundaryId) : fidelityProfile.boundaryRules.map((b) => b.boundaryId) });
    fixtureCells.push({ selectionCellId: id, caseFixturePlanRef: caseFixturePlan?.ref ?? null });
  }

  if (cells.filter((c) => c.required).length === 0) blockers.push({ code: 'empty_required_matrix', detail: `no required case applies to profile ${profileName}`, owner: 'operator', action: 'select a suite entry for this profile', cellId: null });

  const selection = parseAs(SelectionManifest, freeze({
    schemaVersion: 'workflow.selection/v1' as const,
    ref: { id: `${project.config.project}.selection.${profileName}`, revision: '1' },
    scope, policyRef: null, cells, excludedCells,
  }), 'selection');
  const fidelityPlan = parseAs(FidelityPlan, freeze({
    schemaVersion: 'workflow.fidelity-plan/v1' as const,
    ref: { id: `${selection.ref.id}.fidelity`, revision: '1' },
    scope, profileRef: fidelityProfile.ref, selectionManifestRef: selection.ref, cells: fidelityCells,
  }), 'fidelity plan');
  const anyFixture = fixtureCells.some((c) => c.caseFixturePlanRef);
  const fixturePlan = anyFixture ? parseAs(CampaignFixturePlan, freeze({
    schemaVersion: 'workflow.fixture-plan/v1' as const, kind: 'campaign' as const,
    ref: { id: `${selection.ref.id}.fixtures`, revision: '1' },
    scope, selectionManifestRef: selection.ref, cells: fixtureCells,
  }), 'campaign fixture plan') : null;
  const effectiveConfig = parseAs(EffectiveConfig, freeze({
    schemaVersion: 'workflow.effective-config/v1' as const,
    ref: { id: `${project.config.project}.effective-config.${profileName}`, revision: '1' },
    scope, projectId: project.config.project, profileName,
    configDigest: { algorithm: 'sha256' as const, hex: project.configDigest },
    corpusRef: corpus.manifest.ref, profile: profile as unknown, overrides: {},
  }), 'effective config');
  keep(selection); keep(fidelityPlan); if (fixturePlan) keep(fixturePlan); keep(effectiveConfig);

  const campaignId = newId('campaign');
  const idempotencyKey = `req_${createHash('sha256').update([campaignId, selection.ref.digest.hex, fidelityPlan.ref.digest.hex, fixturePlan?.ref.digest.hex ?? 'none', effectiveConfig.ref.digest.hex, hostPlan.ref.digest.hex, intelligencePolicy.ref.digest.hex].join('|')).digest('hex').slice(0, 32)}`;
  let request: RunRequest | null = null;
  if (blockers.length === 0) {
    request = parseAs(RunRequest, freeze({
      schemaVersion: 'workflow.request/v1' as const,
      ref: { id: `${project.config.project}.request.${profileName}`, revision: '1' },
      clientRequestId: newId('client'),
      idempotencyKey,
      requestedScope: scope,
      campaignId,
      purpose: input.purpose ?? 'trial',
      sourcePlanRef: null, reviewRef: null, scenarioRefs: [], qualificationRoundRef: null,
      effectiveConfigRef: effectiveConfig.ref,
      sourceSelectionRef: sourceSelection?.ref ?? null,
      executionHostRef: hostPlan.ref,
      intelligencePolicyRef: intelligencePolicy.ref,
      fidelityPlanRef: fidelityPlan.ref,
      fixturePlanRef: fixturePlan?.ref ?? null,
      caseRefs, personaRefs: [persona.ref],
      environmentRef: environmentPlan.ref,
      expectedTarget,
      selectionManifestRef: selection.ref,
      workBinding,
      limits: { deadlineMs: profile.budget.deadlineMs, maxProviderRequests: 0, maxTokens: 0, costCeilingCents: profile.budget.costCeilingCents, maxBrowserActions: 0, maxArtifactBytes: 64 * 1024 * 1024, diagnosticRetries: 0, concurrencyGroup: project.config.project },
      replayOf: null,
    }), 'run request');
    for (const cell of selection.cells) {
      const host = corpus.getAs(HostPlan, cell.executionHostRef);
      for (const detail of repositorySelectionProblems(request, cell, host, documents)) blockers.push({ code: 'repository_source_binding_invalid', detail, owner: 'operator', action: 'compile a complete pinned resolver-head selection', cellId: cell.selectionCellId });
    }
    if (blockers.length) request = null;
    else keep(request);
  }
  return {
    schemaVersion: 'workflow.frozen-request-bundle/v1',
    projectRoot: project.root,
    configPath: project.configPath,
    profileName,
    request,
    blockers,
    excludedCells,
    estimatedCostCents: 0,
    requirements: [...requirements].sort(),
    documents,
  };
}
