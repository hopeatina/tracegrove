/**
 * A loopback reverse proxy the launcher puts in front of the application. Every request a
 * scenario causes (HTTP steps, browser pages, fetches the page makes) passes through it, so
 * coverage comes from what the app actually served rather than from what flow files declare.
 *
 * It records only request metadata: method, pathname, sorted query keys, status, duration and
 * response size. Header and body values, and query values, are never recorded because they
 * can carry credentials.
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { monotonicMs } from '../core/clock.ts';

export type TrafficRecord = {
  stepId: string | null;
  method: string;
  path: string;
  queryKeys: string[];
  /** null when the upstream connection failed before a response */
  status: number | null;
  durationMs: number;
  responseBytes: number;
  upgrade: boolean;
};

export const MAX_TRAFFIC_RECORDS = 2000;

export type TrafficRecorder = {
  origin: string;
  /** Attribute requests that start from now on to this step (null between steps). */
  setStep(stepId: string | null): void;
  /** Records are delivered as each response finishes. Only one subscriber. */
  subscribe(sink: (record: TrafficRecord) => void): void;
  /** Requests beyond MAX_TRAFFIC_RECORDS are counted, not recorded. */
  dropped(): number;
  /** Stop delivering records; later requests (cleanup, page teardown) are only counted. */
  seal(): { recorded: number; dropped: number; afterSeal: number };
  close(): Promise<void>;
};

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade']);

function splitTarget(url: string | undefined): { path: string; queryKeys: string[] } {
  const parsed = new URL(url ?? '/', 'http://proxy.invalid');
  return { path: parsed.pathname, queryKeys: [...new Set(parsed.searchParams.keys())].sort() };
}

export async function startTrafficProxy(upstreamPort: number): Promise<TrafficRecorder> {
  const upstreamHost = `127.0.0.1:${upstreamPort}`;
  let step: string | null = null;
  let sink: ((record: TrafficRecord) => void) | null = null;
  const pending: TrafficRecord[] = [];
  let recorded = 0;
  let droppedCount = 0;
  let sealed = false;
  let afterSeal = 0;
  const sockets = new Set<Socket>();
  let publicOrigin = '';

  const record = (entry: TrafficRecord) => {
    if (sealed) { afterSeal++; return; }
    if (recorded >= MAX_TRAFFIC_RECORDS) { droppedCount++; return; }
    recorded++;
    if (sink) sink(entry); else pending.push(entry);
  };

  const forwardedHeaders = (req: IncomingMessage): Record<string, string | string[]> => {
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_BY_HOP.has(name)) continue;
      headers[name] = value;
    }
    // The app sees its own host, as behind any reverse proxy; the public host travels in X-Forwarded-Host.
    headers.host = upstreamHost;
    if (req.headers.host) headers['x-forwarded-host'] = req.headers.host;
    headers['x-forwarded-proto'] = 'http';
    return headers;
  };

  // Absolute redirects to the private port would take the browser outside the admitted origin.
  const rewriteLocation = (value: string | string[] | undefined): string | string[] | undefined => {
    if (typeof value !== 'string') return value;
    for (const prefix of [`http://${upstreamHost}`, `http://localhost:${upstreamPort}`]) {
      if (value === prefix || value.startsWith(`${prefix}/`)) return publicOrigin + value.slice(prefix.length);
    }
    return value;
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const started = monotonicMs();
    const at = step;
    const { path, queryKeys } = splitTarget(req.url);
    const method = (req.method ?? 'GET').toUpperCase();
    let bytes = 0;
    let done = false;
    const finish = (status: number | null) => {
      if (done) return; done = true;
      record({ stepId: at, method, path, queryKeys, status, durationMs: Math.round(monotonicMs() - started), responseBytes: bytes, upgrade: false });
    };
    const upstream = httpRequest({ host: '127.0.0.1', port: upstreamPort, method, path: req.url, headers: forwardedHeaders(req) }, (answer) => {
      const headers = { ...answer.headers };
      if (headers.location) headers.location = rewriteLocation(headers.location) as string;
      for (const name of Object.keys(headers)) if (HOP_BY_HOP.has(name)) delete headers[name];
      res.writeHead(answer.statusCode ?? 502, headers);
      answer.on('data', (chunk: Buffer) => { bytes += chunk.length; });
      answer.pipe(res);
      answer.on('end', () => finish(answer.statusCode ?? null));
      answer.on('error', () => finish(answer.statusCode ?? null));
      res.on('close', () => finish(answer.statusCode ?? null));
    });
    upstream.on('error', () => {
      finish(null);
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('tracegrove proxy: upstream unavailable');
    });
    req.pipe(upstream);
  });

  // WebSocket and other upgrades are tunnelled byte for byte and recorded once.
  server.on('upgrade', (req: IncomingMessage, client: Socket, head: Buffer) => {
    const started = monotonicMs();
    const at = step;
    const { path, queryKeys } = splitTarget(req.url);
    const upstream = connect(upstreamPort, '127.0.0.1', () => {
      const headers = forwardedHeaders(req);
      headers.connection = 'Upgrade';
      if (req.headers.upgrade) headers.upgrade = req.headers.upgrade;
      const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`];
      for (const [name, value] of Object.entries(headers)) for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      upstream.pipe(client); client.pipe(upstream);
      record({ stepId: at, method: (req.method ?? 'GET').toUpperCase(), path, queryKeys, status: 101, durationMs: Math.round(monotonicMs() - started), responseBytes: 0, upgrade: true });
    });
    const close = () => { upstream.destroy(); client.destroy(); };
    upstream.on('error', close); client.on('error', close);
  });

  server.on('connection', (socket: Socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolveListen()); });
  publicOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    origin: publicOrigin,
    setStep(stepId) { step = stepId; },
    subscribe(next) { sink = next; for (const entry of pending.splice(0)) next(entry); },
    dropped: () => droppedCount,
    seal() { sealed = true; sink = null; return { recorded, dropped: droppedCount, afterSeal }; },
    close: () => new Promise<void>((resolveClose) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolveClose());
    }),
  };
}
