import { existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { stringify } from 'yaml';
import { chromium, type Page } from 'playwright';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { BrowserCommand, type BrowserLocator } from '../protocol/schemas/browser.ts';
import { caseIdFor, loadAuthoringConfig } from '../authoring/compile.ts';
import { Flow, HttpFlowStep, StandInFlowStep, type FlowStep } from '../authoring/schema.ts';
import { runTests } from '../authoring/run.ts';

function stop(detail: string): never { throw new Blocked([{ code: 'record_blocked', detail }]); }
const Selection = z.union([
  HttpFlowStep.refine(s => !!s.GET && s.observe === true && typeof s.expect === 'object' &&
    Object.keys(s.expect).some(k => k !== 'status'), 'select a GET readback with a body assertion'),
  StandInFlowStep.refine(s => !!s.received && !s.fail && s.expect && Object.keys(s.expect).length > 0, 'select a provider call assertion'),
]);
function locator(page: Page, t: BrowserLocator) {
  if (t.by === 'testId') return page.getByTestId(t.name);
  if (t.by === 'label') return page.getByLabel(t.name, { exact: true });
  return page.getByRole(t.role, { name: t.name, exact: true });
}

// This function runs in the page. Only an explicit, replayable semantic target is recorded.
function installCapture() {
  const emit = (window as unknown as { tracegroveCapture: (v: unknown) => void }).tracegroveCapture;
  function target(e: Element) {
    const id = e.getAttribute('data-testid');
    if (id) return { by: 'testId', name: id };
    const input = e as HTMLInputElement;
    const label = e.getAttribute('aria-label') || input.labels?.[0]?.textContent?.trim();
    if (label) return { by: 'label', name: label };
    const role = e.getAttribute('role') || ({ BUTTON: 'button', A: 'link' } as Record<string, string>)[e.tagName];
    return role && { by: 'role', role, name: e.textContent?.trim() };
  }
  document.addEventListener('click', ev => {
    if (!ev.isTrusted) return;
    const el = ev.target instanceof Element && ev.target.closest('button,a,input[type=checkbox],[role=button],[role=link]');
    if (el) emit({ kind: 'click', target: target(el) });
  }, true);
  document.addEventListener('change', ev => {
    const el = ev.target;
    if (!ev.isTrusted || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.type === 'checkbox') return;
    if (el.type === 'password' || /password|one-time-code|^cc-/.test(el.autocomplete)) { emit({ sensitive: true }); return; }
    emit({ kind: 'fill', target: target(el), value: el.value });
  }, true);
}

export async function recordFlow(input: { config: string; url: string; name: string; title: string; headed: boolean;
  lines?: AsyncIterable<string>; emit?: (v: unknown) => void }) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(input.name)) stop('Use a short lowercase flow filename');
  const url = new URL(input.url);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.search || url.hash || url.username || url.password)
    stop('Open a local HTTP app with a plain path; use disposable test data');
  const config = loadAuthoringConfig(input.config);
  const testDir = resolve(dirname(input.config), config.testDir);
  const file = join(testDir, input.name + '.flow.yaml');
  if (existsSync(file)) stop('A flow already exists at ' + file);
  const emit = input.emit ?? ((v: unknown) => process.stdout.write(JSON.stringify(v) + '\n'));
  const steps: FlowStep[] = [];
  const paths = new Set<string>([url.pathname]);
  const methods = new Set(['GET', 'HEAD']);
  const candidates = new Set<string>();
  const providers = Object.entries(config.standIns ?? {}).flatMap(([standin, spec]) => Object.keys(spec.respond).map(received => ({ standin, received })));
  let unsupported = false;
  const append = (step: FlowStep) => {
    if (steps.length >= 50) stop('A flow can contain at most 50 steps');
    steps.push(step);
    emit({ step, readbacks: [...candidates], providers });
  };
  const browser = await chromium.launch({ headless: !input.headed });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    const page = await context.newPage();
    context.on('page', p => { if (p !== page) void p.close(); });
    await context.routeWebSocket('**/*', ws => ws.close());
    await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
    page.on('response', r => {
      const at = new URL(r.url());
      if (at.origin !== url.origin) return;
      if (paths.size < 64) paths.add(at.pathname);
      methods.add(r.request().method());
      if (r.request().method() === 'GET' && r.ok() && /json/i.test(r.headers()['content-type'] ?? '') && candidates.size < 64 && !candidates.has(at.pathname)) {
        candidates.add(at.pathname);
        emit({ candidate: { GET: at.pathname, observe: true } });
      }
    });
    if (input.headed) {
      await page.exposeBinding('tracegroveCapture', ({ frame }, raw: unknown) => {
        if (frame !== page.mainFrame()) { unsupported = true; return; }
        const command = BrowserCommand.safeParse(raw);
        if (!command.success || !['fill','click'].includes(command.data.kind) || steps.length >= 50) { unsupported = true; return; }
        append({ browser: command.data });
      });
      await page.addInitScript(installCapture);
    }
    await page.goto(url.href);
    append({ browser: { kind: 'navigate', path: url.pathname } });
    const lines = input.lines ?? createInterface({ input: process.stdin, terminal: false });
    try {
      for await (const line of lines) {
        const msg: unknown = JSON.parse(line);
        if (msg === 'save') {
          if (unsupported) stop('The click-through included an unsupported or sensitive interaction');
          if (!steps.some(s => 'standin' in s || ('GET' in s && s.observe))) stop('Choose an independent readback before saving');
          const flow = Flow.parse({ title: input.title, steps, browser: { allowPaths: [...paths], allowMethods: [...methods] } });
          const caseId = caseIdFor(config.project, testDir, file);
          const { report } = await runTests({ configPath: input.config, caseIds: [caseId], draftFlow: { file, flow } });
          if (!report.bundleVerified || report.outcome !== 'passed' || report.cases.length !== 1 || report.cases[0]?.caseId !== caseId)
            stop('Fresh replay did not pass: ' + (report.cases[0]?.failure?.message ?? report.blockers[0]?.detail ?? report.outcome) + '. Inspect ' + report.runDir);
          mkdirSync(testDir, { recursive: true });
          const tmp = mkdtempSync(join(testDir, '.record-'));
          try {
            const staged = join(tmp, basename(file));
            writeFileSync(staged, stringify(flow), { mode: 0o600 });
            linkSync(staged, file);
          } finally { rmSync(tmp, { recursive: true, force: true }); }
          emit({ saved: file, run: report.runDir });
          return;
        }
        const read = z.object({ browser: BrowserCommand, expect: z.object({ text: z.string() }) }).strict().safeParse(msg);
        if (read.success && read.data.browser.kind === 'read') {
          const el = locator(page, read.data.browser.target);
          await el.filter({ hasText: read.data.expect.text }).waitFor({ timeout: 5000 });
          if (await el.innerText() !== read.data.expect.text) stop('Observed text differs');
          append({ browser: read.data.browser, expect: read.data.expect });
          continue;
        }
        const command = BrowserCommand.safeParse(msg);
        if (command.success && !input.headed) {
          const c = command.data;
          if (c.kind === 'navigate') {
            const to = new URL(c.path, url.origin);
            if (to.origin !== url.origin || to.search || to.hash) stop('Use a path on the same app');
            await page.goto(to.href);
          } else {
            const el = locator(page, c.target);
            if (await el.count() !== 1) stop('Locator must match exactly one element');
            if (c.kind === 'fill') {
              if (await el.evaluate(e => e.matches('input[type=password],[autocomplete*=password],[autocomplete=one-time-code],[autocomplete^=cc-]'))) stop('Use synthetic, non-secret inputs');
              await el.fill(c.value);
            } else if (c.kind === 'click') await el.click();
            else { append({ browser: c, expect: { text: await el.innerText() } }); continue; }
          }
          append({ browser: c });
        } else append(Selection.parse(msg));
      }
    } finally { if ('close' in lines && typeof lines.close === 'function') lines.close(); }
    stop('Session ended before save');
  } finally { await browser.close(); }
}
