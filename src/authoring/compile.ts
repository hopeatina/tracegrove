/**
 * Compile the authoring files into a normal `workflow.config/v1` project under
 * `.tracegrove/compiled/`. The compiled folder is loaded by the ordinary corpus loader, so the
 * planner, executor, reducer and bundle verifier see exactly what they always see.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml, stringify } from 'yaml';
import type { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { AUTHORING_SCOPE, ProjectLoader } from '../core/corpus.ts';
import { materializeLogicalPayload } from '../core/generators.ts';
import { sourceIdentityDigest } from '../hosts/local.ts';
import { observeApplicationRuntimeSync } from '../hosts/runtime.ts';
import { SeedRecipe, parseAs } from '../protocol/index.ts';
import { AuthoringConfig, Fixture, Flow, HTTP_VERBS, type Expect, type FlowStep, type HttpVerb } from './schema.ts';
import { compileBrowserStep } from './browser.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../adapters/http/capabilities.ts';
import { BROWSER_RUNNER_CAPABILITIES } from '../adapters/browser/capabilities.ts';
import { defaultSourceGlobs, expandSources } from './sources.ts';

export const CONFIG_FILE = 'tracegrove.config.yaml';
export const STATE_DIR = '.tracegrove';
const APP_ID = 'app';
const ORIGIN = `launch://${APP_ID}`;
const PROFILE = 'real';

export type CompiledStepInfo = { id: string; name: string; method: string; path: string; as: string; expectStatus: number | null; expectation?: string };
export type CompiledFlowInfo = { caseId: string; file: string; title: string; tags: string[]; risk: string; steps: CompiledStepInfo[]; fixtures: string[] };
export type CompileResult = {
  root: string;
  configPath: string;
  compiledDir: string;
  workflowConfigPath: string;
  config: AuthoringConfig;
  flows: CompiledFlowInfo[];
  sourceDigest: string;
  sourceFiles: string[];
};
export type CompileOptions = { grep?: string | undefined; tags?: string[] | undefined };

type Json = unknown;

function fail(code: string, detail: string, action: string): never {
  throw new Blocked([{ code, detail, owner: 'test author', action }]);
}

function readAuthoring<T extends z.ZodType>(schema: T, path: string, root: string): z.infer<T> {
  const rel = relative(root, path) || path;
  let raw: unknown;
  try { raw = parseYaml(readFileSync(path, 'utf8'), { strict: true }); }
  catch (error) { fail('invalid_yaml', `${rel}: ${(error as Error).message.split('\n')[0]}`, `fix the YAML syntax in ${rel}`); }
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${rel}${issue.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue.message}`);
    throw new Blocked(issues.map((detail) => ({ code: 'invalid_authoring_file', detail, owner: 'test author', action: `edit ${rel}` })));
  }
  return parsed.data;
}

/** Walk up from `start` to the nearest tracegrove.config.yaml. */
export function findConfig(start: string): string {
  let dir = resolve(start);
  if (existsSync(dir) && !dir.endsWith('.yaml') && !dir.endsWith('.yml')) {
    while (true) {
      const candidate = join(dir, CONFIG_FILE);
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    fail('config_not_found', `no ${CONFIG_FILE} in ${resolve(start)} or any parent`, 'run tracegrove init');
  }
  if (!existsSync(dir)) fail('config_not_found', dir, 'pass the path to tracegrove.config.yaml');
  return dir;
}

export function loadAuthoringConfig(configPath: string): AuthoringConfig {
  return readAuthoring(AuthoringConfig, configPath, dirname(configPath));
}

function snake(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'step';
}

function verbOf(value: { [K in HttpVerb]?: string | undefined }): { method: HttpVerb; path: string } {
  const method = HTTP_VERBS.find((verb) => value[verb] !== undefined)!;
  return { method, path: value[method]! };
}

function findFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', '.git', '.tracegrove'].includes(entry.name)) visit(abs); }
      else if (entry.name.endsWith(suffix)) out.push(abs);
    }
  };
  visit(dir);
  return out.sort();
}

export function caseIdFor(project: string, testDir: string, file: string): string {
  const rel = relative(testDir, file).split(sep).join('/').replace(/\.flow\.ya?ml$/, '');
  void project;
  return rel.split('/').join('.').replace(/[^A-Za-z0-9._-]/g, '-');
}

/** A predicate over the observed `{ status, body }`; json paths are relative to the body. */
function predicateFor(expect: Expect | undefined): Json | null {
  if (expect === undefined) return null;
  const e = typeof expect === 'number' ? { status: expect } : expect;
  const preds: Json[] = [];
  if (e.status !== undefined) preds.push({ kind: 'status_equals', value: e.status });
  for (const [path, value] of Object.entries(e.json ?? {})) preds.push({ kind: 'json_path_equals', path: `body.${path}`, value });
  for (const path of e.present ?? []) preds.push({ kind: 'json_path_present', path: `body.${path}` });
  for (const path of e.absent ?? []) preds.push({ kind: 'json_path_absent', path: `body.${path}` });
  for (const [path, count] of Object.entries(e.count ?? {})) preds.push({ kind: 'json_path_count', path: `body.${path}`, count });
  if (preds.length === 0) return null;
  return preds.length === 1 ? preds[0]! : { kind: 'all', predicates: preds };
}

function statusOf(expect: Expect | undefined): number | null {
  if (expect === undefined) return null;
  return typeof expect === 'number' ? expect : expect.status ?? null;
}

const REF = /\{([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\}/g;

type Scope = { saved: Map<string, string>; given: Map<string, { fixture: string; outputs: string[] }> };

/** Rewrite `{alias.output}` to `{alias__output}` and collect the step inputs every placeholder needs. */
function bindTemplates(value: Json, scope: Scope, inputs: Record<string, Json>, where: string): Json {
  if (typeof value === 'string') {
    return value.replace(REF, (_match, head: string, tail: string | undefined) => {
      if (tail !== undefined) {
        const given = scope.given.get(head);
        if (!given) fail('unknown_fixture_alias', `${where}: {${head}.${tail}} names no fixture in given:`, `add ${head}: <fixture> under given:`);
        if (!given.outputs.includes(tail)) fail('unknown_fixture_output', `${where}: fixture ${given.fixture} saves ${given.outputs.join(', ')}, not ${tail}`, `add ${tail} to save: in fixtures/${given.fixture}.fixture.yaml`);
        const name = `${head}__${tail}`;
        inputs[name] = { kind: 'fixture', entityKey: head, outputName: tail };
        return `{${name}}`;
      }
      const producer = scope.saved.get(head);
      if (!producer) {
        const near = [...scope.saved.keys()].find((name) => name.toLowerCase() === head.toLowerCase());
        fail('unknown_variable', `${where}: {${head}} is not saved by an earlier step${near ? `; did you mean {${near}}?` : ''}`, near ? `rename {${head}} to {${near}}` : `add save: { ${head}: <path> } to an earlier step`);
      }
      inputs[head] = { kind: 'capture', stepId: producer, name: head };
      return `{${head}}`;
    });
  }
  if (Array.isArray(value)) return value.map((item) => bindTemplates(item, scope, inputs, where));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bindTemplates(v, scope, inputs, where)]));
  return value;
}

function authFor(as: string | undefined, personas: string[], defaultPersona: string, inputs: Record<string, Json>, where: string): Json {
  const who = as ?? defaultPersona;
  if (who === 'none') return { kind: 'none' };
  if (!personas.includes(who)) fail('unknown_persona', `${where}: as: ${who} is not declared under personas:`, `declare ${who} in tracegrove.config.yaml or use one of ${personas.join(', ')}, none`);
  if (who === defaultPersona) return { kind: 'persona' };
  inputs[`as_${who}`] = { kind: 'credential', name: `${who}_token` };
  return { kind: 'credential', name: `${who}_token` };
}

function firstSegment(path: string): string {
  const seg = path.split('/')[1] ?? '';
  return seg && !seg.includes('{') ? `/${seg}` : '/';
}

type FixtureUse = { alias: string; name: string; fixture: Fixture };

function launchFor(config: AuthoringConfig, root: string, appRoot: string): { cwd: string; command: string; args: string[]; runtime: string } {
  const app = config.app;
  // A python path with a slash is relative to the config file; a bare name is looked up on PATH.
  const configured = app.python && app.python.includes('/') ? resolve(root, app.python) : app.python;
  const python = configured ?? (existsSync(join(appRoot, '.venv', 'bin', 'python')) ? join(appRoot, '.venv', 'bin', 'python') : 'python3');
  switch (app.adapter) {
    case 'node':
      if (!app.entry) fail('missing_entry', 'app.entry is required for adapter node (e.g. src/server.js)', 'set app.entry');
      return { cwd: appRoot, command: process.execPath, args: [app.entry], runtime: `node${process.versions.node.split('.')[0]}` };
    case 'fastapi':
      if (!app.entry) fail('missing_entry', 'app.entry is required for adapter fastapi (module:app, e.g. app.main:app)', 'set app.entry');
      return { cwd: appRoot, command: python, args: ['-m', 'uvicorn', app.entry, '--host', '127.0.0.1', '--port', '{port}'], runtime: 'python' };
    case 'django': {
      const dir = resolve(appRoot, app.entry ?? '.');
      if (!existsSync(join(dir, 'manage.py'))) fail('missing_manage_py', `no manage.py in ${relative(appRoot, dir) || '.'}`, 'set app.entry to the folder containing manage.py');
      const bootstrap = "import os, subprocess, sys; subprocess.run([sys.executable, 'manage.py', 'migrate', '--noinput'], check=True); os.execv(sys.executable, [sys.executable, 'manage.py', 'runserver', '127.0.0.1:{port}', '--noreload'])";
      return { cwd: dir, command: python, args: ['-c', bootstrap], runtime: 'python' };
    }
    case 'command':
      if (!app.run) fail('missing_run', 'app.run is required for adapter command (e.g. "npm start")', 'set app.run');
      return { cwd: appRoot, command: 'sh', args: ['-c', `exec ${app.run}`], runtime: 'command' };
  }
}

function write(dir: string, rel: string, doc: Json): void {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `# generated by tracegrove compile; edit the .flow.yaml / tracegrove.config.yaml instead\n${stringify(doc, { lineWidth: 0 })}`);
}

export function compileProject(configPath: string, options: CompileOptions = {}): CompileResult {
  const root = dirname(resolve(configPath));
  const config = loadAuthoringConfig(resolve(configPath));
  const testDir = resolve(root, config.testDir);
  const appRoot = resolve(root, config.app.root);
  const compiledDir = join(root, STATE_DIR, 'compiled');
  const personas = Object.keys(config.personas);
  const defaultPersona = personas[0]!;

  // ---- discover flows and fixtures ----
  const fixtureDir = join(testDir, 'fixtures');
  const fixtures = new Map<string, Fixture>();
  for (const file of findFiles(fixtureDir, '.fixture.yaml')) fixtures.set(basename(file).replace(/\.fixture\.yaml$/, ''), readAuthoring(Fixture, file, root));
  const flowFiles = findFiles(testDir, '.flow.yaml').concat(findFiles(testDir, '.flow.yml'));
  if (flowFiles.length === 0) fail('no_flows', `no *.flow.yaml under ${relative(root, testDir) || '.'}`, 'write a flow, or run tracegrove init for an example');
  const parsedFlows = flowFiles.map((file) => ({ file, caseId: caseIdFor(config.project, testDir, file), flow: readAuthoring(Flow, file, root) }));
  const seen = new Set<string>();
  for (const { caseId, file } of parsedFlows) {
    if (seen.has(caseId)) fail('duplicate_case_id', `${relative(root, file)} derives ${caseId}, which another flow already uses`, 'rename one of the files');
    seen.add(caseId);
  }
  const selected = parsedFlows.filter(({ caseId, flow, file }) =>
    (!options.grep || caseId.includes(options.grep) || flow.title.toLowerCase().includes(options.grep.toLowerCase()) || relative(root, file).includes(options.grep))
    && (!options.tags?.length || options.tags.some((tag) => flow.tags.includes(tag))));
  if (selected.length === 0) fail('no_flows_selected', `no flow matches${options.grep ? ` --grep ${options.grep}` : ''}${options.tags?.length ? ` --tag ${options.tags.join(',')}` : ''}`, 'run tracegrove list to see flow ids and tags');
  const hasBrowser = selected.some(({ flow }) => flow.steps.some(step => 'browser' in step));
  const runner = hasBrowser ? BROWSER_RUNNER_CAPABILITIES : HTTP_RUNNER_CAPABILITIES;

  // ---- attested source identity ----
  // Sources are relative to the launch cwd (the manage.py folder for django, else app.root).
  const launch = launchFor(config, root, appRoot);
  const launchCwd = launch.cwd;
  if (config.app.adapter === 'command') fail('command_adapter_unqualified', 'Shell wrappers cannot supply an independently observed application runtime.', 'use the node, fastapi or django preset until a qualified command host is configured');
  const runtime = observeApplicationRuntimeSync(launch.command, launchCwd, process.env.PATH ?? '');
  launch.command = runtime.executable;
  launch.runtime = runtime.runtime;
  const extraSkip = [relative(launchCwd, testDir).split(sep).join('/')].filter((p) => p && !p.startsWith('..'));
  const sourceFiles = expandSources(launchCwd, config.app.sources ?? defaultSourceGlobs(), extraSkip);
  const identity = sourceIdentityDigest(launchCwd, sourceFiles);

  rmSync(compiledDir, { recursive: true, force: true });
  mkdirSync(compiledDir, { recursive: true });
  const ref = (id: string) => ({ id: `${config.project}.${id}`, revision: '1' });

  // ---- shared definitions ----
  const defaultAuth = `./auth/${defaultPersona}.yaml`;
  for (const name of personas) write(compiledDir, `auth/${name}.yaml`, { schemaVersion: 'workflow.auth-recipe/v1', ref: ref(`auth.${name}`), kind: 'host_issued', credentialName: `${name}_token`, header: 'authorization', scheme: 'Bearer' });
  write(compiledDir, `personas/${defaultPersona}.yaml`, {
    schemaVersion: 'workflow.persona/v1', ref: ref(`persona.${defaultPersona}`), traits: [], accountBindingRef: null, roleScopes: [], stateRecipeRef: null, dataVolumeRecipeRef: null, entitlementRef: null, connectorStateRef: null,
    authRecipeRef: { $file: `.${defaultAuth}` },
    locale: config.personas[defaultPersona]!.locale ?? 'en-US', timezone: config.personas[defaultPersona]!.timezone ?? 'UTC',
    viewport: config.personas[defaultPersona]!.viewport ?? { width: 1280, height: 800 }, inputMode: config.personas[defaultPersona]!.inputMode ?? 'keyboard',
    reducedMotion: config.personas[defaultPersona]!.reducedMotion ?? true, cleanupPolicyRef: null,
  });
  write(compiledDir, 'components.yaml', {
    schemaVersion: 'workflow.component-profile/v1', ref: ref('components'),
    components: [{ componentId: APP_ID, kind: 'application', required: true, expectedIdentity: { kind: 'source_digest', sourceDigest: { algorithm: 'sha256', hex: identity.hex }, runtime: launch.runtime }, exclusionReason: null }],
  });
  write(compiledDir, 'environment.yaml', {
    schemaVersion: 'workflow.environment-plan/v1', ref: ref('environment'), class: 'isolated_candidate', origins: [ORIGIN],
    componentProfileRef: { $file: './components.yaml' }, credentialRecipeRef: { $file: defaultAuth },
    actionEnvelopeRef: null, personaLeasePolicyRef: null, budgetPolicyRef: null, networkProfileRef: null, clockProfileRef: null,
  });
  const budgetMs = config.defaults.caseTimeoutMs * selected.length + 30_000;
  write(compiledDir, 'host.yaml', {
    schemaVersion: 'workflow.host-plan/v1', ref: ref('host'), placement: 'local', adapter: 'local_process',
    launch: {
      componentId: APP_ID, command: launch.command, args: launch.args, cwd: relative(compiledDir, launchCwd).split(sep).join('/') || '.',
      env: config.app.env, portEnv: config.app.inject.port, dataDirEnv: config.app.inject.dataDir, credentialsEnv: config.app.inject.tokens,
      readiness: { path: config.app.health, timeoutMs: config.app.readyTimeoutMs },
      identitySourceFiles: identity.entries.map((entry) => entry.path),
      issuedCredentials: personas.map((name) => ({ name: `${name}_token`, subject: config.personas[name]!.subject })),
      portMode: 'assigned', runtime: launch.runtime,
    },
    mockResponsesRef: null, transportPolicy: 'in_process', isolationPolicy: 'fresh_directory_and_port', networkRules: ['loopback_only'],
    requestedResources: { cpu: 1, memoryMb: 512, diskMb: 256 }, requiredCapabilities: ['shell', 'network_origin:loopback', 'confirmed_cancel', 'artifact_delivery'],
    captureRequirements: [], sessionLifetimeMs: budgetMs + 60_000, cleanupReserveMs: 10_000,
  });
  write(compiledDir, 'runner.yaml', { schemaVersion: 'workflow.runner-profile/v1', ref: { id: runner.ref.id, revision: '1' }, adapter: hasBrowser ? 'browser' : 'http', maxStepsPerCase: 50, cancellation: 'confirmed' });
  write(compiledDir, 'surface/pack.yaml', { schemaVersion: 'workflow.surface-pack/v1', ref: { id: hasBrowser ? 'tracegrove.pack.browser' : 'tracegrove.pack.http-api', revision: '1' }, kind: hasBrowser ? 'web' : 'http_api', protocol: runner.protocol, stepKinds: runner.operations, oracles: runner.oracles, captureFormats: runner.captureFormats });
  write(compiledDir, 'surface/binding.yaml', { schemaVersion: 'workflow.surface-binding/v1', ref: ref('surface.http'), kind: hasBrowser ? 'web' : 'http_api', packRef: { $file: './pack.yaml' }, driverProfileRef: null, componentProfileRef: { $file: '../components.yaml' }, interaction: hasBrowser ? 'hybrid' : 'protocol', configurationSchemaRef: null, configurationRef: null, variantPolicyRef: null, requiredCapabilities: ['http.request', 'observe'] });
  const boundary = (boundaryId: string) => ({ boundaryId, adapterRef: null, mode: 'real', required: true, exclusionReasonRef: null, accountClass: 'local', readbackOracleRef: null, interceptorRef: null });
  write(compiledDir, 'fidelity.yaml', { schemaVersion: 'workflow.fidelity-profile/v1', ref: ref('fidelity.real'), lane: 'full_live_sandbox', boundaryProfileRef: null, boundaryRules: [boundary('application'), boundary('storage')] });
  const stage = { allowed: false, maxCalls: 0, maxTokens: 0, costCeilingCents: 0 };
  write(compiledDir, 'policy.yaml', { schemaVersion: 'workflow.intelligence-policy/v1', ref: ref('policy'), stages: { analysis: stage, drafting: stage, discovery: stage, diagnosis: stage, evaluation: stage, benchmark: stage }, replayInference: 'none' });

  // ---- fixture action registry (shared) ----
  const usedFixtures = new Set(selected.flatMap(({ flow }) => Object.values(flow.given)));
  for (const name of usedFixtures) if (!fixtures.has(name)) fail('unknown_fixture', `given: ${name} has no ${relative(root, join(fixtureDir, `${name}.fixture.yaml`))}`, 'create the fixture file or fix the name');
  const actions: Json[] = [];
  for (const name of [...usedFixtures].sort()) {
    const fx = fixtures.get(name)!;
    const scope: Record<string, Json> = {};
    const auth = authFor(fx.as, personas, defaultPersona, scope, `fixtures/${name}`);
    if (Object.keys(scope).length) fail('fixture_persona_unsupported', `fixtures/${name}: fixtures run as the default persona (${defaultPersona})`, 'remove as: from the fixture');
    const create = verbOf(fx.create);
    const body = fx.create.json ? Object.fromEntries(Object.keys(fx.create.json).map((key) => [key, `{${key}}`])) : null;
    actions.push({ actionId: `${name}.create/v1`, kind: 'http.request', effect: 'create', method: create.method, path: create.path, body, auth, expectStatus: fx.create.expect ?? null, captures: Object.entries(fx.save).map(([saveName, path]) => ({ name: saveName, from: 'json', path })) });
    actions.push({ actionId: `${name}.read/v1`, kind: 'http.request', effect: 'read', method: 'GET', path: fx.readback.GET, body: null, auth, expectStatus: null, captures: [] });
    actions.push({ actionId: `${name}.delete/v1`, kind: 'http.request', effect: 'delete', method: 'DELETE', path: fx.cleanup.DELETE, body: null, auth, expectStatus: fx.cleanup.expect ?? null, captures: [] });
    actions.push({ actionId: `${name}.gone/v1`, kind: 'http.request', effect: 'read', method: 'GET', path: fx.cleanup.gone.GET, body: null, auth, expectStatus: null, captures: [] });
  }
  if (actions.length) write(compiledDir, 'actions/registry.yaml', { schemaVersion: 'workflow.action-registry/v1', ref: ref('actions'), actions });

  // ---- cases ----
  const flows: CompiledFlowInfo[] = [];
  const suiteCases: Json[] = [];
  for (const { file, caseId, flow } of selected) {
    const rel = relative(root, file).split(sep).join('/');
    const given = new Map(Object.entries(flow.given).map(([alias, name]) => [alias, { fixture: name, outputs: Object.keys(fixtures.get(name)!.save) }]));
    const scope: Scope = { saved: new Map(), given };
    const steps: Json[] = [];
    const assertions: Json[] = [];
    const info: CompiledStepInfo[] = [];
    const ids = new Set<string>();
    const browserFlow = flow.steps.some(step => 'browser' in step);
    const methods = new Set<string>(browserFlow ? flow.browser!.allowMethods : []);
    const prefixes = new Set<string>(browserFlow ? flow.browser!.allowPaths : []);
    let creates = 0;
    const flowDefault = flow.as ?? defaultPersona;
    if (flowDefault !== defaultPersona) fail('flow_default_persona', `${rel}: flow-level as: ${flowDefault} differs from the default persona ${defaultPersona}`, 'set as: on the individual steps instead');
    flow.steps.forEach((step: FlowStep, index: number) => {
      const label = 'browser' in step ? `browser_${step.browser.kind}` : verbOf(step).method.toLowerCase();
      let id = step.name ? snake(step.name) : `${label}_${index + 1}`;
      while (ids.has(id)) id = `${id}_${index + 1}`;
      ids.add(id);
      const where = `${rel} step ${index + 1}${step.name ? ` (${step.name})` : ''}`;
      const inputs: Record<string, Json> = {};
      const timeoutMs = step.timeoutMs ?? config.defaults.stepTimeoutMs;
      if ('browser' in step) {
        const browser = compileBrowserStep({ step, id, timeoutMs, inputs, bind: value => bindTemplates(value, scope, inputs, where) });
        steps.push(browser.step);
        assertions.push({ id: `${id}.expect`, required: true, environmentClasses: ['isolated_candidate'], stepId: id,
          oracle: { name: browser.predicate ? 'browser.observation' : 'step.result', version: '1' },
          predicate: browser.predicate ?? { kind: 'step_result', value: 'completed' }, coverageTags: flow.tags });
        info.push({ id, name: step.name ?? id, method: 'UI', path: `${browser.label.toLowerCase()} ${browser.path}`, as: defaultPersona, expectStatus: step.expect?.status ?? null,
          expectation: step.expect?.text !== undefined ? JSON.stringify(step.expect.text) : step.expect?.status !== undefined ? `Status ${step.expect.status}` : 'Step completes' });
        return;
      }
      const { method, path } = verbOf(step);
      const boundPath = bindTemplates(path, scope, inputs, where) as string;
      const auth = authFor(step.as, personas, defaultPersona, inputs, where);
      const predicate = predicateFor(step.expect);
      methods.add(method); prefixes.add(firstSegment(path));
      if (method === 'POST') creates++;
      const captures = Object.entries(step.save ?? {}).map(([name, p]) => ({ name, from: 'json', path: p }));
      if (step.observe) {
        if (method !== 'GET' && method !== 'HEAD') fail('observe_requires_read', `${where}: observe: true needs GET or HEAD, not ${method}`, 'drop observe: or change the verb');
        if (!predicate) fail('observe_requires_expect', `${where}: an observe step needs expect: to know when to stop polling`, 'add expect:');
        if (step.json !== undefined) fail('observe_has_body', `${where}: observe steps cannot send json:`, 'remove json:');
        steps.push({ id, kind: 'observe', timeoutMs, inputs, retry: { attempts: 1 }, readback: { kind: 'http', method, path: boundPath, auth }, predicate, pollIntervalMs: 100, captures });
      } else {
        const body = step.json === undefined ? null : bindTemplates(step.json, scope, inputs, where);
        const headers = step.headers ? bindTemplates(step.headers, scope, inputs, where) : {};
        steps.push({ id, kind: 'http.request', timeoutMs, inputs, retry: { attempts: 1 }, method, path: boundPath, headers, body, auth, expectStatus: statusOf(step.expect), captures });
      }
      assertions.push({
        id: `${id}.expect`, required: true, environmentClasses: ['isolated_candidate'],
        oracle: predicate ? { name: 'http.observation', version: '1' } : { name: 'step.result', version: '1' },
        stepId: id, predicate: predicate ?? { kind: 'step_result', value: 'completed' }, coverageTags: flow.tags,
      });
      for (const name of Object.keys(step.save ?? {})) scope.saved.set(name, id);
      info.push({ id, name: step.name ?? id, method, path, as: step.as ?? defaultPersona, expectStatus: statusOf(step.expect), expectation: statusOf(step.expect) !== null ? `Status ${statusOf(step.expect)}` : predicate ? 'Configured response checks' : 'Step completes' });
    });
    let fixturePlanRef: Json = null;
    if (given.size) {
      const recipeRel = `fixtures/${caseId}.recipe.yaml`;
      const entities = [...given.entries()].map(([alias, { fixture: name }]) => {
        const fx = fixtures.get(name)!;
        const create = verbOf(fx.create);
        methods.add(create.method); methods.add('GET'); methods.add('DELETE');
        for (const p of [create.path, fx.readback.GET, fx.cleanup.DELETE, fx.cleanup.gone.GET]) prefixes.add(firstSegment(p));
        creates++;
        const values = Object.fromEntries(Object.entries(fx.create.json ?? {}).map(([key, value]) => {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const v = value as Record<string, unknown>;
            if (typeof v.words === 'number' && Object.keys(v).length === 1) return [key, { kind: 'generator', generatorId: 'words', args: { count: v.words } }];
            if (v.slug === true && Object.keys(v).length === 1) return [key, { kind: 'generator', generatorId: 'slug', args: {} }];
            if (v.uuid === true && Object.keys(v).length === 1) return [key, { kind: 'generator', generatorId: 'uuid', args: {} }];
            if (v.int && typeof v.int === 'object' && Object.keys(v).length === 1) return [key, { kind: 'generator', generatorId: 'int', args: v.int as Record<string, unknown> }];
          }
          return [key, { kind: 'literal', value }];
        }));
        const readPredicate = predicateFor(fx.readback.expect) ?? { kind: 'status_equals', value: 200 };
        return {
          entityKey: alias, modelId: name, actionId: `${name}.create/v1`, dependsOn: [], traits: [], values, outputNames: Object.keys(fx.save),
          readback: { actionId: `${name}.read/v1`, predicate: readPredicate },
          cleanup: { actionId: `${name}.delete/v1`, absenceReadback: { actionId: `${name}.gone/v1`, expectStatus: fx.cleanup.gone.status } },
        };
      });
      write(compiledDir, recipeRel, {
        schemaVersion: 'workflow.seed-recipe/v1', ref: ref(`${caseId}.recipe`), intent: `Fixtures for ${flow.title}`, modelCatalogRef: null,
        actionRegistryRef: { $file: '../actions/registry.yaml' }, entities, relationBindings: [], cleanupStrategy: 'reverse_dependency_order', lifecyclePolicy: 'application_api',
        generation: { logicalSeed: caseId, generatorVersion: '1', locale: 'en-US', timezone: 'UTC', logicalClock: '2026-01-01T00:00:00Z' },
      });
      const recipe = parseAs(SeedRecipe, new ProjectLoader(compiledDir).loadDocument(join(compiledDir, recipeRel)).value, 'recipe');
      const payload = materializeLogicalPayload(recipe, AUTHORING_SCOPE);
      const { scope: _scope, ...payloadRest } = payload;
      write(compiledDir, `fixtures/${caseId}.payload.yaml`, { ...payloadRest, ref: { id: payload.ref.id, revision: payload.ref.revision } });
      write(compiledDir, `fixtures/${caseId}.plan.yaml`, {
        schemaVersion: 'workflow.fixture-plan/v1', kind: 'case', ref: ref(`${caseId}.fixture-plan`),
        seedRecipeRef: { $file: `./${caseId}.recipe.yaml` }, modelCatalogRef: null, logicalPayloadRef: { $file: `./${caseId}.payload.yaml` },
        outputBindingsSchemaRef: null, effectEnvelopeRef: null, limitPolicyRef: null,
      });
      fixturePlanRef = { $file: `../fixtures/${caseId}.plan.yaml` };
    }
    write(compiledDir, `cases/${caseId}.yaml`, {
      schemaVersion: 'workflow.case/v1', ref: { id: caseId, revision: '1' }, purpose: flow.title, workflowId: caseId,
      requirementRefs: [], sourceRefs: [], sourceAnalysisRef: null, risk: flow.risk, surface: browserFlow ? 'hybrid' : 'api', surfaceBindingRef: { $file: '../surface/binding.yaml' },
      proofClaim: `The locally launched ${config.project} app, at the attested source digest, satisfies "${flow.title}" through its ${browserFlow ? 'browser and HTTP surfaces' : 'HTTP API'}. Local application behavior, not deployment.`,
      environmentClasses: ['isolated_candidate'], requiredCapabilities: ['http.request', 'observe', ...(browserFlow ? ['ui.navigate', 'ui.action', 'ui.observe'] : []), ...(given.size ? ['fixture.http'] : [])],
      requiredBoundaries: [{ boundaryId: 'application', mode: 'real' }, { boundaryId: 'storage', mode: 'real' }],
      dependencyCases: [], personaRef: { $file: `../personas/${defaultPersona}.yaml` }, datasetRef: null, fixturePlanRef, navigationRef: null, preconditions: [],
      steps, assertions,
      effects: { mode: 'designated_writes', allowedHosts: [ORIGIN], allowedMethods: [...methods].sort(), allowedResourcePrefixes: [...prefixes].sort(), maxCreates: creates, maxMessages: 0, maxJobs: 0, cleanupRecipeRef: null },
      limits: { deadlineMs: config.defaults.caseTimeoutMs, maxProviderRequests: 0, maxTokens: 0, costCeilingCents: 0, maxBrowserActions: browserFlow ? flow.browser!.maxActions : 0, maxArtifactBytes: browserFlow ? flow.browser!.maxArtifactBytes : 1048576, diagnosticRetries: 0, concurrencyGroup: config.project },
      capture: { stepEvents: true, networkMetadata: true, trace: 'optional', video: browserFlow ? 'required' : 'optional', redactionPolicyRef: null, retentionPolicyRef: null },
      baselineRef: null, generation: null,
    });
    suiteCases.push({ caseRef: `./${caseId}.yaml`, required: true, profiles: null });
    flows.push({ caseId, file: rel, title: flow.title, tags: flow.tags, risk: flow.risk, steps: info, fixtures: [...given.keys()] });
  }
  write(compiledDir, 'cases/suite.yaml', { schemaVersion: 'workflow.suite/v1', id: `${config.project}.suite`, cases: suiteCases });
  write(compiledDir, 'workflow.yaml', {
    schemaVersion: 'workflow.config/v1', project: config.project, suiteRef: './cases/suite.yaml', defaultProfile: PROFILE, outputDir: './output', sourceSetRef: null,
    executionHostRef: './host.yaml', intelligencePolicyRef: './policy.yaml',
    profiles: { [PROFILE]: { class: 'isolated_candidate', environmentPlanRef: './environment.yaml', hostPlanRef: null, personaRef: `./personas/${defaultPersona}.yaml`, fixturePlanRef: null, fidelityProfileRef: './fidelity.yaml', runnerRef: './runner.yaml', budget: { deadlineMs: budgetMs, costCeilingCents: 0 } } },
  });
  return { root, configPath: resolve(configPath), compiledDir, workflowConfigPath: join(compiledDir, 'workflow.yaml'), config, flows, sourceDigest: identity.hex, sourceFiles };
}
