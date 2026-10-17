import { afterEach, expect, it } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTemps, sampleCopy } from '../conformance/helpers.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { HostPlan, IdentityAttestation, RuntimeObservation, freeze } from '../src/protocol/index.ts';
import { LocalProcessHost } from '../src/hosts/local.ts';
import { observeApplicationRuntime, parseRuntimeVersion } from '../src/hosts/runtime.ts';

afterEach(cleanupTemps);
it('observes the launched Node executable independently of its command spelling', async () => {
  const observation = await observeApplicationRuntime(process.execPath, process.cwd(), process.env.PATH ?? '');
  expect(observation.runtime).toBe(`node${process.versions.node.split('.')[0]}`);
  expect(observation.version).toBe(process.versions.node);
  expect(observation.executable).toBe(process.execPath);
  expect(observation.executableSha256).toMatch(/^[a-f0-9]{64}$/);
});
it.each(['', 'v22.1.0\nprivate output', 'Python 3.13', 'ruby 3.1.0', 'Python 3.13.2\nPython 3.14.0'])('refuses ambiguous or unsupported runtime output %j', output => {
  expect(() => parseRuntimeVersion(output)).toThrow(/application_runtime_unrecognized/);
});
it('blocks a missing executable before app launch', async () => {
  await expect(observeApplicationRuntime('tracegrove-missing-interpreter', process.cwd(), '')).rejects.toThrow(/launch_executable_missing/);
});
it('attests a real Python API as Python and acknowledges its owned cleanup', async () => {
  const copy = sampleCopy(); const project = loadProject(copy.configPath);
  const base = project.corpus.getAs(HostPlan, project.fileRefs.get('./hosts/local-process.yaml')!);
  const script = join(copy.root, 'app', 'python_health.py');
  writeFileSync(script, `from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{}')
    def log_message(self, *args):
        pass
server = HTTPServer(('127.0.0.1', 0), Handler)
print('listening ' + str(server.server_port), flush=True)
server.serve_forever()
`);
  const runtime = await observeApplicationRuntime('python3', copy.root, process.env.PATH ?? '');
  const hostPlan = freeze({ ...base, launch: { ...base.launch!, command: runtime.executable,
    args: ['-u', 'app/python_health.py'], identitySourceFiles: ['app/python_health.py'], issuedCredentials: [] } });
  const workspaceDir = join(copy.stateDir, 'python-host');
  const scope = localScope();
  const session = await new LocalProcessHost().start({ hostPlan, projectRoot: project.root, workspaceDir, scope,
    campaignId: 'campaign.python', executionId: 'exec.python', attemptId: 'attempt.python', generation: 1,
    actorId: scope.ownerId, credentialNames: [], signal: new AbortController().signal, mockResponses: null });
  try {
    expect(session.attestations[0]!.identity).toMatchObject({ runtime: runtime.runtime });
    expect(session.attestations[0]!.evidence).toMatchObject({ runtimeProbe: runtime });
    expect(runtime.family).toBe('python');
    const attestation = structuredClone(session.attestations[0]!);
    expect(RuntimeObservation.safeParse({ ...runtime, runtime: 'node22' }).success).toBe(false);
    if (attestation.identity.kind !== 'source_digest') throw new Error('missing source identity');
    expect(IdentityAttestation.safeParse({ ...attestation, identity: { ...attestation.identity, runtime: 'node22' } }).success).toBe(false);
    const { runtimeProbe: _probe, ...withoutProbe } = attestation.evidence;
    expect(IdentityAttestation.safeParse({ ...attestation, evidence: withoutProbe }).success).toBe(false);
    expect((await fetch(session.origin + '/health')).status).toBe(200);
  } finally {
    expect((await session.stop('python conformance')).confirmed).toBe(true);
  }
  expect(existsSync(workspaceDir)).toBe(false);
});
