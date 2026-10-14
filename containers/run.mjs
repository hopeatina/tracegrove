import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ContainerProfile, ContainerCliReport } from './contracts.mjs';

const profile = ContainerProfile.parse(process.argv[2] ?? 'native-real');
if (process.argv.length > 3) throw new Error('Expected one profile argument');
const root = mkdtempSync(join(tmpdir(), 'tracegrove-container-'));
const cli = '/opt/tracegrove/dist/cli/main.js';
const steps = [];
let finalCode = 2;
function command(name, args, allowedCodes = [0]) {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024,
  });
  const code = result.status ?? 2;
  let output = null;
  try { output = JSON.parse(result.stdout); } catch { /* Incomplete output stays unconfirmed. */ }
  steps.push({ name, code, output });
  if (result.error || !allowedCodes.includes(code) || output === null) throw new Error(`${name} did not complete (${code})`);
  return { code, output };
}
try {
  const sample = command('sample-config', ['sample-config', '--sample', 'notes-api', '--output', join(root, 'sample')]);
  const config = z.object({ config: z.string().min(1) }).parse(sample.output).config;
  command('doctor', ['doctor', '--config', config]);
  command('plan', ['plan', '--config', config, '--profile', profile, '--output', join(root, 'request.json')]);
  const run = command('run', ['run', '--request', join(root, 'request.json'), '--state-dir', join(root, 'state')], [0, 1, 2, 3, 4]);
  const execution = z.object({ executionId: z.string().min(1), outcome: z.string() }).parse(run.output);
  command('export', ['export', '--execution', execution.executionId, '--state-dir', join(root, 'state'), '--output', '/evidence/bundle']);
  const verification = command('verify-bundle', ['verify-bundle', '--bundle', '/evidence/bundle']);
  const verified = z.object({ ok: z.literal(true), outcome: z.string() }).parse(verification.output);
  if (verified.outcome !== execution.outcome) throw new Error('Saved verdict disagrees with execution');
  finalCode = run.code;
} catch (error) {
  steps.push({ name: 'runner-error', code: 2, output: { message: error instanceof Error ? error.message : 'Container run failed' } });
} finally {
  const report = ContainerCliReport.parse({ schemaVersion: 'container.cli/v1', profile, exitCode: finalCode, steps });
  writeFileSync('/evidence/cli.json', `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
process.exitCode = finalCode;
