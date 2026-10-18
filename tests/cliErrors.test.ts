import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { writeSample } from '../src/cli/samples/write.ts';
import { cliErrorReport } from '../src/cli/errors.ts';
import { jsonRequested } from '../src/cli/arguments.ts';
import { Blocked, Conflict, InfrastructureFailure } from '../src/core/errors.ts';
import { CliErrorReport, SchemaViolation } from '../src/protocol/index.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { planSample } from '../conformance/helpers.ts';

const roots: string[] = [];
const privateText = 'PRIVATE_CANDIDATE_VALUE_7c91';
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function scratch() { const root = mkdtempSync(join(tmpdir(), 'tracegrove-cli-errors-')); roots.push(root); return root; }
function sample() { const root = scratch(); writeSample(resolve('src/samples'), 'notes-api', root); return root; }
function cli(argv: string[], cwd = process.cwd()) {
  const child = spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/cli/main.ts'), ...argv],
    { cwd, encoding: 'utf8', timeout: 20_000 });
  expect(child.error).toBeUndefined(); expect(child.signal).toBeNull();
  return child;
}
function failure(argv: string[], cwd = process.cwd()) {
  const child = cli(argv, cwd);
  expect(child.stderr).toBe('');
  const report = CliErrorReport.parse(JSON.parse(child.stdout));
  expect(child.status).toBe(report.exitCode);
  expect(child.stdout).not.toContain(privateText);
  expect(Object.keys(report)).toEqual(['schemaVersion', 'command', 'errorClass', 'exitCode', 'reasons', 'omittedReasonCount']);
  return report;
}

it.each([
  { argv: [privateText, '--json'], code: 'unknown_command', command: null },
  { argv: ['run', '--json', `--${privateText}`], code: 'unknown_flag', command: 'run' },
  { argv: ['run', '--json'], code: 'missing_argument', command: 'run' },
  { argv: ['run', '--request=a', '--request=b', '--json=true'], code: 'duplicate_flag', command: 'run' },
  { argv: ['run', '--request=a', '--json', 'true', '--jsonl'], code: 'conflicting_flags', command: 'run' },
])('returns bounded public argument diagnostics: $code', ({ argv, code, command }) => {
  expect(failure(argv)).toMatchObject({ command, errorClass: 'blocked', exitCode: 2, reasons: [{ code }] });
});

it.each([['--json', 'false'], ['--json=false']])('keeps explicit false errors in prose: %j', (...flags) => {
  const child = cli(['run', ...flags, '--unsupported']);
  expect(child.status).toBe(2); expect(child.stdout).toBe(''); expect(child.stderr).toContain('BLOCKED: unknown_flag');
});

it('uses the established boolean syntax when selecting error output before parsing', () => {
  for (const flags of [['--json'], ['--json=true'], ['--json', 'true']]) expect(jsonRequested(['run', ...flags])).toBe(true);
  for (const flags of [[], ['--json=false'], ['--json', 'false'], ['--json=invalid']]) expect(jsonRequested(['run', ...flags])).toBe(false);
});

it('reports missing authoring config and input files without exporting paths', () => {
  const root = scratch(); const missing = join(root, privateText);
  expect(failure(['test', '--config', missing, '--json'])).toMatchObject({ exitCode: 2, reasons: [{ code: 'config_not_found' }] });
  expect(failure(['validate', '--config', missing, '--json'])).toMatchObject({ exitCode: 3, reasons: [{ code: 'input_unavailable' }] });
  expect(existsSync(join(root, '.tracegrove'))).toBe(false);
});

it('reports a missing interpreter without launching the app or revealing the configured path', () => {
  const root = sample(); const path = join(root, 'tracegrove.config.yaml');
  writeFileSync(path, readFileSync(path, 'utf8').replace('adapter: node', `adapter: fastapi\n  python: /missing/${privateText}`));
  expect(failure(['test', '--config', path, '--json'])).toMatchObject({ exitCode: 2, reasons: [{ code: 'launch_executable_missing' }] });
  expect(existsSync(join(root, '.tracegrove/runs'))).toBe(false);
});

it('does not expose JSON parser excerpts or schema diagnostics from corrupt inputs', () => {
  const root = scratch(); const path = join(root, 'request.json');
  writeFileSync(path, `{ "private": "${privateText}" invalid }`);
  expect(failure(['run', '--request', path, '--json'])).toMatchObject({ errorClass: 'blocked', exitCode: 2, reasons: [{ code: 'invalid_request_file' }] });
  writeFileSync(path, JSON.stringify({ schemaVersion: privateText }));
  const output = join(root, 'rerun.json');
  expect(failure(['rerun', '--request', path, '--output', output, '--json'])).toMatchObject({ exitCode: 2, reasons: [{ code: 'invalid_request_file' }] });
  expect(existsSync(output)).toBe(false);
  expect(existsSync(join(root, '.workflow-verify'))).toBe(false);
});

it('keeps doctor on its existing report contract including argument failures', () => {
  const child = cli(['doctor', '--unsupported', '--json']);
  expect(child.status).toBe(2); expect(child.stderr).toBe('');
  expect(JSON.parse(child.stdout)).toMatchObject({ schemaVersion: 'tracegrove.doctor/v1', execution: 'not_started', verificationVerdict: 'not_evaluated' });
});

it('returns a public schema error without candidate schema names or document contents', () => {
  const root = sample(); const path = join(root, 'verification/cases/notes.create.yaml');
  writeFileSync(path, readFileSync(path, 'utf8').replace('workflow.case/v1', privateText));
  expect(failure(['validate', '--config', join(root, 'verification/workflow.yaml'), '--json']))
    .toMatchObject({ errorClass: 'invalid_input', exitCode: 2, reasons: [{ code: 'invalid_document' }] });
});

it('bounds reasons and never exports exception text, arbitrary codes, owners, actions or stacks', () => {
  const cases = [new Blocked(Array.from({ length: 40 }, () => ({ code: privateText, detail: privateText, owner: privateText, action: privateText }))),
    new Conflict(privateText), new SchemaViolation(privateText, [privateText]), new InfrastructureFailure(privateText),
    new SyntaxError(privateText), new Error(privateText), Object.assign(new Error(privateText), { code: 'EACCES' })];
  for (const error of cases) {
    const report = cliErrorReport(error, privateText);
    expect(JSON.stringify(report)).not.toContain(privateText); expect(report.command).toBeNull();
    expect(CliErrorReport.safeParse({ ...report, stack: privateText }).success).toBe(false);
  }
  const bounded = cliErrorReport(cases[0], 'run');
  expect(bounded.reasons).toHaveLength(32); expect(bounded.omittedReasonCount).toBe(8);
});

it('preserves completed positive and negative test JSON, exit codes and verified bundles', () => {
  const root = sample(); const path = join(root, 'tracegrove.config.yaml');
  const passed = cli(['test', '--config', path, '--grep', 'list', '--json']);
  expect(passed.status).toBe(0); expect(passed.stderr).toBe('');
  const positive = JSON.parse(passed.stdout);
  expect(positive).toMatchObject({ schemaVersion: 'tracegrove.run-summary/v1', outcome: 'passed', exitCode: 0, bundleVerified: true });
  expect(verifyBundle(join(positive.runDir, 'bundle')).ok).toBe(true);
  const flow = join(root, 'tracegrove/notes/list.flow.yaml');
  writeFileSync(flow, readFileSync(flow, 'utf8').replace('expect: 201', 'expect: 202'));
  const failed = cli(['test', '--config', path, '--grep', 'list', '--json=true']);
  expect(failed.status).toBe(1); expect(failed.stderr).toBe('');
  const negative = JSON.parse(failed.stdout);
  expect(negative).toMatchObject({ schemaVersion: 'tracegrove.run-summary/v1', outcome: 'assertion_failed', exitCode: 1, bundleVerified: true });
  expect(verifyBundle(join(negative.runDir, 'bundle')).ok).toBe(true);
  expect(negative.runDir).not.toBe(positive.runDir);
});

it('preserves completed low-level run JSON and assertion exit status', () => {
  const root = sample(); const config = join(root, 'verification/workflow.yaml');
  const path = join(root, 'frozen.json'); const state = join(root, '.state');
  writeFileSync(path, JSON.stringify(planSample(config)));
  const passed = cli(['run', '--request', path, '--state-dir', state, '--json']);
  expect(passed.status).toBe(0); expect(passed.stderr).toBe('');
  const positive = JSON.parse(passed.stdout);
  expect(positive).toMatchObject({ outcome: 'passed', exitCode: 0, redelivered: false });
  expect(positive.schemaVersion).toBeUndefined(); expect(verifyBundle(positive.executionDir).ok).toBe(true);
  const casePath = join(root, 'verification/cases/notes.create.yaml');
  writeFileSync(casePath, readFileSync(casePath, 'utf8').replace('expectStatus: 201', 'expectStatus: 202'));
  writeFileSync(path, JSON.stringify(planSample(config)));
  const failed = cli(['run', '--request', path, '--state-dir', state, '--json']);
  expect(failed.status).toBe(1); expect(failed.stderr).toBe('');
  const negative = JSON.parse(failed.stdout);
  expect(negative).toMatchObject({ outcome: 'assertion_failed', exitCode: 1, redelivered: false });
  expect(negative.schemaVersion).toBeUndefined(); expect(verifyBundle(negative.executionDir).ok).toBe(true);
  expect(negative.executionId).not.toBe(positive.executionId);
});

it('names every parsed command in its structured error report', async () => {
  const { COMMAND_SCHEMAS } = await import('../src/cli/arguments.ts');
  const { CliErrorReport } = await import('../src/protocol/index.ts');
  expect([...CliErrorReport.shape.command.unwrap().options].sort()).toEqual(Object.keys(COMMAND_SCHEMAS).sort());
});
