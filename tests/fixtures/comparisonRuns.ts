import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { sampleCopy, runSample } from '../../conformance/helpers.ts';
import { runTests } from '../../src/authoring/run.ts';
import { VerifiedBundleSnapshot } from '../../src/core/bundle.ts';
import { loadProject, localScope } from '../../src/core/corpus.ts';
import { plan } from '../../src/core/planner.ts';

/** Real native observations for CLI/API/browser comparison. The fault is an explicit test control. */
export async function comparisonRunsFixture(includeForeign = false) {
  const { root } = sampleCopy(); const control = join(root, 'controlled-status');
  const app = join(root, 'app/app.mjs'); const original = readFileSync(app, 'utf8');
  const changed = original.replace('return send(res, 200, { notes });', 'return send(res, existsSync(process.env.TEST_CONTROL) ? 299 : 200, { notes });');
  assert.notEqual(changed, original); writeFileSync(app, changed);
  const configPath = join(root, 'tracegrove.config.yaml'); const config = parse(readFileSync(configPath, 'utf8'));
  config.app.env.TEST_CONTROL = control; writeFileSync(configPath, stringify(config));
  const passed = (await runTests({ configPath, grep: 'notes.list' })).report; assert.equal(passed.outcome, 'passed');
  writeFileSync(control, 'controlled failure');
  const failed = (await runTests({ configPath, grep: 'notes.list' })).report; assert.equal(failed.outcome, 'assertion_failed');
  const flow = join(root, 'tracegrove/notes/list.flow.yaml'); const prior = readFileSync(flow, 'utf8');
  const weaker = prior.replaceAll('status: 200', 'status: 299'); assert.notEqual(weaker, prior); writeFileSync(flow, weaker);
  const edited = (await runTests({ configPath, grep: 'notes.list' })).report; assert.equal(edited.outcome, 'passed');
  writeFileSync(flow, prior); unlinkSync(control);
  const expanded = (await runTests({ configPath })).report; assert.equal(expanded.outcome, 'passed');
  config.app.env.NOTES_BUILD = 'different-context'; writeFileSync(configPath, stringify(config));
  const contextual = await runTests({ configPath, grep: 'notes.list' }); const contextChanged = contextual.report; assert.equal(contextChanged.outcome, 'passed');
  let foreign: VerifiedBundleSnapshot | null = null;
  if (includeForeign) {
    const scope = { ...localScope(), ownerId: 'other-comparison-owner' };
    const run = await runSample(plan({ project: loadProject(contextual.compiled.workflowConfigPath), profileName: 'real', scope }), join(root, 'foreign-state'), { scope });
    assert.equal(run.outcome, 'passed'); foreign = VerifiedBundleSnapshot.open(run.executionDir);
  }
  assert.ok([passed, failed, edited, expanded, contextChanged].every(report => report.bundleVerified));
  return { root, configPath, passed, failed, edited, expanded, contextChanged, foreign };
}
