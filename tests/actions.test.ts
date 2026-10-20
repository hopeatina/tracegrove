import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { expandFlow, type ActionLibrary } from '../src/authoring/actions.ts';
import { Action, Flow } from '../src/authoring/schema.ts';
import { compileProject } from '../src/authoring/compile.ts';
import { runTests } from '../src/authoring/run.ts';
import { discoverProject, saveCatalog } from '../src/authoring/workspace.ts';

const SAMPLES = join(import.meta.dirname, '..', 'src', 'samples');
const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function copy(sample: string): string {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-actions-')); temps.push(root);
  cpSync(join(SAMPLES, sample), root, { recursive: true, filter: (src) => !src.includes('.tracegrove') });
  return root;
}
function put(root: string, rel: string, text: string): void { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
const lib = (entries: Record<string, unknown>): ActionLibrary => new Map(Object.entries(entries).map(([id, doc]) => [id, { action: Action.parse(doc), file: `actions/${id}.action.yaml` }]));

const create = { title: 'create', inputs: { title: 'A note', body: 'b' }, outputs: ['noteId'], routes: ['POST /notes'], steps: [
  { name: 'create', POST: '/notes', json: { title: '{title}', body: '{body}' }, expect: 201, save: { noteId: 'note.id', scratch: 'note.ownerId' } },
] };
const read = { title: 'read', inputs: { title: null }, outputs: ['noteId'], steps: [
  { use: 'notes.create', with: { title: '{title}' } },
  { name: 'read back', GET: '/notes/{noteId}', expect: { status: 200, json: { 'note.title': '{title}' } } },
] };

describe('action expansion', () => {
  it('inlines inputs, maps outputs to the caller, and keeps other saved names private to the call', () => {
    const flow = Flow.parse({ title: 't', steps: [
      { use: 'notes.create', with: { title: 'One' }, save: { first: 'noteId' } },
      { name: 'again', use: 'notes.create', as: 'intruder' },
      { name: 'read first', GET: '/notes/{first}', expect: 200 },
    ] });
    const out = expandFlow(flow, lib({ 'notes.create': create }), 'f.flow.yaml');
    expect(out.uses).toEqual(['notes.create']);
    expect(out.steps).toEqual([
      expect.objectContaining({ name: 'notes.create › create', POST: '/notes', json: { title: 'One', body: 'b' }, save: { first: 'note.id', notes_create_1_scratch: 'note.ownerId' } }),
      expect.objectContaining({ name: 'again › create', as: 'intruder', save: { noteId: 'note.id', notes_create_2_scratch: 'note.ownerId' } }),
      expect.objectContaining({ name: 'read first', GET: '/notes/{first}' }),
    ]);
  });

  it('expands actions that call actions, passing inputs and outputs through', () => {
    const flow = Flow.parse({ title: 't', steps: [{ use: 'notes.read', with: { title: 'Deep' }, save: { mine: 'noteId' } }, { GET: '/notes/{mine}', expect: 200 }] });
    const out = expandFlow(flow, lib({ 'notes.create': create, 'notes.read': read }), 'f');
    expect(out.uses).toEqual(['notes.read', 'notes.create']);
    expect(out.steps.map((s) => s.name)).toEqual(['notes.read › notes.create › create', 'notes.read › read back', undefined]);
    expect(out.steps[0]).toMatchObject({ json: { title: 'Deep' }, save: { mine: 'note.id' } });
    expect(out.steps[1]).toMatchObject({ GET: '/notes/{mine}', expect: { json: { 'note.title': 'Deep' } } });
  });

  it('refuses unknown actions, missing or unknown inputs, unsaved outputs and cycles, with the fix', () => {
    const run = (steps: unknown[], library: ActionLibrary) => () => expandFlow(Flow.parse({ title: 't', steps }), library, 'f');
    expect(run([{ use: 'notes.nope' }], lib({ 'notes.create': create }))).toThrow(/no actions\/notes\/nope\.action\.yaml/);
    expect(run([{ use: 'notes.read' }], lib({ 'notes.create': create, 'notes.read': read }))).toThrow(/needs input title/);
    expect(run([{ use: 'notes.create', with: { colour: 'red' } }], lib({ 'notes.create': create }))).toThrow(/has no input colour/);
    expect(run([{ use: 'a.b' }], lib({ 'a.b': { title: 'x', outputs: ['id'], steps: [{ GET: '/x' }] } }))).toThrow(/output id is never saved/);
    expect(run([{ use: 'a.a' }], lib({ 'a.a': { title: 'loop', steps: [{ use: 'a.a' }] } }))).toThrow(/a\.a -> a\.a/);
  });

  it('re-checks the expanded flow, so a browser action still needs the flow to declare its browser envelope', () => {
    const open = { title: 'open', steps: [{ browser: { kind: 'navigate', path: '/ui' } }] };
    expect(() => expandFlow(Flow.parse({ title: 't', steps: [{ use: 'ui.open' }] }), lib({ 'ui.open': open }), 'f')).toThrow(/browser steps require browser.allowPaths/);
  });
});

describe('actions in a real project', () => {
  it('compiles, runs and proves flows built from actions, and records what discovery learned for the next one', async () => {
    const root = copy('notes-api');
    put(root, 'tracegrove/actions/notes/create.action.yaml', 'title: Create a note\ninputs: { title: A note, body: by an action }\noutputs: [noteId]\nroutes: [POST /notes]\nsources: [app/app.mjs]\nsteps:\n  - name: create\n    POST: /notes\n    json: { title: "{title}", body: "{body}" }\n    expect: 201\n    save: { noteId: note.id }\n');
    put(root, 'tracegrove/actions/notes/read.action.yaml', 'title: Read a new note back\ninputs: { title: null }\noutputs: [noteId]\nroutes: ["GET /notes/{id}"]\nsources: [app/app.mjs]\nsteps:\n  - use: notes.create\n    with: { title: "{title}" }\n  - name: read back\n    GET: /notes/{noteId}\n    expect: { status: 200, json: { note.title: "{title}" } }\n');
    put(root, 'tracegrove/composed/two-notes.flow.yaml', 'title: Two notes through the same actions\nsteps:\n  - use: notes.read\n    with: { title: First }\n    save: { first: noteId }\n  - use: notes.create\n    with: { title: Second }\n    save: { second: noteId }\n  - name: stranger is denied\n    GET: /notes/{first}\n    as: intruder\n    expect: 403\n');
    const configPath = join(root, 'tracegrove.config.yaml');
    expect(compileProject(configPath).flows.find((f) => f.caseId === 'composed.two-notes')).toMatchObject({ uses: ['notes.read', 'notes.create'] });
    const { report } = await runTests({ configPath });
    expect(report.outcome).toBe('passed');
    // Actions that name their handler file answer the scanner's question once traffic confirms their routes.
    const before = discoverProject(root, null);
    expect(before.actions.map((a) => [a.id, a.usedBy])).toEqual([['notes.create', ['composed.two-notes']], ['notes.read', ['composed.two-notes']]]);
    expect(before.routes.find((r) => r.method === 'GET' && r.path === '/notes/{id}')).toMatchObject({ file: 'app/app.mjs', actions: ['notes.read'] });
    expect(before.ambiguities).toEqual([]);
    const saved = saveCatalog(root, before)!;
    const catalog = parse(readFileSync(saved.path, 'utf8'));
    expect(catalog.routes.find((r: { route: string }) => r.route === 'POST /notes')).toMatchObject({ source: 'agent', file: 'app/app.mjs', actions: ['notes.create'], confirmed: { run: before.observed!.run } });
    // A fresh clone has the catalog but no runs: every route is still known, and nothing is re-asked.
    rmSync(join(root, '.tracegrove'), { recursive: true, force: true });
    const fresh = discoverProject(root, null);
    expect(fresh.observed).toBeNull();
    expect(fresh.ambiguities).toEqual([]);
    expect(fresh.routes.find((r) => r.method === 'DELETE')).toMatchObject({ provenance: 'catalog', confirmedEarlier: expect.objectContaining({ cases: ['notes.create-read-delete'] }) });
  }, 60_000);
});
