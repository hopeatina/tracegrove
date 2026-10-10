/**
 * Compilation freezes the complete ordered step set, the variable dependency graph and the
 * expected assertion instances for a case against a runner's advertised capabilities.
 * Cycles, duplicate IDs, unknown references, unsupported operations/oracles and oversize
 * flows reject admission before any effect. No prefix slicing.
 */
import type { Assertion, CaseSpec, RunnerCapabilities, SeedRecipe, Step, VariableSource } from '../protocol/index.ts';
import { Blocked } from './errors.ts';

export type CompiledCase = {
  caseId: string;
  orderedStepIds: string[];
  stepsById: Map<string, Step>;
  assertionsById: Map<string, Assertion>;
  /** Fixture outputs referenced by steps: entityKey -> outputName[] */
  fixtureInputs: Map<string, Set<string>>;
  credentialNames: Set<string>;
};

const TEMPLATE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function templateNames(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(TEMPLATE)) into.add(match[1] as string);
  } else if (Array.isArray(value)) {
    for (const item of value) templateNames(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) templateNames(item, into);
  }
}

export function compileCase(spec: CaseSpec, capabilities: RunnerCapabilities, recipe: SeedRecipe | null): CompiledCase {
  const reasons: Array<{ code: string; detail: string }> = [];
  const stepsById = new Map<string, Step>();
  const captureNames = new Map<string, Set<string>>();
  const fixtureInputs = new Map<string, Set<string>>();
  const credentialNames = new Set<string>();

  if (spec.steps.length > capabilities.maxStepsPerCase) {
    reasons.push({ code: 'step_limit_exceeded', detail: `${spec.steps.length} steps exceed runner ceiling ${capabilities.maxStepsPerCase}; no prefix execution` });
  }
  const supported = new Set(capabilities.operations);
  for (const step of spec.steps) {
    if (stepsById.has(step.id)) reasons.push({ code: 'duplicate_step_id', detail: step.id });
    stepsById.set(step.id, step);
    if (!supported.has(step.kind)) reasons.push({ code: 'unsupported_operation', detail: `${step.id}: ${step.kind} is not advertised by the runner` });
    const captures = new Set<string>();
    if ('captures' in step) for (const capture of step.captures) captures.add(capture.name);
    captureNames.set(step.id, captures);
  }
  const ordered = spec.steps.map((step) => step.id);
  // Variables must resolve from literals, fixture outputs, prior captures, credentials or runtime bindings.
  const seen = new Set<string>();
  for (const step of spec.steps) {
    const declared = new Set(Object.keys(step.inputs));
    const used = new Set<string>();
    if (step.kind === 'http.request') { templateNames(step.path, used); templateNames(step.body, used); templateNames(step.headers, used); }
    if (step.kind === 'observe') templateNames(step.readback.path, used);
    for (const name of used) if (!declared.has(name)) reasons.push({ code: 'undeclared_variable', detail: `${step.id} uses {${name}} without declaring it in inputs` });
    for (const [name, source] of Object.entries(step.inputs) as Array<[string, VariableSource]>) {
      switch (source.kind) {
        case 'capture': {
          if (!seen.has(source.stepId)) reasons.push({ code: 'capture_before_producer', detail: `${step.id}.${name} captures from ${source.stepId}, which is not an earlier step` });
          else if (!captureNames.get(source.stepId)?.has(source.name)) reasons.push({ code: 'unknown_capture', detail: `${step.id}.${name}: step ${source.stepId} declares no capture ${source.name}` });
          break;
        }
        case 'fixture': {
          if (!recipe) { reasons.push({ code: 'fixture_without_recipe', detail: `${step.id}.${name} needs fixture ${source.entityKey} but the case has no fixture plan` }); break; }
          const entity = recipe.entities.find((e) => e.entityKey === source.entityKey);
          if (!entity) reasons.push({ code: 'unknown_fixture_entity', detail: `${step.id}.${name}: ${source.entityKey}` });
          else if (!entity.outputNames.includes(source.outputName)) reasons.push({ code: 'unknown_fixture_output', detail: `${step.id}.${name}: ${source.entityKey}.${source.outputName}` });
          if (!fixtureInputs.has(source.entityKey)) fixtureInputs.set(source.entityKey, new Set());
          fixtureInputs.get(source.entityKey)!.add(source.outputName);
          break;
        }
        case 'credential': credentialNames.add(source.name); break;
        case 'literal':
        case 'runtime': break;
      }
    }
    seen.add(step.id);
  }
  const oracles = new Set(capabilities.oracles);
  const assertionsById = new Map<string, Assertion>();
  for (const assertion of [...spec.preconditions, ...spec.assertions]) {
    if (assertionsById.has(assertion.id)) reasons.push({ code: 'duplicate_assertion_id', detail: assertion.id });
    assertionsById.set(assertion.id, assertion);
    const oracleId = `${assertion.oracle.name}/${assertion.oracle.version}`;
    if (!oracles.has(oracleId)) reasons.push({ code: 'unsupported_oracle', detail: `${assertion.id}: ${oracleId}` });
    if (!stepsById.has(assertion.stepId)) reasons.push({ code: 'assertion_unknown_step', detail: `${assertion.id} -> ${assertion.stepId}` });
  }
  if (spec.assertions.filter((a) => a.required).length === 0) reasons.push({ code: 'no_required_assertion', detail: 'a case needs at least one required assertion' });
  if (reasons.length > 0) throw new Blocked(reasons.map((r) => ({ ...r, owner: 'case author', action: 'fix the case definition and review it again' })));
  return { caseId: spec.ref.id, orderedStepIds: ordered, stepsById, assertionsById, fixtureInputs, credentialNames };
}

export function applyTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(TEMPLATE, (_m, name: string) => {
    const value = variables[name];
    if (value === undefined) throw new Blocked([{ code: 'unresolved_variable', detail: name }]);
    return encodeURIComponent(String(value));
  });
}

export function applyTemplateDeep(value: unknown, variables: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const whole = value.match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    if (whole) {
      const v = variables[whole[1] as string];
      if (v === undefined) throw new Blocked([{ code: 'unresolved_variable', detail: whole[1] as string }]);
      return v;
    }
    return value.replace(TEMPLATE, (_m, name: string) => {
      const v = variables[name];
      if (v === undefined) throw new Blocked([{ code: 'unresolved_variable', detail: name }]);
      return String(v);
    });
  }
  if (Array.isArray(value)) return value.map((item) => applyTemplateDeep(item, variables));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = applyTemplateDeep(v, variables);
    return out;
  }
  return value;
}
