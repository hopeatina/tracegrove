import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { compileProject, findConfig } from '../src/authoring/compile.ts';
import { checkProject } from '../src/authoring/workspace.ts';
import { runTests } from '../src/authoring/run.ts';
import { initProject } from '../src/authoring/init.ts';
import { readAuthoringModule } from '../src/authoring/module.ts';
import { defineConfig, flow, fixture } from '../src/authoring/typed.ts';
import { Blocked } from '../src/core/errors.ts';
import { startUi } from '../src/authoring/ui.ts';

const roots: string[] = [];
const helpers = pathToFileURL(join(import.meta.dirname, process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled'
  ? '../dist/authoring/index.js' : '../src/authoring/typed.ts')).href;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-typed-')); roots.push(root);
  cpSync(join(import.meta.dirname, '../src/samples/notes-api'), root, { recursive: true });
  return root;
}
function convert(root: string, relative: string, helper: 'defineConfig' | 'flow' | 'fixture'): string {
  const path = join(root, relative);
  const value = parse(readFileSync(path, 'utf8'));
  rmSync(path);
  const typed = path.replace(/\.yaml$/, '.ts');
  writeFileSync(typed, `import { ${helper} } from ${JSON.stringify(helpers)};\nexport default ${helper}(${JSON.stringify(value)});\n`);
  return typed;
}
function codes(action: () => unknown): string[] {
  try { action(); } catch (error) { if (error instanceof Blocked) return error.reasons.map(r => r.code); throw error; }
  return [];
}

describe('typed authoring through the ordinary compiler', () => {
  it('executes a typed config, mixed flows and typed fixtures through the real notes app', async () => {
    const root = project();
    const original = compileProject(join(root, 'tracegrove.config.yaml'));
    const config = convert(root, 'tracegrove.config.yaml', 'defineConfig');
    convert(root, 'tracegrove/notes/create-read-delete.flow.yaml', 'flow');
    convert(root, 'tracegrove/fixtures/existing-note.fixture.yaml', 'fixture');
    const nested = join(root, 'nested'); mkdirSync(nested);
    expect(findConfig(nested)).toBe(config);
    expect(findConfig(config)).toBe(config);
    const typed = compileProject(config);
    expect(typed.flows.map(f => f.caseId)).toEqual(original.flows.map(f => f.caseId));
    expect(typed.sourceDigest).toBe(original.sourceDigest);
    expect(checkProject(root).ok).toBe(true);
    const result = await runTests({ configPath: config });
    expect(result.report.outcome).toBe('passed');
    expect(result.report.cases).toHaveLength(2);
  });

  it('reloads imported helper bytes after an edit instead of reusing a module cache', () => {
    const root = project();
    const shared = join(root, 'shared.ts');
    const module = join(root, 'reload.flow.ts');
    writeFileSync(shared, 'export const title: string = "Before";');
    writeFileSync(module, 'import { title } from "./shared.ts"; console.log("author output"); export default {title, steps:[{GET:"/health"}]};');
    expect(readAuthoringModule(module)).toMatchObject({ title: 'Before' });
    writeFileSync(shared, 'export const title: string = "After";');
    expect(readAuthoringModule(module)).toMatchObject({ title: 'After' });
  });

  it('shows a typed project in Grove and prunes and grafts its typed flow', async () => {
    const root = project();
    convert(root, 'tracegrove.config.yaml', 'defineConfig');
    convert(root, 'tracegrove/notes/list.flow.yaml', 'flow');
    const ui = await startUi({ dir: root });
    try {
      const page = await (await fetch(ui.url)).text();
      const token = /const TOKEN='([^']+)'/.exec(page)![1]!;
      const overview = async () => await (await fetch(`${ui.url}api/overview`)).json() as {
        hasConfig: boolean; flows: Array<{ file: string }>; pruned: Array<{ file: string }>;
      };
      const file = 'tracegrove/notes/list.flow.ts';
      const initial = await overview();
      expect(initial.hasConfig).toBe(true);
      expect(initial.flows.some(flow => flow.file === file)).toBe(true);
      const prune = (graft: boolean, sessionToken?: string) => fetch(`${ui.url}api/prune`, { method: 'POST', headers: {
        'content-type': 'application/json', ...(sessionToken ? { 'x-tracegrove-token': sessionToken } : {}),
      }, body: JSON.stringify({ file, graft }) });
      expect((await prune(false)).status).toBe(403);
      expect((await prune(false, token)).status).toBe(200);
      const cut = await overview();
      expect(cut.flows.some(flow => flow.file === file)).toBe(false);
      expect(cut.pruned.some(flow => flow.file === `${file}.pruned`)).toBe(true);
      expect((await prune(true, token)).status).toBe(200);
      expect((await overview()).flows.some(flow => flow.file === file)).toBe(true);
    } finally { await ui.close(); }
  });

  it('refuses competing configs and preserves a TypeScript config during init', () => {
    const root = project();
    const typed = join(root, 'tracegrove.config.ts'); writeFileSync(typed, 'export default {};');
    expect(codes(() => findConfig(root))).toEqual(['ambiguous_config']);
    expect(checkProject(root).issues[0]?.code).toBe('ambiguous_config');
    rmSync(join(root, 'tracegrove.config.yaml'));
    expect(codes(() => initProject(root, { force: true }))).toEqual(['config_exists']);
    expect(readFileSync(typed, 'utf8')).toBe('export default {};');
  });

  it('rejects cross-format duplicate flow and fixture identities', () => {
    const root = project();
    writeFileSync(join(root, 'tracegrove/notes/create-read-delete.flow.ts'), 'export default {title:"Duplicate",steps:[{GET:"/health"}]};');
    expect(codes(() => compileProject(join(root, 'tracegrove.config.yaml')))).toEqual(['duplicate_case_id']);
    rmSync(join(root, 'tracegrove/notes/create-read-delete.flow.ts'));
    writeFileSync(join(root, 'tracegrove/fixtures/existing-note.fixture.ts'), 'export default {};');
    expect(codes(() => compileProject(join(root, 'tracegrove.config.yaml')))).toEqual(['duplicate_fixture']);
  });

  it('uses canonical schema diagnostics for an invalid typed flow', () => {
    const root = project();
    writeFileSync(join(root, 'tracegrove/bad.flow.ts'), 'export default {title:"Bad", steps:[{GET:"/health", POST:"/health"}]};');
    const checked = checkProject(root);
    expect(checked.ok).toBe(false);
    expect(checked.issues[0]?.detail).toMatch(/bad.flow.ts at steps.0: give exactly one/);
  });

  it.each(['export default {bad: ()=>1};', 'export default {bad:Infinity};', 'export default {bad:undefined};', 'throw new Error("private-value");', 'export default "x".repeat(2 * 1024 * 1024);'])('fails closed on invalid, failed or oversized module exports', source => {
    const root = project(); const module = join(root, 'bad.ts'); writeFileSync(module, source);
    expect(codes(() => readAuthoringModule(module))).toEqual(['authoring_module_failed']);
    try { readAuthoringModule(module); } catch (error) { expect(String(error)).not.toContain('private-value'); }
  });

  it('bounds an evaluation that never finishes, including a trapped termination signal', () => {
    const root = project(); const module = join(root, 'pending.ts');
    writeFileSync(module, 'process.on("SIGTERM",()=>{}); await new Promise(()=>{ setInterval(()=>{},1000); });');
    expect(codes(() => readAuthoringModule(module))).toEqual(['authoring_module_failed']);
  });

  it('exposes input types without requiring schema defaults in authored files', () => {
    expect(defineConfig({ project: 'notes', app: { adapter: 'node' }, personas: { owner: { subject: 'owner' } } }).app.adapter).toBe('node');
    expect(flow({ title: 'Health', steps: [{ GET: '/health' }] }).steps).toHaveLength(1);
    expect(fixture({ create: { POST: '/notes' }, save: { note: 'id' }, readback: { GET: '/notes/{note}', expect: 200 }, cleanup: { DELETE: '/notes/{note}', gone: { GET: '/notes/{note}', status: 404 } } }).create.POST).toBe('/notes');
    // @ts-expect-error unknown app adapters must be editor errors
    defineConfig({ project: 'notes', app: { adapter: 'invented' }, personas: { owner: { subject: 'owner' } } });
    // @ts-expect-error arbitrary browser scripts are outside the authoring contract
    flow({ title: 'Bad browser', steps: [{ browser: { kind: 'evaluate', script: '1' } }] });
  });
});
