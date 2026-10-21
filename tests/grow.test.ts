import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { grow } from '../src/authoring/grow.ts';
import { criteriaFrom, isPatternSource, matchCriterion, readChange, unitsOf } from '../src/authoring/growChange.ts';
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
