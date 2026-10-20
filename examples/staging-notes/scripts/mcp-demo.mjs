// An MCP client driving `tracegrove mcp` over stdio the way Claude Code or Codex would:
// list tools, then env_doctor -> explain -> test against an environment, then test once more.
// Usage: node scripts/mcp-demo.mjs <env> [path/to/tracegrove/dist/cli/main.js]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const env = process.argv[2] ?? 'staging';
const cli = process.argv[3] ?? new URL('../../../dist/cli/main.js', import.meta.url).pathname;
const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--max-test-runs', '3'], cwd: process.cwd(), env: process.env, stderr: 'inherit' });
const client = new Client({ name: 'mcp-demo', version: '1.0.0' });
await client.connect(transport);
const show = (label, value) => process.stdout.write(`\n## ${label}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
const { tools } = await client.listTools();
show('tools', tools.map(t => `${t.name}${t.annotations?.readOnlyHint ? '' : ' (runs)'}: ${t.description}`).join('\n'));
const { resources } = await client.listResources();
show('resources', resources.map(r => r.uri).join('\n'));
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  return { isError: result.isError ?? false, ...(result.structuredContent ?? JSON.parse(result.content[0].text)) };
};
const doctor = await call('env_doctor', { env });
show(`env_doctor ${env}`, { status: doctor.status, exitCode: doctor.exitCode, checks: doctor.checks?.map(c => `${c.state === 'supported' ? 'ok ' : 'NO '} ${c.check}: ${c.detail}`) });
const plan = await call('explain', { env });
show(`explain ${env}`, { wouldRun: plan.wouldRun, agent: plan.agent, cells: plan.cells?.map(c => c.caseId), next: plan.next });
const first = await call('test', { env });
show(`test ${env}`, first.isError ? first : { outcome: first.outcome, exitCode: first.exitCode, environment: first.environment, totals: first.totals, bundleVerified: first.bundleVerified, runDir: first.runDir });
const second = await call('test', { env });
show(`test ${env} again (the approval was single-use)`, second.isError ? second : { outcome: second.outcome, exitCode: second.exitCode });
await client.close();
process.exitCode = first.isError || first.exitCode !== 0 ? 1 : 0;
