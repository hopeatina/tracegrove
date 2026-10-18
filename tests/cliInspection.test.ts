import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { runCli as cli } from './fixtures/cli.ts';
import { parseArgs } from '../src/cli/arguments.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it('inspects, exports and independently reruns frozen native cases without rediscovering changed YAML', () => {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-inspection-cli-')); roots.push(root);
  const sample = join(root, 'sample'); const state = join(root, 'state'); const input = join(root, 'frozen.json');
  const generated = cli(['sample-config', '--sample', 'notes-api', '--output', sample]); expect(generated.status, generated.stderr).toBe(0);
  const config = join(sample, 'verification/workflow.yaml');
  const planned = cli(['plan', '--config', config, '--profile', 'native-real', '--output', input]); expect(planned.status, planned.stderr).toBe(0);
  const original = readFileSync(input, 'utf8');
  writeFileSync(config, 'broken: yaml: do not rediscover'); writeFileSync(join(sample, 'verification/cases/notes.contract.yaml'), 'not a case');
  const preview = cli(['inspect', '--request', input]); expect(preview.status, preview.stderr).toBe(0);
  expect(JSON.parse(preview.stdout)).toMatchObject({ structural: 'valid', executionAuthority: 'not_checked', requiresQualificationOwner: false });
  expect(existsSync(state)).toBe(false);
  const first = cli(['run', '--request', input, '--state-dir', state]); expect(first.status, first.stderr).toBe(0);
  const run = JSON.parse(first.stdout); const execution = basename(run.executionDir);
  const inspected = cli(['inspect', '--execution', execution, '--state-dir', state]); expect(inspected.status, inspected.stderr).toBe(0);
  expect(JSON.parse(inspected.stdout)).toMatchObject({ verified: true, campaignId: run.campaignId, outcome: 'passed' });
  const direct = cli(['inspect', '--bundle', run.executionDir, '--failed-step']); expect(direct.status, direct.stderr).toBe(0);
  expect(JSON.parse(direct.stdout)).toMatchObject({ verified: true, failed: [] });
  writeFileSync(join(run.executionDir, 'unsealed.txt'), 'unsealed scratch');
  const output = join(root, 'export'); const exported = cli(['export', '--execution', execution, '--state-dir', state, '--output', output]); expect(exported.status, exported.stderr).toBe(0);
  expect(JSON.parse(exported.stdout).verification.ok).toBe(true); expect(existsSync(join(output, 'unsealed.txt'))).toBe(false);
  const rerunFile = join(root, 'rerun.json'); const prepared = cli(['rerun', '--request', input, '--output', rerunFile]); expect(prepared.status, prepared.stderr).toBe(0);
  const repeated = cli(['run', '--request', rerunFile, '--state-dir', state]); expect(repeated.status, repeated.stderr).toBe(0);
  const second = JSON.parse(repeated.stdout); expect(second.outcome).toBe('passed'); expect(second.campaignId).not.toBe(run.campaignId);
  expect(second.executionId).not.toBe(run.executionId); expect(readFileSync(input, 'utf8')).toBe(original);
  const campaignPath = join(run.executionDir, 'campaign.json'); const campaign = JSON.parse(readFileSync(campaignPath, 'utf8'));
  campaign.campaignId = 'invented-campaign'; writeFileSync(campaignPath, JSON.stringify(campaign));
  const refused = cli(['inspect', '--execution', execution, '--state-dir', state]); expect(refused.status).toBe(2); expect(refused.stdout).toBe('');
  const badExport = join(root, 'must-not-export'); expect(cli(['export', '--execution', execution, '--state-dir', state, '--output', badExport]).status).toBe(2); expect(existsSync(badExport)).toBe(false);
  const changed = JSON.parse(original); changed.request.campaignId = 'unsealed-change'; writeFileSync(input, JSON.stringify(changed));
  const blocked = cli(['inspect', '--request', input]); expect(blocked.status).toBe(2); expect(JSON.parse(blocked.stdout).structural).toBe('blocked');
  const forbidden = join(root, 'must-not-rerun.json'); expect(cli(['rerun', '--request', input, '--output', forbidden]).status).toBe(2); expect(existsSync(forbidden)).toBe(false);
}, 90000);

it.each([
  ['inspect'], ['inspect', '--execution', 'safe'], ['inspect', '--request', 'p', '--bundle', 'b'],
  ['inspect', '--request', 'p', '--failed-step'], ['inspect', '--bundle', 'b', '--state-dir', 's'],
  ['inspect', '--execution', '../escape', '--state-dir', 's'], ['export', '--execution', '../escape', '--state-dir', 's', '--output', 'o'],
])('refuses ambiguous inspection and escaping execution IDs before file access: %j', (...args) => {
  expect(() => parseArgs(args)).toThrow();
});
