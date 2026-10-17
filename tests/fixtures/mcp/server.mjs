/** Owned synthetic MCP peer. No arbitrary command, socket, filesystem tool or credentials. */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const root = process.env.FIXTURE_ROOT;
const record = event => appendFileSync(join(root, 'server-events.jsonl'), JSON.stringify(event) + '\n');
writeFileSync(join(root, 'server-pid.json'), JSON.stringify({ pid: process.pid, environmentKeys: Object.keys(process.env).sort() }));
const server = new Server({ name: 'tracegrove-owned-conformance', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ['echo', 'tool-error', 'wait', 'disconnect', 'overflow'].map(name =>
  ({ name, inputSchema: { type: 'object', properties: { text: { type: 'string' } } } })) }));
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const name = request.params.name;
  record({ kind: 'request', requestId: extra.requestId, name });
  if (name === 'disconnect') { process.exit(0); }
  if (name === 'tool-error') return { content: [{ type: 'text', text: 'synthetic tool rejection' }], isError: true };
  if (name === 'overflow') return { content: [{ type: 'text', text: 'x'.repeat(40_000) }] };
  if (name === 'wait') {
    await new Promise(resolve => {
      const token = request.params._meta?.progressToken;
      const progress = async () => {
        if (token !== undefined) await extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: ++count } });
      };
      let count = 0;
      const interval = setInterval(() => { progress().catch(() => {}); }, 20);
      const stop = () => { clearInterval(interval); record({ kind: 'cancel_observed', requestId: extra.requestId }); resolve(); };
      extra.signal.addEventListener('abort', stop, { once: true });
      if (extra.signal.aborted) stop();
    });
    return { content: [{ type: 'text', text: 'cancelled fixture work' }], isError: true };
  }
  return { content: [{ type: 'text', text: String(request.params.arguments?.text ?? '') }] };
});
const transport = new StdioServerTransport();
process.stdin.once('end', () => { record({ kind: 'stdin_closed' }); process.exit(0); });
process.on('SIGTERM', () => { record({ kind: 'terminated' }); process.exit(0); });
await server.connect(transport);
