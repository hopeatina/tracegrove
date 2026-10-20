import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { importCall } from '../src/authoring/importCall.ts';
import { Flow } from '../src/authoring/schema.ts';

const retell = JSON.stringify({ call_id: 'c1', transcript_with_tool_calls: [
  { role: 'agent', content: 'Thanks for calling, this is Max.' },
  { role: 'user', content: 'I need vaccines for my dog on Tuesday at 10am.' },
  { role: 'agent', content: "What's your pet's name and your number?" },
  { role: 'user', content: 'Biscuit. Call me at 312-555-8841 or dana.lee@gmail.com.' },
  { role: 'tool_call_invocation', name: 'book_appointment', arguments: '{}' },
  { role: 'agent', content: "You're all set." },
] });

describe('import-call', () => {
  it('drafts a voice flow from a Retell call: caller lines, tool checks, agent replies as comments, client data swapped', () => {
    const call = importCall(retell);
    expect(call).toMatchObject({ format: 'retell', channel: 'voice', replaced: [{ kind: 'email', count: 1 }, { kind: 'phone', count: 1 }] });
    expect(call.yaml).toContain("# agent said: You're all set.");
    expect(call.yaml).not.toMatch(/8841|gmail/);
    const flow = Flow.parse(parse(call.yaml));
    const turns = (flow.steps[0] as { voice: { turns: Array<{ say: string; expect?: { calls?: string[] } }> } }).voice.turns;
    expect(turns.map((t) => t.expect?.calls ?? [])).toEqual([[], ['book_appointment']]);
    expect(turns[1]!.say).toContain('555-0101');
  });

  it('reads Vapi messages, OpenAI-style messages and plain text', () => {
    const vapi = importCall(JSON.stringify({ artifact: { messages: [{ role: 'bot', message: 'Hi!' }, { role: 'user', message: 'Cancel my order' },
      { role: 'tool_calls', toolCalls: [{ function: { name: 'cancel_order' } }] }, { role: 'bot', message: 'Done.' }] } }));
    expect(vapi).toMatchObject({ format: 'vapi', turns: [{ role: 'agent' }, { role: 'caller', text: 'Cancel my order' }, { role: 'agent', tools: ['cancel_order'] }] });
    const chat = importCall(JSON.stringify([{ role: 'user', content: 'refund?' }, { role: 'assistant', content: 'Sure', tool_calls: [{ function: { name: 'open_ticket' } }] }]));
    expect(chat).toMatchObject({ format: 'messages', channel: 'chat' });
    expect(chat.yaml).toContain('open_ticket');
    const text = importCall('Agent: Riverbend, this is Max.\nCaller: My cat is limping\nand not eating.\nAgent: Let me book you.');
    expect(text.turns[1]).toMatchObject({ role: 'caller', text: 'My cat is limping and not eating.' });
  });

  it('refuses a log with no caller lines', () => {
    expect(() => importCall('Agent: hello\nAgent: anyone there?')).toThrow('transcript_has_no_caller');
  });
});
