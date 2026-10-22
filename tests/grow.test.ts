import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { chromium } from 'playwright';
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
        // A critical journey's minimum: its happy path and its single riskiest guard or failure, nothing else.
        expect(min.map((x) => x.modeWhy)).toEqual(['happy path of a critical journey', 'riskiest guard or failure of this journey']);
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
    expect(state.scenarios.find((x) => x.title === 'Without a session it is refused')).toMatchObject({ polarity: 'guard', mode: 'min', modeWhy: 'riskiest guard or failure of this journey' });
    expect(state.scenarios.find((x) => x.title === 'An invalid body is refused')).toMatchObject({ polarity: 'guard', mode: 'std', modeWhy: 'another guard' });
    expect(state.scenarios.find((x) => x.title === 'Stripe errors are surfaced')).toMatchObject({ polarity: 'failure', mode: 'max', modeWhy: 'part on its own' });
  });

  it('keeps an agent\u2019s scenarios that name no criteria to the cut: the happy path takes what works, the riskiest guard or failure joins it, the rest are standard', async () => {
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
      expect(state.scenarios.filter((x) => x.journey === j.id && x.mode === 'min').map((x) => x.modeWhy)).toEqual(['happy path of a critical journey', 'riskiest guard or failure of this journey']);
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

describe('Grow page', () => {
  /** A grown change with one scenario failed at a step, and one titled by the route it is sent through. */
  async function grownWithFailure() {
    const dir = repo();
    const { state } = await grow({ dir, branch: 'refunds', base: 'main', mode: 'min', prove: false, gh: false, agent: { off: true }, save: false });
    const onJourney = state.scenarios.filter((x) => x.mode === 'min' && x.journey && x.proves);
    const failed = onJourney.find((x) => x.polarity === 'guard' || x.polarity === 'failure') ?? onJourney[0]!;
    const routed = onJourney.find((x) => x.id !== failed.id)!;
    routed.title = 'POST /refunds: A partial refund is turned away';
    const why = 'only the refund is sent to Stripe: expected 1 call, got 2';
    applyGrow(state, { v: 'tracegrove.discovery-event/v1', seq: state.last + 1, ms: state.ms, kind: 'scenario.failed', scenario: failed.id, took: 12, run: null, why } as GrowEvent);
    return { dir, state, failed, routed, why };
  }
  /** Every card or row body on the page that states what the failed scenario claims: it must say where it broke first, and
   *  put the claim as the thing being checked, never as a bare pass claim. */
  const claims = (proves: string) => Array.from(document.querySelectorAll('[data-testid="grow"] .gw-ins, [data-testid="grow"] .gb-olin, [data-testid="grow"] .gw-olcard'))
    .filter((el) => (el as HTMLElement).offsetParent !== null && (el.textContent ?? '').includes(proves))
    .map((el) => { const t = el.textContent ?? ''; const at = t.indexOf(proves); return { broke: t.indexOf('Broke at'), at, before: t.slice(Math.max(0, at - 'What it checks'.length), at) }; });

  it('says where a failed scenario broke before what it checks, in every card and row, and moves a route out of a title', async () => {
    const { dir, state, failed, routed, why } = await grownWithFailure();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(server.url);
      await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
      await page.getByTestId('grow').waitFor();
      await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s: state, v: growView(state) });
      const ins = page.getByTestId('grow-inspector');
      await ins.waitFor();
      const step = why.slice(0, why.indexOf(': '));
      // The inspector opens on the first failing journey: where it broke, not the claim the scenario makes.
      await expect.poll(() => ins.textContent()).toContain('Broke at check “' + step + '”: ');
      expect(await ins.textContent()).not.toContain(failed.proves);
      const check = async () => {
        const found = await page.evaluate(claims, failed.proves);
        expect(found.length).toBeGreaterThan(0);
        for (const c of found) { expect(c.broke).toBeGreaterThanOrEqual(0); expect(c.broke).toBeLessThan(c.at); expect(c.before).toBe('What it checks'); }
      };
      // Pinned from the tree, the inspector holds the scenario's card.
      await page.evaluate((id) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = 's:' + id; w.gw.pinList = null; w.growPaint(); }, failed.id);
      await check();
      // Chosen in the Journeys card, the row opens in place, and the inspector keeps only its journey.
      await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = null; w.growPaint(); });
      await page.locator('[data-testid="grow-scenarios"] .gb-ols[data-sid="' + failed.id + '"]').click();
      await check();
      expect(await ins.textContent()).toContain('Its journey');
      // The Outline opens it in place too.
      await page.getByTestId('grow-view-outline').click();
      await check();
      // A title that leads with its route reads as what happens, the route on a line of its own.
      const row = page.locator('[data-testid="grow-outline"] .gb-ols[data-sid="' + routed.id + '"] .t');
      expect(await row.textContent()).toBe('A partial refund is turned awayvia POST /refunds');
      // One set of words for where a leaf sits: the tree's own.
      const text = await page.getByTestId('grow').textContent();
      for (const old of ['what it must refuse', 'and must fail safely', 'End to end through']) expect(text).not.toContain(old);
    } finally { await browser.close(); }
  }, 60000);

  it('wraps every legend item inside the legend on a phone, so no mark or word runs past its edge', async () => {
    const { dir, state } = await grownWithFailure();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [390, 360]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.goto(server.url);
        await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
        await page.getByTestId('grow').waitFor();
        await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s: state, v: growView(state) });
        await page.getByTestId('grow-view-grove').click();
        const legend = page.locator('[data-testid="grow"] .gw-legend');
        await expect.poll(() => legend.locator('.gw-li').count()).toBeGreaterThan(8);
        // Each item's right edge, its box or the ink of its words (a word that cannot wrap spills past its box), against the
        // right edge of the legend's content box.
        const fit = await legend.evaluate((el) => {
          const cs = getComputedStyle(el);
          const edge = el.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
          const items = Array.from(el.querySelectorAll('.gw-li')).map((li) => {
            const range = document.createRange(); range.selectNodeContents(li);
            const right = Math.max(li.getBoundingClientRect().right, range.getBoundingClientRect().right, ...Array.from(li.children).map((c) => c.getBoundingClientRect().right));
            return { text: li.textContent ?? '', over: right - edge };
          });
          return { items, scroll: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth };
        });
        for (const item of fit.items) expect(item.over, width + 'px: ' + item.text).toBeLessThanOrEqual(0.5);
        expect(fit.items.map((x) => x.text)).toContain('over the rim: a service outside');
        expect(fit.scroll).toBeLessThanOrEqual(0);
        expect(fit.page).toBeLessThanOrEqual(0);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** The tree's foliage measured as drawn: every leaf, its twig and its cushion, from the SVG's own geometry. */
  const foliage = () => {
    const w = (0, eval)('({ gw, GB_PET })');
    const B = w.gw.B, PET: number = w.GB_PET;
    const scr = (el: any, x: number, y: number) => new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
    const usr = (el: any, q: DOMPoint) => q.matrixTransform(el.getScreenCTM().inverse());
    const on = (el: any) => !!el && el.getScreenCTM() !== null && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const lum = (c: string) => { const n = (c.match(/[\d.]+/g) ?? []).map(Number); const [r, g, b] = c.startsWith('color(') ? n.slice(0, 3) : n.slice(0, 3).map((v) => v / 255); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const segD = (a: number[], b: number[], c: number[], d: number[]) => {
      const pd = (p: number[], s: number[], e: number[]) => { const vx = e[0]! - s[0]!, vy = e[1]! - s[1]!, t = Math.max(0, Math.min(1, ((p[0]! - s[0]!) * vx + (p[1]! - s[1]!) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(p[0]! - s[0]! - vx * t, p[1]! - s[1]! - vy * t); };
      return Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b));
    };
    const wood = Array.from(document.querySelectorAll('.gw-svg.gb path.w, .gw-svg.gb path.tw:not(.lt)')).filter((e: any) => e.getScreenCTM());
    const out = { leaves: 0, hung: 0, bad: [] as string[], cush: [] as { tree: string; crown: boolean; role: string; n: number; a: number; h: number }[] };
    const bad = (pid: string, what: string, v?: unknown) => out.bad.push(pid + ': ' + what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    for (const pid in B.pad) {
      const P = B.pad[pid], g = P.geo, L: number = g.L, W: number = g.W, kept: [string, number[]][] = [];
      g.cs.forEach((c: any, k: number) => {
        if (c.role === 'shoulder' && !c.ids.length) bad(pid, 'a shoulder with no guard', k);
        if (c.ids.length && L > 0.55 * c.a) bad(pid, 'leaf longer than a quarter of its cushion', [L, c.a]);
        out.cush.push({ tree: P.el.closest('svg')?.id ?? '', crown: !!P.crown, role: c.role, n: c.ids.length, a: c.a, h: c.h });
      });
      for (const [id, sl] of g.slot as Map<string, number[]>) {
        const el = B.leaf[id]; if (!on(el) || el.classList.contains('gone')) continue;
        out.leaves++; kept.push([id, sl]);
        const lf = el.__inner, hang = !!sl[4], cu = P.cu[g.cOf.get(id)].el, fill = cu.querySelector('.pfill');
        if (hang) out.hung++;
        // the whole blade inside its own cushion, unless it hangs beneath
        if (!hang) for (const [x, y] of [[0, 0], [0.45 * L, 0], [-0.45 * L, 0], [0, 0.4 * W], [0, -0.4 * W], [0.25 * L, 0.3 * W], [0.25 * L, -0.3 * W], [-0.25 * L, 0.3 * W], [-0.25 * L, -0.3 * W]]) {
          if (!fill.isPointInFill(usr(fill, scr(lf, x!, y!)))) { bad(pid, 'blade outside its cushion', id); break; }
        }
        // the petiole ends on its twig, the twig starts inside a limb, and the leaf turns along it
        const tw = B.ltw?.[id]?.[0];
        if (!on(tw)) { bad(pid, 'no twig', id); continue; }
        const pts: number[][] = tw.__pts, end = pts[pts.length - 1]!, ft = usr(tw, scr(lf, -L / 2 - PET, 0));
        if (Math.hypot(ft.x - end[0]!, ft.y - end[1]!) > 1) bad(pid, 'petiole off its twig', [id, Math.hypot(ft.x - end[0]!, ft.y - end[1]!)]);
        const s0 = scr(tw, pts[0]![0]!, pts[0]![1]!);
        if (!wood.some((e: any) => e !== tw && e.isPointInFill(usr(e, s0)))) bad(pid, 'twig starts off the wood', id);
        const a = pts[pts.length - 2]!, ta = Math.atan2(end[1]! - a[1]!, end[0]! - a[0]!) * 180 / Math.PI, da = Math.abs((((ta - sl[2]!) % 360) + 540) % 360 - 180);
        if (da > 15) bad(pid, 'leaf turned off its twig', [id, da]);
        // a failure hangs on a short stem; a leaf on a cushion has its foot tucked in and its middle clear, so its state reads
        if (hang) { const st = Math.hypot(end[0]! - pts[0]![0]!, end[1]! - pts[0]![1]!); if (st > 0.5 * g.Hc + 0.01) bad(pid, 'stem longer than half the crest', [id, st, g.Hc]); }
        else {
          const tf = B.tuft?.[id];
          if (!on(tf)) bad(pid, 'no tuft', id);
          else { if (!tf.isPointInFill(usr(tf, scr(lf, -L / 2 + 1, 0)))) bad(pid, 'foot not tucked in', id); if (tf.isPointInFill(usr(tf, scr(lf, 0.05 * L, 0)))) bad(pid, 'tuft over the blade', id); }
        }
      }
      // no two leaves touch
      const mid = (sl: number[]) => { const t = sl[2]! * Math.PI / 180, u = [Math.cos(t) * L / 2, Math.sin(t) * L / 2]; return [[sl[0]! - u[0]!, sl[1]! - u[1]!], [sl[0]! + u[0]!, sl[1]! + u[1]!]]; };
      for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
        const A = mid(kept[i]![1]), C = mid(kept[j]![1]), d = segD(A[0]!, A[1]!, C[0]!, C[1]!);
        if (d < W) bad(pid, 'leaves overlap', [kept[i]![0], kept[j]![0], d]);
      }
      // opaque cushions; a crest stands clear of its shoulders with its wood between, and the shoulders are a step darker
      const els = P.cu.map((c: any) => c.el), cr = g.cs.findIndex((c: any) => c.role === 'crest'), shs = g.cs.map((c: any, k: number) => (c.role === 'shoulder' && on(els[k]) ? k : -1)).filter((k: number) => k >= 0);
      for (const k of [...shs, cr]) if (k >= 0 && on(els[k])) {
        if (+getComputedStyle(els[k].querySelector('.pfill')).fillOpacity < 0.92 || +getComputedStyle(els[k]).opacity < 1) bad(pid, 'cushion not opaque', k);
        for (const c of els[k].querySelectorAll('circle')) if (+getComputedStyle(c).fillOpacity < 0.92) { bad(pid, 'clump not opaque', k); break; }
      }
      if (cr >= 0 && on(els[cr]) && shs.length) {
        const cb = els[cr].querySelector('.pfill').getBBox(), top = Math.min(...shs.map((k: number) => els[k].querySelector('.pfill').getBBox().y));
        if (top - (cb.y + cb.height) < 10) bad(pid, 'tiers closer than 10', top - (cb.y + cb.height));
        const lc = lum(getComputedStyle(els[cr].querySelector('.pfill')).fill);
        for (const k of shs) if (lum(getComputedStyle(els[k].querySelector('.pfill')).fill) >= lc - 0.02) bad(pid, 'shoulder not darker than its crest', k);
      }
    }
    // and no leaf is hidden under another journey's pad
    for (const pid in B.pad) for (const [id, sl] of B.pad[pid].geo.slot as Map<string, number[]>) {
      const el = B.leaf[id], L: number = B.pad[pid].geo.L; if (!on(el) || el.classList.contains('gone')) continue;
      for (const qid in B.pad) if (qid !== pid) for (const c of B.pad[qid].cu) {
        const f = c.el.querySelector('.pfill'); if (!on(c.el)) continue;
        if ([[0, 0], [0.4 * L, 0], [-0.4 * L, 0]].some(([x, y]) => f.isPointInFill(usr(f, scr(el.__inner, x!, y!))))) bad(pid, 'leaf under the pad of ' + qid, [id, sl[4]]);
      }
    }
    return out;
  };

  /** Five journeys in Max, the first grown bushy (three happy paths, four guards, two failures) and the second failed at a step. */
  async function grownBushy() {
    const dir = fiveRoutes();
    const { state } = await grow({ dir, branch: 'five', base: 'main', mode: 'max', prove: false, gh: false, agent: { off: true }, save: false });
    const [j1, j2] = state.journeys;
    const mine = state.scenarios.filter((x) => x.journey === j1!.id);
    const grow1 = (pol: 'happy' | 'guard' | 'failure', n: number) => {
      const have = mine.filter((x) => x.polarity === pol), src = have[0] ?? mine[0]!;
      for (let i = have.length; i < n; i++) state.scenarios.push({ ...src, id: src.id + '-' + pol + i, title: src.title + ' ' + (i + 1), polarity: pol });
    };
    grow1('happy', 3); grow1('guard', 4); grow1('failure', 2);
    const failed = state.scenarios.find((x) => x.journey === j2!.id)!;
    applyGrow(state, { v: 'tracegrove.discovery-event/v1', seq: state.last + 1, ms: state.ms, kind: 'scenario.failed', scenario: failed.id, took: 12, run: null, why: 'only one row is written: expected 1, got 2' } as GrowEvent);
    return { dir, state };
  }

  it('grows every leaf on a twig from the wood, inside its own opaque cushion, the tiers apart and each cushion sized by its leaves', async () => {
    const { dir, state } = await grownBushy();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(server.url);
        await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
        await page.getByTestId('grow').waitFor();
        await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s: state, v: growView(state) });
        await page.getByTestId('grow-view-grove').click();
        await expect.poll(() => page.evaluate(() => Object.keys((0, eval)('gw').B?.pad ?? {}).length)).toBeGreaterThan(0);
        const f = await page.evaluate(foliage);
        expect(f.leaves, width + 'px').toBeGreaterThan(2);
        expect(f.bad, width + 'px').toEqual([]);
        // a cushion's area grows with how many leaves it holds, one tree's k for all; the crown's crest at most 15% larger across
        for (const tree of new Set(f.cush.map((c) => c.tree))) {
          const cs = f.cush.filter((c) => c.tree === tree), per = (c: { a: number; h: number; n: number }) => (c.a * c.h) / (c.n + 0.5);
          const plain = cs.filter((c) => !(c.crown && c.role === 'crest')), base = Math.min(...plain.map(per));
          for (const c of plain) expect(per(c) / base, width + 'px ' + c.role + ' of ' + c.n).toBeLessThan(1.03);
          for (const c of cs.filter((x) => x.crown && x.role === 'crest')) expect(Math.sqrt(per(c) / base)).toBeLessThanOrEqual(1.151);
          for (const a of plain) for (const b of plain) if (a.n < b.n) expect(a.a * a.h).toBeLessThan(b.a * b.h);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** Max's growth on the wood, measured from the tree's own geometry: every limb, knot, shoot, count and graft bud. */
  const growth = () => {
    const w = (0, eval)('({ gw, GB_NK })');
    const B = w.gw.B, L = B.L, kq: number = L.narrow ? w.GB_NK : 1;
    const out = { limbs: 0, knots: 0, shoots: 0, tags: 0, rings: [] as string[], bad: [] as string[] };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    const off = (p: number[], pts: number[][]) => Math.min(...pts.slice(1).map((b, i) => {
      const a = pts[i]!, vx = b[0]! - a[0]!, vy = b[1]! - a[1]!, t = Math.max(0, Math.min(1, ((p[0]! - a[0]!) * vx + (p[1]! - a[1]!) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(p[0]! - a[0]! - vx * t, p[1]! - a[1]! - vy * t);
    }));
    // every limb, a crown's shoulder limb as much as a branch, leaves its parent's centre line through a collar
    for (const e of Array.from(document.querySelectorAll('.gw-svg.gb path.w')) as any[]) {
      if (!e.__par) continue;
      out.limbs++;
      const d = off(e.__pts[0], e.__par);
      if (d > 1) bad('limb starts off its parent', d);
      if (!e.__col) bad('limb with no collar');
    }
    L.trees.forEach((T: any, ti: number) => {
      // the leader thins to a hair and forks into twigs inside its crest, never a blunt cap
      const n = T.tp.length - 1, forks = T.ctw.filter((t: any) => t.fork);
      if (T.tw[n] > 1.2) bad('leader ends blunt', T.tw[n]);
      if (forks.length < 2) bad('leader forks into fewer than two twigs', forks.length);
      for (const t of forks) if (Math.hypot(t.pts[0][0] - T.tp[t.bi][0], t.pts[0][1] - T.tp[t.bi][1]) > 0.01) bad('fork twig off the leader');
      for (const t of T.ctw.filter((x: any) => x.lb)) if (Math.hypot(t.pts[0][0] - T.tp[t.bi][0], t.pts[0][1] - T.tp[t.bi][1]) > 0.01) bad('crown limb off the leader');
      // a boss sits a quarter to two fifths of the girth off the centre line, on the outside of the bend wherever the wood bends;
      // two closer than 1.2 girths are one burl
      const byWood = new Map<string, any[]>();
      for (const q of T.knots) {
        out.knots++;
        const P = q.on === 't' ? { pts: T.tp } : T.br.find((b: any) => b.id === q.bid), k: number = q.k, m = P.pts.length - 1;
        const a = P.pts[Math.max(0, k - 6)], c = P.pts[Math.min(m, k + 6)], b = P.pts[k];
        const cv = (b[0] - (a[0] + c[0]) / 2) * q.n[0] + (b[1] - (a[1] + c[1]) / 2) * q.n[1];
        if (Math.abs(cv) > 1.2 && Math.sign(cv) !== q.side) bad('boss on the inside of the bend', [ti, q.ids]);
        const f = (q.off * q.side) / q.w;
        if (f < 0.24 || f > 0.41) bad('boss off its centre line by', [ti, q.ids, f]);
        byWood.set(q.on, [...(byWood.get(q.on) ?? []), q]);
      }
      for (const qs of byWood.values()) {
        qs.sort((a, b) => a.k - b.k);
        for (let i = 1; i < qs.length; i++) { const a = qs[i - 1], b = qs[i]; if (Math.hypot(a.bp[0] - b.bp[0], a.bp[1] - b.bp[1]) < 1.2 * Math.max(a.w, b.w) - 0.01) bad('bosses closer than 1.2 girths, not one burl', [a.ids, b.ids]); }
      }
    });
    // a shoot rises from its own knot's boss, a trunk's on the boss's own side, and none stands within 40 px of another on one side
    const T0 = L.trees[0], X0: number = L.xs[0], gs: any[] = B.shootGeo ?? [];
    for (const g of gs) {
      out.shoots++;
      if (g.tip[1] >= g.base[1]) bad('shoot does not rise', g.kid);
      const kn = T0.knots.find((q: any) => q.id === g.kid);
      if (kn) {
        if (Math.hypot(g.base[0] - kn.bp[0] - X0, g.base[1] - kn.bp[1]) > kn.rb + 0.5) bad('shoot not from its own knot', g.kid);
        if (kn.on === 't' && (g.ns[0] * kn.n[0] + g.ns[1] * kn.n[1]) * kn.side <= 0) bad('trunk shoot off its boss side', g.kid);
      }
      for (const h of gs) if (h !== g && g.ns[0] * h.ns[0] + g.ns[1] * h.ns[1] > 0 && Math.hypot(g.base[0] - h.base[0], g.base[1] - h.base[1]) < 40 * kq - 0.01) bad('two shoots within 40 px on one side', [g.kid, h.kid]);
      // its count: a tag tied at its own tip
      const t = g.g?.querySelector('.shtag');
      if (!t || getComputedStyle(t).display === 'none') continue;
      out.tags++;
      const tie = (t.querySelector('.shtie')?.getAttribute('d') ?? '').match(/[-\d.]+/g)?.map(Number) ?? [], r = t.querySelector('rect').getBBox();
      if (Math.hypot(tie[0]! - g.tip[0], tie[1]! - g.tip[1]) > 3) bad('count tied off its shoot tip', g.kid);
      if (tie[2]! < r.x - 1 || tie[2]! > r.x + r.width + 1 || tie[3]! < r.y - 1 || tie[3]! > r.y + r.height + 1) bad('tie ends off its tag', g.kid);
    }
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
      const a = gs[i].g?.querySelector('.shtag rect'), b = gs[j].g?.querySelector('.shtag rect');
      if (!a || !b || getComputedStyle(a.parentNode).display === 'none' || getComputedStyle(b.parentNode).display === 'none') continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) bad('two counts overlap', [gs[i].kid, gs[j].kid]);
    }
    // an existing flow is a graft bud at the knot it re-checks: a ring on the bark, off every shoot, nearer its own knot than any other
    for (const r of B.graftR ?? []) {
      const own = T0.knots.find((q: any) => q.id === r.kid), d = (q: any) => Math.hypot(r.c[0] - q.bp[0] - X0, r.c[1] - q.bp[1]);
      if (own && T0.knots.some((q: any) => q !== own && d(q) < d(own))) bad('graft bud nearer another knot', r.kid);
    }
    for (const el of Array.from(document.querySelectorAll('.gw-svg.gb .gb-gr'))) {
      if (el.classList.contains('gone')) continue;
      out.rings.push(el.getAttribute('aria-label') ?? '');
      if (el.closest('.budg')) bad('graft bud on a shoot');
      if (!el.querySelector('circle.gring')) bad('graft bud with no ring');
    }
    return out;
  };

  it('grows Max out of the wood: limbs from their parents, bosses on the bend, shoots apart and tied to their counts, existing flows as graft buds', async () => {
    const { dir, state } = await grownBushy();
    // four existing flows that reach one part on the first journey
    const j1 = state.journeys[0]!, unit = j1.units.find((id) => state.scenarios.some((x) => x.unit === id && x.mode === 'max' && !x.journey)) ?? j1.units[0]!;
    const src = { ...(state.scenarios.find((x) => x.unit === unit) ?? state.scenarios[0]!) };
    delete src.level; delete src.polarity;
    for (let i = 0; i < 4; i++) state.scenarios.push({ ...src, id: 'rg' + i, unit, journey: null, scenarioKind: 'regression', mode: 'max', title: 'An existing flow ' + (i + 1) + ' still holds', flow: 'flow.' + i, criteria: [], modeWhy: 'regression' });
    // and parts checked on their own, one to three on each part of both journeys
    state.journeys.flatMap((j) => j.units).forEach((id, i) => {
      for (let k = 0; k <= i % 3; k++) state.scenarios.push({ ...src, id: 'pc' + i + '-' + k, unit: id, journey: null, level: 'part', scenarioKind: 'happy', mode: 'max', title: 'Part ' + id + ' alone ' + (k + 1), flow: null, criteria: [], modeWhy: 'part on its own' });
    });
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(server.url);
        await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
        await page.getByTestId('grow').waitFor();
        const paint = (st: typeof state) => page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s: st, v: growView(st) });
        // drafting brings the existing flows in one by one: a tree first drawn with one of them grows a bud for each that follows
        const early = { ...state, scenarios: state.scenarios.filter((x) => !/^rg[123]$/.test(x.id)) };
        await paint(early);
        await page.getByTestId('grow-view-grove').click();
        await expect.poll(() => page.evaluate(() => Object.keys((0, eval)('gw').B?.pad ?? {}).length)).toBeGreaterThan(0);
        expect(await page.evaluate(() => ((0, eval)('gw').B.graftR ?? []).length), width + 'px').toBe(1);
        await paint(state);
        const g = await page.evaluate(growth);
        expect(g.bad, width + 'px').toEqual([]);
        expect(g.limbs, width + 'px').toBeGreaterThan(2);
        expect(g.knots, width + 'px').toBeGreaterThan(2);
        expect(g.shoots, width + 'px').toBeGreaterThan(1);
        expect(g.rings.length, width + 'px').toBe(4);
        for (const a of g.rings) expect(a).toMatch(/^Existing flow it re-checks: An existing flow \d still holds, /);
        // the knot's card counts its part checks and the existing flows that reach it; a graft bud's card says what it is
        const cards = await page.evaluate((id) => {
          const w = (0, eval)('gw'), B = w.B, kn = B.knot[id], ring = B.svg.querySelector('.gb-gr:not(.gone)');
          kn.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
          const knot = B.tip.textContent;
          ring.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
          return { knot, ring: B.tip.textContent };
        }, unit);
        expect(cards.knot).toMatch(/In Max: (\d+ part checks? · )?4 existing flows that reach (it|them)/);
        expect(cards.ring).toContain('existing flow');
        expect(cards.ring).toContain('An existing flow');
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** The tree's own clocks, read off the motion it set going: when each piece of wood, leaf, cushion, name, shoot and graft
   *  bud first shows, against when the wood that carries it is there. */
  /** Every animation the page's own code starts, kept by its target: what a piece did is still there to read once it is over. */
  const logAnimations = () => {
    const an = new Map<Element, Animation[]>(), animate = Element.prototype.animate;
    (window as any).__an = an;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) { const a = animate.apply(this, args); an.set(this, [...(an.get(this) ?? []), a]); return a; };
  };
  const timing = () => {
    const B = (0, eval)('gw').B;
    const out = { wood: 0, leaves: 0, cush: 0, labels: 0, shoots: 0, grafts: 0, bad: [] as string[] };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    const log: Map<Element, Animation[]> = (window as any).__an, own = (el: Element | null | undefined) => (el && log.get(el)) || [];
    const start = (a: Animation) => Number(a.startTime ?? document.timeline.currentTime) + Number(a.effect!.getTiming().delay ?? 0);
    const keys = (a: Animation) => (a.effect as KeyframeEffect).getKeyframes();
    const dur = (a: Animation) => Number(a.effect!.getTiming().duration);
    // a piece of wood is revealed along its length on an ease-out: its front passes the point a fraction f along at
    // t0 + ms(1 - (1 - f)^(1/2.2)); the wood under a point is there once the first piece that carries it has passed
    const near = (pts: number[][], p: number[]) => {
      const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!));
      let best = [Infinity, 0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!, vx = b[0]! - a[0]!, vy = b[1]! - a[1]!, t = Math.max(0, Math.min(1, ((p[0]! - a[0]!) * vx + (p[1]! - a[1]!) * vy) / (vx * vx + vy * vy || 1)));
        const d = Math.hypot(p[0]! - a[0]! - vx * t, p[1]! - a[1]! - vy * t);
        if (d < best[0]!) best = [d, (acc[i - 1]! + (acc[i]! - acc[i - 1]!) * t) / (acc[acc.length - 1] || 1)];
      }
      return best as [number, number];
    };
    const woodAt = (p: number[], pad: number, not?: unknown) => {
      let t = Infinity;
      for (const g of B.grow) { if (g === not || !g.pts) continue; const [d, f] = near(g.pts, p); if (f > 0.01 && d <= Math.max(...g.w) / 2 + pad) t = Math.min(t, g.t0 + g.ms * (1 - Math.pow(1 - f, 1 / 2.2))); }
      return t;
    };
    // when a cushion has grown to v of its size, from its own keyframes
    const cuAt = (P: any, k: number, v: number) => {
      const a = own(P.cu?.[k]?.gr)[0]; if (!a) return -Infinity;
      const ks = keys(a), sc = ks.map((q) => Number(String(q.transform).match(/scale\(([\d.]+)\)/)?.[1] ?? 1));
      for (let i = 1; i < ks.length; i++) if (sc[i]! >= v) { const o0 = ks[i - 1]!.computedOffset, o1 = ks[i]!.computedOffset; return start(a) + dur(a) * (o0 + ((o1 - o0) * (v - sc[i - 1]!)) / (sc[i]! - sc[i - 1]! || 1)); }
      return start(a) + dur(a);
    };
    // each piece of wood starts from wood that is already there
    for (const g of B.grow) {
      if (!g.pts) continue;
      const t = woodAt(g.pts[0], 1, g); if (t === Infinity) continue;
      out.wood++;
      if (g.t0 < t - 2) bad('wood starts before the wood it grows from reaches it', Math.round(t - g.t0));
    }
    // a leaf opens out of its twig once the twig has grown and its cushion is all but whole
    for (const id in B.leaf) {
      const el = B.leaf[id], a = own(el.__g)[0], P = B.pad[el.__p]; if (!a || !P) continue;
      out.leaves++;
      const s = start(a), tw = (B.ltw ?? {})[id]?.[0], g = tw && B.grow.find((q: any) => q.el === tw);
      if (dur(a) < 150 || dur(a) > 180) bad('leaf opens over', dur(a));
      if (!/scale\(0\)/.test(String(keys(a)[0]!.transform))) bad('leaf does not open from its stalk', id);
      if (g && s < g.t0 + g.ms - 2) bad('leaf before its twig has grown', [id, Math.round(g.t0 + g.ms - s)]);
      const k = P.geo.cOf.get(id), c = k === undefined ? -Infinity : cuAt(P, k, 0.85);
      if (s < c - 2) bad('leaf before its cushion is all but whole', [id, Math.round(c - s)]);
    }
    // a cushion scales up from the fork its twigs leave the wood at, once the wood is there; never a patch ahead of it
    for (const pid in B.pad) {
      const P = B.pad[pid];
      (P.cu ?? []).forEach((u: any, k: number) => {
        const a = own(u.gr)[0]; if (!a) return;
        out.cush++;
        const k0 = keys(a)[0]!, m = String(k0.transform).match(/translate\(([-\d.]+)px, ?([-\d.]+)px\) scale\(([\d.]+)\)/);
        if (!m || Number(m[3]) > 0.1 || Number(k0.opacity) !== 0) return bad('cushion does not grow from a point', [pid, k]);
        const t = woodAt([Number(m[1]), Number(m[2])], 2);
        if (t === Infinity) bad('cushion grows from off the wood', [pid, k]);
        else if (start(a) < t - 2) bad('cushion grows before its wood reaches its fork', [pid, k, Math.round(t - start(a))]);
      });
    }
    // a pad's name, or its number, once its first cushion is half grown
    for (const key in B.lbl) {
      const a = own(B.lbl[key].el)[0]; if (!a) continue;
      out.labels++;
      const pid = B.pad[key] ? key : (B.padsOf[key] ?? []).find((p: string) => !B.pad[p].pol) ?? (B.padsOf[key] ?? [])[0], P = B.pad[pid];
      const half = P ? Math.min(...(P.cu ?? []).map((_: unknown, k: number) => cuAt(P, k, 0.5))) : -Infinity;
      if (start(a) < half - 2) bad('name before its pad is half grown', [key, Math.round(half - start(a))]);
    }
    // a shoot sprouts from its knot once the growing wood has passed it, and its count after it; a graft bud the same
    for (const rec of B.shootGeo ?? []) {
      const a = own(rec.fl)[0]; if (!a) continue;
      out.shoots++;
      const t = woodAt(rec.base, 6);
      if (t === Infinity) bad('shoot off the wood', rec.kid);
      else if (start(a) < t - 2) bad('shoot before the growing wood passes its knot', [rec.kid, Math.round(t - start(a))]);
      const c = own(rec.ctag)[0]; if (c && start(c) < start(a)) bad('count before its shoot', rec.kid);
    }
    for (const el of Array.from(B.svg.querySelectorAll('.gb-gr')) as Element[]) {
      const a = own(el)[0], c = el.querySelector('circle.gring'); if (!a || !c) continue;
      out.grafts++;
      const t = woodAt([Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))], 6);
      if (t === Infinity) bad('graft bud off the wood', el.getAttribute('data-k'));
      else if (start(a) < t - 2) bad('graft bud before the growing wood passes its knot', [el.getAttribute('data-k'), Math.round(t - start(a))]);
    }
    return out;
  };

  /** How a cut tree looks, part by part, for everything a preview greys: its paint and opacity as computed. */
  const looks = () => {
    const B = (0, eval)('gw').B, out: Record<string, string> = {};
    const roots = [...(new Set(Object.values(B.shoots ?? {})) as Set<any>)].filter((g) => g.g.classList.contains('pv-out')).map((g) => ['s:' + g.kid, g.fl] as const)
      .concat(Object.entries(B.leaf as Record<string, Element>).filter(([, el]) => el.classList.contains('pv-out')).map(([id, el]) => ['l:' + id, el] as const));
    for (const [k, el] of roots as [string, Element][]) Array.from(el.querySelectorAll('*')).forEach((e, i) => {
      const c = getComputedStyle(e); if (c.display === 'none' || c.opacity === '0' || e.getAnimations().length) return;
      out[k + ':' + i + ':' + e.getAttribute('class')] = [c.fill, c.stroke, c.fillOpacity, c.strokeOpacity, c.opacity].join(' ');
    });
    return out;
  };

  /** Everything one paint cut, read off the motion it set going: the turn, the drop and the fade, the cut face, the count. */
  const cuts = () => {
    const B = (0, eval)('gw').B, hf = B.svg.getBoundingClientRect().width / B.svg.viewBox.baseVal.width;
    const out = { shoots: 0, leaves: 0, order: [] as number[][], bad: [] as string[] };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    const own = (el: Element | null | undefined) => (el ? el.getAnimations().filter((a: any) => a.transitionProperty === undefined && a.animationName === undefined) : []);
    const lum = (c: string) => { const n = (c.match(/[\d.]+/g) ?? []).map(Number); return (0.2126 * n[0]! + 0.7152 * n[1]! + 0.0722 * n[2]!) / 255; };
    const keys = (a: Animation) => (a.effect as KeyframeEffect).getKeyframes();
    const TR = /translate\(([-\d.]+)px, ?([-\d.]+)px\) translate\(([-\d.]+)px, ?([-\d.]+)px\) rotate\(([-\d.]+)deg\)/;
    // a fall: half a second, gathering speed, turning 20 to 30 degrees about the cut and fading out as it drops along an arc
    const fall = (a: Animation | undefined, what: string, cut?: [number[], number]) => {
      if (!a) { bad(what + ' does not fall'); return -1; }
      const t = a.effect!.getTiming(), ks = keys(a), z = ks[ks.length - 1]!, m = String(z.transform).match(TR);
      if (t.duration !== 500) bad(what + ' falls over', t.duration);
      if (!/^ease-in$|^cubic-bezier\(0\.42, 0, 1, 1\)$/.test(String(t.easing))) bad(what + ' does not gather speed', t.easing);
      if (!m || Number(z.opacity) !== 0 || Number(ks[0]!.opacity) !== 1) { bad(what + ' does not fade as it falls'); return Number(t.delay); }
      const [dx, dy, px, py, th] = m.slice(1).map(Number) as [number, number, number, number, number];
      if (Math.abs(th) < 20 || Math.abs(th) > 30) bad(what + ' turns by', th);
      if (cut) {
        if (Math.hypot(px - cut[0][0]!, py - cut[0][1]!) > cut[1]) bad(what + ' does not turn about its cut', [px, py, cut[0]]);
        if (dy * hf < 39.9 || dy * hf > 80.1) bad(what + ' drops by', dy * hf);
        if (Math.sign(dx) !== Math.sign(th)) bad(what + ' tips one way and drifts the other');
        const mid = ks.find((k) => k.computedOffset > 0 && k.computedOffset < 1), mm = mid && String(mid.transform).match(TR);
        if (!mm || !(Number(mm[1]) / dx > Number(mm[2]) / dy)) bad(what + ' drops straight down, not along an arc');
      }
      return Number(t.delay);
    };
    for (const g of new Set(Object.values(B.shoots ?? {})) as Set<any>) {
      if (!g.fade) continue;
      out.shoots++;
      const d = fall(own(g.fl)[0], 'shoot ' + g.kid, [g.base, 0.1]);
      out.order.push([g.base[1], d]);
      if (!g.g.classList.contains('pv-out')) bad('a falling shoot loses its preview look', g.kid);
      if (g.fl.querySelector('.gb-lf.pv-add')) bad('a falling shoot\'s leaf turns green', g.kid);
      // its cut face is on the bark from the snip: a flat pale oval at its collar, lighter than any bark
      const sc = g.scar, face = sc?.querySelector('ellipse');
      if (!sc || getComputedStyle(sc).display === 'none' || !face) bad('no cut face where a shoot is cut', g.kid);
      else {
        if (Math.hypot(Number(face.getAttribute('cx')) - g.base[0], Number(face.getAttribute('cy')) - g.base[1]) > 0.1) bad('cut face off the collar', g.kid);
        const fc = getComputedStyle(face), wood = getComputedStyle(B.svg.querySelector('path.w')).fill;
        if (sc.children.length !== 1 || /url\(/.test(fc.fill) || fc.stroke === 'none') bad('cut face shaded, or with no ring', g.kid);
        if (lum(fc.fill) < lum(wood) + 0.25) bad('cut face as dark as the bark', [fc.fill, wood]);
        const sa = own(sc)[0]; if (sa && Number(sa.effect!.getTiming().delay) > d) bad('cut face shows after the snip', g.kid);
      }
      // its count does not fall: it fades at the snip, in about 120 ms
      const tag = g.ctag;
      if (tag && getComputedStyle(tag).display !== 'none') {
        const ta = own(tag)[0];
        if (!ta) bad('count does not fade', g.kid);
        else { const t = ta.effect!.getTiming(); if (t.duration !== 120 || Number(t.delay) !== d || keys(ta).some((k) => k.transform)) bad('count does not just fade at the snip', [t.duration, t.delay, d]); }
      }
    }
    for (const id in B.leaf) {
      const el = B.leaf[id]; if (!el.classList.contains('cut')) continue;
      out.leaves++;
      if (!el.classList.contains('pv-out')) bad('a falling leaf loses its preview look', id);
      // its twig turns about the cut face it leaves on the wood
      const d = fall(el.__fall?.[0], 'leaf ' + id), sc = B.scar?.[id], face = sc?.querySelector('.cutf');
      if (!sc?.classList.contains('on') || !face) bad('no scar where a leaf is cut', id);
      else if (el.__fall?.[1]) fall(el.__fall[1], 'twig of ' + id, [[Number(face.getAttribute('cx')), Number(face.getAttribute('cy'))], 0.1]);
      out.order.push([el.__y, d]);
    }
    // from the apex down, one about every 40 ms
    out.order.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    for (let i = 1; i < out.order.length; i++) if (out.order[i]![1]! < out.order[i - 1]![1]!) bad('cut out of turn from the apex down', [out.order[i - 1], out.order[i]]);
    const ds = [...new Set(out.order.map((o) => o[1]!))].sort((a, b) => a - b);
    if (ds.length && ds[0] !== 0) bad('the first cut waits', ds[0]);
    for (let i = 1; i < ds.length; i++) if (ds[i]! < 600 && Math.abs(ds[i]! - ds[i - 1]! - 40) > 1) bad('cuts not 40 ms apart', ds);
    return out;
  };

  it('grows nothing ahead of its wood, and prunes by snipping each cut at its collar and letting it fall in the preview’s grey', async () => {
    const { dir, state } = await grownBushy();
    // parts checked on their own and existing flows, so Max has shoots, counts and graft buds to grow and Min to cut
    const j1 = state.journeys[0]!, unit = j1.units.find((id) => state.scenarios.some((x) => x.unit === id && x.mode === 'max' && !x.journey)) ?? j1.units[0]!;
    const src = { ...(state.scenarios.find((x) => x.unit === unit) ?? state.scenarios[0]!) };
    delete src.level; delete src.polarity;
    for (let i = 0; i < 2; i++) state.scenarios.push({ ...src, id: 'rg' + i, unit, journey: null, scenarioKind: 'regression', mode: 'max', title: 'An existing flow ' + (i + 1) + ' still holds', flow: 'flow.' + i, criteria: [], modeWhy: 'regression' });
    state.journeys.flatMap((j) => j.units).forEach((id, i) => {
      for (let k = 0; k <= (i % 3) + 3; k++) state.scenarios.push({ ...src, id: 'pc' + i + '-' + k, unit: id, journey: null, level: 'part', scenarioKind: 'happy', mode: 'max', title: 'Part ' + id + ' alone ' + (k + 1), flow: null, criteria: [], modeWhy: 'part on its own' });
    });
    // asked, not yet chosen: the tree grows, then Min is pointed at and picked
    const asked = { ...state, asked: true, modeBy: null, mode: 'min' as const };
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: scheme });
        await page.addInitScript(logAnimations);
        await page.goto(server.url);
        await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
        await page.getByTestId('grow').waitFor();
        // a look compared before and after the cut is the look itself, not a colour part way through a transition
        await page.addStyleTag({ content: '.gw-svg.gb, .gw-svg.gb * { transition: none !important; }' });
        await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s: asked, v: growView(asked) });
        await page.getByTestId('grow-view-grove').click();
        await expect.poll(() => page.evaluate(() => Object.keys((0, eval)('gw').B?.pad ?? {}).length)).toBeGreaterThan(0);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const t = await page.evaluate(timing);
        expect(t.bad, width + 'px').toEqual([]);
        for (const k of ['wood', 'leaves', 'cush', 'labels', 'shoots', 'grafts'] as const) expect(t[k], width + 'px ' + k).toBeGreaterThan(0);
        // once it has grown, pointing at Min greys what it would cut; picking it cuts them, from that grey
        await page.waitForFunction(() => {
          const B = (0, eval)('gw').B, log: Map<Element, Animation[]> = (window as any).__an;
          const ends = [...log.values()].flat().map((a) => Number(a.startTime ?? 0) + Number(a.effect?.getComputedTiming().endTime ?? 0)).concat(B.grow.map((g: any) => g.t0 + g.ms));
          return performance.now() > Math.max(...ends) + 50;
        }, null, { timeout: 20000 });
        const before = await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); return null; }).then(() => page.evaluate(looks));
        const c = await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); return null; }).then(() => page.evaluate(cuts));
        expect(c.bad, width + 'px').toEqual([]);
        expect(c.shoots, width + 'px').toBeGreaterThan(1);
        expect(c.leaves, width + 'px').toBeGreaterThan(1);
        const after = await page.evaluate(looks);
        const changed = Object.keys(after).filter((k) => k in before && before[k] !== after[k]).map((k) => [k, before[k], after[k]]);
        expect(changed, width + 'px').toEqual([]);
        expect(Object.keys(after).filter((k) => k in before).length, width + 'px').toBeGreaterThan(10);
        await page.close();
      }
      // with reduced motion nothing grows or falls: the tree is there at once, and a cut is just gone, its scars left
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      await page.addInitScript(logAnimations);
      await page.goto(server.url);
      await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
      await page.getByTestId('grow').waitFor();
      await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s: asked, v: growView(asked) });
      await page.getByTestId('grow-view-grove').click();
      await expect.poll(() => page.evaluate(() => Object.keys((0, eval)('gw').B?.pad ?? {}).length)).toBeGreaterThan(0);
      const moving = () => { const B = (0, eval)('gw').B, log: Map<Element, Animation[]> = (window as any).__an; return document.getAnimations().filter((a) => { const e = a.effect as KeyframeEffect | null; return !!e?.target && B.svg.contains(e.target) && a.playState !== 'finished'; }).map((a) => (a.effect as KeyframeEffect).target!.getAttribute('class')).concat([...log.keys()].filter((e) => B.svg.contains(e)).map((e) => 'animated ' + e.getAttribute('class'))); };
      expect(await page.evaluate(moving)).toEqual([]);
      await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); });
      expect(await page.evaluate(moving)).toEqual([]);
      const rest = await page.evaluate(() => {
        const B = (0, eval)('gw').B, gs = [...(new Set(Object.values(B.shoots ?? {})) as Set<any>)];
        return { cut: B.svg.querySelectorAll('.gb-lf.cut').length, scars: B.svg.querySelectorAll('.scar.on').length, shown: gs.filter((g) => g.g.style.display !== 'none').length, faces: gs.filter((g) => g.scar && g.scar.style.display !== 'none').length, shoots: gs.length };
      });
      expect(rest.cut).toBe(0);
      expect(rest.scars).toBeGreaterThan(1);
      expect(rest.shown).toBe(0);
      expect(rest.faces).toBe(rest.shoots);
      await page.close();
    } finally { await browser.close(); }
  }, 90000);
});
