import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: fake.launch } }));
import { BrowserDriver, BrowserStepError } from '../src/adapters/browser/driver.ts';
import { Deadline } from '../src/core/deadline.ts';
import { EventLog } from '../src/core/events.ts';

const ticket = 'private-synthetic-ticket';
const order: string[] = [];
let close: ReturnType<typeof vi.fn>;
function makePage() {
  const listeners = new Map<string, (event: unknown) => void>();
  return { listeners, page: {
    on: vi.fn((name: string, callback: (event: unknown) => void) => { listeners.set(name, callback); }),
    goto: vi.fn<(url: string, options: { timeout: number; waitUntil: string }) => Promise<null>>(),
    url: vi.fn(() => 'https://app.example/home'),
    waitForLoadState: vi.fn(async () => undefined),
    screencast: { start: vi.fn(async () => undefined) },
  } };
}
let fixture: ReturnType<typeof makePage>;
beforeEach(() => {
  vi.resetAllMocks(); order.length = 0;
  close = vi.fn().mockRejectedValue(new Error(`cleanup failed ${ticket}`));
  fixture = makePage();
  const { page } = fixture;
  page.goto.mockImplementation(async () => { order.push('entry'); throw new Error(`page.goto: https://app.example/sign-in?ticket=${ticket}`); });
  const context = { close: vi.fn(async () => undefined), routeWebSocket: vi.fn(), newPage: vi.fn(async () => page), on: vi.fn(() => { order.push('popup-guard'); }),
    newCDPSession: vi.fn(async () => ({ on: vi.fn(), send: vi.fn(async () => ({ frameTree: { frame: { id: 'main' } } })) })) };
  fake.launch.mockResolvedValue({ close, newContext: vi.fn(async () => context) });
});

describe('credential-bearing browser setup failures', () => {
  it('returns only a fixed typed error, including when cleanup itself fails', async () => {
    const error = await BrowserDriver.start({ origin: 'https://app.example/', deadline: Deadline.in(1000), entryPath: `/sign-in?ticket=${ticket}` }).catch(error => error);
    expect(error).toMatchObject({ code: 'browser_setup_failed', message: 'browser_setup_failed' });
    // The executor durably serializes the error message. It cannot recover the
    // original URL through a cause or another enumerable diagnostic property.
    expect(JSON.stringify({ message: error.message, cause: error.cause, error })).not.toContain(ticket);
    expect(error.stack).not.toContain(ticket);
    const log = new EventLog('exec-redaction', 'attempt-redaction', 1);
    log.emit('step.finished', 'credential-entry', { result: 'failed', reason: error.code, message: String(error.message) });
    expect(log.toJsonl()).not.toContain(ticket);
    expect(close).toHaveBeenCalledOnce();
    expect(order.indexOf('popup-guard')).toBeLessThan(order.indexOf('entry'));
  });
  it('does not emit cancellation reasons containing credentials', async () => {
    const controller = new AbortController(); controller.abort(new Error(ticket));
    await expect(BrowserDriver.start({ origin: 'https://app.example/', deadline: Deadline.in(1000), signal: controller.signal,
      entryPath: `/sign-in?ticket=${ticket}` })).rejects.toMatchObject({ message: 'browser_cancelled' });
    expect(fake.launch).not.toHaveBeenCalled();
  });
  it('sanitizes a typed cancellation reason received during setup', async () => {
    const controller = new AbortController();
    fake.launch.mockImplementationOnce(async () => {
      controller.abort(new BrowserStepError(ticket));
      return { close };
    });
    await expect(BrowserDriver.start({ origin: 'https://app.example/', deadline: Deadline.in(1000), signal: controller.signal,
      entryPath: `/sign-in?ticket=${ticket}` })).rejects.toMatchObject({ message: 'browser_cancelled' });
  });
  it('never records if the bounded transition away from the private page fails', async () => {
    fixture.page.goto.mockImplementation(async url => {
      if (url === 'about:blank') throw new Error(`navigation failed at /sign-in/${ticket}`);
      return null;
    });
    await expect(BrowserDriver.start({ origin: 'https://app.example/', deadline: Deadline.in(30_000),
      entryPath: `/sign-in/${ticket}` })).rejects.toMatchObject({ code: 'browser_setup_failed' });
    expect(fixture.page.screencast.start).not.toHaveBeenCalled();
    const blankOptions = fixture.page.goto.mock.calls.find(call => call[0] === 'about:blank')![1];
    expect(blankOptions.timeout).toBeGreaterThan(0);
    expect(blankOptions.timeout).toBeLessThanOrEqual(15_000);
  });
  it('does not record a page that reports the old URL after the blank transition', async () => {
    fixture.page.goto.mockResolvedValue(null);
    await expect(BrowserDriver.start({ origin: 'https://app.example/', deadline: Deadline.in(1000),
      entryPath: `/sign-in/${ticket}` })).rejects.toMatchObject({ code: 'browser_setup_failed' });
    expect(fixture.page.screencast.start).not.toHaveBeenCalled();
  });
  it('keeps late private responses and failures out of the public event stream', async () => {
    const privateRequest = { url: () => `https://app.example/sign-in/${ticket}`, method: () => 'GET' };
    fixture.page.goto.mockImplementation(async url => {
      if (url === 'about:blank') fixture.page.url.mockReturnValue('about:blank');
      else fixture.listeners.get('request')!(privateRequest);
      return null;
    });
    close.mockResolvedValue(undefined);
    const onNetwork = vi.fn();
    const driver = await BrowserDriver.start({ origin: 'https://app.example/', deadline: Deadline.in(1000), entryPath: `/sign-in/${ticket}`, onNetwork });
    fixture.listeners.get('response')!({ request: () => privateRequest, status: () => 200 });
    fixture.listeners.get('requestfailed')!(privateRequest);
    expect(onNetwork).not.toHaveBeenCalled();
    fixture.listeners.get('request')!({ url: () => 'https://app.example/whoami', method: () => 'GET' });
    expect(onNetwork).toHaveBeenCalledOnce();
    expect(JSON.stringify(onNetwork.mock.calls)).not.toContain(ticket);
    await driver.dispose();
  });
});
