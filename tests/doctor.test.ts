import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { writeSample } from '../src/cli/samples/write.ts';
import { type DoctorReport } from '../src/cli/doctor.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function sample(name: 'notes-api' | 'notes-browser' = 'notes-api'): string {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-doctor-')); roots.push(root);
  writeSample(resolve('src/samples'), name, root); return root;
}
function doctor(argv: string[], cwd = process.cwd(), env = process.env) {
  const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'),
    'doctor', ...argv, '--json'], { cwd, env, encoding: 'utf8', timeout: 20_000 });
  expect(child.error).toBeUndefined(); expect(child.stderr).toBe('');
  return { status: child.status, report: JSON.parse(child.stdout) as DoctorReport };
}

it('discovers a native project from a nested directory and inspects its compiled plan without launching the app', () => {
  const root = sample();
  const app = join(root, 'app/app.mjs'); const marker = join(root, 'APP_WAS_LAUNCHED');
  writeFileSync(app, `import { writeFileSync as doctorMarker } from 'node:fs'; doctorMarker(${JSON.stringify(marker)}, 'launched');\n${readFileSync(app, 'utf8')}`);
  const { status, report } = doctor([], join(root, 'tracegrove/notes'));
  expect(status).toBe(0); expect(report.blocked).toBe(false);
  expect(report.selection).toMatchObject({ inputKind: 'authoring', configPath: join(root, 'tracegrove.config.yaml'),
    hostAdapter: 'local_process', compiledFilesWritten: true });
  expect(report.selection?.hostPlanRef.digest.hex).toMatch(/^[a-f0-9]{64}$/);
  expect(report.source?.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(report.runtime?.executableSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.checks.find(c => c.check === 'plan')?.code).toBe('plan_compiled');
  expect(report).toMatchObject({ execution: 'not_started', verificationVerdict: 'not_evaluated' });
  expect(existsSync(marker)).toBe(false); expect(existsSync(join(root, '.tracegrove/runs'))).toBe(false);
  expect(existsSync(join(root, '.workflow-verify'))).toBe(false);
});

it('preserves explicit low-level corpus profile selection', () => {
  const root = sample();
  const { status, report } = doctor(['--config', join(root, 'verification/workflow.yaml'), '--profile', 'native-real']);
  expect(status).toBe(0); expect(report.profile).toBe('native-real');
  expect(report.selection).toMatchObject({ inputKind: 'corpus', compiledFilesWritten: false });
  expect(existsSync(join(root, '.tracegrove/compiled'))).toBe(false);
});

it.each([['--profile', 'unknown'], ['--config', '/missing', '--dir', '.']])('rejects bad selectors before writing a compiled corpus: %j', (...argv) => {
  const root = sample();
  const { status, report } = doctor(argv, root);
  expect(status).toBe(2); expect(report.errors[0]?.code).toBe(argv[0] === '--profile' ? 'unknown_profile' : 'conflicting_flags');
  expect(existsSync(join(root, '.tracegrove'))).toBe(false);
});

it('reports missing Chromium as a dependency blocker without installing or probing a browser engine', () => {
  const root = sample('notes-browser');
  const { status, report } = doctor(['--dir', root], process.cwd(), { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, 'absent-browsers') });
  expect(status).toBe(2);
  expect(report.checks.find(c => c.check === 'chromium_installation')).toMatchObject({ state: 'blocked', code: 'browser_executable_missing' });
  expect(existsSync(join(root, 'absent-browsers'))).toBe(false);
  expect(existsSync(join(root, '.tracegrove/runs'))).toBe(false);
});

it('retains missing interpreter recovery and rejects SDK profile files', () => {
  const root = sample(); const config = join(root, 'tracegrove.config.yaml');
  writeFileSync(config, readFileSync(config, 'utf8').replace('adapter: node', 'adapter: fastapi\n  python: /definitely-missing-python'));
  const missing = doctor(['--dir', root]);
  expect(missing.status).toBe(2); expect(missing.report.errors[0]?.code).toBe('launch_executable_missing');
  const sdk = doctor(['--config', resolve('docs/examples/portable-environments/alongside_runner.json')]);
  expect(sdk.status).toBe(2); expect(sdk.report.errors[0]?.code).toBe('unsupported_doctor_config');
});

it('retains source-identity errors for low-level plans and structures invalid doctor arguments', () => {
  const root = sample();
  rmSync(join(root, 'app/app.mjs'));
  const missing = doctor(['--config', join(root, 'verification/workflow.yaml')]);
  expect(missing.status).toBe(2); expect(missing.report.errors.some(e => e.code === 'identity_file_missing')).toBe(true);
  expect(missing.report.execution).toBe('not_started');
  const invalid = doctor(['--unsupported']);
  expect(invalid.status).toBe(2); expect(invalid.report.errors[0]?.code).toBe('unknown_flag');
});

it.each([['--json', 'false'], ['--json=false']])('keeps explicit JSON false parse errors in prose: %j', (...flags) => {
  const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'),
    'doctor', ...flags, '--unsupported'], { encoding: 'utf8', timeout: 20_000 });
  expect(child.status).toBe(2); expect(child.stdout).toBe('');
  expect(child.stderr).toContain('BLOCKED: unknown_flag');
});

it.each([['--json'], ['--json', 'true'], ['--json=true']])('keeps supported JSON true parse errors structured: %j', (...flags) => {
  const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'),
    'doctor', ...flags, '--unsupported'], { encoding: 'utf8', timeout: 20_000 });
  expect(child.status).toBe(2); expect(child.stderr).toBe('');
  expect(JSON.parse(child.stdout)).toMatchObject({ exitCode: 2, errors: [{ code: 'unknown_flag' }] });
});
