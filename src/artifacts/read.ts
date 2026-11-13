/**
 * Reading an artifact and its sources. An artifact stays where it lives (a file next to the spec, or
 * a URL); a run records a pointer and the SHA-256 of the exact bytes it read. Nothing is copied into
 * the repository. Sources are fetched once per run and reused by seeded-defect reruns.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

export type Fetched = { ok: true; text: string; sha256: string; bytes: number; status: number | null } | { ok: false; why: string; status: number | null };
/** Injected in tests; the default reads files relative to the spec and fetches http(s) with bounds. */
export type Fetcher = (ref: string) => Promise<Fetched>;

export const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
export const isUrl = (ref: string): boolean => /^https?:\/\//i.test(ref);

export function defaultFetcher(baseDir: string): Fetcher {
  return async (ref) => {
    if (!isUrl(ref)) {
      const path = isAbsolute(ref) ? ref : resolve(baseDir, ref);
      if (!existsSync(path) || !statSync(path).isFile()) return { ok: false, why: `no file at ${ref}`, status: null };
      if (statSync(path).size > MAX_BYTES) return { ok: false, why: `${ref} is larger than ${MAX_BYTES} bytes`, status: null };
      const bytes = readFileSync(path);
      return { ok: true, text: bytes.toString('utf8'), sha256: sha256(bytes), bytes: bytes.length, status: null };
    }
    try {
      const response = await fetch(ref, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'user-agent': 'tracegrove-artifact-check', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' } });
      if (!response.ok) return { ok: false, why: `status ${response.status}`, status: response.status };
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_BYTES) return { ok: false, why: `larger than ${MAX_BYTES} bytes`, status: response.status };
      return { ok: true, text: bytes.toString('utf8'), sha256: sha256(bytes), bytes: bytes.length, status: response.status };
    } catch (error) {
      return { ok: false, why: error instanceof Error && error.name === 'TimeoutError' ? `no answer in ${FETCH_TIMEOUT_MS / 1000} s` : `could not be reached (${error instanceof Error ? error.message : String(error)})`.slice(0, 200), status: null };
    }
  };
}

/** One fetch per reference per run; records what was read so the receipt can pin it. */
export class Sources {
  private readonly seen = new Map<string, Promise<Fetched>>();
  constructor(private readonly fetcher: Fetcher) {}
  get(ref: string): Promise<Fetched> {
    let hit = this.seen.get(ref);
    if (!hit) { hit = this.fetcher(ref); this.seen.set(ref, hit); }
    return hit;
  }
  async record(): Promise<Array<{ ref: string; sha256: string | null; bytes: number | null; problem: string | null }>> {
    const rows = [];
    for (const [ref, pending] of this.seen) {
      const got = await pending;
      rows.push(got.ok ? { ref, sha256: got.sha256, bytes: got.bytes, problem: null } : { ref, sha256: null, bytes: null, problem: got.why });
    }
    return rows.sort((a, b) => a.ref.localeCompare(b.ref));
  }
}

/** Text a reader would see: tags, scripts and entities removed from HTML; anything else as written. */
export function readable(text: string): string {
  if (!/<(?:html|body|p|div|span|h[1-6]|article)\b/i.test(text)) return text;
  return text.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'");
}

/** Compare wording, not typography: case, whitespace and curly quotes don't make two passages differ. */
export const normalize = (text: string): string => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

export type Link = { url: string; line: number };
export type Quote = { text: string; line: number; sources: string[] };
export type Artifact = { text: string; lines: string[]; links: Link[]; quotes: Quote[] };

const LINK = /\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)[^)]*\)|<(https?:\/\/[^>\s]+)>|(?<![("<\w])(https?:\/\/[^\s)>\]"']+)/g;
const QUOTED = /"([^"\n]+)"|“([^”\n]+)”/g;

/** Links and quoted passages, each with the line it sits on. A quote's sources are the links on its line. */
export function parseArtifact(text: string, minQuoteLength = 12): Artifact {
  const lines = text.split(/\r?\n/);
  const links: Link[] = []; const quotes: Quote[] = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const here: string[] = [];
    for (const match of line.matchAll(LINK)) {
      const url = (match[1] ?? match[2] ?? match[3] ?? '').replace(/^<|>$/g, '').replace(/[.,;:]+$/, '');
      if (url && !url.startsWith('#') && !url.startsWith('mailto:')) { links.push({ url, line: index + 1 }); here.push(url); }
    }
    // Quotes are read from the line with link targets removed, so a URL or title is never taken for one.
    const prose = line.replace(/\]\([^)]*\)/g, ']');
    for (const match of prose.matchAll(QUOTED)) {
      const quote = (match[1] ?? match[2] ?? '').trim();
      if (quote.length >= minQuoteLength) quotes.push({ text: quote, line: index + 1, sources: here });
    }
  });
  return { text, lines, links, quotes };
}

/** First column of each non-empty line, lowercased; a header line without an @ or digit is skipped. */
export function parseList(text: string): string[] {
  const rows = text.split(/\r?\n/).map((line) => (line.split(',')[0] ?? '').trim().replace(/^"|"$/g, '').toLowerCase()).filter(Boolean);
  const first = rows[0];
  return first !== undefined && rows.length > 1 && !/[@\d]/.test(first) ? rows.slice(1) : rows;
}

/** The number a person wrote: "1,204", "38%", "$4.5k" read as 1204, 38 and 4500. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s$€£%]/g, '');
  const match = /^(-?\d+(?:\.\d+)?)([kKmM]?)$/.exec(cleaned);
  if (!match) return null;
  const scale = match[2] === 'k' || match[2] === 'K' ? 1e3 : match[2] === 'm' || match[2] === 'M' ? 1e6 : 1;
  return Number(match[1]) * scale;
}
