// "Plotline", a project-planning SaaS: plan upgrades charge a card through a payments API, the
// payments provider sends credit webhooks back, and a failed payment emails the account owner.
// Accounts are JSON files in BILLING_DATA_DIR. Two tenants: acme (alice) and globex (bob).
//
// PAYMENTS_URL and EMAIL_URL point at the payments and email providers; in tests, tracegrove's
// stand-ins answer there and record what was sent.
//
// Bugs for `tracegrove try saas-billing --bug <name>` (BILLING_BUG):
//   double_charge       retries a failed charge with a new idempotency key, so the card can be charged twice
//   trust_client_price  charges whatever price the browser sent instead of the server's price list
//   replay_webhooks     applies a payments webhook again every time the provider redelivers it
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { send, readBody } from './http.mjs';

const dir = process.env.BILLING_DATA_DIR ?? './billing-data';
const tokens = JSON.parse(process.env.BILLING_TOKENS ?? '{}');
const payments = process.env.PAYMENTS_URL;
const email = process.env.EMAIL_URL;
const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
if (!payments || !email) throw new Error('PAYMENTS_URL and EMAIL_URL are required');
const bug = process.env.BILLING_BUG ?? '';
mkdirSync(dir, { recursive: true });

const TENANT = { alice: 'acme', bob: 'globex' };
const OWNER_EMAIL = { acme: 'billing@acme.test', globex: 'billing@globex.test' };
const PRICES = { starter: 0, team: 4900, business: 19900 };

const file = (id) => join(dir, `${id}.json`);
function load(id) {
  if (!existsSync(file(id))) return { id, plan: 'starter', credits: 0, dunning: false, invoices: [], events: [] };
  return JSON.parse(readFileSync(file(id), 'utf8'));
}
function save(account) { const tmp = `${file(account.id)}.tmp`; writeFileSync(tmp, JSON.stringify(account)); renameSync(tmp, file(account.id)); }
const view = (a) => ({ id: a.id, plan: a.plan, credits: a.credits, dunning: a.dunning });

async function post(base, path, body) {
  try {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
  } catch { return { ok: false, status: 0, body: null }; }
}

/** One charge, retried once on a provider error under the same idempotency key. */
async function charge(account, amount, plan) {
  const request = { customer: account.id, amount, currency: 'usd', description: `Plotline ${plan} plan`, idempotencyKey: randomUUID() };
  const first = await post(payments, '/v1/charges', request);
  if (first.ok || (first.status >= 400 && first.status < 500)) return first;
  return post(payments, '/v1/charges', bug === 'double_charge' ? { ...request, idempotencyKey: randomUUID() } : request);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });

  if (req.method === 'POST' && url.pathname === '/webhooks/payments') {
    if (!webhookSecret || req.headers['x-webhook-secret'] !== webhookSecret) return send(res, 401, { error: 'bad_signature' });
    const event = await readBody(req).catch(() => null);
    if (!event?.id || event.type !== 'credit.granted' || !Number.isInteger(event.amount) || !TENANT[event.user]) return send(res, 400, { error: 'bad_event' });
    const account = load(TENANT[event.user]);
    const seen = account.events.includes(event.id);
    if (!seen || bug === 'replay_webhooks') { account.credits += event.amount; if (!seen) account.events.push(event.id); save(account); }
    return send(res, 200, { applied: !seen || bug === 'replay_webhooks' });
  }

  const auth = req.headers.authorization ?? '';
  const user = tokens[auth.startsWith('Bearer ') ? auth.slice(7) : ''];
  if (!user || !TENANT[user]) return send(res, 401, { error: 'unauthorized' });
  const account = load(TENANT[user]);

  if (req.method === 'GET' && url.pathname === '/account') return send(res, 200, { account: view(account) });

  if (req.method === 'POST' && url.pathname === '/subscription') {
    const body = await readBody(req).catch(() => ({}));
    if (!(body.plan in PRICES)) return send(res, 400, { error: 'unknown_plan' });
    if (body.plan === account.plan) return send(res, 409, { error: 'already_on_plan' });
    const amount = bug === 'trust_client_price' && Number.isInteger(body.price) ? body.price : PRICES[body.plan];
    const result = await charge(account, amount, body.plan);
    if (!result.ok) {
      account.dunning = true; save(account);
      await post(email, '/send', { to: OWNER_EMAIL[account.id], template: 'payment_failed', plan: body.plan });
      return send(res, 402, { error: 'payment_failed', account: view(account) });
    }
    const invoice = { id: `inv_${randomUUID().slice(0, 8)}`, plan: body.plan, amount, chargeId: result.body?.id ?? null };
    account.plan = body.plan; account.dunning = false; account.invoices.push(invoice); save(account);
    return send(res, 200, { account: view(account), invoice });
  }

  if (req.method === 'GET' && url.pathname === '/invoices') return send(res, 200, { invoices: account.invoices });
  const one = url.pathname.match(/^\/invoices\/([A-Za-z0-9_]+)$/);
  if (req.method === 'GET' && one) {
    const invoice = account.invoices.find((i) => i.id === one[1]);
    return invoice ? send(res, 200, { invoice }) : send(res, 404, { error: 'not_found' });
  }
  return send(res, 404, { error: 'not_found' });
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1');
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
