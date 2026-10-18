import { RunnerCapabilities, digestOfValue, parseAs } from '../../protocol/index.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../http/capabilities.ts';
import { createRequire } from 'node:module';

export function mcpSdkAvailable(): boolean {
  try { createRequire(import.meta.url).resolve('@modelcontextprotocol/sdk/client/streamableHttp.js'); return true; }
  catch { return false; }
}

const ref = { id: 'tracegrove.runner.mcp', revision: '0.1.0' };
const capabilities = { ...HTTP_RUNNER_CAPABILITIES, operations: [...HTTP_RUNNER_CAPABILITIES.operations, 'mcp.call'],
  oracles: [...HTTP_RUNNER_CAPABILITIES.oracles, 'mcp.observation/1'], protocol: 'mcp' as const };
export const MCP_RUNNER_CAPABILITIES = parseAs(RunnerCapabilities,
  { ...capabilities, ref: { ...ref, digest: digestOfValue({ ...capabilities, ref }) } }, 'MCP runner');
