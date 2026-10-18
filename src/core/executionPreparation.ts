import { ActionRegistry, AuthRecipe, CampaignFixturePlan, CaseFixturePlan, CaseSpec, EnvironmentPlan, FidelityPlan,
  HostPlan, IntelligencePolicy, LogicalPayload, Persona, SeedRecipe, SelectionManifest, SurfaceBinding, digestOfValue,
  refKey, sameDigest, verifySelfDigest, type Ref, type Scope, type RunRequest, type RunnerCapabilities } from '../protocol/index.ts';
import { compileCase, type CompiledCase } from './compiler.ts';
import { Blocked } from './errors.ts';
import { frozenRunnerCapabilities } from './runnerCapabilities.ts';
import type { FrozenBundle } from './planner.ts';
import { repositorySelectionProblems } from './repositorySelectionEvidence.ts';

export class DocStore {
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

export type PreparedCell = {
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

export function checkedFrozenRequest(bundle: FrozenBundle, scope: Scope): RunRequest {
  if (!bundle.request) throw new Blocked(bundle.blockers.map((b) => ({ code: b.code, detail: b.detail, owner: b.owner, action: b.action })));
  const request = bundle.request;
  if (!verifySelfDigest(request)) throw new Blocked([{ code: 'request_digest_mismatch', detail: 'the frozen request was modified after planning', owner: 'operator', action: 'plan again' }]);
  if (digestOfValue(request.requestedScope).hex !== digestOfValue(scope).hex) {
    throw new Blocked([{ code: 'scope_mismatch', detail: 'request scope differs from the authenticated controller owner' }]);
  }
  return request;
}

/** Static executable closure preparation. No host, fixture, provider or effect is invoked. */
export function prepareFrozenCells(bundle: FrozenBundle, scope: Scope, request: RunRequest) {
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
    const sourceProblems = repositorySelectionProblems(request, cell, hostPlan, bundle.documents);
    if (sourceProblems.length) throw new Blocked(sourceProblems.map(detail => ({ code: 'repository_source_binding_invalid', detail })));
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

  return { docs, selection, fidelityPlan, campaignFixturePlan, intelligencePolicy, prepared };
}
