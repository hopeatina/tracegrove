/** `tracegrove init`: detect the framework, write a config, an example flow and a .gitignore entry. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { stringify } from 'yaml';
import { staticPage, pageRoute } from './staticPage.ts';
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
  const flask = /\bflask\b/i.test(pyDeps);
  if (/fastapi/i.test(pyDeps) || flask || ['app.py', 'main.py'].some(file => existsSync(join(root, file)))) {
    for (const file of pyFiles(root)) {
      const source = read(file);
      const match = source.match(/^(\w+)\s*=\s*(FastAPI|Flask)\(/m);
      const factory = !match && /\bFlask\(/.test(source) && /^def create_app\(/m.test(source);
      if (match || factory) {
        const module = relative(root, file).replace(/\.py$/, '').split(sep).join('.').replace(/\.__init__$/, '');
        const adapter = match?.[2] === 'FastAPI' ? 'fastapi' : 'flask';
        return { adapter, entry: `${module}:${match?.[1] ?? 'create_app'}`, sources: ['**/*.py'], reason: `found ${match?.[2] ?? 'Flask factory'} app in ${relative(root, file)}` };
      }
    }
    if (flask && !/fastapi/i.test(pyDeps)) return { adapter: 'flask', entry: 'app:app', sources: ['**/*.py'], reason: 'Flask dependency found; set app.entry to module:app' };
    if (/fastapi/i.test(pyDeps) || existsSync(join(root, 'main.py'))) return { adapter: 'fastapi', entry: 'app.main:app', sources: ['**/*.py'], reason: 'fastapi dependency found; set app.entry to module:app' };
  }
  const examplePage = ['index.html', 'demo.html', 'example/index.html', 'examples/index.html', 'demo/index.html', 'demos/index.html', 'docs/index.html'].find(path => existsSync(join(root, path)));
  const staticEntry = (entry: string): Detection => ({ adapter: 'static', entry, sources: [], reason: `found a browser entry in ${entry}` });
  const pkgText = read(join(root, 'package.json'));
  if (pkgText) {
    let pkg: { main?: string; scripts?: Record<string, string> } = {};
    try { pkg = JSON.parse(pkgText); } catch { /* fall through */ }
    const start = /^node (?:\.\/)?([\w/-]+\.(?:c?js|mjs))$/.exec(pkg.scripts?.start ?? '')?.[1];
    if (start && /process\.env\.PORT\b/.test(read(join(root, start)))) {
      return { adapter: 'node', entry: start, sources: ['**/*.{js,mjs,cjs,ts}'], reason: `start script runs ${start} on the assigned port` };
    }
    if (pkg.scripts?.start) return { adapter: 'command', run: 'npm start', sources: ['src/**', 'server/**', '*.{js,mjs,cjs,ts}'], reason: 'package.json has a start script' };
    // package.json `main` often names a build output that does not exist yet; only trust it when the file is there.
    const declared = pkg.main && existsSync(join(root, pkg.main)) ? pkg.main : undefined;
    const found = declared ?? ['server.js', 'index.js', 'app.js', 'src/server.js', 'src/index.js'].find((f) => existsSync(join(root, f)));
    if (examplePage) {
      const declaredAsset = declared?.replace(/^\.\//, '');
      const demoOfLibrary = examplePage !== 'index.html' && declared && !/(^|\/)(app|server|index)\.[cm]?js$/.test(declared) && !/\.listen\s*\(/.test(read(join(root, declared)));
      if (!found || demoOfLibrary || (declaredAsset && staticPage(root, examplePage).assets.includes(declaredAsset))) return staticEntry(examplePage);
    }
    const entry = found ?? 'server.js';
    const reason = declared ? `package.json main ${entry}` : found ? `found ${entry}${pkg.main ? ` (package.json main ${pkg.main} does not exist)` : ''}` : `no entry file found; set app.entry (guessed ${entry})`;
    return { adapter: 'node', entry, sources: ['**/*.{js,mjs,cjs,ts}'], reason };
  }
  if (examplePage) return staticEntry(examplePage);
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
  flask: `# In a test-only Flask before_request hook, look up the request's Bearer token in
# json.loads(os.environ["TRACEGROVE_TOKENS"]) to identify the caller.`,
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
  static: 'Run tracegrove setup browsers, then tracegrove test. Add a flow for one interaction that matters to the people using this page.',
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

Environments (local, docker, staging, production; see docs/environments.md):

- Runs default to \`local\`. Choose another with \`--env <name>\` or TRACEGROVE_ENV. A flow runs only in the
  environments it lists under \`envs:\`; adding an environment there is a reviewed change, not a fix.
- Before testing a deployed environment: \`tracegrove env doctor <env> --json\`, then \`tracegrove explain --env <env> --json\`.
  Act on each check's \`fix\` only when its \`owner\` is \`agent\`; otherwise stop and tell a person.
- Agent policy per environment: \`allow\`, \`ask\` (exit 2 \`approval_required\`: a person runs \`tracegrove approve --env <env>\`;
  never run it yourself and never write .tracegrove/approvals/) or \`deny\` (do not retry).
- Never print, copy, commit or paste a persona secret. Configs hold references (env:, aws-sm://, op://, orgx-broker://) only.
- Never change \`class\`, \`writes\` or \`agents\` of an environment, or a flow's \`envs:\`, to make a run pass.
- Staging and production failures are real: \`persona_identity_mismatch\`, \`deployed_cleanup_unconfirmed\`,
  \`persona_credential_expired\` and \`environment_writes_forbidden\` go to a person, not to heal.
`;

const HEALTH_FLOW = `title: The app is up and answers its health check\ntags: [smoke]\nsteps:\n  - name: health\n    GET: /health\n    as: none\n    expect: 200\n`;

export function initProject(root: string, options: { force?: boolean; staticEntry?: string; expectedTitle?: string } = {}): { files: string[]; detection: Detection; snippet: string; missingAssets?: string[]; externalAssetOrigins?: string[] } {
  const configPath = join(root, CONFIG_FILE);
  const existing = configInDirectory(root);
  if (existing && existing !== configPath) throw new Blocked([{ code: 'config_exists', detail: existing, owner: 'operator', action: 'edit the existing TypeScript config; init does not replace another format' }]);
  if (existsSync(configPath) && !options.force) throw new Blocked([{ code: 'config_exists', detail: configPath, owner: 'operator', action: 'edit it, or rerun with --force to overwrite' }]);
  const d: Detection = options.staticEntry
    ? { adapter: 'static', entry: options.staticEntry, sources: [], reason: 'selected static HTML entry' } : detect(root);
  const page = d.adapter === 'static' ? staticPage(root, d.entry!) : null;
  if (options.expectedTitle !== undefined && !page) throw new Blocked([{ code: 'invalid_argument', detail: '--title requires a static page', action: 'select a static HTML entry' }]);
  if (page) d.entry = page.file;
  const appLines = [`  adapter: ${d.adapter}`];
  if (d.entry) appLines.push(`  entry: ${page ? JSON.stringify(d.entry) : d.entry}`);
  if (d.run) appLines.push(`  run: ${JSON.stringify(d.run)}`);
  appLines.push(`  health: ${page ? JSON.stringify(pageRoute(page.file)) : '/health'}`);
  if (d.sources.length) appLines.push(`  sources: ${JSON.stringify(d.sources)}`);
  if (d.adapter === 'django') appLines.push('  # point DATABASES at os.environ["TRACEGROVE_DATA_DIR"] for a fresh database per run');
  const config = `# tracegrove: ${d.reason}\nproject: ${(root.split(sep).pop() ?? 'app').replace(/[^A-Za-z0-9_-]/g, '-').replace(/^[^A-Za-z]+/, '') || 'app'}\napp:\n${appLines.join('\n')}\npersonas:\n  user: { subject: alice${page ? ', inputMode: pointer' : ''} }\n  stranger: { subject: bob }\n`;
  const flowDir = join(root, 'tracegrove');
  const flow = page ? stringify({
    title: 'The selected page opens in a browser', tags: ['smoke'], as: 'none',
    browser: { allowPaths: ['/'], allowMethods: ['GET', 'HEAD'], maxActions: 256 },
    steps: [{ name: 'open the page', browser: { kind: 'navigate', path: pageRoute(page.file) }, expect: { status: 200 } },
      { name: 'check the document title', browser: { kind: 'read', target: { by: 'document', name: 'title' } }, expect: { text: options.expectedTitle ?? page.title } }],
  }) : HEALTH_FLOW;
  mkdirSync(flowDir, { recursive: true });
  writeFileSync(configPath, config);
  const flowPath = join(flowDir, page ? 'page.flow.yaml' : 'health.flow.yaml');
  const files = [configPath];
  if (!existsSync(flowPath)) { writeFileSync(flowPath, flow); files.push(flowPath); }
  const oldHealth = join(flowDir, 'health.flow.yaml');
  if (page && existing && options.force && read(oldHealth) === HEALTH_FLOW) unlinkSync(oldHealth);
  const agents = join(flowDir, 'AGENTS.md');
  if (!existsSync(agents)) { writeFileSync(agents, AGENTS_GUIDE); files.push(agents); }
  const gitignore = join(root, '.gitignore');
  if (!read(gitignore).split('\n').some((line) => line.trim() === `${STATE_DIR}/` || line.trim() === STATE_DIR)) {
    appendFileSync(gitignore, `${read(gitignore) && !read(gitignore).endsWith('\n') ? '\n' : ''}${STATE_DIR}/\n`);
    files.push(gitignore);
  }
  return { files, detection: d, snippet: AUTH_SNIPPETS[d.adapter] + (page?.missing.length ? `\nMissing local assets: ${page.missing.join(', ')}. Build or supply these assets before checking dependent interactions.` : '') + (page?.externalOrigins.length ? `\nExternal scripts or stylesheets are outside local replay: ${page.externalOrigins.join(', ')}. Use a self-contained build for workflows that depend on them.` : ''), ...(page ? { missingAssets: page.missing, externalAssetOrigins: page.externalOrigins } : {}) };
}
