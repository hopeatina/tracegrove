import { afterEach, expect, it, vi } from 'vitest';
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

import { CaseBrowserSession } from '../src/adapters/browser/session.ts';
import { BrowserStepError } from '../src/adapters/browser/driver.ts';

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

it('retains the completed DOM observation when its expectation never holds', async () => {
  const { root, configPath } = browserProject();
  const casePath = join(root, 'verification/cases/notes.browser.yaml');
  writeFileSync(casePath, readFileSync(casePath, 'utf8')
    .replaceAll('value: Existing note', 'value: Deliberately wrong expectation')
    .replace('id: read_dom\n    kind: ui.observe\n    timeoutMs: 5000', 'id: read_dom\n    kind: ui.observe\n    timeoutMs: 300'));
  const bundle = plan({ project: loadProject(configPath), profileName: 'native-real', scope: localScope() });
  expect(bundle.blockers).toEqual([]);
  const stateDir = join(root, '.state'); const ledger = LocalLedger.open(stateDir);
  try {
    const result = await executeBundle({ bundle, stateDir, ledger, scope: localScope() });
    expect(result.outcome).toBe('assertion_failed');
    const receipt = result.receipts[0]!;
    expect(receipt.steps.find(step => step.stepId === 'read_dom')?.output).toMatchObject({ text: 'Existing note' });
    expect(receipt.assertions.find(assertion => assertion.assertionId === 'a.browser')?.result).toBe('fail');
    expect(receipt.cleanup.confirmed).toContain('existing_note');
    expect(receipt.cleanup.confirmed).toContain('host.process');
    expect(receipt.artifacts.some(artifact => artifact.mediaType === 'video/webm')).toBe(true);
    expect(verifyBundle(result.executionDir)).toMatchObject({ ok: true, outcome: 'assertion_failed' });
  } finally { ledger.close(); }
});


it.each(['known', 'arbitrary'] as const)('preserves safe capture diagnostics for %s errors while withholding video acceptance', async kind => {
  const { root, configPath } = browserProject();
  const original = CaseBrowserSession.prototype.collectVideo;
  const spy = vi.spyOn(CaseBrowserSession.prototype, 'collectVideo').mockImplementation(async function(this: CaseBrowserSession, deadline) {
    await original.call(this, deadline); // Real recording and disposal; simulate only its final reported failure.
    if (kind === 'known') throw new BrowserStepError('video_final_frame_unavailable', 'frame');
    throw new Error('secret-capture-error-do-not-persist');
  });
  const bundle = plan({ project: loadProject(configPath), profileName: 'native-real', scope: localScope() });
  const stateDir = join(root, '.state'); const ledger = LocalLedger.open(stateDir);
  try {
    const result = await executeBundle({ bundle, stateDir, ledger, scope: localScope() });
    expect(result.outcome).toBe('infrastructure_failed');
    const receipt = result.receipts[0]!;
    expect(receipt.artifacts.some(a => a.mediaType === 'video/webm')).toBe(false);
    expect(receipt.cleanup.confirmed).toContain('host.process');
    const cell = receipt.selectionCellId.replace(/[^A-Za-z0-9._-]/g, '_');
    const events = readFileSync(join(result.executionDir, 'cells', cell, 'events.jsonl'), 'utf8');
    const failure = events.trim().split('\n').map(line => JSON.parse(line)).find(event => event.kind === 'browser.failed');
    expect(failure.redactedPayload).toEqual({ code: 'browser_evidence_collection_failed', cause: kind === 'known' ? 'video_final_frame_unavailable' : null, phase: kind === 'known' ? 'frame' : null });
    expect(events).not.toContain('secret-capture-error-do-not-persist');
    expect(verifyBundle(result.executionDir)).toMatchObject({ ok: true, outcome: 'infrastructure_failed' });
  } finally { spy.mockRestore(); ledger.close(); }
});
