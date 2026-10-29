// "Ava", the phone receptionist for Bright Smile Dental: a stand-in for a Pipecat voice bot.
// Callers talk to it over RTVI messages on a WebSocket (/voice). Its tools write appointments to
// disk, and front-desk staff read them back over HTTP. The dialogue is rule-based so the sample
// runs offline and deterministically; swap in your own LLM bot and keep the same flows.
//
// RECEPTIONIST_BUG=drop_booking makes Ava confirm bookings without saving them: the failure a
// client finds a week later, and the one the readback step in the flow catches.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acceptWebSocket } from './ws.mjs';

const directory = process.env.CLINIC_DATA_DIR;
if (!directory) throw new Error('CLINIC_DATA_DIR is required');
mkdirSync(directory, { recursive: true });
const tokens = JSON.parse(process.env.CLINIC_TOKENS ?? '{}');
const CLINIC = 'bright-smile';
const bug = process.env.RECEPTIONIST_BUG ?? '';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SERVICES = { cleaning: 'cleaning', checkup: 'checkup', 'check-up': 'checkup', 'check up': 'checkup', whitening: 'whitening', filling: 'filling' };
const title = (word) => word[0].toUpperCase() + word.slice(1);
const clock = (minutes) => { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

function appointments() {
  return readdirSync(directory).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')));
}
function saveAppointment(appointment) { writeFileSync(join(directory, `${appointment.id}.json`), JSON.stringify(appointment, null, 2)); }

/** One caller line in, Ava's reply and any tool calls out. */
function respond(state, said) {
  const text = said.toLowerCase();
  if (/\b(severe|swelling|swollen|bleeding|knocked out|emergency|can'?t stop)\b/.test(text)) {
    return { reply: "That sounds urgent. I'm connecting you with our on-call dentist right now. If you have trouble breathing or swallowing, hang up and call 911.",
      tool: { name: 'transfer_call', arguments: { to: 'on_call_dentist', reason: 'dental_emergency' }, run: () => ({ transferred: true }) } };
  }
  if (/\b(antibiotic|medication|medicine|dosage|prescri|painkiller|ibuprofen|what should i take)/.test(text)) {
    return { reply: "I'm not able to give medical advice over the phone, but I can book you with one of our dentists today. Would you like an appointment?" };
  }
  const cancel = said.match(/\b(BSD-\d{4})\b/i);
  if (/\bcancel/.test(text)) {
    if (!cancel) return { reply: 'I can help with that. What is your confirmation number? It starts with B S D.' };
    const code = cancel[1].toUpperCase();
    return { tool: { name: 'cancel_appointment', arguments: { confirmation: code }, run: () => {
      const found = appointments().find((item) => item.confirmation === code && item.status === 'booked');
      if (!found) return { cancelled: false };
      found.status = 'cancelled'; saveAppointment(found);
      return { cancelled: true, appointment: found };
    } }, after: (result) => result.cancelled
      ? `Done. Your ${result.appointment.service} on ${title(result.appointment.day)} at ${clock(result.appointment.minutes)} is cancelled. Is there anything else?`
      : `I couldn't find an active appointment with confirmation ${code}. Could you check the number?` };
  }

  const service = Object.keys(SERVICES).find((key) => text.includes(key));
  if (service) state.service = SERVICES[service];
  const day = DAYS.find((name) => text.includes(name));
  if (day) state.day = day;
  const time = said.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (time) state.minutes = ((Number(time[1]) % 12) + (/p/i.test(time[3]) ? 12 : 0)) * 60 + Number(time[2] ?? 0);
  const name = said.match(/\b(?:[Mm]y name is|[Tt]his is|[Nn]ame's|I'm|[Ii]t's)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (name) state.name = name[1];
  const phone = said.match(/\b(\d{3})[-. ]?(\d{4})\b/);
  if (phone) state.phone = `${phone[1]}-${phone[2]}`;

  const booking = state.service || state.day || state.minutes !== undefined || /\b(book|appointment|schedule|come in)\b/.test(text);
  if (!booking && !state.name) return { reply: 'Thanks for calling Bright Smile Dental, this is Ava. I can book, change or cancel appointments. How can I help?' };
  if (state.day && (state.day === 'saturday' || state.day === 'sunday' || (state.minutes !== undefined && (state.minutes < 8 * 60 || state.minutes > 16 * 60 + 30)))) {
    delete state.day; delete state.minutes;
    return { reply: "I'm sorry, we're open Monday through Friday, 8 AM to 5 PM. Would a weekday during those hours work for you?" };
  }
  if (!state.day || state.minutes === undefined) return { reply: `Happy to help${state.service ? ` with a ${state.service}` : ''}. What day and time work best for you?` };
  state.service ??= 'checkup';
  const taken = appointments().some((item) => item.status === 'booked' && item.day === state.day && item.minutes === state.minutes);
  if (taken) {
    const requested = state.minutes; state.minutes += 60;
    return { reply: `${title(state.day)} at ${clock(requested)} is already taken. The next opening is ${clock(state.minutes)} that day. Does that work?` };
  }
  if (!state.name || !state.phone) return { reply: `I can book a ${state.service} on ${title(state.day)} at ${clock(state.minutes)}. Can I get your name and a callback number?` };
  const request = { service: state.service, day: state.day, minutes: state.minutes, patient: state.name, phone: state.phone };
  return { tool: { name: 'book_appointment', arguments: { ...request, time: clock(request.minutes) }, run: () => {
    const appointment = { id: randomUUID(), confirmation: `BSD-${String(1000 + Math.floor(Math.random() * 9000))}`, clinicId: CLINIC, status: 'booked', ...request, bookedBy: 'ava', bookedAt: new Date().toISOString() };
    if (bug !== 'drop_booking') saveAppointment(appointment);
    return { appointment };
  } }, after: (result) => {
    for (const key of ['service', 'day', 'minutes']) delete state[key];
    return `You're all set, ${request.patient.split(' ')[0]}. Your ${request.service} is booked for ${title(request.day)} at ${clock(request.minutes)}. Your confirmation number is ${result.appointment.confirmation}.`;
  } };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function voiceSession(conn) {
  const state = {}; let busy = Promise.resolve();
  const emit = (type, data = {}) => conn.send(JSON.stringify({ label: 'rtvi-ai', type, data }));
  conn.on('message', (raw) => {
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'client-ready') { emit('bot-ready', { version: '1.0.0', about: { name: 'Ava', clinic: 'Bright Smile Dental' } }); return; }
    if (message.type === 'disconnect-bot') { conn.close(); return; }
    if (message.type !== 'send-text' || typeof message.data?.content !== 'string') return;
    const said = message.data.content.slice(0, 2000);
    busy = busy.then(async () => {
      emit('user-transcription', { text: said, final: true, user_id: 'caller' });
      await sleep(60);
      emit('bot-llm-started');
      const turn = respond(state, said);
      let reply = turn.reply ?? '';
      if (turn.tool) {
        const id = `call_${randomUUID().slice(0, 8)}`;
        emit('llm-function-call-in-progress', { function_name: turn.tool.name, tool_call_id: id, arguments: turn.tool.arguments });
        const result = turn.tool.run();
        emit('llm-function-call-stopped', { function_name: turn.tool.name, tool_call_id: id, result });
        reply = turn.after ? turn.after(result) : reply;
      }
      for (const word of reply.split(/(?<= )/)) emit('bot-llm-text', { text: word });
      emit('bot-llm-stopped');
      emit('bot-tts-started');
      emit('bot-started-speaking');
      for (const sentence of reply.match(/[^.!?]+[.!?]?/g) ?? []) { emit('bot-tts-text', { text: sentence.trim() }); await sleep(15); }
      emit('bot-tts-stopped');
      emit('bot-stopped-speaking');
    }).catch(() => emit('error', { message: 'receptionist failed' }));
  });
}

function send(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), 'x-request-id': randomUUID() });
  response.end(text);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true });
  const token = String(request.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!Object.hasOwn(tokens, token)) return send(response, 401, { error: 'unauthorized' });
  const clinic = tokens[token];
  const match = url.pathname.match(/^\/appointments\/([0-9a-f-]{36})$/);
  if (request.method === 'GET' && match) {
    const found = appointments().find((item) => item.id === match[1]);
    if (!found) return send(response, 404, { error: 'not_found' });
    if (found.clinicId !== clinic) return send(response, 403, { error: 'forbidden' });
    return send(response, 200, { appointment: found });
  }
  if (request.method === 'GET' && url.pathname === '/appointments') {
    const list = appointments().filter((item) => item.clinicId === clinic && (!url.searchParams.get('phone') || item.phone === url.searchParams.get('phone')));
    return send(response, 200, { appointments: list, count: list.length });
  }
  return send(response, 404, { error: 'not_found' });
});
// Phone callers are not logged-in users: the voice line is open, the staff API is not.
server.on('upgrade', (request, socket) => {
  if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/voice') { socket.destroy(); return; }
  acceptWebSocket(request, socket, voiceSession);
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1');
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
