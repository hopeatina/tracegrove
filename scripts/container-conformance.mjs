import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ContainerProfile, ContainerCliReport, ContainerQualification, PassedBundle } from '../containers/contracts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = ContainerProfile.parse(process.argv[2] ?? 'native-real');
if (process.argv.length > 4) throw new Error('Usage: test:container [native-real|offline-contract] [empty-output-directory]');
const output = process.argv[3] ? resolve(process.argv[3]) : (() => {
  const parent = join(root, 'artifacts/qa'); mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, 'container-'));
})();
if (existsSync(output) && readdirSync(output).length) throw new Error('Output must be empty; prior evidence is never overwritten');
mkdirSync(output, { recursive: true });
const evidence = join(output, 'evidence');
mkdirSync(evidence);
const runId = randomUUID();
const receipt = { schemaVersion: 'container.qualification/v1', profile, imageId: null, containerId: null,
  runId, containerRemoved: false, runtimeExitCode: null, state: 'blocked', output,
  boundary: 'Verifier and native application inside one Docker container; no Docker-host attestation is claimed.' };
function docker(args, timeout = 180000) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr || result.error?.message || result.status}`);
  return result.stdout.trim();
}
try {
  if (process.getuid === undefined || process.getgid === undefined) throw new Error('Container qualification requires a POSIX operator host');
  docker(['info', '--format', '{{.ServerVersion}}'], 15000);
  docker(['build', '--file', 'containers/Dockerfile', '--iidfile', join(output, 'image-id'), '.'], 300000);
  receipt.imageId = z.string().regex(/^sha256:[a-f0-9]{64}$/).parse(readFileSync(join(output, 'image-id'), 'utf8').trim());
  const result = spawnSync('docker', ['run', '--rm', '--cidfile', join(output, 'container-id'), '--network', 'none',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', `${process.getuid()}:${process.getgid()}`,
    '--memory', '512m', '--cpus', '1', '--pids-limit', '128', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m',
    '--label', 'tracegrove.task=container-conformance', '--label', `tracegrove.run=${runId}`,
    '--mount', `type=bind,source=${evidence},target=/evidence`, receipt.imageId, profile],
  { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  receipt.containerId = z.string().regex(/^[a-f0-9]{64}$/).parse(readFileSync(join(output, 'container-id'), 'utf8').trim());
  receipt.runtimeExitCode = result.status;
  writeFileSync(join(output, 'container.stdout.txt'), result.stdout);
  writeFileSync(join(output, 'container.stderr.txt'), result.stderr);
  if (result.error) throw result.error;
  const cliReport = ContainerCliReport.parse(JSON.parse(readFileSync(join(evidence, 'cli.json'), 'utf8')));
  if (cliReport.exitCode !== result.status || cliReport.profile !== profile) throw new Error('Container exit/profile disagrees with its report');
  const verification = cliReport.steps.find(step => step.name === 'verify-bundle');
  if (verification?.code !== 0 || !PassedBundle.safeParse(verification.output).success || result.status !== 0) {
    throw new Error('Container execution or sealed bundle did not pass');
  }
  const hostCheck = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'src/cli/main.ts'), 'verify-bundle',
    '--bundle', join(evidence, 'bundle'), '--json'], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  if (hostCheck.error || hostCheck.status !== 0) throw new Error('Independent host bundle verification did not complete');
  receipt.hostVerification = PassedBundle.parse(JSON.parse(hostCheck.stdout));
  receipt.state = 'passed';
} catch (error) {
  receipt.error = error instanceof Error ? error.message : 'Container qualification failed';
} finally {
  try {
    const remaining = docker(['container', 'ls', '--all', '--no-trunc', '--filter', `label=tracegrove.run=${runId}`, '--format', '{{.ID}}'], 15000);
    if (remaining) {
      const owned = z.string().regex(/^[a-f0-9]{64}$/).parse(remaining);
      if (receipt.containerId && receipt.containerId !== owned) throw new Error('Container ownership changed');
      docker(['container', 'stop', '--timeout', '5', owned], 15000);
    }
    receipt.containerRemoved = docker(['container', 'ls', '--all', '--no-trunc', '--filter', `label=tracegrove.run=${runId}`, '--format', '{{.ID}}'], 15000) === '';
    if (!receipt.containerRemoved) throw new Error('Owned container remains');
  } catch (error) {
    receipt.state = 'blocked';
    receipt.cleanupError = error instanceof Error ? error.message : 'Container cleanup unconfirmed';
  }
  const qualified = ContainerQualification.parse(receipt);
  writeFileSync(join(output, 'qualification.json'), `${JSON.stringify(qualified, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(qualified)}\n`);
}
process.exitCode = receipt.state === 'passed' ? 0 : 2;
