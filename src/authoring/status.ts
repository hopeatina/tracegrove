/**
 * `tracegrove status`: one look at where a project stands and the next command worth running.
 * It never starts the app. The `next` list is ordered and machine-readable so a coding agent can
 * follow it the same way a person does.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { CONFIG_FILE, loadAuthoringConfig } from './compile.ts';
import { resolveRun, type TestRunReport } from './run.ts';
import { checkProject, discoverProject } from './workspace.ts';
import { detectAgents, resolveAgentSettings } from './agent.ts';
import { listHeals } from './heal.ts';
import type { AuthoringConfig } from './schema.ts';
import { readSavedRun, type CheckedRunReport } from './runSource.ts';

export type NextAction = { command: string; why: string };
export type ProjectStatus = {
  schemaVersion: 'tracegrove.status/v1';
  root: string;
  config: { found: boolean; path: string; project: string | null; adapter: string | null };
  flows: number;
  check: { ok: boolean; issues: number; first: string | null };
  latestRun: { name: string; outcome: string; totals: TestRunReport['totals']; finishedAt: string; failing: string[]; evidenceStatus: CheckedRunReport['evidenceStatus'] } | null;
  agent: { provider: string; model: string | null; installed: boolean };
  coverage: { routes: number; uncovered: number; changed: number } | null;
  latestHeal: { id: string; outcome: string; kept: number } | null;
  next: NextAction[];
};

/** Walk up from `dir` to the folder holding tracegrove.config.yaml; null when there is none. */
export function projectRoot(dir: string): string | null {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, CONFIG_FILE))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function projectStatus(dir: string): ProjectStatus {
  const root = projectRoot(dir) ?? resolve(dir);
  const path = join(root, CONFIG_FILE);
  const found = existsSync(path);
  let config: AuthoringConfig | null = null;
  try { config = found ? loadAuthoringConfig(path) : null; } catch { config = null; }
  const check = found ? checkProject(root) : { ok: false, flows: [], issues: [] };
  let latestRun: ProjectStatus['latestRun'] = null;
  const runDir = found ? resolveRun(root, 'latest') : null;
  if (runDir) {
    const r = readSavedRun(runDir);
    latestRun = { name: basename(runDir), outcome: r.outcome, totals: r.totals, finishedAt: r.finishedAt,
      failing: r.cases.filter((c) => c.outcome !== 'passed').map((c) => c.caseId), evidenceStatus: r.evidenceStatus };
  }
  let settings = { provider: 'claude', model: null as string | null };
  try { settings = resolveAgentSettings(root, config); } catch { /* invalid settings show up in check */ }
  const installed = settings.provider !== 'none' && !!detectAgents()[settings.provider as 'claude' | 'codex'];
  let coverage: ProjectStatus['coverage'] = null;
  if (found) {
    try { const d = discoverProject(root, null); coverage = { routes: d.routes.length, uncovered: d.uncovered, changed: d.routes.filter((r) => r.changed).length }; } catch { coverage = null; }
  }
  const heal = found ? listHeals(root)[0] : undefined;
  const latestHeal = heal ? { id: heal.id, outcome: heal.outcome, kept: heal.changes.filter((c) => c.status === 'kept').length } : null;

  const next: NextAction[] = [];
  if (!found) next.push({ command: 'tracegrove init', why: 'detect the framework and write tracegrove.config.yaml plus a first flow' });
  else if (!check.ok) next.push({ command: 'tracegrove heal', why: `${check.issues.length} authoring or setup issue(s); heal fixes what it can and explains the rest` }, { command: 'tracegrove check', why: 'see every issue with its file and fix' });
  else if (!latestRun) next.push({ command: 'tracegrove test', why: 'run every flow against the real app for the first time' });
  else if (latestRun.evidenceStatus === 'invalid') next.push({ command: `tracegrove show --run ${latestRun.name}`, why: 'saved evidence is unavailable; inspect or restore it before relying on results or attempting repairs' });
  else if (latestRun.outcome !== 'passed') next.push({ command: 'tracegrove heal', why: `${latestRun.failing.length} case(s) not passing; heal fixes setup and drifted tests and reports product bugs` }, { command: 'tracegrove show', why: 'read the failure in full' });
  if (found && coverage && coverage.uncovered > 0) next.push(installed
    ? { command: 'tracegrove draft', why: `${coverage.uncovered} route(s) have no flow; ${settings.provider} drafts them, check verifies` }
    : { command: 'tracegrove discover', why: `${coverage.uncovered} route(s) have no flow yet` });
  if (found && !installed && settings.provider !== 'none') next.push({ command: 'tracegrove settings', why: `${settings.provider} is not installed; agent drafting and healing are off` });
  if (found) next.push({ command: 'tracegrove ui', why: 'see the grove: flows, runs, coverage and heals in the browser' });

  return {
    schemaVersion: 'tracegrove.status/v1', root,
    config: { found, path, project: config?.project ?? null, adapter: config?.app.adapter ?? null },
    flows: check.flows.length, check: { ok: check.ok, issues: check.issues.length, first: check.issues[0] ? `${check.issues[0].code}: ${check.issues[0].detail}` : null },
    latestRun, agent: { provider: settings.provider, model: settings.model, installed }, coverage, latestHeal, next,
  };
}

export function ageOf(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return 'time unavailable';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

