import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

export type WireChunk = { kind: 'chunk'; sequence: number; direction: 'client_to_server' | 'server_to_client'; offset: number; byteCount: number };
export type Frame = { bytes: Buffer; offset: number; message: ReturnType<typeof JSONRPCMessageSchema.parse> };
export const fixtureDir = dirname(fileURLToPath(import.meta.url));
export function jsonLines(root: string, name: string): Array<Record<string, unknown>> {
  const file = join(root, name);
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
export function frames(root: string, direction: WireChunk['direction']): Frame[] {
  const raw = readFileSync(join(root, `${direction}.bin`));
  const result: Frame[] = []; let start = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] === 10) {
    const bytes = Buffer.from(raw.subarray(start, i + 1));
    result.push({ bytes, offset: start, message: JSONRPCMessageSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) });
    start = i + 1;
  }
  if (start !== raw.length) throw new Error('incomplete_native_message');
  return result;
}
async function until(check: () => boolean, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;
  while (!check()) { if (performance.now() >= deadline) throw new Error('fixture_cleanup_or_observation_timeout'); await delay(10); }
}
type StartupDiagnostics = { root: string; retainedPath: string | null; cleanup: 'confirmed' | 'unknown'; cleanupError: string | null; retentionError: string | null };
export class FixtureStartupError extends Error {
  constructor(cause: unknown, readonly diagnostics: StartupDiagnostics) {
    super(cause instanceof Error ? cause.message : 'fixture_startup_failed', { cause }); this.name = 'FixtureStartupError';
  }
}
export async function startFixture(options: { maxBytes?: number; wallMs?: number; startupFault?: 'exit_before_receipt' } = {}) {
  const maxBytes = options.maxBytes ?? 131072; const wallMs = options.wallMs ?? 10000;
  // Match tee bounds before allocating files or spawning either process.
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 262144 || !Number.isInteger(wallMs) || wallMs < 100 || wallMs > 15000)
    throw new RangeError('fixture_invalid_limits');
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-mcp-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(fixtureDir, 'tee.mjs')], cwd: root,
    env: { HOME: root, LOGNAME: '', PATH: dirname(process.execPath), SHELL: '', TERM: '', USER: '',
      FIXTURE_ROOT: root, FIXTURE_MAX_BYTES: String(maxBytes), FIXTURE_WALL_MS: String(wallMs),
      FIXTURE_STARTUP_FAULT: options.startupFault ?? '' }, stderr: 'pipe' });
  const errors: string[] = [];
  const client = new Client({ name: 'tracegrove-conformance-client', version: '1' }, { capabilities: {} });
  client.onerror = error => errors.push(error.message);
  transport.stderr?.on('data', () => { /* drain SDK tee diagnostics without exporting text */ });
  let closed = false;
  let cleanupReceipt: { teeAbsent: boolean; serverAbsent: boolean; events: Array<Record<string, unknown>> } | undefined;
  const fixture = { root, client, transport, errors, waitFor: until,
    async close() {
      if (closed) return cleanupReceipt;
      await client.close();
      if (!existsSync(join(root, 'tee-pid.json'))) throw new Error('fixture_pid_receipt_missing');
      const pids = JSON.parse(readFileSync(join(root, 'tee-pid.json'), 'utf8')) as { pid: number; serverPid: number };
      if (![pids.pid, pids.serverPid].every(pid => Number.isInteger(pid) && pid > 0)) throw new Error('fixture_pid_receipt_invalid');
      const absent = (pid: number) => { try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } };
      await until(() => absent(pids.pid) && absent(pids.serverPid));
      const events = jsonLines(root, 'wire-events.jsonl');
      if (!events.some(event => event.kind === 'closed')) throw new Error('missing_fixture_close_receipt');
      closed = true;
      cleanupReceipt = { teeAbsent: true, serverAbsent: true, events };
      return cleanupReceipt;
    },
    retain(name: string) { const output = join(process.cwd(), 'artifacts/qa/mcp-stdio', name, basename(root)); mkdirSync(dirname(output), { recursive: true }); cpSync(root, output, { recursive: true, errorOnExist: true, force: false }); return output; },
    remove() { if (!closed) throw new Error('cannot_remove_unconfirmed_fixture'); rmSync(root, { recursive: true, force: true }); },
  };
  try { await client.connect(transport, { timeout: 2000 }); return fixture; }
  catch (error) {
    const diagnostics: StartupDiagnostics = { root, retainedPath: null, cleanup: 'unknown', cleanupError: null, retentionError: null };
    try { await fixture.close(); diagnostics.cleanup = 'confirmed'; }
    catch (cleanupError) { diagnostics.cleanupError = cleanupError instanceof Error ? cleanupError.message : 'fixture_cleanup_failed'; }
    // Retain after a failed cleanup too. Missing PID evidence never establishes cleanup.
    try {
      writeFileSync(join(root, 'startup-failure.json'), JSON.stringify({ originalCause: { name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : 'fixture_startup_failed' }, ...diagnostics }, null, 2));
      diagnostics.retainedPath = fixture.retain('failed-connect');
    } catch (retentionError) { diagnostics.retentionError = retentionError instanceof Error ? retentionError.message : 'fixture_retention_failed'; }
    if (diagnostics.cleanup === 'confirmed' && diagnostics.retainedPath) fixture.remove();
    throw new FixtureStartupError(error, diagnostics);
  }
}
export type Fixture = Awaited<ReturnType<typeof startFixture>>;
