import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSample } from '../src/cli/samples/write.ts';
import { runTests } from '../src/authoring/run.ts';
import { readVerifiedBundle } from '../src/core/bundle.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { loadProject } from '../src/core/corpus.ts';
import { compileCase } from '../src/core/compiler.ts';
import { CaseSpec, McpToolObservation } from '../src/protocol/index.ts';
import { MCP_RUNNER_CAPABILITIES } from '../src/adapters/mcp/capabilities.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../src/adapters/http/capabilities.ts';
import { evaluateAssertions, REDUCER_REF } from '../src/core/reducer.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-mcp-')); roots.push(root);
  writeSample(join(import.meta.dirname, '../src/samples'), 'notes-mcp', root);
  return { root, configPath: join(root, 'tracegrove.config.yaml') };
}
it('runs the native MCP sample with HTTP readback and owner isolation, then independently re-verifies its sealed evidence', async () => {
  const p = project(); const { report } = await runTests({ configPath: p.configPath });
  expect(report.outcome, JSON.stringify(report)).toBe('passed'); expect(report.bundleVerified).toBe(true);
  const bundle = readVerifiedBundle(join(report.runDir, 'bundle'));
  const receipt = bundle.receipts[0]!;
  expect(receipt.accounting.integrationOperations).toBe(1);
  expect(receipt.accounting).toMatchObject({ estimatedCents: null, reconciledCents: null,
    unknownCharges: expect.arrayContaining([expect.objectContaining({ route: 'provider_operation' })]) });
  expect(receipt.performance.map(value => value.boundary)).toEqual(['mcp', 'http', 'http']);
  expect(receipt.performance.every(value => value.warm === null)).toBe(true);
  const observation = McpToolObservation.parse(receipt.steps[0]!.output);
  expect(observation).toMatchObject({ isError: false, protocolVersion: '2025-11-25', server: { name: 'native-notes' }, attempts: 1 });
  expect(receipt.steps[1]!.output).toMatchObject({ status: 200, body: { note: { title: 'Protocol proof', ownerId: 'alice' } } });
  expect(receipt.steps[2]!.output).toMatchObject({ status: 403 });
  expect(receipt.cleanup.confirmed).toEqual(expect.arrayContaining(['host.process', 'host.workspace']));
  expect(report.cases[0]!.steps[0]!.observedText).toContain('MCP /mcp notes.create');
  const compiled = compileProject(p.configPath); const loaded = loadProject(compiled.workflowConfigPath);
  const spec = loaded.corpus.getAs(CaseSpec, loaded.suiteCases[0]!.ref);
  const wrong = receipt.steps.map((step, index) => index === 0 ? { ...step, output: { ...observation, tool: 'another-tool' } } : step);
  expect(evaluateAssertions(spec, receipt.environment.class, wrong, REDUCER_REF, receipt.startedAt ?? receipt.finalizedAt, receipt.finalizedAt)[0]).toMatchObject({ result: 'not_observed', reasonCode: 'invalid_mcp_observation' });
});
it('blocks unbudgeted, unlisted and retried MCP calls, read-only annotation trust and oracle substitution', () => {
  const p = project(); const compiled = compileProject(p.configPath); const loaded = loadProject(compiled.workflowConfigPath);
  const spec = loaded.corpus.getAs(CaseSpec, loaded.suiteCases[0]!.ref);
  const invalid: Array<[CaseSpec['effects'], string]> = [
    [{ ...spec.effects, maxMcpCalls: 0 }, 'mcp_call_limit'],
    [{ ...spec.effects, allowedHosts: [] }, 'mcp_origin_not_admitted'],
    [{ ...spec.effects, allowedMcpTools: [] }, 'mcp_tool_not_admitted'],
    [{ ...spec.effects, mode: 'read_only' as const }, 'mcp_effect_not_admitted'],
    [{ ...spec.effects, allowedResourcePrefixes: ['/other'] }, 'mcp_endpoint_not_admitted'],
  ];
  for (const [effects, reason] of invalid) expect(() => compileCase({ ...spec, effects }, MCP_RUNNER_CAPABILITIES, null)).toThrow(reason);
  expect(() => compileCase(spec, HTTP_RUNNER_CAPABILITIES, null)).toThrow('unsupported_operation');
  expect(() => compileCase({ ...spec, steps: spec.steps.map(step => step.kind === 'mcp.call' ? { ...step, retry: { attempts: 2 } } : step) }, MCP_RUNNER_CAPABILITIES, null)).toThrow('mcp_retry_unsupported');
  expect(() => compileCase({ ...spec, assertions: spec.assertions.map(assertion => ({ ...assertion, oracle: { name: 'http.observation' as const, version: '1' as const } })) }, MCP_RUNNER_CAPABILITIES, null)).toThrow('oracle_step_mismatch');
});
it('fails a false-success MCP result when the independent native readback cannot find its claimed note', async () => {
  const p = project(); const app = join(p.root, 'app/mcp.mjs');
  const source = readFileSync(app, 'utf8'); expect(source).toContain('writeFileSync(join(directory, `${note.id}.json`), JSON.stringify(note));');
  writeFileSync(app, source.replace('writeFileSync(join(directory, `${note.id}.json`), JSON.stringify(note));', '// Controlled defect: report success without persistence.'));
  const { report } = await runTests({ configPath: p.configPath });
  expect(report.outcome).toBe('assertion_failed'); expect(report.bundleVerified).toBe(true);
  expect(report.cases[0]!.steps[0]!.result).toBe('completed'); expect(report.cases[0]!.steps[1]!.status).toBe(404);
});
it('does not turn MCP isError into a completed or passing step and does not continue with dependent effects', async () => {
  const p = project(); const file = join(p.root, 'tracegrove/notes.flow.yaml');
  const source = readFileSync(file, 'utf8'); writeFileSync(file, source.replace('title: Protocol proof, body: Saved by the native application', 'title: 5, body: Invalid typed input'));
  const { report } = await runTests({ configPath: p.configPath });
  expect(report.outcome).toBe('assertion_failed'); expect(report.bundleVerified).toBe(true);
  expect(report.cases[0]!.steps[0]).toMatchObject({ result: 'failed', reason: 'mcp_tool_error' });
  expect(report.cases[0]!.steps[1]!.result).toBe('not_run');
  const receipt = readVerifiedBundle(join(report.runDir, 'bundle')).receipts[0]!;
  expect(receipt.cleanup.remainingUnknownMutations).toBe(1);
  expect(receipt.cleanup.reasonCodes).toContain('operation_outcome_uncertain');
});
