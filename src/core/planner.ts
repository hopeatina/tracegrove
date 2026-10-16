/**
 * `plan`: resolve a mutable profile/suite choice into an immutable, fully resolved request.
 * Side-effect free. Returns frozen selection/fidelity/fixture/request documents plus every
 * blocker with owner and action. A blocked plan produces no executable request.
 */
import { createHash } from 'node:crypto';
import {
  ActionRegistry, AuthRecipe, CampaignFixturePlan, CaseFixturePlan, CaseSpec, ComponentProfile, EffectiveConfig,
  EnvironmentPlan, FidelityPlan, FidelityProfile, HostPlan, IntelligencePolicy, LogicalPayload, Persona,
  RunRequest, RunnerProfile, SeedRecipe, SelectionManifest, SurfaceBinding, SurfacePack, digestOfValue, freeze,
  parseAs, refKey, sameDigest, type Ref, type Scope, type TargetTuple,
} from '../protocol/index.ts';
import { runnerCapabilitiesFor } from './runnerCapabilities.ts';
export { runnerCapabilitiesFor } from './runnerCapabilities.ts';
import { compileCase } from './compiler.ts';
import { cleanupActionError } from './cleanupActions.ts';
import { Blocked } from './errors.ts';
import { materializeLogicalPayload } from './generators.ts';
import { REDUCER_REF } from './reducer.ts';
import type { LoadedProject } from './corpus.ts';
import { newId } from './clock.ts';

export type Blocker = { code: string; detail: string; owner: string; action: string; cellId: string | null };

export type FrozenBundle = {
  schemaVersion: 'workflow.frozen-request-bundle/v1';
  projectRoot: string;
  configPath: string;
  profileName: string;
  request: RunRequest | null;
  blockers: Blocker[];
  excludedCells: Array<{ cellKey: string; reason: string }>;
  estimatedCostCents: number;
  requirements: string[];
  /** Every document the request's closure needs, keyed by refKey. */
  documents: Record<string, unknown>;
};

export type PlanInput = { project: LoadedProject; profileName: string; scope: Scope; purpose?: RunRequest['purpose'] };

function cellId(caseId: string, personaId: string): string {
  return `${caseId}__${personaId}`.replace(/[^A-Za-z0-9._:/-]/g, '_');
}

export function plan(input: PlanInput): FrozenBundle {
  const { project, profileName, scope } = input;
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
  void authRecipe;

  if (environmentPlan.class !== profile.class) {
    blockers.push({ code: 'environment_class_mismatch', detail: `profile ${profileName} declares ${profile.class}; environment plan ${environmentPlan.ref.id} is ${environmentPlan.class}`, owner: 'operator', action: 'align the profile and environment plan', cellId: null });
  }
  if (hostPlan.adapter === 'local_process' && !hostPlan.launch) {
    blockers.push({ code: 'host_launch_missing', detail: hostPlan.ref.id, owner: 'operator', action: 'declare a launch recipe or bind an existing target', cellId: null });
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
    repositories: [],
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
      surfaceBindingRef: binding.ref, variantRef: null, sourceSelectionRef: null,
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
      sourceSelectionRef: null,
      executionHostRef: hostPlan.ref,
      intelligencePolicyRef: intelligencePolicy.ref,
      fidelityPlanRef: fidelityPlan.ref,
      fixturePlanRef: fixturePlan?.ref ?? null,
      caseRefs, personaRefs: [persona.ref],
      environmentRef: environmentPlan.ref,
      expectedTarget,
      selectionManifestRef: selection.ref,
      workBinding: null,
      limits: { deadlineMs: profile.budget.deadlineMs, maxProviderRequests: 0, maxTokens: 0, costCeilingCents: profile.budget.costCeilingCents, maxBrowserActions: 0, maxArtifactBytes: 64 * 1024 * 1024, diagnosticRetries: 0, concurrencyGroup: project.config.project },
      replayOf: null,
    }), 'run request');
    keep(request);
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
