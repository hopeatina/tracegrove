import { afterEach, describe, expect, it } from 'vitest';
import { Deadline } from '../src/core/deadline.ts';
import { StandInError, StandIns } from '../src/adapters/standin/server.ts';
import { StandInFault } from '../src/protocol/index.ts';

const open: StandIns[] = [];
afterEach(async () => { for (const s of open.splice(0)) await s.close(); });

async function start() {
  const standIns = await StandIns.start([{ name: 'crm', env: 'CRM_URL', responses: [
    { method: 'POST', path: '/contacts', status: 201, json: { id: 'c_1' } },
    { method: 'GET', path: '/contacts/{id}', status: 200, json: { id: 'c_1' } },
  ] }]);
  open.push(standIns);
  return { standIns, url: standIns.env().CRM_URL! };
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('stand-ins', () => {
  it('answers declared routes, 404s the rest, and records every call', async () => {
    const { standIns, url } = await start();
    expect((await post(`${url}/contacts`, { name: 'Ana' })).status).toBe(201);
    expect((await fetch(`${url}/contacts/c_1`)).status).toBe(200);
    expect((await fetch(`${url}/contacts/c_1/notes`)).status).toBe(404);
    const all = await standIns.observe({ standIn: 'crm', route: null }, () => true, 10, Deadline.in(1000));
    expect(all.count).toBe(3);
    const created = await standIns.observe({ standIn: 'crm', route: { method: 'POST', path: '/contacts' } }, () => true, 10, Deadline.in(1000));
    expect(created).toMatchObject({ count: 1, calls: [{ json: { name: 'Ana' }, status: 201, faulted: false }] });
  });

  it('applies an armed fault to the next matching calls only', async () => {
    const { standIns, url } = await start();
    standIns.arm(StandInFault.parse({ standIn: 'crm', route: { method: 'POST', path: '/contacts' }, times: 2, status: 503 }));
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(`${url}/contacts`, { i })).status);
    expect(statuses).toEqual([503, 503, 201]);
    const seen = await standIns.observe({ standIn: 'crm', route: { method: 'POST', path: '/contacts' } }, () => true, 10, Deadline.in(1000));
    expect(seen.calls.map((c) => c.faulted)).toEqual([true, true, false]);
  });

  it('drops the connection when asked', async () => {
    const { standIns, url } = await start();
    standIns.arm(StandInFault.parse({ standIn: 'crm', route: { method: 'POST', path: '/contacts' }, times: 1, drop: true }));
    await expect(post(`${url}/contacts`, {})).rejects.toThrow();
    const seen = await standIns.observe({ standIn: 'crm', route: null }, () => true, 10, Deadline.in(1000));
    expect(seen.calls[0]).toMatchObject({ status: 0, faulted: true });
  });

  it('polls until the expected calls arrive, and names an unknown stand-in', async () => {
    const { standIns, url } = await start();
    setTimeout(() => { void post(`${url}/contacts`, {}); }, 50);
    const seen = await standIns.observe({ standIn: 'crm', route: null }, (o) => o.count === 1, 10, Deadline.in(2000));
    expect(seen.count).toBe(1);
    expect(() => standIns.arm(StandInFault.parse({ standIn: 'billing', route: { method: 'POST', path: '/x' }, times: 1, status: 500 }))).toThrow(StandInError);
  });
});
