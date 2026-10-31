import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserDriver } from '../src/adapters/browser/driver.ts';
import { BrowserCommand } from '../src/protocol/schemas/browser.ts';
import { Deadline } from '../src/core/deadline.ts';
import { chromium } from 'playwright';

async function finalVideoPixel(bytes: Buffer): Promise<number[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<video preload="auto" src="data:video/webm;base64,${bytes.toString('base64')}"></video>`);
    await page.waitForFunction(() => { const video = document.querySelector('video')!; return video.readyState >= 2 && Number.isFinite(video.duration); }, undefined, { timeout: 5000 });
    await page.locator('video').evaluate(element => {
      if (!(element instanceof HTMLVideoElement)) throw new Error('expected a video element');
      element.currentTime = Math.max(0.001, element.duration - 0.04);
    });
    await page.waitForFunction(() => { const video = document.querySelector('video')!; return !video.seeking && video.currentTime > 0; }, undefined, { timeout: 5000 });
    return await page.locator('video').evaluate(element => {
      if (!(element instanceof HTMLVideoElement)) throw new Error('expected a video element');
      const video = element;
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0);
      return [...Array.from(context.getImageData(310, 10, 1, 1).data), video.videoWidth, video.videoHeight];
    });
  } finally { await browser.close(); }
}

describe('real isolated browser driver', () => {
  let server: Server;
  let origin: string;
  let driver: BrowserDriver | undefined;
  let saved: string[];
  let outside: Server;
  let outsideHits: number;
  let outsideOrigin: string;
  let streamClosed: boolean;
  const start = async (inputMode: 'pointer' | 'keyboard' | 'touch' = 'pointer') => driver = await BrowserDriver.start({ origin, deadline: Deadline.in(10_000), inputMode });
  const execute = (command: unknown) => driver!.execute(command, Deadline.in(5000));

  beforeEach(async () => {
    saved = []; outsideHits = 0; streamClosed = false;
    outside = createServer((_req, res) => { outsideHits++; res.end('outside'); }).listen(0, '127.0.0.1');
    await once(outside, 'listening');
    outsideOrigin = `http://127.0.0.1:${(outside.address() as { port: number }).port}`;
    server = createServer((req, res) => {
      if (req.url?.startsWith('/sign-in?ticket=')) { res.writeHead(302, { location: '/home', 'set-cookie': 'session=ok; Path=/; HttpOnly' }); res.end(); return; }
      if (req.url === '/whoami') { res.setHeader('content-type', 'text/html'); res.end(`<p data-testid="who">${req.headers.cookie?.includes('session=ok') ? 'signed in' : 'anonymous'}</p>`); return; }
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
        <button onclick="fetch('/saved', {method:'POST'}).then(() => {document.querySelector('[role=status]').textContent=document.querySelector('input').value;document.querySelector('#visual').style.background='rgb(0,255,0)'})">Save</button>
        <div id="visual" style="position:absolute;left:300px;top:0;width:40px;height:40px;background:rgb(255,0,0)"></div>
        <details><summary data-testid="options">More options</summary><p data-testid="inside-options">A useful next step</p></details>
        <p role="status" data-testid="result">Ready</p><a href="${outsideOrigin}">Outside</a>
        <label>Subscribe<input type="checkbox" onchange="document.querySelector('[role=status]').textContent=this.checked?'Subscribed':'Not subscribed'"></label>
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

  it('signs in through a same-origin entry link before recording, without logging it', async () => {
    const network: string[] = [];
    driver = await BrowserDriver.start({ origin, deadline: Deadline.in(10_000), entryPath: '/sign-in?ticket=secret-ticket',
      allowedResourcePrefixes: ['/whoami'], onNetwork: event => network.push(event.url) });
    await execute({ kind: 'navigate', path: '/whoami' });
    expect((await execute({ kind: 'read', target: { by: 'testId', name: 'who' } })).text).toBe('signed in');
    expect(network.some(url => url.includes('/sign-in') || url.includes('/home'))).toBe(false);
    // After sign-in the case's own path rules apply again.
    await expect(execute({ kind: 'navigate', path: '/home' })).rejects.toThrow();
  });

  it('refuses an entry link that leaves the app origin', async () => {
    await expect(BrowserDriver.start({ origin, deadline: Deadline.in(10_000), entryPath: '//evil.example/sign-in' })).rejects.toThrow();
    await expect(BrowserDriver.start({ origin, deadline: Deadline.in(10_000), extraOrigins: ['http://cdn.example'] })).rejects.toThrow();
  });

  it.each(['pointer', 'keyboard', 'touch'] as const)('opens native disclosure with %s input', async inputMode => {
    await start(inputMode);
    await execute({ kind: 'navigate', path: '/' });
    await execute({ kind: 'click', target: { by: 'testId', name: 'options' } });
    expect((await execute({ kind: 'read', target: { by: 'testId', name: 'inside-options' } })).text).toBe('A useful next step');
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
    const pixel = await finalVideoPixel(video);
    expect(pixel[1]).toBeGreaterThan(200);
    expect(pixel[0]).toBeLessThan(30);
    await expect(execute({ kind: 'navigate', path: '/' })).rejects.toMatchObject({ code: 'browser_closed' });
  });

  it.each(['pointer', 'keyboard', 'touch'] as const)('records an unchanged final page for %s without another user action', async inputMode => {
    await start(inputMode);
    await execute({ kind: 'navigate', path: '/' });
    const pixel = await finalVideoPixel(await driver!.collectVideo());
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(30);
  });

  it('records mobile pixels without scaling them into a desktop canvas', async () => {
    driver = await BrowserDriver.start({ origin, deadline: Deadline.in(10_000), viewport: { width: 375, height: 812 } });
    await execute({ kind: 'navigate', path: '/' });
    const pixelAndSize = await finalVideoPixel(await driver.collectVideo());
    expect(pixelAndSize.slice(4)).toEqual([376, 812]);
    expect(pixelAndSize[0]).toBeGreaterThan(200);
    expect(pixelAndSize[1]).toBeLessThan(30);
  });

  it('rejects cross-origin URL resolution before contacting that origin', async () => {
    await start();
    await expect(execute({ kind: 'navigate', path: `//127.0.0.1:${(outside.address() as { port: number }).port}/` })).rejects.toMatchObject({ code: 'origin_not_admitted' });
    expect(outsideHits).toBe(0);
  });

  it('activates a checkbox with Space for a keyboard persona', async () => {
    await start('keyboard'); await execute({ kind: 'navigate', path: '/' });
    await execute({ kind: 'click', target: { by: 'role', role: 'checkbox', name: 'Subscribe' } });
    expect((await execute({ kind: 'read', target: { by: 'testId', name: 'result' } })).text).toBe('Subscribed');
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

  it('preserves the browser and recording after a read-only timeout', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    await expect(driver!.execute({ kind: 'read', target: { by: 'testId', name: 'missing' } }, Deadline.in(100)))
      .rejects.toMatchObject({ code: 'browser_timeout' });
    expect((await execute({ kind: 'read', target: { by: 'testId', name: 'result' } })).text).toBe('Ready');
    const pixel = await finalVideoPixel(await driver!.collectVideo());
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(30);
  });

  it('still closes the browser when a read-only observation is cancelled', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    const cancellation = new AbortController();
    const pending = driver!.execute({ kind: 'read', target: { by: 'testId', name: 'missing' } }, Deadline.in(5000), cancellation.signal);
    cancellation.abort();
    await expect(pending).rejects.toMatchObject({ code: 'browser_cancelled' });
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

  it('refuses collection when the final paint deadline has expired', async () => {
    await start(); await execute({ kind: 'navigate', path: '/' });
    await expect(driver!.collectVideo(1024 * 1024, new Deadline(0))).rejects.toMatchObject({ code: 'video_final_frame_unavailable', phase: 'capture' });
  });
});
