import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileProject, findConfig } from '../src/authoring/compile.ts';
import { runTests, resolveRun } from '../src/authoring/run.ts';
import { detect, initProject } from '../src/authoring/init.ts';
import { expandSources, globToRegExp } from '../src/authoring/sources.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { Blocked } from '../src/core/errors.ts';
import { HostPlan } from '../src/protocol/index.ts';
import { observeApplicationRuntimeSync } from '../src/hosts/runtime.ts';
import * as atomicFiles from '../src/core/atomicFiles.ts';

const SAMPLES = join(import.meta.dirname, '..', 'src', 'samples');
const temps: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function copy(sample: string): string {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-authoring-'));
  temps.push(root);
  cpSync(join(SAMPLES, sample), root, { recursive: true, filter: (src) => !src.includes('.tracegrove') });
  return root;
}

function blockedCodes(fn: () => unknown): string[] {
  try { fn(); } catch (error) { if (error instanceof Blocked) return error.reasons.map((r) => `${r.code}: ${r.detail}`); throw error; }
  return [];
}

function writeFlow(root: string, rel: string, text: string): void {
  const path = join(root, 'tracegrove', rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

describe('authoring compiler', () => {
  it('compiles the notes sample into a v1 corpus the planner admits without blockers', () => {
    const root = copy('notes-api');
    const compiled = compileProject(join(root, 'tracegrove.config.yaml'));
    expect(compiled.flows.map((f) => f.caseId)).toEqual(['notes.create-read-delete', 'notes.list']);
    expect(compiled.sourceFiles).toEqual(['app/app.mjs', 'app/http.mjs']);
    const bundle = plan({ project: loadProject(compiled.workflowConfigPath), profileName: 'real', scope: localScope() });
    expect(bundle.blockers).toEqual([]);
    expect(bundle.request?.caseRefs).toHaveLength(2);
    const host = loadProject(compiled.workflowConfigPath).corpus.findById('notes.host')[0]!.value;
    expect(HostPlan.parse(host).launch?.command).toBe(process.execPath);
  });

  it('derives the effect envelope and assertions from the steps', () => {
    const root = copy('notes-api');
    const compiled = compileProject(join(root, 'tracegrove.config.yaml'), { grep: 'create-read-delete' });
    const project = loadProject(compiled.workflowConfigPath);
    const doc = project.corpus.findById('notes.create-read-delete')[0]!.value as {
      effects: { allowedMethods: string[]; allowedResourcePrefixes: string[]; maxCreates: number };
      assertions: Array<{ id: string }>; steps: Array<{ id: string; kind: string; inputs: Record<string, { kind: string }> }>;
    };
    expect(doc.effects.allowedMethods).toEqual(['DELETE', 'GET', 'POST']);
    expect(doc.effects.allowedResourcePrefixes).toEqual(['/notes']);
    expect(doc.effects.maxCreates).toBe(2);
    expect(doc.assertions.map((a) => a.id)).toEqual(['create.expect', 'read_back.expect', 'intruder_is_denied.expect', 'delete.expect', 'gone.expect', 'existing_note_untouched.expect']);
    expect(doc.steps.map((s) => s.kind)).toEqual(['http.request', 'observe', 'http.request', 'http.request', 'observe', 'observe']);
    expect(doc.steps[5]!.inputs.existing__noteId?.kind).toBe('fixture');
    expect(doc.steps[2]!.inputs.as_intruder?.kind).toBe('credential');
  });

  it('filters by --grep and --tag and refuses an empty selection', () => {
    const root = copy('notes-api');
    const config = join(root, 'tracegrove.config.yaml');
    expect(compileProject(config, { tags: ['smoke'] }).flows.map((f) => f.caseId)).toEqual(['notes.list']);
    expect(blockedCodes(() => compileProject(config, { grep: 'nothing-matches' }))[0]).toMatch(/^no_flows_selected/);
  });

  it('explains authoring mistakes with the file, step and a fix', () => {
    const root = copy('notes-api');
    const config = join(root, 'tracegrove.config.yaml');
    writeFlow(root, 'bad/typo.flow.yaml', 'title: typo\nsteps:\n  - name: create\n    POST: /notes\n    json: { title: a, body: b }\n    save: { noteId: note.id }\n  - GET: /notes/{noteid}\n');
    expect(blockedCodes(() => compileProject(config, { grep: 'typo' }))[0]).toMatch(/unknown_variable: tracegrove\/bad\/typo.flow.yaml step 2: \{noteid\} is not saved by an earlier step; did you mean \{noteId\}\?/);
    writeFlow(root, 'bad/typo.flow.yaml', 'title: two verbs\nsteps:\n  - GET: /notes\n    POST: /notes\n');
    expect(blockedCodes(() => compileProject(config, { grep: 'typo' }))[0]).toMatch(/invalid_authoring_file: .*steps.0: give exactly one of GET/);
    writeFlow(root, 'bad/typo.flow.yaml', 'title: who\nsteps:\n  - GET: /notes\n    as: admin\n');
    expect(blockedCodes(() => compileProject(config, { grep: 'typo' }))[0]).toMatch(/unknown_persona: .*as: admin is not declared/);
    writeFlow(root, 'bad/typo.flow.yaml', 'title: poll\nsteps:\n  - GET: /notes\n    observe: true\n');
    expect(blockedCodes(() => compileProject(config, { grep: 'typo' }))[0]).toMatch(/observe_requires_expect/);
  });

  it('finds the config by walking up from a nested folder', () => {
    const root = copy('notes-api');
    expect(findConfig(join(root, 'tracegrove', 'notes'))).toBe(join(root, 'tracegrove.config.yaml'));
  });

  it('blocks generic shell launches until their application runtime can be independently observed', () => {
    const root = copy('notes-api');
    const config = join(root, 'tracegrove.config.yaml');
    writeFileSync(config, readFileSync(config, 'utf8').replace('adapter: node', 'adapter: command').replace('entry: app/app.mjs', 'run: node app/app.mjs'));
    expect(blockedCodes(() => compileProject(config))[0]).toMatch(/^command_adapter_unqualified/);
  });
});

describe('tracegrove test', () => {
  it('never publishes a passed report or green JUnit when its exported evidence bundle is corrupt', async () => {
    const root = copy('notes-api');
    const write = atomicFiles.writeExclusiveDurable;
    vi.spyOn(atomicFiles, 'writeExclusiveDurable').mockImplementation((path, bytes) => {
      write(path, bytes);
      if (path.includes('.tracegrove-publish-') && path.endsWith('/campaign.json')) writeFileSync(path, '{}\n');
    });
    const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml'), grep: 'list' });
    expect(report.bundleVerified).toBe(false);
    expect(report.outcome).toBe('inconclusive');
    expect(report.exitCode).toBe(2);
    expect(readFileSync(join(report.runDir, 'junit.xml'), 'utf8')).toContain('name="evidence-integrity"');
    expect(readFileSync(join(report.runDir, 'junit.xml'), 'utf8')).toContain('errors="1"');
    expect(report.runDir).toContain('_inconclusive_');
  });
  it('runs the notes flows and writes a findable, verified run folder', async () => {
    const root = copy('notes-api');
    const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml') });
    expect(report.outcome).toBe('passed');
    expect(report.exitCode).toBe(0);
    expect(report.bundleVerified).toBe(true);
    expect(report.totals).toEqual({ passed: 2, failed: 0, other: 0 });
    expect(report.runDir).toMatch(/\.tracegrove\/runs\/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ_pass_[A-Za-z0-9]{6}$/);
    for (const file of ['summary.md', 'summary.json', 'junit.xml', 'request.json', 'bundle/campaign.json']) expect(existsSync(join(report.runDir, file))).toBe(true);
    expect(resolveRun(root, 'latest')).toBe(report.runDir);
    expect(readFileSync(join(report.runDir, 'junit.xml'), 'utf8')).toContain('tests="2" failures="0" errors="0"');
    expect(readFileSync(join(report.runDir, 'summary.md'), 'utf8')).not.toMatch(/Bearer /);
  });

  it('names the failing step with the expected and observed status', async () => {
    const root = copy('notes-api');
    writeFlow(root, 'notes/wrong.flow.yaml', 'title: wrong on purpose\nsteps:\n  - name: create\n    POST: /notes\n    json: { title: a, body: b }\n    expect: 201\n    save: { noteId: note.id }\n  - name: stranger reads\n    GET: /notes/{noteId}\n    as: intruder\n    expect: 200\n');
    const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml'), grep: 'wrong' });
    expect(report.exitCode).toBe(1);
    expect(report.cases[0]!.failure).toMatchObject({ step: 'stranger reads', message: 'expected status 200, got 403' });
    expect(report.cases[0]!.failure!.observed).toMatch(/^GET \/notes\/[0-9a-f-]+ -> 403 \{"error":"forbidden"\}$/);
    expect(readFileSync(join(report.runDir, 'junit.xml'), 'utf8')).toContain('<failure message="stranger reads: expected status 200, got 403"');
    expect(report.bundleVerified).toBe(true);
  });

  it('shows the app output when the app fails to start, and the bundle still verifies', async () => {
    const root = copy('notes-api');
    writeFileSync(join(root, 'app', 'broken.mjs'), "console.error('boom: missing DATABASE_URL'); process.exit(3);\n");
    writeFileSync(join(root, 'tracegrove.config.yaml'), readFileSync(join(root, 'tracegrove.config.yaml'), 'utf8').replace('entry: app/app.mjs', 'entry: app/broken.mjs'));
    const { report } = await runTests({ configPath: join(root, 'tracegrove.config.yaml'), grep: 'list' });
    expect(report.outcome).toBe('infrastructure_failed');
    expect(report.exitCode).toBe(3);
    expect(report.cases[0]!.failure?.step).toBe('(app startup)');
    expect(report.cases[0]!.failure?.message).toMatch(/application exited before becoming ready; last app output:\nboom: missing DATABASE_URL/);
    expect(report.bundleVerified).toBe(true);
  });

  const python = process.env.TRACEGROVE_PYTHON;
  it.skipIf(!python)('runs the FastAPI sample through the fastapi preset', async () => {
    const root = copy('fastapi-notes');
    writeFileSync(join(root, 'tracegrove.config.yaml'), readFileSync(join(root, 'tracegrove.config.yaml'), 'utf8').replace('app:\n', `app:\n  python: ${python}\n`));
    const { report, compiled } = await runTests({ configPath: join(root, 'tracegrove.config.yaml') });
    const host = HostPlan.parse(loadProject(compiled.workflowConfigPath).corpus.findById(`${compiled.config.project}.host`)[0]!.value);
    expect(host.launch?.runtime).toBe(observeApplicationRuntimeSync(python!, root, process.env.PATH ?? '').runtime);
    expect(report.cases.map((c) => c.failure)).toEqual([null]);
    expect(report.outcome).toBe('passed');
  }, 60_000);

  it.skipIf(!python)('runs the Django sample through the django preset with a fresh database', async () => {
    const root = copy('django-notes');
    writeFileSync(join(root, 'tracegrove.config.yaml'), readFileSync(join(root, 'tracegrove.config.yaml'), 'utf8').replace('app:\n', `app:\n  python: ${python}\n`));
    const { report, compiled } = await runTests({ configPath: join(root, 'tracegrove.config.yaml') });
    const host = HostPlan.parse(loadProject(compiled.workflowConfigPath).corpus.findById(`${compiled.config.project}.host`)[0]!.value);
    expect(host.launch?.command).toBe(python);
    expect(host.launch?.args[0]).toBe('-c');
    expect(host.launch?.runtime).toBe(observeApplicationRuntimeSync(python!, root, process.env.PATH ?? '').runtime);
    expect(report.cases.map((c) => c.failure)).toEqual([null]);
    expect(report.outcome).toBe('passed');
  }, 60_000);
});

describe('init and sources', () => {
  it('detects FastAPI, Django and Node projects', () => {
    expect(detect(join(SAMPLES, 'fastapi-notes'))).toMatchObject({ adapter: 'fastapi', entry: 'app.main:app' });
    expect(detect(join(SAMPLES, 'django-notes'))).toMatchObject({ adapter: 'django', entry: '.' });
    const node = mkdtempSync(join(tmpdir(), 'tracegrove-init-')); temps.push(node);
    writeFileSync(join(node, 'package.json'), JSON.stringify({ main: 'server.js' }));
    expect(detect(node)).toMatchObject({ adapter: 'node', entry: 'server.js' });
    writeFileSync(join(node, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' } }));
    expect(detect(node)).toMatchObject({ adapter: 'command', run: 'npm start' });
  });

  it('writes a config that compiles, an example flow and a .gitignore entry, and refuses to overwrite', () => {
    const root = mkdtempSync(join(tmpdir(), 'tracegrove-init-')); temps.push(root);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ main: 'server.js' }));
    writeFileSync(join(root, 'server.js'), '');
    const result = initProject(root);
    expect(result.files.map((f) => f.slice(root.length + 1))).toEqual(['tracegrove.config.yaml', 'tracegrove/health.flow.yaml', 'tracegrove/AGENTS.md', '.gitignore']);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('.tracegrove/\n');
    expect(compileProject(join(root, 'tracegrove.config.yaml')).flows.map((f) => f.caseId)).toEqual(['health']);
    expect(blockedCodes(() => initProject(root))[0]).toMatch(/^config_exists/);
  });

  it('expands globs and skips dependency folders', () => {
    expect(globToRegExp('app/**/*.py').test('app/main.py')).toBe(true);
    expect(globToRegExp('app/**/*.py').test('app/a/b.py')).toBe(true);
    expect(globToRegExp('*.{js,ts}').test('a/b.ts')).toBe(false);
    const root = mkdtempSync(join(tmpdir(), 'tracegrove-src-')); temps.push(root);
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'node_modules', 'x', 'index.js'), '');
    writeFileSync(join(root, 'src', 'server.js'), '');
    expect(expandSources(root, ['**/*.js'])).toEqual(['src/server.js']);
  });
});
