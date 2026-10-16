/**
 * Claude Code or Codex "under the hood": tracegrove hands a coding agent the discovery report,
 * the developer's intent and the authoring conventions, and lets it write draft flows. The agent
 * is prompted to edit draft flows and run tracegrove's read-only checks. The agent CLI's
 * own permissions remain the execution boundary; this prompt is not a filesystem ACL.
 * tracegrove compiles drafts afterwards; that check does not establish their intended behavior.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { AGENT_PROVIDERS, type AgentProvider, type AuthoringConfig } from './schema.ts';
import type { Discovery } from './discover.ts';

export const SETTINGS_FILE = 'settings.json';
/** Explicit low-cost defaults from workspace policy; never inherit the CLI's production model. */
export const DEFAULT_MODELS: Record<AgentProvider, string | null> = { claude: 'claude-haiku-4.5', codex: 'gpt-6-luna', none: null };

export const LocalSettings = z.object({
  agent: z.object({
    provider: z.enum(AGENT_PROVIDERS).optional(),
    model: z.string().min(1).max(120).optional(),
    maxBudgetUsd: z.number().positive().max(100).optional(),
  }).strict().optional(),
}).strict();
export type LocalSettings = z.infer<typeof LocalSettings>;

export type AgentSettings = { provider: AgentProvider; model: string | null; maxBudgetUsd: number | null; source: Record<'provider' | 'model', 'flag' | 'settings' | 'config' | 'default'> };
export type AgentOverrides = { provider?: string | null | undefined; model?: string | null | undefined };

export function settingsPath(root: string): string {
  return join(root, '.tracegrove', SETTINGS_FILE);
}

export function readLocalSettings(root: string): LocalSettings {
  const file = settingsPath(root);
  if (!existsSync(file)) return {};
  const parsed = LocalSettings.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Blocked(parsed.error.issues.map((issue) => ({ code: 'invalid_settings', detail: `${file}${issue.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue.message}`, owner: 'operator', action: `fix or delete ${file}` })));
  return parsed.data;
}

export function writeLocalSettings(root: string, next: unknown): LocalSettings {
  const parsed = LocalSettings.safeParse(next);
  if (!parsed.success) throw new Blocked(parsed.error.issues.map((issue) => ({ code: 'invalid_settings', detail: `${issue.path.join('.') || 'settings'}: ${issue.message}`, owner: 'operator', action: 'send { agent: { provider, model } }' })));
  mkdirSync(join(root, '.tracegrove'), { recursive: true });
  writeFileSync(settingsPath(root), `${JSON.stringify(parsed.data, null, 2)}\n`);
  return parsed.data;
}

/** Precedence: CLI flag, then .tracegrove/settings.json (per developer), then the config, then defaults. */
export function resolveAgentSettings(root: string, config: AuthoringConfig | null, overrides: AgentOverrides = {}): AgentSettings {
  const local = readLocalSettings(root).agent ?? {};
  const shared = config?.agent;
  if (overrides.provider && !(AGENT_PROVIDERS as readonly string[]).includes(overrides.provider)) {
    throw new Blocked([{ code: 'invalid_agent', detail: overrides.provider, owner: 'operator', action: `use one of ${AGENT_PROVIDERS.join(', ')}` }]);
  }
  const pick = <T>(flag: T | null | undefined, settings: T | undefined, cfg: T | undefined, fallback: T) =>
    flag != null ? { value: flag, from: 'flag' as const } : settings !== undefined ? { value: settings, from: 'settings' as const } : cfg !== undefined ? { value: cfg, from: 'config' as const } : { value: fallback, from: 'default' as const };
  const provider = pick(overrides.provider as AgentProvider | null | undefined, local.provider, shared?.provider, 'claude' as AgentProvider);
  // A model chosen for another provider must not leak across a provider switch.
  const providerChanged = provider.from === 'flag' && overrides.model == null;
  const sharedProvider = shared?.provider ?? 'claude';
  const localProvider = local.provider ?? sharedProvider;
  const model = providerChanged ? { value: DEFAULT_MODELS[provider.value], from: 'default' as const }
    : pick<string | null>(overrides.model, localProvider === provider.value ? local.model : undefined,
      sharedProvider === provider.value ? shared?.model : undefined, DEFAULT_MODELS[provider.value]);
  return { provider: provider.value, model: model.value, maxBudgetUsd: local.maxBudgetUsd ?? shared?.maxBudgetUsd ?? null, source: { provider: provider.from, model: model.from } };
}

/** Which agent CLIs are on PATH. */
export function detectAgents(pathEnv = process.env.PATH ?? ''): Record<'claude' | 'codex', string | null> {
  const find = (bin: string) => {
    for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
      for (const name of process.platform === 'win32' ? [`${bin}.cmd`, `${bin}.exe`] : [bin]) {
        const candidate = join(dir, name);
        try { if (statSync(candidate).isFile()) return candidate; } catch { /* not here */ }
      }
    }
    return null;
  };
  return { claude: find('claude'), codex: find('codex') };
}

/** The JSON Schemas shipped with this tracegrove build (dist/authoring or src/authoring → ../../schema). */
export function schemaDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schema');
}

/** How the agent should invoke this same tracegrove build. */
export function tracegroveCommand(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const js = resolve(here, '..', 'cli', 'main.js');
  if (existsSync(js)) return [process.execPath, js];
  return [process.execPath, '--import', 'tsx', resolve(here, '..', 'cli', 'main.ts')];
}

export type AgentCommand = { bin: string; args: string[] };

export function buildAgentCommand(settings: AgentSettings, prompt: string, tracegrove: string[] = tracegroveCommand()): AgentCommand {
  const tg = tracegrove.join(' ');
  if (settings.provider === 'claude') {
    const allowed = ['Read', 'Write', 'Edit', 'Glob', 'Grep', `Bash(${tg} check:*)`, `Bash(${tg} list:*)`, `Bash(${tg} discover:*)`];
    return { bin: 'claude', args: ['-p', prompt, '--model', settings.model ?? DEFAULT_MODELS.claude!, '--output-format', 'json', '--permission-mode', 'acceptEdits',
      '--allowedTools', allowed.join(','), '--add-dir', schemaDir(), '--no-session-persistence', ...(settings.maxBudgetUsd ? ['--max-budget-usd', String(settings.maxBudgetUsd)] : [])] };
  }
  if (settings.provider === 'codex') {
    if (settings.maxBudgetUsd !== null) throw new Blocked([{ code: 'agent_budget_unsupported',
      detail: 'The Codex CLI adapter cannot enforce maxBudgetUsd; the requested limit cannot be silently ignored.',
      owner: 'operator', action: 'use the Claude adapter for this draft cap, or configure a host with enforced Codex accounting' }]);
    return { bin: 'codex', args: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '--model', settings.model ?? DEFAULT_MODELS.codex!, prompt] };
  }
  throw new Blocked([{ code: 'agent_disabled', detail: 'agent provider is none', owner: 'operator', action: 'set agent.provider to claude or codex in tracegrove ui → Settings, or pass --agent claude' }]);
}

function exampleFlow(testDir: string): string | null {
  const walk = (dir: string): string | null => {
    if (!existsSync(dir)) return null;
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (name === 'discovered') continue; const hit = walk(path); if (hit) return hit; }
      else if (name.endsWith('.flow.yaml')) return path;
    }
    return null;
  };
  const file = walk(testDir);
  return file ? `${relative(dirname(testDir), file)}:\n${readFileSync(file, 'utf8').slice(0, 2400)}` : null;
}

export function buildDraftPrompt(input: { root: string; testDir: string; discovery: Discovery; intent: string | null; config: AuthoringConfig | null; tracegrove?: string[] }): string {
  const tg = (input.tracegrove ?? tracegroveCommand()).join(' ');
  const outDir = relative(input.root, join(input.testDir, 'discovered')) || 'tracegrove/discovered';
  const routes = input.discovery.routes.filter((r) => r.coveredBy.length === 0 || r.changed).slice(0, 40)
    .map((r) => `- ${r.method} ${r.path}  (${r.file}:${r.line}${r.changed ? ', changed on this branch' : ''}${r.coveredBy.length ? `, covered by ${r.coveredBy.join(', ')}` : ', uncovered'})`);
  const example = exampleFlow(input.testDir);
  const personas = input.config ? Object.keys(input.config.personas) : [];
  return [
    'You are drafting behaviour tests for tracegrove, a workflow verifier that drives a real running app over HTTP.',
    input.intent ? `What the developer wants verified: ${input.intent}` : 'No intent was given: cover the most important uncovered or changed routes.',
    `Discovery (${input.discovery.source}${input.discovery.base ? `, base ${input.discovery.base}` : ''}): ${input.discovery.routes.length} routes, ${input.discovery.uncovered} uncovered.`,
    input.discovery.changedFiles.length ? `Files changed on this branch: ${input.discovery.changedFiles.slice(0, 30).join(', ')}` : '',
    'Routes worth a flow:', ...(routes.length ? routes : ['- (none uncovered; strengthen existing flows only if the intent asks)']),
    '',
    'Rules:',
    `1. Write new flows only under ${outDir}/ as <area>/<behavior>.flow.yaml (kebab-case, one behaviour per file). Never edit application code or existing flows outside ${outDir}/.`,
    '2. Read the route handlers to learn real request bodies, status codes and ownership rules before writing a step.',
    '3. A flow has title, tags, steps. A step is `- name: ...` plus one verb key (GET/POST/PUT/PATCH/DELETE: /path/{var}), optional json, as: <persona>, expect: <status | { status, json: {dot.path: value}, present: [paths], absent: [paths], count: {path: n} }>, save: { var: dot.path }. Only HTTP steps exist; do not invent other step kinds.',
    personas.length ? `4. Personas available: ${personas.join(', ')}, plus "none" for an unauthenticated caller.` : '4. Use as: none for unauthenticated calls.',
    `5. JSON Schemas: ${join(schemaDir(), 'tracegrove_flow_v1.json')} (flows) and ${join(schemaDir(), 'tracegrove_config_v1.json')} (config).`,
    `6. After writing, run \`${tg} check --json\` and fix every reported issue until it reports ok. Do not run tests against the app.`,
    '7. Finish with one line per file you wrote: path, then what behaviour it pins down.',
    example ? `\nAn existing flow in this repo, for conventions:\n${example}` : '',
  ].filter((line) => line !== '').join('\n');
}

export type AgentRunResult = { provider: AgentProvider; model: string | null; exitCode: number; files: string[]; output: string; command: string[] };

function listFlows(dir: string): Map<string, number> {
  const found = new Map<string, number>();
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path); else if (name.endsWith('.flow.yaml')) found.set(path, st.mtimeMs);
    }
  };
  walk(dir);
  return found;
}

/** Run the agent in `root`, then report which flow files it created or changed. */
export async function runAgent(input: { root: string; testDir: string; settings: AgentSettings; prompt: string; onOutput?: (chunk: string) => void; signal?: AbortSignal }): Promise<AgentRunResult> {
  const command = buildAgentCommand(input.settings, input.prompt);
  const detected = detectAgents();
  const bin = detected[input.settings.provider as 'claude' | 'codex'];
  if (!bin) throw new Blocked([{ code: 'agent_not_installed', detail: `${command.bin} is not on PATH`, owner: 'operator',
    action: input.settings.provider === 'claude' ? 'install Claude Code (npm i -g @anthropic-ai/claude-code) and sign in, or switch provider in Settings' : 'install the Codex CLI (npm i -g @openai/codex) and sign in, or switch provider in Settings' }]);
  const before = listFlows(input.testDir);
  const child = spawn(bin, command.args, { cwd: input.root, stdio: ['ignore', 'pipe', 'pipe'], ...(input.signal ? { signal: input.signal } : {}) });
  let output = '';
  const take = (chunk: Buffer) => { const text = chunk.toString(); output = (output + text).slice(-200_000); input.onOutput?.(text); };
  child.stdout.on('data', take); child.stderr.on('data', take);
  const exitCode = await new Promise<number>((done) => { child.on('close', (code) => done(code ?? 1)); child.on('error', () => done(127)); });
  const after = listFlows(input.testDir);
  const files = [...after].filter(([path, mtime]) => before.get(path) !== mtime).map(([path]) => relative(input.root, path)).sort();
  let summary = output;
  if (input.settings.provider === 'claude') { try { const parsed = JSON.parse(output) as { result?: string }; if (typeof parsed.result === 'string') summary = parsed.result; } catch { /* plain text */ } }
  return { provider: input.settings.provider, model: input.settings.model, exitCode, files, output: summary.trim().slice(-8000), command: [command.bin, ...command.args.map((a) => (a === input.prompt ? '<prompt>' : a))] };
}
