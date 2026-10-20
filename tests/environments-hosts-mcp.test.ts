/**
 * The container host through a fake docker CLI (proves tokens travel by environment, never argv, and
 * that the container is removed), and the `tracegrove mcp` server over an in-memory transport
 * (tools, typed results, the agent policy and call ceilings).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { runTests } from '../src/authoring/run.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { createTracegroveMcpServer, MCP_TOOLS } from '../src/mcp/server.ts';

const EXAMPLE = resolve(import.meta.dirname, '../examples/staging-notes');
const FAKE_DOCKER = resolve(import.meta.dirname, 'fixtures/fake-docker.mjs');
const human = { agent: null, source: null };
let project = '';
let dockerState = '';
const saved = { ...process.env };

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'tg-hosts-'));
  dockerState = mkdtempSync(join(tmpdir(), 'tg-docker-'));
  for (const dir of ['tracegrove', 'app']) cpSync(join(EXAMPLE, dir), join(project, dir), { recursive: true });
  writeFileSync(join(project, 'tracegrove.config.yaml'), [
    'project: staging-notes', 'app:', '  adapter: node', '  entry: app/app.mjs', '  health: /health', '  sources: [app/**]', '  inject: { port: PORT, dataDir: NOTES_DIR, tokens: NOTES_TOKENS }',
    'personas:', '  owner: { subject: alice }', '  stranger: { subject: bob }', 'environments:',
    '  docker:', '    target:', '      container: { image: "notes:dev", port: 8080, env: { NOTES_BUILD: container }, tokensEnv: NOTES_TOKENS }', '      health: /health',
    '  staging:', '    target: { url: "http://127.0.0.1:9", health: /health }', '    personas:', '      owner: { from: "env:NOPE_OWNER" }', '',
  ].join('\n'));
  Object.assign(process.env, { TRACEGROVE_DOCKER_BIN: FAKE_DOCKER, FAKE_DOCKER_STATE: dockerState, FAKE_DOCKER_APP: join(project, 'app/app.mjs') });
});
afterAll(() => { process.env = saved; rmSync(project, { recursive: true, force: true }); rmSync(dockerState, { recursive: true, force: true }); });

describe('container host', () => {
  it('runs flows against a container, passes tokens only through the client environment, and removes it', async () => {
    const { report } = await runTests({ configPath: join(project, 'tracegrove.config.yaml'), env: 'docker', grep: 'create', agent: human });
    expect(report.outcome).toBe('passed');
    expect(report.environment).toMatchObject({ name: 'docker', kind: 'container', class: 'isolated_candidate' });
    expect(verifyBundle(join(report.runDir, 'bundle')).ok).toBe(true);
    const calls = readFileSync(join(dockerState, 'argv.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]);
    const run = calls.find(args => args[0] === 'run')!;
    expect(run.slice(run.indexOf('NOTES_TOKENS') - 1, run.indexOf('NOTES_TOKENS') + 1)).toEqual(['-e', 'NOTES_TOKENS']);
    const tokens = Object.keys(JSON.parse((JSON.parse(readFileSync(join(dockerState, 'env-values.log'), 'utf8').trim().split('\n')[0]!) as string[]).find(v => v.startsWith('{'))!) as Record<string, string>);
    expect(tokens.length).toBe(2);
    for (const token of tokens) expect(calls.flat().some(arg => arg.includes(token))).toBe(false);
    expect(calls.some(args => args[0] === 'rm')).toBe(true);
    expect(readdirSync(dockerState).filter(f => f.endsWith('.json'))).toEqual([]);
  }, 60_000);
});

describe('tracegrove mcp', () => {
  const connect = async (ceilings: { maxCalls?: number; maxRuns?: number } = {}) => {
    const server = createTracegroveMcpServer({ configPath: join(project, 'tracegrove.config.yaml'), ceilings });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(clientSide);
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args }) as { structuredContent?: Record<string, unknown>; isError?: boolean };
    return { ...result.structuredContent, isError: result.isError === true } as Record<string, unknown> & { isError: boolean };
  };

  it('lists every tool and the schema and AGENTS.md resources', async () => {
    const client = await connect();
    expect((await client.listTools()).tools.map(t => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    const resources = (await client.listResources()).resources.map(r => r.uri);
    expect(resources).toContain('tracegrove://agents-md');
    expect(resources.some(uri => uri.startsWith('tracegrove://schema/'))).toBe(true);
  });

  it('returns typed results and blocked reasons with an owner and a fix', async () => {
    const client = await connect();
    expect((await call(client, 'env_list')).schemaVersion).toBe('tracegrove.env-list/v1');
    const doctor = await call(client, 'env_doctor', { env: 'staging' });
    expect(doctor).toMatchObject({ schemaVersion: 'tracegrove.env-doctor/v1', status: 'blocked' });
    const run = await call(client, 'test', { env: 'staging' });
    expect(run).toMatchObject({ isError: true, errorClass: 'blocked', exitCode: 2 });
    expect((run.reasons as Array<{ code: string; fix: string }>)[0]).toMatchObject({ code: 'approval_required', fix: 'tracegrove approve --env staging' });
  });

  it('runs a local test and enforces the run ceiling', async () => {
    const client = await connect({ maxRuns: 1 });
    const first = await call(client, 'test', { env: 'local', grep: 'signed-in owner' });
    expect(first).toMatchObject({ schemaVersion: 'tracegrove.run-summary/v1', outcome: 'passed', exitCode: 0 });
    const second = await call(client, 'test', { env: 'local', grep: 'signed-in owner' });
    expect(second).toMatchObject({ isError: true, exitCode: 2 });
    expect((second.reasons as Array<{ code: string }>)[0]!.code).toBe('budget_exceeded');
    const calls = await connect({ maxCalls: 1 });
    await call(calls, 'env_list');
    expect((await call(calls, 'env_list')).isError).toBe(true);
  }, 60_000);
});
