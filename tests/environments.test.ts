/**
 * Environments end to end: config resolution and safety classes, config edits, agent policy, and real
 * runs against standalone deployments tracegrove does not launch (the staging-notes example app plus
 * the identity fake), including cleanup that cannot be confirmed and a broker persona revoked mid-run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveEnvironment, selectEnvironment, flowEnabledIn, environmentNames } from '../src/environments/resolve.ts';
import { detectAgent, enforceAgentPolicy, grantApproval } from '../src/environments/agents.ts';
import { configGet, configPatch, configSet, envAddPatch, parseValue } from '../src/authoring/configEdit.ts';
import { compileProject, loadAuthoringConfig } from '../src/authoring/compile.ts';
import { runTests } from '../src/authoring/run.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { Blocked } from '../src/core/errors.ts';
import { parseArgs } from '../src/cli/arguments.ts';
import { envList, explain, capabilityMatrix } from '../src/environments/commands.ts';
import { runEnvDoctor } from '../src/environments/doctorCache.ts';

const EXAMPLE = resolve(import.meta.dirname, '../examples/staging-notes');
const freePort = () => new Promise<number>((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
const blockedCodes = (fn: () => unknown) => { try { fn(); } catch (error) { if (error instanceof Blocked) return error.reasons.map(r => r.code); throw error; } return []; };

describe('environment resolution and safety classes', () => {
  const config = { environments: {
    staging: { target: { url: 'https://staging.example.com' }, personas: { owner: { from: 'env:OWNER' } } },
    prod: { target: { url: 'https://example.com' }, class: 'production_observation' },
    canary: { target: { url: 'https://canary.example.com' }, class: 'deployed_canary', personas: { owner: { from: 'env:OWNER' } } },
    badprod: { target: { url: 'https://example.com' }, class: 'production_observation', writes: 'owned_namespace' },
    hosted: { target: { url: 'https://staging.example.com' }, personas: { owner: { from: 'host_issued' } } },
  } } as never;
  it('defaults the class and its policy from the target', () => {
    expect(resolveEnvironment(config, 'local')).toMatchObject({ kind: 'launch', class: 'isolated_candidate', writes: 'owned_namespace', agents: 'allow', implicit: true });
    expect(resolveEnvironment(config, 'staging')).toMatchObject({ kind: 'url', class: 'deployed_preview', writes: 'owned_namespace', agents: 'ask' });
    expect(resolveEnvironment(config, 'prod')).toMatchObject({ writes: 'none', agents: 'deny' });
    expect(environmentNames(config)[0]).toBe('local');
  });
  it('refuses configs that loosen a class policy', () => {
    expect(blockedCodes(() => resolveEnvironment(config, 'badprod'))).toEqual(['invalid_environment']);
    expect(blockedCodes(() => resolveEnvironment(config, 'canary'))).toEqual(['invalid_environment']);
    expect(blockedCodes(() => resolveEnvironment(config, 'hosted'))).toEqual(['invalid_environment']);
    expect(blockedCodes(() => resolveEnvironment(config, 'nope'))).toEqual(['unknown_environment']);
  });
  it('selects flag over TRACEGROVE_ENV over settings over local', () => {
    expect(selectEnvironment({ flag: 'a', env: { TRACEGROVE_ENV: 'b' }, settings: { env: 'c' } })).toEqual({ name: 'a', source: 'flag' });
    expect(selectEnvironment({ env: { TRACEGROVE_ENV: 'b' }, settings: { env: 'c' } })).toEqual({ name: 'b', source: 'TRACEGROVE_ENV' });
    expect(selectEnvironment({ env: {}, settings: { env: 'c' } })).toEqual({ name: 'c', source: 'settings' });
    expect(selectEnvironment({ env: {} })).toEqual({ name: 'local', source: 'default' });
    expect(flowEnabledIn({}, 'staging')).toBe(false);
    expect(flowEnabledIn({ envs: ['staging'] }, 'staging')).toBe(true);
  });
});

describe('agent policy', () => {
  it('detects agents from their CLI markers or --agent', () => {
    expect(detectAgent({ CLAUDECODE: '1' })).toEqual({ agent: 'claude-code', source: 'CLAUDECODE' });
    expect(detectAgent({ CODEX_SANDBOX: 'seatbelt' }).agent).toBe('codex');
    expect(detectAgent({ CLAUDECODE: '0' }).agent).toBeNull();
    expect(detectAgent({}, 'my-bot')).toEqual({ agent: 'my-bot', source: '--agent' });
  });
  it('asks, accepts a single-use human approval bound to the config, and denies in production', () => {
    const root = mkdtempSync(join(tmpdir(), 'tg-agents-'));
    const staging = resolveEnvironment({ environments: { staging: { target: { url: 'https://s.example.com' } } } } as never, 'staging');
    const agent = { agent: 'claude-code', source: 'CLAUDECODE' };
    expect(enforceAgentPolicy(root, staging, { agent: null, source: null }).decision).toBe('human');
    expect(blockedCodes(() => enforceAgentPolicy(root, staging, agent))).toEqual(['approval_required']);
    expect(blockedCodes(() => grantApproval(root, staging, { identity: agent }))).toEqual(['approval_requires_human']);
    grantApproval(root, staging, { identity: { agent: null, source: null } });
    const changed = resolveEnvironment({ environments: { staging: { target: { url: 'https://s.example.com' }, writes: 'none' } } } as never, 'staging');
    expect(blockedCodes(() => enforceAgentPolicy(root, changed, agent))).toEqual(['approval_required']);
    expect(enforceAgentPolicy(root, staging, agent).decision).toBe('approved');
    expect(blockedCodes(() => enforceAgentPolicy(root, staging, agent))).toEqual(['approval_required']);
    const prod = resolveEnvironment({ environments: { prod: { target: { url: 'https://p.example.com' }, class: 'production_observation' } } } as never, 'prod');
    expect(blockedCodes(() => enforceAgentPolicy(root, prod, agent))).toEqual(['agent_policy_denied']);
  });
});

describe('config edits', () => {
  const file = () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-config-'));
    const path = join(dir, 'tracegrove.config.yaml');
    writeFileSync(path, '# project header comment\nproject: demo\napp:\n  adapter: node\n  entry: app.mjs # the entry\npersonas:\n  owner: { subject: alice }\n');
    return path;
  };
  it('sets a value, keeps comments, and supports dry runs', () => {
    const path = file();
    const dry = configSet(path, 'environments.staging.target.url', 'https://staging.example.com', { dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, changed: true, written: false });
    expect(dry.diff).toContain('+');
    expect(readFileSync(path, 'utf8')).not.toContain('staging');
    configSet(path, 'environments.staging.target.url', 'https://staging.example.com');
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('# project header comment');
    expect(text).toContain('# the entry');
    expect(configGet(path, 'environments.staging.target.url').value).toBe('https://staging.example.com');
  });
  it('rejects edits that fail the config schema and leaves the file alone', () => {
    const path = file();
    const before = readFileSync(path, 'utf8');
    expect(blockedCodes(() => configSet(path, 'environments.staging.class', 'nonsense'))).toContain('config_edit_invalid');
    expect(blockedCodes(() => configSet(path, 'bad path!', 1))).toEqual(['invalid_config_path']);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
  it('applies merge patches and env add shortcuts', () => {
    const path = file();
    configPatch(path, envAddPatch({ name: 'staging', url: 'https://staging.example.com', personas: ['owner=aws-sm://app/personas#owner'], agents: 'ask', whoami: '/me#user.id' }));
    expect(configGet(path, 'environments.staging').value).toEqual({ target: { url: 'https://staging.example.com' }, agents: 'ask', personas: { owner: { from: 'aws-sm://app/personas#owner' } }, whoami: { GET: '/me', subject: 'user.id' } });
    configPatch(path, { environments: { staging: { agents: null } } });
    expect(configGet(path, 'environments.staging.agents').value).toBeNull();
    expect(readFileSync(path, 'utf8')).toContain('# project header comment');
    expect(parseValue('{ kind: bearer }')).toEqual({ kind: 'bearer' });
    expect(parseValue('true')).toBe(true);
  });
});

describe('CLI arguments for environments', () => {
  it('parses positionals, repeatable personas and --env', () => {
    const parsed = parseArgs(['env', 'add', 'staging', '--url', 'https://s.example.com', '--persona', 'owner=env:A', '--persona', 'stranger=env:B', '--dry-run']);
    expect(parsed.command).toBe('env');
    expect((parsed.flags as Record<string, unknown>).persona).toEqual(['owner=env:A', 'stranger=env:B']);
    expect(parseArgs(['test', '--env', 'staging', '--agent', 'ci-bot']).flags).toMatchObject({ env: 'staging', agent: 'ci-bot' });
  });
});

describe('runs against standalone deployments', () => {
  const procs: ChildProcess[] = [];
  let project = '';
  let fakes = '';
  let previewOrigin = '';
  const secrets = { owner: 'stg_owner_test_secret_value_1', stranger: 'stg_stranger_test_secret_value_2' };
  const saved = { ...process.env };

  const startApp = async (extra: Record<string, string>) => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), 'tg-app-'));
    procs.push(spawn(process.execPath, [join(EXAMPLE, 'app/app.mjs')], { stdio: 'ignore', env: { PATH: process.env.PATH, PORT: String(port), NOTES_DIR: dir,
      NOTES_TOKENS: JSON.stringify({ [secrets.owner]: 'alice', [secrets.stranger]: 'bob' }), NOTES_INTROSPECT_URL: `${fakes}/introspect`, ...extra } }));
    await waitUp(`http://127.0.0.1:${port}`);
    return `http://127.0.0.1:${port}`;
  };
  const waitUp = async (origin: string) => {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`${origin}/health`)).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 50)); }
    throw new Error(`${origin} did not start`);
  };

  beforeAll(async () => {
    const fakesPort = await freePort();
    fakes = `http://127.0.0.1:${fakesPort}`;
    const state = mkdtempSync(join(tmpdir(), 'tg-fakes-'));
    procs.push(spawn(process.execPath, [join(EXAMPLE, 'fakes/identity.mjs')], { stdio: 'ignore', env: { PATH: process.env.PATH, FAKES_PORT: String(fakesPort), FAKES_STATE: state, BROKER_GRANT: 'oxk_grant_for_tests' } }));
    await waitUp(fakes);
    const staging = await startApp({ NOTES_BUILD: '2026.10.19-rc1' });
    const flaky = await startApp({ NOTES_BUILD: 'rc2', NOTES_DELETE_MODE: 'ignore' });
    project = mkdtempSync(join(tmpdir(), 'tg-staging-'));
    cpSync(join(EXAMPLE, 'tracegrove'), join(project, 'tracegrove'), { recursive: true });
    cpSync(join(EXAMPLE, 'app'), join(project, 'app'), { recursive: true });
    const personas = '    personas:\n      owner: { from: "env:TG_TEST_OWNER" }\n      stranger: { from: "env:TG_TEST_STRANGER" }\n';
    writeFileSync(join(project, 'tracegrove.config.yaml'), [
      'project: staging-notes', 'app:', '  adapter: node', '  entry: app/app.mjs', '  health: /health', '  sources: [app/**]', '  inject: { port: PORT, dataDir: NOTES_DIR, tokens: NOTES_TOKENS }',
      'personas:', '  owner: { subject: alice }', '  stranger: { subject: bob }', 'environments:',
      '  staging:', `    target: { url: "${staging}", health: /health, release: { field: build, expect: "2026.10.19-rc1" } }`, '    whoami: { GET: /me, subject: user.id }', personas.trimEnd(),
      '  staging-rotated:', `    target: { url: "${staging}", health: /health }`, '    whoami: { GET: /me, subject: user.id }',
      '    personas:\n      owner: { from: "env:TG_TEST_OWNER" }\n      stranger: { from: "env:TG_TEST_OWNER" }',
      '  staging-wrong-release:', `    target: { url: "${staging}", health: /health, release: { field: build, expect: "2026.10.18" } }`, personas.trimEnd(),
      '  staging-flaky:', `    target: { url: "${flaky}", health: /health }`, '    whoami: { GET: /me, subject: user.id }', personas.trimEnd(),
      '  staging-broker:', `    target: { url: "${staging}", health: /health }`, '    whoami: { GET: /me, subject: user.id }', `    network: { allow: ["127.0.0.1:${fakesPort}"] }`,
      '    personas:\n      owner: { from: "orgx-broker://staging?role=owner&ttl=600" }\n      stranger: { from: "orgx-broker://staging?role=member&ttl=600" }',
      '  preview:', '    target: { url: env:TG_PREVIEW_URL, health: /health, release: { field: build, expect: env:TG_PREVIEW_RELEASE } }', '    whoami: { GET: /me, subject: user.id }', personas.trimEnd(),
      '  prod-readonly:', `    target: { url: "${staging}", health: /health }`, '    class: production_observation', '    personas:\n      owner: { from: "env:TG_TEST_OWNER" }', '',
    ].join('\n'));
    for (const flow of ['tenant-isolation', 'read-only']) {
      const path = join(project, 'tracegrove/notes', `${flow}.flow.yaml`);
      writeFileSync(path, readFileSync(path, 'utf8').replace(/^envs: .*$/m, 'envs: [local, staging, staging-rotated, staging-wrong-release, staging-flaky, staging-broker, prod-readonly, preview]'));
    }
    previewOrigin = staging;
    Object.assign(process.env, { TG_TEST_OWNER: secrets.owner, TG_TEST_STRANGER: secrets.stranger, TRACEGROVE_ORGX_BROKER_URL: fakes, TRACEGROVE_ORGX_TOKEN: 'oxk_grant_for_tests' });
  }, 60_000);
  afterAll(() => { for (const p of procs) p.kill(); process.env = saved; if (project) rmSync(project, { recursive: true, force: true }); });

  const human = { agent: null, source: null };
  const configPath = () => join(project, 'tracegrove.config.yaml');
  const allFiles = (dir: string): string[] => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? allFiles(p) : [p]; });

  it('compiles a url binding with references only', () => {
    const compiled = compileProject(configPath(), { env: 'staging' });
    expect(compiled.environment).toMatchObject({ name: 'staging', class: 'deployed_preview' });
    const text = allFiles(compiled.compiledDir).map(f => readFileSync(f, 'utf8')).join('\n');
    expect(text).toContain('env:TG_TEST_OWNER');
    expect(text).not.toContain(secrets.owner);
  });

  it('passes on staging with readback, a stranger negative and confirmed cleanup, and leaks nothing', async () => {
    const { report } = await runTests({ configPath: configPath(), env: 'staging', grep: 'tenant', agent: human });
    expect(report.outcome).toBe('passed');
    expect(report.exitCode).toBe(0);
    expect(report.environment).toMatchObject({ name: 'staging', class: 'deployed_preview', expectedRelease: '2026.10.19-rc1' });
    expect(verifyBundle(join(report.runDir, 'bundle')).ok).toBe(true);
    const everything = allFiles(join(project, '.tracegrove')).map(f => readFileSync(f).toString('latin1')).join('\n');
    expect(everything).not.toContain(secrets.owner);
    expect(everything).not.toContain(secrets.stranger);
  }, 60_000);

  it('blocks when two personas sign in as the same subject', async () => {
    const { report } = await runTests({ configPath: configPath(), env: 'staging-rotated', grep: 'tenant', agent: human });
    expect(report.outcome).toBe('blocked');
    expect(report.exitCode).toBe(2);
    expect(JSON.stringify(report)).toMatch(/persona_identity_(mismatch|collision)/);
  }, 60_000);

  it('runs a per-PR preview whose URL and release arrive in environment variables', async () => {
    delete process.env.TG_PREVIEW_URL;
    await expect(runTests({ configPath: configPath(), env: 'preview', grep: 'tenant', agent: human })).rejects.toSatisfy((e: unknown) => e instanceof Blocked && e.reasons[0]!.code === 'environment_value_missing');
    Object.assign(process.env, { TG_PREVIEW_URL: previewOrigin, TG_PREVIEW_RELEASE: '2026.10.19-rc1' });
    const { report } = await runTests({ configPath: configPath(), env: 'preview', grep: 'tenant', agent: human });
    expect(report.outcome).toBe('passed');
    expect(report.environment).toMatchObject({ name: 'preview', class: 'deployed_preview', expectedRelease: '2026.10.19-rc1' });
    process.env.TG_PREVIEW_RELEASE = 'some-other-sha';
    const stale = await runTests({ configPath: configPath(), env: 'preview', grep: 'tenant', agent: human });
    expect(stale.report.exitCode).toBe(2);
    expect(JSON.stringify(stale.report)).toContain('identity_mismatch');
  }, 90_000);

  it('blocks when the deployment is not the expected release', async () => {
    const { report } = await runTests({ configPath: configPath(), env: 'staging-wrong-release', grep: 'tenant', agent: human });
    expect(report.exitCode).toBe(2);
    expect(JSON.stringify(report)).toContain('identity_mismatch');
  }, 60_000);

  it('fails a deployed run whose cleanup cannot be confirmed', async () => {
    const { report } = await runTests({ configPath: configPath(), env: 'staging-flaky', grep: 'tenant', agent: human });
    expect(report.outcome).toBe('assertion_failed');
    expect(report.exitCode).toBe(1);
    expect(JSON.stringify(report)).toContain('deployed_cleanup_unconfirmed');
    expect(verifyBundle(join(report.runDir, 'bundle')).ok).toBe(true);
  }, 60_000);

  it('passes with broker-minted personas and does not pass when the owner is revoked mid-run', async () => {
    const ok = await runTests({ configPath: configPath(), env: 'staging-broker', grep: 'tenant', agent: human });
    expect(ok.report.outcome).toBe('passed');
    await fetch(`${fakes}/__control`, { method: 'POST', body: JSON.stringify({ revokeOwnerAfter: 2 }) });
    const revoked = await runTests({ configPath: configPath(), env: 'staging-broker', grep: 'tenant', agent: human });
    await fetch(`${fakes}/__control`, { method: 'POST', body: JSON.stringify({ revokeOwnerAfter: 0 }) });
    expect(revoked.report.outcome).not.toBe('passed');
    expect(JSON.stringify(revoked.report)).toContain('persona_credential_expired');
  }, 60_000);

  it('blocks writing flows on production observation and passes read-only ones', async () => {
    const writing = await runTests({ configPath: configPath(), env: 'prod-readonly', grep: 'tenant', agent: human });
    expect(writing.report.exitCode).toBe(2);
    expect(JSON.stringify(writing.report)).toContain('environment_writes_forbidden');
    const reading = await runTests({ configPath: configPath(), env: 'prod-readonly', grep: 'signed-in owner', agent: human });
    expect(reading.report.outcome).toBe('passed');
  }, 60_000);

  it('makes an agent ask for approval on staging, then runs once a person approves', async () => {
    const agent = { agent: 'claude-code', source: 'CLAUDECODE' };
    await expect(runTests({ configPath: configPath(), env: 'staging', grep: 'signed-in owner', agent })).rejects.toSatisfy((e: unknown) => e instanceof Blocked && e.reasons[0]!.code === 'approval_required');
    grantApproval(project, resolveEnvironment(loadAuthoringConfig(configPath()), 'staging'), { identity: human });
    const { report } = await runTests({ configPath: configPath(), env: 'staging', grep: 'signed-in owner', agent });
    expect(report.outcome).toBe('passed');
    expect(report.environment?.agent).toMatchObject({ name: 'claude-code', policy: 'ask', decision: 'approved' });
  }, 60_000);

  it('doctor proves identities, explain and capabilities describe the environment', async () => {
    const ready = await runEnvDoctor({ configPath: configPath(), env: 'staging' });
    expect(ready.status).toBe('ready');
    const rotated = await runEnvDoctor({ configPath: configPath(), env: 'staging-rotated' });
    expect(rotated.status).toBe('blocked');
    expect(rotated.checks.some(c => c.code.startsWith('persona_identity'))).toBe(true);
    expect(existsSync(join(project, '.tracegrove/doctor/staging.json'))).toBe(true);
    const plan = explain(configPath(), { env: 'prod-readonly' });
    expect(plan.schemaVersion).toBe('tracegrove.explain/v1');
    expect(plan.blockers.map(b => b.code).concat(plan.cells.flatMap(c => c.blockers.map(b => b.code)))).toContain('environment_writes_forbidden');
    expect(envList(configPath()).environments.map(e => e.name)).toContain('staging-broker');
    expect(capabilityMatrix(configPath()).schemaVersion).toBe('tracegrove.capabilities/v1');
  }, 60_000);
});
