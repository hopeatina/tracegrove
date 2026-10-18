/** `tracegrove init`: detect the framework, write a config, an example flow and a .gitignore entry. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { ADAPTERS } from './schema.ts';
import { CONFIG_FILE, STATE_DIR, configInDirectory } from './compile.ts';

type Adapter = typeof ADAPTERS[number];
export type Detection = { adapter: Adapter; entry?: string; run?: string; sources: string[]; reason: string };

function read(path: string): string { try { return readFileSync(path, 'utf8'); } catch { return ''; } }

function pyFiles(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > 3) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!['node_modules', '.git', '.venv', 'venv', '__pycache__', STATE_DIR, 'tests'].includes(entry.name)) pyFiles(join(dir, entry.name), depth + 1, out); }
    else if (entry.name.endsWith('.py')) out.push(join(dir, entry.name));
  }
  return out;
}

export function detect(root: string): Detection {
  const managePy = existsSync(join(root, 'manage.py')) ? '.' : readdirSync(root, { withFileTypes: true }).find((e) => e.isDirectory() && existsSync(join(root, e.name, 'manage.py')))?.name;
  if (managePy) return { adapter: 'django', entry: managePy, sources: [`${managePy === '.' ? '' : `${managePy}/`}**/*.py`], reason: `found ${managePy === '.' ? '' : `${managePy}/`}manage.py` };
  const pyDeps = read(join(root, 'pyproject.toml')) + read(join(root, 'requirements.txt'));
  if (/fastapi/i.test(pyDeps) || existsSync(join(root, 'main.py'))) {
    for (const file of pyFiles(root)) {
      const match = read(file).match(/^(\w+)\s*=\s*FastAPI\(/m);
      if (match) {
        const module = relative(root, file).replace(/\.py$/, '').split(sep).join('.');
        return { adapter: 'fastapi', entry: `${module}:${match[1]}`, sources: ['**/*.py'], reason: `found FastAPI app in ${relative(root, file)}` };
      }
    }
    return { adapter: 'fastapi', entry: 'app.main:app', sources: ['**/*.py'], reason: 'fastapi dependency found; set app.entry to module:app' };
  }
  const pkgText = read(join(root, 'package.json'));
  if (pkgText) {
    let pkg: { main?: string; scripts?: Record<string, string> } = {};
    try { pkg = JSON.parse(pkgText); } catch { /* fall through */ }
    if (pkg.scripts?.start) return { adapter: 'command', run: 'npm start', sources: ['src/**', 'server/**', '*.{js,mjs,cjs,ts}'], reason: 'package.json has a start script' };
    const entry = pkg.main ?? ['server.js', 'index.js', 'app.js', 'src/server.js', 'src/index.js'].find((f) => existsSync(join(root, f))) ?? 'server.js';
    return { adapter: 'node', entry, sources: ['**/*.{js,mjs,cjs,ts}'], reason: `package.json main ${entry}` };
  }
  return { adapter: 'command', run: 'echo "set app.run in tracegrove.config.yaml" && exit 1', sources: ['**/*'], reason: 'no framework detected' };
}

export const AUTH_SNIPPETS: Record<Adapter, string> = {
  fastapi: `# Accept tracegrove's per-run tokens (test mode only)
import json, os
from fastapi import Header, HTTPException
TRACEGROVE_TOKENS = json.loads(os.environ.get("TRACEGROVE_TOKENS", "{}"))
def current_user(authorization: str = Header("")):
    subject = TRACEGROVE_TOKENS.get(authorization.removeprefix("Bearer "))
    if not subject:
        raise HTTPException(status_code=401)
    return subject`,
  django: `# settings.py MIDDLEWARE += ["yourapp.tracegrove.auth"]  (test mode only)
import json, os
from django.contrib.auth import get_user_model
TOKENS = json.loads(os.environ.get("TRACEGROVE_TOKENS", "{}"))
def auth(get_response):
    def middleware(request):
        subject = TOKENS.get(request.headers.get("Authorization", "").removeprefix("Bearer "))
        if subject:
            request.user = get_user_model().objects.get_or_create(username=subject)[0]
        return get_response(request)
    return middleware`,
  node: `// Accept tracegrove's per-run tokens (test mode only)
const tokens = JSON.parse(process.env.TRACEGROVE_TOKENS ?? '{}');
app.use((req, _res, next) => { req.user = tokens[(req.headers.authorization ?? '').replace(/^Bearer /, '')]; next(); });`,
  command: `Read TRACEGROVE_TOKENS (JSON {token: subject}) and treat "Authorization: Bearer <token>" as that subject.`,
};

/** Written next to the flows so any coding agent (Claude Code, Codex, Cursor) learns the loop. */
export const AGENTS_GUIDE = `# tracegrove: notes for coding agents

This folder holds behaviour tests that tracegrove runs against the real app.

- One behaviour per file: \`<area>/<behavior>.flow.yaml\` (kebab-case). The case id is \`<area>.<behavior>\`.
- Steps: \`- name: ...\` plus one verb key (\`GET: /notes/{noteId}\`), optional \`json\`, \`as: <persona>\`,
  \`expect\` (a status, or \`{ status, json: {dot.path: value}, present, absent, count }\`), \`save: { var: dot.path }\`.
- Personas are declared in ../tracegrove.config.yaml; \`as: none\` is an unauthenticated caller.

The loop (every command takes --json and prints machine-readable \`next\` actions):

1. \`tracegrove status --json\`   where things stand and what to run next
2. \`tracegrove check --json\`    compile only; fix every issue it lists (file, step, fix)
3. \`tracegrove test --json\`     run against the real app; read \`cases[].failure\`
4. \`tracegrove heal --json\`     fixes setup, repairs drifted tests, keeps only fixes a re-run proves;
                                  \`heal --undo latest\` reverts them

Rules: never weaken a test to make it pass. If the app is wrong (a denial now succeeds, data is lost,
a 5xx), leave the flow red and report the bug. Never delete steps or expectations.
`;

export function initProject(root: string, options: { force?: boolean } = {}): { files: string[]; detection: Detection; snippet: string } {
  const configPath = join(root, CONFIG_FILE);
  const existing = configInDirectory(root);
  if (existing && existing !== configPath) throw new Blocked([{ code: 'config_exists', detail: existing, owner: 'operator', action: 'edit the existing TypeScript config; init does not replace another format' }]);
  if (existsSync(configPath) && !options.force) throw new Blocked([{ code: 'config_exists', detail: configPath, owner: 'operator', action: 'edit it, or rerun with --force to overwrite' }]);
  const d = detect(root);
  const appLines = [`  adapter: ${d.adapter}`];
  if (d.entry) appLines.push(`  entry: ${d.entry}`);
  if (d.run) appLines.push(`  run: ${JSON.stringify(d.run)}`);
  appLines.push('  health: /health', `  sources: ${JSON.stringify(d.sources)}`);
  if (d.adapter === 'django') appLines.push('  # point DATABASES at os.environ["TRACEGROVE_DATA_DIR"] for a fresh database per run');
  const config = `# tracegrove: ${d.reason}\nproject: ${(root.split(sep).pop() ?? 'app').replace(/[^A-Za-z0-9_-]/g, '-').replace(/^[^A-Za-z]+/, '') || 'app'}\napp:\n${appLines.join('\n')}\npersonas:\n  user: { subject: alice }\n  stranger: { subject: bob }\n`;
  const flowDir = join(root, 'tracegrove');
  const flow = `title: The app is up and answers its health check\ntags: [smoke]\nsteps:\n  - name: health\n    GET: /health\n    as: none\n    expect: 200\n`;
  mkdirSync(flowDir, { recursive: true });
  writeFileSync(configPath, config);
  const flowPath = join(flowDir, 'health.flow.yaml');
  const files = [configPath];
  if (!existsSync(flowPath)) { writeFileSync(flowPath, flow); files.push(flowPath); }
  const agents = join(flowDir, 'AGENTS.md');
  if (!existsSync(agents)) { writeFileSync(agents, AGENTS_GUIDE); files.push(agents); }
  const gitignore = join(root, '.gitignore');
  if (!read(gitignore).split('\n').some((line) => line.trim() === `${STATE_DIR}/` || line.trim() === STATE_DIR)) {
    appendFileSync(gitignore, `${read(gitignore) && !read(gitignore).endsWith('\n') ? '\n' : ''}${STATE_DIR}/\n`);
    files.push(gitignore);
  }
  return { files, detection: d, snippet: AUTH_SNIPPETS[d.adapter] };
}
