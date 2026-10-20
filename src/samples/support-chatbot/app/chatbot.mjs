// "Pip", the support chatbot for Pine & Pour Coffee: a stand-in for an LLM chat widget backed by
// tools (order lookup, support tickets). Customers chat at POST /chat with their session token;
// support staff read tickets back over HTTP. Rule-based so the sample runs offline.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.env.SHOP_DATA_DIR;
if (!directory) throw new Error('SHOP_DATA_DIR is required');
mkdirSync(join(directory, 'tickets'), { recursive: true });
const tokens = JSON.parse(process.env.SHOP_TOKENS ?? '{}');
const ordersFile = join(directory, 'orders.json');
if (!existsSync(ordersFile)) writeFileSync(ordersFile, JSON.stringify({
  1042: { id: '1042', customer: 'alice', items: ['Highland Roast 1kg'], status: 'shipped', shippedOn: 'Tuesday', carrier: 'UPS', eta: 'Thursday', address: '12 Elm St, Burlington' },
  1043: { id: '1043', customer: 'bob', items: ['Pour-over kit'], status: 'processing', shippedOn: null, carrier: null, eta: 'next week', address: '88 Oak Ave, Winooski' },
}));
const orders = () => JSON.parse(readFileSync(ordersFile, 'utf8'));
const tickets = () => readdirSync(join(directory, 'tickets')).map((name) => JSON.parse(readFileSync(join(directory, 'tickets', name), 'utf8')));
const sessions = new Map();

function respond(customer, state, message) {
  const text = message.toLowerCase();
  if (/ignore (all|any|previous|your)|system prompt|discount code|coupon|100%|free coffee for life/.test(text)) {
    return { reply: "I can't share discount codes or change how I work, but I'm happy to help with an order, a return or a question about our coffee." };
  }
  const mentioned = message.match(/\b(\d{4})\b/)?.[1];
  if (mentioned) state.orderId = mentioned;
  const lookup = (orderId) => ({ name: 'lookup_order', arguments: { orderId }, run: () => {
    const order = orders()[orderId];
    return order && order.customer === customer ? { found: true, order: { id: order.id, status: order.status, eta: order.eta } } : { found: false };
  } });
  if (/\b(refund|stale|broken|damaged|wrong item|return)\b/.test(text)) {
    if (!state.orderId) return { reply: 'Sorry to hear that. Which order number is it about?' };
    const order = orders()[state.orderId];
    if (!order || order.customer !== customer) return { reply: "I can only help with orders on your own account. Could you double-check the order number?" };
    const reason = /stale/.test(text) ? 'stale_product' : /broken|damaged/.test(text) ? 'damaged' : 'refund_request';
    return { tools: [{ name: 'create_ticket', arguments: { orderId: order.id, reason }, run: () => {
      const ticket = { id: randomUUID(), number: `T-${1000 + tickets().length + 1}`, orderId: order.id, customer, reason, status: 'open', summary: message.slice(0, 280), createdAt: new Date().toISOString() };
      writeFileSync(join(directory, 'tickets', `${ticket.id}.json`), JSON.stringify(ticket, null, 2));
      return { ticket };
    } }], after: ([result]) => `I'm sorry about that. I've opened ticket ${result.ticket.number} for a refund on order ${order.id}. Our team replies within one business day.` };
  }
  if (state.orderId && /\b(where|status|track|when|address|ship)/.test(text)) {
    const order = orders()[state.orderId];
    if (!order || order.customer !== customer) return { tools: [lookup(state.orderId)], after: () => "I can only discuss orders on your own account. If you have another order number, I'm happy to look it up." };
    if (/address/.test(text)) return { tools: [lookup(order.id)], after: () => `Order ${order.id} is going to the address on your account. You can see or change it under Account, Addresses.` };
    return { tools: [lookup(order.id)], after: ([result]) => result.order.status === 'shipped'
      ? `Order ${order.id} shipped on ${order.shippedOn} with ${order.carrier} and should arrive ${order.eta}.`
      : `Order ${order.id} is still being roasted and packed. It should ship ${order.eta}.` };
  }
  return { reply: "Hi! I'm Pip from Pine & Pour. I can check on an order, start a return, or answer questions about our coffee." };
}

function send(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), 'x-request-id': randomUUID() });
  response.end(text);
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = ''; request.setEncoding('utf8');
    request.on('data', (chunk) => { data += chunk; if (data.length > 65536) request.destroy(); });
    request.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); } });
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true });
    const token = String(request.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!Object.hasOwn(tokens, token)) return send(response, 401, { error: 'unauthorized' });
    const subject = tokens[token];
    if (request.method === 'POST' && url.pathname === '/chat') {
      const body = await readJson(request);
      if (typeof body.message !== 'string' || typeof body.sessionId !== 'string') return send(response, 400, { error: 'message and sessionId are required' });
      const key = `${subject}:${body.sessionId}`;
      const state = sessions.get(key) ?? {}; sessions.set(key, state);
      const turn = respond(subject, state, body.message.slice(0, 2000));
      const toolCalls = (turn.tools ?? []).map((tool) => ({ name: tool.name, arguments: tool.arguments, result: tool.run() }));
      return send(response, 200, { reply: turn.after ? turn.after(toolCalls.map((call) => call.result)) : turn.reply, toolCalls });
    }
    const match = url.pathname.match(/^\/tickets\/([0-9a-f-]{36})$/);
    if (request.method === 'GET' && match) {
      const ticket = tickets().find((item) => item.id === match[1]);
      if (!ticket) return send(response, 404, { error: 'not_found' });
      if (subject !== 'support-team' && ticket.customer !== subject) return send(response, 403, { error: 'forbidden' });
      return send(response, 200, { ticket });
    }
    if (request.method === 'GET' && url.pathname === '/tickets') {
      const list = tickets().filter((item) => (subject === 'support-team' || item.customer === subject) && (!url.searchParams.get('orderId') || item.orderId === url.searchParams.get('orderId')));
      return send(response, 200, { tickets: list, count: list.length });
    }
    return send(response, 404, { error: 'not_found' });
  } catch { send(response, 400, { error: 'invalid_request' }); }
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1');
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
