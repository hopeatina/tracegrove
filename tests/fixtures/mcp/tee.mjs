/** Byte-preserving, bounded, test-only stdio tee around exactly the adjacent fixture server. */
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.FIXTURE_ROOT;
const maxBytes = Number(process.env.FIXTURE_MAX_BYTES);
const wallMs = Number(process.env.FIXTURE_WALL_MS);
// Controlled startup fault before any ownership receipt, for diagnostics conformance only.
if (process.env.FIXTURE_STARTUP_FAULT === 'exit_before_receipt') process.exit(72);
if (!root || !Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 262144 || !Number.isInteger(wallMs) || wallMs < 100 || wallMs > 15000) process.exit(2);
const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
  cwd: root, env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, FIXTURE_ROOT: root }, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
});
writeFileSync(join(root, 'tee-pid.json'), JSON.stringify({ pid: process.pid, serverPid: child.pid }));
let bytes = 0; let sequence = 0; let reason = 'running'; let killTimer;
const offsets = { client_to_server: 0, server_to_client: 0 };
const record = event => appendFileSync(join(root, 'wire-events.jsonl'), JSON.stringify(event) + '\n');
const stop = code => {
  if (reason !== 'running') return;
  reason = code; record({ kind: 'control', reason });
  process.stdin.pause(); child.stdin.end(); child.kill('SIGTERM');
  killTimer = setTimeout(() => child.kill('SIGKILL'), 200);
};
const timer = setTimeout(() => stop('wall_limit'), wallMs);
function forward(direction, chunk, destination, source) {
  if (reason !== 'running') return;
  bytes += chunk.length;
  if (bytes > maxBytes) { stop('byte_limit'); return; }
  appendFileSync(join(root, `${direction}.bin`), chunk);
  record({ kind: 'chunk', sequence: sequence++, direction, offset: offsets[direction], byteCount: chunk.length });
  offsets[direction] += chunk.length;
  if (!destination.write(chunk)) { source.pause(); destination.once('drain', () => source.resume()); }
}
process.stdin.on('data', chunk => forward('client_to_server', chunk, child.stdin, process.stdin));
child.stdout.on('data', chunk => forward('server_to_client', chunk, process.stdout, child.stdout));
process.stdin.on('end', () => child.stdin.end());
process.stdin.on('error', () => stop('client_input_error'));
process.stdout.on('error', () => stop('client_output_error'));
child.stdin.on('error', () => stop('server_input_error'));
child.stdout.on('error', () => stop('server_output_error'));
let stderrBytes = 0;
child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 4096) stop('stderr_limit'); });
child.once('error', () => stop('spawn_error'));
child.once('close', (code, signal) => {
  clearTimeout(timer); clearTimeout(killTimer);
  record({ kind: 'closed', reason: reason === 'running' ? 'peer_closed' : reason, code, signal, bytes, stderrBytes });
  process.stdin.pause(); process.stdout.end(() => process.exit(reason === 'running' && code === 0 ? 0 : 1));
});
process.on('SIGTERM', () => stop('client_closed'));
