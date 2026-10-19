/** Observe the executable used for launch; controller Node is not application identity. */
import { execFile, execFileSync } from 'node:child_process';
import { accessSync, constants, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
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
// Hashing a 100+ MB interpreter costs 100-250 ms, and compile plus every case used to repeat it.
// The key includes ctime, which any write to the file changes and unprivileged users cannot set back.
const digestCachePath = () => join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'tracegrove', 'runtime-digests.json');
const digestMemo = new Map<string, string>();

function statKey(executable: string): string {
  const s = statSync(executable, { bigint: true });
  return [executable, s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
}

function readDigestCache(): Record<string, string> {
  try { const value: unknown = JSON.parse(readFileSync(digestCachePath(), 'utf8')); return value && typeof value === 'object' ? value as Record<string, string> : {}; }
  catch { return {}; }
}

export function executableDigest(executable: string): string {
  const key = statKey(executable);
  const known = digestMemo.get(key) ?? readDigestCache()[key];
  if (typeof known === 'string' && /^[0-9a-f]{64}$/.test(known)) { digestMemo.set(key, known); return known; }
  const digest = sha256Hex(readFileSync(executable));
  // A changed file between stat and read must not be cached under the old key.
  if (statKey(executable) !== key) return digest;
  digestMemo.set(key, digest);
  try {
    const path = digestCachePath();
    const entries = Object.entries({ ...readDigestCache(), [key]: digest }).filter(([k]) => !k.startsWith(`${executable}:`) || k === key).slice(-32);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(Object.fromEntries(entries))}\n`);
    renameSync(temporary, path);
  } catch { /* the cache is an optimisation; a read-only home only costs the re-hash */ }
  return digest;
}

const observation = (stdout: string, executable: string): RuntimeObservation => RuntimeObservation.parse({
  ...parseRuntimeVersion(stdout), executable, executableSha256: executableDigest(executable),
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
