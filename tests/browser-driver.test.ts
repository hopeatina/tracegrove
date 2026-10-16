import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserDriver } from '../src/adapters/browser/driver.ts';
import { BrowserCommand } from '../src/protocol/schemas/browser.ts';
import { Deadline } from '../src/core/deadline.ts';

describe('real isolated browser driver', () => {
  let server: Server;
  let origin: string;
  let driver: BrowserDriver | undefined;
  let saved: string[];
  let outside: Server;
  let outsideHits: number;
  let outsideOrigin: string;
  let streamClosed: boolean;
  const start = async () => driver = await BrowserDriver.start({ origin, deadline: Deadline.in(10_000) });
  const execute = (command: unknown) => driver!.execute(command, Deadline.in(5000));

  beforeEach(async () => {
    saved = []; outsideHits = 0; streamClosed = false;
    outside = createServer((_req, res) => { outsideHits++; res.end('outside'); }).listen(0, '127.0.0.1');
    await once(outside, 'listening');
    outsideOrigin = `http://127.0.0.1:${(outside.address() as { port: number }).port}`;
    server = createServer((req, res) => {
      if (req.url === '/saved') { saved.push('saved'); res.end('ok'); return; }
      if (req.url === '/redirect') { res.writeHead(302, { location: outsideOrigin }); res.end(); return; }
      if (req.url === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: stream chunk\n\n');
        res.on('close', () => { streamClosed = true; });
        return;
      }
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><label>Note<input id="note"></label>
        <button onclick="fetch('/saved', {method:'POST'}).then(() => document.querySelector('[role=status]').textContent=document.querySelector('input').value)">Save</button>
        <p role="status" data-testid="result">Ready</p><a href="${outsideOrigin}">Outside</a>
        <button onclick="fetch('${outsideOrigin}').catch(() => {})">Fetch outside</button>
        <button onclick="new EventSource('/events').onmessage = e => document.querySelector('[role=status]').textContent=e.data">Stream</button>`);
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await driver?.dispose(); driver = undefined;
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => outside.close(() => resolve()))]);
  });

  it('changes a real app through semantic locators and flushes a WebM recording', async () => {
    await start();
    expect((await execute({ kind: 'navigate', path: '/' })).status).toBe(200);
    await execute({ kind: 'fill', target: { by: 'label', name: 'Note' }, value: 'A real note' });
    await execute({ kind: 'click', target: { by: 'role', role: 'button', name: 'Save' } });
    // The server receipt is independent of the DOM readback.
    await expect.poll(() => saved.length).toBe(1);
    await expect.poll(async () => (await execute({ kind: 'read', target: { by: 'testId', name: 'result' } })).text).toBe('A real note');
    const video = await driver!.collectVideo();
    expect(video.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    await expect(execute({ kind: 'navigate', path: '/' })).rejects.toMatchObject({ code: 'browser_closed' });
  });

  it('rejects cross-origin URL resolution before contacting that origin', async () => {
    await start();
    await expect(execute({ kind: 'navigate', path: `//127.0.0.1:${(outside.address() as { port: number }).port}/` })).rejects.toMatchObject({ code: 'origin_not_admitted' });
    expect(outsideHits).toBe(0);
  });

  it('observes a streamed message before the server finishes its response', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    await execute({ kind: 'click', target: { by: 'role', role: 'button', name: 'Stream' } });
    await expect.poll(async () => (await execute({ kind: 'read', target: { by: 'testId', name: 'result' } })).text).toBe('stream chunk');
    expect(streamClosed).toBe(false);
  });

  it('filters page requests and redirect destinations at the browser boundary', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    await execute({ kind: 'click', target: { by: 'role', role: 'button', name: 'Fetch outside' } });
    await expect(execute({ kind: 'navigate', path: '/redirect' })).rejects.toMatchObject({ code: 'browser_operation_failed' });
    expect(outsideHits).toBe(0);
  });

  it('cancels a waiting click by closing the browser before returning', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    const cancellation = new AbortController();
    const pending = driver!.execute({ kind: 'click', target: { by: 'role', role: 'button', name: 'Missing' } }, Deadline.in(5000), cancellation.signal);
    cancellation.abort();
    await expect(pending).rejects.toMatchObject({ code: 'browser_cancelled' });
    expect(saved).toEqual([]);
    await expect(execute({ kind: 'navigate', path: '/' })).rejects.toMatchObject({ code: 'browser_closed' });
  });

  it('fails closed after action timeout and excludes values from diagnostics', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    await expect(driver!.execute({ kind: 'fill', target: { by: 'label', name: 'Missing' }, value: 'private-input' }, Deadline.in(100))).rejects.toMatchObject({ message: 'browser_timeout' });
    await expect(execute({ kind: 'navigate', path: '/' })).rejects.toMatchObject({ code: 'browser_closed' });
  });

  it('rejects scripts, arbitrary selectors and unbounded input at the typed boundary', () => {
    expect(BrowserCommand.safeParse({ kind: 'evaluate', script: '1' }).success).toBe(false);
    expect(BrowserCommand.safeParse({ kind: 'click', target: { by: 'css', name: '*' } }).success).toBe(false);
    expect(BrowserCommand.safeParse({ kind: 'fill', target: { by: 'label', name: 'Note' }, value: 'a'.repeat(8193) }).success).toBe(false);
  });

  it('rejects an expired start before allocating a browser', async () => {
    await expect(BrowserDriver.start({ origin, deadline: new Deadline(0) })).rejects.toThrow();
  });
});
