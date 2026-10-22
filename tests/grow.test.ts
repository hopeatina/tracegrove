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

  it('streams JSON lines with --jsonl, and exits 3 when nothing was proved (not proven yet)', async () => {
    const dir = repo();
    let out = '';
    const { code } = await growCommand({ dir, branch: 'refunds', base: 'main', mode: 'min', 'no-prove': true, 'no-gh': true, 'no-agent': true, jsonl: true }, (t) => { out += t; });
    expect(code).toBe(3);
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

  /** Opens the Grow page on a folded state, at a width, optionally as a phone that cannot hover. */
  async function growPage(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string, state: unknown, width: number, touch = false) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
    if (process.env.TG_THROTTLE) { const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.TG_THROTTLE) }); }
    await page.goto(url);
    await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
    await page.getByTestId('grow').waitFor();
    await page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.gw.tree = 'grove'; w.growPaint(); }, { s: state, v: growView(state as never) });
    await page.locator('[data-testid="grow"] svg.gb[role=group]').waitFor();
    return page;
  }

  it('says what a part is checked by in one set of words: the inspector, the knot’s card and the Outline agree, and flows are never part checks', async () => {
    const { dir, state } = await grownWithFailure();
    // A part on a journey with its own checks and existing flows through it, all grown by Max only.
    const unit = state.journeys[0]!.units.find((id) => !state.units.find((u) => u.id === id)!.root)!;
    const own = state.scenarios.filter((x) => x.unit === unit && x.level === 'part' && x.mode === 'max');
    for (const [i, kind] of (['regression', 'regression', own.length ? null : 'edge'] as const).entries()) {
      if (!kind) continue;
      applyGrow(state, { v: 'tracegrove.discovery-event/v1', seq: state.last + 1, ms: state.ms, kind: 'scenario.drafted', scenario: 'extra-' + i, unit, scenarioKind: kind, mode: 'max', title: 'Existing flow ' + i + ' still works', proves: 'it still works', criteria: [], layers: ['api'], flow: null, variants: [], realKey: null, mockOnly: null, by: 'rules', ext: [], journey: null, level: 'part' } as GrowEvent);
    }
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await growPage(browser, server.url, state, 1440);
      const counts = await page.evaluate((id) => { const w = (0, eval)('({ gw })'); const list = w.gw.M.buds[id] || []; return { all: list.length, reg: list.filter((x: { scenarioKind: string }) => x.scenarioKind === 'regression').length }; }, unit);
      expect(counts.reg).toBe(2);
      expect(counts.all - counts.reg).toBeGreaterThan(0);
      // The inspector pinned on the part: one line, led by the mode that grows them, each kind counted under its own name.
      await page.evaluate((id) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = 'u:' + id; w.growPaint(); }, unit);
      const line = (await page.getByTestId('grow-own-line').textContent())!;
      const own2 = counts.all - counts.reg;
      expect(line).toBe(`${counts.all} in Max · ${own2} part check${own2 === 1 ? '' : 's'} · 2 existing flows`);
      expect(await page.getByTestId('grow-inspector').textContent()).not.toContain(`${counts.all} part check`);
      expect(await page.getByTestId('grow-inspector').textContent()).toContain('Part checks and existing flows');
      // The knot's card on the tree says the same.
      const card = await page.evaluate((id) => { const w = (0, eval)('({ gw, gbTip })'); w.gw.pinned = null; w.gbTip('u:' + id, w.gw.B.knot[id]); const st = document.querySelector('.gb-tip .st.own'); return st ? st.textContent : null; }, unit);
      expect(card).toBe(line);
      // The Outline's rows for the part, one per kind, use the same words, and add up to the same count.
      await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = null; w.gw.tree = 'outline'; w.gw.open = { own: true, reg: true }; w.growPaint(); });
      const label = state.units.find((u) => u.id === unit)!.label;
      const rows = await page.evaluate((name) => Array.from(document.querySelectorAll('[data-testid="grow-outline"] .gb-bpf > summary'))
        .filter((s) => s.querySelector('.pn')?.textContent === name).map((s) => s.querySelector('.gw-facts .tk')?.textContent ?? ''), label);
      expect(rows).toEqual([`${own2} part check${own2 === 1 ? '' : 's'}`, '2 existing flows']);
      expect(line).toBe(`${counts.all} in Max · ` + rows.join(' · '));
      // In Max, which runs them, the inspector lists each as a row under its kind, never as text.
      const max = { ...state, mode: 'max' as const, modeBy: 'you' as const, asked: false };
      await page.evaluate(({ id, s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.tree = 'grove'; w.gw.pinned = 'u:' + id; w.growPaint(); }, { id: unit, s: max, v: growView(max) });
      const ins = page.getByTestId('grow-inspector');
      expect(await ins.textContent()).not.toContain('[object');
      expect(await ins.locator('.gb-sub').allTextContents()).toEqual(['Part checks', 'Existing flows']);
      const titles: string[] = await page.evaluate((id) => ((0, eval)('gw').M.buds[id] || []).map((x: { title: string }) => x.title), unit);
      const listed = await ins.locator('.gb-ols').allTextContents();
      expect(titles.filter((t) => !listed.some((r) => r.startsWith(t)))).toEqual([]);
      expect(titles.length).toBe(counts.all);
      await page.close();
    } finally { await browser.close(); }
  }, 60000);

  it('starts each later line of a wrapped path with its arrow, never ends a line on one, and lines it up with the first, in the inspector, the cards and the Outline', async () => {
    const { dir, state } = await grownWithFailure();
    // A journey long enough to wrap in the panel and on a phone: its path crosses more parts, one with a long file path.
    const j = state.journeys[0]!;
    for (const [i, label] of ['RefundPanel.jsx', 'web/components/refunds/RefundDialog.jsx', 'validate.ts', 'ledger.ts', 'GET /orders/:id', 'refunds.mjs'].entries()) {
      applyGrow(state, { v: 'tracegrove.discovery-event/v1', seq: state.last + 1, ms: state.ms, kind: 'unit.found', unit: 'hop' + i, label, unitKind: 'module', loc: 'src/' + label + ':1', root: false, layer: 'api', parent: null } as GrowEvent);
      j.units.splice(1, 0, 'hop' + i);
    }
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 390]) {
        const page = await growPage(browser, server.url, state, width);
        const check = async (where: string, sel: string) => {
          const paths = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).filter((p) => (p as HTMLElement).offsetParent !== null).map((p) => {
            const hops = Array.from(p.children) as HTMLElement[];
            const first = hops[0]!.getBoundingClientRect();
            return hops.map((hop, i) => {
              const r = hop.getBoundingClientRect(), prev = i ? hops[i - 1]!.getBoundingClientRect() : null, label = hop.lastElementChild as HTMLElement | null;
              const lr = label ? label.getClientRects()[0]! : r, arrow = getComputedStyle(hop, '::before').content;
              return { i, arrow: arrow.includes('›'), inText: (hop.textContent ?? '').includes('›'), lineStart: !!prev && r.top > prev.top + 4, left: r.left - first.left, labelIn: lr.left - r.left, sameLine: Math.abs(lr.top - r.top) < 6, text: hop.textContent };
            });
          }), sel);
          expect(paths.length, where).toBeGreaterThan(0);
          let wrapped = 0;
          for (const hops of paths) for (const hop of hops) {
            // Every hop but the first is led by its arrow, drawn before its name and on its name's line; none carries one after it.
            expect(hop.arrow, where + ': ' + hop.text).toBe(hop.i > 0);
            expect(hop.inText, where + ': ' + hop.text).toBe(false);
            expect(hop.sameLine, where + ': ' + hop.text).toBe(true);
            // A hop that starts a later line starts at the first hop's left edge, its arrow first, so no line ends on an arrow.
            if (hop.lineStart) { wrapped++; expect(Math.abs(hop.left), where + ': ' + hop.text).toBeLessThanOrEqual(2); expect(hop.labelIn, where + ': ' + hop.text).toBeGreaterThan(4); }
          }
          expect(wrapped, where).toBeGreaterThan(0);
        };
        // The inspector's journey, and the Journeys card below it.
        await page.evaluate((id) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = 'j:' + id; w.gw.open = { ['j:' + id]: true }; w.growPaint(); }, j.id);
        await check(width + ' grove', '[data-testid="grow"] .gw-hp');
        // The card of a scenario on that journey, beside its leaf (on a phone, under the tree).
        const sid = state.scenarios.find((x) => x.journey === j.id && x.mode === 'min')!.id;
        await page.evaluate(([sid, phone]) => { const w = (0, eval)('({ gw, growPaint, gbTip })'); w.gw.pinned = phone ? 's:' + sid : null; w.growPaint();
          if (!phone) w.gbTip('s:' + sid, Array.from(w.gw.B.svg.querySelectorAll('[data-k]')).find((e) => (e as Element).getAttribute('data-k') === 's:' + sid)); }, [sid, width < 480] as const);
        await check(width + ' card', '.gb-tip .gw-hp');
        await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = null; w.gw.tree = 'outline'; w.growPaint(); });
        await check(width + ' outline', '[data-testid="grow"] .gw-hp');
        await page.close();
      }
    } finally { await browser.close(); }
  }, 90000);

  it('lays the key out as a grid whose columns line up, with a row for where a leaf sits on a one-journey tree too', async () => {
    const { dir, state } = await grownWithFailure();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 768, 390]) {
        const page = await growPage(browser, server.url, state, width);
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="grow"] .gw-tree .gw-legend > .gw-lg')).map((row) => ({
          head: row.querySelector(':scope > .lh')?.textContent ?? '',
          lefts: Array.from(row.querySelectorAll(':scope > .lgi > *')).map((it) => Math.round(it.getBoundingClientRect().left)),
        })));
        expect(rows.map((r) => r.head).slice(0, 5), width + 'px').toEqual(['Where a leaf sits', 'Leaf', 'Route', 'Knot', 'Ground']);
        // Every item starts on one of the same few edges, whichever row it is in.
        const edges = [...new Set(rows.flatMap((r) => r.lefts))].sort((a, b) => a - b);
        const widest = Math.max(...rows.map((r) => new Set(r.lefts).size));
        expect(edges.length, width + 'px: ' + edges.join(',')).toBeLessThanOrEqual(widest);
        // The arithmetic sentence is gone: what the mode pruned is a table of the modes.
        const text = (await page.locator('[data-testid="grow"] .gw-tree').textContent())!;
        expect(text).not.toMatch(/keeps \d+ of the \d+ drafted\. Pruned by/);
        expect(await page.locator('[data-testid="grow"] .gw-legend table.gw-cmp th.is-chosen').count()).toBe(1);
        // Its mode headers fit their columns at every width, so no two run together.
        const heads = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="grow"] .gw-legend table.gw-cmp th[data-m]')).map((th) => {
          const shown = Array.from(th.children).filter((c) => (c as HTMLElement).offsetWidth > 1) as HTMLElement[];
          return { text: shown.map((c) => c.textContent).join(''), fits: shown.every((c) => c.getBoundingClientRect().right <= th.getBoundingClientRect().right - 2) };
        }));
        expect(heads.map((x) => x.text), width + 'px').toEqual(['Min', 'Std', 'Max']);
        expect(heads.every((x) => x.fits), width + 'px').toBe(true);
        await page.close();
      }
      // A tree of one journey keeps the row, in the words that fit it: its guards and failures grow as branches of their own.
      const one = structuredClone(state);
      one.journeys = one.journeys.slice(0, 1);
      for (const x of one.scenarios) if (x.journey && x.journey !== one.journeys[0]!.id) x.journey = one.journeys[0]!.id;
      const page = await growPage(browser, server.url, one, 1440);
      const where = page.locator('[data-testid="grow"] .gw-tree .gw-legend .gw-lg.where');
      expect(await where.locator('.lh').textContent()).toBe('Where a leaf sits');
      expect(await where.textContent()).toContain('happy path, on the crown');
      await page.close();
    } finally { await browser.close(); }
  }, 90000);

  it('says Tap where a finger works the page and Point at where a mouse does, and previews every mode card alike', async () => {
    const { dir, state } = await grownWithFailure();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const mouse = await growPage(browser, server.url, state, 1440);
      expect(await mouse.getByTestId('grow-mode-preview').textContent()).toMatch(/^Point at another mode/);
      // The card previewed after the choice looks as the card previewed before it.
      // the look once its transition has run, however late a busy page starts it
      const ring = async (id: string) => { await mouse.getByTestId('grow-mode-' + id).focus(); await mouse.waitForTimeout(400); return mouse.getByTestId('grow-mode-' + id).evaluate(async (b) => { void getComputedStyle(b).boxShadow; await Promise.all(b.getAnimations().map((a) => a.finished.catch(() => null))); return { pv: b.classList.contains('pv'), shadow: getComputedStyle(b).boxShadow, edge: getComputedStyle(b).borderTopStyle + ' ' + getComputedStyle(b).borderTopColor }; }); };
      const after = await ring('max');
      expect(after.pv).toBe(true);
      await mouse.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state.modeBy = null; w.gw.state.asked = true; w.gw.preview = null; w.growPaint(); });
      expect(await mouse.getByTestId('grow-mode-hint').textContent()).toBe('Choose how much to prove. Tracing is done; nothing runs until you pick.');
      expect(await ring('std')).toEqual(after);
      // the recommended card too, while it is previewed
      expect(await ring('min')).toEqual(after);
      await mouse.close();
      const finger = await growPage(browser, server.url, state, 390, true);
      expect(await finger.getByTestId('grow-mode-preview').textContent()).toMatch(/^Tap another mode/);
      expect(await finger.getByTestId('grow').textContent()).not.toContain('Point at');
      await finger.close();
    } finally { await browser.close(); }
  }, 60000);

  /** The ground under the tree, read from the drawn page: the pot's widest edge, each service root's names, the unused store's
   *  stub and tag, the seal's lines, and the nebari and soil from the layout. */
  const ground = () => {
    const w = (0, eval)('({ gw })'); const L = w.gw.B.L;
    const svg = document.querySelector('[data-testid="grow"] svg.gb[role=group]')!;
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.width }; };
    const lip = box(svg.querySelector('.lip')!), foot = box(svg.querySelector('.pots .pot-ft')!);
    const ext = Array.from(svg.querySelectorAll('.rt.dep.ext')).map((g) => ({ wood: box(g.querySelector('.w')!), names: Array.from(g.querySelectorAll('.rlbl:not(.nt)')).map((t) => ({ text: t.textContent, ...box(t) })),
      stops: Array.from(g.querySelectorAll('.rlbl.nt')).map((t) => ({ text: t.textContent, ...box(t) })), end: g.querySelector('.tailend') ? box(g.querySelector('.tailend')!) : null }));
    const lg = svg.querySelector('.rt.loose');
    const loose = lg ? { tags: Array.from(lg.querySelectorAll('.rlbl')).map((t) => ({ text: t.textContent, lines: t.querySelectorAll('tspan[dy], tspan[y]').length, ...box(t) })), rect: box(lg.querySelector('.tag')!),
      dash: getComputedStyle(lg.querySelector('.tag')!).strokeDasharray, stake: box(lg.querySelector('.stake')!), cut: box(lg.querySelector('.rcut')!) } : null;
    const seal = Array.from(svg.querySelectorAll('.seal .sm')).map((t) => ({ text: t.textContent ?? '', len: (t as SVGTextElement).getComputedTextLength() }));
    const room = Number(svg.querySelector('.seal')?.getAttribute('data-room'));
    // the soil line, and where a store root that no journey uses lies against it
    const half = (T: { tp: number[][]; tw: number[] }) => { let k = 0; while (k < T.tp.length - 1 && T.tp[k]![1]! > -8) k++; return T.tw[k]! / 2; };
    const nebari = L.roots.filter((r: { id: string | null }) => !r.id).map((r: { tree: number; pts: number[][]; w: number[] }) => ({ tree: r.tree, G: 2 * half(L.trees[r.tree]), X: L.xs[r.tree], start: Math.max(...r.w.slice(0, 4)), tip: r.w.at(-1), reach: Math.abs(r.pts.at(-1)![0]! - L.xs[r.tree]), half: L.potL / 2 }));
    // each trunk's foot: how far it flares at the soil against its width one caliper up, and that caliper against the pot
    const trunk = L.trees.map((T: { tp: number[][]; tw: number[]; D: number }) => {
      const up = (y: number) => { let k = 0; while (k < T.tp.length - 1 && T.tp[k]![1]! > -y) k++; return T.tw[k]!; };
      return { flare: T.tw[0]! / up(T.D), cal: up(T.D), D: T.D, potL: L.potL, lone: !!L.lone };
    });
    const lr = L.roots.find((r: { loose: boolean }) => r.loose);
    const sunk = lr ? lr.pts.slice(0, Math.floor(lr.pts.length * .7)).map((p: number[]) => p[1]! - L.sy(p[0]!)) : [];
    // the unused store's root in the layout's units: where it leaves, how far past the foot its cut end lies, how much of it
    // stands above the soil, and the cut face and stake as drawn
    const root = lr ? (() => {
      const n = lr.pts.length, X = L.xs[lr.tree], hb = half(L.trees[lr.tree]), e = lr.pts[n - 1], face = lg!.querySelector('.rcut')!;
      const shows = lr.pts.slice(0, Math.floor(n * .7)).map((p: number[], i: number) => (L.sy(p[0]!) + .7 - (p[1]! - lr.w[i] / 2)) / lr.w[i]);
      return { start: Math.abs(lr.pts[0][0] - X) / hb, past: (Math.abs(e[0] - X) - hb) / L.kpx, shows: Math.min(...shows), endTop: e[1] - lr.w[n - 1] / 2 - L.sy(e[0]),
        face: [Number(face.getAttribute('cx')) - e[0], Number(face.getAttribute('cy')) - e[1]], faceBox: box(face), op: Number(getComputedStyle(lg!.querySelector('.w')!).opacity) };
    })() : null;
    // the pot: its lip a deeper rim of lighter clay than the body with a highlight along its top, its walls leaning in to the foot
    const body = svg.querySelector('.pot-b') as SVGPathElement, lipB = svg.querySelector('.lip-b')!, pt = (svg as SVGSVGElement).createSVGPoint();
    const across = (y: number) => { let a = Infinity, b = -Infinity; for (let x = L.potC - L.potL / 2 - 4; x <= L.potC + L.potL / 2 + 4; x += .25) { pt.x = x; pt.y = y; if (body.isPointInFill(pt)) { a = Math.min(a, x); b = Math.max(b, x); } } return b - a; };
    const stopOf = (fill: string) => getComputedStyle(svg.querySelector(fill.replace(/^url\("?|"?\)$/g, '') + ' stop:nth-child(2)')!).stopColor;
    const pot = { lipH: Number(lipB.getAttribute('height')), over: (box(body).l - box(lipB).l), taper: across(L.D - 1) / across(3), lipStop: stopOf(lipB.getAttribute('fill')!), bodyStop: stopOf(body.getAttribute('fill')!),
      hi: Number(getComputedStyle(svg.querySelector('.lip-hi')!).opacity), body: box(body), sealBox: svg.querySelector('.seal') ? box(svg.querySelector('.seal')!) : null, sealOp: svg.querySelector('.seal') ? Number(getComputedStyle(svg.querySelector('.seal')!).opacity) : 0 };
    return { lip, foot, ext, loose, seal, room, nebari, trunk, sunk, root, pot, moss: svg.querySelectorAll('.mc, .moss').length, trees: L.trees.length };
  };
  /** A foot a bonsai grower would keep: four to six radial surface roots per tree, each leaving the trunk three tenths
   *  to forty-five hundredths of its girth thick and thinning to a hair, out to six to nine tenths of the pot's half-length (five
   *  at most, as before);
   *  the trunk flared to one and a half times its width one caliper up, and that caliper at least an eighth of the pot. */
  const footOk = (g: { trees: number; nebari: Array<{ tree: number; G: number; start: number; tip: number; reach: number; half: number }>; trunk: Array<{ flare: number; cal: number; D: number; potL: number; lone: boolean }> }, at: string) => {
    for (let i = 0; i < g.trees; i++) { const n = g.nebari.filter((q) => q.tree === i).length; expect(n, at).toBeGreaterThanOrEqual(4); expect(n, at).toBeLessThanOrEqual(5); }
    for (const q of g.nebari) {
      expect(q.start / q.G, at + ' root start').toBeGreaterThanOrEqual(.3);
      expect(q.start / q.G, at + ' root start').toBeLessThanOrEqual(.45);
      expect(q.tip, at).toBeLessThan(1.5);
      expect(q.tip / q.G, at + ' root tip').toBeLessThanOrEqual(.12);
      expect((q.reach - q.G / 2) / q.G, at).toBeLessThanOrEqual(1.6);
      expect(q.reach / q.half, at + ' root reach').toBeGreaterThanOrEqual(.6);
      expect(q.reach / q.half, at + ' root reach').toBeLessThanOrEqual(.9);
    }
    for (const t of g.trunk) {
      expect(t.flare, at + ' flare').toBeGreaterThanOrEqual(1.4);
      expect(t.flare, at + ' flare').toBeLessThanOrEqual(1.6);
      if (t.lone) continue;
      expect(t.cal / t.potL, at + ' caliper').toBeGreaterThanOrEqual(.12);
      expect(t.D / t.potL, at + ' trunk').toBeGreaterThanOrEqual(.12);
    }
  };

  it('roots the tree in its pot: buttress roots that taper into the soil, a service named outside the rim on its side at every width, an unused store sunk with a one-line dashed tag, and the whole repo name on the seal', async () => {
    const { dir, state } = await grownWithFailure();
    const service = state.units.find((u) => u.root && u.layer === 'ext')!;
    expect(service).toBeTruthy();
    if (!state.stops.some((x) => x.unit === service.id)) applyGrow(state, { v: 'tracegrove.discovery-event/v1', seq: state.last + 1, ms: state.ms, kind: 'trace.stopped', unit: service.id, at: service.loc, why: 'the call leaves the repo' } as GrowEvent);
    // A table the change adds that no journey reads or writes.
    applyGrow(state, { v: 'tracegrove.discovery-event/v1', seq: state.last + 1, ms: state.ms, kind: 'unit.found', unit: 'seats', label: 'seats table', unitKind: 'table', loc: 'db/seats.sql:1', root: true, layer: 'data', parent: null } as GrowEvent);
    const repoName = dir.split(/[\\/]/).pop()!;
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 1024, 768, 390]) {
        const page = await growPage(browser, server.url, state, width, width < 500);
        await page.waitForTimeout(2500);
        const g = await page.evaluate(ground);
        const at = width + 'px';
        // 4 or 5 buttress roots per tree, each thick where it leaves the trunk, out to six to nine tenths of the pot's
        // half-length and never past about one and a half base widths, thinning to a hair; the trunk flared over them.
        footOk(g, at);
        // The service is named where its root crosses the rim, outside the pot on that side; "trace stops" is a label of its own
        // by the end of the tail.
        expect(g.ext, at).toHaveLength(1);
        const [root] = g.ext;
        const side = root!.wood.l < g.lip.l - .5 ? -1 : root!.wood.r > g.lip.r + .5 ? 1 : 0;
        expect(side, at).not.toBe(0);
        expect(root!.names.map((x: { text: string | null }) => x.text), at).toEqual([service.label]);
        const name = root!.names[0]!;
        if (side < 0) expect(name.r, at).toBeLessThanOrEqual(g.lip.l); else expect(name.l, at).toBeGreaterThanOrEqual(g.lip.r);
        expect(name.cy, at).toBeGreaterThan(g.lip.t - 4);
        expect(name.cy, at).toBeLessThan(g.foot.t);
        expect(root!.stops.map((x: { text: string | null }) => x.text), at).toEqual(['trace stops']);
        const stop = root!.stops[0]!, end = root!.end!;
        expect(Math.min(Math.abs(stop.l - end.r), Math.abs(stop.r - end.l)), at).toBeLessThan(8);
        expect(Math.abs(stop.cy - end.cy), at).toBeLessThan(8);
        // The unused store: a stub sunk to half its depth in the soil, its tag one line inside a dashed border, staked beside
        // the cut face.
        expect(g.loose, at).toBeTruthy();
        const { tags, rect, dash, stake, cut } = g.loose!;
        expect(tags, at).toHaveLength(1);
        expect(tags[0]!.text, at).toMatch(/^seats(?: table|…)? · unused$/);
        if (width >= 768) expect(tags[0]!.text, at).toBe('seats table · unused');
        expect(tags[0]!.lines, at).toBe(0);
        expect(tags[0]!.l, at).toBeGreaterThanOrEqual(rect.l);
        expect(tags[0]!.r, at).toBeLessThanOrEqual(rect.r);
        expect(dash, at).not.toBe('none');
        expect(Math.min(Math.abs(stake.cx - cut.l), Math.abs(stake.cx - cut.r)), at).toBeLessThanOrEqual(cut.w + 4);
        for (const dy of g.sunk) expect(Math.abs(dy), at).toBeLessThan(1.5);
        // ... and a root of its own, faded, running out from under the nebari seventy to ninety pixels past the foot, about
        // two fifths of it above the soil, its cut end standing out of it with the stake pushed into the cut face.
        const rt = g.root!;
        expect(rt.start, at).toBeLessThanOrEqual(1);
        expect(rt.past, at).toBeGreaterThanOrEqual(69.5);
        expect(rt.past, at).toBeLessThanOrEqual(90.5);
        expect(rt.shows, at).toBeGreaterThanOrEqual(.25);
        expect(rt.endTop, at).toBeLessThan(-1);
        expect(Math.hypot(rt.face[0]!, rt.face[1]!), at).toBeLessThan(.5);
        expect(Math.abs(stake.cx - rt.faceBox.cx), at).toBeLessThanOrEqual(rt.faceBox.w / 2);
        expect(rt.op, at).toBeGreaterThanOrEqual(.35);
        expect(rt.op, at).toBeLessThanOrEqual(.75);
        // Bare soil: no moss, which carries nothing.
        expect(g.moss, at).toBe(0);
        // The pot: a lip about four units deep standing out past the wall, of lighter clay than the body with a highlight along
        // its top, and walls that lean in, the bottom about ninety-six hundredths of the top.
        expect(g.pot.lipH, at).toBeGreaterThanOrEqual(4);
        expect(g.pot.over, at).toBeGreaterThan(1);
        expect(g.pot.taper, at).toBeGreaterThan(.93);
        expect(g.pot.taper, at).toBeLessThan(.975);
        expect(g.pot.hi, at).toBeGreaterThanOrEqual(.5);
        expect(g.pot.lipStop, at).not.toBe(g.pot.bodyStop);
        // The seal in the middle of the face, between the lip and the foot, at full strength.
        const sb = g.pot.sealBox!;
        expect(Math.abs(sb.cx - g.pot.body.cx), at).toBeLessThanOrEqual(1.5);
        expect(sb.t, at).toBeGreaterThan(g.lip.b);
        expect(sb.b, at).toBeLessThan(g.foot.t);
        expect(g.pot.sealOp, at).toBe(1);
        // The seal keeps the whole repo name, on one line or broken at a hyphen, every line inside the face.
        expect(g.seal.map((x: { text: string }) => x.text).join(''), at).toBe(repoName);
        for (const line of g.seal) expect(line.len, at + ': ' + line.text).toBeLessThanOrEqual(g.room + .5);
        await page.close();
      }
      // Pointed at, the service's route turns off the trunk along its root and ends there: nothing lit runs on below the soil.
      const page = await growPage(browser, server.url, state, 1440);
      await page.waitForTimeout(2500);
      const below = await page.evaluate((id) => {
        const w = (0, eval)('({ gw, gbLight })'); w.gw.hov = 'u:' + id; w.gbLight();
        const L = w.gw.B.L, sap = w.gw.B.sap as SVGPathElement, n = sap.getTotalLength(), pa = L.potC - L.potL / 2, pb = L.potC + L.potL / 2;
        let worst = -Infinity;
        for (let s = 0; s <= n; s += .5) { const p = sap.getPointAtLength(s); if (p.x > pa + 2 && p.x < pb - 2) worst = Math.max(worst, p.y - L.sy(p.x)); }
        return { n, worst };
      }, service.id);
      expect(below.n).toBeGreaterThan(0);
      expect(below.worst).toBeLessThanOrEqual(.5);
      // The Outline names it as its tag does.
      await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.tree = 'outline'; w.growPaint(); });
      const row = page.locator('[data-testid="grow-outline"] .gb-olr', { hasText: 'seats table' });
      expect(await row.locator('.t').evaluate((t) => t.firstChild!.textContent + (t.querySelector('.un')?.textContent ?? ''))).toBe('seats table · unused');
      expect(await row.locator('.fd').textContent()).toBe('Feeds no journey');
      // On a light page and a dark one the seal's letters stand at least three to one against the clay, and a service's root
      // over the rim at least three to one against the page.
      await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.tree = 'grove'; w.growPaint(); });
      const colours = () => {
        const svg = document.querySelector('[data-testid="grow"] svg.gb[role=group]')!;
        const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); probe.style.fill = 'var(--pot)'; svg.append(probe);
        const ext = svg.querySelector('.rt.dep.ext .w')!, bg = getComputedStyle(document.body).backgroundColor;
        const out = { pot: getComputedStyle(probe).fill, seal: getComputedStyle(svg.querySelector('.seal .sm')!).fill, extFill: getComputedStyle(ext).fill, extEdge: getComputedStyle(ext).stroke, bg }; probe.remove(); return out;
      };
      const light = await page.evaluate(colours);
      await page.emulateMedia({ colorScheme: 'dark' });
      const fills = await page.evaluate(colours);
      const lum = (css: string) => {
        const m = css.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/), n = css.match(/rgba?\((\d+), (\d+), (\d+)/);
        const c = m ? m.slice(1, 4).map(Number) : n!.slice(1, 4).map((x) => Number(x) / 255);
        const lin = c.map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
        return .2126 * lin[0]! + .7152 * lin[1]! + .0722 * lin[2]!;
      };
      const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + .05) / (lo! + .05); };
      expect(ratio(fills.seal, fills.pot), JSON.stringify(fills)).toBeGreaterThanOrEqual(3);
      expect(ratio(light.seal, light.pot), JSON.stringify(light)).toBeGreaterThanOrEqual(3);
      expect(ratio(fills.extFill, fills.bg), JSON.stringify(fills)).toBeGreaterThanOrEqual(3);
      expect(ratio(fills.extEdge, fills.bg), JSON.stringify(fills)).toBeGreaterThanOrEqual(4.5);
      // A short project name carries its folder's too.
      const short = await page.evaluate(() => {
        const w = (0, eval)('({ gw, growPaint, state })'); w.state.config = { ...(w.state.config ?? {}), project: 'tg' }; w.gw.B.key = 'stale'; w.growPaint();
        return Array.from(document.querySelectorAll('[data-testid="grow"] svg.gb[role=group] .seal .sm')).map((t) => t.textContent).join('');
      });
      expect(short).toBe('tg · ' + repoName);
      await page.close();
    } finally { await browser.close(); }
  }, 120000);

  it('stands each recorded tree on a flared foot and radial surface roots, its trunk at least an eighth of its pot', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const name of ['plotline-seats.jsonl', 'tracegrove-max.jsonl']) for (const width of [1440, 390]) {
        const page = await growPage(browser, server.url, folded(name), width, width < 500);
        await page.waitForTimeout(400);
        footOk(await page.evaluate(ground), name + ' ' + width + 'px');
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  it('grows a small tree as a bonsai: a stout trunk tapering to a third of its foot, three or four radial roots with no store under it, and its canopy 55 to 65 hundredths of its height', async () => {
    // One journey through its first file only, with one happy path and one guard: the smallest tree with a branch, and no
    // dependency roots at all.
    const s = folded('plotline-seats.jsonl'), j = s.journeys[0]!, mine = s.scenarios.filter((x) => x.journey === j.id);
    s.journeys = [{ ...j, units: j.units.slice(0, 1) }];
    s.scenarios = [mine.find((x) => x.polarity === 'happy')!, mine.find((x) => x.polarity === 'guard')!];
    s.units = s.units.filter((u) => u.id === j.units[0]);
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 390]) {
        const page = await growPage(browser, server.url, s, width, width < 500);
        await page.waitForTimeout(2500);
        const r = await page.evaluate(() => {
          const w = (0, eval)('({ gw })'), L = w.gw.B.L, T = L.trees[0], svg = w.gw.B.svg as SVGSVGElement;
          // the drawing's own units (the layout's): the cushions as drawn, and the soil at the trunk's foot
          const toSvg = (el: SVGGraphicsElement, x: number, y: number) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!));
          const ys = Array.from(svg.querySelectorAll('.jg .pfill')).filter((e) => e.getBoundingClientRect().width > 0).flatMap((e) => { const b = (e as SVGGraphicsElement).getBBox(); return [toSvg(e as SVGGraphicsElement, b.x, b.y).y, toSvg(e as SVGGraphicsElement, b.x + b.width, b.y + b.height).y]; });
          const X = L.xs[0], soil = L.sy(X), top = Math.min(...ys), low = Math.max(...ys);
          const up = (y: number) => { let k = 0; while (k < T.tp.length - 1 && T.tp[k]![1]! > -y) k++; return T.tw[k]!; };
          const nebari = L.roots.filter((q: { id: string | null; tree: number }) => !q.id && q.tree === 0).map((q: { pts: number[][] }) => Math.abs(q.pts.at(-1)![0]! - X) / (L.potL / 2));
          return { trees: L.trees.length, deps: L.roots.filter((q: { id: string | null }) => q.id).length, canopy: (low - top) / (soil - top), apex: T.tw.at(-1), foot: T.tw[0], cal: up(T.D), potL: L.potL, nebari };
        });
        const at = width + 'px';
        expect(r.trees, at).toBe(1);
        expect(r.deps, at).toBe(0);
        // the canopy, from the crown's top to the lowest cushion's underside, is 55 to 65 hundredths of the tree's height
        expect(r.canopy, at + ' canopy').toBeGreaterThanOrEqual(.55);
        expect(r.canopy, at + ' canopy').toBeLessThanOrEqual(.65);
        // the trunk tapers to a third of its foot or less, and one caliper up it is at least twelve hundredths of the pot
        expect(r.apex, at + ' apex').toBeLessThanOrEqual(r.foot / 3);
        expect(r.apex, at + ' apex').toBeLessThanOrEqual(r.cal / 3);
        expect(r.cal / r.potL, at + ' trunk').toBeGreaterThanOrEqual(.12);
        // three or four buttress roots though nothing roots under it, each reaching six tenths of the pot's half-length
        expect(r.nebari.length, at + ' nebari').toBeGreaterThanOrEqual(3);
        expect(r.nebari.length, at + ' nebari').toBeLessThanOrEqual(4);
        for (const n of r.nebari) expect(n, at + ' root reach').toBeGreaterThanOrEqual(.6);
        footOk(await page.evaluate(ground), 'small tree ' + at);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** A grow folded from a recorded discovery log: plotline-billing (two journeys, one scenario failed, Minimum) and tracegrove
   *  itself (two journeys through twelve parts, Max, nothing run yet). */
  const folded = (name: string) => {
    const s = freshGrow();
    for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', name), 'utf8').split('\n')) if (line.trim()) applyGrow(s, JSON.parse(line) as GrowEvent);
    return s;
  };
  const recorded = [['plotline-seats.jsonl', 'plotline'], ['tracegrove-max.jsonl', 'tracegrove']] as const;

  it('names every hop of a lit leaf’s route, reached or not, at every width, and leads a burl with the hop the leaf exercises', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 768, 390]) {
          const page = await growPage(browser, server.url, state, width, width < 500);
          await page.waitForTimeout(2500);
          const seen = await page.evaluate(() => {
            const w = (0, eval)('({ gw, gbLight })'), B = w.gw.B, S = w.gw.state;
            const unit = (id: string) => S.units.find((u: { id: string }) => u.id === id);
            // a name cut short to fit still starts the way the file's name does
            const says = (text: string, label: string) => text.startsWith(label) || (text.includes('…') && label.startsWith(text.slice(0, text.indexOf('…'))));
            const svg = B.svg.getBoundingClientRect(), out: string[] = [];
            let leaves = 0;
            for (const id of Object.keys(B.leaf)) {
              const leaf = B.leaf[id] as SVGElement;
              if (leaf.classList.contains('gone') || !leaf.getBoundingClientRect().width) continue;
              const x = S.scenarios.find((q: { id: string }) => q.id === id), j = S.journeys.find((q: { id: string }) => q.id === x.journey);
              if (!j) continue;
              leaves++;
              w.gw.hov = 's:' + id; w.gbLight();
              for (const u of j.units as string[]) {
                const part = unit(u);
                if (part.root) { const t = B.root[u] && B.root[u].querySelector('.rlbl'); if (!t || !t.getBoundingClientRect().width) out.push(id + ': no name for ' + part.label); continue; }
                const k = Object.keys(B.klbl).find((q) => B.knot[q] && B.knot[q].__ids.includes(u)), t = k ? B.klbl[k] as SVGTextElement : null;
                const r = t && t.classList.contains('on') ? t.getBoundingClientRect() : null;
                if (!t || !r || !r.width) { out.push(id + ': no name for ' + part.label); continue; }
                if (r.left < svg.left - .5 || r.right > svg.right + .5 || r.top < svg.top - .5 || r.bottom > svg.bottom + .5) out.push(id + ': ' + part.label + ' cut off by the edge');
                if (!says(t.textContent ?? '', B.knot[k!].__ids.length > 1 && u !== x.unit ? (t.textContent ?? '') : part.label)) out.push(id + ': ' + part.label + ' named "' + t.textContent + '"');
              }
              // the names on the route never sit on one another, nor on a leaf
              const meet = (p: DOMRect, q: DOMRect, m: number) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > m && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > m;
              const on = Object.values(B.klbl).filter((t) => (t as SVGElement).classList.contains('on')) as SVGTextElement[], all = on.map((t) => t.getBoundingClientRect());
              for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) if (meet(all[a]!, all[b]!, .5)) out.push(id + ': two names overlap');
              const blades = Array.from(B.svg.querySelectorAll('.gb-lf:not(.gone) .blade') as NodeListOf<Element>).map((e) => e.getBoundingClientRect()).filter((r) => r.width);
              on.forEach((t, a) => { if (blades.some((r) => meet(all[a]!, r, 1.5))) out.push(id + ': ' + t.textContent + ' sits on a leaf'); });
            }
            w.gw.hov = null; w.gbLight();
            return { leaves, out };
          });
          expect(seen.leaves, name + ' ' + width).toBeGreaterThan(3);
          expect(seen.out, name + ' ' + width).toEqual([]);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  }, 180000);

  it('sets each card by what it explains, never over a name or with a hairline across one, and has the card and the tree agree on what a leaf runs', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 1024, 768]) {
          const page = await growPage(browser, server.url, state, width);
          await page.waitForTimeout(2500);
          const ins = page.getByTestId('grow-inspector'), inspector = await ins.count() ? await ins.textContent() : null;
          // every leaf, root and knot in turn, and later the same with a leaf pinned; at 1440 a card also keeps off every cushion
          const cards = () => page.evaluate((wide: boolean) => {
            const w = (0, eval)('({ gw, gbHover })'), B = w.gw.B, L = B.L, out: string[] = [];
            const m = (B.svg as SVGSVGElement).getScreenCTM()!, px = (p: number[]) => [m.a * p[0]! + m.c * p[1]! + m.e, m.b * p[0]! + m.d * p[1]! + m.f];
            // does the segment a-b pass through the box r (Liang-Barsky)?
            const cross = (a: number[], b: number[], r: DOMRect) => {
              let t0 = 0, t1 = 1; const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
              for (const [p, q] of [[-dx, a[0]! - r.left], [dx, r.right - a[0]!], [-dy, a[1]! - r.top], [dy, r.bottom - a[1]!]] as const) {
                if (p === 0) { if (q < 0) return false; continue; }
                const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
              }
              return t1 - t0 > .02;
            };
            const things: Array<[string, Element]> = [];
            for (const id of Object.keys(B.leaf)) if (!B.leaf[id].classList.contains('gone') && B.leaf[id].getBoundingClientRect().width) things.push(['s:' + id, B.leaf[id]]);
            for (const id of Object.keys(B.root)) things.push(['u:' + id, B.root[id]]);
            for (const k of Object.keys(B.klbl)) if (B.knot[k]) things.push(['u:' + B.knot[k].__ids[0], B.knot[k]]);
            const meet = (c: DOMRect, r: DOMRect) => Math.min(c.right, r.right) - Math.max(c.left, r.left) > .5 && Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top) > .5;
            let cards = 0;
            // a card covers no name, the faded ones included, no word of a journey's and no root's name, and no hairline crosses one
            const look = (k: string, c: DOMRect, kl: Element | null, lead: number[][]) => {
              const names = [...Object.values(B.klbl) as Element[]].filter((t) => t.classList.contains('on') || t.classList.contains('kdim')).concat(Array.from(B.svg.querySelectorAll('.rlbl, .lbl text') as NodeListOf<Element>)).map((t) => [t, t.getBoundingClientRect()] as const).filter(([, r]) => r.width);
              for (const [t, r] of names) {
                if (meet(c, r)) out.push(k + ': card covers ' + (t.classList.contains('kdim') ? 'the faded ' : '') + t.textContent);
                for (let i = 1; i < lead.length; i++) if (t !== kl && cross(lead[i - 1]!, lead[i]!, r)) out.push(k + ': hairline crosses ' + t.textContent);
              }
              // and past its first 12 px the hairline keeps 12 px off every word but the thing's own name (less a pixel, for
              // where the line is rounded)
              const own = k.startsWith('u:') && B.root[k.slice(2)] ? Array.from(B.root[k.slice(2)].querySelectorAll('.rlbl') as NodeListOf<Element>) : [];
              for (const [t, r] of names) {
                if (t === kl || own.includes(t)) continue;
                let near = Infinity;
                for (let i = 1; i < lead.length; i++) {
                  const a = lead[i - 1]!, b = lead[i]!, n = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
                  for (let s = 0; s <= n; s += 1) {
                    const x = a[0]! + (b[0]! - a[0]!) * s / (n || 1), y = a[1]! + (b[1]! - a[1]!) * s / (n || 1);
                    if (Math.hypot(x - lead[0]![0]!, y - lead[0]![1]!) >= 12) near = Math.min(near, Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)));
                  }
                }
                if (near < 11) out.push(k + ': hairline ' + near.toFixed(1) + ' px from ' + t.textContent);
              }
              if (wide) for (const e of Array.from(B.svg.querySelectorAll('.pfill') as NodeListOf<Element>)) { const r = e.getBoundingClientRect(); if (r.width && meet(c, r)) out.push(k + ': card on a cushion of ' + (e.closest('[data-pad]') || e).getAttribute('data-pad')); }
            };
            for (const [k, el] of things) {
              w.gbHover(k, el);
              const tip = B.tip as HTMLElement;
              // (a pinned thing's card is the inspector beside the tree, where there is one)
              if (tip.hidden) { if (k !== w.gw.pinned || L.narrow) out.push(k + ': no card'); continue; }
              cards++;
              if (tip.classList.contains('dock') || !tip.parentElement!.contains(B.svg)) out.push(k + ': card not over the tree');
              const c = tip.getBoundingClientRect(), d = B.lead.getAttribute('d') || '';
              const lead = (d.match(/-?[\d.]+/g) || []).map(Number).reduce((a: number[][], v: number, i: number) => { if (i % 2) a[a.length - 1]!.push(v); else a.push([v]); return a; }, []).map(px);
              const kk = k.startsWith('u:') && B.knot[k.slice(2)] ? Object.keys(B.klbl).find((q) => B.knot[q] === B.knot[k.slice(2)]) : undefined, kl: Element | null = kk ? B.klbl[kk] : null;
              look(k, c, kl, lead);
              // a knot's card hangs off its name, which stands out, so only one line runs to the knot: the name's own
              if (kl && kl.classList.contains('on') && !kl.classList.contains('pt')) out.push(k + ': its name does not stand out');
              if (kl && kl.classList.contains('on') && lead.length) {
                const r = kl.getBoundingClientRect(), a = lead[0]!;
                if (a[0]! < r.left - 3 || a[0]! > r.right + 3 || a[1]! < r.top - 3 || a[1]! > r.bottom + 3) out.push(k + ': second line to the knot');
              }
              // a root's card sits by where the root crosses the rim
              const rr = k.startsWith('u:') && B.root[k.slice(2)] ? L.roots.find((q: { id: string }) => q.id === k.slice(2)) : null;
              if (rr) {
                const P0 = L.potC - L.potL / 2, P1 = L.potC + L.potL / 2, rim = px(rr.pts.find((p: number[]) => p[0]! < P0 || p[0]! > P1) || rr.pts[0]);
                const dx = Math.max(c.left - rim[0]!, 0, rim[0]! - c.right), dy = Math.max(c.top - rim[1]!, 0, rim[1]! - c.bottom);
                if (Math.hypot(dx, dy) > 90) out.push(k + ': card ' + Math.round(Math.hypot(dx, dy)) + 'px from its rim');
              }
            }
            w.gbHover(null);
            // on a phone the pinned thing's card stays under the drawing, and covers nothing in it either
            if (w.gw.pinned && !(B.tip as HTMLElement).hidden) look(w.gw.pinned + ' pinned', B.tip.getBoundingClientRect(), null, []);
            return { cards, out };
          }, width >= 1440);
          const seen = await cards();
          expect(seen.cards, name + ' ' + width).toBeGreaterThan(8);
          expect(seen.out, name + ' ' + width).toEqual([]);
          // the inspector, where there is one beside the tree, keeps what it said: a card floats over the tree
          if (inspector !== null) expect(await ins.textContent(), name + ' ' + width).toBe(inspector);
          // a leaf pinned as a click pins it, then every card again
          await page.evaluate(() => {
            const w = (0, eval)('({ gw, growPaint, gbTipOff })'), B = w.gw.B, id = Object.keys(B.leaf).find((q) => !B.leaf[q].classList.contains('gone') && B.leaf[q].getBoundingClientRect().width);
            w.gw.pinned = 's:' + id; if (!B.L.narrow) w.gbTipOff(B); w.growPaint();
          });
          await page.waitForTimeout(400);
          const pinned = await cards();
          expect(pinned.cards, name + ' ' + width + ' pinned').toBeGreaterThan(8);
          expect(pinned.out, name + ' ' + width + ' pinned').toEqual([]);
          await page.close();
        }
      }
      // A leaf that checks one hop of a journey says which. The hops after it are not its route: the card mutes them, and on
      // the tree they stay plain wood, named in muted ink, with no grey dots and no faded knots (those mean a break before them).
      const state = folded('tracegrove-max.jsonl');
      const page = await growPage(browser, server.url, state, 1440);
      await page.waitForTimeout(2500);
      const one = await page.evaluate(() => {
        const w = (0, eval)('({ gw, gbHover })'), B = w.gw.B, S = w.gw.state;
        const x = S.scenarios.find((q: { id: string; scenarioKind: string; journey: string | null; unit: string }) => B.leaf[q.id] && !B.leaf[q.id].classList.contains('gone') && q.scenarioKind !== 'happy' && q.journey && S.journeys.find((j: { id: string }) => j.id === q.journey).units.indexOf(q.unit) === 0);
        const j = S.journeys.find((q: { id: string }) => q.id === x.journey);
        w.gbHover('s:' + x.id, B.leaf[x.id]);
        const tip = B.tip as HTMLElement, label = (id: string) => S.units.find((u: { id: string }) => u.id === id).label;
        const faint = j.units.slice(1).filter((u: string) => !S.units.find((q: { id: string; root: boolean }) => q.id === u).root).map((u: string) => Object.keys(B.klbl).find((k) => B.knot[k] && B.knot[k].__ids.includes(u))).filter((k: string | undefined) => k && !B.knot[k].__ids.includes(x.unit));
        const out = {
          text: tip.textContent ?? '', want: 'Exercises ' + label(x.unit) + ' (hop 1 of ' + j.units.length + ')',
          ink: Array.from(tip.querySelectorAll('.path .gw-hop.hit')).map((e) => e.textContent!.replace(/\s*›\s*$/, '')), muted: tip.querySelectorAll('.path .gw-hop.un').length, n: j.units.length,
          first: label(x.unit), dots: (B.sapX.getAttribute('d') || '').length, faint: faint.length, unreached: faint.filter((k: string) => B.knot[k].classList.contains('unreached')).length,
          opacity: faint.length ? getComputedStyle(B.knot[faint[0]]).opacity : '',
          oos: faint.filter((k: string) => B.klbl[k].classList.contains('on') && B.klbl[k].classList.contains('oos') && getComputedStyle(B.klbl[k]).fill === getComputedStyle(tip.querySelector('.path .gw-hop.un .hl')!).color).length,
          named: faint.filter((k: string) => B.klbl[k].classList.contains('on')).length,
        };
        w.gbHover(null);
        return out;
      });
      expect(one.text).toContain(one.want);
      expect(one.ink).toEqual([one.first]);
      expect(one.muted).toBe(one.n - 1);
      expect(one.dots).toBe(0);
      expect(one.faint).toBeGreaterThan(0);
      expect(one.unreached).toBe(0);
      expect(Number(one.opacity)).toBeGreaterThan(.45);
      expect(one.named).toBeGreaterThan(0);
      expect(one.oos).toBe(one.named);
      // At rest a tree of many parts still carries a few names.
      const rest = await page.evaluate(() => document.querySelectorAll('[data-testid="grow"] .klbl.on').length);
      expect(rest).toBeGreaterThanOrEqual(3);
      // Never reached is drawn as small grey dots with no ring, the key's swatch the same; a cut is marked in neutral ink, never
      // in the red that means failed.
      const look = await page.evaluate(() => {
        const w = (0, eval)('({ gw })'), B = w.gw.B, rgb = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const dots = getComputedStyle(B.sapX), key = document.querySelector('[data-testid="grow"] .gw-legend path.rdots');
        return { dash: dots.strokeDasharray, cap: dots.strokeLinecap, key: key ? getComputedStyle(key).strokeDasharray : null, cut: Array.from(B.svg.querySelectorAll('.cutmk, .cuttag, .gb-lf .nick') as NodeListOf<Element>).map((e) => rgb(getComputedStyle(e).stroke !== 'none' ? getComputedStyle(e).stroke : getComputedStyle(e).fill)) };
      });
      expect(look.dash.replace(/px/g, '').split(/[ ,]+/).map(Number)[0]).toBe(0);
      expect(look.cap).toBe('round');
      expect(look.key).not.toBeNull();
      expect(look.key!.replace(/px/g, '').split(/[ ,]+/).map(Number)[0]).toBe(0);
      expect(look.cut.length).toBeGreaterThan(0);
      for (const [r, g, b] of look.cut) expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!), 'cut ink ' + [r, g, b]).toBeLessThan(30);
      await page.close();
    } finally { await browser.close(); }
  }, 240000);
  it('runs a lit route as sap inside the wood: an amber band about three tenths of the girth, and where it broke the wood itself turned red, centred, feathered, crisp, cut square and short of the next boss, and no red in the wood at rest', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await growPage(browser, server.url, folded('plotline-seats.jsonl'), 1440);
      await page.waitForTimeout(2500);
      const probe = () => {
        const w = (0, eval)('({ gw, gbHover, gbRoute })'), B = w.gw.B, S = w.gw.state;
        const wood = Array.from(document.querySelector('#gb-wood' + B.N)!.children) as SVGGeometryElement[], pt = (B.svg as SVGSVGElement).createSVGPoint();
        const inside = (els: SVGGeometryElement[]) => (x: number, y: number) => { pt.x = x; pt.y = y; return els.some((e) => e.isPointInFill(pt)); };
        // how far the shape reaches either side of p along the normal n
        const reach = (f: (x: number, y: number) => boolean, p: number[], n: number[]) => [1, -1].map((s) => { let a = -1; for (let t = 0; t < 40; t += .25) { if (f(p[0]! + s * n[0]! * t, p[1]! + s * n[1]! * t)) a = t; else break; } return a; });
        const normal = (q: number[][], i: number) => { const a = q[i]!, b = q[i + 1]!, l = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) || 1; return [-(b[1]! - a[1]!) / l, (b[0]! - a[0]!) / l]; };
        const x = S.scenarios.find((q: { id: string }) => B.leaf[q.id] && S.run[q.id] && S.run[q.id].st === 'fail');
        w.gbHover('s:' + x.id, B.leaf[x.id]);
        const R = w.gbRoute(x), reds = Array.from(B.gRed.querySelectorAll('path.sapw')) as SVGGeometryElement[];
        const red: number[][] = [];
        for (let i = Math.floor(R.red.length * .3); i <= Math.ceil(R.red.length * .7) && i < R.red.length - 1; i++) {
          const n = normal(R.red, i), [w1, w2] = reach(inside(wood), R.red[i], n), [r1, r2] = reach(inside(reds), R.red[i], n);
          red.push([w1! + w2!, r1! + r2!, Math.abs((r1! - r2!) - (w1! - w2!)) / 2, Math.min(w1! - r1!, w2! - r2!)]);
        }
        const glow: number[][] = [];
        for (let i = 0; i < R.main.length - 1; i++) {
          const n = normal(R.main, i), [w1, w2] = reach(inside(wood), R.main[i], n), [g1, g2] = reach(inside([B.sapR]), R.main[i], n);
          if (w1! > 0 && w2! > 0 && w1! + w2! >= 8 && w1! + w2! <= 30) glow.push([w1! + w2!, g1! + g2!, Math.min(w1! - g1!, w2! - g2!)]);
        }
        // outside a knot's boss by at least d: the boss is an ellipse ra along the grain, rb across it
        const off = (q: number[], g: { p: number[]; n: number[]; tg: number[]; ra: number; rb: number }, d: number) => { const u = (q[0]! - g.p[0]!) * g.tg[0]! + (q[1]! - g.p[1]!) * g.tg[1]!, v = (q[0]! - g.p[0]!) * g.n[0]! + (q[1]! - g.p[1]!) * g.n[1]!; return (u / (g.ra + d)) ** 2 + (v / (g.rb + d)) ** 2 >= 1; };
        const geos = Object.keys(B.knot).map((k) => B.knot[k].__geo).filter(Boolean);
        const brk = geos.slice().sort((a: { p: number[] }, b: { p: number[] }) => Math.hypot(a.p[0]! - R.red[0][0], a.p[1]! - R.red[0][1]) - Math.hypot(b.p[0]! - R.red[0][0], b.p[1]! - R.red[0][1]))[0];
        const end = R.red[R.red.length - 1];
        const stops = reds.map((e) => Array.from(document.querySelector(e.getAttribute('fill')!.slice(4, -1))!.querySelectorAll('stop')).map((q) => Number(q.getAttribute('stop-opacity'))));
        const cs = (e: Element) => getComputedStyle(e).fill, probeFill = (v: string) => { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.style.fill = v; B.svg.append(r); const f = getComputedStyle(r).fill; r.remove(); return f; };
        // the red's outline, walked every half pixel: none of it outside the limb's bark
        let outline = 0, outside = 0;
        for (const e of reds as SVGPathElement[]) { const n = e.getTotalLength(); for (let s = 0; s < n; s += .5) { const q = e.getPointAtLength(s); outline++; if (!inside(wood)(q.x, q.y)) outside++; } }
        // each end cut square across the limb: where the red begins, at offsets across it, along the limb's own tangent there
        const square = (from: 'start' | 'end') => {
          const q = R.red as number[][], i = from === 'start' ? 0 : q.length - 1, j = from === 'start' ? Math.min(q.length - 1, 3) : Math.max(0, q.length - 4);
          const a = q[i]!, l = Math.hypot(q[j]![0]! - a[0]!, q[j]![1]! - a[1]!) || 1, t = [(q[j]![0]! - a[0]!) / l, (q[j]![1]! - a[1]!) / l], n = [-t[1]!, t[0]!];
          const f = inside(reds), c = [a[0]! + t[0]! * 4, a[1]! + t[1]! * 4], [h1, h2] = reach(f, c, n), h = Math.min(h1!, h2!);
          const first = (v: number) => { for (let u = -12; u <= 12; u += .05) if (f(a[0]! + t[0]! * u + n[0]! * v, a[1]! + t[1]! * u + n[1]! * v)) return u; return NaN; };
          const u0 = first(0); let worst = 0;
          for (const k of [-.7, -.35, .35, .7]) worst = Math.max(worst, Math.abs(first(k * h) - u0) / Math.abs(k * h));
          return h > 0 && isFinite(worst) ? Math.atan(worst) * 180 / Math.PI : 90;
        };
        const m = (B.svg as SVGSVGElement).getScreenCTM()!, mid = R.red.slice(Math.floor(R.red.length * .3), Math.ceil(R.red.length * .7) + 1).map((q: number[]) => { const s = new DOMPoint(q[0], q[1]).matrixTransform(m); return [s.x, s.y]; });
        const out = { red, glow, stops, dots: (B.sapX.getAttribute('d') || '').length, start: off(R.red[0], brk, 0), clear: geos.filter((g: unknown) => g !== brk).every((g: { p: number[]; n: number[]; tg: number[]; ra: number; rb: number }) => off(end, g, 4)), sap: cs(B.sapR), wood: probeFill('var(--wood)'), filters: reds.map((e) => getComputedStyle(e).filter), outline, outside, ends: [square('start'), square('end')], mid };
        return out;
      };
      // At rest, nothing pointed at and nothing pinned: no red stroke in the wood, and the wood where the scenario broke shows
      // no red, on its spine or either side of it (the knot's own crack and name stay red; they are not on this stretch)
      const rest = () => {
        const w = (0, eval)('({ gw, gbRoute, gbGirth })'), B = w.gw.B, S = w.gw.state;
        const x = S.scenarios.find((q: { id: string }) => B.leaf[q.id] && S.run[q.id] && S.run[q.id].st === 'fail');
        const R = w.gbRoute(x), q = R.red as number[][];
        let m = (B.svg as SVGSVGElement).getScreenCTM()!; const top = new DOMPoint(q[0]![0], q[0]![1]).matrixTransform(m); window.scrollBy(0, top.y - 400); m = (B.svg as SVGSVGElement).getScreenCTM()!;
        const spots: number[][] = [];
        for (let i = 0; i < q.length - 1; i++) {
          const a = q[i]!, b = q[i + 1]!, l = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) || 1, n = [-(b[1]! - a[1]!) / l, (b[0]! - a[0]!) / l], G = w.gbGirth(B, a);
          for (const k of [-.15, 0, .15]) { const s = new DOMPoint(a[0]! + n[0]! * k * G, a[1]! + n[1]! * k * G).matrixTransform(m); spots.push([s.x, s.y]); }
        }
        return { reds: B.gRed.querySelectorAll('path.sapw').length + (B.sapW.getAttribute('d') ? 1 : 0), spots };
      };
      const hot = (c: number[]) => c[0]! - Math.max(c[1]!, c[2]!) > 60;
      const lum = (css: string) => {
        const m = css.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/), n = css.match(/rgba?\((\d+), (\d+), (\d+)/);
        const c = m ? m.slice(1, 4).map(Number) : n!.slice(1, 4).map((x) => Number(x) / 255);
        const lin = c.map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
        return .2126 * lin[0]! + .7152 * lin[1]! + .0722 * lin[2]!;
      };
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForTimeout(300);
        const at = await page.evaluate(rest);
        expect(at.reds, scheme + ' a red stroke at rest').toBe(0);
        const still = await pixels(browser, (await page.screenshot()).toString('base64'), at.spots);
        expect(still.filter(hot), scheme + ' red in the wood at rest').toEqual([]);
        const r = await page.evaluate(probe);
        await page.waitForTimeout(300);
        // (lit, the same look finds the red on its spine: the look at rest above is one that sees red where there is red)
        const lit = await pixels(browser, (await page.screenshot()).toString('base64'), r.mid);
        expect(lit.filter(hot).length, scheme + ' red on the spine when lit ' + JSON.stringify(lit)).toBeGreaterThan(0);
        await page.evaluate(() => (0, eval)('gbHover')(null));
        // The red is the limb's own wood: inside its body, about half its girth wide, on the spine, a crisp stroke with no
        // blur, every point of its outline inside the bark, and each end cut square across the limb.
        expect(r.red.length, scheme).toBeGreaterThan(0);
        for (const [wood, red, skew, edge] of r.red) {
          expect(red! / wood!, scheme + ' red/girth').toBeGreaterThanOrEqual(.4);
          expect(red! / wood!, scheme + ' red/girth').toBeLessThanOrEqual(.6);
          expect(skew!, scheme + ' red off the spine').toBeLessThanOrEqual(1.5);
          expect(skew! / wood!, scheme + ' red off the spine, of the girth').toBeLessThanOrEqual(.1);
          expect(edge!, scheme + ' red outside the wood').toBeGreaterThanOrEqual(0);
        }
        expect(r.filters.length, scheme).toBeGreaterThan(0);
        for (const f of r.filters) expect(f, scheme + ' red blurred').toBe('none');
        expect(r.outline, scheme).toBeGreaterThan(10);
        expect(r.outside, scheme + ' red outline outside the bark').toBe(0);
        for (const a of r.ends) expect(a, scheme + ' red end off the limb’s normal (deg)').toBeLessThanOrEqual(15);
        // It starts past the boss of the hop where it broke and stops four pixels short of any other boss, faded in and out.
        expect(r.start, scheme).toBe(true);
        expect(r.clear, scheme).toBe(true);
        expect(r.stops.length, scheme).toBeGreaterThan(0);
        for (const s of r.stops) { expect(s[0], scheme).toBe(0); expect(s[s.length - 1], scheme).toBe(0); expect(Math.max(...s), scheme).toBe(1); }
        // Past the break the route is grey dots.
        expect(r.dots, scheme).toBeGreaterThan(0);
        // The glow is a band inside the wood about three tenths of its girth, amber, standing out from the bark.
        expect(r.glow.length, scheme).toBeGreaterThan(3);
        for (const [wood, glow, edge] of r.glow) {
          expect(glow! / wood!, scheme + ' glow/girth ' + wood).toBeGreaterThanOrEqual(.18);
          expect(glow! / wood!, scheme + ' glow/girth ' + wood).toBeLessThanOrEqual(.42);
          expect(edge!, scheme + ' glow outside the wood').toBeGreaterThanOrEqual(0);
        }
        const [hi, lo] = [lum(r.sap), lum(r.wood)].sort((a, b) => b - a);
        expect((hi! + .05) / (lo! + .05), scheme + ' ' + r.sap + ' on ' + r.wood).toBeGreaterThanOrEqual(2.5);
      }
      await page.close();
    } finally { await browser.close(); }
  }, 120000);
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
    const out = { leaves: 0, hung: 0, bad: [] as string[], cush: [] as { tree: string; pid: string; crown: boolean; role: string; n: number; a: number; h: number }[], pads: [] as { tree: string; pid: string; h: number; PW: number; L: number; n: number; tier: number }[] };
    // each pad's height on its trunk (the crown's at the top), and the tier that sets its width: 1 at the lowest branch, .7 at
    // the apex
    const hOf = (P: any) => (P.crown ? 1 : P.b.h);
    for (const pid in B.pad) {
      const P = B.pad[pid], tree = P.el.closest('svg')?.id ?? '', mine = Object.values(B.pad).filter((Q: any) => Q.tree === P.tree) as any[];
      const lo = Math.min(...mine.map(hOf)), n = P.geo.cs.reduce((a: number, c: any) => a + c.ids.length, 0);
      out.pads.push({ tree: tree + ':' + P.tree, pid, h: hOf(P), PW: P.geo.PW, L: P.geo.L, n, tier: mine.length > 1 ? 1 - 0.3 * (hOf(P) - lo) / ((1 - lo) || 1) : 1 });
    }
    const bad = (pid: string, what: string, v?: unknown) => out.bad.push(pid + ': ' + what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    for (const pid in B.pad) {
      const P = B.pad[pid], g = P.geo, L: number = g.L, W: number = g.W, kept: [string, number[]][] = [];
      g.cs.forEach((c: any, k: number) => {
        if (c.role === 'shoulder' && !c.ids.length) bad(pid, 'a shoulder with no guard', k);
        if (c.ids.length && L > 0.55 * c.a) bad(pid, 'leaf longer than a quarter of its cushion', [L, c.a]);
        out.cush.push({ tree: (P.el.closest('svg')?.id ?? '') + ':' + P.tree, pid, crown: !!P.crown, role: c.role, n: c.ids.length, a: c.a, h: c.h });
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
        // a failure hangs beneath its cushion from a twig that shows, run out at least four pixels under the cushion's
        // underside, on a straight stem of ten pixels; where it has no room there it sits on the cushion's lower rim on a short
        // stem. A leaf on a cushion has its foot tucked in and its middle clear, so its state reads
        if (hang) {
          const seated = [[0, 0], [0.45 * L, 0], [-0.45 * L, 0]].some(([x, y]) => fill.isPointInFill(usr(fill, scr(lf, x!, y!))));
          if (seated) { const st = Math.hypot(end[0]! - pts[0]![0]!, end[1]! - pts[0]![1]!); if (st > 0.5 * g.Hc + 0.01) bad(pid, 'stem longer than half the crest', [id, st, g.Hc]); }
          else {
            const A = pts.reduce((a: number[], q, i) => (a.push(i ? a[i - 1]! + Math.hypot(q[0]! - pts[i - 1]![0]!, q[1]! - pts[i - 1]![1]!) : 0), a), []), d = A[A.length - 1]! - 10;
            let i = 1; while (i < A.length - 1 && A[i]! < d) i++;
            const f = Math.max(0, Math.min(1, (d - A[i - 1]!) / ((A[i]! - A[i - 1]!) || 1))), base = [pts[i - 1]![0]! + (pts[i]![0]! - pts[i - 1]![0]!) * f, pts[i - 1]![1]! + (pts[i]![1]! - pts[i - 1]![1]!) * f];
            const bb = fill.getBBox(), low = usr(tw, scr(fill, bb.x + bb.width / 2, bb.y + bb.height)), hw = (tw.__w[i] ?? 1) / 2;
            if (Math.hypot(end[0]! - base[0]!, end[1]! - base[1]!) < 9.5) bad(pid, 'hanging stem not straight', id);
            if (base[1]! - hw - low.y < 4 - 0.01) bad(pid, 'hanging twig closer than four pixels under its cushion', [id, base[1]! - hw - low.y]);
          }
        }
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

  it('keeps every card’s words inside its border, sizes it to its longest name, sets its prose in the UI sans, and never ends one of its lines on a dot', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 768, 390]) {
          const phone = width < 480;
          const page = await growPage(browser, server.url, state, width, phone);
          await page.waitForTimeout(2500);
          const seen = await page.evaluate((phone) => {
            const w = (0, eval)('({ gw, gbHover, growPaint })'), B = w.gw.B, out: string[] = [];
            const things: Array<[string, Element]> = [];
            for (const id of Object.keys(B.leaf)) if (!B.leaf[id].classList.contains('gone') && B.leaf[id].getBoundingClientRect().width) things.push(['s:' + id, B.leaf[id]]);
            for (const id of Object.keys(B.root)) things.push(['u:' + id, B.root[id]]);
            for (const k of Object.keys(B.klbl)) if (B.knot[k]) things.push(['u:' + B.knot[k].__ids[0], B.knot[k]]);
            let cards = 0;
            const check = (k: string) => {
              const tip = w.gw.B.tip as HTMLElement;
              if (!tip || tip.hidden) { out.push(k + ': no card'); return; }
              cards++;
              const cs = getComputedStyle(tip), r = tip.getBoundingClientRect(), px = (v: string) => parseFloat(v) || 0;
              const L = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft) - 1, R = r.right - px(cs.borderRightWidth) - px(cs.paddingRight) + 1, T = r.top + px(cs.borderTopWidth) - 1, Bo = r.bottom - px(cs.borderBottomWidth) + 1;
              if (tip.scrollWidth > tip.clientWidth + .5) out.push(k + ': its words scroll sideways');
              // every line of every text in the card stays inside its padding (a dot clipped at a line's start is meant to be out of view)
              const walk = document.createTreeWalker(tip, NodeFilter.SHOW_TEXT);
              for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                const el = n.parentElement!;
                if (!(n.textContent ?? '').trim() || el.closest('.sp') || el.closest('.gb-x')) continue;
                const rg = document.createRange(); rg.selectNodeContents(n);
                if (Array.from(rg.getClientRects()).some((q) => q.width > .5 && (q.left < L || q.right > R || q.top < T || q.bottom > Bo))) out.push(k + ': "' + (n.textContent ?? '').trim().slice(0, 40) + '" runs over its border');
              }
              // a dot between facts goes with the fact after it, so no line ends on one
              for (const sp of Array.from(tip.querySelectorAll('.gw-sl .sp'))) {
                const t = sp.nextElementSibling, a = sp.getBoundingClientRect(), b = t ? t.getClientRects()[0] : null;
                if (b && Math.abs(a.top - b.top) > 4) out.push(k + ': a line ends on a dot in "' + (sp.parentElement!.parentElement!.textContent ?? '') + '"');
              }
              // prose in the UI sans; mono only for the paths and routes it names
              if (/mono/i.test(cs.fontFamily)) out.push(k + ': card set in mono');
              for (const st of Array.from(tip.querySelectorAll('.st'))) if (/mono/i.test(getComputedStyle(st).fontFamily)) out.push(k + ': "' + (st.textContent ?? '').slice(0, 30) + '" set in mono');
              for (const p of Array.from(tip.querySelectorAll('.path'))) if (!/mono/i.test(getComputedStyle(p).fontFamily)) out.push(k + ': its path is not in mono');
              // beside the tree, as wide as its longest name needs, within 280 to 380 px; under it, as wide as the tree, and on a phone with a Close of 44 px
              const below = tip.classList.contains('below');
              if (!below && (r.width < 279.5 || r.width > 380.5)) out.push(k + ': card ' + Math.round(r.width) + ' px wide');
              if (phone) { const x = tip.querySelector('.gb-x'), xr = x ? x.getBoundingClientRect() : null; if (!xr || xr.width < 43.5 || xr.height < 43.5) out.push(k + ': no Close of 44 px'); }
            };
            for (const [k, el] of things) {
              if (phone) { w.gw.hov = null; w.gw.pinned = k; w.growPaint(); } else w.gbHover(k, el);
              check(k);
            }
            if (phone) { w.gw.pinned = null; w.growPaint(); } else w.gbHover(null);
            return { cards, out };
          }, phone);
          expect(seen.cards, name + ' ' + width).toBeGreaterThan(8);
          expect(seen.out, name + ' ' + width).toEqual([]);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  }, 240000);

  it('wraps a pinned card’s proof lanes inside its panel: each chip on one line, each note within its row, nothing past the panel’s edge, pinned and with Max pointed at', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 1024]) {
        const page = await growPage(browser, server.url, folded('plotline-seats.jsonl'), width);
        await page.waitForTimeout(2500);
        // pin the leaf whose proof lane names the provider's sandbox key
        const sid = await page.evaluate(() => {
          const w = (0, eval)('({ gw, growPaint })'), B = w.gw.B;
          const x = w.gw.state.scenarios.find((q: { id: string; realKey: string | null }) => q.realKey && /STRIPE_/.test(q.realKey) && B.leaf[q.id] && !B.leaf[q.id].classList.contains('gone'));
          w.gw.pinned = 's:' + x.id; w.growPaint(); return x.id as string;
        });
        const fit = () => page.evaluate(() => {
          const out: string[] = [], lanes = Array.from(document.querySelectorAll('.gw-ln')).filter((e) => (e as HTMLElement).offsetParent !== null);
          for (const ln of lanes) {
            const pan = ln.closest('aside, .gb-tip, section')!.getBoundingClientRect();
            for (const c of Array.from(ln.children)) { const r = c.getBoundingClientRect(); if (r.right > pan.right + .5 || r.left < pan.left - .5) out.push('"' + (c.textContent ?? '').slice(0, 30) + '" runs past its panel by ' + Math.round(Math.max(r.right - pan.right, pan.left - r.left))); }
            for (const chip of Array.from(ln.querySelectorAll('.gw-chip'))) { const rg = document.createRange(); rg.selectNodeContents(chip); const lines = new Set(Array.from(rg.getClientRects()).filter((q) => q.width > .5).map((q) => Math.round(q.top))).size; if (lines !== 1) out.push('chip "' + chip.textContent + '" on ' + lines + ' lines'); }
            for (const n of Array.from(ln.querySelectorAll('.note')) as HTMLElement[]) { if (n.scrollWidth > n.clientWidth) out.push('note "' + (n.textContent ?? '').slice(0, 30) + '" scrolls by ' + (n.scrollWidth - n.clientWidth)); if (n.getBoundingClientRect().right > pan.right + .5) out.push('note past the panel'); }
          }
          return { n: lanes.length, out, stripe: lanes.some((l) => /STRIPE_/.test(l.textContent ?? '')) };
        });
        const pinned = await fit();
        expect(pinned.n, width + 'px ' + sid).toBeGreaterThan(0);
        expect(pinned.stripe, width + 'px').toBe(true);
        expect(pinned.out, width + 'px pinned').toEqual([]);
        // and with Max pointed at while it is pinned
        await page.getByTestId('grow-mode-max').hover();
        await page.waitForTimeout(400);
        const locked = await fit();
        expect(locked.n, width + 'px').toBeGreaterThan(0);
        expect(locked.out, width + 'px pinned, Max pointed at').toEqual([]);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  it('gives each leaf on a phone a target of 44 px, takes a tap to the nearest leaf, and closes its card with a Close of 44 px or a tap outside it', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const page = await growPage(browser, server.url, folded(file), 390, true);
        await page.waitForTimeout(2500);
        await page.evaluate(() => { const t = document.querySelector('[data-testid="grow"] svg.gb')!; window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 20); });
        await page.waitForTimeout(200);
        const leaves = await page.evaluate(() => {
          const w = (0, eval)('({ gw })'), B = w.gw.B;
          return ([...Object.values(B.leaf), ...Object.values(B.bud)] as Element[]).filter((e) => !e.classList.contains('gone') && !e.classList.contains('cut') && e.getBoundingClientRect().width).map((e) => {
            const c = e.querySelector('.hitp') as SVGCircleElement | null, m = c ? c.getScreenCTM()! : null, b = c ? c.getBoundingClientRect() : null;
            return { k: e.getAttribute('data-k')!, d: c && m ? 2 * c.r.baseVal.value * Math.hypot(m.a, m.b) : 0, x: b ? b.left + b.width / 2 : 0, y: b ? b.top + b.height / 2 : 0 };
          });
        });
        expect(leaves.length, name).toBeGreaterThan(3);
        for (const l of leaves) expect(l.d, name + ' ' + l.k).toBeGreaterThanOrEqual(43.5);
        const pinned = () => page.evaluate(() => (0, eval)('gw').pinned as string | null);
        const unpin = () => page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = null; w.gw.hov = null; w.growPaint(); });
        // what a tap there should find: the leaf nearest it, within its 22 px; nothing, if a name or a knot is on top
        const want = (x: number, y: number) => page.evaluate(([x, y]) => {
          const t = document.elementFromPoint(x, y), k = t && t.closest('[data-k]'), B = (0, eval)('gw').B;
          if (!t || !t.closest('svg.gb') || (k && !k.classList.contains('gb-lf') && !k.classList.contains('pad'))) return null;
          const d = ([...Object.values(B.leaf), ...Object.values(B.bud)] as Element[]).filter((e) => !e.classList.contains('gone') && !e.classList.contains('cut')).map((e) => {
            const b = e.querySelector('.hitp')!.getBoundingClientRect(); return [Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y), e.getAttribute('data-k')!] as const;
          }).filter((q) => q[0] <= 21).sort((a, b) => a[0] - b[0]);
          return d.length && (d.length === 1 || d[1]![0] - d[0]![0] > 3) ? d[0]![1] : null;
        }, [x, y] as const);
        let taps = 0;
        for (const l of leaves) for (const [dx, dy] of [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]] as const) {
          const k = await want(l.x + dx, l.y + dy);
          if (!k) continue;
          await page.touchscreen.tap(l.x + dx, l.y + dy);
          await page.waitForTimeout(60);
          expect(await pinned(), name + ': tap at ' + l.k + ' +' + dx + ',' + dy).toBe(k);
          taps++;
          await unpin();
        }
        expect(taps, name).toBeGreaterThan(leaves.length);
        // the card a tap opens closes with its own Close of 44 px, or with a tap anywhere outside it
        const l = leaves.find((q) => q.k.startsWith('s:'))!;
        await page.touchscreen.tap(l.x, l.y); await page.waitForTimeout(60);
        expect(await pinned(), name).toBe(l.k);
        const x = (await page.locator('.gb-tip .gb-x').boundingBox())!;
        expect(Math.min(x.width, x.height), name).toBeGreaterThanOrEqual(44);
        await page.locator('.gb-tip .gb-x').tap(); await page.waitForTimeout(60);
        expect(await pinned(), name).toBe(null);
        expect(await page.locator('.gb-tip').isHidden(), name).toBe(true);
        await page.evaluate(() => { const t = document.querySelector('[data-testid="grow"] svg.gb')!; window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 20); });
        await page.touchscreen.tap(l.x, l.y); await page.waitForTimeout(60);
        expect(await pinned(), name).toBe(l.k);
        await page.locator('.gw-legend .lh').last().tap(); await page.waitForTimeout(60);
        expect(await pinned(), name).toBe(null);
        expect(await page.locator('.gb-tip').isHidden(), name).toBe(true);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 180000);

  it('fits the header’s time and button in its column at every width, with no dot left at a line’s end, and says <0.1 s for a step under 100 ms', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        for (const width of [1440, 1024, 768, 390]) {
          const page = await growPage(browser, server.url, state, width, width < 480);
          const seen = await page.evaluate(() => {
            const g = document.querySelector('[data-testid="grow"]')!.getBoundingClientRect(), meta = document.querySelector('.gw-head > .gw-meta')!, out: string[] = [];
            const walk = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT);
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
              if (!(n.textContent ?? '').trim() || n.parentElement!.closest('.sp')) continue;
              const rg = document.createRange(); rg.selectNodeContents(n);
              for (const q of Array.from(rg.getClientRects())) if (q.width > .5 && (q.right > g.right + .5 || q.left < g.left - .5)) out.push('"' + n.textContent + '" runs out of the column');
            }
            for (const b of Array.from(meta.querySelectorAll('button'))) { const r = b.getBoundingClientRect(); if (r.right > g.right + .5) out.push('the button runs out of the column'); }
            for (const sp of Array.from(meta.querySelectorAll('.gw-sl .sp'))) { const t = sp.nextElementSibling, a = sp.getBoundingClientRect(), b = t ? t.getClientRects()[0] : null; if (b && Math.abs(a.top - b.top) > 4) out.push('a line ends on a dot'); }
            const steps = Array.from(document.querySelectorAll('.ph > span')).map((e) => e.textContent ?? '');
            return { out, steps, fmt: [(0, eval)('gwStep')(40), (0, eval)('gwStep')(99), (0, eval)('gwStep')(100), (0, eval)('gwStep')(7300)] };
          });
          expect(seen.out, name + ' ' + width).toEqual([]);
          expect(seen.steps.some((t) => /^0\.0 s$/.test(t)), name + ' ' + width + ': ' + seen.steps.join(', ')).toBe(false);
          expect(seen.fmt).toEqual(['<0.1 s', '<0.1 s', '0.1 s', '7.3 s']);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  }, 120000);

  it('keeps the modes’ counts in a block of their own under the key, says In all in both tables, and keys the shoot, its count and the graft bud', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const state = folded('tracegrove-max.jsonl');
      const page = await growPage(browser, server.url, state, 1440);
      await page.waitForTimeout(2500);
      const key = await page.evaluate(() => {
        const lg = document.querySelector('.gw-legend')!, rows = Array.from(lg.querySelectorAll(':scope > .gw-lg')), cmp = lg.querySelector(':scope > .gw-lgcmp');
        const last = rows.at(-1)!.getBoundingClientRect(), c = cmp ? cmp.getBoundingClientRect() : null, first = rows[0]!.getBoundingClientRect();
        return {
          head: cmp ? cmp.querySelector('h4')?.textContent : null, gap: c ? c.top - last.bottom : -1, left: c ? c.left - first.left : -1,
          inGrid: rows.some((r) => r.querySelector('table')), total: cmp ? Array.from(cmp.querySelectorAll('tr')).at(-1)!.querySelector('th, td')!.textContent : null,
          items: Array.from(lg.querySelectorAll('.gw-li')).map((e) => e.lastElementChild!.textContent),
        };
      });
      expect(key.head).toBe('What each mode proves');
      expect(key.inGrid).toBe(false);
      expect(key.gap).toBeGreaterThanOrEqual(16);
      expect(Math.abs(key.left)).toBeLessThanOrEqual(1);
      expect(key.total).toBe('In all');
      expect(key.items).toEqual(expect.arrayContaining(['a shoot: part checks', 'more checks on a shoot than it has leaves', 'a graft bud: an existing flow']));
      // the panel's table before a choice is the same table, its total named the same
      await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state.modeBy = null; w.gw.state.asked = true; w.gw.pinned = null; w.growPaint(); });
      const ins = await page.evaluate(() => { const i = document.querySelector('[data-testid="grow-inspector"]')!; return { h: i.querySelector('h3')?.textContent, total: Array.from(i.querySelectorAll('tr')).at(-1)!.querySelector('th, td')!.textContent, first: i.querySelector('thead th, tr th')!.textContent }; });
      expect(ins).toEqual({ h: 'What each mode proves', total: 'In all', first: 'Scenarios' });
      await page.close();
      // a mode that cut a shoot keys the scar it leaves, when the tree shows one
      // (here Minimum was chosen before any shoot grew, so nothing was cut: the tree shows no scar and the key names none;
      // a shoot that really grew and was then cut is keyed in the next test)
      const pl = await growPage(browser, server.url, folded('plotline-seats.jsonl'), 1440);
      await pl.waitForTimeout(2500);
      const scar = await pl.evaluate(() => ({ shown: Array.from(document.querySelectorAll('svg.gb .shscar')).some((e) => (e as HTMLElement).style.display !== 'none' && e.getBoundingClientRect().width > 0), keyed: Array.from(document.querySelectorAll('.gw-legend .gw-li')).some((e) => e.textContent === 'where a shoot was cut') }));
      expect(scar.shown).toBe(false);
      expect(scar.keyed).toBe(scar.shown);
      await pl.close();
    } finally { await browser.close(); }
  }, 90000);

  it('keys where a shoot was cut once a chosen mode has really cut shoots that grew, and only then', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    // Max chosen, and grown; then Min chosen after it: the shoots Max grew are really cut, and heal beside their knots
    const max = { ...state, asked: false, modeBy: 'you' as const, mode: 'max' as const }, min = { ...max, mode: 'min' as const };
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    const scars = () => ({ shown: Array.from(document.querySelectorAll('svg.gb .shscar')).some((e) => (e as HTMLElement).style.display !== 'none' && e.getBoundingClientRect().width > 0), keyed: Array.from(document.querySelectorAll('.gw-legend .gw-li')).some((e) => e.textContent === 'where a shoot was cut') });
    try {
      const page = await treePage(browser, server.url, max, { width: 1440 });
      await settled(page);
      // grown in Max, nothing is cut yet: no scar, and none keyed
      const grown = await page.evaluate(scars);
      expect(grown.shown).toBe(false);
      expect(grown.keyed).toBe(grown.shown);
      await paintState(page, min);
      await settled(page);
      const cut = await page.evaluate(scars);
      expect(cut.shown).toBe(true);
      expect(cut.keyed).toBe(true);
      expect(cut.keyed).toBe(cut.shown);
      // drawn as the tree lays it: a callus on the bark beside a knot's boss, never the same picture as the row's other mark
      const sw = await page.evaluate(() => {
        const li = Array.from(document.querySelectorAll('.gw-legend [aria-label="Pruned"] .gw-li'));
        const look = (e: Element | undefined) => { const s = e?.querySelector('.gw-sw'); return s ? { cal: !!s.querySelector('.cal'), cres: !!s.querySelector('.cres'), boss: !!s.querySelector('.k1'), cf: !!s.querySelector('.cf'), html: s.innerHTML } : null; };
        return { scar: look(li.find((e) => e.textContent === 'where a shoot was cut')), others: li.filter((e) => e.textContent !== 'where a shoot was cut').map(look) };
      });
      expect(sw.scar && { cal: sw.scar.cal, cres: sw.scar.cres, boss: sw.scar.boss, cf: sw.scar.cf }).toEqual({ cal: true, cres: true, boss: true, cf: false });
      expect(sw.others.length).toBeGreaterThan(0);
      for (const o of sw.others) { expect(o?.boss).toBe(false); expect(o?.html).not.toBe(sw.scar!.html); }
      await page.close();
    } finally { await browser.close(); }
  }, 90000);

  it('opens the failing or the headline journey under the tree with its path and scenarios, and lists a service’s checks under Roots in the Outline, never among the parts', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const state = folded(file);
        const page = await growPage(browser, server.url, state, 1440);
        const card = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="grow-scenarios"] details.gb-jr')).map((d) => ({
          open: (d as HTMLDetailsElement).open, failed: d.classList.contains('failed'), path: !!d.querySelector('.gb-path'), rows: d.querySelectorAll('.gb-ols').length,
          mark: getComputedStyle(d.querySelector('summary')!, '::before').content,
        })));
        expect(card.length, name).toBe(2);
        const anyFail = card.some((c) => c.failed);
        card.forEach((c, i) => {
          expect(c.open, name + ' ' + i).toBe(anyFail ? c.failed : i === 0);
          expect(c.mark, name + ' ' + i).toContain(c.open ? '▾' : '▸');
          if (c.open) { expect(c.path, name + ' ' + i).toBe(true); expect(c.rows, name + ' ' + i).toBeGreaterThan(0); }
        });
        // "Listed under Journeys, below" opens a closed journey there
        const closed = card.findIndex((c) => !c.open);
        await page.evaluate((i) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = 'j:' + w.gw.order[i]; w.growPaint(); }, closed);
        await page.getByRole('button', { name: 'Listed under Journeys, below ↓' }).click();
        expect(await page.evaluate((i) => (document.querySelectorAll('[data-testid="grow-scenarios"] details.gb-jr')[i] as HTMLDetailsElement).open, closed), name).toBe(true);
        // the Outline: the leaf key right under the Journeys heading; a route greyed past its break; a root's checks under Roots
        await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = null; w.gw.tree = 'outline'; w.gw.open = { own: true, reg: true }; w.growPaint(); });
        const ol = await page.evaluate(() => {
          const o = document.querySelector('[data-testid="grow-outline"]')!, w = (0, eval)('({ gw })'), S = w.gw.state;
          const roots = S.units.filter((u: { root: boolean; label: string }) => u.root).map((u: { label: string }) => u.label);
          const head = Array.from(o.children).find((e) => /^Journeys/.test(e.textContent ?? ''));
          const parts: string[] = [], under: string[] = [];
          for (const x of Array.from(o.querySelectorAll('.gb-bpx'))) { let sub = ''; for (const e of Array.from(x.children)) { if (e.classList.contains('gb-sub')) sub = e.textContent ?? ''; else { const t = e.querySelector(':scope > summary .pn')?.textContent ?? ''; (sub === 'Roots' ? under : parts).push(t + ' | ' + (e.querySelector(':scope > summary .gw-facts')?.textContent ?? '')); } } }
          const un = Array.from(o.querySelectorAll('.gb-path .hop.un button')).map((b) => +getComputedStyle(b).opacity);
          return { next: head?.nextElementSibling?.className, roots, parts, under, un, reached: o.querySelectorAll('.gb-path .hop:not(.un)').length, rc: Array.from(o.querySelectorAll('.gb-olr .rc')).map((e) => e.textContent) };
        });
        expect(ol.next, name).toBe('gb-olkey');
        for (const r of ol.roots) expect(ol.parts.some((p) => p.startsWith(r + ' |')), name + ': ' + r).toBe(false);
        if (name === 'tracegrove') {
          expect(ol.under, name).toEqual([expect.stringMatching(/^Calls to GitHub \| 3 checks/)]);
          expect(ol.rc, name).toContain('Max checks 3 calls to GitHub');
        } else {
          expect(ol.un.length, name).toBeGreaterThan(0);
          for (const o of ol.un) expect(o, name).toBeLessThanOrEqual(.6);
          expect(ol.reached, name).toBeGreaterThan(0);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 90000);

  it('names a pad’s places on hover, the happy path, what it refuses and how it fails, each near its cushion and clear of every name, leaf and the wood', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const page = await growPage(browser, server.url, folded(file), 1440);
        await page.waitForTimeout(2500);
        const seen = await page.evaluate(() => {
          const w = (0, eval)('({ gw, gbHover })'), B = w.gw.B, out: string[] = [], words: string[] = [];
          const meet = (p: DOMRect, q: DOMRect) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > .5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > .5;
          const svg = B.svg.getBoundingClientRect();
          for (const g of Array.from(B.svg.querySelectorAll('g.pad[data-k]')) as Element[]) {
            w.gbHover(g.getAttribute('data-k'), g);
            const ls = Array.from(B.svg.querySelectorAll('.padlbl')) as SVGTextElement[], rs = ls.map((t) => t.getBoundingClientRect());
            const names = Array.from(B.svg.querySelectorAll('.klbl.on, .kpip.on, .rlbl, .shtag, .lbl')).map((e) => (e as Element).getBoundingClientRect()).filter((r) => r.width);
            const blades = Array.from(B.svg.querySelectorAll('.gb-lf:not(.gone) .blade')).map((e) => (e as Element).getBoundingClientRect()).filter((r) => r.width);
            const cush = Object.values(B.pad).flatMap((P) => ((P as { cu?: Array<{ el?: Element }> }).cu || []).map((c) => c && c.el ? c.el.getBoundingClientRect() : null)).filter(Boolean) as DOMRect[];
            const own = ((B.pad[g.getAttribute('data-pad')!] as { cu?: Array<{ el?: Element }> }).cu || []).map((c) => c && c.el ? c.el.getBoundingClientRect() : null).filter(Boolean) as DOMRect[];
            ls.forEach((t, i) => {
              const r = rs[i]!; words.push(t.textContent ?? '');
              if (r.left < svg.left || r.right > svg.right || r.top < svg.top || r.bottom > svg.bottom) out.push(t.textContent + ': out of the drawing');
              rs.forEach((q, j) => { if (j > i && meet(r, q)) out.push(t.textContent + ' meets ' + ls[j]!.textContent); });
              if (names.some((q) => meet(r, q))) out.push(t.textContent + ' meets a name');
              if (blades.some((q) => meet(r, q))) out.push(t.textContent + ' meets a leaf');
              if (cush.some((q) => meet(r, q))) out.push(t.textContent + ' meets a cushion');
              const near = Math.min(...own.map((q) => Math.hypot(Math.max(q.left - r.right, 0, r.left - q.right), Math.max(q.top - r.bottom, 0, r.top - q.bottom))), ...blades.map((q) => Math.hypot(Math.max(q.left - r.right, 0, r.left - q.right), Math.max(q.top - r.bottom, 0, r.top - q.bottom))));
              if (near > 16) out.push(t.textContent + ' ' + Math.round(near) + ' px from its pad');
              for (const e of Array.from(B.svg.querySelectorAll('path.w, path.tw')) as SVGGeometryElement[]) {
                const mm = e.getScreenCTM()!.inverse();
                for (const [fx, fy] of [[0, .5], [.5, .5], [1, .5]]) { const p = new DOMPoint(r.left + r.width * fx!, r.top + r.height * fy!).matrixTransform(mm); if (e.isPointInFill(p)) { out.push(t.textContent + ' sits on the wood'); break; } }
              }
            });
            w.gbHover(null);
            if (B.svg.querySelectorAll('.padlbl').length) out.push('labels stay after the hover');
          }
          return { out, words };
        });
        expect(seen.out, name).toEqual([]);
        expect(seen.words, name).toEqual(expect.arrayContaining(['happy path', 'refuses', 'fails']));
        await page.close();
      }
    } finally { await browser.close(); }
  }, 90000);

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
        // a cushion's area grows with how many leaves it holds, one k for every cushion on a pad, the crown's crest too; the pads
        // a scalene triangle: each as wide as its leaves ask, clamp(n x 1.6 leaves, 3.2, 12 leaves), times its tier (1 at the
        // lowest branch, .7 at the apex) and never narrower than holds them, no pad wider than the one below it, and the crown's
        // crest at most three quarters across the widest cushion below it
        for (const tree of new Set(f.cush.map((c) => c.tree))) {
          const cs = f.cush.filter((c) => c.tree === tree), per = (c: { a: number; h: number; n: number }) => (c.a * c.h) / (c.n + 0.5);
          for (const pid of new Set(cs.map((c) => c.pid))) {
            const pc = cs.filter((c) => c.pid === pid), base = Math.min(...pc.map(per));
            for (const c of pc) expect(per(c) / base, width + 'px ' + pid + ' ' + c.role + ' of ' + c.n).toBeLessThan(1.03);
            for (const a of pc) for (const b of pc) if (a.n < b.n) expect(a.a * a.h).toBeLessThan(b.a * b.h);
          }
          const pads = f.pads.filter((q) => q.tree === tree).sort((a, b) => a.h - b.h);
          for (let i = 1; i < pads.length; i++) expect(pads[i]!.PW, width + 'px ' + pads[i]!.pid + ' against the pad below it').toBeLessThanOrEqual(1.05 * pads[i - 1]!.PW);
          for (const q of pads) expect(q.PW, width + 'px ' + q.pid + ' as wide as its leaves ask at its tier').toBeGreaterThanOrEqual(Math.max(3.2 * q.L, Math.min(12 * q.L, q.n * 1.6 * q.L)) * q.tier - 0.01);
          const brMax = Math.max(0, ...cs.filter((c) => !c.crown).map((c) => c.a));
          for (const c of cs.filter((x) => x.crown && x.role === 'crest')) expect(c.a, width + 'px crown crest against the widest cushion below').toBeLessThanOrEqual(0.75 * brMax + 0.01);
          if (pads.length > 1) expect(pads.at(-1)!.PW, width + 'px the apex against the widest pad below').toBeLessThanOrEqual(0.75 * Math.max(...pads.slice(0, -1).map((q) => q.PW)) + 0.01);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** The tree's form as drawn: which journey the crown holds, how its wood is sized and set, and how its leaves sit. */
  const form = () => {
    const w = (0, eval)('({ gw, gbHf, gbModel, gbOrderOf })'), B = w.gw.B, S = w.gw.state, hf: number = w.gbHf(B);
    const out = { bad: [] as string[], crown: '', head: '', failing: false, title: '', nL: 0, D: 0, Ht: 0, L: 0, h1: 0, lean: 0, sides: [0, 0], hung: 0, below: 0, over: [] as number[], halos: 0, stem: 0 };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    const on = (el: any) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    // a colour as the page paints it, whatever space it was mixed in, and a token of the tree's own
    const ctx = document.createElement('canvas').getContext('2d')!, svg = document.querySelector('.gw-svg.gb')!;
    const rgb = (c: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)); };
    const tok = (n: string) => getComputedStyle(svg).getPropertyValue(n).trim();
    const pads = Object.values(B.pad) as any[], crown = pads.find((P) => P.crown), T = B.L.trees[crown.tree], mine = pads.filter((P) => P.tree === crown.tree);
    // the crown holds the headline journey: the first in the tree's numbering that failed, else the first
    const fails = (jid: string) => S.scenarios.some((x: any) => x.journey === jid && S.run[x.id]?.st === 'fail');
    const order = w.gbOrderOf(w.gw.M || w.gbModel()) as { id: string; title: string }[], head = order.find((j) => fails(j.id)) ?? order[0]!;
    out.crown = crown.jid; out.head = head.id; out.failing = fails(head.id); out.title = head.title;
    if (S.journeys.some((j: { id: string }) => fails(j.id)) && !fails(crown.jid)) bad('a journey failed and the crown holds one that did not');
    // a scalene canopy: its crest at most three quarters across the widest cushion below it, and no pad wider than the one
    // below it (to 5%), the lowest the widest
    const crest = crown.geo.cs.find((c: any) => c.role === 'crest');
    const lowA = Math.max(0, ...mine.filter((P) => !P.crown).flatMap((P) => P.geo.cs.map((c: any) => c.a)));
    if (lowA && crest.a > 0.75 * lowA + 0.01) bad('the crown crest over three quarters of the widest cushion below it', [crest.a, lowA]);
    const lowPW = Math.max(0, ...mine.filter((P) => !P.crown).map((P) => P.geo.PW));
    if (lowPW && crown.geo.PW > 0.75 * lowPW + 0.01) bad('the crown over three quarters of the widest pad below it', [crown.geo.PW, lowPW]);
    const up = mine.slice().sort((a, b) => (a.crown ? 1 : a.b.h) - (b.crown ? 1 : b.b.h));
    for (let i = 1; i < up.length; i++) if (up[i].geo.PW > 1.05 * up[i - 1].geo.PW) bad('a pad wider than the one below it', [up[i].id, up[i].geo.PW, up[i - 1].id, up[i - 1].geo.PW]);
    // the crown in tiers: its crest on its riser above its shoulders, and (beside a desktop tree; on a phone it stays one
    // crest) a crown of three or more leaves on its cushions carries one or two shoulders, each narrower than its crest
    // where they hold its happy paths
    const cshs = crown.geo.cs.filter((c: any) => c.role === 'shoulder'), mid = (c: any) => c.b - c.h / 2;
    for (const c of cshs) if (mid(crest) >= mid(c)) bad('the crown crest not above its shoulder', [mid(crest), mid(c)]);
    if (!B.L.narrow && crown.geo.cs.reduce((a: number, c: any) => a + c.ids.length, 0) >= 3) {
      if (cshs.length < 1 || cshs.length > 2) bad('a crown of three or more leaves with no tier', cshs.length);
      for (const c of cshs) if (c.lv.every((x: any) => x.polarity === 'happy') && c.a >= crest.a) bad('a crown shoulder as wide as its crest', [c.a, crest.a]);
    }
    // the wood sized from the data: the trunk's girth from the leaves the tree carries, and about twelve girths tall
    out.nL = mine.reduce((a, P) => a + P.leaves.length, 0); out.D = T.D; out.Ht = T.Ht;
    if (T.Ht < 12 * T.D - 0.01) bad('a squat trunk', [T.Ht, T.D]);
    // the first branch about a third of the way up, on the outside of the trunk's bend there
    const brs = mine.filter((P) => P.b && !P.b.back).map((P) => P.b).sort((a, b) => a.h - b.h), tp = T.tp as number[][];
    if (brs.length) {
      const b = brs[0], top = tp.findIndex((q) => -q[1]! >= T.Ht - 0.5), a0 = tp[0]!, a1 = tp[top < 0 ? tp.length - 1 : top]!, q = tp[b.k]!;
      const dev = q[0]! - (a0[0]! + (a1[0]! - a0[0]!) * (a0[1]! - q[1]!) / ((a0[1]! - a1[1]!) || 1));
      out.h1 = b.h;
      if (b.h < 0.25 || b.h > 0.42) bad('the first branch not about a third up', b.h);
      if (Math.sign(dev) !== b.dir) bad('the first branch on the inside of its bend', [dev, b.dir]);
    }
    // the apex back over the nebari: the crown's middle within a tenth of the trunk's height of the trunk's foot
    const foot = crown.rt.tp[0], cx = crown.o[0] + crest.x;
    out.lean = (cx - foot[0]) / T.Ht;
    if (Math.abs(out.lean) > 0.1) bad('the crown not over the nebari', out.lean);
    // a scalene canopy, foliage on both sides of the trunk, and every pad a journey's own leaves
    const xs = mine.filter((P) => on(P.el)).map((P) => [P.o[0] - P.geo.PW / 2, P.o[0] + P.geo.PW / 2]);
    out.sides = [cx - Math.min(...xs.map((x) => x[0]!)), Math.max(...xs.map((x) => x[1]!)) - cx];
    if (Math.min(...out.sides) / Math.max(...out.sides) > 0.92) bad('a symmetric canopy', out.sides);
    const sideOf = mine.filter((P) => !P.crown && on(P.el)).map((P) => Math.sign(P.o[0] - foot[0]));
    if (sideOf.length > 1 && !(sideOf.includes(1) && sideOf.includes(-1))) bad('a side of the tree left empty', sideOf);
    for (const P of mine) if (!P.leaves.length) bad('a pad with no leaf', P.jid);
    // leaves lead: about nineteen pixels long beside a desktop tree, never under eleven on a phone
    out.L = Math.min(...mine.map((P) => P.geo.L * hf));
    for (const P of mine) {
      const g = P.geo, L: number = g.L;
      for (const [id, sl] of g.slot as Map<string, number[]>) {
        const el = B.leaf[id]; if (!on(el) || el.classList.contains('gone')) continue;
        // the tufts at a leaf's foot are drawn behind it, so none covers a leaf
        const tf = B.tuft?.[id]; if (tf && !(tf.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) bad('a tuft drawn over its leaf', id);
        // a failed leaf carries a soft red halo at rest: as it shows over its cushion it reads red, never brown, and it is
        // softer than the leaf's own red, nearer the page
        if (el.classList.contains('fail') && !/pv-/.test(el.getAttribute('class') ?? '')) {
          const cs = getComputedStyle(el.querySelector('.halo')), so = +cs.strokeOpacity, h = rgb(cs.stroke), fol = rgb(tok('--fol')), pp = rgb(tok('--paper')), vm = rgb(tok('--verm'));
          const seen = h.map((v, i) => so * v + (1 - so) * fol[i]!), far = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
          out.halos++;
          if (+cs.opacity < 0.9 || cs.stroke === 'none' || parseFloat(cs.strokeWidth) < 2 || !(seen[0]! > seen[1]! + 50 && seen[0]! > seen[2]! + 50) || !(far(h, pp) < far(vm, pp))) bad('a failed leaf with no soft red halo', [id, cs.stroke, so, seen.map(Math.round)]);
        }
        if (!sl[4]) continue;
        // a failure on a short stem at thirty to forty-five degrees, out and down (along its branch, or away from the crown's
        // middle), its blade lying over the cushion's rim
        out.hung++;
        const pts = B.ltw[id][0].__pts as number[][], E = pts[pts.length - 1]!, S0 = pts[Math.max(0, pts.length - 7)]!, dx = E[0]! - S0[0]!, dy = E[1]! - S0[1]!, st = Math.hypot(dx, dy);
        const k = g.cOf.get(id), c = g.cs[k], mid = [P.o[0] + sl[0]!, P.o[1] + sl[1]!], th = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
        if (th < 30 - 0.01 || th > 45 + 0.01) bad('a stem not at thirty to forty-five degrees, out and down', [id, th]);
        if (Math.sign(dx) !== (P.b ? P.b.dir : Math.sign(mid[0]! - (P.o[0] + c.x)))) bad('a stem leaning in', id);
        const fill = P.cu[k].el.querySelector('.pfill'), u = [Math.cos(sl[2]! * Math.PI / 180), Math.sin(sl[2]! * Math.PI / 180)];
        let inside = 0; for (let i = 0; i <= 20; i++) { const f = i / 20 - 0.5; if (fill.isPointInFill(new DOMPoint(mid[0]! + u[0]! * f * L, mid[1]! + u[1]! * f * L))) inside++; }
        // it hangs beneath its cushion, clear of it, on a stem of ten pixels off the twig run out to it; or, with no room
        // there, it sits on the rim on a short stem
        if (!inside) {
          out.below++;
          const A = pts.reduce((a: number[], q, i) => (a.push(i ? a[i - 1]! + Math.hypot(q[0]! - pts[i - 1]![0]!, q[1]! - pts[i - 1]![1]!) : 0), a), []), d = A[A.length - 1]! - 10;
          let j = 1; while (j < A.length - 1 && A[j]! < d) j++;
          const f = Math.max(0, Math.min(1, (d - A[j - 1]!) / ((A[j]! - A[j - 1]!) || 1))), b = [pts[j - 1]![0]! + (pts[j]![0]! - pts[j - 1]![0]!) * f, pts[j - 1]![1]! + (pts[j]![1]! - pts[j - 1]![1]!) * f], sb = Math.hypot(E[0]! - b[0]!, E[1]! - b[1]!);
          if (sb < 9 || sb > 10.6) bad('a hanging stem not ten pixels', [id, sb]);
          continue;
        }
        out.stem = Math.max(out.stem, st * hf);
        if (st > 0.42 * L + 0.01) bad('a long stem', [id, st, L]);
        out.over.push(inside / 21);
      }
    }
    return out;
  };

  it('puts the headline journey in the crown, its crest the largest, on wood sized from the data, with leaves that lead', async () => {
    const bushy = await grownBushy();
    const server = await startUi({ dir: bushy.dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const seen: Record<string, { nL: number; D: number }> = {};
      for (const [name, state] of [['plotline', folded('plotline-seats.jsonl')], ['tracegrove', folded('tracegrove-max.jsonl')], ['bushy', bushy.state]] as const) {
        for (const width of [1440, 768, 390]) {
          const page = await treePage(browser, server.url, state, { width, reduce: true });
          await page.waitForTimeout(400);
          const f = await page.evaluate(form), at = name + ' ' + width + 'px';
          expect(f.bad, at).toEqual([]);
          expect(f.crown, at + ' crown').toBe(f.head);
          if (width === 1440) {
            seen[name] = { nL: f.nL, D: f.D };
            expect(f.L, at + ' leaf length').toBeGreaterThanOrEqual(18);
            expect(f.stem, at + ' stem').toBeLessThanOrEqual(8.5);
            // the side panel's first failing or headline journey is the crown's
            const ins = page.getByTestId('grow-inspector');
            await expect.poll(() => ins.textContent()).toContain(f.failing ? 'The first failing journey' : 'The headline journey');
            expect(await ins.locator('h3').first().textContent()).toBe(f.title.replace(/`/g, ''));
          } else if (width < 500) expect(f.L, at + ' leaf length').toBeGreaterThanOrEqual(11);
          // each failure hangs beneath its cushion, or with no room there its blade lies over the rim by about three tenths
          expect(f.below + f.over.length, at).toBe(f.hung);
          for (const o of f.over) { expect(o, at + ' over the rim').toBeGreaterThan(0.12); expect(o, at + ' over the rim').toBeLessThan(0.5); }
          if (name !== 'plotline') expect(f.hung, at).toBeGreaterThan(0);
          if (name === 'bushy') expect(f.halos, at).toBeGreaterThan(0);
          await page.close();
        }
      }
      // a tree with fewer leaves stands on a slimmer trunk
      const by = Object.values(seen).sort((a, b) => a.nL - b.nL);
      for (let i = 1; i < by.length; i++) expect(by[i]!.D, JSON.stringify(by)).toBeGreaterThanOrEqual(by[i - 1]!.D);
      expect(by[0]!.D, JSON.stringify(by)).toBeLessThan(by[by.length - 1]!.D);
    } finally { await browser.close(); }
  }, 180000);

  /** Where each branch of the headline journey's refusals or failures leaves the trunk: the knot most of its scenarios
   *  broke at (the run's hop) or, where none broke, the last hop of their route. */
  const refusals = () => {
    const w = (0, eval)('({ gw, gbModel, gbWound })'), B = w.gw.B, M = w.gw.M || w.gbModel(), S = w.gw.state;
    const out: Array<{ id: string; tree: number; end: string; d: number; ra: number; side: boolean; failed: number }> = [];
    B.L.trees.forEach((T: any, ti: number) => {
      for (const b of T.br.filter((x: any) => x.pol)) {
        const j = b.j, P = B.pad[b.id], n = new Map<string, number>();
        for (const x of P.leaves) {
          const wd = w.gbWound(M, j, x), ix = j.units.indexOf(x.unit), real = j.units.filter((id: string) => !M.U[id]?.root);
          const end = wd ?? (x.scenarioKind !== 'happy' && ix >= 0 ? x.unit : real[real.length - 1]);
          n.set(end, (n.get(end) ?? 0) + 1);
        }
        const end = [...n].sort((a, c) => c[1] - a[1])[0]![0], q = T.knots.find((k: any) => k.on === 't' && k.ids.includes(end));
        if (!q) { out.push({ id: b.id, tree: ti, end: M.U[end]?.label ?? end, d: Infinity, ra: 0, side: false, failed: 0 }); continue; }
        const p0 = b.pts[0], conv = Math.sign(q.n[0] * q.side);
        out.push({ id: b.id, tree: ti, end: M.U[end]?.label ?? end, d: Math.hypot(p0[0] - q.bp[0], p0[1] - q.bp[1]), ra: q.ra, side: conv === Math.sign(b.dir), failed: P.leaves.filter((x: any) => S.run[x.id]?.st === 'fail').length });
      }
    });
    return out;
  };

  it('grows the branch of what the headline journey refuses from the knot where its scenarios break, or end', async () => {
    const { dir, state } = await grownWithFailure();
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      let unbroken = 0;
      for (const [name, s] of [['plotline', folded('plotline-seats.jsonl')], ['tracegrove', folded('tracegrove-max.jsonl')], ['failed', state]] as const) {
        const page = await treePage(browser, server.url, s, { width: 1440, reduce: true });
        await page.waitForTimeout(400);
        const got = await page.evaluate(refusals);
        expect(got.length, name).toBeGreaterThan(0);
        // its collar is that knot: the branch's first point within the knot's boss and six pixels, on the side the boss stands
        for (const r of got) {
          expect(r.d, name + ' ' + r.id + ' at ' + r.end).toBeLessThanOrEqual(r.ra + 6);
          expect(r.side, name + ' ' + r.id + ' on its knot\'s convex side').toBe(true);
          if (!r.failed) unbroken++;
        }
        if (name === 'plotline') expect(got.find((r) => r.id === 'j1~guard')?.end, name).toBe('POST /seats');
        await page.close();
      }
      // and a branch none of whose scenarios failed sits at the last hop they run
      expect(unbroken).toBeGreaterThan(0);
    } finally { await browser.close(); }
  }, 90000);

  it('keeps a leaf still to prove an outline on a dark page: a pass-green rim over an opaque neutral fill a step off the page, never read as passed, and no flow yet never a hole', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    // a colour as the page paints it, whatever space it was mixed in, as CIE L*a*b* and its luminance; none or clear is a hole
    const paint = () => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const rgba = (c: string) => { if (c === 'none') return null; ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return a! < 200 ? null : [r! / 255, g! / 255, b! / 255]; };
      (window as any).__lab = (c: string) => {
        const v = rgba(c); if (!v) return null;
        const lin = v.map((x) => (x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4));
        const X = (.4124 * lin[0]! + .3576 * lin[1]! + .1805 * lin[2]!) / .95047, Y = .2126 * lin[0]! + .7152 * lin[1]! + .0722 * lin[2]!, Z = (.0193 * lin[0]! + .1192 * lin[1]! + .9505 * lin[2]!) / 1.08883;
        const f = (t: number) => (t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        // (lum: the luminance the no-hole check has always read, weighted over the painted values)
        return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)), lum: .2126 * v[0]! + .7152 * v[1]! + .0722 * v[2]! };
      };
    };
    try {
      for (const width of [1440, 390]) {
        // a passed leaf, from the plotline grow
        const pl = await treePage(browser, server.url, folded('plotline-seats.jsonl'), { width, scheme: 'dark', reduce: true });
        await pl.evaluate(paint);
        const pass = await pl.evaluate(() => { const e = document.querySelector('.gw-svg.gb .gb-lf.pass:not(.gone):not(.pv-out) .blade'); return e ? (window as any).__lab(getComputedStyle(e).fill) : null; });
        expect(pass, width + 'px a passed leaf').not.toBeNull();
        await pl.close();
        const page = await treePage(browser, server.url, folded('tracegrove-max.jsonl'), { width, scheme: 'dark', reduce: true });
        await page.waitForTimeout(400);
        await page.evaluate(paint);
        const look = await page.evaluate(() => {
          const lab = (window as any).__lab, bg = lab(getComputedStyle(document.body).backgroundColor);
          const each = (sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => { const c = getComputedStyle(e); return { fill: lab(c.fill), stroke: lab(c.stroke), sw: parseFloat(c.strokeWidth), bud: !!e.closest('.bud') }; });
          return { bg, prove: each('.gw-svg.gb .gb-lf:is(.in,.idle):not(.gone):not(.pv-add):not(.pv-out):not(.pre) .blade'), none: each('.gw-svg.gb .gb-lf.none:not(.gone):not(.bud) .blade') };
        });
        expect(look.prove.length, width + 'px').toBeGreaterThan(3);
        const hue = (c: { a: number; b: number }) => Math.atan2(c.b, c.a) * 180 / Math.PI;
        for (const l of look.prove) {
          // an opaque neutral fill a step off the page: neither green nor the page, and no hole
          expect(l.fill, width + 'px a leaf to prove with no fill').not.toBeNull();
          expect(Math.abs(l.fill!.a), width + 'px fill a*').toBeLessThan(6);
          expect(Math.abs(l.fill!.b), width + 'px fill b*').toBeLessThan(6);
          expect(l.fill!.L, width + 'px fill a step off the page').toBeGreaterThanOrEqual(look.bg.L + 3);
          // rimmed in the passed leaf's green, so it reads as a leaf of the same kind not yet filled
          expect(l.stroke, width + 'px a leaf to prove with no rim').not.toBeNull();
          expect(Math.abs(hue(l.stroke!) - hue(pass!)), width + 'px rim hue against a passed leaf').toBeLessThanOrEqual(10);
          expect(Math.hypot(l.stroke!.a, l.stroke!.b), width + 'px rim chroma').toBeGreaterThan(20);
          if (!l.bud) expect(l.sw, width + 'px rim width').toBeGreaterThanOrEqual(1.45);
          // and never read as passed: twenty L* or more from a passed leaf's fill
          expect(Math.abs(pass!.L - l.fill!.L), width + 'px L* gap to a passed leaf').toBeGreaterThanOrEqual(20);
        }
        // a leaf with no flow yet stays a pale leaf, never the page showing through
        expect(look.none.length, width + 'px').toBeGreaterThan(0);
        for (const l of look.none) expect((l.fill?.lum ?? -1) - look.bg.lum, width + 'px no-flow leaf against the page').toBeGreaterThan(0.3);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** Max's growth on the wood, measured from the tree's own geometry: every limb, knot, shoot, count and graft bud. */
  const growth = () => {
    const w = (0, eval)('({ gw, GB_NK })');
    const B = w.gw.B, L = B.L, kq: number = L.narrow ? w.GB_NK : 1;
    const out = { limbs: 0, knots: 0, shoots: 0, dormant: 0, tags: 0, rings: [] as string[], counts: [] as Array<{ parts: string[]; leaves: number; more: number }>, bad: [] as string[] };
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
    // a shoot rises from its own knot's boss, a trunk's on the boss's own side, and none stands within 40 px of another
    const T0 = L.trees[0], X0: number = L.xs[0], gs: any[] = B.shootGeo ?? [], rest: any[] = B.shootRest ?? [];
    // the wood as drawn, and every fork: a limb's foot on its parent and a twig's on its limb, with the girth there
    const wood = Array.from(document.getElementById('gb-wood' + B.N)?.children ?? []) as SVGGeometryElement[], wpt = (B.svg as SVGSVGElement).createSVGPoint();
    const onWood = (x: number, y: number) => { wpt.x = x; wpt.y = y; return wood.some((e) => e.isPointInFill(wpt)); };
    const forks: number[][] = [];
    L.trees.forEach((T: any, i: number) => {
      const X: number = L.xs[i];
      for (const b of T.br) { forks.push([T.tp[b.k][0] + X, T.tp[b.k][1], T.tw[b.k]]); for (const t of b.twigs ?? []) forks.push([t.pts[0][0] + X, t.pts[0][1], b.w[t.bi] ?? b.w[0]]); }
      for (const t of T.ctw ?? []) forks.push([t.pts[0][0] + X, t.pts[0][1], T.tw[t.bi] ?? 1]);
    });
    if (wood.length < 1) bad('no wood to measure against');
    const label = (id: string) => (w.gw.M.U[id] || {}).label || id;
    for (const g of gs) {
      out.shoots++;
      if (g.tip[1] >= g.base[1]) bad('shoot does not rise', g.kid);
      const kn = T0.knots.find((q: any) => q.id === g.kid);
      if (kn) {
        if (Math.hypot(g.base[0] - kn.bp[0] - X0, g.base[1] - kn.bp[1]) > kn.rb + 0.5) bad('shoot not from its own knot', g.kid);
        if (kn.on === 't' && (g.ns[0] * kn.n[0] + g.ns[1] * kn.n[1]) * kn.side <= 0) bad('trunk shoot off its boss side', g.kid);
        // only on the outside of the bend
        const P = kn.on === 't' ? { pts: T0.tp } : T0.br.find((b: any) => b.id === kn.bid), m = P.pts.length - 1;
        const a = P.pts[Math.max(0, kn.k - 6)], c = P.pts[Math.min(m, kn.k + 6)], b = P.pts[kn.k];
        const cv = (b[0] - (a[0] + c[0]) / 2) * kn.n[0] + (b[1] - (a[1] + c[1]) / 2) * kn.n[1];
        if (Math.abs(cv) > 1.2 && (g.ns[0] * kn.n[0] + g.ns[1] * kn.n[1]) * Math.sign(cv) <= 0) bad('shoot on the inside of the bend', g.kid);
        // off a limb's first 15 per cent
        if (kn.on !== 't' && P.acc && P.acc[kn.k] < P.acc[m] * 0.15 - 0.01) bad('shoot in the first 15% of its limb', g.kid);
      }
      // never at a fork or in its crotch: one and a half girths of the wood it grows from clear of every fork
      const at = kn ? (kn.on === 't' ? T0.tw[kn.k] : T0.br.find((b: any) => b.id === kn.bid).w[kn.k]) : T0.tw[T0.tp.reduce((bi: number, q: number[], i: number) => Math.hypot(q[0]! + X0 - g.base[0], q[1]! - g.base[1]) < Math.hypot(T0.tp[bi][0] + X0 - g.base[0], T0.tp[bi][1] - g.base[1]) ? i : bi, 0)];
      for (const f of forks) if (Math.hypot(g.base[0] - f[0]!, g.base[1] - f[1]!) < 1.5 * at - 0.01) bad('shoot within 1.5 girths of a fork', [g.kid, Math.round(Math.hypot(g.base[0] - f[0]!, g.base[1] - f[1]!)), Math.round(at)]);
      // rising all the way, leaning no more than 35 degrees off upright
      if (g.pts.some((q: number[], i: number) => i && q[1]! >= g.pts[i - 1][1])) bad('shoot droops', g.kid);
      const lean = Math.atan2(Math.abs(g.tip[0] - g.base[0]), g.base[1] - g.tip[1]) * 180 / Math.PI;
      if (lean > 35.5) bad('shoot leans more than 35 degrees', [g.kid, Math.round(lean)]);
      // neither it nor its leaves lie on the wood
      for (const q of g.pts.slice(3)) if (onWood(q[0], q[1])) { bad('shoot runs over the wood', g.kid); break; }
      for (const el of Array.from(g.g?.querySelectorAll('.gb-lf.bud:not(.gone)') ?? []) as any[]) {
        const q = el.__q, th = q[2] * Math.PI / 180, sc = q[3] || 1;
        if ([4, 8, 12, 15].some((d) => onWood(q[0] + Math.cos(th) * d * sc, q[1] + Math.sin(th) * d * sc))) bad('shoot leaf over the wood', g.kid);
      }
      for (const h of gs) if (h !== g && Math.hypot(g.base[0] - h.base[0], g.base[1] - h.base[1]) < 40 * kq - 0.01) bad('two shoots within 40 px', [g.kid, h.kid]);
    }
    // a knot with no room for a shoot keeps its checks as a dormant bud on its own boss
    for (const g of rest) {
      out.dormant++;
      const kn = T0.knots.find((q: any) => q.id === g.kid);
      if (kn && Math.hypot(g.base[0] - kn.bp[0] - X0, g.base[1] - kn.bp[1]) > kn.rb + 0.5) bad('dormant bud not on its own knot', g.kid);
      // it rises, or on a limb's underside stands out about level; it never hangs
      if (g.tip[1] - g.base[1] > 0.4 * Math.hypot(g.tip[0] - g.base[0], g.tip[1] - g.base[1])) bad('dormant bud hangs', g.kid);
      if ([0.5, 0.75, 1].some((f) => onWood(g.base[0] + (g.tip[0] - g.base[0]) * f, g.base[1] + (g.tip[1] - g.base[1]) * f))) bad('dormant bud grows back into the wood', g.kid);
    }
    // its count of the checks its leaves do not show: a bud-shaped tag tied at its own tip
    for (const g of [...gs, ...rest]) {
      const t = g.g?.querySelector('.shtag'), shown = !!t && getComputedStyle(t).display !== 'none';
      out.counts.push({ parts: g.uids.map(label), leaves: g.g ? g.g.querySelectorAll('.gb-lf.bud:not(.gone)').length : 0, more: shown ? Number(String(t.querySelector('.shn').textContent).replace('+', '')) : 0 });
      if (!shown) continue;
      out.tags++;
      const tie = (t.querySelector('.shtie')?.getAttribute('d') ?? '').match(/[-\d.]+/g)?.map(Number) ?? [], bud = t.querySelector('.sbud'), r = bud.getBBox();
      if (Math.hypot(tie[0]! - g.tip[0], tie[1]! - g.tip[1]) > 3) bad('count tied off its shoot tip', g.kid);
      if (tie[2]! < r.x - 1 || tie[2]! > r.x + r.width + 1 || tie[3]! < r.y - 1 || tie[3]! > r.y + r.height + 1) bad('tie ends off its tag', g.kid);
      // tied in the open: the tie never runs over or behind the wood to a tag on the limb's far side
      for (let i = 1; i <= 10; i++) { const f = i / 10; if (onWood(tie[0]! + (tie[2]! - tie[0]!) * f, tie[1]! + (tie[3]! - tie[1]!) * f)) { bad('count tied across the wood', g.kid); break; } }
      // a bud, not a pill: round at the tie, drawn to a point away from it
      const d = bud.getAttribute('d') || '', nums = (d.match(/-?[\d.]+/g) || []).map(Number), apex = [nums[0]!, nums[1]!];
      if (/[aA]/.test(d) || Math.hypot(apex[0]! - tie[2]!, apex[1]! - tie[3]!) < Math.max(r.width, r.height) * 0.8) bad('count tag is not a bud pointing away from its tie', g.kid);
    }
    const all = [...gs, ...rest];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i].g?.querySelector('.shtag .sbud'), b = all[j].g?.querySelector('.shtag .sbud');
      if (!a || !b || getComputedStyle(a.parentNode).display === 'none' || getComputedStyle(b.parentNode).display === 'none') continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) bad('two counts overlap', [all[i].kid, all[j].kid]);
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
      if (!el.querySelector('ellipse.gring')) bad('graft bud with no swelling');
    }
    // one swelling of the bark for each flow, or past two one swelling marked with how many: bark-toned, longer along the grain
    // than across it, lit on its rim and tipped with a tiny bud; never a ring
    const byKnot = new Map<string, any[]>();
    for (const r of B.graftR ?? []) byKnot.set(r.kid, [...(byKnot.get(r.kid) ?? []), r]);
    const rgb = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    for (const [kid, rs] of byKnot) {
      const els = rs.map((r: any) => B.bud[r.xid]).filter((e: Element | undefined) => e && !e.classList.contains('gone'));
      const drawn = els.filter((e: Element) => getComputedStyle(e.querySelector('.gsw')!).display !== 'none');
      if (drawn.length !== (rs.length > 2 ? 1 : rs.length)) bad('graft swellings for ' + rs.length + ' flows', [kid, drawn.length]);
      const num = drawn.map((e: Element) => e.querySelector('.gnum')?.textContent ?? '');
      if (rs.length > 2 ? num.join() !== '\u00d7' + rs.length : num.some(Boolean)) bad('graft count', [kid, num]);
      for (const e of drawn) {
        const b = e.querySelector('ellipse.gring')!, rx = Number(b.getAttribute('rx')), ry = Number(b.getAttribute('ry'));
        if (!(rx >= 3.5 && rx <= 5 && ry >= 2 && ry <= 3 && rx > ry)) bad('graft swelling not about 8 by 5', [kid, rx, ry]);
        const [r, g2, bl] = rgb(getComputedStyle(b).fill);
        if (Math.max(r!, g2!, bl!) - Math.min(r!, g2!, bl!) > 50 || g2! > r!) bad('graft swelling not in bark tones', [kid, getComputedStyle(b).fill]);
        if (!e.querySelector('.gcres') || !e.querySelector('.gtip')) bad('graft swelling without its lit rim and bud tip', kid);
        if (e.querySelector('circle:not(.hitc)')) bad('graft bud drawn as a ring', kid);
      }
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
        expect(cards.knot).toMatch(/\d+ in Max · (\d+ part checks? · )?4 existing flows/);
        expect(cards.ring).toContain('existing flow');
        expect(cards.ring).toContain('An existing flow');
        // every knot's part checks are on its own shoot or dormant bud and nowhere else: its leaves and its count add up to what
        // the Outline rolls up for that knot's parts
        expect(g.tags, width + 'px').toBeGreaterThan(0);
        await page.evaluate(() => { const w = (0, eval)('({ gw, growPaint })'); w.gw.pinned = null; w.gw.tree = 'outline'; w.gw.open = { own: true, reg: true }; w.growPaint(); });
        const rolled = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-testid="grow-outline"] .gb-bpf > summary'))
          .map((s) => [s.querySelector('.pn')?.textContent ?? '', /^(\d+) part checks?$/.exec(s.querySelector('.gw-facts .tk')?.textContent ?? '')?.[1]]).filter(([, n]) => n).map(([k, n]) => [k, Number(n)])));
        for (const c of g.counts) expect(c.leaves + c.more, width + 'px ' + c.parts.join(', ')).toBe(c.parts.reduce((a, p) => a + (rolled[p] ?? 0), 0));
        expect(g.counts.flatMap((c) => c.parts).filter((p) => rolled[p]).sort(), width + 'px').toEqual(Object.keys(rolled).sort());
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** The wood a pad sits on, from the drawn page: each branch's girth where it leaves the trunk against the trunk's there, each
   *  limb's two collar fillets (how far each reaches along the parent past the limb's edge, and along the limb past the
   *  parent's edge, in the limb's own base girths), and under each cushion the twigs that show below its underside. */
  const ramify = () => {
    const w = (0, eval)('({ gw })'), B = w.gw.B, L = B.L, svg = B.svg as SVGSVGElement, out = { branches: [] as number[], ends: [] as number[], fillets: [] as Array<{ id: string; along: number[] }>, cushions: [] as Array<{ pid: string; k: number; n: number }> };
    for (const T of L.trees) for (const b of T.br) { out.branches.push(b.b / b.Tk, b.w[0] / b.Tk); out.ends.push(b.w[b.w.length - 1] / b.Tk); }
    // a point and the arc length along a polyline, both ways
    const acc = (p: number[][]) => p.reduce((a: number[], q, i) => (a.push(i ? a[i - 1]! + Math.hypot(q[0]! - p[i - 1]![0]!, q[1]! - p[i - 1]![1]!) : 0), a), []);
    const proj = (p: number[][], q: number[]) => { const A = acc(p); let best = Infinity, s = 0; for (let i = 1; i < p.length; i++) { const a = p[i - 1]!, c = p[i]!, vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, l = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((q[0]! - a[0]!) * vx + (q[1]! - a[1]!) * vy) / l)), d = Math.hypot(q[0]! - a[0]! - vx * t, q[1]! - a[1]! - vy * t); if (d < best) { best = d; s = A[i - 1]! + t * Math.sqrt(l); } } return s; };
    const at = (A: number[], s: number, v: number[]) => { let i = 1; while (i < A.length - 1 && A[i]! < s) i++; const t = Math.max(0, Math.min(1, (s - A[i - 1]!) / ((A[i]! - A[i - 1]!) || 1))); return v[i - 1]! + (v[i]! - v[i - 1]!) * t; };
    for (const e of Array.from(svg.querySelectorAll('path.w')) as any[]) {
      if (!e.__par || !e.__pw || getComputedStyle(e).display === 'none') continue;
      const pts: number[][] = e.__pts, wd: number[] = e.__w, b = wd[0]!, pp: number[][] = e.__par, Tk: number = e.__pw[e.__pk], A = acc(pts), half = at(A, Tk / 2, wd) / 2, sk = acc(pp)[e.__pk]!;
      const fills = (e.__on as Element[]).filter((f) => f.tagName === 'path' && f.isConnected && !f.closest('clipPath') && !f.classList.contains('filsh'));
      const along = fills.map((f) => { const n = (f.getAttribute('d')!.match(/-?[\d.]+/g) ?? []).map(Number), a = [n[0]!, n[1]!], c = [n[4]!, n[5]!]; return [(Math.abs(proj(pp, a) - sk) - half) / b, (proj(pts, c) - Tk / 2) / b]; }).flat();
      out.fillets.push({ id: e.getAttribute('class') + ' ' + Math.round(pts[0]![0]!) + ',' + Math.round(pts[0]![1]!), along });
    }
    // every cushion as drawn, its lowest edge and its span; every twig as drawn, sampled every half pixel
    const fills = Array.from(svg.querySelectorAll('.jg .pfill')).filter((f) => f.getBoundingClientRect().width > 0 && getComputedStyle(f.closest('.cush') ?? f).display !== 'none') as SVGGeometryElement[];
    const pt = svg.createSVGPoint(), inFill = (x: number, y: number) => fills.some((f) => { const m = f.getScreenCTM()!.inverse().multiply(svg.getScreenCTM()!), q = new DOMPoint(x, y).matrixTransform(m); pt.x = q.x; pt.y = q.y; return f.isPointInFill(pt); });
    const twigs = (Array.from(svg.querySelectorAll('path.tw')) as any[]).filter((t) => t.__pts && t.getBoundingClientRect().width > 0).map((t) => { const p: number[][] = t.__pts, s: number[][] = []; for (let i = 1; i < p.length; i++) { const a = p[i - 1]!, c = p[i]!, n = Math.max(1, Math.ceil(Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!) * 2)); for (let j = 0; j < n; j++) s.push([a[0]! + (c[0]! - a[0]!) * j / n, a[1]! + (c[1]! - a[1]!) * j / n]); } return s; });
    for (const pid in B.pad) {
      const P = B.pad[pid]; if (getComputedStyle(P.jg).display === 'none') continue;
      P.cu.forEach((c: any, k: number) => {
        const f = c.el.querySelector('.pfill') as SVGGraphicsElement; if (!f || f.getBoundingClientRect().width === 0 || getComputedStyle(c.el).display === 'none') return;
        const bb = f.getBBox(), m = svg.getScreenCTM()!.inverse().multiply(f.getScreenCTM()!), p0 = new DOMPoint(bb.x, bb.y).matrixTransform(m), p1 = new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m);
        const n = twigs.filter((s) => s.some((q) => q[0]! > p0.x && q[0]! < p1.x && q[1]! >= p1.y + 4 && q[1]! <= p1.y + 8 && !inFill(q[0]!, q[1]!))).length;
        out.cushions.push({ pid, k, n });
      });
    }
    return out;
  };

  it('grows each branch about four tenths of its trunk, filleted into it, onto ramified wood: two or more forked twigs under every cushion, showing below its underside', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) {
        const page = await growPage(browser, server.url, folded(file), 1440);
        await page.waitForTimeout(2500);
        const r = await page.evaluate(ramify);
        // a branch leaves at about four tenths of the trunk's girth there, as drawn: never under .36 or over .45 of it
        expect(r.branches.length, name).toBeGreaterThan(0);
        for (const q of r.branches) { expect(q, name + ' branch/trunk').toBeGreaterThanOrEqual(.36); expect(q, name + ' branch/trunk').toBeLessThanOrEqual(.45); }
        // and tapers to about .15 of it in its pad
        for (const q of r.ends) { expect(q, name + ' branch end/trunk').toBeGreaterThanOrEqual(.12); expect(q, name + ' branch end/trunk').toBeLessThanOrEqual(.18); }
        // each limb's two fillets are round its collar with a radius of about 1.2 of its base girth, on the parent and on itself
        // (read back off the drawn outline, so to within an eighth where the parent bends)
        expect(r.fillets.length, name).toBeGreaterThan(1);
        for (const f of r.fillets) {
          expect(f.along.length, name + ' ' + f.id).toBe(4);
          for (const v of f.along) { expect(v, name + ' fillet ' + f.id).toBeGreaterThanOrEqual(1.05); expect(v, name + ' fillet ' + f.id).toBeLessThanOrEqual(1.35); }
        }
        // under every cushion at least two twigs show, four to eight pixels below its lowest edge, clear of every cushion
        expect(r.cushions.length, name).toBeGreaterThan(2);
        for (const c of r.cushions) expect(c.n, name + ' twigs under ' + c.pid + ' cushion ' + c.k).toBeGreaterThanOrEqual(2);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  /** Every leaf that hangs as drawn: how much of the twig it hangs from lies under a cushion, and whether its stem, the last ten
   *  pixels of that twig, leaves wood that shows. */
  const hung = () => {
    const B = (0, eval)('gw').B, svg = B.svg as SVGSVGElement, out = { n: 0, bad: [] as string[] };
    const shown = (e: Element) => e.getBoundingClientRect().width > 0 && !e.closest('.off, .gone, .cut') && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0';
    const fills = (Array.from(svg.querySelectorAll('.pfill')) as SVGGeometryElement[]).filter((f) => shown(f) && shown(f.closest('.cush') ?? f));
    const wood = (Array.from(svg.querySelectorAll('path.w, path.tw')) as SVGGeometryElement[]).filter(shown);
    const pt = svg.createSVGPoint(), inEl = (e: SVGGeometryElement, x: number, y: number) => { const m = e.getScreenCTM()!.inverse().multiply(svg.getScreenCTM()!), q = new DOMPoint(x, y).matrixTransform(m); pt.x = q.x; pt.y = q.y; return e.isPointInFill(pt); };
    const under = (x: number, y: number) => fills.some((f) => inEl(f, x, y));
    for (const pid in B.pad) {
      const P = B.pad[pid]; if (!shown(P.jg)) continue;
      for (const [id, sl] of P.geo.slot as Map<string, number[]>) {
        const tw = ((B.ltw ?? {})[id] ?? [])[0], leaf = B.leaf[id];
        if (!sl[4] || !tw || !leaf || !shown(tw) || leaf.classList.contains('cut') || leaf.classList.contains('gone')) continue;
        out.n++;
        const p: number[][] = tw.__pts, s: number[][] = [], A: number[] = [0];
        for (let i = 1; i < p.length; i++) { const a = p[i - 1]!, c = p[i]!, l = Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!), n = Math.max(1, Math.ceil(l * 2)); A.push(A[i - 1]! + l); for (let j = 0; j < n; j++) s.push([a[0]! + (c[0]! - a[0]!) * j / n, a[1]! + (c[1]! - a[1]!) * j / n]); }
        // no more than two fifths of the twig it hangs from lies under a cushion
        const hid = s.filter((q) => under(q[0]!, q[1]!)).length / s.length;
        if (hid > 0.4) out.bad.push(pid + ' ' + id + ': ' + Math.round(hid * 100) + '% of its twig under a cushion');
        // its stem leaves wood that shows: the stem's base clear of every cushion, with wood within two pixels of it
        const L = A[A.length - 1]! - 10; let i = 1; while (i < A.length - 1 && A[i]! < L) i++;
        const f = Math.max(0, Math.min(1, (L - A[i - 1]!) / ((A[i]! - A[i - 1]!) || 1))), b = [p[i - 1]![0]! + (p[i]![0]! - p[i - 1]![0]!) * f, p[i - 1]![1]! + (p[i]![1]! - p[i - 1]![1]!) * f];
        if (under(b[0]!, b[1]!)) out.bad.push(pid + ' ' + id + ': its stem leaves wood under a cushion ' + JSON.stringify(b.map(Math.round)));
        else if (![0, 1, 2].some((r) => Array.from({ length: r ? 12 : 1 }, (_, k) => [b[0]! + r * Math.cos(k * Math.PI / 6), b[1]! + r * Math.sin(k * Math.PI / 6)]).some((q) => wood.some((e) => inEl(e, q[0]!, q[1]!)))))
          out.bad.push(pid + ' ' + id + ': its stem leaves no wood ' + JSON.stringify(b.map(Math.round)));
      }
    }
    return out;
  };

  /** The leader's end, painted fresh in the page with this state: its last girth against its foot's, the outline round its end
   *  (each point of it past the end of the spine, as a fraction of the half-girth there, and how far the end bows out of
   *  a straight cut), and, with the trunk's reveal held at a quarter, a half and three quarters of its length, the wood that
   *  shows along the spine: the front the last of it, its width a quarter of a caliper behind the front against one caliper
   *  behind it, how far off the spine it sits there (against the width one caliper back, or 5 px on a thin sapling), and how
   *  much of its own girth shows one caliper back. */
  const tip = ({ s, v }: { s: unknown; v: unknown }) => {
    const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.gw.tree = 'grove'; w.growPaint();
    const B = w.gw.B, T = B.L.trees[0], el = (Array.from(B.svg.querySelectorAll('path.w')) as any[]).find((e) => e.__w === T.tw);
    const out = { apex: T.tw.at(-1) / T.tw[0], cap: [] as number[], bow: 0, fronts: [] as Array<{ f: number; ratio: number; off: number; girth: number }> };
    const P: number[][] = el.__pts, e = P.at(-1)!, b = P.at(-2)!, m = Math.hypot(e[0]! - b[0]!, e[1]! - b[1]!) || 1, t = [(e[0]! - b[0]!) / m, (e[1]! - b[1]!) / m], r = T.tw.at(-1) / 2;
    const cap: number[][] = [];
    for (let l = 0, L = el.getTotalLength(); l <= L; l += 0.05) { const q = el.getPointAtLength(l), d = [q.x - e[0]!, q.y - e[1]!]; if (d[0]! * t[0]! + d[1]! * t[1]! > 0.02 && Math.hypot(d[0]!, d[1]!) < 2.5 * r + 0.5) cap.push([q.x, q.y]); }
    out.cap = cap.map((q) => Math.hypot(q[0]! - e[0]!, q[1]! - e[1]!) / r);
    if (cap.length > 1) { const a = cap[0]!, z = cap.at(-1)!, cl = Math.hypot(z[0]! - a[0]!, z[1]! - a[1]!) || 1; out.bow = Math.max(...cap.map((q) => Math.abs((z[0]! - a[0]!) * (q[1]! - a[1]!) - (z[1]! - a[1]!) * (q[0]! - a[0]!)) / cl)) / r; }
    // the trunk's own reveal, held: its clip as computed at that moment, in the drawing's space, and the wood inside it
    const g = B.grow.find((q: any) => q.el === el), [vx, vy] = B.vb, A = [0];
    for (let i = 1; i < P.length; i++) A.push(A[i - 1]! + Math.hypot(P[i]![0]! - P[i - 1]![0]!, P[i]![1]! - P[i - 1]![1]!));
    const len = A.at(-1)!, at = (d: number) => {
      let j = 1; while (j < P.length - 1 && A[j]! < d) j++;
      const u = Math.max(0, Math.min(1, (d - A[j - 1]!) / ((A[j]! - A[j - 1]!) || 1))), a = P[j - 1]!, c = P[j]!, n = Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!) || 1;
      return { p: [a[0]! + (c[0]! - a[0]!) * u, a[1]! + (c[1]! - a[1]!) * u], n: [-(c[1]! - a[1]!) / n, (c[0]! - a[0]!) / n], w: T.tw[j - 1] + (T.tw[j] - T.tw[j - 1]) * u };
    };
    const clip = document.createElementNS('http://www.w3.org/2000/svg', 'path'), pt = B.svg.createSVGPoint(); B.svg.append(clip);
    const shows = (x: number, y: number) => { pt.x = x; pt.y = y; return clip.isPointInFill(pt) && el.isPointInFill(pt); };
    for (const f of [0.25, 0.5, 0.75]) {
      if (!g || !g.a) break;
      const u = 1 - Math.pow(1 - Math.max(0, (f - g.f0) / (1 - g.f0)), 1 / 2.2);
      for (const a of g.a) { a.pause(); a.currentTime = u * g.ms; }
      const n = (getComputedStyle(g.cw).clipPath.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number), q: string[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) q.push(n[i]! + vx + ' ' + (n[i + 1]! + vy));
      clip.setAttribute('d', 'M' + q.join(' L') + 'Z');
      let F = -1; for (let d = 0; d <= len; d += 0.25) { const o = at(d); if (shows(o.p[0]!, o.p[1]!)) F = d; else if (F >= 0 && d - F > 3) break; }
      const side = (d: number, sd: number) => { const o = at(d); let k = 0; for (let h = 0.05; h < o.w; h += 0.05) { if (shows(o.p[0]! + o.n[0]! * h * sd, o.p[1]! + o.n[1]! * h * sd)) k = h; else break; } return k; };
      const c = at(F).w, nl = side(F - c / 4, 1), nr = side(F - c / 4, -1), back = side(F - c, 1) + side(F - c, -1);
      out.fronts.push({ f, ratio: (nl + nr) / back, off: Math.abs(nl - nr) / Math.max(5, back), girth: back / at(F - c).w });
    }
    clip.remove();
    return out;
  };

  it('ends the leader in a round tip a third of its foot or less, and grows it out with a rounded front that tapers along the curve, never a sawn-off stub', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    // a sapling: the plotline grow before its first journey is found; and the tree it grows into
    const sap = freshGrow();
    for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', 'plotline-seats.jsonl'), 'utf8').split('\n')) { if (!line.trim()) continue; const ev = JSON.parse(line) as GrowEvent; if (ev.kind === 'journey.found') break; applyGrow(sap, ev); }
    const tree = { ...folded('plotline-seats.jsonl'), asked: true, modeBy: null, mode: 'min' as const };
    try {
      for (const [s, name, width] of [[sap, 'sapling', 1440], [tree, 'tree', 1440], [tree, 'tree', 390]] as const) {
        const at = name + ' ' + width;
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await page.goto(server.url);
        await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
        await page.getByTestId('grow').waitFor();
        const o = await page.evaluate(tip, { s, v: growView(s as never) });
        if (name === 'sapling') expect(o.apex, at + ' its tip against its foot').toBeLessThanOrEqual(0.35);
        // the end is a half circle round the end of the spine, never a flat or slanted cut
        expect(o.cap.length, at).toBeGreaterThan(8);
        expect(Math.min(...o.cap), at + ' its end inside a half circle').toBeGreaterThanOrEqual(0.85);
        expect(Math.max(...o.cap), at + ' its end outside a half circle').toBeLessThanOrEqual(1.15);
        expect(o.bow, at + ' its end bows out of a straight cut').toBeGreaterThan(0.5);
        // growing: a quarter of a caliper behind its front the wood is under two fifths as wide as one caliper behind it, where
        // it shows its whole girth; and it is centred on the spine, so the front follows the curve
        expect(o.fronts.length, at).toBe(3);
        for (const fr of o.fronts) {
          expect(fr.ratio, at + ' at ' + fr.f).toBeLessThanOrEqual(0.4);
          expect(fr.girth, at + ' at ' + fr.f + ' one caliper back').toBeGreaterThanOrEqual(0.85);
          expect(fr.off, at + ' at ' + fr.f + ' off the spine').toBeLessThanOrEqual(0.2);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  it('hangs each failure from a twig that shows: run out under its cushion to it, its stem leaving that twig\'s underside', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [file, name] of recorded) for (const width of [1440, 390]) {
        const page = await growPage(browser, server.url, folded(file), width);
        await page.waitForTimeout(2500);
        const h = await page.evaluate(hung);
        expect(h.n, name + ' ' + width).toBeGreaterThan(0);
        expect(h.bad, name + ' ' + width).toEqual([]);
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
      const a = own(el)[0], c = el.querySelector('ellipse.gring'); if (!a || !c) continue;
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

  /** Everything one paint cut, read off the motion it set going. What grew in a chosen mode (real) is snipped at its collar
   *  and falls: the turn, the drop and the fade, and the callus the cut heals with. What was only ever previewed shrinks back
   *  into its collar as it fades, and leaves no mark. */
  const cuts = (real: boolean) => {
    const B = (0, eval)('gw').B, hf = B.svg.getBoundingClientRect().width / B.svg.viewBox.baseVal.width;
    const out = { shoots: 0, leaves: 0, calluses: 0, order: [] as number[][], bad: [] as string[] };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    const own = (el: Element | null | undefined) => (el ? el.getAnimations().filter((a: any) => a.transitionProperty === undefined && a.animationName === undefined) : []);
    // a colour's luminance, from rgb() or from the color(srgb ...) a color-mix() computes to
    const lum = (c: string) => { const n = (c.match(/[\d.]+/g) ?? []).map(Number), k = /^color\(srgb/.test(c) ? 1 : 1 / 255; return (0.2126 * n[0]! + 0.7152 * n[1]! + 0.0722 * n[2]!) * k; };
    const keys = (a: Animation) => (a.effect as KeyframeEffect).getKeyframes();
    const TR = /translate\(([-\d.]+)px, ?([-\d.]+)px\) translate\(([-\d.]+)px, ?([-\d.]+)px\) rotate\(([-\d.]+)deg\)/;
    const SC = /translate\(([-\d.]+)px, ?([-\d.]+)px\) scale\(([\d.]+)\) translate\(([-\d.]+)px, ?([-\d.]+)px\)/;
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
    // taken back: about a third of a second, gathering speed, shrinking to nothing about its collar as it fades, never turning
    const back = (a: Animation | undefined, what: string, at?: [number[], number]) => {
      if (!a) { bad(what + ' is not taken back'); return -1; }
      const t = a.effect!.getTiming(), ks = keys(a), k0 = ks[0]!, z = ks[ks.length - 1]!, m0 = String(k0.transform).match(SC), m = String(z.transform).match(SC);
      if (t.duration !== 360) bad(what + ' goes back over', t.duration);
      if (!/^ease-in$|^cubic-bezier\(0\.42, 0, 1, 1\)$/.test(String(t.easing))) bad(what + ' does not gather speed', t.easing);
      if (ks.some((k) => /rotate/.test(String(k.transform)))) bad(what + ' turns or falls, though it never grew', what);
      if (!m0 || !m || Number(m0[3]) !== 1 || Number(m[3]) > 0.05 || Number(k0.opacity) !== 1 || Number(z.opacity) !== 0) { bad(what + ' does not shrink to nothing as it fades', [k0.transform, z.transform]); return Number(t.delay); }
      if (Math.abs(Number(m[1]) + Number(m[4])) > 0.02 || Math.abs(Number(m[2]) + Number(m[5])) > 0.02 || m[1] !== m0[1] || m[2] !== m0[2]) bad(what + ' does not shrink about one point', z.transform);
      if (at && Math.hypot(Number(m[1]) - at[0][0]!, Number(m[2]) - at[0][1]!) > at[1]) bad(what + ' does not go back into its collar', [m[1], m[2], at[0]]);
      return Number(t.delay);
    };
    // a healed cut: a small roll of callus in the bark's own tones with a lit crescent on its lip, never a pale disc; on the
    // wood that stays; under any knot it touches, so a knot is always a raised boss above it; beside its knot, never on it
    const wood = getComputedStyle(B.svg.querySelector('path.w')).fill, knots = Array.from(B.svg.querySelectorAll('.kn')) as Element[];
    const woods = (Array.from(B.svg.querySelectorAll('path.w')) as SVGPathElement[]).filter((p) => p.getBoundingClientRect().width > 0);
    const callus = (sc: Element | null | undefined, what: string, boss?: { p: number[]; ra: number } | null) => {
      if (!sc || !sc.classList.contains('on') || getComputedStyle(sc).display === 'none') return bad('no callus where ' + what + ' was cut');
      out.calluses++;
      const cal = sc.querySelector('ellipse.cal'), cres = sc.querySelector('path.cres');
      if (!cal || !cres) return bad(what + ': a callus without its roll or its lit crescent');
      const fc = getComputedStyle(cal), lip = getComputedStyle(cres).stroke;
      if (/url\(/.test(fc.fill) || fc.stroke === 'none') bad(what + ': callus shaded, or with no rim');
      if (Math.abs(lum(fc.fill) - lum(wood)) > 0.15) bad(what + ': callus not in the bark’s tones', [fc.fill, wood]);
      if (lum(lip) < lum(fc.fill) + 0.1) bad(what + ': its crescent is not lit', [lip, fc.fill]);
      const cb = sc.getBoundingClientRect(), near = knots.filter((k) => { const r = (k.querySelector('.ring') ?? k).getBoundingClientRect(); return cb.left < r.right + 1 && r.left < cb.right + 1 && cb.top < r.bottom + 1 && r.top < cb.bottom + 1; });
      if (near.some((k) => !(sc.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING))) bad(what + ': callus over a knot');
      const c = [Number(cal.getAttribute('cx')), Number(cal.getAttribute('cy'))];
      if (!woods.some((p) => p.isPointInFill(new DOMPoint(c[0], c[1])))) bad(what + ': callus off the wood', c);
      if (boss) {
        const d = Math.hypot(c[0]! - boss.p[0]!, c[1]! - boss.p[1]!);
        if (d < boss.ra) bad(what + ': callus on its knot', [d, boss.ra]);
        if (d > boss.ra + 14) bad(what + ': callus away from its knot', [d, boss.ra]);
      }
    };
    for (const g of new Set(Object.values(B.shoots ?? {})) as Set<any>) {
      if (!g.fade) continue;
      out.shoots++;
      const a = own(g.fl)[0], d = real ? fall(a, 'shoot ' + g.kid, [g.base, 0.1]) : back(a, 'shoot ' + g.kid, [g.base, 0.1]);
      out.order.push([g.base[1], d]);
      if (!g.g.classList.contains('pv-out')) bad('a cut shoot loses its preview look', g.kid);
      if (g.fl.querySelector('.gb-lf.pv-add')) bad('a cut shoot\'s leaf turns green', g.kid);
      // a shoot that grew heals where it was cut, beside its knot, from the snip, unless its branch goes too; one that never grew leaves nothing
      const bp = g.bid ? B.pad[g.bid] : null;
      if (real && !(bp && bp.pruned)) {
        callus(g.scar, 'shoot ' + g.kid, g.boss);
        const sa = own(g.scar)[0]; if (sa && Number(sa.effect!.getTiming().delay) > d) bad('callus shows after the snip', g.kid);
      } else if (g.scar?.classList.contains('on')) bad(real ? 'a callus on a branch that is cut away' : 'a mark where a shoot that never grew was', g.kid);
      // its count does not fall: it fades at the snip, in about 120 ms
      const tag = g.ctag;
      if (tag && getComputedStyle(tag).display !== 'none') {
        const ta = own(tag)[0];
        if (!ta) bad('count does not fade', g.kid);
        else { const t = ta.effect!.getTiming(); if (t.duration !== 120 || Number(t.delay) !== d || keys(ta).some((k) => k.transform)) bad('count does not just fade at the snip', [t.duration, t.delay, d]); }
      }
    }
    const groups = new Set<string>();
    for (const id in B.leaf) {
      const el = B.leaf[id]; if (!el.classList.contains('cut')) continue;
      out.leaves++;
      if (!el.classList.contains('pv-out')) bad('a cut leaf loses its preview look', id);
      // its twig goes with it, about where it left the wood
      const P = B.pad[el.__p], collar = P.rt.lt[id]?.pts[0], d = real ? fall(el.__fall?.[0], 'leaf ' + id) : back(el.__fall?.[0], 'leaf ' + id);
      if (el.__fall?.[1]) (real ? fall : back)(el.__fall[1], 'twig of ' + id, [collar, 0.1]);
      out.order.push([el.__y, d]);
      // one callus for the leaves a cushion lost, at the collar of one of them, where the bark shows; none for one that never grew
      const sc = B.scar?.[id];
      if (sc?.classList.contains('on')) {
        if (!real) bad('a mark where a leaf that never grew was', id);
        const k = el.__p + ':' + P.geo.cOf.get(id) + (P.geo.cs[P.geo.cOf.get(id)].hang.some((q: any) => q.id === id) ? 'h' : '');
        if (groups.has(k)) bad('a cushion’s cut leaves heal in more than one place', k); groups.add(k);
        callus(sc, 'leaf ' + id);
      }
    }
    if (real && !groups.size) bad('no leaf’s cut heals where the bark shows');
    if (!real && B.svg.querySelector('.heal.on')) bad('a mark left by what never grew');
    // from the apex down, one about every 40 ms
    out.order.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    for (let i = 1; i < out.order.length; i++) if (out.order[i]![1]! < out.order[i - 1]![1]!) bad('cut out of turn from the apex down', [out.order[i - 1], out.order[i]]);
    const ds = [...new Set(out.order.map((o) => o[1]!))].sort((a, b) => a - b);
    if (ds.length && ds[0] !== 0) bad('the first cut waits', ds[0]);
    for (let i = 1; i < ds.length; i++) if (ds[i]! < 600 && Math.abs(ds[i]! - ds[i - 1]! - 40) > 1) bad('cuts not 40 ms apart', ds);
    return out;
  };

  /** Once the leaves have gone, each branch the mode keeps nothing of: cut flush at the trunk, the collar and fillets it laid on
   *  the trunk gone with it, so nothing of it stands proud of the bark; healed with a callus if it grew (real), with no mark if
   *  it was only ever previewed; how it went, if it moved. And the crown, the tree's apex, keeps its outline, dimmed, over its wood. */
  const branches = ({ real, moving }: { real: boolean; moving: boolean }) => {
    const B = (0, eval)('gw').B, out = { cut: 0, bad: [] as string[] };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    for (const pid in B.brEl) {
      const P = B.pad[pid], E = B.brEl[pid]; if (!P || !P.cut) continue;
      out.cut++;
      if (!P.jg.classList.contains('pruned') || getComputedStyle(P.jg).display !== 'none') bad('a cut branch still shows', pid);
      if ((E.on ?? []).length < 3 || E.on.some((e: SVGElement) => e.style.display !== 'none')) bad('a cut branch leaves its collar or fillets on the trunk', pid);
      const a = ((window as any).__an.get(P.jg) ?? []).at(-1) as Animation | undefined, ks = a ? (a.effect as KeyframeEffect).getKeyframes() : [];
      const sc = String(ks.at(-1)?.transform ?? '').match(/translate\(([-\d.]+)px, ?([-\d.]+)px\) scale\(([\d.]+)\)/);
      if (real) {
        if (!E.stub.classList.contains('on')) bad('no callus where a branch that grew was cut', pid);
        if (!E.stub.querySelector('ellipse.cal') || !E.stub.querySelector('path.cres')) bad('the branch’s callus has no roll or crescent', pid);
        if (moving && sc) bad('a branch that grew shrinks back instead of being cut and dropped', pid);
      } else {
        if (E.stub.classList.contains('on')) bad('a mark where a branch that never grew was', pid);
        if (moving && (!sc || Number(sc[3]) > 0.05 || Math.hypot(Number(sc[1]) - E.col[0], Number(sc[2]) - E.col[1]) > 0.1)) bad('a branch that never grew is not taken back into its collar', [pid, ks.at(-1)?.transform]);
      }
    }
    for (const pid in B.pad) {
      const P = B.pad[pid]; if (!P.crown || !P.pruned) continue;
      if (getComputedStyle(P.jg).display === 'none' || P.cu.some((u: any) => u.el.classList.contains('off'))) bad('the crown is cut away, leaving its wood bare', pid);
    }
    return out;
  };


  /** The bushy tree with what Max adds: two existing flows through a part of the first journey, and four to six part checks
   *  on each part, so Max has shoots, counts and graft buds to grow and Min to cut. */
  function withMax(state: Awaited<ReturnType<typeof grownBushy>>['state']) {
    const j1 = state.journeys[0]!, unit = j1.units.find((id) => state.scenarios.some((x) => x.unit === id && x.mode === 'max' && !x.journey)) ?? j1.units[0]!;
    const src = { ...(state.scenarios.find((x) => x.unit === unit) ?? state.scenarios[0]!) };
    delete src.level; delete src.polarity;
    for (let i = 0; i < 2; i++) state.scenarios.push({ ...src, id: 'rg' + i, unit, journey: null, scenarioKind: 'regression', mode: 'max', title: 'An existing flow ' + (i + 1) + ' still holds', flow: 'flow.' + i, criteria: [], modeWhy: 'regression' });
    state.journeys.flatMap((j) => j.units).forEach((id, i) => {
      for (let k = 0; k <= (i % 3) + 3; k++) state.scenarios.push({ ...src, id: 'pc' + i + '-' + k, unit: id, journey: null, level: 'part', scenarioKind: 'happy', mode: 'max', title: 'Part ' + id + ' alone ' + (k + 1), flow: null, criteria: [], modeWhy: 'part on its own' });
    });
    return state;
  }
  type Browser = Awaited<ReturnType<typeof chromium.launch>>;
  /** A page on the tree for this state, its motion logged; TG_THROTTLE=6 slows its CPU like a busy CI runner. */
  async function treePage(browser: Browser, url: string, s: unknown, o: { width: number; scheme?: 'light' | 'dark'; reduce?: boolean; height?: number }) {
    const page = await browser.newPage({ viewport: { width: o.width, height: o.height ?? 1000 }, colorScheme: o.scheme ?? 'light', ...(o.reduce ? { reducedMotion: 'reduce' as const } : {}) });
    if (process.env.TG_THROTTLE && !o.reduce) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.TG_THROTTLE) }); }
    await page.addInitScript(logAnimations);
    await page.goto(url);
    await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
    await page.getByTestId('grow').waitFor();
    await paintState(page, s);
    await page.getByTestId('grow-view-grove').click();
    await expect.poll(() => page.evaluate(() => Object.keys((0, eval)('gw').B?.pad ?? {}).length)).toBeGreaterThan(0);
    return page;
  }
  const paintState = (page: import('playwright').Page, s: unknown) => page.evaluate(({ s, v }) => { const w = (0, eval)('({ gw, growPaint })'); w.gw.state = s; w.gw.view = v; w.gw.saved = Date.now(); w.growPaint(); }, { s, v: growView(s as never) });
  /** Until every motion the tree set going has ended, the wood has grown and every falling leaf is gone. */
  const settled = (page: import('playwright').Page) => page.waitForFunction(() => {
    const B = (0, eval)('gw').B, log: Map<Element, Animation[]> = (window as any).__an, end = (a: Animation) => Number(a.effect?.getComputedTiming().endTime ?? 0);
    // a fall is played as an Animation of its own, not through animate(), so it is read off the document; one not yet started is not over
    const live = document.getAnimations().filter((a) => { const e = a.effect as KeyframeEffect | null; return !!e?.target && B.svg.contains(e.target) && e.getTiming().iterations !== Infinity; });
    const ends = [...log.values()].flat().map((a) => Number(a.startTime ?? 0) + end(a)).concat(live.map((a) => (a.startTime === null ? Infinity : Number(a.startTime) + end(a))), B.grow.map((g: any) => g.t0 + g.ms));
    return performance.now() > Math.max(...ends) + 50 && !B.svg.querySelector('.gb-lf.cut');
  }, null, { timeout: 30000 });

  it('grows nothing ahead of its wood, and takes back into its collar, with no mark, what was only ever shown before a choice', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    // asked, not yet chosen: the tree grows, then Min is pointed at and picked; nothing had grown in a chosen mode
    const asked = { ...state, asked: true, modeBy: null, mode: 'min' as const };
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        const page = await treePage(browser, server.url, asked, { width, scheme });
        // a look compared before and after the cut is the look itself, not a colour part way through a transition
        await page.addStyleTag({ content: '.gw-svg.gb, .gw-svg.gb * { transition: none !important; }' });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const t = await page.evaluate(timing);
        expect(t.bad, width + 'px').toEqual([]);
        for (const k of ['wood', 'leaves', 'cush', 'labels', 'shoots', 'grafts'] as const) expect(t[k], width + 'px ' + k).toBeGreaterThan(0);
        // once it has grown, pointing at Min greys what it would cut; picking it takes them back, from that grey
        await settled(page);
        const before = await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); return null; }).then(() => page.evaluate(looks));
        const c = await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); return null; }).then(() => page.evaluate(cuts, false));
        expect(c.bad, width + 'px').toEqual([]);
        expect(c.shoots, width + 'px').toBeGreaterThan(1);
        expect(c.leaves, width + 'px').toBeGreaterThan(1);
        expect(c.calluses, width + 'px').toBe(0);
        const after = await page.evaluate(looks);
        const changed = Object.keys(after).filter((k) => k in before && before[k] !== after[k]).map((k) => [k, before[k], after[k]]);
        expect(changed, width + 'px').toEqual([]);
        expect(Object.keys(after).filter((k) => k in before).length, width + 'px').toBeGreaterThan(10);
        // then each branch Min keeps nothing of goes back into its collar, and the Minimum tree at rest has no mark of a cut
        await settled(page);
        const b = await page.evaluate(branches, { real: false, moving: true });
        expect(b.bad, width + 'px').toEqual([]);
        expect(b.cut, width + 'px').toBeGreaterThan(0);
        expect(await page.evaluate(() => (0, eval)('gw').B.svg.querySelectorAll('.heal.on').length), width + 'px').toBe(0);
        await page.close();
      }
      // with reduced motion nothing grows or goes: the tree is there at once, and what is cut is just gone, with no mark
      const page = await treePage(browser, server.url, asked, { width: 1440, reduce: true });
      const moving = () => { const B = (0, eval)('gw').B, log: Map<Element, Animation[]> = (window as any).__an; return document.getAnimations().filter((a) => { const e = a.effect as KeyframeEffect | null; return !!e?.target && B.svg.contains(e.target) && a.playState !== 'finished'; }).map((a) => (a.effect as KeyframeEffect).target!.getAttribute('class')).concat([...log.keys()].filter((e) => B.svg.contains(e)).map((e) => 'animated ' + e.getAttribute('class'))); };
      expect(await page.evaluate(moving)).toEqual([]);
      await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); });
      expect(await page.evaluate(moving)).toEqual([]);
      const rest = await page.evaluate(() => {
        const B = (0, eval)('gw').B, gs = [...(new Set(Object.values(B.shoots ?? {})) as Set<any>)];
        return { cut: B.svg.querySelectorAll('.gb-lf.cut').length, marks: B.svg.querySelectorAll('.heal.on').length, shown: gs.filter((g) => g.g.style.display !== 'none').length, shoots: gs.length };
      });
      expect(rest.cut).toBe(0);
      expect(rest.marks).toBe(0);
      expect(rest.shown).toBe(0);
      expect(rest.shoots).toBeGreaterThan(1);
      expect((await page.evaluate(branches, { real: false, moving: false })).bad).toEqual([]);
      await page.close();
    } finally { await browser.close(); }
  }, 120000);

  /** A grow folded from a recorded discovery log: plotline-seats (two journeys, one scenario failed, Minimum) and tracegrove
   *  itself (two journeys through twelve parts, Max, nothing run yet). */
  const recordedGrow = (name: string) => {
    const s = freshGrow();
    for (const line of readFileSync(join(import.meta.dirname, 'fixtures', 'grow-logs', name), 'utf8').split('\n')) if (line.trim()) applyGrow(s, JSON.parse(line) as GrowEvent);
    return s;
  };

  it('says a pad’s final words in the same paint a mode is picked: what it keeps and cuts only while a mode is pointed at before a choice, never with what was pruned', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    // each pad's state line, both its lines as one
    const words = () => { const B = (0, eval)('gw').B; return Object.fromEntries(Object.keys(B.lbl).filter((id) => !B.lbl[id].badge).map((id) => [id, [B.lbl[id].t2.textContent, B.lbl[id].t3.textContent].filter(Boolean).join(' · ')])) as Record<string, string>; };
    try {
      for (const s of [state, recordedGrow('plotline-seats.jsonl')]) {
        // asked, so nothing has run yet
        const asked = { ...s, asked: true, modeBy: null, mode: 'min' as const, run: {} };
        const page = await treePage(browser, server.url, asked, { width: 1440 });
        await settled(page);
        const pointed = await page.evaluate((f) => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); return (0, eval)('(' + f + ')')(); }, words.toString()) as Record<string, string>;
        expect(Object.values(pointed).some((t) => /keeps \d+/.test(t)), JSON.stringify(pointed)).toBe(true);
        const first = await page.evaluate((f) => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.picking = 'min'; w.gw.preview = null; w.gbPaint(); return (0, eval)('(' + f + ')')(); }, words.toString()) as Record<string, string>;
        expect(Object.values(first).some((t) => /pruned/.test(t)), JSON.stringify(first)).toBe(true);
        for (const t of Object.values(first)) expect(/keeps|cuts/.test(t) && /pruned/.test(t), t).toBe(false);
        await settled(page);
        expect(await page.evaluate((f) => (0, eval)('(' + f + ')')(), words.toString())).toEqual(first);
        // and the choice, once it is recorded, says the same
        const chosen = { ...asked, asked: false, modeBy: 'you' as const };
        await page.evaluate(() => { (0, eval)('gw').picking = null; });
        await paintState(page, chosen);
        expect(await page.evaluate((f) => (0, eval)('(' + f + ')')(), words.toString())).toEqual(first);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 90000);

  it('heads each journey once: the branch of what it refuses hangs on its journey unnumbered, so the eyebrows number the journeys and no more', async () => {
    const server = await startUi({ dir: temp(), port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const file of ['plotline-seats.jsonl', 'tracegrove-max.jsonl']) {
        const page = await treePage(browser, server.url, recordedGrow(file), { width: 1440, reduce: true });
        const h = await page.evaluate(() => {
          const w = (0, eval)('gw'), B = w.B, pads = Object.keys(B.lbl).filter((id) => !B.lbl[id].badge);
          return { js: w.M.J.length as number, eb: pads.map((id) => [B.lbl[id].eb.textContent as string, !!(B.pad[id] && B.pad[id].pol)] as const) };
        });
        const nums = h.eb.map(([t]) => t.match(/^JOURNEY (\d+)/)?.[1]).filter(Boolean);
        expect(nums.length, file + ' ' + JSON.stringify(h.eb)).toBe(h.js);
        expect([...new Set(nums)].sort(), file).toEqual(Array.from({ length: h.js }, (_, i) => String(i + 1)));
        // (the tree has a branch of its own for what a journey refuses, and its eyebrow says only that)
        const pol = h.eb.filter(([, p]) => p).map(([t]) => t);
        expect(pol.length, file).toBeGreaterThan(0);
        for (const t of pol) expect(t, file).toMatch(/^(WHAT IT REFUSES|HOW IT FAILS)$/);
        await page.close();
      }
    } finally { await browser.close(); }
  }, 60000);

  it('cuts what grew in a chosen mode at its collar, lets it fall in the preview’s grey, and heals each cut with a callus in the bark’s tones beside its knot', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    // Max chosen, and grown; then Min chosen after it: what Max grew and Min drops is a real cut
    const max = { ...state, asked: false, modeBy: 'you' as const, mode: 'max' as const }, min = { ...max, mode: 'min' as const };
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        const page = await treePage(browser, server.url, max, { width, scheme });
        await page.addStyleTag({ content: '.gw-svg.gb, .gw-svg.gb * { transition: none !important; }' });
        await settled(page);
        const before = await page.evaluate(() => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = 'min'; w.gbPaint(); return null; }).then(() => page.evaluate(looks));
        await page.evaluate(() => { (0, eval)('gw').preview = null; });
        const c = await paintState(page, min).then(() => page.evaluate(cuts, true));
        expect(c.bad, width + 'px').toEqual([]);
        expect(c.shoots, width + 'px').toBeGreaterThan(1);
        expect(c.leaves, width + 'px').toBeGreaterThan(1);
        expect(c.calluses, width + 'px').toBeGreaterThan(2);
        const after = await page.evaluate(looks);
        const changed = Object.keys(after).filter((k) => k in before && before[k] !== after[k]).map((k) => [k, before[k], after[k]]);
        expect(changed, width + 'px').toEqual([]);
        expect(Object.keys(after).filter((k) => k in before).length, width + 'px').toBeGreaterThan(10);
        // the branches it keeps nothing of are cut flush and drop away, a callus left on the trunk
        await settled(page);
        const b = await page.evaluate(branches, { real: true, moving: true });
        expect(b.bad, width + 'px').toEqual([]);
        expect(b.cut, width + 'px').toBeGreaterThan(0);
        // and the key names the mark the tree shows, drawn as it is: a callus on bark, never a pale disc
        const key = await page.evaluate(() => { const sw = document.querySelector('.gw-legend [aria-label="Pruned"] .gw-sw'); return sw ? { cal: !!sw.querySelector('.cal'), cres: !!sw.querySelector('.cres'), cf: !!sw.querySelector('.cf') } : null; });
        expect(key, width + 'px').toEqual({ cal: true, cres: true, cf: false });
        await page.close();
      }
      // with reduced motion the cuts are just gone, and healed at once
      const page = await treePage(browser, server.url, max, { width: 1440, reduce: true });
      await paintState(page, min);
      const rest = await page.evaluate(() => {
        const B = (0, eval)('gw').B, gs = [...(new Set(Object.values(B.shoots ?? {})) as Set<any>)].filter((g) => !(g.bid && B.pad[g.bid]?.pruned));
        return { shoots: gs.length, healed: gs.filter((g) => g.scar?.classList.contains('on')).length, leaves: B.svg.querySelectorAll('.scar.on').length, cut: B.svg.querySelectorAll('.gb-lf.cut').length };
      });
      expect(rest.cut).toBe(0);
      expect(rest.shoots).toBeGreaterThan(1);
      expect(rest.healed).toBe(rest.shoots);
      expect(rest.leaves).toBeGreaterThan(0);
      expect((await page.evaluate(branches, { real: true, moving: false })).bad).toEqual([]);
      await page.close();
    } finally { await browser.close(); }
  }, 120000);

  /** What a previewed bigger mode would grow, as the tree ghosts it: the leaves on the journeys, the part checks on shoots
   *  (those a shoot's leaves do not show, by its count) and the existing flows as graft buds; each at about half strength
   *  with a dashed outline. */
  const ghosts = () => {
    const B = (0, eval)('gw').B, out = { journeys: 0, parts: 0, flows: 0, bad: [] as string[] };
    const bad = (what: string, v?: unknown) => out.bad.push(what + (v === undefined ? '' : ' ' + JSON.stringify(v)));
    const seen = (e: Element) => { for (let n: Element | null = e; n && n !== B.svg; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden') return false; } return e.getBoundingClientRect().width > 0; };
    const strength = (e: Element) => { let o = 1; for (let n: Element | null = e; n && n !== B.svg; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const look = (mark: Element | null, what: string) => {
      if (!mark) return bad(what + ' ghost has no outline');
      const o = strength(mark), c = getComputedStyle(mark);
      if (o < 0.38 || o > 0.52) bad(what + ' ghosted at', +o.toFixed(2));
      if (c.stroke === 'none' || c.strokeDasharray === 'none' || Number(c.strokeOpacity) < 0.9) bad(what + ' ghost without a dashed outline', [c.stroke, c.strokeDasharray]);
    };
    for (const e of Array.from(B.svg.querySelectorAll('.gb-lf.pv-add:not(.bud)')) as Element[]) if (seen(e)) { out.journeys++; look(e.querySelector('.blade'), 'leaf ' + e.getAttribute('data-k')); }
    for (const g of new Set(Object.values(B.shoots ?? {})) as Set<any>) {
      if (!seen(g.g) || !g.g.classList.contains('pv-add')) continue;
      const lv = (Array.from(g.fl.querySelectorAll('.gb-lf.bud.pv-add')) as Element[]).filter(seen);
      for (const e of lv) look(e.querySelector('.blade'), 'part check ' + e.getAttribute('data-k'));
      const tag = g.ctag && getComputedStyle(g.ctag).display !== 'none' ? Number(String(g.cnt.textContent).replace('+', '')) || 0 : Number((lv.at(-1)?.getAttribute('aria-label') ?? '').match(/and (\d+) more checks/)?.[1] ?? 0);
      if (lv.length + tag !== g.list.length) bad('a shoot ghosts fewer checks than it holds', [g.kid, lv.length, tag, g.list.length]);
      out.parts += lv.length + tag;
    }
    for (const e of Array.from(B.svg.querySelectorAll('.gb-gr.pv-add')) as Element[]) if (seen(e)) { out.flows++; look(e.querySelector('.gring'), 'existing flow ' + e.getAttribute('data-k')); }
    return out;
  };

  it('ghosts what a bigger mode would grow at half strength with a dashed outline, as many as its preview says, pinned or not', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    // Minimum chosen straight away: nothing grew in a bigger mode, so nothing heals and the key shows no such mark
    const min = { ...state, asked: false, modeBy: 'you' as const, mode: 'min' as const };
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        const page = await treePage(browser, server.url, min, { width, scheme, reduce: true, height: 1400 });
        expect(await page.evaluate(() => ({ marks: (0, eval)('gw').B.svg.querySelectorAll('.heal.on').length, key: document.querySelectorAll('.gw-legend [aria-label="Pruned"] .gw-sw').length })), width + 'px').toEqual({ marks: 0, key: 0 });
        const point = async (m: string) => {
          await page.getByTestId('grow-mode-' + m).scrollIntoViewIfNeeded();
          const bb = (await page.getByTestId('grow-mode-' + m).boundingBox())!;
          await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 4 });
          await expect.poll(() => page.getByTestId('grow-mode-preview').innerText().catch(() => '')).toContain('as ghosts on the tree');
          return page.getByTestId('grow-mode-preview').innerText();
        };
        for (const pinned of [false, true]) {
          if (pinned) { await page.mouse.move(1, 1, { steps: 2 }); await page.locator('.gb-lf:not(.gone):not(.bud)').first().click({ force: true }); }
          for (const m of ['max', 'std']) {
            const text = await point(m), g = await page.evaluate(ghosts), n = (re: RegExp) => Number(text.match(re)?.[1] ?? 0);
            const at = width + 'px ' + m + (pinned ? ' pinned' : '');
            expect(g.bad, at).toEqual([]);
            expect(g.journeys + g.parts + g.flows, at).toBe(n(/: (\d+) more than/));
            if (m === 'max') {
              expect([g.journeys, g.parts, g.flows], at).toEqual([n(/(\d+) on the journeys/), n(/(\d+) part checks?/), n(/(\d+) existing flows?/)]);
              expect(g.parts * g.flows * g.journeys, at).toBeGreaterThan(0);
            } else expect([g.parts, g.flows], at).toEqual([0, 0]);
            await page.mouse.move(1, 1, { steps: 2 });
          }
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 90000);

  /** Every branch and branchlet that carries a cushion ends inside it, its round end too, as the cushions stand. */
  const ends = () => {
    const B = (0, eval)('gw').B, out = { n: 0, forks: 0, off: 0, bad: [] as string[] };
    const chk = (P: any, pid: string, p: number[][], w: number, what: string) => {
      const n = p.length - 1, e = p[n]!, q = p[Math.max(0, n - 2)]!, m = Math.hypot(e[0]! - q[0]!, e[1]! - q[1]!) || 1, t = [(e[0]! - q[0]!) / m, (e[1]! - q[1]!) / m], nr = [-t[1]!, t[0]!], r = w / 2;
      const at = [e, [e[0]! + t[0]! * r, e[1]! + t[1]! * r], [e[0]! + nr[0]! * r, e[1]! + nr[1]! * r], [e[0]! - nr[0]! * r, e[1]! - nr[1]! * r]];
      out.n++;
      if (at.some((c) => !P.mk.isPointInFill(new DOMPoint(c[0], c[1])))) out.bad.push(pid + ' ' + what + ' ends outside its cushion ' + JSON.stringify(e.map(Math.round)));
    };
    for (const pid in B.pad) {
      const P = B.pad[pid]; if (P.jg.classList.contains('pruned') || getComputedStyle(P.jg).display === 'none') continue;
      if (P.rt.br) chk(P, pid, P.rt.br, P.b.w[P.b.w.length - 1], 'branch');
      // the twigs a cushion is lifted on end inside it, and go with it when a mode keeps none of its leaves
      for (const e of Array.from(P.jg.querySelectorAll('path.tw.fk')) as any[]) {
        const gone = P.cu[e.__k].el.classList.contains('off');
        out.forks++; if (gone) out.off++;
        if (gone !== e.classList.contains('off')) out.bad.push(pid + ' cushion ' + e.__k + (gone ? ' gone, its twig left standing' : ' kept, its twig gone'));
        else if (gone && ((e.__also ?? []) as Element[]).some((x) => x.isConnected)) out.bad.push(pid + ' cushion ' + e.__k + ' gone, its twig\'s bark left standing');
        else if (!gone) chk(P, pid, e.__pts, 1, 'twig');
      }
      const done = new Set<unknown>(); for (const id in P.rt.lt) { const c = P.rt.lt[id].c; if (c && !done.has(c.pts[0] + '')) { done.add(c.pts[0] + ''); chk(P, pid, c.pts, 2.4, 'branchlet'); } }
    }
    return out;
  };

  it('ends every branch inside its cushion, which hides the wood under it, in every mode and every preview', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      let seen = 0, forksOff = 0;
      for (const [width, scheme] of [[1440, 'light'], [390, 'dark']] as const) {
        for (const mode of ['max', 'min'] as const) {
          const page = await treePage(browser, server.url, { ...state, asked: false, modeBy: 'you', mode }, { width, scheme, reduce: true, height: 2400 });
          for (const pv of [null, 'min', 'std', 'max']) {
            await page.evaluate((m) => { const w = (0, eval)('({ gw, gbPaint })'); w.gw.preview = m; w.gbPaint(); }, pv);
            const e = await page.evaluate(ends), at = width + 'px ' + mode + ' preview ' + pv;
            expect(e.bad, at).toEqual([]);
            expect(e.n, at).toBeGreaterThan(1);
            expect(e.forks, at).toBeGreaterThan(1);
            forksOff += e.off;
            // the cushion is opaque to its foot: along each branch, and each twig it lifts the cushion on, where it runs inside
            // its cushion, the page shows foliage, never the bark seen through it
            const spots = await page.evaluate(() => {
              const B = (0, eval)('gw').B, M = B.svg.getScreenCTM(), out: number[][] = [];
              const leaves = (Array.from(B.svg.querySelectorAll('.gb-lf, .gb-gr, .ptag, .lbl, text')) as Element[]).map((e) => e.getBoundingClientRect()).filter((r) => r.width);
              for (const pid in B.pad) {
                const P = B.pad[pid]; if (!P.rt.br || P.jg.classList.contains('pruned') || getComputedStyle(P.jg).display === 'none') continue;
                const tws = (Array.from(P.jg.querySelectorAll('path.tw')) as any[]).filter((t) => t.__pts && getComputedStyle(t).display !== 'none' && getComputedStyle(t).opacity !== '0').map((t) => t.__pts as number[][]);
                const along = [P.rt.br as number[][], ...tws].flatMap((br) => br.flatMap((a, i) => (i ? [0.25, 0.5, 0.75, 1].map((f) => [br[i - 1]![0]! + (a[0]! - br[i - 1]![0]!) * f, br[i - 1]![1]! + (a[1]! - br[i - 1]![1]!) * f]) : [a])));
                for (const p of along) {
                  if (![[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].every(([dx, dy]) => P.mk.isPointInFill(new DOMPoint(p[0]! + dx!, p[1]! + dy!)))) continue;
                  const x = M.a * p[0]! + M.c * p[1]! + M.e, y = M.b * p[0]! + M.d * p[1]! + M.f;
                  if (y > 0 && y < innerHeight && !leaves.some((r) => x > r.left - 3 && x < r.right + 3 && y > r.top - 3 && y < r.bottom + 3)) out.push([x, y]);
                }
              }
              return out;
            });
            seen += spots.length;
            const shot = (await page.screenshot()).toString('base64');
            const rgb = await pixels(browser, shot, spots);
            expect(rgb.map((c, i) => [spots[i], c] as const).filter(([, c]) => !(c[1]! > c[0]! + 4)), at).toEqual([]);
          }
          await page.close();
        }
      }
      expect(seen).toBeGreaterThan(40);
      expect(forksOff).toBeGreaterThan(0);
    } finally { await browser.close(); }
  }, 120000);

  /** The colours at some points of a captured image, decoded in a page of its own. */
  async function pixels(browser: Browser, b64: string, at: number[][], mime = 'image/png') {
    const p = await browser.newPage();
    try {
      return await p.evaluate(async ({ b64, at, mime }) => {
        const im = new Image(); im.src = 'data:' + mime + ';base64,' + b64; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d')!; x.drawImage(im, 0, 0);
        return at.map(([px, py]) => Array.from(x.getImageData(Math.round(px!), Math.round(py!), 1, 1).data.slice(0, 3)));
      }, { b64, at, mime });
    } finally { await p.close(); }
  }

  /** In the page that grows: on every animation frame where the tree moved or was rebuilt, a snapshot of its geometry, kept
   *  with a frame count shown as four blocks of pure colour in the corner, so a captured image says which frame's DOM it
   *  shows; and the wood revealed so far, summed over every piece, which never goes down. */
  const recorder = () => {
    const w = window as any; w.__snaps = []; w.__drop = []; w.__frames = []; let last = '', lastLen = -1, lastN = -1, c = 0;
    const box = (r: DOMRect, p = 0) => [r.left - p, r.top - p, r.right + p, r.bottom + p];
    const own = (e: any) => e.__pts && !e.closest('.roots, .rootsx, .rt, .nbf, .jn');
    const snap = () => {
      const g = (0, eval)('gw'), B = g && g.B; if (!B || !B.svg || !B.svg.isConnected) return;
      const r = B.svg.getBoundingClientRect(); if (r.width < 50) return;
      const key = g.gbN + '|' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + '|' + B.svg.querySelectorAll('text').length;
      if (key === last) return; last = key;
      const M = B.svg.getScreenCTM(), sc = Math.hypot(M.a, M.b), P = (q: number[]) => [M.a * q[0]! + M.c * q[1]! + M.e, M.b * q[0]! + M.d * q[1]! + M.f];
      const wood = [...B.svg.querySelectorAll('path.w')].filter(own).map((e: any) => ({ k: e.getAttribute('class') + ':' + e.__pts.length, pts: e.__pts.map(P), hw: e.__w.map((v: number) => v * sc / 2), r: e.__r ? { t0: e.__r.t0, ms: e.__r.ms, f0: e.__r.f0 } : null }));
      const all = (q: string, p: number) => [...B.svg.querySelectorAll(q)].map((e: Element) => box(e.getBoundingClientRect(), p));
      w.__snaps.push({ N: g.gbN, svg: box(r), wood, ex: all('text, .lbl, .badge, .ptag .tag, .shtag, .tailg, .vein, .heal, .cutmk', 1.5), key: all('.kpip.key:not(.none)', 1.5), kn: all('.kn', 2), pads: all('.pad, .gb-lf, .budg', 1), pot: box(B.svg.querySelector('.pots').getBoundingClientRect()) });
    };
    const revealed = (ts: number) => {
      const g = (0, eval)('gw'), B = g && g.B; if (!B || !B.svg || !B.svg.isConnected) return; let L = 0;
      for (const e of B.svg.querySelectorAll('path.w') as any) {
        if (!own(e)) continue; const P = e.__pts; let T = 0; for (let i = 1; i < P.length; i++) T += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
        const q = e.__r; let f = 1; if (q) { const u = Math.max(0, Math.min(1, (ts - q.t0) / q.ms)); f = q.f0 + (1 - q.f0) * (1 - Math.pow(1 - u, 2.2)); } L += f * T;
      }
      if (lastLen >= 0 && L < lastLen - 15) w.__drop.push({ t: ts, from: Math.round(lastLen), to: Math.round(L), N: g.gbN, was: lastN }); lastLen = L; lastN = g.gbN;
    };
    const st = document.createElement('div'); st.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:8px;z-index:2147483647;display:flex;pointer-events:none';
    const bl = [0, 1, 2, 3].map(() => { const d = document.createElement('div'); d.style.cssText = 'width:8px;height:8px'; st.append(d); return d; }); document.body.append(st);
    const tick = (ts: number) => {
      try { snap(); revealed(ts); } catch (e) { w.__snapErr = String(e); }
      c = (c + 1) % 4096; bl.forEach((d, i) => { const v = (c >> (3 * i)) & 7; d.style.background = 'rgb(' + [v & 1, (v >> 1) & 1, (v >> 2) & 1].map((q) => q * 255).join(',') + ')'; });
      w.__frames.push([c, performance.timeOrigin + performance.now(), w.__snaps.length - 1, ts]); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /** In a page of its own: one captured frame, its count read from the corner, or checked against the snapshot of the frame
   *  it shows: nothing floats free of the tree, and the wood the clock says has grown shows as wood along its centre line,
   *  with no hole, seam or pale core. */
  const inspect = async ({ b64, snap, at }: { b64: string; snap: any; at?: number }) => {
    const im = new Image(); im.src = 'data:image/jpeg;base64,' + b64; await im.decode();
    const W = im.width, H = im.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(im, 0, 0); const D = cx.getImageData(0, 0, W, H).data;
    if (!snap) { let c = 0; for (let i = 0; i < 4; i++) { const o = (4 * W + 8 * i + 4) * 4, v = (D[o]! > 127 ? 1 : 0) | (D[o + 1]! > 127 ? 2 : 0) | (D[o + 2]! > 127 ? 4 : 0); c |= v << (3 * i); } return { c }; }
    const s = snap, X = (x: number) => Math.round(x), Y = (y: number) => Math.round(y);
    const x0 = Math.max(0, X(s.svg[0])), y0 = Math.max(0, Y(s.svg[1])), x1 = Math.min(W, X(s.svg[2])), y1 = Math.min(H, Y(s.svg[3]));
    const w = x1 - x0, h = y1 - y0; if (w < 20 || h < 20) return { skip: true };
    // the ground: the commonest colour along the region's top row
    const cnt = new Map<string, number>(); for (let x = x0; x < x1; x += 2) { const o = (y0 * W + x) * 4, k = (D[o]! >> 3) + ',' + (D[o + 1]! >> 3) + ',' + (D[o + 2]! >> 3); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    const bk = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]![0].split(',').map((v) => +v * 8 + 4);
    const dist = (x: number, y: number) => { const o = (y * W + x) * 4; return Math.abs(D[o]! - bk[0]!) + Math.abs(D[o + 1]! - bk[1]!) + Math.abs(D[o + 2]! - bk[2]!); };
    const ink = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ink[y * w + x] = dist(x + x0, y + y0) > 30 ? 1 : 0;
    const inBox = (px: number, py: number, b: number[]) => px >= X(b[0]!) && px <= X(b[2]!) && py >= Y(b[1]!) && py <= Y(b[3]!);
    // (a pip's row in the key is a label beside the tree, as a journey's badge is; it is tested below never to sit on the wood)
    for (const b of [...s.ex, ...s.key]) { const a0 = Math.max(x0, X(b[0])), a1 = Math.min(x1, X(b[2])), c0 = Math.max(y0, Y(b[1])), c1 = Math.min(y1, Y(b[3])); for (let y = c0; y < c1; y++) for (let x = a0; x < a1; x++) ink[(y - y0) * w + x - x0] = 0; }
    // a hairline gap of a pixel closed: a dashed or anti-aliased edge is one mark, a knot a body-width off its wood is not
    const dil = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) dil[yy * w + xx] = 1; }
    const lab = new Int32Array(w * h), floating: number[][] = []; let n = 0; const st: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (!dil[i] || lab[i]) continue; n++; let area = 0, pot = false; const bb = [1e9, 1e9, -1, -1]; lab[i] = n; st.push(i);
      while (st.length) {
        const j = st.pop()!, x = j % w, y = (j - x) / w; if (ink[j]) area++; bb[0] = Math.min(bb[0]!, x); bb[1] = Math.min(bb[1]!, y); bb[2] = Math.max(bb[2]!, x); bb[3] = Math.max(bb[3]!, y);
        if (!pot && inBox(x + x0, y + y0, s.pot)) pot = true;
        for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && dil[k] && !lab[k]) { lab[k] = n; st.push(k); }
      }
      if (!pot && area >= 8) floating.push([bb[0]! + x0, bb[1]! + y0, bb[2]! + x0, bb[3]! + y0, area]);
    }
    // along each piece of wood from its base: what the clock says has grown (less its round cap) shows as wood, never ground
    const holes: unknown[] = [];
    for (const p of s.wood) {
      const smp: number[][] = []; for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], b = p.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L / 3)); for (let k = 0; k < m; k++) smp.push([a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m, p.hw[i - 1]]); }
      for (const q of smp) if (s.key.some((b: number[]) => q[0]! + q[2]! > b[0]! && q[0]! - q[2]! < b[2]! && q[1]! + q[2]! > b[1]! && q[1]! - q[2]! < b[3]!)) { holes.push({ k: p.k, key: 'a row of the key on the wood', at: q.slice(0, 2).map(Math.round) }); break; }
      const cls = smp.map(([x, y, hw]) => {
        if (hw! < 1.6) return 's'; const px = X(x!), py = Y(y!); if (px < x0 + 1 || py < y0 + 1 || px >= x1 - 1 || py >= y1 - 1) return 's';
        if (s.ex.some((b: number[]) => inBox(px, py, b)) || s.kn.some((b: number[]) => inBox(px, py, b)) || s.pads.some((b: number[]) => inBox(px, py, b))) return 's';
        let d = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) d += dist(px + dx, py + dy); return d / 9 > 40 ? 'w' : '.';
      });
      // (wood seen past what the clock has grown is another piece's, crossing this one's line: a branch's base on a trunk still growing)
      const u = at !== undefined && p.r ? Math.max(0, Math.min(1, (at - p.r.t0) / p.r.ms)) : 1, fe = p.r && at !== undefined ? p.r.f0 + (1 - p.r.f0) * (1 - Math.pow(1 - u, 2.2)) : 1, grown = Math.ceil(fe * cls.length);
      if (at !== undefined && p.r) {
        const m = Math.floor(fe * cls.length) - 4; let gap = 0;
        for (let i = 0; i < m; i++) { if (cls[i] === '.') { if (++gap >= 2) { holes.push({ k: p.k, lag: +fe.toFixed(2), at: smp[i]!.slice(0, 2).map(Math.round), seq: cls.join('') }); break; } } else gap = 0; }
      }
      let end = -1, run = 0; for (let i = 0; i < grown; i++) { if (cls[i] === 'w') { end = i; run = 0; } else if (cls[i] === '.') { run++; if (run >= 4 && end >= 0) break; } }
      for (let i = 0; i < end; i++) if (cls[i] === '.') { holes.push({ k: p.k, at: smp[i]!.slice(0, 2).map(Math.round), seq: cls.join('') }); break; }
    }
    return { floating, holes };
  };

  it('grows causally in every frame the browser paints, across a rebuild as scenarios are drafted: nothing ahead of its wood, no hole or seam in it, never ungrowing', async () => {
    const { dir, state } = await grownBushy();
    withMax(state);
    // drafting brings scenarios in as it goes, and the tree is rebuilt each time: first drawn with the journeys' happy paths;
    // rebuilt with their guards and failures once it has grown, which raises a crest on a riser under leaves that had
    // opened; and again with the part checks and existing flows while that is still growing
    const all = { ...state, asked: false, modeBy: 'you' as const, mode: 'max' as const };
    const journeys = { ...all, scenarios: all.scenarios.filter((x) => x.journey) };
    const early = { ...all, scenarios: all.scenarios.filter((x) => x.journey && x.polarity === 'happy') };
    const server = await startUi({ dir, port: 0, token: 'tk-0123456789abcdef' }); servers.push(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1700 } });
      const cdp = await page.context().newCDPSession(page);
      await page.goto(server.url);
      await page.getByRole('button', { name: 'Discover', exact: true }).first().click();
      await page.getByTestId('grow').waitFor();
      await page.evaluate(() => { (0, eval)('gw').tree = 'grove'; });
      await page.evaluate(recorder);
      if (process.env.TG_THROTTLE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.TG_THROTTLE) });
      const frames: { b64: string; t: number }[] = [];
      cdp.on('Page.screencastFrame', (f) => { frames.push({ b64: f.data, t: Number(f.metadata.timestamp) * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
      const grown = (after: number) => page.waitForFunction((after) => { const B = (0, eval)('gw').B; return performance.now() > Math.max(0, ...B.grow.map((q: any) => q.t0 + q.ms)) + after; }, after, { timeout: 30000 });
      await paintState(page, early);
      await grown(1500);
      await paintState(page, journeys);
      await page.waitForTimeout(700);
      await paintState(page, all);
      await grown(400);
      await cdp.send('Page.stopScreencast');
      if (process.env.TG_THROTTLE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const rec = await page.evaluate(() => { const w = window as any; return { snaps: w.__snaps, frames: w.__frames as number[][], drop: w.__drop, err: w.__snapErr ?? null }; });
      expect(rec.err).toBeNull();
      // the wood revealed never goes down, rebuild or not
      expect(rec.drop).toEqual([]);
      expect(new Set(rec.snaps.map((s: { N: number }) => s.N)).size).toBeGreaterThan(2);
      const dec = await browser.newPage();
      const bad: unknown[] = []; let checked = 0;
      for (const [i, f] of frames.entries()) {
        const { c } = await dec.evaluate(inspect, { b64: f.b64, snap: null }) as { c: number };
        // the latest frame with that count, at or before the capture
        let fr: number[] | undefined; for (const q of rec.frames) if (q[0] === c && q[1]! <= f.t + 20) fr = q;
        if (!fr || fr[2]! < 0) continue;
        const v = await dec.evaluate(inspect, { b64: f.b64, snap: rec.snaps[fr[2]!], at: fr[3]! }) as { skip?: boolean; floating?: unknown[]; holes?: unknown[] };
        if (v.skip) continue;
        checked++;
        if (v.floating!.length || v.holes!.length) bad.push({ frame: i, N: rec.snaps[fr[2]!].N, floating: v.floating, holes: v.holes });
        // TG_GATE_FRAMES=<dir> keeps every frame checked, a bad one marked, to look at
        if (process.env.TG_GATE_FRAMES) writeFileSync(join(process.env.TG_GATE_FRAMES, 'f' + String(i).padStart(3, '0') + (v.floating!.length || v.holes!.length ? '-bad' : '') + '.jpg'), Buffer.from(f.b64, 'base64'));
      }
      expect(bad).toEqual([]);
      expect(checked).toBeGreaterThan(20);
    } finally { await browser.close(); }
  }, 180000);
});
