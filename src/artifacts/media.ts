/**
 * Pieces that are not text: images and video. Two things are read from them.
 *
 * Facts (format, pixel size, weight, duration) come from the file's own bytes, with no model and no
 * decoder: these decide delivery specs exactly. Words and what the picture shows come from a model
 * that is given the file to look at. A reading is saved under the hash of the bytes it was read
 * from, so the same file is read once and a rerun checks the same words.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Blocked } from '../core/errors.ts';
import { DEFAULT_MODELS, agentEnv, detectAgents, type AgentSettings } from '../authoring/agent.ts';

export type MediaFacts = {
  kind: 'image' | 'video';
  format: string;
  width: number | null; height: number | null;
  bytes: number;
  /** Video only. */
  seconds: number | null;
  animated: boolean;
  hasAudio: boolean | null;
};

/** Shown one or more files and asked a question about them. */
export type Look = (prompt: string, files: string[]) => Promise<string>;

const u32 = (b: Buffer, at: number): number => (at + 4 <= b.length ? b.readUInt32BE(at) : 0);
const ascii = (b: Buffer, from: number, to: number): string => b.subarray(from, to).toString('latin1');

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) { at++; continue; }
    const marker = b[at + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b.readUInt16BE(at + 5), width: b.readUInt16BE(at + 7) };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { at += marker === 0xff ? 1 : 2; continue; }
    at += 2 + b.readUInt16BE(at + 2);
  }
  return null;
}

function webpSize(b: Buffer): { width: number; height: number; animated: boolean } | null {
  const chunk = ascii(b, 12, 16);
  if (chunk === 'VP8X' && b.length >= 30) return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), animated: (b[20]! & 0x02) !== 0 };
  if (chunk === 'VP8 ' && b.length >= 30) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, animated: false };
  if (chunk === 'VP8L' && b.length >= 25) { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), animated: false }; }
  return null;
}

function svgSize(text: string): { width: number | null; height: number | null } {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const attr = (name: string): number | null => { const m = new RegExp(`\\b${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, 'i').exec(tag); return m ? Number(m[1]) : null; };
  const box = /\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return { width: attr('width') ?? (box ? Number(box[1]) : null), height: attr('height') ?? (box ? Number(box[2]) : null) };
}

/** Walks ISO base media boxes (mp4, mov) for the duration and the frame size of the first video track. */
function isoFacts(b: Buffer): { seconds: number | null; width: number | null; height: number | null; hasAudio: boolean } {
  let seconds: number | null = null; let width: number | null = null; let height: number | null = null; let hasAudio = false;
  const walk = (from: number, to: number, depth: number): void => {
    let at = from;
    while (at + 8 <= to) {
      let size = u32(b, at); const type = ascii(b, at + 4, at + 8); let header = 8;
      if (size === 1) { size = Number(b.readBigUInt64BE(at + 8)); header = 16; } else if (size === 0) size = to - at;
      if (size < header || at + size > to) return;
      const body = at + header;
      if (type === 'mvhd') { const v1 = b[body] === 1; const scale = u32(b, body + (v1 ? 20 : 12)); const duration = v1 ? Number(b.readBigUInt64BE(body + 24)) : u32(b, body + 16); if (scale) seconds = duration / scale; }
      else if (type === 'tkhd') { const v1 = b[body] === 1; const w = u32(b, body + (v1 ? 88 : 76)) / 65536; const h = u32(b, body + (v1 ? 92 : 80)) / 65536; if (w > 0 && h > 0 && width === null) { width = Math.round(w); height = Math.round(h); } }
      else if (type === 'hdlr' && ascii(b, body + 8, body + 12) === 'soun') hasAudio = true;
      else if (depth < 6 && ['moov', 'trak', 'mdia'].includes(type)) walk(body, at + size, depth + 1);
      at += size;
    }
  };
  walk(0, b.length, 0);
  return { seconds, width, height, hasAudio };
}

/** What kind of file these bytes are, from the bytes themselves. Null means: treat it as text. */
export function sniffMedia(bytes: Buffer): MediaFacts | null {
  const base = { bytes: bytes.length, seconds: null, animated: false, hasAudio: null };
  if (bytes.length >= 24 && u32(bytes, 0) === 0x89504e47) return { ...base, kind: 'image', format: 'png', width: u32(bytes, 16), height: u32(bytes, 20), animated: bytes.subarray(0, 4096).includes('acTL') };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) { const size = jpegSize(bytes); return { ...base, kind: 'image', format: 'jpeg', width: size?.width ?? null, height: size?.height ?? null }; }
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return { ...base, kind: 'image', format: 'gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), animated: bytes.indexOf(Buffer.from([0x21, 0xf9, 0x04]), bytes.indexOf(Buffer.from([0x21, 0xf9, 0x04])) + 1) > 0 };
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') { const size = webpSize(bytes); return { ...base, kind: 'image', format: 'webp', width: size?.width ?? null, height: size?.height ?? null, animated: size?.animated ?? false }; }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (/^(avif|avis)$/.test(brand)) return { ...base, kind: 'image', format: 'avif', width: null, height: null };
    if (/^(heic|heix|mif1)$/.test(brand)) return { ...base, kind: 'image', format: 'heic', width: null, height: null };
    const facts = isoFacts(bytes);
    return { ...base, kind: 'video', format: brand.trim() === 'qt' ? 'mov' : 'mp4', width: facts.width, height: facts.height, seconds: facts.seconds, hasAudio: facts.hasAudio };
  }
  if (bytes.length >= 4 && u32(bytes, 0) === 0x1a45dfa3) return { ...base, kind: 'video', format: 'webm', width: null, height: null };
  const head = ascii(bytes, 0, Math.min(bytes.length, 2048));
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE svg[^>]*>\s*)?<svg\b/i.test(head)) return { ...base, kind: 'image', format: 'svg', ...svgSize(head) };
  return null;
}

export const EXTENSION: Record<string, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', avif: 'avif', heic: 'heic', svg: 'svg', mp4: 'mp4', mov: 'mov', webm: 'webm' };

/** Stills a model can look at for a video: evenly spaced, at most `count`. Empty when ffmpeg is not installed. */
export function videoStills(path: string, seconds: number | null, count = 8): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'tg-stills-'));
  const every = seconds && seconds > 0 ? Math.max(seconds / count, 0.2) : 2;
  const run = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-vf', `fps=1/${every.toFixed(3)},scale='min(1280,iw)':-2`, '-frames:v', String(count), join(dir, 'still-%02d.png')], { stdio: 'ignore', timeout: 60_000 });
  if (run.error || run.status !== 0) return [];
  return readdirSync(dir).sort().map((name) => join(dir, name));
}

/**
 * Pictures of something a model cannot open as one: an SVG, or an HTML page as a browser lays it out.
 * Drawn with the browser Tracegrove already uses for flows. A long page becomes several pictures, top to
 * bottom, so small type stays readable. Empty when no browser is installed.
 */
export async function draw(path: string, width = 1280): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'tg-drawn-'));
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, timeout: 20_000, ...(process.env.TRACEGROVE_CHROMIUM_PATH ? { executablePath: process.env.TRACEGROVE_CHROMIUM_PATH } : {}) });
    try {
      // The page's own scripts run, since many pages draw themselves, but with no network: the drawing is of the file as handed over.
      const context = await browser.newContext({ viewport: { width, height: 1600 }, offline: true });
      const page = await context.newPage();
      const svg = /\.svg$/i.test(path);
      let target = path;
      // An SVG is shown as an image on a white page, at a size a person would see it, from a file so the browser may load it.
      if (svg) { target = join(dir, 'frame.html'); writeFileSync(target, `<!doctype html><body style="margin:0;background:#fff"><img src="${pathToFileURL(path).href}" style="display:block;width:${width}px"></body>`); }
      await page.goto(pathToFileURL(target).href, { timeout: 20_000, waitUntil: 'load' });
      await page.waitForTimeout(400);
      const height = Math.max(svg ? 16 : 200, Math.min(await page.evaluate(svg ? 'Math.ceil(document.querySelector("img").getBoundingClientRect().height)' : 'Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)') as number, MAX_TILES * 1600));
      const files: string[] = [];
      for (let top = 0; top < height; top += 1600) {
        const file = join(dir, `part-${String(files.length + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: top, width, height: Math.min(1600, height - top) } });
        files.push(file);
      }
      return files;
    } finally { await browser.close(); }
  } catch { return []; }
}
const MAX_TILES = 8;

export type Reading = { lines: string[]; shows: string; by: string };

const READING_PROMPT = [
  'Look at the attached file or files. If there are several they are stills from one video, in order.',
  'Write down every piece of text that is visible, exactly as written, including small print, buttons, prices, numbers, URLs and watermarks.',
  'One string per line of text, top to bottom, left to right. Do not correct spelling, do not translate, do not add words that are not there.',
  'Then say in one or two plain sentences what is shown.',
  'Reply with JSON only: {"text":["..."],"shows":"..."}',
].join('\n');

function parseReading(answer: string): { lines: string[]; shows: string } | null {
  try {
    const data = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)) as { text?: unknown; shows?: unknown };
    if (!Array.isArray(data.text)) return null;
    return { lines: data.text.filter((line): line is string => typeof line === 'string').flatMap((line) => line.split(/\r?\n/)).map((line) => line.trim()).filter(Boolean).slice(0, 800), shows: typeof data.shows === 'string' ? data.shows.slice(0, 600) : '' };
  } catch { return null; }
}

/** The words in a media file, read once per distinct file. `cacheDir` null means: do not keep the reading. */
export async function readWords(input: { sha256: string; files: string[]; look: Look; by: string; cacheDir: string | null }): Promise<Reading> {
  const cached = input.cacheDir ? join(input.cacheDir, `${input.sha256}.reading.json`) : null;
  if (cached && existsSync(cached)) { try { return JSON.parse(readFileSync(cached, 'utf8')) as Reading; } catch { /* read it again */ } }
  let parsed = parseReading(await input.look(READING_PROMPT, input.files));
  if (!parsed) parsed = parseReading(await input.look(`${READING_PROMPT}\n\nYour last reply was not the JSON object asked for. Reply with that object only.`, input.files));
  if (!parsed) throw new Blocked([{ code: 'artifact_reading_failed', owner: 'agent', detail: 'the model did not return the words in the file as JSON, twice', action: 'run again, or give the spec `transcript: <file>` with the words written out' }]);
  const reading: Reading = { ...parsed, by: input.by };
  if (cached) { mkdirSync(dirname(cached), { recursive: true }); writeFileSync(cached, `${JSON.stringify(reading, null, 2)}\n`); }
  return reading;
}

/** The default way to show a file to a model: the configured coding agent, allowed to read those files and nothing else. */
export function agentLook(settings: AgentSettings): Look {
  const bin = detectAgents()[settings.provider as 'claude' | 'codex'];
  if (settings.provider === 'none') throw new Blocked([{ code: 'agent_disabled', detail: 'agent provider is none', action: 'pass --agent claude or --agent codex' }]);
  if (!bin) throw new Blocked([{ code: 'agent_not_installed', detail: `${settings.provider} is not on PATH`, action: settings.provider === 'claude' ? 'install Claude Code and sign in' : 'install the Codex CLI and sign in' }]);
  return (prompt, files) => new Promise((resolve, reject) => {
    const dirs = [...new Set(files.map((file) => dirname(file)))];
    const args = settings.provider === 'claude'
      ? ['-p', `${prompt}\n\nThe files to look at, each read with the Read tool before answering:\n${files.map((file) => `- ${file}`).join('\n')}`, '--model', settings.model ?? DEFAULT_MODELS.claude!, '--output-format', 'json',
        '--allowedTools', 'Read', '--disallowedTools', 'Bash,Edit,Write,Glob,Grep,WebFetch,WebSearch', ...dirs.flatMap((dir) => ['--add-dir', dir]), '--no-session-persistence']
      : ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--model', settings.model ?? DEFAULT_MODELS.codex!, ...files.flatMap((file) => ['-i', file]), prompt];
    const child = spawn(bin, args, { env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => { out = (out + chunk.toString()).slice(-400_000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new Blocked([{ code: 'judge_failed', detail: out.slice(-300), action: 'check that the agent CLI is signed in' }])); return; }
      try { const parsed = JSON.parse(out) as { result?: unknown }; resolve(typeof parsed.result === 'string' ? parsed.result : out); } catch { resolve(out); }
    });
  });
}
