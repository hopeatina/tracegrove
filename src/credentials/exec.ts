/** Bounded child-process runner shared by CLI-backed resolvers (1Password) and the Docker hosts. */
import { spawn } from 'node:child_process';
import type { ExecFn } from './types.ts';

export const execFile: ExecFn = (command, args, options) => new Promise((resolve) => {
  let stdout = ''; let stderr = '';
  let child: ReturnType<typeof spawn>;
  try { child = spawn(command, args, { env: options.env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { resolve({ code: null, stdout: '', stderr: (error as Error).message }); return; }
  const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs);
  const abort = () => child.kill('SIGKILL');
  options.signal.addEventListener('abort', abort, { once: true });
  child.stdout?.on('data', (chunk: Buffer) => { if (stdout.length < 4 * 1024 * 1024) stdout += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8'); });
  child.on('error', (error) => { clearTimeout(timer); options.signal.removeEventListener('abort', abort); resolve({ code: null, stdout, stderr: stderr || error.message }); });
  child.on('close', (code) => { clearTimeout(timer); options.signal.removeEventListener('abort', abort); resolve({ code, stdout, stderr }); });
});
