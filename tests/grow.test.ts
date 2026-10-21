import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { scanSource } from '../src/authoring/discover.ts';
import { grow } from '../src/authoring/grow.ts';
import { criteriaFrom, harnessOf, isPatternSource, isTestFile, matchCriterion, readChange, roleOf, routesOf, scaffoldsOf, unitsOf } from '../src/authoring/growChange.ts';
import { applyGrow, criterionStatus, freshGrow, growView, type GrowEvent } from '../src/authoring/growState.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { growCommand } from '../src/cli/grow.ts';
import { plainLine, renderGrove } from '../src/cli/renderGrove.ts';

const temps: string[] = [];
const servers: UiServer[] = [];
const path0 = process.env.PATH;
afterEach(async () => {
  process.env.PATH = path0;
  for (const s of servers.splice(0)) await s.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'tracegrove-grow-')); temps.push(dir); return dir; };
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'pipe' }).toString();
const write = (dir: string, file: string, text: string) => { mkdirSync(join(dir, file, '..'), { recursive: true }); writeFileSync(join(dir, file), text); };

/** A small node app on main, and a branch that adds a refund route calling Stripe plus a spec in the commit. */
function repo(): string {
  const dir = temp();
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'package.json', JSON.stringify({ name: 'shop', bin: { shop: 'cli.mjs' } }));
  write(dir, 'app.mjs', "import http from 'node:http';\nexport const server = http.createServer((req, res) => {\n  const url = new URL(req.url, 'http://x');\n  if (req.method === 'GET' && url.pathname === '/orders') return res.end('[]');\n  res.end();\n});\n");
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
  git(dir, 'checkout', '-qb', 'refunds');
  write(dir, 'app.mjs', "import http from 'node:http';\nimport Stripe from 'stripe';\nconst stripe = new Stripe(process.env.STRIPE_KEY);\nexport const server = http.createServer(async (req, res) => {\n  const url = new URL(req.url, 'http://x');\n  if (req.method === 'GET' && url.pathname === '/orders') return res.end('[]');\n  if (req.method === 'POST' && url.pathname === '/refunds') { await stripe.refunds.create({ charge: 'ch_1' }); res.statusCode = 201; return res.end('{}'); }\n  res.end();\n});\n");
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'Add refunds\n\n## Acceptance criteria\n- [ ] A customer can refund an order with POST /refunds\n- [ ] Refunds send the charge to Stripe\n- [ ] Partial refunds are rejected');
  return dir;
}

/** Five routes in five files, so five journeys, with 25, 25, 25, 20 and 5 changed lines in their handlers, and no spec. */
function fiveRoutes(): string {
  const dir = temp();
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'package.json', JSON.stringify({ name: 'shop' }));
  write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\n");
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
  git(dir, 'checkout', '-qb', 'five');
  for (const [name, size] of [['alpha', 25], ['beta', 25], ['gamma', 25], ['delta', 20], ['tiny', 5]] as const) {
    const body = Array.from({ length: size }, (_, i) => `  const v${i} = ${i};`).join('\n');
    write(dir, `routes/${name}.mjs`, `import { app } from '../server.mjs';\napp.post('/${name}', (req, res) => {\n${body}\n  res.json({});\n});\n`);
  }
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Five routes');
  return dir;
}

/** A `claude` on PATH that answers every trace with these units. */
function fakeClaude(units: unknown[]): void {
  const bin = temp();
  const answer = JSON.stringify({ units });
  write(bin, 'claude', `#!/bin/sh\necho '${JSON.stringify({ type: 'result', result: answer }).replaceAll("'", "'\\''")}'\n`);
  chmodSync(join(bin, 'claude'), 0o755);
  process.env.PATH = `${bin}${delimiter}${path0}`;
}
/** Every criterion the change links to a unit is carried by a scenario in the minimum. */
function minimumAnswersSpec(state: Awaited<ReturnType<typeof grow>>['state']): void {
  const linked = Object.entries(state.linked).filter(([, l]) => l.length).map(([id]) => id);
  for (const id of linked) expect([id, state.scenarios.some((x) => x.mode === 'min' && x.criteria.includes(id))]).toEqual([id, true]);
}

describe('reading a change', () => {
  it('pulls acceptance criteria from markdown, under a heading or as checkboxes', () => {
    expect(criteriaFrom('# Title\nintro\n## Acceptance criteria\n- [ ] one thing\n- two things\n## Notes\n- not this')).toEqual(['one thing', 'two things']);
    expect(criteriaFrom('Some text\n- [x] done item\n- [ ] open item')).toEqual(['done item', 'open item']);
    expect(criteriaFrom('No list here.')).toEqual([]);
  });

  it('reads files, added lines and units from a branch, and skips pattern-definition lines', () => {
    const dir = repo();
    const files = readChange(dir, 'main', 'refunds');
    expect(files.map((f) => f.path)).toEqual(['app.mjs']);
    expect(files[0]!.added.some((a) => a.text.includes("'/refunds'"))).toBe(true);
    const { units } = unitsOf(dir, 'refunds', files);
    expect(units.map((u) => `${u.label}${u.root ? ' (root)' : ''}`)).toEqual(expect.arrayContaining(['POST /refunds', 'Stripe (root)']));
    expect(isPatternSource("const STRIPE = /stripe/i.test(text);")).toBe(true);
    expect(isPatternSource("await stripe.refunds.create({})")).toBe(false);
    expect(matchCriterion('A customer can refund an order with POST /refunds', { label: 'POST /refunds', file: 'app.mjs', added: [] }).length).toBeGreaterThan(0);
  });

  it('takes no unit from a route written inside a multi-line template string, or from test scaffolding', () => {
    const dir = temp();
    git(dir, 'init', '-q', '-b', 'main');
    write(dir, 'package.json', JSON.stringify({ name: 'shop' }));
    write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\n");
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
    git(dir, 'checkout', '-qb', 'phantoms');
    // The dogfood harness writes a route into the app it serves: text in a template string, not a route it serves.
    const generated = "import { readFileSync, writeFileSync } from 'node:fs';\nconst app = 'app/app.mjs';\nwriteFileSync(app, readFileSync(app, 'utf8').replace('  const match = url.pathname.match(', `  if (req.method === 'GET' && url.pathname === '/notes/count') {\n    return send(res, 200, { count: 0 });\n  }\n  const match = url.pathname.match(`));\n";
    write(dir, 'dogfood/serve.mjs', generated);
    write(dir, 'scripts/seed.mjs', generated);
    // Real routes around a regex that holds a backtick, a single-line template path and a multi-line page template.
    write(dir, 'server.mjs', [
      "import express from 'express';", 'export const app = express();', 'const router = express.Router();',
      "const QUOTE = /[\"'`]/; // a backtick in a regex opens no template",
      "app.get('/health', (req, res) => res.send('ok'));",
      'router.post(`/items`, (req, res) => res.send(page(req)));',
      'const page = (req) => `', '  <p>${req.query.q}</p>', "  <p>app.get('/phantom', handler)</p>", '`;',
      "app.delete('/items/:id', (req, res) => res.end());", ''].join('\n'));
    // A folder with its own tracegrove project and no manifest is a harness; one with a manifest is a package.
    write(dir, 'qa/tracegrove.config.yaml', 'version: 1\n');
    write(dir, 'qa/drive.mjs', "import { app } from '../server.mjs';\napp.get('/qa-only', (req, res) => res.end());\n");
    write(dir, 'packages/api/tracegrove.config.yaml', 'version: 1\n');
    write(dir, 'packages/api/package.json', JSON.stringify({ name: 'api' }));
    write(dir, 'packages/api/index.mjs', "import { app } from '../../server.mjs';\napp.get('/pkg', (req, res) => res.end());\n");
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Routes and harnesses');

    const files = readChange(dir, 'main', 'phantoms');
    const role = (path: string) => files.find((f) => f.path === path)?.role;
    expect([role('dogfood/serve.mjs'), role('qa/drive.mjs'), role('scripts/seed.mjs'), role('packages/api/index.mjs'), role('server.mjs')]).toEqual(['test', 'test', 'code', 'code', 'code']);
    const { units } = unitsOf(dir, 'phantoms', files);
    expect(units.filter((u) => u.kind === 'route').map((u) => u.label).sort()).toEqual(['DELETE /items/{id}', 'GET /health', 'GET /pkg', 'POST /items']);
    expect(units.some((u) => /notes\/count|phantom|qa-only/.test(u.label))).toBe(false);
    // The template string alone keeps it out, outside a harness folder too; the raw scan would have taken it.
    const seed = files.find((f) => f.path === 'scripts/seed.mjs')!;
    expect(seed.added.length).toBeGreaterThan(0);
    expect(scanSource('scripts/seed.mjs', generated).map((r) => r.path)).toEqual(['/notes/count']);
    expect(routesOf('scripts/seed.mjs', generated)).toEqual([]);
    expect(['fixtures/a.ts', 'src/__fixtures__/b.ts', 'harness/run.mjs', 'dogfood/agent/x.mjs'].map((p) => roleOf(p))).toEqual(['test', 'test', 'test', 'test']);
    expect(scaffoldsOf(['tracegrove.config.yaml', 'qa/tracegrove.config.yaml', 'packages/api/tracegrove.config.yaml', 'packages/api/package.json'])).toEqual(['qa']);
    // Looking up callers and tests uses the same rule as the change's own roles.
    const harness = harnessOf(dir, 'phantoms');
    expect(['qa/drive.mjs', 'packages/api/index.mjs', 'server.mjs'].map((p) => isTestFile(p, harness))).toEqual([true, false, false]);
  });

  it('keeps a service or a sample that holds its own tracegrove project as code; only a harness that drives code outside its folder is test', async () => {
    const dir = temp();
    git(dir, 'init', '-q', '-b', 'main');
    // A Python monorepo: one root manifest, and a tracegrove project beside each service.
    write(dir, 'pyproject.toml', '[project]\nname = "mono"\n');
    write(dir, 'services/api/tracegrove.config.yaml', 'version: 1\n');
    write(dir, 'services/api/main.py', 'from fastapi import FastAPI\napp = FastAPI()\n');
    // A sample app whose config names its entry in its own folder, even though it imports a shared helper from outside.
    write(dir, 'samples/notes/tracegrove.config.yaml', 'project: notes\napp:\n  adapter: node\n  entry: app/app.mjs\n  sources: [app/**]\n');
    write(dir, 'samples/notes/app/app.mjs', "import { send } from '../../../lib/http.mjs';\nexport const app = { send };\n");
    write(dir, 'lib/http.mjs', 'export const send = () => {};\n');
    // A QA project that drives the root app from outside its folder.
    write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\n");
    write(dir, 'qa/tracegrove.config.yaml', 'version: 1\n');
    write(dir, 'qa/drive.mjs', "import { app } from '../server.mjs';\nexport const go = () => fetch('/orders', { method: 'POST' });\n");
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
    git(dir, 'checkout', '-qb', 'orders');
    write(dir, 'services/api/main.py', 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.post("/orders")\ndef create_order(body: dict):\n    return {"ok": True}\n');
    write(dir, 'samples/notes/app/app.mjs', "import { send } from '../../../lib/http.mjs';\nexport const app = { send };\napp.get('/notes/count', (req, res) => send(res, 200, { count: 0 }));\n");
    write(dir, 'qa/drive.mjs', "import { app } from '../server.mjs';\nexport const go = () => fetch('/orders', { method: 'POST' });\nexport const again = () => go();\n");
    write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\napp.post('/orders', (req, res) => {\n  res.status(201).json({});\n});\n");
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Orders');

    const files = readChange(dir, 'main', 'orders');
    expect(files.map((f) => `${f.path}:${f.role}`)).toEqual(['qa/drive.mjs:test', 'samples/notes/app/app.mjs:code', 'server.mjs:code', 'services/api/main.py:code']);
    expect(unitsOf(dir, 'orders', files).units.filter((u) => u.kind === 'route').map((u) => `${u.label} ${u.file}`).sort())
      .toEqual(['GET /notes/count samples/notes/app/app.mjs', 'POST /orders server.mjs', 'POST /orders services/api/main.py']);
    // The harness that requests a route is the test that exercises it, never a production caller.
    const { state } = await grow({ dir, branch: 'orders', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    const route = state.units.find((u) => u.label === 'POST /orders' && u.loc.startsWith('server.mjs'))!;
    expect(state.depth[route.id]!.tests).toMatchObject({ status: 'ok', loc: 'qa/drive.mjs:2' });
    expect(state.depth[route.id]!.callers?.loc).not.toMatch(/^qa\//);
  });

  it('finds the routes after an apostrophe in JSX text that sits before a multi-line template', () => {
    const src = ["import { Hono } from 'hono';", 'export const app = new Hono();', "const Help = () => <p>Don't panic: {`line one", 'line two`}</p>;',
      "app.get('/real', (c) => c.html(<Help />));", "app.post('/orders', (c) => c.json({}));", 'const footer = `a', 'b`;', ''].join('\n');
    expect(routesOf('server.tsx', src).map((r) => `${r.method} ${r.path}`)).toEqual(['GET /real', 'POST /orders']);
    expect(routesOf('server.tsx', src)).toEqual(scanSource('server.tsx', src));
  });
});

describe('grow', () => {
  it('grows, traces and drafts without an agent, and is honest about what nothing proves', async () => {
    const dir = repo();
    const seen: GrowEvent[] = [];
    const { state, log } = await grow({ dir, branch: 'refunds', base: 'main', mode: 'std', prove: false, gh: false, agent: { off: true } }, (e) => seen.push(e));
    expect(seen[0]!.kind).toBe('phase.started');
    expect(seen.every((e, i) => e.seq === i + 1 && e.v === 'tracegrove.discovery-event/v1')).toBe(true);
    expect(state.spec?.source).toMatch(/commit/);
    expect(state.criteria.map((c) => c.id)).toEqual(['C1', 'C2', 'C3']);
    const stripe = state.units.find((u) => u.label === 'Stripe')!;
    expect(stripe.root).toBe(true);
    expect(state.stops.some((s) => s.unit === stripe.id)).toBe(true);
    // A third-party scenario gets a mock lane and a real lane that names the key it needs.
    const real = state.scenarios.find((s) => s.variants.length > 0)!;
    expect(real.variants).toEqual(['mock', 'real']);
    expect(real.realKey).toMatch(/^STRIPE_/);
    // Nothing ran, so no criterion can claim to be proved.
    const view = growView(state);
    expect(view.criteria.every((c) => c.status.cls !== 'pass')).toBe(true);
    expect(view.summary.proved).toBe(0);
    expect(state.mode).toBe('std');
    expect(state.modeBy).toBe('flag');
    expect(state.done).toBeTruthy();
    expect(log && readFileSync(log, 'utf8').trim().split('\n').length).toBe(seen.length);
  });

  it('drops agent claims that cite lines that do not exist on the branch', async () => {
    const dir = repo();
    const bin = temp();
    const answer = JSON.stringify({ units: [1, 2, 3, 4, 5, 6].map((n) => ({ unit: `u${n}`,
      read: { found: true, loc: 'app.mjs:6', note: 'Creates a refund in Stripe.' },
      callers: { found: true, loc: 'nowhere.mjs:99', note: 'Made up.' },
      scenarios: [{ kind: 'sad', title: 'Stripe declines the refund', proves: 'The API answers 402 and stores nothing.', criteria: ['C2'] }] })) });
    write(bin, 'claude', `#!/bin/sh\necho '${JSON.stringify({ type: 'result', result: answer }).replaceAll("'", "'\\''")}'\n`);
    chmodSync(join(bin, 'claude'), 0o755);
    process.env.PATH = `${bin}${delimiter}${path0}`;
    git(dir, 'checkout', '-q', 'refunds');
    const { state } = await grow({ dir, branch: 'refunds', base: 'main', mode: 'min', prove: false, gh: false, agent: { provider: 'claude', model: 'claude-haiku-5-5' } });
    expect(state.dropped.length).toBeGreaterThan(0);
    expect(state.dropped[0]!.why).toMatch(/nowhere\.mjs/);
    const route = state.units.find((u) => u.label === 'POST /refunds')!;
    expect(state.depth[route.id]!.read).toMatchObject({ status: 'ok', by: 'claude' });
    expect(state.depth[route.id]!.callers?.by).not.toBe('claude');
    expect(state.scenarios.some((s) => s.by === 'claude' && s.title === 'Stripe declines the refund')).toBe(true);
    expect(state.ext[state.extOrder[0]!]?.state).toBe('review');
  });

  it('proves a branch that is not checked out from a worktree with the checkout’s packages and its own build', async () => {
    const dir = repo();
    const out = join(temp(), 'built.txt');
    write(dir, 'package.json', JSON.stringify({ name: 'shop', bin: { shop: 'cli.mjs' }, scripts: { build: `node -e "require('fs').writeFileSync(process.env.GROW_TEST_OUT, process.cwd())"` } }));
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'build script');
    git(dir, 'checkout', '-q', 'main');
    mkdirSync(join(dir, 'node_modules', 'left-pad'), { recursive: true });
    process.env.GROW_TEST_OUT = out;
    try { await grow({ dir, branch: 'refunds', base: 'main', prove: false, gh: false, agent: { off: true } }); } finally { delete process.env.GROW_TEST_OUT; }
    const built = readFileSync(out, 'utf8');
    expect(built).not.toBe(dir);
    expect(built).toContain('tracegrove-grow-');
    expect(git(dir, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
  });
  it('cuts the minimum to at most three critical journeys without a spec; the rest grow in standard', async () => {
    const dir = fiveRoutes();
    const { state } = await grow({ dir, branch: 'five', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    expect(state.specMissing).toBeTruthy();
    expect(state.journeys).toHaveLength(5);
    const title = (id: string | null | undefined) => state.journeys.find((j) => j.id === id)?.title;
    const inMin = new Set(state.scenarios.filter((x) => x.mode === 'min').map((x) => title(x.journey)));
    // alpha, beta and gamma hold 28 changed lines each, delta 23 and tiny 8 of 115: delta clears a tenth but not the cap of three, tiny neither.
    expect([...inMin].sort()).toEqual(['POST /alpha', 'POST /beta', 'POST /gamma']);
    for (const j of state.journeys) {
      const own = state.scenarios.filter((x) => x.journey === j.id && x.level === 'journey');
      const min = own.filter((x) => x.mode === 'min');
      if (inMin.has(j.title)) {
        // A critical journey's minimum: its happy path and its single riskiest failure, nothing else.
        expect(min.map((x) => x.modeWhy)).toEqual(['happy path of a critical journey', 'riskiest failure of this journey']);
        expect(min[0]!.scenarioKind).toBe('happy');
      } else {
        expect(min).toEqual([]);
        expect(own.filter((x) => x.mode === 'std').map((x) => x.modeWhy)).toContain('happy path of a journey outside the critical cut');
      }
    }
  });

  it('keeps every criterion a scenario carries in the minimum, and marks each scenario with its polarity and why it is in its mode', async () => {
    const dir = repo();
    const { state } = await grow({ dir, branch: 'refunds', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    const carried = new Set(state.scenarios.flatMap((x) => x.criteria));
    expect(carried.size).toBeGreaterThan(0);
    for (const c of carried) expect(state.scenarios.some((x) => x.mode === 'min' && x.criteria.includes(c))).toBe(true);
    for (const x of state.scenarios) {
      expect(['happy', 'guard', 'failure']).toContain(x.polarity);
      expect(x.modeWhy).toBeTruthy();
      if (x.scenarioKind === 'happy') expect(x.polarity).toBe('happy');
      if (x.mode === 'max') expect(x.modeWhy).toMatch(/^(part on its own|regression)$/);
    }
    expect(state.scenarios.find((x) => x.level === 'journey' && x.scenarioKind === 'happy')).toMatchObject({ mode: 'min', modeWhy: expect.stringMatching(/^carries C1/) });
    expect(state.scenarios.find((x) => x.title === 'Without a session it is refused')).toMatchObject({ polarity: 'guard', mode: 'min', modeWhy: 'riskiest failure of this journey' });
    expect(state.scenarios.find((x) => x.title === 'An invalid body is refused')).toMatchObject({ polarity: 'guard', mode: 'std', modeWhy: 'other failure path' });
    expect(state.scenarios.find((x) => x.title === 'Stripe errors are surfaced')).toMatchObject({ polarity: 'failure', mode: 'max', modeWhy: 'part on its own' });
  });

  it('keeps an agent\u2019s scenarios that name no criteria to the cut: the happy path takes what works, the riskiest failure joins it, the rest are standard', async () => {
    const dir = repo();
    const scenarios = [
      { kind: 'happy', title: 'Refund goes through', proves: 'A refund is created.', criteria: [] },
      { kind: 'sad', title: 'Stripe declines the refund', proves: 'The API answers 402.', criteria: [] },
      { kind: 'sad', title: 'Refund for an unknown order', proves: 'The API answers 404.', criteria: [] },
      { kind: 'edge', title: 'Double click refunds once', proves: 'One refund.', criteria: [] }];
    fakeClaude([1, 2, 3].map((n) => ({ unit: `u${n}`, scenarios })));
    git(dir, 'checkout', '-q', 'refunds');
    const { state } = await grow({ dir, branch: 'refunds', base: 'main', mode: 'max', prove: false, gh: false, agent: { provider: 'claude', model: 'claude-haiku-5-5' }, save: false });
    const own = state.scenarios.filter((x) => x.level === 'journey' && x.by === 'claude');
    expect(own.map((x) => [x.title, x.mode])).toEqual([['Refund goes through', 'min'], ['Stripe declines the refund', 'min'], ['Refund for an unknown order', 'std'], ['Double click refunds once', 'std']]);
    // A failure does not inherit the happy path's criteria.
    for (const x of own.filter((y) => y.scenarioKind !== 'happy')) expect(x.criteria).toEqual([]);
    expect(own[0]!.criteria.length).toBeGreaterThan(0);
    minimumAnswersSpec(state);
  });

  it('still cuts a minimum when the spec names nothing the change touches', async () => {
    const dir = fiveRoutes();
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'Spec\n\n## Acceptance criteria\n- [ ] The dashboard feels quick for everyone\n- [ ] Nobody waits longer than a moment');
    const { state } = await grow({ dir, branch: 'five', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    expect(state.criteria).toHaveLength(2);
    expect(Object.values(state.linked).flat()).toEqual([]);
    const title = (id: string | null | undefined) => state.journeys.find((j) => j.id === id)?.title;
    expect([...new Set(state.scenarios.filter((x) => x.mode === 'min').map((x) => title(x.journey)))].sort()).toEqual(['POST /alpha', 'POST /beta', 'POST /gamma']);
    for (const j of state.journeys.filter((x) => ['POST /alpha', 'POST /beta', 'POST /gamma'].includes(x.title))) {
      expect(state.scenarios.filter((x) => x.journey === j.id && x.mode === 'min').map((x) => x.modeWhy)).toEqual(['happy path of a critical journey', 'riskiest failure of this journey']);
    }
  });

  it('makes at most three journeys critical when a criterion sits on a part they all share, and carries it in the minimum', async () => {
    const dir = temp();
    git(dir, 'init', '-q', '-b', 'main');
    write(dir, 'package.json', JSON.stringify({ name: 'shop' }));
    write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\n");
    write(dir, 'lib/pricing.mjs', 'export const price = (n) => n;\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
    git(dir, 'checkout', '-qb', 'pricing');
    write(dir, 'lib/pricing.mjs', 'export const price = (n) => Math.round(n * 100) / 100;\nexport const tax = (n) => n * 0.2;\n');
    for (const name of ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta']) {
      write(dir, `routes/${name}.mjs`, `import { app } from '../server.mjs';\nimport { price } from '../lib/pricing.mjs';\napp.post('/${name}', (req, res) => {\n  res.json({ total: price(req.body.n) });\n});\n`);
    }
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Pricing\n\n## Acceptance criteria\n- [ ] pricing.mjs rounds every price to cents');
    const { state } = await grow({ dir, branch: 'pricing', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    expect(state.journeys).toHaveLength(8);
    expect(state.linked.C1?.map((l) => state.units.find((u) => u.id === l.unit)?.label)).toEqual(['pricing.mjs']);
    const min = state.scenarios.filter((x) => x.mode === 'min');
    expect(new Set(min.map((x) => x.journey)).size).toBe(3);
    expect(min).toHaveLength(6);
    minimumAnswersSpec(state);
  });

  it('carries a screen\u2019s failure criterion in its refusal path, so the minimum answers every linked criterion', async () => {
    const dir = temp();
    git(dir, 'init', '-q', '-b', 'main');
    write(dir, 'package.json', JSON.stringify({ name: 'shop' }));
    write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\n");
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
    git(dir, 'checkout', '-qb', 'panel');
    write(dir, 'server.mjs', "import express from 'express';\nexport const app = express();\napp.post('/seats', (req, res) => {\n  res.json({ seats: req.body.seats });\n});\n");
    write(dir, 'web/components/SeatsPanel.jsx', "export function SeatsPanel() {\n  const add = async () => {\n    const r = await fetch('/seats', { method: 'POST' });\n    if (!r.ok) setError('Could not add the seat');\n  };\n  return <button onClick={add}>Add seat</button>;\n}\n");
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Seats panel\n\n## Acceptance criteria\n- [ ] The seats panel adds a seat with one click\n- [ ] The seats panel shows an error when adding a seat fails');
    const { state } = await grow({ dir, branch: 'panel', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    expect(state.journeys.map((j) => j.surface)).toEqual(['browser']);
    expect(Object.keys(state.linked).sort()).toEqual(['C1', 'C2']);
    expect(state.scenarios.find((x) => x.title === 'When the server refuses, the page says so')).toMatchObject({ criteria: ['C2'], mode: 'min', modeWhy: 'carries C2' });
    expect(state.scenarios.find((x) => x.title === 'Works on a 375 px screen')).toMatchObject({ criteria: [], mode: 'std' });
    minimumAnswersSpec(state);
  });

  it('reports a missing base as blocked rather than throwing', async () => {
    const dir = repo();
    const { state } = await grow({ dir, branch: 'refunds', base: 'nope', prove: false, gh: false, agent: { off: true } });
    expect(state.blocked?.code).toBeTruthy();
  });
});

describe('state rules', () => {
  it('lets agent evidence upgrade rules evidence, never the reverse', () => {
    let s = freshGrow(); let seq = 0;
    const put = (e: Record<string, unknown>) => { s = applyGrow(s, { v: 'tracegrove.discovery-event/v1', seq: ++seq, ms: seq, ...e } as GrowEvent); };
    put({ kind: 'unit.found', unit: 'u1', label: 'POST /x', unitKind: 'route', loc: 'a.ts:1', root: false, layer: 'api', parent: null });
    put({ kind: 'depth.checked', agent: 'a1', unit: 'u1', step: 'tests', status: 'none', loc: '—', note: 'none', by: 'rules' });
    put({ kind: 'depth.checked', agent: 'a2', unit: 'u1', step: 'tests', status: 'ok', loc: 't.ts:3', note: 'found', by: 'claude' });
    put({ kind: 'depth.checked', agent: 'a1', unit: 'u1', step: 'tests', status: 'none', loc: '—', note: 'none', by: 'rules' });
    expect(s.depth.u1!.tests).toMatchObject({ status: 'ok', by: 'claude' });
  });

  it('shows a criterion with no flow as unproved, never green', () => {
    let s = freshGrow(); let seq = 0;
    const put = (e: Record<string, unknown>) => { s = applyGrow(s, { v: 'tracegrove.discovery-event/v1', seq: ++seq, ms: seq, ...e } as GrowEvent); };
    put({ kind: 'criterion.found', criterion: 'C1', text: 'It works' });
    put({ kind: 'unit.found', unit: 'u1', label: 'POST /x', unitKind: 'route', loc: 'a.ts:1', root: false, layer: 'api', parent: null });
    put({ kind: 'criterion.linked', criterion: 'C1', unit: 'u1', by: 'rules', loc: 'a.ts:1' });
    put({ kind: 'scenario.drafted', scenario: 's1', unit: 'u1', scenarioKind: 'happy', mode: 'min', title: 'x', proves: 'x', criteria: ['C1'], layers: ['api'], flow: null, variants: [], realKey: null, mockOnly: null, by: 'rules', ext: [] });
    put({ kind: 'scenario.not_run', scenario: 's1', why: 'No flow proves this yet' });
    expect(criterionStatus(s, 'C1').cls).not.toBe('pass');
  });

  it('loads a log written before journeys, polarity and modeWhy, and draws it by unit', () => {
    let s = freshGrow(); let seq = 0;
    const put = (e: Record<string, unknown>) => { s = applyGrow(s, { v: 'tracegrove.discovery-event/v1', seq: ++seq, ms: seq, ...e } as GrowEvent); };
    put({ kind: 'change.read', branch: 'old', base: 'main', head: null, pr: null, title: 'Old log', url: null, files: 1, adds: 3, dels: 0, untraced: 0 });
    put({ kind: 'unit.found', unit: 'u1', label: 'POST /x', unitKind: 'route', loc: 'a.ts:1', root: false, layer: 'api', parent: null });
    put({ kind: 'scenario.drafted', scenario: 's1', unit: 'u1', scenarioKind: 'happy', mode: 'min', title: 'POST /x saves', proves: 'x', criteria: [], layers: ['api'], flow: null, variants: [], realKey: null, mockOnly: null, by: 'rules', ext: [] });
    put({ kind: 'mode.chosen', mode: 'min', by: 'flag' });
    expect(s.scenarios[0]!.polarity).toBeUndefined();
    expect(s.scenarios[0]!.modeWhy).toBeUndefined();
    expect(growView(s).counts.min).toBe(1);
    const frame = renderGrove(s, { width: 120, elapsed: 60_000, color: false }).join('\n');
    expect(frame).toContain('route · a.ts:1');
    expect(frame).toContain('POST /x saves');
  });
});

describe('terminal', () => {
  it('renders a frame with the tree, the ledger and the spec, and plain lines for pipes', async () => {
    const dir = repo();
    const lines: string[] = [];
    const { state } = await grow({ dir, branch: 'refunds', base: 'main', mode: 'min', prove: false, gh: false, agent: { off: true } }, (e, s) => { const l = plainLine(s, e); if (l) lines.push(l); });
    const frame = renderGrove(state, { width: 120, elapsed: 60_000, clock: state.ms, color: false }).join('\n');
    expect(frame).toContain('POST /refunds');
    expect(frame).toContain('Stripe');
    expect(frame).toContain('C1');
    expect(frame).not.toMatch(/\x1b\[/);
    for (const l of frame.split('\n')) expect([...l].length).toBeLessThanOrEqual(120);
    const narrow = renderGrove(state, { width: 80, elapsed: 60_000, clock: state.ms, color: false });
    for (const l of narrow) expect([...l].length).toBeLessThanOrEqual(80);
    expect(lines.some((l) => l.includes('POST /refunds'))).toBe(true);
  });

  it('groups the scenarios by journey, and collapses parts on their own and existing flows to counts', async () => {
    const dir = fiveRoutes();
    const { state } = await grow({ dir, branch: 'five', base: 'main', mode: 'min', prove: false, gh: false, agent: { off: true }, save: false });
    const lines = renderGrove(state, { width: 120, elapsed: 60_000, clock: state.ms, color: false });
    const header = (i: number) => lines.findIndex((l) => l.startsWith(`│ ${String(i + 1).padStart(2)}  ${state.journeys[i]!.title}  · http · 1 part `));
    state.journeys.forEach((_, i) => expect(header(i)).toBeGreaterThan(0));
    // Each critical journey's minimum sits under its own header, before the next journey starts.
    for (const [i, j] of state.journeys.entries()) {
      const head = header(i); const next = i + 1 < state.journeys.length ? header(i + 1) : lines.length;
      expect(next).toBeGreaterThan(head);
      const rows = lines.slice(head + 1, next).filter((l) => /│ +[–○✓✕] /.test(l));
      expect(rows).toHaveLength(state.scenarios.filter((x) => x.journey === j.id && x.mode === 'min').length);
      if (!rows.length) expect(lines[head]).toContain('outside the critical cut, nothing in minimum');
    }
    expect(lines.filter((l) => l.includes('outside the critical cut'))).toHaveLength(2);
    expect(lines.join('\n')).not.toMatch(/route · routes\//);
    // In max the parts on their own collapse to one count line, with nothing hidden from the total.
    const refunds = repo();
    const max = await grow({ dir: refunds, branch: 'refunds', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    const frame = renderGrove(max.state, { width: 120, elapsed: 60_000, clock: max.state.ms, color: false }).join('\n');
    const parts = max.state.scenarios.filter((x) => x.level === 'part').length;
    expect(frame).toMatch(new RegExp(`\\+  Parts on their own  · ${parts} scenarios`));
    expect(frame).toMatch(/ 1  A customer can refund an order with POST \/refunds  · http · 2 parts/);
    expect(frame).not.toMatch(/more scenarios in the log/);
    for (const l of frame.split('\n')) expect([...l].length).toBeLessThanOrEqual(120);
  });

  it('streams JSON lines with --jsonl and exits 0', async () => {
    const dir = repo();
    let out = '';
    const { code } = await growCommand({ dir, branch: 'refunds', base: 'main', mode: 'min', 'no-prove': true, 'no-gh': true, 'no-agent': true, jsonl: true }, (t) => { out += t; });
    expect(code).toBe(0);
    const events = out.trim().split('\n').map((l) => JSON.parse(l) as GrowEvent);
    expect(events.at(-1)!.kind).toBe('discovery.finished');
  });
});

describe('UI stream', () => {
  function post(port: number, path: string, body: unknown, token?: string): Promise<{ status: number; text: string }> {
    return new Promise((done, fail) => {
      const req = request({ host: '127.0.0.1', port, method: 'POST', path, headers: { 'content-type': 'application/json', ...(token ? { 'x-tracegrove-token': token } : {}) } }, (res) => {
        let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => done({ status: res.statusCode ?? 0, text }));
      });
      req.on('error', fail); req.end(JSON.stringify(body));
    });
  }

  it('needs the token, streams events and state, and finishes', async () => {
    const dir = repo();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const port = Number(new URL(server.url).port);
    expect((await post(port, '/api/grow', { branch: 'refunds', base: 'main', prove: false, agent: false })).status).toBe(403);
    const r = await post(port, '/api/grow', { branch: 'refunds', base: 'main', prove: false, agent: false, mode: 'min' }, 'tk-0123456789abcdef');
    expect(r.status).toBe(200);
    const blocks = r.text.split('\n\n').filter(Boolean).map((b) => ({ event: /^event: (.*)$/m.exec(b)?.[1], data: JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? 'null') as any }));
    expect(blocks[0]!.event).toBe('session');
    expect(blocks.some((b) => b.event === 'event' && b.data.kind === 'unit.found')).toBe(true);
    const last = blocks.filter((b) => b.event === 'state').at(-1)!;
    expect(last.data.state.done).toBeTruthy();
    expect(last.data.view.criteria).toHaveLength(3);
    expect(blocks.at(-1)!.event).toBe('done');
    expect((await post(port, '/api/grow/mode', { id: 'nope', mode: 'min' }, 'tk-0123456789abcdef')).status).toBe(409);
    // A reload shows the saved grow instead of an empty start card.
    const saved = await new Promise<any>((done, fail) => request({ host: '127.0.0.1', port, path: '/api/grow/last?branch=refunds' }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => done(JSON.parse(t))); }).on('error', fail).end());
    expect(saved.state.change.branch).toBe('refunds');
    expect(saved.view.criteria).toHaveLength(3);
  });
});
