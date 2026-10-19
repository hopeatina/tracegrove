/** Thin Docker CLI port shared by the compose and container hosts; tests inject a fake runner. */
import { Blocked, InfrastructureFailure } from '../core/errors.ts';
import { execFile } from '../credentials/exec.ts';
import type { ExecFn, ExecResult } from '../credentials/types.ts';

export type DockerCli = { run(args: string[], options?: { env?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal }): Promise<ExecResult> };

let override: DockerCli | null = null;
/** Test seam: replace the Docker CLI for the current process. */
export function setDockerCli(cli: DockerCli | null): void { override = cli; }

export function dockerCli(exec: ExecFn = execFile): DockerCli {
  if (override) return override;
  const binary = process.env.TRACEGROVE_DOCKER_BIN ?? 'docker';
  return { run: (args, options = {}) => exec(binary, args, { env: { ...process.env, ...(options.env ?? {}) }, signal: options.signal ?? new AbortController().signal, timeoutMs: options.timeoutMs ?? 120_000 }) };
}

export async function requireDocker(cli: DockerCli, signal: AbortSignal, compose = false): Promise<void> {
  const server = await cli.run(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000, signal });
  if (server.code !== 0 || !server.stdout.trim()) throw new Blocked([{ code: 'docker_unavailable', detail: server.code === null ? 'the docker CLI is not installed' : `the Docker daemon is not reachable: ${server.stderr.trim().split('\n')[0] ?? ''}`, owner: 'developer', action: 'start Docker, then run docker info' }]);
  if (compose) {
    const plugin = await cli.run(['compose', 'version', '--short'], { timeoutMs: 15_000, signal });
    if (plugin.code !== 0) throw new Blocked([{ code: 'docker_unavailable', detail: 'docker compose is not installed', owner: 'developer', action: 'install the Docker Compose plugin' }]);
  }
}

export async function must(cli: DockerCli, args: string[], what: string, options: Parameters<DockerCli['run']>[1] = {}): Promise<string> {
  const result = await cli.run(args, options);
  if (result.code !== 0) throw new InfrastructureFailure(`${what} failed (exit ${result.code ?? 'spawn'}): ${result.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  return result.stdout.trim();
}

/** `docker port` / `docker compose port` print `0.0.0.0:49153` (and maybe an IPv6 line); use loopback. */
export function loopbackOrigin(portOutput: string): string {
  const line = portOutput.split('\n').map(l => l.trim()).find(l => /:\d+$/.test(l));
  const port = line?.match(/:(\d+)$/)?.[1];
  if (!port) throw new InfrastructureFailure(`could not read the published port from: ${portOutput || '(empty)'}`);
  return `http://127.0.0.1:${port}`;
}

export const dockerName = (prefix: string, executionId: string, unique: string) =>
  `${prefix}-${executionId.slice(-16)}-${unique}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '-').replace(/-+/g, '-').slice(0, 60).replace(/[-.]+$/, '');
