import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { writeSample } from '../src/cli/samples/write.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { executeBundle } from '../src/core/executor.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { resealBundle } from '../conformance/helpers.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function browserProject() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-browser-case-')); roots.push(root);
  const configPath = writeSample(join(import.meta.dirname, '../src/samples'), 'notes-browser', root);
  return { root, configPath };
}

it.each(['pointer', 'keyboard', 'touch'] as const)('runs authenticated %s UI and independent API checks through the controller and verifies its video bundle', async inputMode => {
  const { root, configPath } = browserProject();
  const personaPath = join(root, 'verification/personas/owner.yaml');
  const persona = z.object({}).passthrough().parse(parse(readFileSync(personaPath, 'utf8')));
  writeFileSync(personaPath, stringify({ ...persona, inputMode, viewport: { width: inputMode === 'touch' ? 375 : 1280, height: 720 } }));
  const bundle = plan({ project: loadProject(configPath), profileName: 'native-real', scope: localScope() });
  expect(bundle.blockers).toEqual([]);
  const stateDir = join(root, '.state'); const ledger = LocalLedger.open(stateDir);
  try {
    const result = await executeBundle({ bundle, stateDir, ledger, scope: localScope() });
    expect(result.reasonCodes).toEqual([]);
    expect(result.outcome).toBe('passed');
    const receipt = result.receipts[0]!;
    expect(receipt.assertions.find(a => a.assertionId === 'a.browser')?.result).toBe('pass');
    expect(receipt.accounting.browserSeconds).toBeGreaterThan(0);
    expect(receipt.cleanup.confirmed).toContain('existing_note');
    expect(receipt.cleanup.confirmed).toContain('host.process');
    expect(JSON.stringify(receipt)).not.toContain('Bearer ');
    const cellName = receipt.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_');
    const events = readFileSync(join(result.executionDir, 'cells', cellName, 'events.jsonl'), 'utf8');
    expect(events).toContain('"kind":"browser.network"');
    expect(events).not.toContain('Bearer ');
    const video = receipt.artifacts.find(a => a.mediaType === 'video/webm')!;
    expect(video.byteCount).toBeGreaterThan(0);
    expect(verifyBundle(result.executionDir)).toMatchObject({ ok: true, problems: [], outcome: 'passed' });
    // The portable verifier must inspect sealed media bytes, not trust the artifact label.
    writeFileSync(join(result.executionDir, 'cells', cellName, 'media', `${video.ref.digest.hex}.webm`), 'corrupted');
    expect(verifyBundle(result.executionDir).ok).toBe(false);
    resealBundle(result.executionDir);
    expect(verifyBundle(result.executionDir).ok).toBe(false);
  } finally { ledger.close(); }
});

it('blocks browser execution under the HTTP runner before launching a host', () => {
  const { root, configPath } = browserProject();
  const runnerPath = join(root, 'verification/runners/http.yaml');
  writeFileSync(runnerPath, readFileSync(runnerPath, 'utf8').replace('adapter: browser', 'adapter: http'));
  const bundle = plan({ project: loadProject(configPath), profileName: 'native-real', scope: localScope() });
  expect(bundle.request).toBeNull();
  expect(bundle.blockers.some(b => b.code === 'unsupported_operation' || b.code === 'required_video_unsupported')).toBe(true);
});
