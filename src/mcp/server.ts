/**
 * `tracegrove mcp`: the CLI's typed surface as an MCP stdio server, for Claude Code, Codex and OrgX
 * agents. Tools return the same versioned JSON as `--json`; nobody parses terminal output. Every
 * caller is an agent, so `test` enforces each environment's agent policy. Call ceilings bound a
 * session: total calls, and runs (test, heal, draft), which start apps or spend agent budget.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Blocked, Conflict, InfrastructureFailure } from '../core/errors.ts';
import { describeBlock } from '../core/blockCodes.ts';
import { findConfig, loadAuthoringConfig } from '../authoring/compile.ts';
import { exportAuthoringSchemas } from '../authoring/schema.ts';
import { projectStatus } from '../authoring/status.ts';
import { checkProject, discoverProject, draftWithAgent, saveCatalog } from '../authoring/workspace.ts';
import { resolveRun, runTests, type TestRunReport } from '../authoring/run.ts';
import { heal } from '../authoring/heal.ts';
import { AGENTS_GUIDE, initProject } from '../authoring/init.ts';
import { selectEnvironment } from '../environments/resolve.ts';
import { readLocalSettings } from '../authoring/localSettings.ts';
import { detectAgent, type AgentIdentity } from '../environments/agents.ts';
import { capabilityMatrix, envList, explain } from '../environments/commands.ts';
import { runEnvDoctor } from '../environments/doctorCache.ts';
import { decide, readiness } from '../authoring/readiness.ts';

export const MCP_TOOLS = ['status', 'init', 'discover', 'env_list', 'env_doctor', 'capabilities', 'explain', 'check', 'test', 'show_run', 'heal', 'draft', 'readiness', 'challenge_check'] as const;
export type McpCeilings = { maxCalls: number; maxRuns: number };
export const DEFAULT_CEILINGS: McpCeilings = { maxCalls: 200, maxRuns: 10 };
const RUN_TOOLS = new Set(['test', 'heal', 'draft']);
const INSTRUCTIONS = 'Verify a web app with tracegrove. Start with status. In a repo without tracegrove.config.yaml, call init, then discover to see the routes and which have no flow. Loop: env_doctor -> explain -> test -> heal. Every result carries schemaVersion; blocked results carry {code, owner, fix}. Run the fix when owner is agent; ask a person when it is developer or operator.';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
const ok = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });
function failure(error: unknown, env?: string): ToolResult {
  if (error instanceof Blocked) {
    const reasons = error.reasons.map(r => { const d = describeBlock(r.code, { env }, r.action); return { code: r.code, detail: r.detail, owner: d.owner, action: r.action, fix: r.fix ?? d.fix }; });
    return { ...ok({ schemaVersion: 'tracegrove.mcp-error/v1', errorClass: 'blocked', exitCode: 2, reasons }), isError: true };
  }
  const errorClass = error instanceof Conflict ? 'conflict' : error instanceof InfrastructureFailure ? 'infrastructure_failure' : 'unexpected_failure';
  return { ...ok({ schemaVersion: 'tracegrove.mcp-error/v1', errorClass, exitCode: errorClass === 'conflict' ? 2 : 3, reasons: [{ code: errorClass, detail: errorClass === 'unexpected_failure' ? 'the tool could not complete' : (error as Error).message }] }), isError: true };
}

function runSummary(report: TestRunReport) {
  return { schemaVersion: report.schemaVersion, outcome: report.outcome, exitCode: report.exitCode, environment: report.environment ?? null, runDir: report.runDir, bundleVerified: report.bundleVerified, totals: report.totals,
    blockers: report.blockers, cases: report.cases.map(c => ({ caseId: c.caseId, outcome: c.outcome, failure: c.failure })) };
}

/** Find the config now if there is one; otherwise serve `dir` so `init` can create it, and look again on each call. */
function locate(input: { configPath?: string; dir?: string }): { root: string; config: () => string } {
  if (input.configPath) { const configPath = input.configPath; return { root: dirname(configPath), config: () => configPath }; }
  const start = resolve(input.dir ?? '.');
  let found: string | null = null;
  try { found = findConfig(start); } catch { found = null; }
  const root = found ? dirname(found) : start;
  return { root, config: () => found ?? (found = findConfig(root)) };
}

export function createTracegroveMcpServer(input: { configPath?: string; dir?: string; ceilings?: Partial<McpCeilings>; agent?: AgentIdentity; version?: string }): McpServer {
  const { root, config } = locate(input);
  const ceilings = { ...DEFAULT_CEILINGS, ...input.ceilings };
  const detected = input.agent ?? detectAgent(process.env);
  const agent: AgentIdentity = detected.agent ? detected : { agent: 'mcp-client', source: 'tracegrove mcp' };
  const used = { calls: 0, runs: 0 };
  const server = new McpServer({ name: 'tracegrove', version: input.version ?? '0' }, { instructions: INSTRUCTIONS });
  const defaultEnv = () => selectEnvironment({ settings: (() => { try { return readLocalSettings(root); } catch { return {}; } })() }).name;
  const tool = <S extends z.ZodRawShape>(name: typeof MCP_TOOLS[number], description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>, signal: AbortSignal) => Promise<unknown> | unknown, readOnly = true) => {
    server.registerTool(name, { description, inputSchema: shape, annotations: { readOnlyHint: readOnly, openWorldHint: !readOnly } }, (async (args: z.infer<z.ZodObject<S>>, extra: { signal: AbortSignal }) => {
      if (used.calls >= ceilings.maxCalls) return failure(new Blocked([{ code: 'budget_exceeded', detail: `this MCP session reached its ceiling of ${ceilings.maxCalls} calls`, owner: 'operator', action: 'start a new session or raise --max-calls' }]));
      if (RUN_TOOLS.has(name) && used.runs >= ceilings.maxRuns) return failure(new Blocked([{ code: 'budget_exceeded', detail: `this MCP session reached its ceiling of ${ceilings.maxRuns} runs (test, heal, draft)`, owner: 'operator', action: 'start a new session or raise --max-test-runs' }]));
      used.calls++; if (RUN_TOOLS.has(name)) used.runs++;
      const env = (args as { env?: string }).env;
      try { return ok(await run(args, extra.signal)); } catch (error) { return failure(error, env); }
    }) as never);
  };
  const Env = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).optional().describe('Environment name; defaults to TRACEGROVE_ENV, .tracegrove/settings.json, then local.');

  tool('status', 'Where the project stands: config, flows, latest run, environments with doctor state, and ordered next commands.', {}, () => projectStatus(root));
  tool('init', 'Set tracegrove up in this repo: detect the framework, write tracegrove.config.yaml, a first flow and AGENTS.md. Returns the files written and the test-mode auth snippet the app needs for personas.', { force: z.boolean().optional().describe('Overwrite files init wrote before. Default false.') },
    args => initProject(root, { force: args.force === true }), false);
  tool('discover', 'Routes found in source and in observed traffic, which flows cover each, the uncovered ones, reusable actions, and places the scan cannot read. Rank uncovered writes, money and permission routes first when drafting.', { branch: z.string().optional().describe('Compare with this git branch to mark changed routes.'), save: z.boolean().optional().describe('Record the result in tracegrove/catalog.yaml. Default false.') },
    args => { const result = discoverProject(root, args.branch ?? null); const saved = args.save === true ? saveCatalog(root, result) : null; return { ...result, catalog: saved }; }, true);
  tool('env_list', 'Declared environments: target, class, write policy, agent policy and persona secret references (never values).', {}, () => envList(config()));
  tool('env_doctor', 'Probe an environment: deployment reachable and ready, each persona secret resolvable, whoami identity, network, budget, cleanup. Each failing check has a fix.', { env: Env, identity: z.boolean().optional().describe('Sign personas in and compare whoami subjects (default true).') },
    async (args, signal) => runEnvDoctor({ configPath: config(), env: args.env ?? defaultEnv(), identity: args.identity !== false, signal, agent }));
  tool('capabilities', 'Capability × environment matrix: supported, missing or denied, with the reason and fix.', { env: Env }, args => capabilityMatrix(config(), args.env ?? null));
  tool('explain', 'Dry plan for an environment: which flows run, as which personas, what they write and clean up, what is skipped, and whether this agent may run it.', { env: Env, case: z.string().optional(), grep: z.string().optional() },
    args => explain(config(), { env: args.env ?? defaultEnv(), caseId: args.case ?? null, grep: args.grep, agent }));
  tool('check', 'Compile flows only; returns issues with file locations and fixes.', {}, () => checkProject(root));
  tool('test', 'Run flows in an environment and return the verified result. Agents are subject to the environment agent policy (approval_required under ask).', { env: Env, grep: z.string().optional(), tags: z.array(z.string()).optional() },
    async (args, signal) => runSummary((await runTests({ configPath: config(), env: args.env ?? defaultEnv(), grep: args.grep, tags: args.tags, agent, signal })).report), false);
  tool('show_run', 'A saved run summary (latest by default).', { run: z.string().optional() }, args => {
    const dir = resolveRun(root, args.run ?? 'latest');
    if (!dir || !existsSync(join(dir, 'summary.json'))) throw new Blocked([{ code: 'run_not_found', detail: args.run ?? 'latest', owner: 'agent', action: 'run the test tool first' }]);
    return JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as unknown;
  });
  tool('heal', 'Fix setup and drifted tests, proving each fix by re-running; product bugs are reported, never hidden. Local environment only.', { dryRun: z.boolean().optional(), useAgent: z.boolean().optional().describe('Let the configured coding agent propose fixes (spends agent budget). Default false.') },
    async (args, signal) => heal({ dir: root, agent: args.useAgent === true, dryRun: args.dryRun === true, signal }), false);
  tool('draft', 'Have the configured coding agent draft flows for uncovered routes into tracegrove/discovered/, then check them.', { intent: z.string().max(2000).optional(), branch: z.string().optional() },
    async (args, signal) => draftWithAgent({ dir: root, branch: args.branch ?? null, intent: args.intent ?? null, signal }), false);

  tool('readiness', 'Every flow as a claim with four separate states: execution (did it run), assessment (what the evidence supports), validity (still about this code and check) and decision (who signed off). Critical claims need a person; agents cannot accept or waive.', {}, () => readiness(root));
  tool('challenge_check', 'Dispute a check you believe is wrong, with a reason, without changing it. The claim stays open for a person; never edit a flow to weaken an assertion instead.', { case: z.string().min(1), reason: z.string().min(1).max(2000), step: z.string().max(200).optional() },
    args => decide(root, { case: args.case, decision: 'challenged', by: `agent:${agent.agent ?? 'mcp-client'}`, reason: args.reason, ...(args.step ? { step: args.step } : {}) }), false);

  for (const [id, schema] of Object.entries(exportAuthoringSchemas())) {
    server.registerResource(`schema ${id}`, `tracegrove://schema/${id}`, { mimeType: 'application/schema+json', description: `JSON Schema for ${id}` },
      async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(schema, null, 2) }] }));
  }
  server.registerResource('AGENTS.md', 'tracegrove://agents-md', { mimeType: 'text/markdown', description: 'Rules for coding agents working in this project, including environment rules.' }, async uri => {
    let testDir = 'tracegrove';
    try { testDir = loadAuthoringConfig(config()).testDir; } catch { /* no config yet: serve the default guide */ }
    const file = join(root, testDir, 'AGENTS.md');
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: existsSync(file) ? readFileSync(file, 'utf8') : AGENTS_GUIDE }] };
  });
  return server;
}

export async function serveMcp(input: Parameters<typeof createTracegroveMcpServer>[0] & { transport?: Transport }): Promise<void> {
  const server = createTracegroveMcpServer(input);
  await server.connect(input.transport ?? new StdioServerTransport());
  await new Promise<void>(done => { server.server.onclose = () => done(); });
}
