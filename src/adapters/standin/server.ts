/**
 * Stand-in third parties: one recording HTTP server per declared stand-in, on loopback, owned by the host
 * for one attempt. Each answers from its declared responses (404 otherwise), records every request, and
 * applies armed faults to the next matching calls. Steps read the record back; nothing here trusts the app.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { Deadline } from '../../core/deadline.ts';
import { pollObservation } from '../poll.ts';
import type { StandInFault, StandInObservation, StandInQuery, StandInSpec } from '../../protocol/index.ts';

const MAX_BODY = 65_536;
const MAX_CALLS = 200;

export class StandInError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

type Call = StandInObservation['calls'][number];
type Armed = { fault: StandInFault; remaining: number };

/** `/events/{id}` and `/hooks/*` match any one segment and any rest; everything else matches exactly. */
function routeMatches(pattern: string, path: string): boolean {
  const p = pattern.split('/'); const a = path.split('/');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') return true;
    if (a[i] === undefined) return false;
    if (/^\{[^}]+\}$/.test(p[i]!)) { if (!a[i]) return false; continue; }
    if (p[i] !== a[i]) return false;
  }
  return p.length === a.length;
}

/** The idempotency key at a dotted body path, as text; null when absent. */
function keyOf(json: unknown, path: string): string | null {
  const value = path.split('.').reduce<unknown>((at, part) => at && typeof at === 'object' ? (at as Record<string, unknown>)[part] : undefined, json);
  return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 400) : null;
}

const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
  let size = 0; const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= MAX_BODY) chunks.push(chunk); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

export class StandIn {
  readonly calls: Call[] = [];
  private armed: Armed[] = [];
  private sockets = new Set<Socket>();
  private constructor(readonly spec: StandInSpec, private server: Server, readonly url: string) {
    server.on('connection', socket => { this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)); });
  }

  static async start(spec: StandInSpec): Promise<StandIn> {
    let self: StandIn | null = null;
    const server = createServer((req, res) => { void self!.handle(req, res); });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
    self = new StandIn(spec, server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    return self;
  }

  arm(fault: StandInFault): void { this.armed.push({ fault, remaining: fault.times }); }

  private async handle(req: IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.url);
    const method = (req.method ?? 'GET').toUpperCase();
    const text = await readBody(req).catch(() => '');
    let json: unknown = null;
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    const armed = this.armed.find(a => a.remaining > 0 && a.fault.route.method === method && routeMatches(a.fault.route.path, url.pathname));
    if (armed) armed.remaining--;
    const response = this.spec.responses.find(r => r.method === method && routeMatches(r.path, url.pathname));
    const status = armed?.fault.status ?? response?.status ?? 404;
    const keyed = this.spec.idempotencyKey ? keyOf(json, this.spec.idempotencyKey) : undefined;
    const repeat = keyed ? this.calls.some(c => c.key === keyed && c.method === method && c.path === url.pathname) : false;
    if (this.calls.length < MAX_CALLS) this.calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), json: json as Call['json'],
      text: json === null && text ? text.slice(0, MAX_BODY) : null, status: armed?.fault.drop ? 0 : status, faulted: Boolean(armed), at: new Date().toISOString(),
      ...(this.spec.idempotencyKey ? { key: keyed ?? null, repeat } : {}) });
    if (armed?.fault.delayMs) await new Promise(resolve => setTimeout(resolve, armed.fault.delayMs));
    if (armed?.fault.drop) { req.socket.destroy(); return; }
    const body = armed?.fault.status !== undefined ? { error: 'stand_in_fault', status } : response ? response.json ?? {} : { error: 'stand_in_route_not_declared', method, path: url.pathname };
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  }

  observe(route: StandInQuery['route']): StandInObservation {
    const calls = this.calls.filter(c => !route || (c.method === route.method && routeMatches(route.path, c.path)));
    return { kind: 'stand_in', standIn: this.spec.name, route, count: calls.length, calls: calls.map(c => ({ ...c, query: { ...c.query } })), attempts: 0,
      ...(this.spec.idempotencyKey ? { distinct: calls.filter(c => !c.repeat).length } : {}) };
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }
}

export class StandIns {
  private constructor(private byName: Map<string, StandIn>) {}

  static async start(specs: StandInSpec[]): Promise<StandIns> {
    const started = new Map<string, StandIn>();
    try { for (const spec of specs) started.set(spec.name, await StandIn.start(spec)); }
    catch (error) { await Promise.all([...started.values()].map(s => s.close())); throw error; }
    return new StandIns(started);
  }

  /** Environment variables that point the app at each stand-in. */
  env(): Record<string, string> { return Object.fromEntries([...this.byName.values()].map(s => [s.spec.env, s.url])); }
  names(): string[] { return [...this.byName.keys()]; }
  urls(): string[] { return [...this.byName.values()].map(s => s.url); }

  private get(name: string): StandIn {
    const found = this.byName.get(name);
    if (!found) throw new StandInError('stand_in_unknown', `no stand-in named ${name}; declare it under standIns in tracegrove.config.yaml`);
    return found;
  }

  arm(fault: StandInFault) {
    this.get(fault.standIn).arm(fault);
    return { kind: 'stand_in_fault' as const, standIn: fault.standIn, route: fault.route, times: fault.times, attempts: 1 };
  }

  async observe(query: StandInQuery, accepts: (o: StandInObservation) => boolean, pollIntervalMs: number, deadline: Deadline, signal?: AbortSignal): Promise<StandInObservation> {
    const standIn = this.get(query.standIn);
    return pollObservation({ read: async () => standIn.observe(query.route), accepts, deadline, pollIntervalMs, signal, cancelled: () => new StandInError('cancelled', 'stand-in readback cancelled') });
  }

  async close(): Promise<void> { await Promise.all([...this.byName.values()].map(s => s.close())); }
}
