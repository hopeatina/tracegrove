/**
 * Discovery as a typed event stream: the same events feed the terminal (`discover --jsonl`), MCP and
 * the UI's feed, map and coverage strip. Domains come from the code's own structure (the file or folder
 * that declares the routes) before URL prefixes, and surfaces are ranked by risk so the riskiest ones
 * are drafted first: writes over reads, money and permissions first, personal data flagged.
 */
import { basename, dirname } from 'node:path';
import type { CoveredRoute, Discovery } from './discover.ts';

export type Risk = { score: number; why: string[]; pii: boolean };
export type DiscoveryEvent =
  | { seq: number; kind: 'domain.found'; domain: string; from: 'code' | 'url'; surfaces: number; summary: string }
  | { seq: number; kind: 'surface.found'; domain: string; method: string; path: string; file: string | null; risk: Risk; summary: string }
  | { seq: number; kind: 'surface.observed'; domain: string; method: string; path: string; cases: string[]; summary: string }
  | { seq: number; kind: 'flow.declared'; domain: string; method: string; path: string; cases: string[]; summary: string }
  | { seq: number; kind: 'flow.proven' | 'flow.failed'; caseId: string; title: string; summary: string }
  | { seq: number; kind: 'question.asked'; id: string; file: string | null; question: string; summary: string };
export type Coverage = { domains: number; surfaces: number; observed: number; declared: number; untested: number; proven: number; failed: number;
  riskyUntested: Array<{ method: string; path: string; risk: Risk }> };
export type Feed = { events: DiscoveryEvent[]; coverage: Coverage };
export type ClaimState = { caseId: string; title: string; assessment: string };

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MONEY = /pay|charge|billing|invoice|subscri|refund|checkout|order|price|wallet|credit|payout|stripe/i;
const PERMISSION = /admin|role|permission|auth|login|session|token|share|invite|member|password|access/i;
const PII = /patient|record|ssn|email|phone|profile|address|user|account|customer|contact|medical|diagnos|prescription|dob|birth/i;
const GENERIC = new Set(['app', 'main', 'index', 'server', 'urls', 'views', 'routes', 'router', 'api', 'http', 'handlers', 'src', 'lib', '.', '']);

export function riskOf(route: Pick<CoveredRoute, 'method' | 'path'>): Risk {
  const why: string[] = []; let score = 0;
  if (WRITES.has(route.method)) { score += 3; why.push(route.method === 'DELETE' ? 'deletes data' : 'writes data'); }
  if (route.method === 'DELETE') score += 1;
  const writes = WRITES.has(route.method);
  if (MONEY.test(route.path)) { score += writes ? 3 : 1; why.push(writes ? 'moves money' : 'shows billing data'); }
  if (PERMISSION.test(route.path)) { score += writes ? 2 : 1; why.push(writes ? 'changes access' : 'reads access data'); }
  const pii = PII.test(route.path);
  if (pii) { score += 2; why.push('personal data'); }
  if (!why.length) why.push('read only');
  return { score, why, pii };
}

/** The code's own grouping: the declaring file, or its folder when the file name says nothing. */
export function domainOf(route: Pick<CoveredRoute, 'file' | 'path'>): { domain: string; from: 'code' | 'url' } {
  if (route.file) {
    const name = basename(route.file).replace(/\.[^.]+$/, '');
    if (!GENERIC.has(name.toLowerCase())) return { domain: name, from: 'code' };
    const folder = basename(dirname(route.file));
    if (!GENERIC.has(folder.toLowerCase())) return { domain: folder, from: 'code' };
  }
  return { domain: firstSegment(route.path) || 'root', from: 'url' };
}

function firstSegment(path: string): string {
  return path.split('/').find((s) => s && !s.startsWith('{') && !s.startsWith(':') && !/^v\d+$/.test(s) && !GENERIC.has(s.toLowerCase())) ?? '';
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const says = (cases: string[]) => cases.length === 1 ? cases[0]! : `${cases.length} scenarios`;

export function discoveryFeed(d: Discovery, claims: ClaimState[] = []): Feed {
  const events: DiscoveryEvent[] = [];
  const push = (event: DistributiveOmit<DiscoveryEvent, 'seq'>) => events.push({ ...event, seq: events.length + 1 } as DiscoveryEvent);
  const routes = d.routes.filter((r) => r.method !== 'ANY');
  // A route seen only in traffic joins the code area that already serves its first URL segment.
  const areaOfSegment = new Map<string, string>();
  for (const route of routes) if (route.file) { const own = domainOf(route); if (own.from === 'code') areaOfSegment.set(firstSegment(route.path), own.domain); }
  const groups = new Map<string, { from: 'code' | 'url'; routes: CoveredRoute[] }>();
  for (const route of routes) {
    const known = route.file ? undefined : areaOfSegment.get(firstSegment(route.path));
    const { domain, from } = known ? { domain: known, from: 'code' as const } : domainOf(route);
    const group = groups.get(domain) ?? { from, routes: [] };
    if (from === 'code') group.from = 'code';
    group.routes.push(route); groups.set(domain, group);
  }
  // Riskiest domain first, and inside it the riskiest surface first: that is the drafting order.
  const ranked = [...groups.entries()].map(([domain, g]) => ({ domain, ...g, routes: g.routes.map((r) => ({ r, risk: riskOf(r) })).sort((a, b) => b.risk.score - a.risk.score || a.r.path.localeCompare(b.r.path)) }))
    .sort((a, b) => (b.routes[0]?.risk.score ?? 0) - (a.routes[0]?.risk.score ?? 0) || a.domain.localeCompare(b.domain));
  for (const group of ranked) {
    push({ kind: 'domain.found', domain: group.domain, from: group.from, surfaces: group.routes.length,
      summary: `Found ${group.domain}: ${group.routes.length} route${group.routes.length === 1 ? '' : 's'}${group.from === 'code' ? '' : ' (grouped by URL, since the code gave no better name)'}` });
    for (const { r, risk } of group.routes) {
      push({ kind: 'surface.found', domain: group.domain, method: r.method, path: r.path, file: r.file, risk,
        summary: `${r.method} ${r.path}: ${risk.why.join(', ')}${r.file ? `, in ${r.file}${r.line ? `:${r.line}` : ''}` : ', seen only in traffic'}` });
      if (r.coveredBy.length) push({ kind: 'flow.declared', domain: group.domain, method: r.method, path: r.path, cases: r.coveredBy, summary: `${says(r.coveredBy)} cover${r.coveredBy.length === 1 ? 's' : ''} ${r.method} ${r.path}` });
      if (r.observedBy.length) push({ kind: 'surface.observed', domain: group.domain, method: r.method, path: r.path, cases: r.observedBy, summary: `The app served ${r.method} ${r.path} during ${says(r.observedBy)}` });
    }
  }
  for (const claim of claims) {
    if (claim.assessment === 'supported') push({ kind: 'flow.proven', caseId: claim.caseId, title: claim.title, summary: `Ran it: ${claim.title}` });
    if (claim.assessment === 'contradicted') push({ kind: 'flow.failed', caseId: claim.caseId, title: claim.title, summary: `Failed: ${claim.title}` });
  }
  for (const a of d.ambiguities) push({ kind: 'question.asked', id: a.id, file: a.file, question: a.ask, summary: a.detail });

  const untested = ranked.flatMap((g) => g.routes).filter(({ r }) => !r.coveredBy.length && !r.observedBy.length && !r.confirmedEarlier);
  const coverage: Coverage = { domains: ranked.length, surfaces: routes.length,
    observed: routes.filter((r) => r.observedBy.length).length, declared: routes.filter((r) => r.coveredBy.length).length, untested: untested.length,
    proven: claims.filter((c) => c.assessment === 'supported').length, failed: claims.filter((c) => c.assessment === 'contradicted').length,
    riskyUntested: untested.filter(({ risk }) => risk.score >= 3).sort((a, b) => b.risk.score - a.risk.score).slice(0, 5).map(({ r, risk }) => ({ method: r.method, path: r.path, risk })) };
  return { events, coverage };
}
