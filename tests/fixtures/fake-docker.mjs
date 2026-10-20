#!/usr/bin/env node
// A stand-in for the docker CLI, enough for the container host: `run -d` starts the image's app as a
// local process on a free port; `port`, `inspect`, `logs`, `rm` and `ps` answer from a state folder.
// Every argv is appended to $FAKE_DOCKER_STATE/argv.log so tests can prove no secret reached argv.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const state = process.env.FAKE_DOCKER_STATE;
const app = process.env.FAKE_DOCKER_APP;
mkdirSync(state, { recursive: true });
const args = process.argv.slice(2);
appendFileSync(join(state, 'argv.log'), `${JSON.stringify(args)}\n`);
const IMAGE = 'sha256:5e7a1c0ffee0000000000000000000000000000000000000000000000000001';
const file = (name) => join(state, `${name}.json`);
const out = (text) => { process.stdout.write(`${text}\n`); process.exit(0); };
const freePort = () => new Promise((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); }); });

const [cmd] = args;
if (cmd === 'version') out('27.0.0-fake');
if (cmd === 'image' && args[1] === 'inspect') out(IMAGE);
if (cmd === 'run') {
  const name = args[args.indexOf('--name') + 1];
  const keys = args.flatMap((a, i) => (a === '-e' ? [args[i + 1]] : []));
  const port = await freePort();
  const env = { PATH: process.env.PATH, ...Object.fromEntries(keys.map(k => [k, process.env[k] ?? ''])), PORT: String(port), HOST: '127.0.0.1', NOTES_DIR: join(state, name) };
  appendFileSync(join(state, 'env-values.log'), `${JSON.stringify(keys.map(k => process.env[k] ?? ''))}\n`);
  const child = spawn(process.execPath, [app], { env, detached: true, stdio: 'ignore' });
  child.unref();
  writeFileSync(file(name), JSON.stringify({ pid: child.pid, port }));
  out(`c0ffee${name.replace(/[^a-z0-9]/g, '')}`.padEnd(64, '0').slice(0, 64));
}
if (cmd === 'port') { const s = JSON.parse(readFileSync(file(args[1]), 'utf8')); out(`0.0.0.0:${s.port}\n[::]:${s.port}`); }
if (cmd === 'inspect') out(IMAGE);
if (cmd === 'logs') out('');
if (cmd === 'rm') {
  const name = args.at(-1);
  if (existsSync(file(name))) { try { process.kill(JSON.parse(readFileSync(file(name), 'utf8')).pid); } catch { /* gone */ } rmSync(file(name)); }
  out(name);
}
if (cmd === 'ps') { const name = (args.find(a => a.startsWith('name=')) ?? '').replace(/^name=\^|\$$/g, ''); out(existsSync(file(name)) ? 'c0ffee' : ''); }
process.stderr.write(`fake docker: unsupported ${args.join(' ')}\n`); process.exit(1);
