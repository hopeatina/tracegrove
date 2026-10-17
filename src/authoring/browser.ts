import type { BrowserFlowStep } from './schema.ts';
import type { PredicateT } from '../protocol/index.ts';

/** Lower the shared browser command into the core step vocabulary without a second executor. */
export function compileBrowserStep(input: {
  step: BrowserFlowStep; id: string; timeoutMs: number; inputs: Record<string, unknown>;
  bind: (value: unknown) => unknown;
}): { step: Record<string, unknown>; predicate: PredicateT | null; label: string; path: string } {
  const { step, id, timeoutMs, inputs } = input;
  const command = step.browser;
  const common = { id, timeoutMs, inputs, retry: { attempts: 1 } };
  if (command.kind === 'navigate') return {
    step: { ...common, kind: 'ui.navigate', path: input.bind(command.path) },
    predicate: step.expect?.status === undefined ? null : { kind: 'json_path_equals', path: 'browser.status', value: step.expect.status },
    label: 'NAVIGATE', path: command.path,
  };
  if (command.kind === 'read') {
    const predicate: PredicateT = { kind: 'json_path_equals', path: 'browser.text', value: step.expect!.text! };
    return { step: { ...common, kind: 'ui.observe', target: input.bind(command.target), predicate, pollIntervalMs: 100 }, predicate,
      label: 'READ', path: command.target.name };
  }
  return { step: { ...common, kind: 'ui.action', command: input.bind(command) }, predicate: null,
    label: command.kind.toUpperCase(), path: command.target.name };
}
