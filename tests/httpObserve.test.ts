import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { HttpDriver } from '../src/adapters/http/driver.ts';
import { Deadline } from '../src/core/deadline.ts';

async function withProvider(check: (origin: string, calls: () => number) => Promise<void>, mode: 'stall' | 'disconnect' | 'all_stall' = 'stall') {
  let calls = 0;
  const server = createServer((_request, response) => {
    if (++calls === 1 && mode !== 'all_stall') { response.writeHead(501); response.end('{"error":"unmatched"}'); }
    else if (mode === 'disconnect') response.destroy();
    // Further responses deliberately remain pending until the bounded driver aborts.
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture did not bind');
  try { await check(`http://127.0.0.1:${address.port}`, () => calls); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const predicate = { kind: 'status_equals' as const, value: 200 };
const spec = (origin: string) => ({ origin, path: '/read', method: 'GET', auth: { kind: 'none' as const }, variables: {} });

it('retains a completed product observation when a later poll reaches its deadline', async () => {
  await withProvider(async (origin, calls) => {
    const driver = new HttpDriver({ persona: null, named: {} }, new Set([origin]));
    // The first response and second request must occur before the intentional stall expires.
    const result = await driver.observe({ ...spec(origin), deadline: Deadline.in(2000) }, predicate, 1);
    expect(calls()).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe(501);
    expect(result.attempts).toBe(2);
  });
});

it('does not substitute an earlier observation for a real transport failure', async () => {
  await withProvider(async origin => {
    const driver = new HttpDriver({ persona: null, named: {} }, new Set([origin]));
    await expect(driver.observe({ ...spec(origin), deadline: Deadline.in(1000) }, predicate, 1))
      .rejects.toMatchObject({ code: 'transport_failure' });
  }, 'disconnect');
});

it('does not fabricate an observation when the first request times out', async () => {
  await withProvider(async origin => {
    const driver = new HttpDriver({ persona: null, named: {} }, new Set([origin]));
    await expect(driver.observe({ ...spec(origin), deadline: Deadline.in(100) }, predicate, 1))
      .rejects.toMatchObject({ code: 'deadline_exceeded' });
  }, 'all_stall');
});

it('keeps cancellation explicit after an earlier product observation', async () => {
  await withProvider(async origin => {
    const driver = new HttpDriver({ persona: null, named: {} }, new Set([origin]));
    const controller = new AbortController();
    const cancel = setTimeout(() => controller.abort(), 50);
    try {
      await expect(driver.observe({ ...spec(origin), deadline: Deadline.in(1000), signal: controller.signal }, predicate, 1))
        .rejects.toMatchObject({ code: 'cancelled' });
    } finally { clearTimeout(cancel); }
  });
});
