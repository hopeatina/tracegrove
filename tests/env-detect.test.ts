import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectEnvironments } from '../src/environments/detect.ts';
import { detectForConfig, guidedEnvAdd } from '../src/cli/envAdd.ts';
import { configGet } from '../src/authoring/configEdit.ts';
import { resolveEnvironment } from '../src/environments/resolve.ts';
import { loadAuthoringConfig } from '../src/authoring/compile.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tg-detect-')); roots.push(root);
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); }
  return root;
}
const CONFIG = 'project: notes\napp:\n  adapter: node\n  entry: app/app.mjs\n  health: /healthz\npersonas:\n  owner: { subject: alice }\n';

describe('env detect', () => {
  it('reads compose, Fly, Render, Vercel and .env.<stage> files', () => {
    const root = repo({
      'compose.yaml': 'services:\n  db: { image: "postgres:16", ports: ["5432:5432"] }\n  api: { build: ., ports: ["8080:8000"] }\n',
      'fly.staging.toml': 'app = "notes-staging"\n',
      'render.yaml': 'services:\n  - type: web\n    name: notes-web\n  - type: worker\n    name: notes-jobs\n',
      'vercel.json': '{}',
      '.env.production': 'DATABASE_URL=postgres://user:secret@db/notes\nNEXT_PUBLIC_SITE_URL=https://notes.example.com/app\n',
      '.env.example': 'APP_URL=https://example.invalid\n',
    });
    const found = detectEnvironments(root, '/healthz');
    expect(found.map((d) => [d.name, d.target, d.class])).toEqual([
      ['docker', { compose: 'compose.yaml', service: 'api', port: 8000, health: '/healthz' }, 'isolated_candidate'],
      ['staging', { url: 'https://notes-staging.fly.dev' }, 'deployed_preview'],
      ['production', { url: 'https://notes-web.onrender.com' }, 'production_observation'],
      ['preview', { url: 'env:PREVIEW_URL' }, 'deployed_preview'],
    ]);
    // .env.production names the same environment as Render, so the first source wins; no secret is ever read into a result.
    expect(JSON.stringify(found)).not.toContain('secret');
  });

  it('reads only URL-shaped keys from .env files, and calls an unnamed deployment production', () => {
    const root = repo({ '.env.production': 'SECRET_KEY=https://looks-like-a-url.example.com\nAPP_URL="https://notes.example.com/"\n', 'fly.toml': 'app = "notes"\n' });
    expect(detectEnvironments(root).map((d) => [d.name, 'url' in d.target ? d.target.url : null, d.class, d.source])).toEqual([
      ['production', 'https://notes.fly.dev', 'production_observation', 'fly.toml'],
    ]);
    const only = repo({ '.env.staging': 'SECRET_KEY=https://looks-like-a-url.example.com\nAPP_URL="https://staging.notes.example.com/"\n' });
    expect(detectEnvironments(only)).toMatchObject([{ name: 'staging', target: { url: 'https://staging.notes.example.com' }, source: '.env.staging' }]);
  });
});

describe('guided env add', () => {
  it('writes the chosen environment and asks where each persona credential lives', async () => {
    const root = repo({ 'tracegrove.config.yaml': CONFIG, 'fly.toml': 'app = "notes"\n', 'compose.yaml': 'services:\n  web: { build: ., ports: ["3000"] }\n' });
    const configPath = join(root, 'tracegrove.config.yaml');
    const answers = ['2', '', ''];
    const asked: string[] = [];
    const added = await guidedEnvAdd(configPath, async (q) => { asked.push(q); return answers.shift() ?? ''; }, () => {});
    expect(added?.name).toBe('production');
    expect(asked.at(-1)).toContain('env:PRODUCTION_OWNER_TOKEN');
    expect(configGet(configPath, 'environments.production').value).toEqual({ target: { url: 'https://notes.fly.dev' }, class: 'production_observation', personas: { owner: { from: 'env:PRODUCTION_OWNER_TOKEN' } } });
    expect(resolveEnvironment(loadAuthoringConfig(configPath), 'production')).toMatchObject({ writes: 'none', agents: 'deny' });
    expect(detectForConfig(configPath).detected.find((d) => d.name === 'production')?.declared).toBe(true);
  });

  it('takes a URL by hand when nothing is detected', async () => {
    const root = repo({ 'tracegrove.config.yaml': CONFIG });
    const configPath = join(root, 'tracegrove.config.yaml');
    const answers = ['https://staging.notes.example.com', 'n', 'qa', '-'];
    const added = await guidedEnvAdd(configPath, async () => answers.shift() ?? '', () => {});
    expect(added?.name).toBe('qa');
    expect(configGet(configPath, 'environments.qa').value).toEqual({ target: { url: 'https://staging.notes.example.com' } });
  });
});
