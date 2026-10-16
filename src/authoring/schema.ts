/**
 * Authoring layer: the short files people write (`tracegrove.config.yaml`, `*.flow.yaml`,
 * `*.fixture.yaml`). They compile into the strict `workflow.*\/v1` corpus; nothing here is
 * evidence by itself and nothing bypasses the planner, executor or reducer.
 */
import { z } from 'zod';

export const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export type HttpVerb = typeof HTTP_VERBS[number];

const Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'use letters, digits, - and _ (start with a letter)');
const DotPath = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?)*$/, 'use a dot path like note.id or notes[0].title');
const Path = z.string().regex(/^\//, 'paths start with /');
const Status = z.number().int().min(100).max(599);
const Json: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(Json), z.record(z.string(), Json)]));

export const ADAPTERS = ['node', 'fastapi', 'django', 'command'] as const;

export const AuthoringConfig = z.object({
  $schema: z.string().optional(),
  project: Name.describe('Short project name; prefixes every derived case id.'),
  testDir: z.string().default('tracegrove').describe('Folder holding *.flow.yaml and fixtures/, relative to this file.'),
  app: z.object({
    adapter: z.enum(ADAPTERS).describe('Launch preset: node, fastapi, django or command.'),
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
  personas: z.record(Name, z.object({ subject: z.string().min(1) }).strict())
    .refine((value) => Object.keys(value).length > 0, 'declare at least one persona')
    .describe('Callers. The first one is the default `as:` for every step.'),
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

export const FlowStep = z.object({
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
export type FlowStep = z.infer<typeof FlowStep>;

export const Flow = z.object({
  $schema: z.string().optional(),
  title: z.string().min(1).max(400),
  risk: z.enum(['critical', 'standard', 'exploratory']).default('standard'),
  tags: z.array(Name).default([]),
  as: z.string().optional().describe('Default persona for this flow.'),
  given: z.record(Name, z.string()).default({}).describe('alias: fixture name (tracegrove/fixtures/<name>.fixture.yaml).'),
  steps: z.array(FlowStep).min(1).max(50),
}).strict();
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

export function exportAuthoringSchemas(): Record<string, unknown> {
  const opts = { target: 'draft-2020-12' as const, io: 'input' as const, unrepresentable: 'any' as const };
  return {
    'tracegrove.config/v1': z.toJSONSchema(AuthoringConfig, opts),
    'tracegrove.flow/v1': z.toJSONSchema(Flow, opts),
    'tracegrove.fixture/v1': z.toJSONSchema(Fixture, opts),
  };
}
