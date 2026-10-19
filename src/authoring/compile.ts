/**
 * Compile the authoring files into a normal `workflow.config/v1` project under
 * `.tracegrove/compiled/`. The compiled folder is loaded by the ordinary corpus loader, so the
 * planner, executor, reducer and bundle verifier see exactly what they always see.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
import { NATIVE_JOB_RUNNER_CAPABILITIES } from '../adapters/job/capabilities.ts';
import { MCP_RUNNER_CAPABILITIES } from '../adapters/mcp/capabilities.ts';
import { defaultSourceGlobs, expandSources } from './sources.ts';
import { readAuthoringModule } from './module.ts';
import { applicationLaunch } from './appLaunch.ts';
import { describeSnapshot, resolveVerificationSource } from './verificationSource.ts';
import type { VerificationSourceBinding } from './sourceSelection.ts';
import { caseCapabilities } from '../core/capabilities.ts';
import { flowEnabledIn, resolveEnvironment } from '../environments/resolve.ts';
import type { ResolvedEnvironment } from '../environments/schema.ts';
import { expectedRelease, targetBinding } from '../environments/binding.ts';
import { digestOfValue } from '../protocol/index.ts';

export const CONFIG_FILE = 'tracegrove.config.yaml';
export const CONFIG_FILES = [CONFIG_FILE, 'tracegrove.config.ts'] as const;
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
  sourceBinding: VerificationSourceBinding;
  /** Flows the selection matched that this environment does not run (they lack it under envs:). */
  skipped: Array<{ caseId: string; file: string; title: string; envs: string[] }>;
  /** The environment this corpus was compiled for (local unless --env names another). */
  environment: ResolvedEnvironment;
  /** Deployed or containerized target: origin (url only) and the release the plan pins, if any. */
  target: { origin: string | null; expectedRelease: string | null } | null;
};
export type CompileOptions = { grep?: string | undefined; tags?: string[] | undefined; sourceSnapshot?: string | undefined; sourceRepositoryRole?: string | undefined; env?: string | undefined };

type Json = unknown;

function fail(code: string, detail: string, action: string): never {
  throw new Blocked([{ code, detail, owner: 'test author', action }]);
}

function readAuthoring<T extends z.ZodType>(schema: T, path: string, root: string): z.infer<T> {
  const rel = relative(root, path) || path;
  let raw: unknown;
  try { raw = path.endsWith('.ts') ? readAuthoringModule(path) : parseYaml(readFileSync(path, 'utf8'), { strict: true }); }
  catch (error) {
    if (error instanceof Blocked) throw error;
    fail('invalid_yaml', `${rel}: ${(error as Error).message.split('\n')[0]}`, `fix the YAML syntax in ${rel}`);
  }
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${rel}${issue.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue.message}`);
    throw new Blocked(issues.map((detail) => ({ code: 'invalid_authoring_file', detail, owner: 'test author', action: `edit ${rel}` })));
  }
  return parsed.data;
}

/** One project has one config; never silently choose between YAML and TypeScript. */
export function configInDirectory(dir: string): string | null {
  const found = CONFIG_FILES.map(name => join(dir, name)).filter(path => existsSync(path));
  if (found.length > 1) fail('ambiguous_config', `${dir}: found ${CONFIG_FILES.join(' and ')}`, 'keep one project config, or pass --config explicitly');
  return found[0] ?? null;
}

/** Walk up from `start` to the nearest project config. */
export function findConfig(start: string): string {
  let dir = resolve(start);
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    while (true) {
      const candidate = configInDirectory(dir);
      if (candidate) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    fail('config_not_found', `no ${CONFIG_FILES.join(' or ')} in ${resolve(start)} or any parent`, 'run tracegrove init');
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
  const rel = relative(testDir, file).split(sep).join('/').replace(/\.flow\.(?:ya?ml|ts)$/, '');
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

function write(dir: string, rel: string, doc: Json): void {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `# generated by tracegrove compile; edit the source flow or project config instead\n${stringify(doc, { lineWidth: 0 })}`);
}

/** The environment classes a flow's assertions apply to (R5). One place derives them. */
export function flowEnvironments(flow: Flow, environment: Pick<ResolvedEnvironment, 'class'>): Array<ResolvedEnvironment['class']> {
  void flow;
  return [environment.class];
}

export function compileProject(configPath: string, options: CompileOptions = {}): CompileResult {
  const root = dirname(resolve(configPath));
  const snapshotSource = resolveVerificationSource(root, options.sourceSnapshot);
  if (options.sourceRepositoryRole !== undefined && !snapshotSource) fail('snapshot_repository_unbound', 'A repository role needs a selected source snapshot.', 'pass --source-snapshot with --source-repository-role');
  const config = loadAuthoringConfig(resolve(configPath));
  const environment = resolveEnvironment(config, options.env ?? 'local');
  const launched = environment.kind === 'launch';
  if (!launched && snapshotSource) fail('snapshot_requires_launch', `environment ${environment.name} is not launched from source, so --source-snapshot does not apply`, 'drop --source-snapshot, or run against a launched environment');
  const testDir = resolve(root, config.testDir);
  const appRoot = resolve(snapshotSource?.root ?? root, config.app.root);
  const compiledDir = join(root, STATE_DIR, 'compiled');
  const personas = Object.keys(config.personas);
  const defaultPersona = personas[0]!;

  // ---- discover flows and fixtures ----
  const fixtureDir = join(testDir, 'fixtures');
  const fixtures = new Map<string, Fixture>();
  const fixturePaths = new Map<string, string>();
  for (const file of [...findFiles(fixtureDir, '.fixture.yaml'), ...findFiles(fixtureDir, '.fixture.ts')].sort()) {
    const name = basename(file).replace(/\.fixture\.(?:yaml|ts)$/, '');
    if (fixturePaths.has(name)) fail('duplicate_fixture', `fixture ${name} has more than one authoring file`, 'keep one format for each fixture');
    fixturePaths.set(name, file);
  }
  for (const [name, file] of fixturePaths) fixtures.set(name, readAuthoring(Fixture, file, root));
  const flowFiles = [...findFiles(testDir, '.flow.yaml'), ...findFiles(testDir, '.flow.yml'), ...findFiles(testDir, '.flow.ts')].sort();
  if (flowFiles.length === 0) fail('no_flows', `no *.flow.yaml under ${relative(root, testDir) || '.'}`, 'write a flow, or run tracegrove init for an example');
  const indexedFlows = flowFiles.map((file) => ({ file, caseId: caseIdFor(config.project, testDir, file) }));
  const seen = new Set<string>();
  for (const { caseId, file } of indexedFlows) {
    if (seen.has(caseId)) fail('duplicate_case_id', `${relative(root, file)} derives ${caseId}, which another flow already uses`, 'rename one of the files');
    seen.add(caseId);
  }
  const parsedFlows = indexedFlows.map(row => ({ ...row, flow: readAuthoring(Flow, row.file, root) }));
  const matched = parsedFlows.filter(({ caseId, flow, file }) =>
    (!options.grep || caseId.includes(options.grep) || flow.title.toLowerCase().includes(options.grep.toLowerCase()) || relative(root, file).includes(options.grep))
    && (!options.tags?.length || options.tags.some((tag) => flow.tags.includes(tag))));
  const selected = matched.filter(({ flow }) => flowEnabledIn(flow, environment.name));
  if (matched.length > 0 && selected.length === 0) fail('no_flows_for_environment', `none of the ${matched.length} matching flow(s) lists ${environment.name} under envs:`, `add envs: [${environment.name}] to flows that may run there (flows default to [local])`);
  if (selected.length === 0) fail('no_flows_selected', `no flow matches${options.grep ? ` --grep ${options.grep}` : ''}${options.tags?.length ? ` --tag ${options.tags.join(',')}` : ''}`, 'run tracegrove list to see flow ids and tags');
  const hasBrowser = selected.some(({ flow }) => flow.steps.some(step => 'browser' in step));
  const hasJobs = selected.some(({ flow }) => flow.steps.some(step => 'job' in step));
  const hasMcp = selected.some(({ flow }) => flow.steps.some(step => 'mcp' in step));
  if (hasMcp && (hasJobs || hasBrowser)) fail('mixed_mcp_runner_unqualified', 'MCP, native job and browser runners are not qualified together', 'select separate flows with --grep');
  if (hasJobs && hasBrowser) fail('mixed_native_browser_unqualified', 'Native job and browser runners are not qualified together', 'run separate flows with --grep');
  if (hasJobs && (config.app.adapter !== 'node' || config.app.nativeJobs !== 'node_ipc/v1')) fail('native_job_bridge_required', 'Native job steps require an opted-in Node application', 'set app.nativeJobs: node_ipc/v1 and implement its handshake');
  const runner = hasMcp ? MCP_RUNNER_CAPABILITIES : hasJobs ? NATIVE_JOB_RUNNER_CAPABILITIES : hasBrowser ? BROWSER_RUNNER_CAPABILITIES : HTTP_RUNNER_CAPABILITIES;

  // ---- attested source identity (launched apps) or target binding (deployed, containerized) ----
  // Sources are relative to the launch cwd (the manage.py folder for django, else app.root).
  const launch = launched ? applicationLaunch(config, root, appRoot) : null;
  const launchCwd = launch?.cwd ?? root;
  const sourceSnapshot = launch ? snapshotSource?.bind(launchCwd, compiledDir, options.sourceRepositoryRole) : undefined;
  const sourceSelection = sourceSnapshot?.repositoryRole ? snapshotSource!.selection(sourceSnapshot) : null;
  if (launched && config.app.adapter === 'command') fail('command_adapter_unqualified', 'Shell wrappers cannot supply an independently observed application runtime.', 'use the node, fastapi or django preset until a qualified command host is configured');
  let sourceFiles: string[] = [];
  let identity: ReturnType<typeof sourceIdentityDigest> | null = null;
  if (launch) {
    const runtime = observeApplicationRuntimeSync(launch.command, launchCwd, process.env.PATH ?? '');
    launch.command = runtime.executable;
    launch.runtime = runtime.runtime;
    const extraSkip = [relative(launchCwd, testDir).split(sep).join('/')].filter((p) => p && !p.startsWith('..'));
    sourceFiles = expandSources(launchCwd, config.app.sources ?? defaultSourceGlobs(), extraSkip);
    identity = sourceIdentityDigest(launchCwd, sourceFiles);
  }
  const declared = targetBinding(environment, config, root, compiledDir);
  const release = declared ? expectedRelease(declared) : null;
  // The host compares the release it observes with this before any step runs (identity_mismatch).
  const binding = declared && release ? { ...declared, identity: { ...declared.identity, expect: release } } : declared;
  const targetOrigin = binding?.origin ?? ORIGIN;

  rmSync(compiledDir, { recursive: true, force: true });
  mkdirSync(compiledDir, { recursive: true });
  if (sourceSelection && sourceSnapshot) {
    write(compiledDir, 'source-snapshot.yaml', sourceSnapshot.snapshot);
    write(compiledDir, 'source-revisions.yaml', sourceSelection.matrix);
    write(compiledDir, 'source-selection.yaml', { ...sourceSelection.selection,
      revisionMatrixRef: { $file: './source-revisions.yaml' },
      repositories: sourceSelection.selection.repositories.map(repository => ({ ...repository, sourceObjectsRef: { $file: './source-snapshot.yaml' } })),
    });
  }
  const ref = (id: string) => ({ id: `${config.project}.${id}`, revision: '1' });

  // ---- shared definitions ----
  const defaultAuth = `./auth/${defaultPersona}.yaml`;
  for (const name of personas) {
    const bound = binding?.personas.find(p => p.persona === name);
    const hostIssued = !binding || bound?.from === 'host_issued';
    const bearer = !bound || bound.auth.kind === 'bearer';
    write(compiledDir, `auth/${name}.yaml`, { schemaVersion: 'workflow.auth-recipe/v1', ref: ref(`auth.${name}`), kind: hostIssued ? 'host_issued' : 'env_credential', credentialName: `${name}_token`, header: bearer ? 'authorization' : null, scheme: bearer ? 'Bearer' : null });
  }
  write(compiledDir, `personas/${defaultPersona}.yaml`, {
    schemaVersion: 'workflow.persona/v1', ref: ref(`persona.${defaultPersona}`), traits: [], accountBindingRef: null, roleScopes: [], stateRecipeRef: null, dataVolumeRecipeRef: null, entitlementRef: null, connectorStateRef: null,
    authRecipeRef: { $file: `.${defaultAuth}` },
    locale: config.personas[defaultPersona]!.locale ?? 'en-US', timezone: config.personas[defaultPersona]!.timezone ?? 'UTC',
    viewport: config.personas[defaultPersona]!.viewport ?? { width: 1280, height: 800 }, inputMode: config.personas[defaultPersona]!.inputMode ?? 'keyboard',
    reducedMotion: config.personas[defaultPersona]!.reducedMotion ?? true, cleanupPolicyRef: null,
  });
  write(compiledDir, 'components.yaml', {
    schemaVersion: 'workflow.component-profile/v1', ref: ref('components'),
    // A launched app has a launcher-computed source digest the kernel trusts. A deployment or container
    // only declares its release: the host blocks on a mismatch before running, and the bundle records it,
    // but it is not claimed as a verified identity.
    components: [identity && launch
      ? { componentId: APP_ID, kind: 'application', required: true, expectedIdentity: { kind: 'source_digest', sourceDigest: { algorithm: 'sha256', hex: identity.hex }, runtime: launch.runtime }, exclusionReason: null }
      : { componentId: APP_ID, kind: 'application', required: false, expectedIdentity: release ? { kind: 'declared_release', release } : null,
        exclusionReason: release
          ? `environment ${environment.name}: the target declares release ${release}; the host refuses any other release, but a declared release is not a launcher-computed digest`
          : `environment ${environment.name} does not pin a release; the observed release is recorded, not compared (set target.release.expect to require one)` }],
  });
  write(compiledDir, 'environment.yaml', {
    schemaVersion: 'workflow.environment-plan/v1', ref: ref('environment'), class: environment.class, origins: [targetOrigin],
    componentProfileRef: { $file: './components.yaml' }, credentialRecipeRef: { $file: defaultAuth },
    actionEnvelopeRef: null, personaLeasePolicyRef: null, budgetPolicyRef: null, networkProfileRef: null, clockProfileRef: null,
  });
  const budgetMs = config.defaults.caseTimeoutMs * selected.length + 30_000;
  if (launch && identity) write(compiledDir, 'host.yaml', {
    schemaVersion: 'workflow.host-plan/v1', ref: ref('host'), placement: 'local', adapter: 'local_process',
    launch: {
      componentId: APP_ID, command: launch.command, args: launch.args, cwd: relative(compiledDir, launchCwd).split(sep).join('/') || '.',
      env: config.app.env, portEnv: config.app.inject.port, dataDirEnv: config.app.inject.dataDir, credentialsEnv: config.app.inject.tokens,
      readiness: { path: config.app.health, timeoutMs: config.app.readyTimeoutMs },
      identitySourceFiles: identity.entries.map((entry) => entry.path),
      issuedCredentials: personas.map((name) => ({ name: `${name}_token`, subject: config.personas[name]!.subject })),
      portMode: 'assigned', runtime: launch.runtime,
      ...(sourceSnapshot ? { sourceSnapshot } : {}),
      ...(hasJobs ? { nativeJobs: config.app.nativeJobs } : {}),
    },
    mockResponsesRef: null, transportPolicy: 'in_process', isolationPolicy: 'fresh_directory_and_port', networkRules: ['loopback_only'],
    requestedResources: { cpu: 1, memoryMb: 512, diskMb: 256 }, requiredCapabilities: ['shell', 'network_origin:loopback', 'confirmed_cancel', 'artifact_delivery', ...(hasJobs ? ['native_job'] : [])],
    captureRequirements: [], sessionLifetimeMs: budgetMs + 60_000, cleanupReserveMs: 10_000,
  });
  else if (binding) write(compiledDir, 'host.yaml', {
    schemaVersion: 'workflow.host-plan/v1', ref: ref('host'), placement: binding.kind === 'url' ? 'local' : 'container', adapter: binding.kind, launch: null,
    mockResponsesRef: null, transportPolicy: 'in_process', isolationPolicy: binding.kind === 'url' ? 'none' : 'fresh_directory_and_port', networkRules: [binding.kind === 'url' ? 'declared_origins_only' : 'loopback_only'],
    requestedResources: { cpu: 1, memoryMb: 512, diskMb: 256 },
    requiredCapabilities: binding.kind === 'url' ? ['network_origin:external', 'confirmed_cancel', 'artifact_delivery'] : ['container', 'network_origin:loopback', 'confirmed_cancel', 'artifact_delivery'],
    captureRequirements: [], sessionLifetimeMs: budgetMs + 60_000 + binding.readiness.timeoutMs, cleanupReserveMs: binding.kind === 'url' ? 15_000 : 60_000, binding,
  });
  const runnerAdapter = hasMcp ? 'mcp' : hasJobs ? 'native_job' : hasBrowser ? 'browser' : 'http';
  const surfaceKind = hasMcp ? 'mcp' : hasJobs ? 'job' : hasBrowser ? 'web' : 'http_api';
  write(compiledDir, 'runner.yaml', { schemaVersion: 'workflow.runner-profile/v1', ref: { id: runner.ref.id, revision: '1' }, adapter: runnerAdapter, maxStepsPerCase: 50, cancellation: 'confirmed' });
  write(compiledDir, 'surface/pack.yaml', { schemaVersion: 'workflow.surface-pack/v1', ref: { id: hasMcp ? 'tracegrove.pack.mcp' : hasJobs ? 'tracegrove.pack.native-job' : hasBrowser ? 'tracegrove.pack.browser' : 'tracegrove.pack.http-api', revision: '1' }, kind: surfaceKind, protocol: runner.protocol, stepKinds: runner.operations, oracles: runner.oracles, captureFormats: runner.captureFormats });
  write(compiledDir, 'surface/binding.yaml', { schemaVersion: 'workflow.surface-binding/v1', ref: ref('surface.http'), kind: surfaceKind, packRef: { $file: './pack.yaml' }, driverProfileRef: null, componentProfileRef: { $file: '../components.yaml' }, interaction: hasBrowser ? 'hybrid' : 'protocol', configurationSchemaRef: null, configurationRef: null, variantPolicyRef: null, requiredCapabilities: caseCapabilities({ mcp: hasMcp, browser: false, fixtures: false }) });
  // A deployment is a test sandbox (or designated production when read-only); tracegrove cannot see its storage.
  const accountClass = binding?.kind === 'url' ? (binding.writes === 'none' ? 'designated_production' : 'test_sandbox') : 'local';
  const boundaryIds = launched ? ['application', 'storage'] : ['application'];
  const boundary = (boundaryId: string) => ({ boundaryId, adapterRef: null, mode: 'real', required: true, exclusionReasonRef: null, accountClass, readbackOracleRef: null, interceptorRef: null });
  write(compiledDir, 'fidelity.yaml', { schemaVersion: 'workflow.fidelity-profile/v1', ref: ref('fidelity.real'), lane: 'full_live_sandbox', boundaryProfileRef: null, boundaryRules: boundaryIds.map(boundary) });
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
    const classes = flowEnvironments(flow, environment);
    const flowDefault = flow.as ?? defaultPersona;
    if (flowDefault !== defaultPersona) fail('flow_default_persona', `${rel}: flow-level as: ${flowDefault} differs from the default persona ${defaultPersona}`, 'set as: on the individual steps instead');
    flow.steps.forEach((step: FlowStep, index: number) => {
      const label = 'mcp' in step ? 'mcp_call' : 'job' in step ? `job_${step.job.action}` : 'browser' in step ? `browser_${step.browser.kind}` : verbOf(step).method.toLowerCase();
      let id = step.name ? snake(step.name) : `${label}_${index + 1}`;
      while (ids.has(id)) id = `${id}_${index + 1}`;
      ids.add(id);
      const where = `${rel} step ${index + 1}${step.name ? ` (${step.name})` : ''}`;
      const inputs: Record<string, Json> = {};
      const timeoutMs = step.timeoutMs ?? config.defaults.stepTimeoutMs;
      if ('mcp' in step) {
        if (statusOf(step.expect) !== null) fail('mcp_http_expectation', where, 'use expect.json for MCP protocol observations');
        const command = { ...step.mcp, arguments: bindTemplates(step.mcp.arguments as Json, scope, inputs, where) };
        const auth = authFor(step.as, personas, defaultPersona, inputs, where);
        const configured = predicateFor(step.expect);
        const predicate = { kind: 'all', predicates: [{ kind: 'json_path_equals', path: 'body.isError', value: false }, ...(configured ? [configured] : [])] };
        const captures = Object.entries(step.save ?? {}).map(([name, path]) => ({ name, from: 'json', path }));
        steps.push({ id, kind: 'mcp.call', command, auth, captures, timeoutMs, inputs, retry: { attempts: 1 } });
        assertions.push({ id: `${id}.expect`, required: true, environmentClasses: classes, stepId: id,
          oracle: { name: 'mcp.observation', version: '1' }, predicate, coverageTags: flow.tags });
        methods.add('POST'); prefixes.add(step.mcp.endpoint);
        for (const name of Object.keys(step.save ?? {})) scope.saved.set(name, id);
        info.push({ id, name: step.name ?? id, method: 'MCP', path: `${step.mcp.endpoint} ${step.mcp.tool}`, as: step.as ?? defaultPersona, expectStatus: null, expectation: 'MCP tool result and configured facts' });
        return;
      }
      if ('job' in step) {
        if (statusOf(step.expect) !== null) fail('native_job_http_expectation', where, 'use expect.json for native job facts');
        const command = bindTemplates(step.job as Json, scope, inputs, where);
        const auth = authFor(step.as, personas, defaultPersona, inputs, where);
        const predicate = predicateFor(step.expect);
        if (step.job.action === 'read' && !predicate) fail('native_job_read_expectation', where, 'add expect.json to bound native readback polling');
        const captures = Object.entries(step.save ?? {}).map(([name, path]) => ({ name, from: 'json', path }));
        steps.push({ id, kind: step.job.action === 'read' ? 'job.observe' : step.job.action === 'cancel' ? 'job.cancel' : 'job.submit', command, auth, captures, timeoutMs, inputs, retry: { attempts: 1 },
          ...(step.job.action === 'read' ? { predicate, pollIntervalMs: 50 } : {}) });
        assertions.push({ id: `${id}.expect`, required: true, environmentClasses: classes, stepId: id,
          oracle: { name: predicate ? 'job.observation' : 'step.result', version: '1' }, predicate: predicate ?? { kind: 'step_result', value: 'completed' }, coverageTags: flow.tags });
        for (const name of Object.keys(step.save ?? {})) scope.saved.set(name, id);
        info.push({ id, name: step.name ?? id, method: 'JOB', path: `${step.job.action} ${step.job.queue}`, as: step.as ?? defaultPersona, expectStatus: null, expectation: predicate ? 'Configured native job facts' : 'Native operation completes' });
        return;
      }
      if ('browser' in step) {
        const browser = compileBrowserStep({ step, id, timeoutMs, inputs, bind: value => bindTemplates(value, scope, inputs, where) });
        steps.push(browser.step);
        assertions.push({ id: `${id}.expect`, required: true, environmentClasses: classes, stepId: id,
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
        id: `${id}.expect`, required: true, environmentClasses: classes,
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
      requirementRefs: [], sourceRefs: [], sourceAnalysisRef: null, risk: flow.risk, surface: hasMcp ? 'integration' : browserFlow ? 'hybrid' : 'api', surfaceBindingRef: { $file: '../surface/binding.yaml' },
      proofClaim: launched
        ? `The locally launched ${config.project} app, at the attested source digest, satisfies "${flow.title}" through its ${hasMcp ? 'MCP and HTTP protocols' : browserFlow ? 'browser and HTTP surfaces' : 'HTTP API'}. Local application behavior, not deployment.`
        : `The ${config.project} ${binding!.kind === 'url' ? `deployment at ${binding!.origin}` : `${binding!.kind} target`} in environment ${environment.name} (${environment.class})${release ? `, reporting release ${release},` : ''} satisfies "${flow.title}" through its ${browserFlow ? 'browser and HTTP surfaces' : 'HTTP API'}, as the configured personas.`,
      environmentClasses: classes, requiredCapabilities: caseCapabilities({ mcp: hasMcp, browser: browserFlow, fixtures: given.size > 0 }),
      requiredBoundaries: boundaryIds.map(boundaryId => ({ boundaryId, mode: 'real' })),
      dependencyCases: [], personaRef: { $file: `../personas/${defaultPersona}.yaml` }, datasetRef: null, fixturePlanRef, navigationRef: null, preconditions: [],
      steps, assertions,
      effects: { mode: binding?.writes === 'none' ? 'read_only' : 'designated_writes', allowedHosts: [targetOrigin], allowedMethods: [...methods].sort(), allowedResourcePrefixes: [...prefixes].sort(), maxCreates: creates, maxMessages: 0, maxJobs: flow.effects?.maxJobs ?? 0, cleanupRecipeRef: null,
        ...(hasJobs ? { allowedJobQueues: [...new Set(flow.steps.flatMap(step => 'job' in step ? [step.job.queue] : []))] } : {}),
        ...(hasMcp ? { maxMcpCalls: flow.effects?.maxMcpCalls ?? 0, allowedMcpTools: flow.effects?.allowedMcpTools ?? [] } : {}) },
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
    ...(sourceSelection ? { sourceSelectionRef: './source-selection.yaml' } : {}),
    executionHostRef: './host.yaml', intelligencePolicyRef: './policy.yaml',
    profiles: { [PROFILE]: { class: environment.class, environmentPlanRef: './environment.yaml', hostPlanRef: null, personaRef: `./personas/${defaultPersona}.yaml`, fixturePlanRef: null, fidelityProfileRef: './fidelity.yaml', runnerRef: './runner.yaml', budget: { deadlineMs: budgetMs, costCeilingCents: 0 } } },
  });
  return { root, configPath: resolve(configPath), compiledDir, workflowConfigPath: join(compiledDir, 'workflow.yaml'), config, flows,
    sourceDigest: identity?.hex ?? digestOfValue(binding).hex, sourceFiles,
    sourceBinding: snapshotSource ? describeSnapshot(snapshotSource.snapshot) : { kind: 'working_tree' },
    skipped: matched.filter(row => !selected.includes(row)).map(({ caseId, file, flow }) => ({ caseId, file: relative(root, file).split(sep).join('/'), title: flow.title, envs: flow.envs ?? ['local'] })),
    environment, target: binding ? { origin: binding.origin, expectedRelease: release } : null };
}
