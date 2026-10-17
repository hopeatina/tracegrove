/** Observe the executable used for launch; controller Node is not application identity. */
import { execFile, execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { RuntimeObservation, sha256Hex } from '../protocol/index.ts';
import { Blocked, InfrastructureFailure } from '../core/errors.ts';

const execute = promisify(execFile);
export function parseRuntimeVersion(output: string): Pick<RuntimeObservation, 'family' | 'version' | 'runtime'> {
  const node = /^v(\d+)\.(\d+)\.(\d+)$/.exec(output.trim());
  if (node) return { family: 'node', version: output.trim().slice(1), runtime: `node${node[1]}` };
  const python = /^Python (\d+)\.(\d+)\.(\d+)$/.exec(output.trim());
  if (python) return { family: 'python', version: output.trim().slice(7), runtime: `python${python[1]}.${python[2]}` };
  throw new Blocked([{ code: 'application_runtime_unrecognized', detail: 'launch executable did not report a supported Node or Python version',
    action: 'use the application interpreter directly; command wrappers require a qualified host adapter' }]);
}

function resolveExecutable(command: string, cwd: string, path: string): string {
  const candidates = isAbsolute(command) || command.includes('/')
    ? [resolve(cwd, command)] : path.split(delimiter).filter(Boolean).map(dir => resolve(cwd, dir, command));
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* try the next PATH entry */ }
  }
  throw new Blocked([{ code: 'launch_executable_missing', detail: command, action: 'install the interpreter or provide its executable path' }]);
}

const probeOptions = (cwd: string, path: string) => ({ cwd, env: { PATH: path }, timeout: 2000, maxBuffer: 4096, encoding: 'utf8' as const });
const observation = (stdout: string, executable: string): RuntimeObservation => RuntimeObservation.parse({
  ...parseRuntimeVersion(stdout), executable, executableSha256: sha256Hex(readFileSync(executable)),
});

/** Synchronous compiler companion; uses the same bounded interpreter probe as launch. */
export function observeApplicationRuntimeSync(command: string, cwd: string, path: string): RuntimeObservation {
  const executable = resolveExecutable(command, cwd, path);
  let stdout: string;
  try { stdout = execFileSync(executable, ['--version'], probeOptions(cwd, path)); }
  catch { throw new InfrastructureFailure('application runtime version probe failed or exceeded its limit'); }
  return observation(stdout, executable);
}

export async function observeApplicationRuntime(command: string, cwd: string, path: string, signal?: AbortSignal): Promise<RuntimeObservation> {
  const executable = resolveExecutable(command, cwd, path);
  let stdout: string;
  try {
    // No issued credentials, inherited NODE_OPTIONS or PYTHON* settings enter this probe.
    ({ stdout } = await execute(executable, ['--version'], { ...probeOptions(cwd, path), ...(signal ? { signal } : {}) }));
  } catch {
    // Candidate output/error messages may contain private values; never echo them.
    throw new InfrastructureFailure('application runtime version probe failed or exceeded its limit');
  }
  return observation(stdout, executable);
}
