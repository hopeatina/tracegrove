/**
 * The project-level operations shared by the CLI and `tracegrove ui`: discover routes against
 * the compiled flows, check authoring files without running anything, and draft flows with a
 * coding agent followed by tracegrove's own check.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { CONFIG_FILE, compileProject, loadAuthoringConfig, type CompiledFlowInfo } from './compile.ts';
import { discover, type Discovery } from './discover.ts';
import { buildDraftPrompt, resolveAgentSettings, runAgent, type AgentOverrides, type AgentRunResult } from './agent.ts';
import type { AuthoringConfig } from './schema.ts';

export type CheckIssue = { code: string; detail: string; action: string };
export type CheckResult = { ok: boolean; flows: Array<Pick<CompiledFlowInfo, 'caseId' | 'file' | 'title'>>; issues: CheckIssue[] };

export function checkProject(dir: string): CheckResult {
  const configPath = join(resolve(dir), CONFIG_FILE);
  if (!existsSync(configPath)) return { ok: false, flows: [], issues: [{ code: 'config_not_found', detail: configPath, action: 'run tracegrove init' }] };
  try {
    const compiled = compileProject(configPath);
    return { ok: true, flows: compiled.flows.map((f) => ({ caseId: f.caseId, file: f.file, title: f.title })), issues: [] };
  } catch (error) {
    if (error instanceof Blocked) return { ok: false, flows: [], issues: error.reasons.map((r) => ({ code: r.code, detail: r.detail, action: r.action })) };
    throw error;
  }
}

export function discoverProject(dir: string, branch: string | null): Discovery {
  const root = resolve(dir);
  const configPath = join(root, CONFIG_FILE);
  let flows: Array<{ caseId: string; method: string; path: string }> = [];
  if (existsSync(configPath)) {
    try {
      const compiled = compileProject(configPath);
      flows = compiled.flows.flatMap((f) => f.steps.map((s) => ({ caseId: f.caseId, method: s.method, path: s.path })));
      flows.push({ caseId: '(readiness check)', method: 'GET', path: compiled.config.app.health });
    } catch { /* uncompilable flows cover nothing; check reports why */ }
  }
  return discover(root, flows, branch);
}

function configOrNull(root: string): AuthoringConfig | null {
  const configPath = join(root, CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  try { return loadAuthoringConfig(configPath); } catch { return null; }
}

export type DraftResult = { agent: AgentRunResult; check: CheckResult; discovery: { source: string; routes: number; uncovered: number } };

export async function draftWithAgent(input: { dir: string; branch: string | null; intent: string | null; overrides?: AgentOverrides; onOutput?: (chunk: string) => void; signal?: AbortSignal }): Promise<DraftResult> {
  const root = resolve(input.dir);
  const config = configOrNull(root);
  const testDir = resolve(root, config?.testDir ?? 'tracegrove');
  const settings = resolveAgentSettings(root, config, input.overrides ?? {});
  const discovery = discoverProject(root, input.branch);
  const prompt = buildDraftPrompt({ root, testDir, discovery, intent: input.intent, config });
  const agent = await runAgent({ root, testDir, settings, prompt, ...(input.onOutput ? { onOutput: input.onOutput } : {}), ...(input.signal ? { signal: input.signal } : {}) });
  return { agent, check: checkProject(root), discovery: { source: discovery.source, routes: discovery.routes.length, uncovered: discovery.uncovered } };
}
