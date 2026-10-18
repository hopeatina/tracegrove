/** Native metadata inspection. Compilation writes derived files; this never launches the app. */
import { accessSync, constants, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { chromium } from 'playwright';
import { compileProject, findConfig } from '../authoring/compile.ts';
import { loadProject, localScope } from '../core/corpus.ts';
import { Blocked } from '../core/errors.ts';
import { plan } from '../core/planner.ts';
import { CaseSpec, HostPlan, type Ref } from '../protocol/index.ts';
import { sourceIdentityDigest } from '../hosts/local.ts';
import { observeApplicationRuntime } from '../hosts/runtime.ts';
import { readGitSnapshotTree } from '../source/snapshotTree.ts';
import { sameScope } from '../protocol/canonical.ts';

type Issue = { code: string; detail: string; owner: string; action: string };
type Check = { check: string; state: 'ok' | 'warn' | 'blocked'; detail: string; code: string; action: string };
export type DoctorReport = {
  schemaVersion: 'tracegrove.doctor/v1'; profile: string | null; blocked: boolean; exitCode: 0 | 2;
  checks: Check[]; errors: Issue[];
  selection: { inputKind: 'authoring' | 'corpus'; configPath: string; workflowConfigPath: string;
    hostPlanRef: Ref; hostAdapter: HostPlan['adapter']; placement: HostPlan['placement'];
    requiredCapabilities: string[]; corpusRef: Ref; compiledFilesWritten: boolean } | null;
  source: { digest: string; files: number } | null;
  runtime: { runtime: string; version: string; executableSha256: string } | null;
  execution: 'not_started'; verificationVerdict: 'not_evaluated';
};
export function doctorFailure(error: unknown, report?: DoctorReport): DoctorReport {
  const result = report ?? emptyReport();
  result.blocked = true; result.exitCode = 2;
  result.errors.push(...(error instanceof Blocked ? error.reasons : [{ code: 'doctor_inspection_failed',
    detail: 'project metadata could not be inspected; no application was launched', owner: 'operator',
    action: 'check the configuration, source paths and interpreter; run check for authoring diagnostics' }]));
  return result;
}
function emptyReport(): DoctorReport {
  return { schemaVersion: 'tracegrove.doctor/v1', profile: null, blocked: true, exitCode: 2, checks: [], errors: [],
    selection: null, source: null, runtime: null, execution: 'not_started', verificationVerdict: 'not_evaluated' };
}

export async function inspectDoctor(options: { config?: string | undefined; dir?: string | undefined; profile?: string | undefined }): Promise<DoctorReport> {
  const report = emptyReport();
  try {
    if (options.config && options.dir) throw new Blocked([{ code: 'conflicting_flags', detail: '--config and --dir cannot be combined' }]);
    const configPath = options.config ? resolve(options.config) : findConfig(options.dir ?? '.');
    const raw: unknown = parseYaml(readFileSync(configPath, 'utf8'), { strict: true });
    // Explicitly recognize the two existing config formats; portable SDK examples are not executable configs.
    const kind = raw && typeof raw === 'object' && 'schemaVersion' in raw
      ? (raw.schemaVersion === 'workflow.config/v1' ? 'corpus' : null)
      : raw && typeof raw === 'object' && 'app' in raw ? 'authoring' : null;
    if (!kind) throw new Blocked([{ code: 'unsupported_doctor_config', detail: 'expected tracegrove.config.yaml or workflow.config/v1',
      action: 'select an existing authoring or corpus config; portable SDK profiles are not executable CLI configs' }]);
    // Authoring currently compiles exactly one native profile; reject selection mistakes before writing derived files.
    if (kind === 'authoring' && options.profile && options.profile !== 'real') throw new Blocked([{ code: 'unknown_profile',
      detail: options.profile, action: 'select real for the native authoring profile' }]);
    const workflowConfigPath = kind === 'authoring' ? compileProject(configPath).workflowConfigPath : configPath;
    const project = loadProject(workflowConfigPath);
    const profileName = options.profile ?? project.config.defaultProfile;
    report.profile = profileName;
    const profile = project.config.profiles[profileName];
    if (!profile) throw new Blocked([{ code: 'unknown_profile', detail: profileName,
      action: `choose one of ${Object.keys(project.config.profiles).join(', ')}` }]);
    const hostRef = project.fileRefs.get(profile.hostPlanRef ?? project.config.executionHostRef)!;
    const host = project.corpus.getAs(HostPlan, hostRef);
    report.selection = { inputKind: kind, configPath, workflowConfigPath, hostPlanRef: host.ref,
      hostAdapter: host.adapter, placement: host.placement, requiredCapabilities: host.requiredCapabilities,
      corpusRef: project.corpus.manifest.ref, compiledFilesWritten: kind === 'authoring' };
    const check = (name: string, state: Check['state'], detail: string, code: string, action = 'none') =>
      report.checks.push({ check: name, state, detail, code, action });
    check('node', process.versions.node.startsWith('22.') ? 'ok' : 'warn', process.version, 'controller_runtime_observed');
    if (host.adapter === 'local_process' && process.platform === 'win32')
      check('host', 'blocked', 'local host requires POSIX process-group termination', 'local_process_tree_unsupported', 'select a qualified POSIX host');
    if (host.launch) {
      const cwd = resolve(project.root, host.launch.cwd);
      if (host.launch.sourceSnapshot) {
        const pin = host.launch.sourceSnapshot;
        if (!sameScope(pin.snapshot.scope, localScope())) doctorFailure(new Blocked([{ code: 'snapshot_scope_mismatch', detail: 'snapshot belongs to another local owner' }]), report);
        else try {
          const files = readGitSnapshotTree(pin.snapshot, resolve(project.root, pin.root));
          check('source_snapshot', 'ok', `${files.length} pinned file(s); no application launched`, 'source_snapshot_verified');
        } catch { check('source_snapshot', 'blocked', 'Pinned source tree no longer matches its manifest', 'source_snapshot_mismatch', 'materialize the snapshot again'); }
      }
      try {
        const identity = sourceIdentityDigest(cwd, host.launch.identitySourceFiles);
        report.source = { digest: identity.hex, files: identity.entries.length };
        check('identity_sources', 'ok', `${identity.entries.length} file(s), digest ${identity.hex}`, 'source_identity_observed');
      } catch (error) { doctorFailure(error, report); }
      try {
        const runtime = await observeApplicationRuntime(host.launch.command, cwd, process.env.PATH ?? '');
        report.runtime = { runtime: runtime.runtime, version: runtime.version, executableSha256: runtime.executableSha256 };
        check('application_runtime', 'ok', `${runtime.runtime} (${runtime.version}); executable digest ${runtime.executableSha256}`, 'application_runtime_observed');
      } catch (error) { doctorFailure(error, report); }
    } else check('host', 'ok', `${host.adapter} selected; no application launch inspected`, 'host_adapter_selected');
    const bundle = plan({ project, profileName, scope: localScope() });
    report.errors.push(...bundle.blockers);
    check('plan', bundle.blockers.length ? 'blocked' : 'ok', `${bundle.request?.caseRefs.length ?? 0} case(s), ${bundle.excludedCells.length} excluded`,
      bundle.blockers.length ? 'plan_blocked' : 'plan_compiled', bundle.blockers.length ? 'resolve the reported blockers' : 'none');
    const browserRequired = (bundle.request?.caseRefs ?? []).some(ref => project.corpus.getAs(CaseSpec, ref).steps.some(step => step.kind.startsWith('ui.')));
    if (browserRequired) {
      try {
        accessSync(chromium.executablePath(), constants.X_OK);
        check('chromium_installation', 'ok', 'executable is installed; engine launch, system libraries and video capture are untested', 'browser_executable_installed');
      } catch {
        check('chromium_installation', 'blocked', 'required Chromium executable is missing or inaccessible', 'browser_executable_missing',
          'install the pinned Playwright Chromium and required system libraries in an authorized environment, then run doctor again');
      }
    }
    report.blocked = report.errors.length > 0 || report.checks.some(c => c.state === 'blocked');
    report.exitCode = report.blocked ? 2 : 0;
    return report;
  } catch (error) { return doctorFailure(error, report); }
}
