/**
 * Recording the grow clip: `grove.html` (looping player), `grove.svg` (the finished tree),
 * `grove.png` (poster frame) and `grove.mp4` (1080×1920, 30 fps, H.264, ready for X, LinkedIn,
 * TikTok and Shorts). Frames are drawn at exact time points and screenshotted in headless
 * Chromium, then piped to ffmpeg, so the video never drops a frame however slow the machine is.
 * Without ffmpeg on PATH it falls back to Playwright's own recorder and writes `grove.webm`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { clipFrame, clipPlayerHtml, clipTimeline, FRAME_JS, parseEventLog, type ClipTimeline } from '../authoring/growClip.ts';
import type { GrowEvent } from '../authoring/growState.ts';

export type RecordOptions = { out: string; fps?: number; video?: boolean; signal?: AbortSignal };
export type RecordResult = { timeline: ClipTimeline; files: string[]; video: string | null; note: string | null };

/** The newest saved grow log under `<dir>/.tracegrove/discovery/`, or null. */
export function latestGrowLog(dir: string): string | null {
  const folder = join(resolve(dir), '.tracegrove', 'discovery');
  if (!existsSync(folder)) return null;
  const logs = readdirSync(folder).filter((f) => f.endsWith('.jsonl')).map((f) => join(folder, f));
  logs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return logs[0] ?? null;
}

/** Where a clip goes by default: `.tracegrove/clips/<branch>/`. */
export function clipDir(dir: string, events: GrowEvent[]): string {
  const branch = (events.find((e) => e.kind === 'change.read') as { branch?: string } | undefined)?.branch ?? 'change';
  return join(resolve(dir), '.tracegrove', 'clips', branch.replace(/[^A-Za-z0-9._-]+/g, '-'));
}

export function readGrowLog(path: string): GrowEvent[] {
  return parseEventLog(readFileSync(path, 'utf8'));
}

function ffmpegPath(): string | null {
  const candidates = [process.env.TRACEGROVE_FFMPEG, 'ffmpeg'].filter((x): x is string => !!x);
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (probe.status === 0 && /libx264/.test(probe.stdout)) return bin;
  }
  return null;
}

export async function recordGrove(events: GrowEvent[], options: RecordOptions): Promise<RecordResult> {
  const out = resolve(options.out); mkdirSync(out, { recursive: true });
  const timeline = clipTimeline(events);
  const files: string[] = [];
  const put = (name: string, body: string | Buffer) => { const path = join(out, name); writeFileSync(path, body); files.push(path); return path; };
  put('grove.html', clipPlayerHtml(timeline));
  put('grove.svg', clipFrame(timeline, timeline.duration));
  if (options.video === false) return { timeline, files, video: null, note: null };

  let chromium: typeof import('playwright').chromium;
  try { ({ chromium } = await import('playwright')); } catch { return { timeline, files, video: null, note: 'video needs Playwright; run `npm i playwright` and `tracegrove setup browsers`' }; }
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try { browser = await chromium.launch({ headless: true }); }
  catch { return { timeline, files, video: null, note: 'video needs a browser; run `tracegrove setup browsers` and record again' }; }
  try {
    const ffmpeg = ffmpegPath();
    const viewport = { width: timeline.w, height: timeline.h };
    if (ffmpeg) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#0c1210"><div id="s"></div><script>${FRAME_JS}\nwindow.tl=${JSON.stringify(timeline).replaceAll('<', '\\u003c')};window.draw=function(t){document.getElementById('s').innerHTML=frame(window.tl,t)}</script></body></html>`);
      const fps = options.fps ?? 30;
      const total = Math.ceil(((timeline.duration + 1500) / 1000) * fps);
      const path = join(out, 'grove.mp4');
      const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], { stdio: ['pipe', 'ignore', 'pipe'] });
      let err = ''; enc.stderr.on('data', (d) => { err += String(d); });
      const done = new Promise<number>((r) => enc.on('close', (code) => r(code ?? 1)));
      for (let i = 0; i < total; i++) {
        if (options.signal?.aborted) break;
        await page.evaluate((t) => (window as unknown as { draw: (t: number) => void }).draw(t), Math.min(timeline.duration, (i * 1000) / fps));
        const shot = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (!enc.stdin.write(shot)) await new Promise((r) => enc.stdin.once('drain', r));
        if (i === total - 1) put('grove.png', await page.screenshot({ type: 'png' }));
      }
      enc.stdin.end();
      const code = await done;
      if (code !== 0) return { timeline, files, video: null, note: `ffmpeg could not encode the video: ${err.trim().split('\n').pop() ?? `exit ${code}`}` };
      files.push(path);
      return { timeline, files, video: path, note: null };
    }
    // No ffmpeg with H.264: let Playwright record the live player in real time instead.
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, recordVideo: { dir: out, size: viewport } });
    const page = await context.newPage();
    await page.setContent(clipPlayerHtml(timeline).replace('#stage{height:100%', '#stage{height:1920px').replace('<div><button', '<div hidden><button'));
    await page.waitForTimeout(timeline.duration + 1200);
    put('grove.png', await page.screenshot({ type: 'png' }));
    const video = page.video();
    await context.close();
    const path = join(out, 'grove.webm');
    if (video) { await video.saveAs(path); await video.delete(); files.push(path); }
    return { timeline, files, video: video ? path : null, note: 'ffmpeg with H.264 not found, so the clip is WebM; install ffmpeg (or set TRACEGROVE_FFMPEG) for an MP4 that X accepts' };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** One line per file, relative to where the command ran, plus the honest count. */
export function recordSummary(result: RecordResult, cwd: string): string {
  const t = result.timeline.totals;
  return [
    `grove clip for ${result.timeline.branch}: ${t.proved} of ${t.scenarios} scenario(s) proved${t.failed ? `, ${t.failed} failed` : ''}${t.pale ? `, ${t.pale} not run yet` : ''}`,
    ...result.files.map((f) => `  ${relative(cwd, f)}`),
    ...(result.note ? [`note: ${result.note}`] : []),
  ].join('\n');
}
