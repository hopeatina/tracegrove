/**
 * Mock loopback host for the `mock_contract` lane: serves declared responses on 127.0.0.1.
 * The boundary is stubbed and says so; its identity is operator-declared and unverified.
 */
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { IdentityAttestation, freeze, parseAs } from '../protocol/index.ts';
import { Blocked } from '../core/errors.ts';
import { nowIso } from '../core/clock.ts';
import { buildCapabilityObservation, buildLease } from './local.ts';
import type { ExecutorHost, HostSession, HostStartContext } from './types.ts';

function matchPath(pattern: string, actual: string): boolean {
  const p = pattern.split('/'); const a = actual.split('/');
  if (p.length !== a.length) return false;
  return p.every((segment, i) => segment.startsWith('{') || segment === a[i]);
}

export class MockLoopbackHost implements ExecutorHost {
  async start(context: HostStartContext): Promise<HostSession> {
    const responses = context.mockResponses;
    if (!responses) throw new Blocked([{ code: 'mock_responses_missing', detail: context.hostPlan.ref.id }]);
    const credentials = new Map<string, string>();
    for (const name of context.credentialNames) credentials.set(name, randomBytes(16).toString('base64url'));
    const calls: Array<{ method: string; path: string; matched: boolean }> = [];
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const route = responses.routes.find((r) => r.method === req.method && matchPath(r.path, url.pathname));
      calls.push({ method: req.method ?? '', path: url.pathname, matched: !!route });
      if (!route) { res.writeHead(501, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'unmatched_mock_route' })); }
      if (route.requireBearer && !(req.headers.authorization ?? '').startsWith('Bearer ')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'unauthorized' })); }
      req.resume();
      req.on('end', () => {
        const body = route.body === null ? '' : JSON.stringify(route.body);
        res.writeHead(route.status, { 'content-type': 'application/json', 'x-request-id': `mock-${calls.length}`, 'x-tracegrove-interceptor': responses.ref.id });
        res.end(body);
      });
    });
    const port = await new Promise<number>((resolvePort) => server.listen(0, '127.0.0.1', () => { const address = server.address(); resolvePort(typeof address === 'object' && address ? address.port : 0); }));
    const origin = `http://127.0.0.1:${port}`;
    const lease = buildLease(context, process.pid);
    const attestation = parseAs(IdentityAttestation, freeze({
      schemaVersion: 'workflow.identity-attestation/v1' as const,
      ref: { id: `${context.executionId}.attestation.notes-api`, revision: '1' },
      scope: context.scope,
      componentId: 'notes-api',
      kind: 'application' as const,
      identity: { kind: 'declared_release' as const, release: 'stub' },
      issuer: 'declared_binding' as const,
      trustPolicy: 'operator_declared_unverified' as const,
      evidence: { files: [], observedHealthBody: null },
      observedAt: nowIso(),
    }), 'stub attestation');
    const observation = buildCapabilityObservation({
      hostPlanRef: context.hostPlan.ref, leaseRef: lease.ref, scope: context.scope, executionId: context.executionId,
      supported: ['network_origin:loopback', 'confirmed_cancel', 'artifact_delivery'],
      unsupported: ['shell', 'file_persistence', 'browser_engine', 'video_export'],
    });
    let stopped = false;
    return {
      origin, lease, observation, attestations: [attestation], credentials,
      boundaryMode: 'stubbed', interceptorRefs: [responses.ref],
      ownedResources: [{ entityKey: 'mock.server', physicalId: origin, boundaryId: 'application' }],
      dataDir: null,
      async stop(reason: string) {
        if (stopped) return { confirmed: true, detail: 'already stopped' };
        stopped = true;
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        return { confirmed: true, detail: `${reason}; mock server closed after ${calls.length} calls (${calls.filter((c) => !c.matched).length} unmatched)` };
      },
    };
  }
}
