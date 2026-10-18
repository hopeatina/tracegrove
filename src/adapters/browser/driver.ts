import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Request } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Deadline } from '../../core/deadline.ts';
import { readBoundedFile } from '../../core/boundedFile.ts';
import { BrowserCommand, BrowserObservation, BrowserNetworkObservation, type BrowserLocator } from '../../protocol/schemas/browser.ts';

export class BrowserStepError extends Error {
  constructor(readonly code: string, readonly phase?: 'capture' | 'frame' | 'flush') { super(phase ? `${code}:${phase}` : code); this.name = 'BrowserStepError'; }
}

/** Local browser facts only. Qualification and artifact admission belong to the controller. */
export class BrowserDriver {
  private closing: Promise<void> | undefined;
  private busy = false;
  private latestFrameAt = 0;
  private onFrame: ((timestamp: number) => void) | undefined;
  private constructor(
    private readonly origin: string,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly mediaDir: string,
    private readonly inputMode: 'pointer' | 'keyboard' | 'touch',
  ) {}

  static async start(input: { origin: string; deadline: Deadline; signal?: AbortSignal;
    allowedMethods?: readonly string[]; allowedResourcePrefixes?: readonly string[];
    bearer?: string; viewport?: { width: number; height: number }; locale?: string; timezoneId?: string; reducedMotion?: boolean;
    inputMode?: 'pointer' | 'keyboard' | 'touch';
    onNetwork?: (observation: BrowserNetworkObservation) => void;
  }): Promise<BrowserDriver> {
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
        viewport: input.viewport ?? { width: 1280, height: 720 },
        hasTouch: input.inputMode === 'touch',
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.timezoneId ? { timezoneId: input.timezoneId } : {}),
        reducedMotion: input.reducedMotion ? 'reduce' : 'no-preference',
      });
      await context.routeWebSocket('**/*', socket => socket.close());
      const page = await context.newPage();
      const requests = new WeakMap<Request, number>();
      let nextRequest = 0;
      const observeNetwork = (kind: BrowserNetworkObservation['kind'], request: Request, status: number | null) => {
        if (!input.onNetwork) return;
        try {
          let requestId = requests.get(request);
          if (requestId === undefined) { requestId = ++nextRequest; requests.set(request, requestId); }
          const url = new URL(request.url());
          input.onNetwork(BrowserNetworkObservation.parse({ kind, requestId, method: request.method(), url: `${url.origin}${url.pathname}`.slice(0, 4096), status }));
        } catch { void context.close().catch(() => {}); }
      };
      page.on('request', request => observeNetwork('request', request, null));
      page.on('response', response => observeNetwork('response', response.request(), response.status()));
      page.on('requestfailed', request => observeNetwork('failed', request, null));
      // CDP pauses every redirect hop. Continue the native response stream rather
      // than buffering/proxying it through route.fetch (which breaks chat/SSE).
      const network = await context.newCDPSession(page);
      network.on('Fetch.requestPaused', event => {
        const url = new URL(event.request.url);
        const allowed = url.origin === origin.origin
          && (!input.allowedMethods || input.allowedMethods.includes(event.request.method))
          && (!input.allowedResourcePrefixes || input.allowedResourcePrefixes.some(prefix => url.pathname.startsWith(prefix)));
        const operation = allowed
          ? network.send('Fetch.continueRequest', { requestId: event.requestId,
            ...(input.bearer ? { headers: [...Object.entries(event.request.headers).filter(([name]) => name.toLowerCase() !== 'authorization').map(([name, value]) => ({ name, value: String(value) })), { name: 'Authorization', value: `Bearer ${input.bearer}` }] } : {}),
          })
          : network.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
        void operation.catch(() => context.close().catch(() => {}));
      });
      await network.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
      context.on('page', extra => { if (extra !== page) void extra.close().catch(() => {}); });
      page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
      signal.throwIfAborted();
      const driver = new BrowserDriver(origin.origin, browser, context, page, mediaDir, input.inputMode ?? 'pointer');
      // Keep mobile pixels at their native size; VP9's chroma grid needs even dimensions.
      const viewport = input.viewport ?? { width: 1280, height: 720 };
      const videoSize = { width: Math.ceil(viewport.width / 2) * 2, height: Math.ceil(viewport.height / 2) * 2 };
      await page.screencast.start({ path: join(mediaDir, 'recording.webm'), size: videoSize,
        onFrame: frame => { driver.latestFrameAt = frame.timestamp; driver.onFrame?.(frame.timestamp); },
      });
      signal.throwIfAborted();
      return driver;
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
    // A read timeout has no late mutation to revoke. Keep its recording alive;
    // user cancellation and mutating operations still close the context.
    const abort = () => {
      if (command.kind !== 'read' || parent?.aborted) void this.close().catch(() => {});
    };
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
        if (command.kind === 'click') {
          if (this.inputMode === 'touch') await locator.tap({ timeout });
          else if (this.inputMode === 'keyboard') {
            await locator.focus({ timeout });
            const key = await locator.evaluate(element => {
              if (element.matches('input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]')) return 'Space';
              if (element.matches('button,a,input[type=button],input[type=submit],input[type=reset],[role=button],[role=link]')) return 'Enter';
              return null; // A keyboard click on a text input means focus, not form submission.
            });
            if (key) await locator.press(key, { timeout });
          }
          else await locator.click({ timeout });
        }
        if (command.kind === 'fill') {
          if (this.inputMode === 'keyboard') { await locator.fill('', { timeout }); await locator.pressSequentially(command.value, { timeout }); }
          else await locator.fill(command.value, { timeout });
        }
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
      // Revoke failed mutating actions; a bounded read timeout can retain its video.
      if (cancelled || !timedOut || command.kind !== 'read') await this.close();
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

  /** Wait for a presented recording frame, then flush the encoder before closure. */
  async collectVideo(maxBytes = 32 * 1024 * 1024, deadline = Deadline.in(5000)): Promise<Buffer> {
    if (!this.closing) {
      const signal = deadline.signal();
      let phase: 'capture' | 'frame' | 'flush' = 'capture';
      try {
        signal.throwIfAborted();
        // Complete a layout-aware capture before defining the freshness barrier;
        // a newly delivered frame can still contain pixels queued before this capture.
        await this.page.screenshot({ type: 'png', animations: 'allow', caret: 'initial', timeout: Math.max(1, deadline.remainingMs()) });
        signal.throwIfAborted();
        // A DOM read or screenshot acknowledgement can precede recording delivery.
        // Browser presentation timestamps exclude frames already in flight.
        const since = Date.now() + 1;
        await new Promise<void>((resolve, reject) => {
          let captured = false;
          let presented = false;
          const finish = (error?: unknown) => {
            this.onFrame = undefined;
            signal.removeEventListener('abort', abort);
            if (error) reject(error); else resolve();
          };
          const abort = () => finish(signal.reason);
          this.onFrame = timestamp => {
            presented ||= timestamp >= since;
            if (captured && presented) finish();
          };
          signal.addEventListener('abort', abort, { once: true });
          void this.page.screenshot({ type: 'png', animations: 'allow', caret: 'initial', timeout: Math.max(1, deadline.remainingMs()) })
            .then(() => {
              captured = true;
              phase = 'frame';
              presented ||= this.latestFrameAt >= since;
              if (presented) finish();
            }, finish);
        });
        signal.throwIfAborted();
        phase = 'flush';
        const abort = () => { void this.close().catch(() => {}); };
        signal.addEventListener('abort', abort, { once: true });
        try { await this.page.screencast.stop(); signal.throwIfAborted(); }
        finally { signal.removeEventListener('abort', abort); }
      } catch {
        await this.close();
        throw new BrowserStepError('video_final_frame_unavailable', phase);
      }
    }
    await this.close();
    const bytes = readBoundedFile(join(this.mediaDir, 'recording.webm'), maxBytes);
    if (!bytes.length) throw new BrowserStepError('video_empty');
    return bytes;
  }

  async dispose(): Promise<void> {
    await this.close();
    await rm(this.mediaDir, { recursive: true, force: true });
  }
}
