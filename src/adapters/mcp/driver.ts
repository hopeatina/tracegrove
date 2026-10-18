import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { McpToolCall, McpToolObservation } from '../../protocol/index.ts';
import type { Deadline } from '../../core/deadline.ts';
import { monotonicMs } from '../../core/clock.ts';
import { HttpStepError } from '../http/driver.ts';

export const MAX_MCP_BYTES = 65_536;

/** One admitted call, no discovery effects, fallback transport, OAuth flow or retry. */
export class McpDriver {
  constructor(private readonly origin: string, private readonly fetcher: typeof fetch = fetch) {}
  async call(raw: McpToolCall, credential: string | null, deadline: Deadline, parent: AbortSignal): Promise<McpToolObservation> {
    const command = McpToolCall.parse(raw);
    const endpoint = new URL(command.endpoint, this.origin);
    if (endpoint.origin !== this.origin || endpoint.pathname !== command.endpoint) throw new HttpStepError('mcp_endpoint_invalid', 'MCP endpoint must stay on the admitted application origin');
    if (Buffer.byteLength(JSON.stringify(command.arguments)) > MAX_MCP_BYTES) throw new HttpStepError('mcp_request_too_large', 'MCP arguments exceed the admitted protocol limit');
    const signal = deadline.signal(parent); const started = monotonicMs();
    const client = new Client({ name: 'tracegrove', version: '0.2.0' }, { capabilities: {} });
    let exceeded = false;
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { ...(credential ? { headers: { authorization: `Bearer ${credential}` } } : {}), redirect: 'error' },
      reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1, maxReconnectionDelay: 1, reconnectionDelayGrowFactor: 1 },
      fetch: async (url, init) => {
        if (new URL(String(url)).href !== endpoint.href) throw new Error('MCP request left its endpoint');
        if (typeof init?.body === 'string' && Buffer.byteLength(init.body) > MAX_MCP_BYTES) throw new HttpStepError('mcp_request_too_large', 'MCP wire request exceeds the protocol limit');
        const response = await this.fetcher(url, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
        if (!response.body) return response;
        let bytes = 0;
        const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > MAX_MCP_BYTES) { exceeded = true; throw new Error('MCP response exceeds limit'); }
          controller.enqueue(chunk);
        } }));
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      },
    });
    try {
      const options = { signal, timeout: Math.max(1, deadline.remainingMs()) };
      // SDK 1.32's sessionId getter includes undefined; its Transport declaration omits it.
      await client.connect(transport as Parameters<Client['connect']>[0], options);
      const server = client.getServerVersion();
      if (!client.getServerCapabilities()?.tools || !server || !transport.protocolVersion) throw new HttpStepError('mcp_capability_missing', 'Server did not establish tool capability and protocol identity');
      const result = await client.callTool({ name: command.tool, arguments: command.arguments }, undefined, { signal, timeout: Math.max(1, deadline.remainingMs()) });
      const observation = McpToolObservation.parse({ kind: 'mcp_tool', endpoint: command.endpoint, tool: command.tool,
        protocolVersion: transport.protocolVersion, server: { name: server.name, version: server.version },
        isError: result.isError ?? false, content: result.content, structuredContent: result.structuredContent ?? null,
        durationMs: Math.round(monotonicMs() - started), attempts: 1 });
      const serialized = JSON.stringify(observation);
      if (Buffer.byteLength(serialized) > MAX_MCP_BYTES) throw new HttpStepError('mcp_response_invalid', 'MCP observation exceeds the protocol limit');
      if (credential && serialized.includes(JSON.stringify(credential).slice(1, -1))) throw new HttpStepError('mcp_secret_echo', 'MCP response echoed an issued credential; observation withheld');
      return observation;
    } catch (error) {
      if (parent.aborted) throw new HttpStepError('cancelled', 'MCP call cancelled; remote side effects remain unknown');
      if (signal.aborted || deadline.expired() || (error instanceof McpError && error.code === ErrorCode.RequestTimeout)) throw new HttpStepError('deadline_exceeded', 'MCP call exceeded its deadline; remote side effects remain unknown');
      if (error instanceof HttpStepError) throw error;
      throw new HttpStepError(exceeded ? 'mcp_response_invalid' : 'mcp_protocol_failure', 'MCP protocol failed; no tool retry was attempted and remote side effects remain unknown');
    } finally { await client.close().catch(() => {}); }
  }
}
