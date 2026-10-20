import { z } from 'zod';
import { JsonValue, NonNegInt } from '../primitives.ts';

/**
 * A scripted conversation with a voice agent or chatbot on the launched application origin.
 * The runner plays the caller; every turn's reply, tool calls and timing become one observation.
 * It proves what the agent said and did over its own protocol, not what a phone network delivered.
 */
export const ConversationChannel = z.enum(['voice', 'chat']);
export const ConversationTransport = z.enum(['rtvi', 'http_chat']);
const FieldPath = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/);

export const ConversationTurn = z.object({
  say: z.string().min(1).max(2000),
}).strict();

export const ConversationRun = z.object({
  channel: ConversationChannel,
  transport: ConversationTransport,
  endpoint: z.string().min(1).max(512).regex(/^\/(?!\/)[A-Za-z0-9_./-]*$/),
  turns: z.array(ConversationTurn).min(1).max(20),
  /** http_chat: field names in the request and response bodies. */
  messageField: FieldPath.default('message'),
  sessionField: FieldPath.default('sessionId'),
  replyPath: FieldPath.default('reply'),
  toolsPath: FieldPath.default('toolCalls'),
  /** rtvi: quiet time after the last agent message that ends a turn when no stop event arrives. */
  settleMs: z.number().int().min(50).max(10_000).default(800),
  turnTimeoutMs: z.number().int().min(100).max(60_000).default(10_000),
}).strict();
export type ConversationRun = z.infer<typeof ConversationRun>;
export type ConversationRunInput = z.input<typeof ConversationRun>;

export const ConversationToolCall = z.object({
  name: z.string().min(1).max(128),
  arguments: JsonValue,
  result: JsonValue,
  /** Characters of reply text the agent had produced when it started this call (RTVI only): 0 means it called before saying anything. */
  spokenBefore: NonNegInt.optional(),
}).strict();
export type ConversationToolCall = z.infer<typeof ConversationToolCall>;

export const ConversationTurnObservation = z.object({
  index: NonNegInt,
  say: z.string().max(2000),
  reply: z.string().max(8000),
  /** Milliseconds from the caller's message to the agent's first sign of a reply. */
  firstReplyMs: NonNegInt.nullable(),
  durationMs: NonNegInt,
  toolCalls: z.array(ConversationToolCall).max(16),
  toolNames: z.array(z.string().max(128)).max(16),
  /** How the turn ended: an explicit stop event, quiet time, or the turn deadline. */
  ended: z.enum(['stopped', 'settled', 'response', 'timeout']),
}).strict();

export const ConversationObservation = z.object({
  kind: z.literal('conversation'),
  channel: ConversationChannel,
  transport: ConversationTransport,
  endpoint: z.string().max(512),
  sessionId: z.string().max(128),
  turns: z.array(ConversationTurnObservation).max(20),
  transcript: z.string().max(64_000),
  replies: z.string().max(64_000),
  toolCalls: z.array(ConversationToolCall).max(64),
  toolNames: z.array(z.string().max(128)).max(64),
  maxFirstReplyMs: NonNegInt.nullable(),
  durationMs: NonNegInt,
  attempts: z.literal(1),
}).strict();
export type ConversationObservation = z.infer<typeof ConversationObservation>;
