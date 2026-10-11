import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy, planSample, runSample } from '../conformance/helpers.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { digestOfBytes, freeze } from '../src/protocol/index.ts';
afterEach(cleanupTemps);

function reseal(dir: string): void {
  const path = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const file of manifest.files) {
    const bytes = readFileSync(join(dir, file.path));
    file.sha256 = digestOfBytes(bytes).hex; file.bytes = bytes.length;
  }
  writeFileSync(path, JSON.stringify(manifest));
}
it('rejects claimed PASS after a producer removes probed capabilities and reseals the bundle', async () => {
  const copy = sampleCopy(); const result = await runSample(planSample(copy.configPath), copy.stateDir);
  const name = readdirSync(join(result.executionDir, 'cells'))[0]!;
  const path = join(result.executionDir, 'cells', name, 'host.json');
  const host = JSON.parse(readFileSync(path, 'utf8'));
  host.observation = freeze({ ...host.observation, capabilities: [] });
  writeFileSync(path, JSON.stringify(host)); reseal(result.executionDir);
  const checked = verifyBundle(result.executionDir);
  expect(checked.ok).toBe(false);
  expect(checked.problems.join(' ')).toMatch(/host observation|evidence reduction/);
});
it('rejects empty and traversal manifests without reading outside the bundle', async () => {
  const copy = sampleCopy(); const result = await runSample(planSample(copy.configPath), copy.stateDir);
  const path = join(result.executionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify({ ...manifest, files: [] }));
  expect(verifyBundle(result.executionDir).ok).toBe(false);
  writeFileSync(path, JSON.stringify({ ...manifest, files: [{ path: '../outside', sha256: '0'.repeat(64), bytes: 0 }] }));
  expect(verifyBundle(result.executionDir).problems.join(' ')).toMatch(/unsafe/);
  writeFileSync(path, JSON.stringify({ ...manifest, files: manifest.files.filter((f: { path: string }) => !f.path.endsWith('/host.json')) }));
  expect(verifyBundle(result.executionDir).problems.join(' ')).toMatch(/unsealed required file/);
});
