// This executable is owned by TraceGrove. The supervisor supplies the exact files it attested.
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mime: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', wasm: 'application/wasm', svg: 'image/svg+xml', png: 'image/png', gif: 'image/gif',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
};
export const staticExecutable = fileURLToPath(import.meta.url);
export function staticType(path: string): string | undefined {
  const ext = extname(path).slice(1).toLowerCase();
  return Object.hasOwn(mime, ext) ? mime[ext] : undefined;
}
export function publicAsset(path: string): boolean {
  return !!staticType(path) && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(part => part.length && !part.startsWith('.') && part !== 'node_modules');
}

if (process.argv[1] && resolve(process.argv[1]) === staticExecutable) {
  const entries: {path: string; sha256: string}[] = JSON.parse(readFileSync(process.env.TRACEGROVE_STATIC_MANIFEST!, 'utf8'));
  const allowed = new Map(entries.filter(e => publicAsset(e.path)).map(e => [e.path, e.sha256]));
  const root = realpathSync('.');
  createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      let path = decodeURIComponent((req.url ?? '').split('?')[0]!).slice(1);
      if (!path || path.endsWith('/')) path += 'index.html';
      const hash = allowed.get(path);
      if (hash) {
        const absolute = resolve(root, path);
        if (realpathSync(absolute) === absolute) {
          const bytes = readFileSync(absolute);
          if (createHash('sha256').update(bytes).digest('hex') !== hash) { res.writeHead(409).end(); return; }
          res.writeHead(200, { 'Content-Type': staticType(path)!, 'Content-Length': bytes.length, 'X-Content-Type-Options': 'nosniff' });
          res.end(req.method === 'HEAD' ? undefined : bytes); return;
        }
      }
    } catch { /* A missing or malformed asset has the same response as an undeclared one. */ }
    res.writeHead(404).end();
  }).listen(Number(process.argv[3]), '127.0.0.1');
}
