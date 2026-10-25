// "Helpdesk": customers open support tickets; an AI agent triages each one (team and urgency) and drafts a first reply.
// Tickets are kept in memory. ANTHROPIC_URL points at the model API; in tests a stand-in answers there.
import { createServer } from 'node:http';
import { send, readBody } from './http.mjs';
import { triageTicket } from '../lib/triage.mjs';
import { draftReply } from '../lib/reply.mjs';

const tickets = new Map();
let next = 1;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });

  if (req.method === 'POST' && url.pathname === '/tickets') {
    const body = await readBody(req);
    if (!body || typeof body.subject !== 'string' || typeof body.message !== 'string') return send(res, 400, { error: 'subject_and_message_required' });
    const triage = await triageTicket(body);
    const ticket = { id: next++, subject: body.subject, message: body.message, team: triage.team, urgency: triage.urgency, replies: [] };
    tickets.set(ticket.id, ticket);
    return send(res, 201, ticket);
  }

  if (req.method === 'POST' && url.pathname.startsWith('/tickets/') && url.pathname.endsWith('/reply')) {
    const ticket = tickets.get(Number(url.pathname.split('/')[2]));
    if (!ticket) return send(res, 404, { error: 'not_found' });
    const draft = await draftReply(ticket);
    ticket.replies.push(draft);
    return send(res, 200, { draft });
  }

  if (req.method === 'GET' && url.pathname === '/tickets') return send(res, 200, [...tickets.values()]);
  return send(res, 404, { error: 'not_found' });
});
server.listen(Number(process.env.PORT ?? 3000));
