import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { loadProject } from '../../src/core/corpus.ts';
import { HostPlan } from '../../src/protocol/index.ts';
import { bindSampleApplication, writeSample } from '../../src/cli/samples/write.ts';
import { planSample, runSample } from '../helpers.ts';
import { verifyBundle } from '../../src/core/bundle.ts';
import { createRerun } from '../../src/core/rerun.ts';

const python = process.env.TRACEGROVE_DJANGO_PYTHON;
if (!python || !isAbsolute(python) || !existsSync(python)) throw new Error('test:django requires TRACEGROVE_DJANGO_PYTHON pointing to an installed, hash-locked Python 3.13 environment');
const samples = join(import.meta.dirname, '../../src/samples');
const temps: string[] = [];
afterEach(() => { for (const root of temps.splice(0)) rmSync(root, { recursive: true, force: true }); });

function customerSample(breakAuthorization = false) {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-django-')); temps.push(root);
  const config = writeSample(samples, 'notes-django', root);
  if (breakAuthorization) {
    const app = join(root, 'app/django_app.py');
    const source = readFileSync(app, 'utf8');
    expect(source).toContain('if note.ownerId != owner:');
    writeFileSync(app, source.replace('if note.ownerId != owner:', 'if False:'));
  }
  const project = loadProject(config);
  const host = project.corpus.getAs(HostPlan, project.fileRefs.get('./hosts/local-process.yaml')!);
  bindSampleApplication(root, { ...host.launch!, command: python! }, 'python3.13');
  expect(readFileSync(join(root, 'verification/cases/notes.create.yaml'), 'utf8'))
    .toBe(readFileSync(join(samples, 'notes-api/verification/cases/notes.create.yaml'), 'utf8'));
  return { root, config, state: join(root, '.state') };
}

it('replays the unchanged corpus and reruns against real Django without a database or inference', async () => {
  const sample = customerSample();
  const bundle = planSample(sample.config);
  expect(bundle.blockers).toEqual([]);
  const first = await runSample(bundle, sample.state);
  expect(first.outcome).toBe('passed');
  expect(first.receipts[0]!.assertions.filter(item => item.required).every(item => item.result === 'pass')).toBe(true);
  expect(first.receipts[0]!.accounting.inferenceCalls).toBe(0);
  expect(first.receipts[0]!.environment.observed?.components[0]?.identity).toMatchObject({ runtime: 'python3.13' });
  expect(verifyBundle(first.executionDir).ok).toBe(true);
  expect(first.receipts[0]!.cleanup.confirmed).toEqual(expect.arrayContaining(['existing_note', 'host.process', 'host.workspace']));
  const rerun = await runSample(createRerun(bundle), sample.state);
  expect(rerun.outcome).toBe('passed');
  expect(rerun.attemptId).not.toBe(first.attemptId);
  expect(rerun.campaignId).not.toBe(first.campaignId);
  expect(verifyBundle(rerun.executionDir).ok).toBe(true);
});

it('detects a real Django authorization regression through the shared assertion and still cleans up', async () => {
  const sample = customerSample(true);
  const summary = await runSample(planSample(sample.config), sample.state);
  expect(summary.outcome).toBe('assertion_failed');
  expect(summary.receipts[0]!.assertions.find(item => item.assertionId === 'a.denied')?.result).toBe('fail');
  expect(summary.receipts[0]!.cleanup.confirmed).toEqual(expect.arrayContaining(['existing_note', 'host.process', 'host.workspace']));
  expect(summary.receipts[0]!.cleanup.remainingUnknownMutations).toBe(0);
  expect(verifyBundle(summary.executionDir).ok).toBe(true);
});
