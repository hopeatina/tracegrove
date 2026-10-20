/**
 * Reusable actions: `tracegrove/actions/<area>/<name>.action.yaml` is the action `<area>.<name>`, a
 * named step sequence with inputs and outputs. A flow step `use: notes.create` expands, at compile
 * time, into that action's steps, so the kernel only ever sees ordinary steps and every call is
 * still executed and sealed like hand-written ones. Discovery and agents grow this library so the
 * next flow reuses proven work instead of rewriting it.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { Action, Flow, type ConcreteFlowStep, type FlowStep, type UseFlowStep } from './schema.ts';

export const ACTIONS_DIR = 'actions';
export const MAX_ACTION_DEPTH = 6;
export type ActionLibrary = Map<string, { action: Action; file: string }>;
export type ExpandedFlow = Omit<Flow, 'steps'> & { steps: ConcreteFlowStep[]; uses: string[] };

const fail = (code: string, detail: string, action: string): never => { throw new Blocked([{ code, detail, owner: 'test author', action }]); };

export function actionIdFor(actionsDir: string, file: string): string {
  return relative(actionsDir, file).split(sep).join('/').replace(/\.action\.(?:ya?ml|ts)$/, '').split('/').join('.');
}

export function findActionFiles(testDir: string): string[] {
  const dir = join(testDir, ACTIONS_DIR);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (/\.action\.(?:ya?ml|ts)$/.test(entry.name)) out.push(abs);
    }
  };
  visit(dir);
  return out.sort();
}

export function loadActionLibrary(testDir: string, read: (file: string) => Action): ActionLibrary {
  const library: ActionLibrary = new Map();
  for (const file of findActionFiles(testDir)) {
    const id = actionIdFor(join(testDir, ACTIONS_DIR), file);
    if (library.has(id)) fail('duplicate_action', `action ${id} has more than one file`, 'keep one file per action');
    library.set(id, { action: read(file), file });
  }
  return library;
}

const TEMPLATE = /\{([A-Za-z][A-Za-z0-9_-]*)((?:\.[A-Za-z0-9_[\]]+)*)\}/g;
const WHOLE = /^\{([A-Za-z][A-Za-z0-9_-]*)\}$/;

/** Rewrite `{name}` placeholders: inputs take the caller's value, the action's own saved names get a call-local name. */
function substitute(value: unknown, inputs: Map<string, unknown>, renamed: Map<string, string>): unknown {
  if (typeof value === 'string') {
    const whole = WHOLE.exec(value);
    if (whole && inputs.has(whole[1]!)) return inputs.get(whole[1]!);
    return value.replace(TEMPLATE, (match, head: string, rest: string) => {
      if (inputs.has(head)) { const v = inputs.get(head); return typeof v === 'string' ? v + rest : rest ? match : JSON.stringify(v); }
      const local = renamed.get(head);
      return local ? `{${local}${rest}}` : match;
    });
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, inputs, renamed));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, inputs, renamed)]));
  return value;
}

function savedNames(steps: FlowStep[], library: ActionLibrary): string[] {
  return steps.flatMap((step) => 'use' in step ? Object.keys(step.save ?? Object.fromEntries((library.get(step.use)?.action.outputs ?? []).map((o) => [o, o])))
    : 'save' in step && step.save ? Object.keys(step.save) : []);
}

type Expansion = { steps: ConcreteFlowStep[]; uses: string[] };

function expandCall(call: UseFlowStep, library: ActionLibrary, where: string, stack: string[], counter: { n: number }): Expansion {
  const entry = library.get(call.use);
  if (!entry) fail('unknown_action', `${where}: use: ${call.use} has no actions/${call.use.split('.').join('/')}.action.yaml`, `create the action or fix the id; known: ${[...library.keys()].join(', ') || 'none'}`);
  if (stack.includes(call.use)) fail('action_cycle', `${where}: ${[...stack, call.use].join(' -> ')}`, 'an action cannot call itself, directly or through another action');
  if (stack.length >= MAX_ACTION_DEPTH) fail('action_too_deep', `${where}: actions nest more than ${MAX_ACTION_DEPTH} deep`, 'flatten the actions');
  const { action } = entry!;
  for (const key of Object.keys(call.with)) if (!(key in action.inputs)) fail('unknown_action_input', `${where}: ${call.use} has no input ${key}`, `inputs are: ${Object.keys(action.inputs).join(', ') || 'none'}`);
  const inputs = new Map<string, unknown>();
  for (const [key, fallback] of Object.entries(action.inputs)) {
    const given = call.with[key] ?? fallback;
    if (given === null || given === undefined) fail('missing_action_input', `${where}: ${call.use} needs input ${key}`, `add with: { ${key}: ... }`);
    inputs.set(key, given);
  }
  const call_n = ++counter.n;
  const outputs = new Map(Object.entries(call.save ?? Object.fromEntries(action.outputs.map((o) => [o, o]))).map(([outer, inner]) => [inner, outer]));
  for (const inner of outputs.keys()) if (!action.outputs.includes(inner)) fail('unknown_action_output', `${where}: ${call.use} has no output ${inner}`, `outputs are: ${action.outputs.join(', ') || 'none'}`);
  const own = savedNames(action.steps, library);
  for (const output of action.outputs) if (!own.includes(output)) fail('action_output_unsaved', `${entry!.file}: output ${output} is never saved by a step`, `save ${output} in one of its steps`);
  // Outputs keep the caller's chosen names; everything else an action saves stays private to this call.
  const renamed = new Map(own.map((name) => [name, outputs.get(name) ?? `${call.use.replace(/[^A-Za-z0-9]/g, '_')}_${call_n}_${name}`]));
  const label = call.name ?? call.use;
  const persona = call.as ?? action.as;
  const steps: ConcreteFlowStep[] = [];
  const uses = [call.use];
  action.steps.forEach((inner, index) => {
    const innerWhere = `${where} > ${call.use} step ${index + 1}`;
    if ('use' in inner) {
      const nested = substitute(inner, inputs, renamed) as UseFlowStep;
      const save = inner.save ?? Object.fromEntries((library.get(inner.use)?.action.outputs ?? []).map((o) => [o, o]));
      const expanded = expandCall({ ...nested, as: inner.as ?? persona, save: Object.fromEntries(Object.entries(save).map(([outer, o]) => [renamed.get(outer) ?? outer, o])) }, library, innerWhere, [...stack, call.use], counter);
      steps.push(...expanded.steps.map((s) => ({ ...s, name: `${label} › ${s.name ?? 'step'}` }) as ConcreteFlowStep));
      uses.push(...expanded.uses);
      return;
    }
    const out = substitute(inner, inputs, renamed) as ConcreteFlowStep & { save?: Record<string, string>; as?: string };
    if (out.save) out.save = Object.fromEntries(Object.entries(out.save).map(([k, v]) => [renamed.get(k) ?? k, v]));
    if (persona && !('browser' in out) && out.as === undefined) out.as = persona;
    out.name = `${label} › ${inner.name ?? `step ${index + 1}`}`;
    steps.push(out);
  });
  return { steps, uses };
}

/** Expand every `use:` step; the result is re-validated as an ordinary flow so all flow rules still hold. */
export function expandFlow(flow: Flow, library: ActionLibrary, rel: string): ExpandedFlow {
  const counter = { n: 0 };
  const steps: ConcreteFlowStep[] = [];
  const uses: string[] = [];
  flow.steps.forEach((step, index) => {
    if (!('use' in step)) { steps.push(step); return; }
    const expanded = expandCall(step, library, `${rel} step ${index + 1}`, [], counter);
    steps.push(...expanded.steps); uses.push(...expanded.uses);
  });
  if (uses.length === 0) return { ...flow, steps: steps as ConcreteFlowStep[], uses };
  const checked = Flow.safeParse({ ...flow, steps });
  if (!checked.success) throw new Blocked(checked.error.issues.map((issue) => ({ code: 'invalid_expanded_flow', detail: `${rel} after expanding actions${issue.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue.message}`, owner: 'test author', action: `edit ${rel} or the actions it uses` })));
  return { ...checked.data, steps: checked.data.steps as ConcreteFlowStep[], uses: [...new Set(uses)] };
}
