import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DockerClient } from '../containers/dockerClient.mjs';
import { ContainerQualification } from '../containers/contracts.mjs';

const roots = []; const clients = [];
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-client-test-')); roots.push(root);
  const original = join(root, 'original'); mkdirSync(original);
  const bytes = JSON.stringify({ credsStore: 'desktop', auths: { 'private.example': { auth: 'fake-private-fixture' } } });
  writeFileSync(join(original, 'config.json'), bytes);
  const environment = { DOCKER_CONFIG: original, DOCKER_CONTEXT: 'desktop-linux', DOCKER_HOST: 'tcp://ignored-because-context-wins:1234', PATH: process.env.PATH };
  const probe = (args, env) => {
    if (args[0] === 'context') return 'unix:///tmp/observed-docker.sock';
    if (args.at(-1).includes('Plugins')) return '/opt/docker/cli-plugins/docker-buildx';
    expect(env.DOCKER_HOST === 'unix:///tmp/observed-docker.sock' || env.DOCKER_CONTEXT === 'desktop-linux').toBe(true);
    return 'same-daemon';
  };
  return { root, original, bytes, environment, probe };
}
it('keeps default Docker credential and context behavior without probing or allocating a configuration', () => {
  const f = fixture(); const client = new DockerClient(f.root, false, { environment: f.environment, temporaryRoot: f.root, probe: () => { throw new Error('Unexpected probe'); } }); clients.push(client);
  expect(client.environment).toEqual(f.environment); expect(client.environment).not.toBe(f.environment);
  expect(Object.isFrozen(client.environment)).toBe(true); expect(client.metadata).toEqual({ mode: 'default', daemonId: null, temporaryConfigRemoved: true });
  expect(readdirSync(f.root)).toEqual(['original']);
});
it('uses an anonymous configuration on the observed local daemon and cleans only its own directory', () => {
  const f = fixture(); const client = new DockerClient(f.root, true, { environment: f.environment, temporaryRoot: f.root, probe: f.probe }); clients.push(client);
  const owned = client.environment.DOCKER_CONFIG;
  expect(client.environment.DOCKER_CONTEXT).toBeUndefined(); expect(client.environment.DOCKER_HOST).toBe('unix:///tmp/observed-docker.sock');
  expect(JSON.parse(readFileSync(join(owned, 'config.json'), 'utf8'))).toEqual({ auths: {}, cliPluginsExtraDirs: ['/opt/docker/cli-plugins'] });
  expect(client.metadata).toEqual({ mode: 'anonymous_public_registry', daemonId: 'same-daemon', temporaryConfigRemoved: false });
  client.dispose(); client.dispose(); expect(existsSync(owned)).toBe(false);
  expect(() => client.run(['info'])).toThrow('disposed');
  expect(client.metadata.temporaryConfigRemoved).toBe(true); expect(readFileSync(join(f.original, 'config.json'), 'utf8')).toBe(f.bytes);
  expect(f.environment.DOCKER_CONFIG).toBe(f.original); expect(f.environment.DOCKER_CONTEXT).toBe('desktop-linux');
});
it('refuses a remote endpoint and daemon substitution without leaving temporary configuration or touching credentials', () => {
  const f = fixture();
  expect(() => new DockerClient(f.root, true, { environment: { DOCKER_HOST: 'tcp://remote:2376' }, temporaryRoot: f.root, probe: f.probe })).toThrow('local Unix');
  expect(() => new DockerClient(f.root, true, { environment: f.environment, temporaryRoot: f.root, probe: (args, env) => {
    if (args[0] === 'info' && args.at(-1) === '{{.ID}}' && env.DOCKER_CONFIG !== f.original) return 'different-daemon';
    return f.probe(args, env);
  } })).toThrow('different Docker daemon');
  expect(readdirSync(f.root)).toEqual(['original']); expect(readFileSync(join(f.original, 'config.json'), 'utf8')).toBe(f.bytes);
});
it('requires configuration cleanup and daemon identity before admitting a passing anonymous receipt', () => {
  const receipt = { schemaVersion: 'container.qualification/v1', profile: 'native-real', imageId: `sha256:${'1'.repeat(64)}`, containerId: '2'.repeat(64),
    runId: '00000000-0000-4000-8000-000000000001', containerRemoved: true, runtimeExitCode: 0, state: 'passed', output: '/evidence', boundary: 'local container',
    hostVerification: { ok: true, outcome: 'passed' }, dockerClient: { mode: 'anonymous_public_registry', daemonId: 'same-daemon', temporaryConfigRemoved: true } };
  expect(ContainerQualification.safeParse(receipt).success).toBe(true);
  expect(ContainerQualification.safeParse({ ...receipt, dockerClient: { ...receipt.dockerClient, temporaryConfigRemoved: false } }).success).toBe(false);
  expect(ContainerQualification.safeParse({ ...receipt, dockerClient: { ...receipt.dockerClient, daemonId: null } }).success).toBe(false);
  const { dockerClient, ...legacy } = receipt; expect(ContainerQualification.safeParse(legacy).success).toBe(true);
});
