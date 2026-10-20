# Voice agents and chatbots

Tracegrove can hold a conversation with your voice agent or chatbot, check what it said and which tools it called, and then read your backend separately to confirm the thing the agent claimed actually happened.

Most agent bugs are not in the words. They are a booking the agent confirmed but never saved, a ticket created for the wrong customer, or a tool that silently failed while the agent kept talking. A conversation step catches what the agent says; the readback step after it catches what the agent did.

```yaml
# tracegrove/calls/books-a-cleaning.flow.yaml
title: A caller books a cleaning by phone, and the booking really exists
risk: critical
steps:
  - name: caller books a cleaning
    as: none                       # phone callers are not logged-in users
    voice:
      endpoint: /voice
      turns:
        - say: Hi, I'd like to book a cleaning on Tuesday at 3pm.
          expect: { says: [cleaning, Tuesday, 3 PM, name], noCalls: [book_appointment], within: 1500 }
        - say: Sure, my name is Dana Lee and my number is 555-0142.
          expect: { says: [all set, Dana, confirmation number], calls: [book_appointment] }
    expect:
      notSays: [medical advice, "911"]
    save:
      appointmentId: toolCalls[0].result.appointment.id

  - name: front desk sees the booking   # the independent check
    GET: /appointments/{appointmentId}
    observe: true
    expect:
      status: 200
      json: { appointment.status: booked, appointment.patient: Dana Lee }

  - name: another clinic cannot see it
    GET: /appointments/{appointmentId}
    as: other_clinic
    expect: { status: 403, absent: [appointment] }
```

Try it in two minutes:

```bash
npx --no-install tracegrove sample-config --sample voice-receptionist --output ./voice-demo
npx --no-install tracegrove test --config ./voice-demo/tracegrove.config.yaml
npx --no-install tracegrove ui --dir ./voice-demo
```

The sample is "Ava", a rule-based receptionist for a dental clinic that speaks the same message protocol as a [Pipecat](https://github.com/pipecat-ai/pipecat) bot. Set `RECEPTIONIST_BUG=drop_booking` under `app.env` and rerun: Ava still says "You're all set", the voice step still passes, and the run fails at **front desk sees the booking: status 404 != 200**. That is the bug a client otherwise finds a week later.

There is a matching chat sample, `support-chatbot` ("Pip", a coffee shop support bot), with refund, privacy and prompt-injection flows.

## Turn expectations

Each turn has a `say` line and an optional `expect`. The step itself can also have an `expect` that applies to the whole conversation.

| Key | Checks | Matching |
| --- | --- | --- |
| `says` | every phrase appears in the agent's reply | case- and whitespace-insensitive substring |
| `notSays` | no phrase appears | same |
| `calls` | every tool was called during that turn | exact tool name |
| `noCalls` | none of these tools were called | exact tool name |
| `within` | the agent started replying within N ms | first reply text after the caller's line |

A failed check names the turn and the phrase, for example `body.turns[0].reply lacks "open Saturdays"`. Up to 32 checks per step.

`save:` reads from the whole conversation: `toolCalls[0].result...`, `replies[1]`, `sessionId`. Use it to carry an ID from the agent's tool result into the readback.

## Transports

**`rtvi` (voice, the default for `voice:`).** Tracegrove opens a WebSocket to `endpoint`, sends `client-ready`, waits for `bot-ready`, and sends each line as `send-text`. It reads `bot-tts-text` (or `bot-output` / `bot-transcription`, then `bot-llm-text`) as the reply, `llm-function-call-in-progress` / `llm-function-call-stopped` as tool calls, and treats `bot-stopped-speaking` as the end of a turn. If the bot never says it stopped, the turn ends after `settleMs` (default 800) of quiet, or fails after `turnTimeoutMs` (default 10000).

This is the [RTVI](https://docs.pipecat.ai/client/rtvi-standard) vocabulary Pipecat clients use, so a Pipecat bot with an RTVI processor works as is. For Vapi, Retell, LiveKit Agents or Bland, point tracegrove at a text test endpoint that drives the same agent logic and tools; the conversation checks and the readback stay the same.

**`http_chat` (the default for `chat:`).** Each turn is a `POST endpoint` with `{ message, sessionId }`. The reply comes from `reply` and tool calls from `toolCalls`. Rename any of those with `messageField`, `sessionField`, `replyPath` and `toolsPath`. Tool calls may be strings or objects with `name`/`function_name`, `arguments` and `result`.

```yaml
chat:
  endpoint: /api/assistant
  messageField: input
  replyPath: output.text
  toolsPath: output.tools
  turns:
    - say: Where is my order 1042?
      expect: { says: [shipped], calls: [lookup_order] }
```

The persona's token is sent as `Authorization: Bearer …` on both transports; use `as: none` for an open line. If the agent ever echoes a credential back, the step fails with `conversation_secret_echo` and the value is never written.

## What a conversation step does not prove

Sending text into the agent's pipeline skips speech recognition, audio quality, barge-in, the phone network and telephony providers. It proves the agent's decisions and its effects on your backend, which is where most failures come from. Test audio separately with your voice platform's own tools.

LLM agents are not deterministic. Prefer `says` phrases the agent must use (a confirmation number, a policy line) over exact wording, and lean on the readback step for the real proof.

## Safety rules the compiler enforces

- A conversation counts as a write. The case must allow `designated_writes`, and `maxConversations` caps how many a run may hold.
- Conversations are never retried automatically, because a retry could book twice.
- The endpoint must be inside the case's allowed resource prefixes.
- A flow cannot mix a conversation with MCP, jobs or browser steps in the same scenario yet.

See [security.md](security.md) for redacting phone numbers and emails from transcripts and sealing runs at rest.
