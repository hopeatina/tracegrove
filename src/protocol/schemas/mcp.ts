import { z } from 'zod';
import { JsonValue, NonNegInt } from '../primitives.ts';

export const McpToolCall = z.object({
  endpoint: z.string().min(1).max(512).regex(/^\/(?!\/)[A-Za-z0-9_./-]*$/),
  tool: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.-]+$/),
  arguments: z.record(z.string().max(128), JsonValue),
}).strict();
export type McpToolCall = z.infer<typeof McpToolCall>;

/** Protocol observations do not attest an actual widget host or approve a tool's effects. */
export const McpToolObservation = z.object({
  kind: z.literal('mcp_tool'), endpoint: McpToolCall.shape.endpoint, tool: McpToolCall.shape.tool,
  protocolVersion: z.string().min(1).max(32),
  server: z.object({ name: z.string().min(1).max(256), version: z.string().min(1).max(128) }).strict(),
  isError: z.boolean(), content: z.array(JsonValue).max(128), structuredContent: JsonValue.nullable(),
  durationMs: NonNegInt, attempts: z.literal(1),
}).strict();
export type McpToolObservation = z.infer<typeof McpToolObservation>;
