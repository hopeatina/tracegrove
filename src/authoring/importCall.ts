/**
 * Turn a real call or chat log into a draft flow. The caller's lines become `say:` turns and the tools
 * the agent called become `calls:` checks. What the agent said is kept as comments, never as checks:
 * a person picks the phrases that must hold, because a transcript shows what happened, not what should.
 * Phone numbers, emails, card and social security numbers are swapped for test values by default,
 * since real logs carry client data.
 */
import { stringify } from 'yaml';
import { BUILTIN_REDACTIONS } from '../core/privacy.ts';
import { Blocked } from '../core/errors.ts';

export type CallTurn = { role: 'caller' | 'agent'; text: string; tools: string[] };
export type ImportedCall = {
  format: 'retell' | 'vapi' | 'messages' | 'text';
  channel: 'voice' | 'chat';
  turns: CallTurn[];
  replaced: Array<{ kind: string; count: number }>;
  yaml: string;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const CALLER = /^(user|caller|customer|human|client)$/i;
const AGENT = /^(agent|assistant|bot|ai)$/i;

type Item = { role: 'caller' | 'agent'; text?: string; tool?: string };

/** One ordered list of { role, text, tool } events, whatever shape the log came in. */
function events(raw: string): { format: ImportedCall['format']; items: Item[] } {
  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { /* plain text */ }
  if (parsed === null) {
    const items: Array<{ role: 'caller' | 'agent'; text: string }> = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*\[?[\d:.\s]*\]?\s*([A-Za-z ]{2,20}):\s*(.+)$/);
      if (m) { const who = m[1]!.trim(); items.push({ role: CALLER.test(who) ? 'caller' : 'agent', text: m[2]!.trim() }); }
      else if (line.trim() && items.length) items.at(-1)!.text += ` ${line.trim()}`;
    }
    return { format: 'text', items };
  }
  const root = isObject(parsed) && isObject(parsed.call) ? parsed.call : parsed;
  // Retell: transcript_with_tool_calls carries both speech and tool invocations in order.
  if (isObject(root) && (Array.isArray(root.transcript_with_tool_calls) || Array.isArray(root.transcript_object))) {
    const list = (root.transcript_with_tool_calls ?? root.transcript_object) as Json[];
    return { format: 'retell', items: list.flatMap((m): Item[] => m.role === 'tool_call_invocation' ? [{ role: 'agent' as const, tool: String(m.name ?? '') }]
      : CALLER.test(String(m.role)) ? [{ role: 'caller' as const, text: String(m.content ?? '') }] : AGENT.test(String(m.role)) ? [{ role: 'agent' as const, text: String(m.content ?? '') }] : []) };
  }
  // Vapi call: messages (or artifact.messages) with role user/bot/tool_calls.
  const vapi = isObject(root) ? (Array.isArray(root.messages) ? root.messages : isObject(root.artifact) && Array.isArray(root.artifact.messages) ? root.artifact.messages : null) : null;
  const list = (Array.isArray(root) ? root : vapi) as Json[] | null;
  if (!list) throw new Blocked([{ code: 'transcript_format_unknown', detail: 'expected a Retell call, a Vapi call, a messages array, or "Caller: …" / "Agent: …" lines', action: 'export the call as JSON from your voice platform, or paste the transcript as text' }]);
  const format = vapi ? 'vapi' : 'messages';
  return { format, items: list.flatMap((m): Item[] => {
    const role = String(m.role ?? '');
    const calls = (Array.isArray(m.toolCalls) ? m.toolCalls : Array.isArray(m.tool_calls) ? m.tool_calls : []) as Json[];
    const tools = calls.map((c) => String(isObject(c.function) ? c.function.name : c.name ?? '')).filter(Boolean).map((tool) => ({ role: 'agent' as const, tool }));
    const text = typeof m.message === 'string' ? m.message : typeof m.content === 'string' ? m.content : '';
    if (CALLER.test(role)) return [{ role: 'caller' as const, text }];
    if (AGENT.test(role) || role === 'tool_calls') return [...(text ? [{ role: 'agent' as const, text }] : []), ...tools];
    return [];
  }) };
}

/** Swap client data for stable test values: the same real number always becomes the same fake one. */
function scrub(turns: CallTurn[]): ImportedCall['replaced'] {
  const seen = new Map<string, string>(); const counts: Record<string, number> = {};
  const fake: Record<string, (n: number) => string> = { phone: (n) => `555-01${String(n).padStart(2, '0')}`, email: (n) => `caller${n}@example.com`, card: () => '4242 4242 4242 4242', ssn: () => '[removed]' };
  const rules = (['email', 'ssn', 'card', 'phone'] as const).map((name) => ({ name, regex: new RegExp(BUILTIN_REDACTIONS[name], 'g') }));
  for (const turn of turns) {
    turn.text = rules.reduce((text, { name, regex }) => text.replace(regex, (match) => {
      if (/^555[-. ]?01\d\d$/.test(match) || /@example\.com$/.test(match)) return match;
      const key = `${name}:${match.replace(/\D/g, '') || match}`;
      if (!seen.has(key)) { counts[name] = (counts[name] ?? 0) + 1; seen.set(key, fake[name]!(counts[name]!)); }
      return seen.get(key)!;
    }), turn.text);
  }
  return Object.entries(counts).map(([kind, count]) => ({ kind, count }));
}

export function importCall(raw: string, options: { name?: string | undefined; channel?: 'voice' | 'chat' | undefined; endpoint?: string | undefined; keepClientData?: boolean | undefined } = {}): ImportedCall {
  const { format, items } = events(raw);
  const turns: CallTurn[] = [];
  for (const item of items) {
    const last = turns.at(-1);
    if (item.tool) { if (last?.role === 'agent') last.tools.push(item.tool); else turns.push({ role: 'agent', text: '', tools: [item.tool] }); continue; }
    const text = (item.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (last && last.role === item.role) last.text = `${last.text} ${text}`.trim();
    else turns.push({ role: item.role, text, tools: [] });
  }
  if (!turns.some((t) => t.role === 'caller')) throw new Blocked([{ code: 'transcript_has_no_caller', detail: `read ${turns.length} agent turns and no caller turns`, action: 'check the role names: caller lines need user, caller or customer' }]);
  const replaced = options.keepClientData ? [] : scrub(turns);
  const channel = options.channel ?? (format === 'retell' || format === 'vapi' ? 'voice' : 'chat');

  // A caller turn is checked by what the agent did before the caller spoke again.
  const flowTurns: Array<{ say: string; expect: { calls?: string[] }; agent: string }> = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    if (turn.role !== 'caller') continue;
    const replies: CallTurn[] = [];
    for (let j = i + 1; j < turns.length && turns[j]!.role === 'agent'; j++) replies.push(turns[j]!);
    const tools = [...new Set(replies.flatMap((r) => r.tools))];
    flowTurns.push({ say: turn.text, expect: tools.length ? { calls: tools } : {}, agent: replies.map((r) => r.text).filter(Boolean).join(' ') });
  }
  const first = flowTurns[0]!.say;
  const title = options.name ?? `Imported call: ${first.length > 60 ? `${first.slice(0, 57)}…` : first}`;
  const flow = { title, tags: ['imported', 'draft'], steps: [{ name: 'replay the call', as: 'none',
    [channel]: { endpoint: options.endpoint ?? (channel === 'voice' ? '/voice' : '/chat'), turns: flowTurns.map((t) => ({ say: t.say, ...(Object.keys(t.expect).length ? { expect: t.expect } : {}) })) } }] };
  let yaml = stringify(flow, { lineWidth: 0 });
  // Keep what the agent actually said next to each turn, as a comment for the person choosing the checks.
  let index = 0;
  yaml = yaml.replace(/^(\s*)- say: .*$/gm, (line, indent: string) => {
    const agent = flowTurns[index++]?.agent;
    return agent ? `${line}\n${indent}  # agent said: ${agent.slice(0, 300).replace(/\n/g, ' ')}` : line;
  });
  const header = [
    `# Drafted by tracegrove import-call from a ${format} ${channel === 'voice' ? 'call' : 'chat'} log.`,
    '# Checks so far: which tools the agent called. Add says / notSays for the phrases that must hold,',
    '# then a readback step for every booking, ticket or message the call should have created.',
    ...(replaced.length ? [`# Client data swapped for test values: ${replaced.map((r) => `${r.count} ${r.kind}`).join(', ')}. Names are not detected; check them.`] : []),
  ];
  return { format, channel, turns, replaced, yaml: `${header.join('\n')}\n${yaml}` };
}
