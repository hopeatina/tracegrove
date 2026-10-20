/**
 * A one-second end-to-end check of the browser stack a browser flow needs: launch the pinned
 * headless shell, render a page, and record a short WebM through the same screencast path a run
 * uses. Each stage that can fail has its own code, so setup problems read as what they are.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type BrowserProbe = { ok: true; videoBytes: number; executable: string } | { ok: false; code: 'browser_unavailable' | 'video_encoder_missing' | 'video_empty'; detail: string; executable: string | null };

export async function probeBrowser(timeoutMs = 20_000): Promise<BrowserProbe> {
  let executable: string | null = null;
  let chromium: typeof import('playwright').chromium;
  try { ({ chromium } = await import('playwright')); executable = chromium.executablePath(); }
  catch (error) { return { ok: false, code: 'browser_unavailable', detail: `Playwright is not installed: ${(error as Error).message.split('\n')[0]}`, executable }; }
  const dir = await mkdtemp(join(tmpdir(), 'tracegrove-probe-'));
  let browser: import('playwright').Browser | undefined;
  try {
    try { browser = await chromium.launch({ headless: true, timeout: timeoutMs }); }
    catch (error) { return { ok: false, code: 'browser_unavailable', detail: (error as Error).message.split('\n').find((l) => l.trim()) ?? 'launch failed', executable }; }
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    const path = join(dir, 'probe.webm');
    try {
      await page.screencast.start({ path, size: { width: 320, height: 240 } });
      await page.setContent('<body style="margin:0;background:#2f6b4f"><h1 style="color:white">tracegrove</h1></body>');
      await page.waitForTimeout(1000);
      await page.screencast.stop();
    } catch (error) { return { ok: false, code: 'video_encoder_missing', detail: (error as Error).message.split('\n').find((l) => l.trim()) ?? 'screencast failed', executable }; }
    const bytes = (await stat(path).catch(() => ({ size: 0 }))).size;
    return bytes > 0 ? { ok: true, videoBytes: bytes, executable } : { ok: false, code: 'video_empty', detail: 'the recording finished with no frames', executable };
  } finally {
    await browser?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
