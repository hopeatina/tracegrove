import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CoveredRoute, Discovery } from '../src/authoring/discover.ts';
import { discoveryFeed, domainOf, riskOf } from '../src/authoring/discoveryEvents.ts';

const route = (method: string, path: string, file: string | null, extra: Partial<CoveredRoute> = {}): CoveredRoute => ({
  method, path, file, line: file ? 1 : null, framework: file ? 'node' : 'observed', provenance: file ? 'source' : 'traffic',
  coveredBy: [], observedBy: [], actions: [], confirmedEarlier: null, changed: false, ...extra,
} as CoveredRoute);
const discovery = (routes: CoveredRoute[]): Discovery => ({ source: 'working tree', branch: null, base: null, files: 1, changedFiles: [], routes,
  uncovered: routes.filter((r) => !r.coveredBy.length && !r.observedBy.length).length, observed: null, ambiguities: [], actions: [] });

describe('risk', () => {
  it('puts money and permission writes above reads, and flags personal data', () => {
    expect(riskOf({ method: 'POST', path: '/billing/charge' })).toMatchObject({ score: 6, why: ['writes data', 'moves money'] });
    expect(riskOf({ method: 'GET', path: '/invoices' })).toMatchObject({ score: 1, why: ['shows billing data'] });
    expect(riskOf({ method: 'DELETE', path: '/admin/members/{id}' }).score).toBeGreaterThan(riskOf({ method: 'POST', path: '/notes' }).score);
    expect(riskOf({ method: 'GET', path: '/patients/{id}' })).toMatchObject({ pii: true, why: ['personal data'] });
    expect(riskOf({ method: 'GET', path: '/health' })).toMatchObject({ score: 0, why: ['read only'] });
  });
});

describe('areas', () => {
  it('names an area after the file that declares it, then its folder, then the URL', () => {
    expect(domainOf({ file: 'app/billing.mjs', path: '/subscription' })).toEqual({ domain: 'billing', from: 'code' });
    expect(domainOf({ file: 'shop/orders/views.py', path: '/api/orders/' })).toEqual({ domain: 'orders', from: 'code' });
    expect(domainOf({ file: 'src/index.ts', path: '/api/v1/notes/{id}' })).toEqual({ domain: 'notes', from: 'url' });
    expect(domainOf({ file: null, path: '/' })).toEqual({ domain: 'root', from: 'url' });
  });
});

describe('discovery feed', () => {
  const d = discovery([
    route('GET', '/notes', 'app/notes.mjs', { coveredBy: ['notes.list'], observedBy: ['notes.list'] }),
    route('POST', '/notes', 'app/notes.mjs'),
    route('POST', '/billing/charge', 'app/billing.mjs'),
    route('GET', '/notes/n_123', null, { observedBy: ['notes.list'] }),
  ]);
  const { events, coverage } = discoveryFeed({ ...d, ambiguities: [{ id: 'a1', kind: 'unreadable_routing', file: 'app/notes.mjs', line: 9, detail: 'app/notes.mjs:9 uses a regex path', ask: 'Which routes does app/notes.mjs:9 serve?' }] },
    [{ caseId: 'notes.list', title: 'Lists notes', assessment: 'supported' }]);

  it('orders areas and routes riskiest first, numbered in order', () => {
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    const found = events.filter((e) => e.kind === 'surface.found').map((e) => e.kind === 'surface.found' ? `${e.domain} ${e.method} ${e.path}` : '');
    expect(found).toEqual(['billing POST /billing/charge', 'notes POST /notes', 'notes GET /notes', 'notes GET /notes/n_123']);
  });

  it('puts traffic-only routes in the code area that serves their URL', () => {
    expect(events.filter((e) => e.kind === 'domain.found').map((e) => e.kind === 'domain.found' ? [e.domain, e.from, e.surfaces] : null)).toEqual([['billing', 'code', 1], ['notes', 'code', 3]]);
  });

  it('reports runs, questions and coverage', () => {
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['flow.declared', 'surface.observed', 'flow.proven', 'question.asked']));
    expect(events.at(-1)).toMatchObject({ kind: 'question.asked', question: 'Which routes does app/notes.mjs:9 serve?' });
    expect(coverage).toMatchObject({ domains: 2, surfaces: 4, observed: 2, declared: 1, untested: 2, proven: 1, failed: 0 });
    expect(coverage.riskyUntested.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /billing/charge', 'POST /notes']);
  });
});

describe('discover --jsonl', () => {
  it('prints one event per line and ends with the coverage summary', () => {
    const out = mkdtempSync(join(tmpdir(), 'tg-discover-'));
    const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, '../src/cli/main.ts'), ...args], { encoding: 'utf8' });
    const tried = cli('try', 'saas-billing', '--out', join(out, 'billing'), '--no-open');
    expect(tried.status, tried.stdout + tried.stderr).toBe(0);
    const run = cli('discover', '--dir', join(out, 'billing'), '--jsonl');
    expect(run.status, run.stderr).toBe(0);
    const lines = run.stdout.trim().split('\n').map((l) => JSON.parse(l) as { kind: string; seq?: number; proven?: number });
    expect(lines[0]).toMatchObject({ kind: 'domain.found', domain: 'billing', from: 'code', seq: 1 });
    expect(lines[1]).toMatchObject({ kind: 'surface.found', method: 'POST' });
    expect(lines.at(-1)).toMatchObject({ kind: 'coverage', untested: 0, proven: 4, failed: 0 });
  }, 120_000);
});
