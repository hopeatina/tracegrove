import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSample } from '../src/cli/samples/write.ts';
import { parseArgs } from '../src/cli/arguments.ts';
import { loadProject } from '../src/core/corpus.ts';

const roots: string[] = [];
const samples = join(import.meta.dirname, '../src/samples');
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function output() { const root = mkdtempSync(join(tmpdir(), 'tracegrove-sample-')); roots.push(root); return root; }

it('builds both sample bindings from one corpus without requiring Django to be installed', () => {
  const node = output(), django = output();
  const nodeConfig = writeSample(samples, 'notes-api', node);
  const djangoConfig = writeSample(samples, 'notes-django', django);
  expect(loadProject(nodeConfig).suiteCases.map(item => item.ref.id))
    .toEqual(loadProject(djangoConfig).suiteCases.map(item => item.ref.id));
  for (const file of ['cases/notes.create.yaml', 'fixtures/existing-note.recipe.yaml', 'actions/notes.registry.yaml', 'fidelity/full-live-sandbox.yaml']) {
    expect(readFileSync(join(node, 'verification', file))).toEqual(readFileSync(join(django, 'verification', file)));
  }
  expect(readFileSync(join(django, 'verification/hosts/local-process.yaml'), 'utf8')).toContain('.venv/bin/python');
});
it('refuses to overwrite existing files in an output directory', () => {
  const root = output(), path = join(root, 'operator.txt'); writeFileSync(path, 'keep');
  expect(() => writeSample(samples, 'notes-api', root)).toThrow(/sample_output_not_empty/);
  expect(readFileSync(path, 'utf8')).toBe('keep');
});
it('rejects sample path traversal during argument parsing before accessing sample files', () => {
  expect(() => parseArgs(['sample-config', '--sample=../private', '--output=unused'])).toThrow(/invalid_argument/);
  expect(parseArgs(['sample-config', '--sample=notes-django', '--output=sample']).command).toBe('sample-config');
});
