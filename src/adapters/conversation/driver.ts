import { randomUUID } from 'node:crypto';
import { ConversationObservation, ConversationRun, type ConversationToolCall } from '../../protocol/index.ts';
import type { Deadline } from '../../core/deadline.ts';
import { monotonicMs } from '../../core/clock.ts';
import { HttpStepError } from '../http/driver.ts';

export const MAX_CONVERSATION_BYTES = 262_144;
const MAX_REPLY = 8000;

type TurnRecord = { index: number; say: string; reply: string; firstReplyMs: number | null; durationMs: number;
  toolCalls: ConversationToolCall[]; toolNames: string[]; ended: 'stopped' | 'settled' | 'response' | 'timeout' };

/**
 * Plays the caller in one scripted conversation. No retry, no fallback transport: a conversation
 * can trigger agent tools (bookings, tickets, messages), so it runs once and records what happened.
 */
export class ConversationDriver {
  constructor(private readonly origin: string, private readonly fetcher: typeof fetch = fetch) {}

  async run(raw: unknown, credential: string | null, deadline: Deadline, parent: AbortSignal): Promise<ConversationObservation> {
    const command = ConversationRun.parse(raw);
    const endpoint = new URL(command.endpoint, this.origin);
    if (endpoint.origin !== this.origin || endpoint.pathname !== command.endpoint) throw new HttpStepError('conversation_endpoint_invalid', 'Conversation endpoint must stay on the admitted application origin');
    const signal = deadline.signal(parent);
    const started = monotonicMs();
    const sessionId = `tg-${randomUUID()}`;
    let turns: TurnRecord[];
    try {
      turns = command.transport === 'rtvi'
        ? await this.rtvi(command, endpoint, credential, sessionId, signal)
        : await this.httpChat(command, endpoint, credential, sessionId, signal);
    } catch (error) {
      if (parent.aborted) throw new HttpStepError('cancelled', 'Conversation cancelled; agent side effects remain unknown');
      if (signal.aborted || deadline.expired()) throw new HttpStepError('deadline_exceeded', 'Conversation exceeded its deadline; agent side effects remain unknown');
      if (error instanceof HttpStepError) throw error;
      throw new HttpStepError('conversation_protocol_failure', `Conversation failed: ${(error as Error).message}; agent side effects remain unknown`);
    }
    const toolCalls = turns.flatMap((turn) => turn.toolCalls).slice(0, 64);
    const latencies = turns.map((turn) => turn.firstReplyMs).filter((value): value is number => value !== null);
    const observation = ConversationObservation.parse({
      kind: 'conversation', channel: command.channel, transport: command.transport, endpoint: command.endpoint, sessionId,
      turns, transcript: turns.map((turn) => `caller: ${turn.say}\nagent: ${turn.reply}`).join('\n').slice(0, 64_000),
      replies: turns.map((turn) => turn.reply).join('\n').slice(0, 64_000),
      toolCalls, toolNames: toolCalls.map((call) => call.name),
      maxFirstReplyMs: latencies.length ? Math.max(...latencies) : null,
      durationMs: Math.round(monotonicMs() - started), attempts: 1,
    });
    const serialized = JSON.stringify(observation);
    if (Buffer.byteLength(serialized) > MAX_CONVERSATION_BYTES) throw new HttpStepError('conversation_response_invalid', 'Conversation observation exceeds the protocol limit');
    if (credential && serialized.includes(JSON.stringify(credential).slice(1, -1))) throw new HttpStepError('conversation_secret_echo', 'The agent echoed an issued credential; observation withheld');
    return observation;
  }

  /** A JSON chat endpoint: one POST per turn carrying the message and a stable session id. */
  private async httpChat(command: ConversationRun, endpoint: URL, credential: string | null, sessionId: string, signal: AbortSignal): Promise<TurnRecord[]> {
    const turns: TurnRecord[] = [];
    for (const [index, turn] of command.turns.entries()) {
      const body = setPath(setPath({}, command.messageField, turn.say), command.sessionField, sessionId);
      const turnSignal = AbortSignal.any([signal, AbortSignal.timeout(command.turnTimeoutMs)]);
      const t0 = monotonicMs();
      const response = await this.fetcher(endpoint, { method: 'POST', redirect: 'error', signal: turnSignal,
        headers: { 'content-type': 'application/json', accept: 'application/json', ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
        body: JSON.stringify(body) });
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_CONVERSATION_BYTES) throw new HttpStepError('conversation_response_invalid', 'Chat response exceeds the protocol limit');
      if (!response.ok) throw new HttpStepError('conversation_http_status', `Chat endpoint answered ${response.status} on turn ${index + 1}`);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new HttpStepError('conversation_response_invalid', `Chat endpoint returned non-JSON on turn ${index + 1}`); }
      const reply = pathOf(parsed, command.replyPath);
      if (typeof reply !== 'string') throw new HttpStepError('conversation_response_invalid', `Chat response has no string at ${command.replyPath} on turn ${index + 1}`);
      const rawTools = pathOf(parsed, command.toolsPath);
      const toolCalls = (Array.isArray(rawTools) ? rawTools : []).slice(0, 16).map(normalizeTool).filter((call): call is ConversationToolCall => call !== null);
      const elapsed = Math.round(monotonicMs() - t0);
      turns.push({ index, say: turn.say, reply: reply.slice(0, MAX_REPLY), firstReplyMs: elapsed, durationMs: elapsed, toolCalls, toolNames: toolCalls.map((call) => call.name), ended: 'response' });
    }
    return turns;
  }

  /**
   * RTVI messages over a WebSocket: the client/server vocabulary Pipecat voice bots speak. The runner
   * injects each caller line as `send-text`, so this exercises the agent's reasoning, tools and spoken
   * text; speech recognition and audio quality are outside what it observes.
   */
  private async rtvi(command: ConversationRun, endpoint: URL, credential: string | null, sessionId: string, signal: AbortSignal): Promise<TurnRecord[]> {
    const url = new URL(endpoint.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('session', sessionId);
    const socket = new WebSocket(url, credential ? { headers: { authorization: `Bearer ${credential}` } } as unknown as string[] : undefined);
    const inbox: Array<{ type: string; data: Record<string, unknown>; at: number }> = [];
    let wake: (() => void) | null = null;
    let closed = false; let bytes = 0;
    const notify = () => { const fn = wake; wake = null; fn?.(); };
    socket.addEventListener('message', (event) => {
      const text = typeof event.data === 'string' ? event.data : '';
      bytes += text.length;
      if (bytes > MAX_CONVERSATION_BYTES * 4) { socket.close(); return; }
      try {
        const message = JSON.parse(text) as { label?: string; type?: string; data?: unknown };
        if (message && typeof message.type === 'string') inbox.push({ type: message.type, data: (message.data && typeof message.data === 'object' ? message.data : {}) as Record<string, unknown>, at: monotonicMs() });
      } catch { /* binary audio or non-JSON frames are not part of the text observation */ }
      notify();
    });
    socket.addEventListener('close', () => { closed = true; notify(); });
    socket.addEventListener('error', () => { closed = true; notify(); });
    const onAbort = () => socket.close();
    signal.addEventListener('abort', onAbort, { once: true });
    const waitFor = (ms: number) => new Promise<void>((resolve) => { const timer = setTimeout(() => { wake = null; resolve(); }, Math.max(1, ms)); wake = () => { clearTimeout(timer); resolve(); }; });
    const send = (type: string, data: unknown) => socket.send(JSON.stringify({ label: 'rtvi-ai', type, id: randomUUID().slice(0, 8), data }));
    try {
      await new Promise<void>((resolve, reject) => {
        if (socket.readyState === WebSocket.OPEN) { resolve(); return; }
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new HttpStepError('conversation_connect_failed', 'Could not open the voice WebSocket')), { once: true });
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      send('client-ready', { version: '1.0.0', about: { library: 'tracegrove' } });
      const readyBy = monotonicMs() + command.turnTimeoutMs;
      let cursor = 0;
      for (;;) {
        const index = inbox.findIndex((message, i) => i >= cursor && message.type === 'bot-ready');
        if (index >= 0) { cursor = index + 1; break; }
        if (closed || signal.aborted) throw new HttpStepError('conversation_not_ready', 'The voice agent closed before it was ready');
        if (monotonicMs() >= readyBy) throw new HttpStepError('conversation_not_ready', 'The voice agent never sent bot-ready');
        await waitFor(readyBy - monotonicMs());
      }
      const turns: TurnRecord[] = [];
      for (const [index, turn] of command.turns.entries()) {
        cursor = inbox.length;
        const t0 = monotonicMs();
        send('send-text', { content: turn.say, options: { run_immediately: true, audio_response: true } });
        const tts: string[] = []; const llm: string[] = []; const outputs: string[] = [];
        const calls = new Map<string, { name: string; arguments: unknown; result: unknown }>();
        let first: number | null = null; let last: number | null = null; let speaking = false;
        let ended: TurnRecord['ended'] = 'timeout';
        const turnEnd = t0 + command.turnTimeoutMs;
        for (;;) {
          while (cursor < inbox.length) {
            const message = inbox[cursor++]!;
            const data = message.data;
            if (['bot-started-speaking', 'bot-tts-text', 'bot-llm-text', 'bot-llm-started', 'bot-output', 'bot-transcription', 'llm-function-call', 'llm-function-call-in-progress'].includes(message.type)) {
              first ??= message.at - t0; last = message.at;
            }
            if (message.type === 'error') throw new HttpStepError('conversation_agent_error', `The voice agent reported an error: ${String(data.message ?? data.error ?? 'unknown').slice(0, 200)}`);
            if (message.type === 'bot-started-speaking') speaking = true;
            if (message.type === 'bot-tts-text' && typeof data.text === 'string') tts.push(data.text);
            if (message.type === 'bot-llm-text' && typeof data.text === 'string') llm.push(data.text);
            if ((message.type === 'bot-output' || message.type === 'bot-transcription') && typeof data.text === 'string') outputs.push(data.text);
            if (message.type.startsWith('llm-function-call')) {
              const id = String(data.tool_call_id ?? data.function_name ?? calls.size);
              const name = String(data.function_name ?? data.name ?? calls.get(id)?.name ?? 'unknown').slice(0, 128);
              const prior = calls.get(id) ?? { name, arguments: null, result: null };
              calls.set(id, { name, arguments: data.arguments ?? data.args ?? prior.arguments, result: data.result ?? prior.result });
            }
            if (message.type === 'bot-stopped-speaking' && speaking) { ended = 'stopped'; break; }
          }
          if (ended === 'stopped') break;
          if (closed || signal.aborted) break;
          const now = monotonicMs();
          if (last !== null && !speaking && now - last >= command.settleMs) { ended = 'settled'; break; }
          if (now >= turnEnd) break;
          await waitFor(Math.min(turnEnd - now, last !== null && !speaking ? command.settleMs - (now - last) : turnEnd - now));
        }
        const reply = (tts.length ? tts.join(' ') : outputs.length ? outputs.join(' ') : llm.join('')).replace(/\s+/g, ' ').trim();
        const toolCalls = [...calls.values()].slice(0, 16).map((call) => ({ name: call.name, arguments: (call.arguments ?? null) as ConversationToolCall['arguments'], result: (call.result ?? null) as ConversationToolCall['result'] }));
        turns.push({ index, say: turn.say, reply: reply.slice(0, MAX_REPLY), firstReplyMs: first === null ? null : Math.round(first), durationMs: Math.round(monotonicMs() - t0),
          toolCalls, toolNames: toolCalls.map((call) => call.name), ended });
        if (closed) break;
      }
      if (!closed) send('disconnect-bot', {});
      return turns;
    } finally {
      signal.removeEventListener('abort', onAbort);
      try { socket.close(); } catch { /* already closed */ }
    }
  }
}

function normalizeTool(raw: unknown): ConversationToolCall | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const fn = (value.function && typeof value.function === 'object' ? value.function : {}) as Record<string, unknown>;
  const name = value.name ?? fn.name ?? value.tool;
  if (typeof name !== 'string' || !name) return null;
  let args = value.arguments ?? value.args ?? value.input ?? fn.arguments ?? null;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { /* keep the string */ } }
  return { name: name.slice(0, 128), arguments: (args ?? null) as ConversationToolCall['arguments'], result: (value.result ?? value.output ?? null) as ConversationToolCall['result'] };
}

function pathOf(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !(key in (current as object))) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) current = (current[key] ??= {}) as Record<string, unknown>;
  current[keys.at(-1)!] = value;
  return target;
}
