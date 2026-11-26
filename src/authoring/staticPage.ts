import { readFileSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { Blocked } from '../core/errors.ts';
import { publicAsset } from '../hosts/staticSite.ts';
import { MAX_SOURCE_FILES } from './sources.ts';

const origin = 'http://static.local';
export const pageRoute = (file: string) => '/' + file.split('/').map(encodeURIComponent).join('/');

function regularAsset(root: string, file: string): boolean {
  if (!publicAsset(file)) return false;
  try {
    const path = resolve(root, file);
    return realpathSync(path) === path && statSync(path).isFile();
  } catch { return false; }
}

export function staticPage(rootDir: string, entry: string, extraAssets: string[] = []) {
  const root = realpathSync(rootDir);
  const file = relative(root, resolve(rootDir, entry)).split('\\').join('/');
  if (!/\.html?$/i.test(file) || !regularAsset(root, file))
    throw new Blocked([{ code: 'invalid_argument', detail: 'Static entry must be an existing HTML file inside the project', action: 'pass --static path/to/page.html' }]);
  for (const asset of extraAssets) {
    if (!regularAsset(root, asset)) throw new Blocked([{ code: 'invalid_argument', detail: `Unsupported or non-public static asset: ${asset}`, action: 'limit app.sources to public assets in the web root' }]);
  }
  const assets = new Set<string>([file, ...extraAssets]);
  const missing = new Set<string>();
  const missingRequired = new Set<string>();
  const externalOrigins = new Set<string>();
  let title = '';
  const add = (value: string, base: string, required = false) => {
    if (!value.trim() || value.startsWith('#')) return;
    try {
      const url = new URL(value, base);
      if (url.origin !== origin) {
        if (required && ['https:', 'http:'].includes(url.protocol)) externalOrigins.add(url.origin);
        return;
      }
      const path = decodeURIComponent(url.pathname).slice(1);
      if (!publicAsset(path)) return;
      if (regularAsset(root, path)) assets.add(path); else { missing.add(path); if (required) missingRequired.add(path); }
    } catch { /* Not a local asset URL. */ }
  };
  for (const asset of assets) {
    if (assets.size > MAX_SOURCE_FILES) throw new Blocked([{ code: 'too_many_source_files', detail: 'Static page exceeds the source attestation limit', action: 'select a smaller page or a bundled build' }]);
    const base = origin + pageRoute(asset);
    const css = (text: string, url: string) => {
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi)) add((m[1] ?? m[2])!.trim(), url);
    };
    if (/\.css$/i.test(asset)) { css(readFileSync(resolve(root, asset), 'utf8'), base); continue; }
    if (!/\.html?$/i.test(asset)) continue;
    const doc = parse(readFileSync(resolve(root, asset), 'utf8'));
    const elements: DefaultTreeAdapterTypes.Element[] = [];
    function visit(node: DefaultTreeAdapterTypes.Node) {
      if ('tagName' in node) elements.push(node);
      if ('childNodes' in node) node.childNodes.forEach(visit);
    }
    visit(doc);
    const attr = (el: DefaultTreeAdapterTypes.Element, name: string) => el.attrs.find(a => a.name === name)?.value;
    const text = (el: DefaultTreeAdapterTypes.Element) => el.childNodes.map(n => 'value' in n ? n.value : '').join('');
    const baseEl = elements.find(el => el.tagName === 'base' && attr(el, 'href'));
    let docBase = base;
    try { if (baseEl) docBase = new URL(attr(baseEl, 'href')!, base).href; } catch { /* Browser falls back to document URL. */ }
    for (const el of elements) {
      if (el.tagName === 'title' && asset === file && !title) title = text(el).trim().replace(/[\t\n\f\r ]+/g, ' ');
      for (const name of ['src', 'poster', 'hx-get', 'data-hx-get']) { const value = attr(el, name); if (value) add(value, docBase, name === 'src' && el.tagName === 'script'); }
      if (el.tagName === 'link' && /stylesheet|icon|preload/i.test(attr(el, 'rel') ?? '')) add(attr(el, 'href') ?? '', docBase, /(?:^|\s)stylesheet(?:\s|$)/i.test(attr(el, 'rel') ?? ''));
      if (el.tagName === 'style') css(text(el), docBase);
      if (attr(el, 'style')) css(attr(el, 'style')!, docBase);
    }
  }
  return { file, title, assets: [...assets].sort(), missing: [...missing].sort(), missingRequired: [...missingRequired].sort(), externalOrigins: [...externalOrigins].sort() };
}
