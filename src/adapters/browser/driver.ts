import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Deadline } from '../../core/deadline.ts';
import { readBoundedFile } from '../../core/boundedFile.ts';
import { BrowserCommand, BrowserObservation, type BrowserLocator } from '../../protocol/schemas/browser.ts';

export class BrowserStepError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'BrowserStepError'; }
}

/** Local browser facts only. Qualification and artifact admission belong to the controller. */
export class BrowserDriver {
  private closing: Promise<void> | undefined;
  private busy = false;
  private constructor(
    private readonly origin: string,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly mediaDir: string,
  ) {}

  static async start(input: { origin: string; deadline: Deadline; signal?: AbortSignal }): Promise<BrowserDriver> {
    const origin = new URL(input.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== `${origin.origin}/` || origin.username || origin.password) {
      throw new BrowserStepError('invalid_origin');
    }
    const signal = input.deadline.signal(input.signal);
    signal.throwIfAborted();
    const mediaDir = await mkdtemp(join(tmpdir(), 'tracegrove-browser-'));
    let browser: Browser | undefined;
    const abort = () => { void browser?.close().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      browser = await chromium.launch({ headless: true, timeout: Math.max(1, input.deadline.remainingMs()) });
      signal.throwIfAborted();
      const context = await browser.newContext({
        serviceWorkers: 'block', acceptDownloads: false,
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: mediaDir, size: { width: 1280, height: 720 } },
      });
      await context.routeWebSocket('**/*', socket => socket.close());
      const page = await context.newPage();
      // CDP pauses every redirect hop. Continue the native response stream rather
      // than buffering/proxying it through route.fetch (which breaks chat/SSE).
      const network = await context.newCDPSession(page);
      network.on('Fetch.requestPaused', event => {
        const allowed = new URL(event.request.url).origin === origin.origin;
        const operation = allowed
          ? network.send('Fetch.continueRequest', { requestId: event.requestId })
          : network.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
        void operation.catch(() => context.close().catch(() => {}));
      });
      await network.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
      context.on('page', extra => { if (extra !== page) void extra.close().catch(() => {}); });
      page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
      signal.throwIfAborted();
      return new BrowserDriver(origin.origin, browser, context, page, mediaDir);
    } catch (error) {
      await browser?.close();
      await rm(mediaDir, { recursive: true, force: true });
      throw error;
    } finally { signal.removeEventListener('abort', abort); }
  }

  private locator(target: BrowserLocator): Locator {
    switch (target.by) {
      case 'role': return this.page.getByRole(target.role, { name: target.name, exact: true });
      case 'label': return this.page.getByLabel(target.name, { exact: true });
      case 'testId': return this.page.getByTestId(target.name);
    }
  }

  async execute(input: unknown, deadline: Deadline, parent?: AbortSignal): Promise<BrowserObservation> {
    const command = BrowserCommand.parse(input);
    if (this.closing) throw new BrowserStepError('browser_closed');
    if (this.busy) throw new BrowserStepError('browser_busy');
    const signal = deadline.signal(parent);
    signal.throwIfAborted();
    this.busy = true;
    // Closing the context interrupts Playwright's pending action and prevents late clicks.
    const abort = () => { void this.close().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      const timeout = Math.max(1, deadline.remainingMs());
      let status: number | null = null;
      let text: string | null = null;
      let textTruncated = false;
      if (command.kind === 'navigate') {
        const url = new URL(command.path, this.origin);
        if (url.origin !== this.origin || url.username || url.password) throw new BrowserStepError('origin_not_admitted');
        status = (await this.page.goto(url.href, { timeout, waitUntil: 'domcontentloaded' }))?.status() ?? null;
      } else {
        const locator = this.locator(command.target);
        if (command.kind === 'click') await locator.click({ timeout });
        if (command.kind === 'fill') await locator.fill(command.value, { timeout });
        if (command.kind === 'read') {
          await locator.waitFor({ state: 'visible', timeout });
          // Bound the text before transporting it out of the page.
          const result = await locator.evaluate(element => {
            const value = element.textContent ?? '';
            return { text: value.slice(0, 8192), truncated: value.length > 8192 };
          }, undefined, { timeout: Math.max(1, deadline.remainingMs()) });
          text = result.text; textTruncated = result.truncated;
        }
      }
      signal.throwIfAborted();
      if (new URL(this.page.url()).origin !== this.origin) throw new BrowserStepError('origin_not_admitted');
      return BrowserObservation.parse({ kind: command.kind, url: this.page.url().slice(0, 4096), status, text, textTruncated });
    } catch (error) {
      const cancelled = parent?.aborted === true;
      const timedOut = deadline.expired() || (error instanceof Error && error.name === 'TimeoutError');
      // A timeout poisons the session; do not leave an action running after reporting failure.
      await this.close();
      if (cancelled) throw new BrowserStepError('browser_cancelled');
      if (timedOut) throw new BrowserStepError('browser_timeout');
      if (error instanceof BrowserStepError) throw error;
      // Playwright diagnostics may include filled values or page text. Never emit them as errors.
      throw new BrowserStepError('browser_operation_failed');
    } finally {
      this.busy = false;
      signal.removeEventListener('abort', abort);
    }
  }

  /** RPC closure acknowledgement, not a process-tree cleanup attestation. */
  close(): Promise<void> {
    this.closing ??= this.context.close().finally(() => this.browser.close());
    return this.closing;
  }

  /** Closing flushes the real recording; the caller must seal it in its evidence store. */
  async collectVideo(): Promise<Buffer> {
    await this.close();
    const path = await this.page.video()?.path();
    if (!path) throw new BrowserStepError('video_missing');
    const bytes = readBoundedFile(path, 32 * 1024 * 1024);
    if (!bytes.length) throw new BrowserStepError('video_empty');
    return bytes;
  }

  async dispose(): Promise<void> {
    await this.close();
    await rm(this.mediaDir, { recursive: true, force: true });
  }
}
