// "Max", the after-hours phone receptionist for Riverbend Animal Hospital, built the way agencies ship
// these: the voice agent owns the conversation, an automation webhook (n8n, Make, Zapier) puts the
// booking on the clinic's calendar, and a telephony API transfers emergencies to the on-call vet.
// Callers talk to Max over RTVI on a WebSocket (/voice). Max keeps no booking store of its own: the
// only proof a booking happened is what reached the automation, which is what the flows read back.
//
// AUTOMATION_URL and PHONE_URL point at the clinic's automation and telephony services. In tests,
// tracegrove's stand-ins answer there and record every call.
//
// Bugs for `tracegrove try vet-receptionist --bug <name>` (VET_BUG):
//   ignore_automation_errors  says "you're all set" even when the automation never took the booking
//   double_book               sends every booking to the automation twice
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { acceptWebSocket } from './ws.mjs';

const automation = process.env.AUTOMATION_URL;
const telephony = process.env.PHONE_URL;
if (!automation || !telephony) throw new Error('AUTOMATION_URL and PHONE_URL are required');
const bug = process.env.VET_BUG ?? '';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const REASONS = { vaccine: 'vaccines', vaccines: 'vaccines', shots: 'vaccines', checkup: 'checkup', 'check-up': 'checkup', limping: 'limping', limp: 'limping', 'not eating': 'not eating', dental: 'dental cleaning' };
const title = (word) => word[0].toUpperCase() + word.slice(1);
const clock = (minutes) => { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

async function post(base, path, body) {
  try {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
  } catch { return { ok: false, status: 0, body: null }; }
}

/** One booking, sent at most twice under one idempotency key so a retry can't double-book. */
async function book(request) {
  const payload = { ...request, idempotencyKey: randomUUID() };
  if (bug === 'double_book') { await post(automation, '/webhook/book-appointment', payload); return post(automation, '/webhook/book-appointment', { ...payload, idempotencyKey: randomUUID() }); }
  const first = await post(automation, '/webhook/book-appointment', payload);
  if (first.ok || bug === 'ignore_automation_errors') return first;
  return post(automation, '/webhook/book-appointment', payload);
}

/** One caller line in, Max's reply and any tool calls out. */
function respond(state, said) {
  const text = said.toLowerCase();
  if (/\b(hit by a car|not breathing|seizure|chocolate|poison|antifreeze|bleeding|collapsed|bloated)\b/.test(text)) {
    return { reply: "That's an emergency. I'm connecting you to our on-call vet right now. Please stay on the line.",
      tool: { name: 'transfer_call', arguments: { to: 'on_call_vet', reason: 'pet_emergency' },
        run: async () => { const result = await post(telephony, '/calls/transfer', { to: 'on_call_vet', reason: 'pet_emergency' }); return { transferred: result.ok }; } } };
  }
  if (/\b(dose|dosage|how much .* give|medication|ibuprofen|tylenol|benadryl)\b/.test(text)) {
    return { reply: "I can't give medication advice over the phone, since some human medicines are dangerous for pets. I can book you with a vet. Would you like an appointment?" };
  }
  const reason = Object.keys(REASONS).find((key) => text.includes(key));
  if (reason) state.reason = REASONS[reason];
  const day = DAYS.find((name) => text.includes(name));
  if (day) state.day = day;
  const time = said.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (time) state.minutes = ((Number(time[1]) % 12) + (/p/i.test(time[3]) ? 12 : 0)) * 60 + Number(time[2] ?? 0);
  const owner = said.match(/\b(?:[Mm]y name is|[Tt]his is|I'm)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (owner) state.owner = owner[1];
  const pet = said.match(/\b(?:dog|cat|puppy|kitten|pet)(?:'s name is| is called| named|,)\s+([A-Z][a-z]+)/) ?? said.match(/\b([A-Z][a-z]+) is (?:my|our) (?:dog|cat|puppy|kitten)/);
  if (pet) state.pet = pet[1];
  const phone = said.match(/\b(\d{3})[-. ]?(\d{4})\b/);
  if (phone) state.phone = `${phone[1]}-${phone[2]}`;

  const booking = state.reason || state.day || state.minutes !== undefined || /\b(book|appointment|schedule|bring)\b/.test(text);
  if (!booking) return { reply: 'Thanks for calling Riverbend Animal Hospital, this is Max. I can book a visit or get you to our on-call vet. How can I help?' };
  if (state.day && (state.day === 'sunday' || (state.minutes !== undefined && (state.minutes < 8 * 60 || state.minutes > 17 * 60 + 30)))) {
    delete state.day; delete state.minutes;
    return { reply: "We see patients Monday through Saturday, 8 AM to 6 PM. What day and time in those hours works for you?" };
  }
  if (!state.day || state.minutes === undefined) return { reply: `Happy to help${state.reason ? ` with ${state.reason}` : ''}. What day and time work for you?` };
  if (!state.pet || !state.owner || !state.phone) return { reply: `I can book ${title(state.day)} at ${clock(state.minutes)}. What's your pet's name, and your name and callback number?` };
  const request = { pet: state.pet, owner: state.owner, phone: state.phone, reason: state.reason ?? 'checkup', day: state.day, time: clock(state.minutes) };
  return { tool: { name: 'book_appointment', arguments: request, run: async () => {
    const result = await book(request);
    if (result.ok || bug === 'ignore_automation_errors') return { booked: true, eventId: result.body?.eventId ?? null };
    await post(automation, '/webhook/callback-request', { owner: request.owner, phone: request.phone, pet: request.pet, why: 'booking_failed' });
    return { booked: false };
  } }, after: (result) => {
    for (const key of ['reason', 'day', 'minutes']) delete state[key];
    return result.booked
      ? `You're all set, ${request.owner.split(' ')[0]}. ${request.pet} is booked for ${title(request.day)} at ${request.time}. You'll get a text confirmation shortly.`
      : `I'm sorry, I couldn't confirm that booking in our system just now. A team member will call you back at ${request.phone} today to get ${request.pet} booked.`;
  } };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function voiceSession(conn) {
  const state = {}; let busy = Promise.resolve();
  const emit = (type, data = {}) => conn.send(JSON.stringify({ label: 'rtvi-ai', type, data }));
  conn.on('message', (raw) => {
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'client-ready') { emit('bot-ready', { version: '1.0.0', about: { name: 'Max', clinic: 'Riverbend Animal Hospital' } }); return; }
    if (message.type === 'disconnect-bot') { conn.close(); return; }
    if (message.type !== 'send-text' || typeof message.data?.content !== 'string') return;
    const said = message.data.content.slice(0, 2000);
    busy = busy.then(async () => {
      emit('user-transcription', { text: said, final: true, user_id: 'caller' });
      await sleep(40);
      emit('bot-llm-started');
      const turn = respond(state, said);
      let reply = turn.reply ?? '';
      if (turn.tool) {
        const id = `call_${randomUUID().slice(0, 8)}`;
        emit('llm-function-call-in-progress', { function_name: turn.tool.name, tool_call_id: id, arguments: turn.tool.arguments });
        const result = await turn.tool.run();
        emit('llm-function-call-stopped', { function_name: turn.tool.name, tool_call_id: id, result });
        reply = turn.after ? turn.after(result) : reply;
      }
      for (const word of reply.split(/(?<= )/)) emit('bot-llm-text', { text: word });
      emit('bot-llm-stopped');
      emit('bot-tts-started');
      emit('bot-started-speaking');
      for (const sentence of reply.match(/[^.!?]+[.!?]?/g) ?? []) { emit('bot-tts-text', { text: sentence.trim() }); await sleep(10); }
      emit('bot-tts-stopped');
      emit('bot-stopped-speaking');
    }).catch(() => emit('error', { message: 'receptionist failed' }));
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const status = request.method === 'GET' && url.pathname === '/health' ? 200 : 404;
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(status === 200 ? { ok: true } : { error: 'not_found' }));
});
server.on('upgrade', (request, socket) => {
  if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/voice') { socket.destroy(); return; }
  acceptWebSocket(request, socket, voiceSession);
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1');
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
