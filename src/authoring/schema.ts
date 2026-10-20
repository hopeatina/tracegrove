/**
 * Authoring layer: the short files people write (`tracegrove.config.yaml`, `*.flow.yaml`,
 * `*.fixture.yaml`). They compile into the strict `workflow.*\/v1` corpus; nothing here is
 * evidence by itself and nothing bypasses the planner, executor or reducer.
 */
import { z } from 'zod';
import { ActionEnvelope, BrowserCommand, NativeJobAction, McpToolCall, Persona, HexSha256 } from '../protocol/index.ts';

export const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export type HttpVerb = typeof HTTP_VERBS[number];

const Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'use letters, digits, - and _ (start with a letter)');
const DotPath = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?)*$/, 'use a dot path like note.id or notes[0].title');
const Path = z.string().regex(/^\//, 'paths start with /');
const Status = z.number().int().min(100).max(599);
const Json: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(Json), z.record(z.string(), Json)]));

export const ADAPTERS = ['node', 'fastapi', 'django', 'command'] as const;
export const AGENT_PROVIDERS = ['claude', 'codex', 'none'] as const;
export type AgentProvider = typeof AGENT_PROVIDERS[number];

export const AuthoringConfig = z.object({
  $schema: z.string().optional(),
  project: Name.describe('Short project name, shown in reports and run summaries.'),
  testDir: z.string().default('tracegrove').describe('Folder holding *.flow.yaml and fixtures/, relative to this file.'),
  app: z.object({
    adapter: z.enum(ADAPTERS).describe('Launch preset: node, fastapi, django or command.'),
    nativeJobs: z.literal('node_ipc/v1').optional().describe('Opt in to the application-owned native Node job bridge.'),
    root: z.string().default('.').describe('App directory relative to this file; the launch cwd.'),
    entry: z.string().optional().describe('node: script path; fastapi: module:app; django: folder containing manage.py.'),
    run: z.string().optional().describe('command adapter: shell command that starts the app on $PORT.'),
    python: z.string().optional().describe('fastapi/django: interpreter (default .venv/bin/python when present, else python3).'),
    health: Path.default('/health').describe('GET path that returns 2xx once the app is ready.'),
    readyTimeoutMs: z.number().int().positive().max(300_000).default(20_000),
    sources: z.array(z.string()).min(1).optional().describe('Globs (relative to root) whose bytes are attested as the tested source.'),
    env: z.record(z.string(), z.string()).default({}).describe('Extra env; {port} and {dataDir} are substituted.'),
    inject: z.object({
      port: z.string().default('PORT'),
      dataDir: z.string().default('TRACEGROVE_DATA_DIR'),
      tokens: z.string().default('TRACEGROVE_TOKENS'),
    }).strict().default({ port: 'PORT', dataDir: 'TRACEGROVE_DATA_DIR', tokens: 'TRACEGROVE_TOKENS' }),
  }).strict(),
  personas: z.record(Name, z.object({ subject: z.string().min(1),
    ...Persona.pick({ locale: true, timezone: true, viewport: true, inputMode: true, reducedMotion: true }).partial().shape,
  }).strict())
    .refine((value) => Object.keys(value).length > 0, 'declare at least one persona')
    .describe('Callers. The first one is the default `as:` for every step.'),
  agent: z.object({
    provider: z.enum(AGENT_PROVIDERS).default('claude').describe('Coding agent that drafts and repairs flows: claude (Claude Code CLI), codex (Codex CLI) or none.'),
    model: z.string().min(1).max(120).optional().describe('Explicit model passed to the agent CLI. Defaults: claude-haiku-5-5 for claude; gpt-6-luna for codex.'),
    maxBudgetUsd: z.number().positive().max(100).optional().describe('Spend cap per draft run, passed to Claude Code as --max-budget-usd.'),
  }).strict().optional().describe('Agent settings. .tracegrove/settings.json (written by tracegrove ui) and CLI flags override these per developer.'),
  defaults: z.object({
    stepTimeoutMs: z.number().int().positive().max(120_000).default(5000),
    caseTimeoutMs: z.number().int().positive().max(600_000).default(30_000),
  }).strict().default({ stepTimeoutMs: 5000, caseTimeoutMs: 30_000 }),
}).strict();
export type AuthoringConfig = z.infer<typeof AuthoringConfig>;

export const Expect = z.union([
  Status,
  z.object({
    status: Status.optional(),
    json: z.record(DotPath, Json).optional().describe('Dot paths into the response body and their exact values.'),
    present: z.array(DotPath).optional(),
    absent: z.array(DotPath).optional(),
    count: z.record(DotPath, z.number().int().nonnegative()).optional(),
  }).strict(),
]);
export type Expect = z.infer<typeof Expect>;

const verbFields = Object.fromEntries(HTTP_VERBS.map((verb) => [verb, Path.optional()])) as Record<HttpVerb, z.ZodOptional<typeof Path>>;

function exactlyOneVerb(value: { [K in HttpVerb]?: string | undefined }, ctx: z.RefinementCtx): void {
  const verbs = HTTP_VERBS.filter((verb) => value[verb] !== undefined);
  if (verbs.length !== 1) ctx.addIssue({ code: 'custom', message: `give exactly one of ${HTTP_VERBS.join(', ')} (found ${verbs.length ? verbs.join(', ') : 'none'})` });
}

export const HttpFlowStep = z.object({
  name: z.string().min(1).max(120).optional(),
  ...verbFields,
  as: z.string().optional().describe('Persona name, or none for an unauthenticated call.'),
  headers: z.record(z.string(), z.string()).optional(),
  json: Json.optional().describe('Request body; {name} placeholders use saved values.'),
  observe: z.boolean().optional().describe('Independent readback (GET/HEAD) polled until expect holds.'),
  expect: Expect.optional(),
  save: z.record(Name, DotPath).optional().describe('name: dot.path into the response body.'),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
}).strict().superRefine(exactlyOneVerb);
export const BrowserFlowStep = z.object({
  name: z.string().min(1).max(120).optional(),
  browser: BrowserCommand,
  expect: z.object({ text: z.string().max(8192).optional(), status: Status.optional() }).strict().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
}).strict();
export type BrowserFlowStep = z.infer<typeof BrowserFlowStep>;
export const JobFlowStep = z.object({ name: z.string().min(1).max(120).optional(), job: NativeJobAction,
  as: z.string().optional(), expect: Expect.optional(), save: z.record(Name, DotPath).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional() }).strict();
export const McpFlowStep = z.object({ name: z.string().min(1).max(120).optional(), mcp: McpToolCall,
  as: z.string().optional(), expect: Expect.optional(), save: z.record(Name, DotPath).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional() }).strict();
export const ConcreteFlowStep = z.union([HttpFlowStep, BrowserFlowStep, JobFlowStep, McpFlowStep]);
export type ConcreteFlowStep = z.infer<typeof ConcreteFlowStep>;
const ActionId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z][A-Za-z0-9_-]*)*$/, 'an action id is its path under actions/ with dots, like notes.create');
/** Call a reusable action (tracegrove/actions/<area>/<name>.action.yaml) in place of writing its steps again. */
export const UseFlowStep = z.object({
  name: z.string().min(1).max(120).optional(),
  use: ActionId.describe('Action id: its file path under actions/, dotted (actions/notes/create.action.yaml is notes.create).'),
  with: z.record(Name, Json).default({}).describe('Inputs; values may use {saved} placeholders from earlier steps.'),
  as: z.string().optional().describe('Persona for the action\'s steps that do not set their own.'),
  save: z.record(Name, Name).optional().describe('outer name: action output. Without it every output keeps its own name.'),
}).strict();
export type UseFlowStep = z.infer<typeof UseFlowStep>;
export const FlowStep = z.union([ConcreteFlowStep, UseFlowStep]);
export type FlowStep = z.infer<typeof FlowStep>;

/**
 * A reusable sequence of steps with named inputs and outputs: the unit discovery and agents build up
 * so later flows compose existing work instead of rewriting it. Actions may call other actions.
 */
export const Action = z.object({
  $schema: z.string().optional(),
  title: z.string().min(1).max(400),
  inputs: z.record(Name, Json.nullable()).default({}).describe('name: default value, or null when a caller must supply it.'),
  outputs: z.array(Name).default([]).describe('Saved values the action hands back to its caller.'),
  as: z.string().optional().describe('Default persona for this action\'s steps.'),
  routes: z.array(z.string().regex(/^(GET|POST|PUT|PATCH|DELETE|HEAD|ANY) \//)).default([]).describe('Routes this action exercises, as METHOD /path/{param}; checked against traffic when it runs.'),
  sources: z.array(z.string().max(512)).max(16).default([]).describe('Files that handle those routes, relative to the app root; recorded in the catalog once traffic confirms the routes.'),
  steps: z.array(FlowStep).min(1).max(30),
}).strict();
export type Action = z.infer<typeof Action>;

/**
 * What discovery has learned, committed beside the flows so a fresh clone, a later discovery or the
 * next agent starts from it: every route with where it is handled, which actions exercise it, and
 * whether a verified run confirmed it. tracegrove rewrites it; it is never evidence by itself.
 */
export const CatalogRoute = z.object({
  route: z.string().regex(/^(GET|POST|PUT|PATCH|DELETE|HEAD|ANY) \//),
  source: z.enum(['static', 'traffic', 'agent']).describe('static: read from source; traffic: seen in a verified run; agent: stated by an action\'s sources and confirmed by traffic.'),
  file: z.string().nullable().default(null),
  line: z.number().int().positive().nullable().default(null),
  actions: z.array(z.string()).default([]),
  confirmed: z.object({ run: z.string(), sourceDigest: z.string(), cases: z.array(z.string()).max(32) }).strict().nullable().default(null),
}).strict();
export const Catalog = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal('tracegrove.catalog/v1'),
  routes: z.array(CatalogRoute).max(2000).default([]),
}).strict();
export type Catalog = z.infer<typeof Catalog>;
export type CatalogRoute = z.infer<typeof CatalogRoute>;

export const Flow = z.object({
  $schema: z.string().optional(),
  title: z.string().min(1).max(400),
  risk: z.enum(['critical', 'standard', 'exploratory']).default('standard'),
  tags: z.array(Name).default([]),
  as: z.string().optional().describe('Default persona for this flow.'),
  given: z.record(Name, z.string()).default({}).describe('alias: fixture name (tracegrove/fixtures/<name>.fixture.yaml).'),
  effects: ActionEnvelope.pick({ maxJobs: true, maxMcpCalls: true, allowedMcpTools: true }).partial().optional().describe('Explicit job and MCP effect ceilings; tool annotations do not grant authority.'),
  browser: z.object({
    allowPaths: z.array(Path).min(1).max(64).describe('Path prefixes in this flow’s effect envelope, including browser assets and API calls.'),
    allowMethods: z.array(z.enum(HTTP_VERBS)).min(1).max(6).default(['GET', 'HEAD']),
    maxActions: z.number().int().positive().max(10_000).default(100),
    maxArtifactBytes: z.number().int().positive().max(16 * 1024 * 1024).default(4 * 1024 * 1024),
  }).strict().optional(),
  steps: z.array(FlowStep).min(1).max(50),
}).strict().superRefine((flow, ctx) => {
  if (flow.steps.some(step => 'browser' in step) && !flow.browser) ctx.addIssue({ code: 'custom', path: ['browser'], message: 'browser steps require browser.allowPaths to declare the permitted page, asset, and API paths' });
  flow.steps.forEach((step, index) => {
    if (!('browser' in step)) return;
    if (step.browser.kind === 'read' && step.expect?.text === undefined) ctx.addIssue({ code: 'custom', path: ['steps', index, 'expect'], message: 'browser read requires expect.text; it polls until that text is observed' });
    if (step.expect?.text !== undefined && step.browser.kind !== 'read') ctx.addIssue({ code: 'custom', path: ['steps', index, 'expect', 'text'], message: 'text expectations need a browser read command' });
    if (step.expect?.status !== undefined && step.browser.kind !== 'navigate') ctx.addIssue({ code: 'custom', path: ['steps', index, 'expect', 'status'], message: 'status expectations need a browser navigate command' });
  });
});
export type Flow = z.infer<typeof Flow>;

const FixtureValue = z.union([
  Json,
  z.object({ words: z.number().int().min(1).max(64) }).strict(),
  z.object({ slug: z.literal(true) }).strict(),
  z.object({ uuid: z.literal(true) }).strict(),
  z.object({ int: z.object({ min: z.number().int(), max: z.number().int() }).strict() }).strict(),
]);

const FixtureCall = z.object({ ...verbFields, json: z.record(Name, FixtureValue).optional(), expect: Status.optional() }).strict().superRefine(exactlyOneVerb);

export const Fixture = z.object({
  $schema: z.string().optional(),
  as: z.string().optional(),
  create: FixtureCall,
  save: z.record(Name, DotPath).refine((value) => Object.keys(value).length > 0, 'save at least the created id'),
  readback: z.object({ GET: Path, expect: Expect }).strict(),
  cleanup: z.object({ DELETE: Path, expect: Status.optional(), gone: z.object({ GET: Path, status: z.union([z.literal(404), z.literal(410)]) }).strict() }).strict(),
}).strict();
export type Fixture = z.infer<typeof Fixture>;

export const RunVideo = z.object({ digest: HexSha256, byteCount: z.number().int().positive().max(16 * 1024 * 1024), mediaType: z.literal('video/webm') }).strict();
export type RunVideo = z.infer<typeof RunVideo>;

export function exportAuthoringSchemas(): Record<string, unknown> {
  const opts = { target: 'draft-2020-12' as const, io: 'input' as const, unrepresentable: 'any' as const };
  return {
    'tracegrove.config/v1': z.toJSONSchema(AuthoringConfig, opts),
    'tracegrove.flow/v1': z.toJSONSchema(Flow, opts),
    'tracegrove.fixture/v1': z.toJSONSchema(Fixture, opts),
    'tracegrove.action/v1': z.toJSONSchema(Action, opts),
    'tracegrove.catalog/v1': z.toJSONSchema(Catalog, opts),
    'tracegrove.run-video/v1': z.toJSONSchema(RunVideo, opts),
  };
}
