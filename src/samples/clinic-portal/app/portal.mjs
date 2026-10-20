// "Riverbend Health" patient portal: patients read their own lab results and message the clinic;
// staff can open any chart, and every staff read is written to the compliance audit log. A new
// message triggers a text to the clinic's on-call phone, which must never carry health details.
//
// AUDIT_URL and SMS_URL point at the audit log service and the SMS provider; in tests,
// tracegrove's stand-ins answer there and record what was sent.
//
// Bugs for `tracegrove try clinic-portal --bug <name>` (PORTAL_BUG):
//   any_record     a patient can open anyone's record by guessing its id
//   skip_audit     staff reads are not written to the audit log
//   phi_in_sms     the text message to the on-call phone quotes the patient's message
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { send, readBody } from './http.mjs';

const dir = process.env.PORTAL_DATA_DIR ?? './portal-data';
const tokens = JSON.parse(process.env.PORTAL_TOKENS ?? '{}');
const audit = process.env.AUDIT_URL;
const sms = process.env.SMS_URL;
if (!audit || !sms) throw new Error('AUDIT_URL and SMS_URL are required');
const bug = process.env.PORTAL_BUG ?? '';
const ON_CALL = '+15550100';
const STAFF = new Set(['nurse-kim']);
mkdirSync(dir, { recursive: true });

const store = join(dir, 'portal.json');
const SEED = { records: [
  { id: 'rec_7f3a', patient: 'alice', test: 'Hemoglobin A1C', result: '5.4%', ssn: '123-45-6789', note: 'Normal range.' },
  { id: 'rec_9c1e', patient: 'bob', test: 'Lipid panel', result: 'LDL 162 mg/dL', ssn: '987-65-4321', note: 'Discuss statins at next visit.' },
], messages: [] };
const load = () => existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : structuredClone(SEED);
const save = (data) => { writeFileSync(`${store}.tmp`, JSON.stringify(data)); renameSync(`${store}.tmp`, store); };
if (!existsSync(store)) save(SEED);

async function post(base, path, body) {
  try { const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) }); return r.ok; }
  catch { return false; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  const auth = req.headers.authorization ?? '';
  const user = tokens[auth.startsWith('Bearer ') ? auth.slice(7) : ''];
  if (!user) return send(res, 401, { error: 'unauthorized' });
  const staff = STAFF.has(user);
  const data = load();

  if (req.method === 'GET' && url.pathname === '/records') {
    if (staff) return send(res, 403, { error: 'staff open charts one at a time' });
    return send(res, 200, { records: data.records.filter((r) => r.patient === user).map(({ ssn, ...r }) => r) });
  }
  const one = url.pathname.match(/^\/records\/([a-z0-9_]+)$/);
  if (req.method === 'GET' && one) {
    const record = data.records.find((r) => r.id === one[1]);
    const allowed = record && (staff || record.patient === user || bug === 'any_record');
    if (!allowed) return send(res, 404, { error: 'not_found' });
    if (staff && bug !== 'skip_audit') {
      // An access that can't be audited doesn't happen.
      if (!await post(audit, '/events', { actor: user, action: 'chart.read', patient: record.patient, record: record.id, at: new Date().toISOString() })) return send(res, 503, { error: 'audit_unavailable' });
    }
    return send(res, 200, { record: staff ? record : (({ ssn, ...r }) => r)(record) });
  }

  if (req.method === 'POST' && url.pathname === '/messages') {
    if (staff) return send(res, 403, { error: 'patients only' });
    const body = await readBody(req).catch(() => ({}));
    if (typeof body.text !== 'string' || !body.text.trim()) return send(res, 400, { error: 'text required' });
    const message = { id: `msg_${randomUUID().slice(0, 8)}`, from: user, text: body.text.slice(0, 2000), at: new Date().toISOString() };
    data.messages.push(message); save(data);
    await post(sms, '/messages', { to: ON_CALL, body: bug === 'phi_in_sms' ? `New portal message from ${user}: ${message.text}` : 'New patient message in the Riverbend portal. Log in to read it.' });
    return send(res, 201, { message: { id: message.id } });
  }
  if (req.method === 'GET' && url.pathname === '/inbox') {
    if (!staff) return send(res, 403, { error: 'staff only' });
    return send(res, 200, { messages: data.messages });
  }
  return send(res, 404, { error: 'not_found' });
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1');
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
