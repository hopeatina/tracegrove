/**
 * The project-level operations shared by the CLI and `tracegrove ui`: discover routes against
 * the compiled flows, check authoring files without launching the application, and draft flows with a
 * coding agent followed by tracegrove's own check.
 */
import { join, resolve } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { CONFIG_FILE, compileProject, configInDirectory, loadAuthoringConfig, type CompiledFlowInfo } from './compile.ts';
import { discover, type Discovery } from './discover.ts';
import { buildDraftPrompt, resolveAgentSettings, runAgent, type AgentOverrides, type AgentRunResult } from './agent.ts';
import type { AuthoringConfig } from './schema.ts';

export type CheckIssue = { code: string; detail: string; action: string };
export type CheckResult = { ok: boolean; flows: Array<Pick<CompiledFlowInfo, 'caseId' | 'file' | 'title'>>; issues: CheckIssue[] };

export function checkProject(dir: string): CheckResult {
  try {
    const configPath = configInDirectory(resolve(dir));
    if (!configPath) return { ok: false, flows: [], issues: [{ code: 'config_not_found', detail: join(resolve(dir), CONFIG_FILE), action: 'run tracegrove init' }] };
    const compiled = compileProject(configPath);
    return { ok: true, flows: compiled.flows.map((f) => ({ caseId: f.caseId, file: f.file, title: f.title })), issues: [] };
  } catch (error) {
    if (error instanceof Blocked) return { ok: false, flows: [], issues: error.reasons.map((r) => ({ code: r.code, detail: r.detail, action: r.action })) };
    throw error;
  }
}

export function discoverProject(dir: string, branch: string | null): Discovery {
  const root = resolve(dir);
  let flows: Array<{ caseId: string; method: string; path: string }> = [];
  try {
    const configPath = configInDirectory(root);
    if (configPath) {
      const compiled = compileProject(configPath);
      flows = compiled.flows.flatMap((f) => f.steps.map((s) => ({ caseId: f.caseId, method: s.method, path: s.path })));
      flows.push({ caseId: '(readiness check)', method: 'GET', path: compiled.config.app.health });
    }
  } catch { /* uncompilable flows cover nothing; check reports why */ }
  return discover(root, flows, branch);
}

function configOrNull(root: string): AuthoringConfig | null {
  try { const path = configInDirectory(root); return path ? loadAuthoringConfig(path) : null; } catch { return null; }
}

export type DraftResult = { agent: AgentRunResult; check: CheckResult; discovery: { source: string; routes: number; uncovered: number } };

export async function draftWithAgent(input: { dir: string; branch: string | null; intent: string | null; overrides?: AgentOverrides; onOutput?: (chunk: string) => void; onActivity?: (line: string) => void; signal?: AbortSignal }): Promise<DraftResult> {
  const root = resolve(input.dir);
  const config = configOrNull(root);
  const testDir = resolve(root, config?.testDir ?? 'tracegrove');
  const settings = resolveAgentSettings(root, config, input.overrides ?? {});
  const discovery = discoverProject(root, input.branch);
  const prompt = buildDraftPrompt({ root, testDir, discovery, intent: input.intent, config });
  const agent = await runAgent({ root, testDir, settings, prompt, ...(input.onOutput ? { onOutput: input.onOutput } : {}), ...(input.onActivity ? { onActivity: input.onActivity } : {}), ...(input.signal ? { signal: input.signal } : {}) });
  return { agent, check: checkProject(root), discovery: { source: discovery.source, routes: discovery.routes.length, uncovered: discovery.uncovered } };
}
