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
  if (spec.capture.video === 'required' && !capabilities.captureFormats.includes('video/webm')) reasons.push({ code: 'required_video_unsupported', detail: 'runner does not advertise video capture' });
  const browserSteps = spec.steps.filter(step => step.kind.startsWith('ui.'));
  const jobSteps = spec.steps.filter(step => step.kind === 'job.submit' || step.kind === 'job.observe' || step.kind === 'job.cancel');
  for (const rule of spec.capture.redact ?? []) {
    try { new RegExp(rule.pattern, 'g'); } catch { reasons.push({ code: 'redaction_pattern_invalid', detail: `${rule.name}: not a valid regular expression` }); }
  }
  const conversationSteps = spec.steps.filter(step => step.kind === 'conversation.run');
  if (conversationSteps.length > (spec.effects.maxConversations ?? 0)) reasons.push({ code: 'conversation_limit', detail: 'Conversations exceed the explicitly declared effect ceiling' });
  for (const step of conversationSteps) {
    if (spec.effects.mode !== 'designated_writes') reasons.push({ code: 'conversation_effect_not_admitted', detail: `${step.id}: a conversation can trigger agent tools, so it needs designated writes` });
    if (step.retry.attempts !== 1) reasons.push({ code: 'conversation_retry_unsupported', detail: `${step.id}: conversations run once; a retry could repeat agent side effects` });
    if (!spec.effects.allowedResourcePrefixes.some(prefix => step.command.endpoint === prefix || step.command.endpoint.startsWith(`${prefix}/`))) reasons.push({ code: 'conversation_endpoint_not_admitted', detail: `${step.id}: endpoint is outside the effect envelope` });
  }
  const mcpSteps = spec.steps.filter(step => step.kind === 'mcp.call');
  if (mcpSteps.length > (spec.effects.maxMcpCalls ?? 0)) reasons.push({ code: 'mcp_call_limit', detail: 'MCP calls exceed the explicitly declared effect ceiling' });
  for (const step of mcpSteps) {
    if (!spec.effects.allowedHosts.length) reasons.push({ code: 'mcp_origin_not_admitted', detail: `${step.id}: no application host is allowed` });
    if (!spec.effects.allowedMcpTools?.includes(step.command.tool)) reasons.push({ code: 'mcp_tool_not_admitted', detail: `${step.id}: tool is outside the effect envelope` });
    if (spec.effects.mode !== 'designated_writes') reasons.push({ code: 'mcp_effect_not_admitted', detail: `${step.id}: MCP tool annotations cannot establish read-only authority` });
    if (step.retry.attempts !== 1) reasons.push({ code: 'mcp_retry_unsupported', detail: `${step.id}: MCP tool effects require single-attempt admission` });
    if (!spec.effects.allowedMethods.includes('POST') || !spec.effects.allowedResourcePrefixes.some(prefix => step.command.endpoint === prefix || step.command.endpoint.startsWith(`${prefix}/`))) reasons.push({ code: 'mcp_endpoint_not_admitted', detail: `${step.id}: endpoint is outside the effect envelope` });
  }
  if (jobSteps.filter(step => step.kind === 'job.submit').length > spec.effects.maxJobs) reasons.push({ code: 'job_effect_limit', detail: 'job submissions exceed the declared effect ceiling' });
  for (const step of jobSteps) {
    if (!spec.effects.allowedJobQueues?.includes(step.command.queue)) reasons.push({ code: 'job_queue_not_admitted', detail: `${step.id}: native queue is outside the effect envelope` });
    if (step.retry.attempts !== 1) reasons.push({ code: 'job_retry_unsupported', detail: `${step.id}: native jobs require single-attempt admission` });
    if (spec.effects.mode === 'read_only' && step.kind !== 'job.observe') reasons.push({ code: 'job_write_not_admitted', detail: `${step.id}: mutation requires designated_writes` });
  }
  if (browserSteps.some(step => step.retry.attempts !== 1)) reasons.push({ code: 'browser_retry_unsupported', detail: 'browser effects require a single attempt; replay requires a new admission' });
  if (browserSteps.length > spec.limits.maxBrowserActions) reasons.push({ code: 'browser_action_limit', detail: 'browser steps exceed the case action budget' });
  if (browserSteps.length && spec.capture.trace === 'required') reasons.push({ code: 'browser_trace_unavailable', detail: 'required browser traces are not implemented' });
  if (browserSteps.length && spec.capture.redactionPolicyRef) reasons.push({ code: 'browser_redaction_unavailable', detail: 'the declared browser redaction policy has no executable adapter' });

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
    if (step.kind === 'ui.navigate') templateNames(step.path, used);
    if (step.kind === 'ui.action') templateNames(step.command, used);
    if (step.kind === 'ui.observe') templateNames(step.target, used);
    if (step.kind === 'job.submit' || step.kind === 'job.observe' || step.kind === 'job.cancel') templateNames(step.command, used);
    if (step.kind === 'mcp.call') templateNames(step.command.arguments, used);
    if (step.kind === 'conversation.run') templateNames(step.command.turns, used);
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
        case 'credential':
          if (step.kind === 'conversation.run') reasons.push({ code: 'conversation_credential_expansion_unsupported', detail: `${step.id}: credentials are sent as auth, never spoken into a conversation` });
          if (step.kind === 'mcp.call') reasons.push({ code: 'mcp_credential_expansion_unsupported', detail: `${step.id}: use MCP auth rather than expanding credentials into tool arguments` });
          if (step.kind.startsWith('ui.')) reasons.push({ code: 'browser_credential_expansion_unsupported', detail: `${step.id}: credentials cannot be filled into recorded browser steps` });
          credentialNames.add(source.name); break;
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
    const assertedStep = stepsById.get(assertion.stepId);
    if (assertion.oracle.name === 'browser.observation' && !assertedStep?.kind.startsWith('ui.')) reasons.push({ code: 'oracle_step_mismatch', detail: `${assertion.id}: browser oracle needs a browser step` });
    if (assertion.oracle.name === 'http.observation' && (assertedStep?.kind.startsWith('ui.') || assertedStep?.kind.startsWith('job.') || assertedStep?.kind === 'mcp.call' || assertedStep?.kind === 'conversation.run')) reasons.push({ code: 'oracle_step_mismatch', detail: `${assertion.id}: HTTP oracle needs an HTTP step` });
    if (assertion.oracle.name === 'conversation.observation' && assertedStep?.kind !== 'conversation.run') reasons.push({ code: 'oracle_step_mismatch', detail: `${assertion.id}: conversation oracle needs a conversation step` });
    if (assertion.oracle.name === 'mcp.observation' && assertedStep?.kind !== 'mcp.call') reasons.push({ code: 'oracle_step_mismatch', detail: `${assertion.id}: MCP oracle needs an MCP call` });
    if (assertion.oracle.name === 'job.observation' && !assertedStep?.kind.startsWith('job.')) reasons.push({ code: 'oracle_step_mismatch', detail: `${assertion.id}: job oracle needs a native job step` });
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
