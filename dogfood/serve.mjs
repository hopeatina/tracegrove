// Dogfood harness: serves `tracegrove ui` over a fresh copy of the notes sample, so tracegrove can
// test its own UI server. The operator persona's token becomes the UI session token.
// Env: PORT, TRACEGROVE_DATA_DIR, TRACEGROVE_TOKENS (JSON object token -> subject).
// Agent drafts go to the stand-in agent in dogfood/agent, so they are free and repeatable.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUi } from '../dist/authoring/ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = process.env.TRACEGROVE_DATA_DIR ?? join(here, '.data');
const tokens = JSON.parse(process.env.TRACEGROVE_TOKENS ?? '{}');
const token = Object.entries(tokens).find(([, subject]) => subject === 'operator')?.[0];
const project = join(data, 'notes');
mkdirSync(data, { recursive: true });
cpSync(join(here, '../src/samples/notes-api'), project, { recursive: true });

// A git history with one feature branch for `grow` to read: notes-count adds GET /notes/count, its flow,
// and acceptance criteria in the commit message. main stays checked out, so every other flow sees the plain sample.
const git = (...args) => execFileSync('git', ['-C', project, '-c', 'user.email=dogfood@tracegrove.dev', '-c', 'user.name=dogfood', ...args], { stdio: 'pipe' });
rmSync(join(project, '.git'), { recursive: true, force: true });
git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-qm', 'Notes sample');
git('checkout', '-qb', 'notes-count');
const app = join(project, 'app/app.mjs');
writeFileSync(app, readFileSync(app, 'utf8').replace('  const match = url.pathname.match(', `  if (req.method === 'GET' && url.pathname === '/notes/count') {
    const count = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((n) => n.ownerId === userId).length;
    return send(res, 200, { count });
  }
  const match = url.pathname.match(`));
cpSync(join(here, 'fixtures/count.flow.yaml'), join(project, 'tracegrove/notes/count.flow.yaml'));
git('add', '-A');
git('commit', '-qm', 'Count notes\n\n## Acceptance criteria\n- [ ] GET /notes/count returns how many notes the caller owns\n- [ ] Another user\'s notes are never counted\n- [ ] Without a token the count is refused');
git('checkout', '-q', 'main');

// Drafting uses the deterministic stand-in agent in dogfood/agent, never a real model.
process.env.PATH = `${join(here, 'agent')}${delimiter}${process.env.PATH ?? ''}`;

const server = await startUi({ dir: project, port: Number(process.env.PORT ?? 0), ...(token ? { token } : {}) });
const stop = () => { void server.close().then(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
