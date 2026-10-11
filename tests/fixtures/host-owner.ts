import { loadProject, localScope } from '../../src/core/corpus.ts';
import { HostPlan, freeze } from '../../src/protocol/index.ts';
import { LocalProcessHost } from '../../src/hosts/local.ts';

const [configPath, workspaceDir, pidPath] = process.argv.slice(2);
if (!configPath || !workspaceDir || !pidPath) throw new Error('missing test paths');
const project = loadProject(configPath);
const base = project.corpus.getAs(HostPlan, project.fileRefs.get('./hosts/local-process.yaml')!);
const program = `
  const { createServer } = require('node:http');
  require('node:fs').writeFileSync(process.argv[1], String(process.pid));
  const server = createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end('{}'); });
  server.listen(0, '127.0.0.1', () => console.log('listening ' + server.address().port));
`;
const hostPlan = freeze({ ...base, launch: { ...base.launch!, command: process.execPath, args: ['-e', program, pidPath] } });
const session = await new LocalProcessHost().start({
  hostPlan, projectRoot: project.root, workspaceDir, scope: localScope(), campaignId: 'campaign.crash',
  executionId: 'exec.crash', attemptId: 'attempt.crash', generation: 1, actorId: localScope().ownerId,
  credentialNames: [], signal: new AbortController().signal, mockResponses: null,
});
process.send?.({ supervisorPid: session.lease.observedRuntimeIdentity.pid });
setInterval(() => {}, 1000);
