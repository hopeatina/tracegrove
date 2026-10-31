import { describe, expect, it } from 'vitest';
import { BrowserRequestPolicy } from '../src/adapters/browser/requestPolicy.ts';

const origin = 'https://app.example';
function policy(entry = true) {
  return new BrowserRequestPolicy({ origin, mainFrameId: 'main', extraOrigins: new Set(['https://auth.example']),
    allowedMethods: ['GET', 'HEAD'], allowedResourcePrefixes: ['/whoami', '/assets/'],
    entry: entry ? new URL('/sign-in?ticket=synthetic-secret', origin) : null });
}
function request(path: string, options: { method?: string; kind?: string; frame?: string; id?: string; redirect?: string } = {}) {
  return { requestId: options.id ?? 'request-1', frameId: options.frame ?? 'main',
    resourceType: options.kind ?? 'Document', ...(options.redirect ? { redirectedRequestId: options.redirect } : {}),
    request: { url: new URL(path, origin).href, method: options.method ?? 'GET' } };
}

describe('bounded credential entry request policy', () => {
  it('allows the exact entry and its server redirect chain, then removes the exception', () => {
    const p = policy();
    expect(p.allows(request('/sign-in?ticket=synthetic-secret', { id: 'entry' }))).toBe(true);
    expect(p.allows(request('/home', { id: 'redirect', redirect: 'entry' }))).toBe(true);
    expect(p.allows(request('/other'))).toBe(false);
    p.finishBootstrap();
    expect(p.allows(request('/home', { redirect: 'redirect' }))).toBe(false);
    expect(p.allows(request('/whoami'))).toBe(true);
  });
  it.each([
    ['/sign-in?ticket=wrong', {}],
    ['/sign-in?ticket=synthetic-secret', { frame: 'child' }],
    ['/sign-in?ticket=synthetic-secret', { method: 'POST' }],
    ['/sign-in?ticket=synthetic-secret', { kind: 'XHR' }],
    ['/unadmitted', { kind: 'XHR' }],
    ['/whoami', { method: 'POST', kind: 'Fetch' }],
    ['https://auth.example/assets/app.js', { method: 'POST', kind: 'Script' }],
    ['https://auth.example/private', { kind: 'Fetch' }],
    ['https://auth.example/assets/page', { kind: 'Document' }],
    ['https://outside.example/assets/app.js', { kind: 'Script' }],
  ] as const)('rejects requests outside the method/path/origin/frame envelope: %s %j', (path, options) => {
    expect(policy().allows(request(path, options))).toBe(false);
  });
  it('allows only scoped extra-origin subresources before and after bootstrap', () => {
    const p = policy();
    expect(p.allows(request('https://auth.example/assets/app.js', { kind: 'Script' }))).toBe(true);
    p.finishBootstrap();
    expect(p.allows(request('https://auth.example/assets/app.js', { kind: 'Script' }))).toBe(true);
    expect(p.allows(request('https://auth.example/assets/app.js', { method: 'POST', kind: 'Fetch' }))).toBe(false);
  });
  it('rejects an unlinked redirect and more than eight credential redirects', () => {
    const p = policy();
    expect(p.allows(request('/home', { redirect: 'unknown' }))).toBe(false);
    expect(p.allows(request('/sign-in?ticket=synthetic-secret', { id: 'entry' }))).toBe(true);
    let previous = 'entry';
    for (let index = 0; index < 8; index++) {
      const id = `redirect-${index}`;
      expect(p.allows(request(`/redirect-${index}`, { id, redirect: previous }))).toBe(true);
      previous = id;
    }
    expect(p.allows(request('/ninth', { redirect: previous }))).toBe(false);
    expect(p.allows(request('https://auth.example/escape', { redirect: previous }))).toBe(false);
  });
  it('bounds unrecorded bootstrap traffic without relaxing ordinary case limits', () => {
    const p = policy();
    for (let i = 0; i < 64; i++) expect(p.allows(request('/assets/app.js', { kind: 'Script', id: String(i) }))).toBe(true);
    expect(p.allows(request('/assets/app.js', { kind: 'Script' }))).toBe(false);
    p.finishBootstrap();
    expect(p.allows(request('/assets/app.js', { kind: 'Script' }))).toBe(true);
  });
});
