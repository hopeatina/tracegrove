import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { compileProject, type CompileResult } from './compile.ts';
import { safeRef } from './discover.ts';
import { git, readChange, unitsOf } from './growChange.ts';
import { identityFromEntries } from '../hosts/sourceIdentity.ts';
import { sha256Hex } from '../protocol/canonical.ts';
import { readSavedRun } from './savedRun.ts';
import { matchesTemplate, MAX_OBSERVED_PER_CASE } from './traffic.ts';
import { runTests } from './run.ts';

export function impactPlan(compiled: CompileResult, base: string, baseline: string) {
  const { root, flows } = compiled;
  const all = flows.map(f => f.caseId);
  const full = (reason: string) => ({ caseIds: all, full: true, reasons: [reason] });
  try {
    const repo = git(root, ['rev-parse', '--show-toplevel']).trim();
    const commit = git(repo, ['merge-base', safeRef(base), 'HEAD']).trim();
    if (git(repo, ['status', '--porcelain', '--untracked-files=normal']).trim()) return full('Working tree contains uncommitted inputs');
    const report = readSavedRun(root, baseline);
    if (!report.bundleVerified || report.outcome !== 'passed' || all.some(id => !report.cases.some(c => c.caseId === id)))
      return full('Baseline lacks verified passing coverage for the suite');
    const identity = identityFromEntries(compiled.sourceFiles.map(path => ({ path, sha256: sha256Hex(execFileSync('git',
      ['show', commit + ':' + relative(repo, resolve(compiled.sourceRoot, path))], { cwd: repo, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })) })));
    if (identity.hex !== report.sourceDigest) return full('Baseline does not identify the merge-base source');
    const files = readChange(repo, commit, 'HEAD');
    const { units, untraced } = unitsOf(repo, 'HEAD', files);
    if (untraced) return full('Grow could not trace all changed units');
    const selected = new Set<string>(), reasons: string[] = [];
    for (const file of files) {
      const flow = flows.find(f => relative(repo, resolve(root, f.file)) === file.path);
      if (flow) { selected.add(flow.caseId); reasons.push(file.path + ' defines ' + flow.caseId); continue; }
      const reached = units.filter(u => u.file === file.path);
      const routes = reached.filter(u => u.method && u.path);
      if (!routes.length || reached.some(u => !u.root && u.kind !== 'route') || file.isNew || file.added.length < file.adds ||
        file.added.some(a => a.text.trim() && !routes.some(u => u.added.some(line => line.line === a.line))))
        return full('Unmapped dependency in ' + file.path);
      for (const route of routes) {
        const touches = report.cases.filter(c => c.requests?.some(r => r.method === route.method && matchesTemplate(route.path!, r.path)));
        if (!touches.length || report.cases.some(c => !c.requests?.length || c.requests.length >= MAX_OBSERVED_PER_CASE))
          return full('Incomplete observed traffic for ' + route.label);
        for (const c of touches) {
          selected.add(c.caseId);
          reasons.push(route.label + ' observed in ' + c.caseId + (c.services?.length ? ' (' + c.services.map(s => s.name).join(', ') + ')' : ''));
        }
      }
    }
    return selected.size ? { caseIds: [...selected].sort(), full: selected.size === all.length, reasons } : full('No positively mapped case');
  } catch { return full('Git history, source identity, or coverage evidence unavailable'); }
}

export async function runImpact(configPath: string, base: string, baseline: string, selectedOnly: boolean) {
  const start = Date.now();
  const compiled = compileProject(configPath);
  const plan = impactPlan(compiled, base, baseline);
  const planMs = Date.now() - start;
  const shadow = !selectedOnly && !plan.full;
  const dir = join(dirname(configPath), '.tracegrove', 'impact');
  mkdirSync(dir, { recursive: true });
  const run = async (selected: boolean) => {
    const at = Date.now();
    const { report } = await runTests({ configPath, ...(selected ? { caseIds: plan.caseIds, storage: mkdtempSync(join(dir, 'selected-')) } : {}) });
    return { report, elapsedMs: Date.now() - at };
  };
  const [first, reference] = await Promise.all([run(!plan.full), shadow ? run(false) : null]);
  const missed = reference?.report.cases.filter(c => !plan.caseIds.includes(c.caseId) && c.outcome !== 'passed').map(c => c.caseId) ?? [];
  const exitCode = first.report.exitCode || reference?.report.exitCode || 0;
  return { schemaVersion: 'tracegrove.impact/v1', plan, planMs, selected: first, shadow: reference, missed, exitCode };
}
