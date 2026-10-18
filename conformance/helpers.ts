import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, localScope, ProjectLoader, AUTHORING_SCOPE } from '../src/core/corpus.ts';
import { materializeLogicalPayload } from '../src/core/generators.ts';
import { SeedRecipe, HostPlan, parseAs, digestOfBytes } from '../src/protocol/index.ts';
import { stringify } from 'yaml';
import { sourceIdentityDigest } from '../src/hosts/local.ts';
import { plan, type FrozenBundle } from '../src/core/planner.ts';
import { executeBundle, type RunOptions, type RunSummary } from '../src/core/executor.ts';
import { LocalLedger } from '../src/core/ledger.ts';

export const SAMPLE_ROOT = join(import.meta.dirname, '..', 'src', 'samples', 'notes-api');
const temps: string[] = [];

/** Test-only producer reseal for adversarial evidence checks. */
export function resealBundle(dir: string): void {
  const path = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const file of manifest.files) {
    const bytes = readFileSync(join(dir, file.path));
    file.sha256 = digestOfBytes(bytes).hex; file.bytes = bytes.length;
  }
  writeFileSync(path, JSON.stringify(manifest));
}

export function cleanupTemps(): void {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Copy the sample to a temp directory and optionally mutate files before loading. */
export function sampleCopy(mutate?: (root: string) => void): { root: string; configPath: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-conf-'));
  temps.push(root);
  cpSync(SAMPLE_ROOT, root, { recursive: true });
  mutate?.(root);
  return { root, configPath: join(root, 'verification', 'workflow.yaml'), stateDir: join(root, '.state') };
}

export function editFile(path: string, edit: (text: string) => string): void {
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
}

/** Hash the source closure declared by the sample's actual launcher. */
export function sampleIdentityDigest(root: string) {
  const loader = new ProjectLoader(join(root, 'verification'));
  const host = parseAs(HostPlan, loader.loadDocument(join(root, 'verification/hosts/local-process.yaml')).value, 'host');
  if (!host.launch || host.launch.identitySourceFiles.length === 0) throw new Error('Sample launcher must declare identity sources');
  return sourceIdentityDigest(root, host.launch.identitySourceFiles);
}

export function planSample(configPath: string, profileName = 'native-real'): FrozenBundle {
  return plan({ project: loadProject(configPath), profileName, scope: localScope() });
}

export async function runSample(bundle: FrozenBundle, stateDir: string, extra: Partial<RunOptions> = {}): Promise<RunSummary> {
  const ledger = LocalLedger.open(stateDir);
  try {
    return await executeBundle({ bundle, stateDir, ledger, scope: localScope(), ...extra });
  } finally {
    ledger.close();
  }
}

/** After editing a recipe, an author rematerializes and reviews the logical payload. */
export function rematerializePayload(root: string): void {
  const recipePath = join(root, 'verification', 'fixtures', 'existing-note.recipe.yaml');
  const loader = new ProjectLoader(join(root, 'verification'));
  const recipe = parseAs(SeedRecipe, loader.loadDocument(recipePath).value, 'recipe');
  const payload = materializeLogicalPayload(recipe, AUTHORING_SCOPE);
  const { scope: _s, ...rest } = payload;
  writeFileSync(join(root, 'verification', 'fixtures', 'existing-note.payload.yaml'), stringify({ ...rest, ref: { id: payload.ref.id, revision: payload.ref.revision } }));
}
