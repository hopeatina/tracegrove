/**
 * The discovery catalog (`tracegrove/catalog.yaml`): what discovery has learned, committed beside the
 * flows. A fresh clone, a later discovery and the next agent start from it instead of re-asking.
 * Routes are recorded with where they are handled and the verified run that confirmed them; an entry
 * only ever records what a scan read or a verified run observed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Catalog, type CatalogRoute } from './schema.ts';
import type { Discovery } from './discover.ts';

export const CATALOG_FILE = 'catalog.yaml';

export function readCatalog(testDir: string): Catalog | null {
  const path = join(testDir, CATALOG_FILE);
  if (!existsSync(path)) return null;
  try { return Catalog.parse(parseYaml(readFileSync(path, 'utf8')) ?? {}); } catch { return null; }
}

/**
 * Merge a discovery into the catalog. Entries never seen again are kept (the run that confirmed them
 * may simply be old); entries seen now are refreshed. Routes that are only declared by a flow, with no
 * source location and no traffic, are not recorded: nothing has confirmed them.
 */
export function mergeCatalog(previous: Catalog | null, discovery: Discovery, sourceDigest: string | null): Catalog {
  const byRoute = new Map<string, CatalogRoute>((previous?.routes ?? []).map((r) => [r.route, r]));
  for (const route of discovery.routes) {
    const key = `${route.method} ${route.path}`;
    const before = byRoute.get(key);
    const observed = route.observedBy.length > 0 && discovery.observed && !discovery.observed.stale;
    if (!route.file && !observed && !before) continue;
    const source: CatalogRoute['source'] = route.provenance === 'static' ? 'static' : route.file && route.actions.length ? 'agent' : before?.source ?? 'traffic';
    byRoute.set(key, {
      route: key, source,
      file: route.file ?? before?.file ?? null, line: route.line ?? before?.line ?? null,
      actions: route.actions.length ? route.actions : before?.actions ?? [],
      confirmed: observed ? { run: discovery.observed!.run, sourceDigest: sourceDigest ?? '', cases: route.observedBy.slice(0, 32) } : before?.confirmed ?? null,
    });
  }
  return { schemaVersion: 'tracegrove.catalog/v1', routes: [...byRoute.values()].sort((a, b) => a.route.split(' ')[1]!.localeCompare(b.route.split(' ')[1]!) || a.route.localeCompare(b.route)) };
}

export function writeCatalog(testDir: string, catalog: Catalog): string {
  const path = join(testDir, CATALOG_FILE);
  writeFileSync(path, `# Written by tracegrove discover --save and tracegrove draft. Commit it: it is what discovery\n# has learned, so the next discovery and agent start from it. Each route says where it is handled\n# and which verified run confirmed it.\n${stringifyYaml(catalog, { lineWidth: 0 })}`);
  return path;
}
