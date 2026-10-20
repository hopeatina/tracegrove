/**
 * `tracegrove env detect` and flag-free `env add`: read the deploy files a repo already has
 * (compose, Fly, Render, Vercel, Netlify, .env.<stage>) and propose environments from them.
 * Proposals are conservative: a deployed origin is read-only production unless its name says
 * staging or preview, and only URL-shaped values are ever read from .env files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { EnvironmentClassName } from './schema.ts';

export type Detected = {
  name: string;
  /** what goes under environments.<name>.target */
  target: { url: string } | { compose: string; service: string; port: number; health: string };
  class: EnvironmentClassName;
  /** the file it came from, relative to the project */
  source: string;
  why: string;
};

const APP_SERVICE = /^(app|web|api|server|backend|site|frontend)$/;
const DATA_IMAGE = /postgres|mysql|mariadb|redis|mongo|rabbitmq|kafka|zookeeper|elasticsearch|opensearch|minio|mailhog|mailpit|localstack|memcached|nginx|traefik|caddy/;
const URL_KEY = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_)?(?:APP|BASE|SITE|PUBLIC|API|HOST|FRONTEND|WEB)_?URL$/;

const read = (file: string): string | null => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const stageClass = (name: string): EnvironmentClassName => /stag|preview|dev|test|qa|uat|sandbox/i.test(name) ? 'deployed_preview' : 'production_observation';
const envName = (stage: string): string => stage.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^[^a-z]+/, '') || 'deployed';

export function detectEnvironments(root: string, health = '/health'): Detected[] {
  const found: Detected[] = [];
  const add = (d: Detected) => { if (!found.some((f) => f.name === d.name)) found.push(d); };

  for (const file of ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']) {
    const text = read(join(root, file)); if (!text) continue;
    let services: Record<string, { image?: string; build?: unknown; ports?: unknown[] }> = {};
    try { services = (parseYaml(text) as { services?: typeof services } | null)?.services ?? {}; } catch { continue; }
    const candidates = Object.entries(services).filter(([, s]) => Array.isArray(s?.ports) && s.ports.length && !(s.image && !s.build && DATA_IMAGE.test(s.image)));
    const pick = candidates.find(([n]) => APP_SERVICE.test(n)) ?? candidates.find(([, s]) => s.build) ?? candidates[0];
    if (!pick) continue;
    const port = containerPort(pick[1].ports![0]);
    if (port) add({ name: 'docker', target: { compose: file, service: pick[0], port, health }, class: 'isolated_candidate', source: file, why: `service ${pick[0]} listens on ${port}; tracegrove starts it with docker compose` });
    break;
  }

  for (const file of safeList(root).filter((f) => /^fly(\.[\w-]+)?\.toml$/.test(f))) {
    const app = read(join(root, file))?.match(/^\s*app\s*=\s*["']([a-z0-9-]+)["']/m)?.[1];
    if (!app) continue;
    const stage = file.match(/^fly\.([\w-]+)\.toml$/)?.[1] ?? (/(staging|preview|dev)/.exec(app)?.[1] ?? 'production');
    add({ name: envName(stage), target: { url: `https://${app}.fly.dev` }, class: stageClass(stage), source: file, why: `Fly app ${app}` });
  }

  const render = read(join(root, 'render.yaml'));
  if (render) {
    try {
      const services = (parseYaml(render) as { services?: Array<{ type?: string; name?: string }> } | null)?.services ?? [];
      for (const s of services.filter((x) => x.type === 'web' && x.name)) {
        const stage = /(staging|preview|dev)/.exec(s.name!)?.[1] ?? 'production';
        add({ name: envName(stage), target: { url: `https://${s.name}.onrender.com` }, class: stageClass(stage), source: 'render.yaml', why: `Render web service ${s.name} (its default onrender.com address; use your custom domain if it has one)` });
      }
    } catch { /* not a blueprint */ }
  }

  for (const [file, host] of [['vercel.json', 'Vercel'], ['.vercel/project.json', 'Vercel'], ['netlify.toml', 'Netlify']] as const) {
    if (!existsSync(join(root, file))) continue;
    add({ name: 'preview', target: { url: 'env:PREVIEW_URL' }, class: 'deployed_preview', source: file,
      why: `${host} builds a preview per pull request; CI passes its address in PREVIEW_URL (on GitHub, the deployment_status event's target_url)` });
    break;
  }

  for (const file of safeList(root).filter((f) => /^\.env\.[\w-]+$/.test(f) && !/\.(example|sample|template|local|test)$/.test(f))) {
    const stage = file.slice(5);
    const text = read(join(root, file)) ?? '';
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?(https:\/\/[^\s"'#]+)/);
      if (!m || !URL_KEY.test(m[1]!)) continue;
      const url = m[2]!.replace(/\/+$/, '');
      if (/\$\{|localhost|127\.0\.0\.1/.test(url)) continue;
      add({ name: envName(stage), target: { url: new URL(url).origin }, class: stageClass(stage), source: file, why: `${m[1]} in ${file}` });
      break;
    }
  }
  return found;
}

/** The environments.<name> block for a detection, ready for config patch. */
export function detectedPatch(d: Detected, name = d.name): Record<string, unknown> {
  const isDefaultClass = 'compose' in d.target || d.class === 'deployed_preview';
  return { environments: { [name]: { target: d.target, ...(isDefaultClass ? {} : { class: d.class }) } } };
}

/** The flag form of the same thing, for docs and for agents that prefer explicit commands. */
export function detectedCommand(d: Detected): string {
  if ('compose' in d.target) return `tracegrove env add ${d.name}`;
  return `tracegrove env add ${d.name} --url ${d.target.url}${d.class === 'production_observation' ? ' --class production_observation' : ''}`;
}

function containerPort(entry: unknown): number | null {
  if (typeof entry === 'number') return entry;
  if (typeof entry === 'object' && entry && 'target' in entry) return Number((entry as { target: unknown }).target) || null;
  const text = String(entry).split('/')[0]!;
  const port = Number(text.split(':').pop());
  return Number.isInteger(port) && port > 0 ? port : null;
}

function safeList(dir: string): string[] { try { return readdirSync(dir); } catch { return []; } }
