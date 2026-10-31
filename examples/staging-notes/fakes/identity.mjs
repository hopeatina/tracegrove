// Local stand-ins for the services a staging deployment depends on, on one loopback port:
//   AWS Secrets Manager + SSM (JSON protocol, SigV4 verified independently of tracegrove's signer),
//   the OrgX test-persona broker (mint, check, revoke), Clerk (testing token, sign-in ticket, session JWT),
//   an OAuth 2.0 client-credentials token endpoint, and /introspect, which the staging app calls to
//   validate short-lived tokens on every request. State is in memory; minted tokens are also appended to
//   $FAKES_STATE/minted-tokens.txt so the leak check can grep for them later.
//
// Env: FAKES_PORT, FAKES_STATE, AWS_KEY_ID, AWS_SECRET (the credential pair the fake accepts),
//      SECRETS_JSON (Secrets Manager name -> string), PARAMETERS_JSON (SSM name -> string),
//      BROKER_GRANT (the standing-grant key), BROKER_REVOKE_OWNER_AFTER (revoke the owner persona after N
//      introspections; simulates an admin revoking it mid-run; also settable with POST /__control), CLERK_SECRET, CLERK_USERS_JSON,
//      OAUTH_CLIENTS_JSON (client_id -> { secret, sub }).
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

const env = process.env;
const state = env.FAKES_STATE ?? './.fakes';
mkdirSync(state, { recursive: true });
const secrets = JSON.parse(env.SECRETS_JSON ?? '{}');
const parameters = JSON.parse(env.PARAMETERS_JSON ?? '{}');
const oauthClients = JSON.parse(env.OAUTH_CLIENTS_JSON ?? '{}');
const clerkUsers = JSON.parse(env.CLERK_USERS_JSON ?? '{}');
let revokeAfter = Number(env.BROKER_REVOKE_OWNER_AFTER ?? 0);
const live = new Map(); // token -> { sub, expiresAt, personaId?, uses }
const personas = new Map(); // id -> { id, role, subject, state, expiresAt, token, runId }
const tickets = new Map();
const log = (line) => process.stdout.write(`${new Date().toISOString()} ${line}\n`);
const mint = (sub, ttlSeconds, extra = {}) => {
  const token = `tok_${randomBytes(24).toString('base64url')}`;
  live.set(token, { sub, expiresAt: Date.now() + ttlSeconds * 1000, uses: 0, ...extra });
  appendFileSync(join(state, 'minted-tokens.txt'), `${token}\n`);
  return token;
};
const json = (res, status, body, headers = {}) => { const text = body === undefined ? '' : JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(text); };
const read = (req) => new Promise((resolve) => { let data = ''; req.setEncoding('utf8'); req.on('data', c => { data += c; }); req.on('end', () => resolve(data)); });
const bearer = (req) => (req.headers.authorization ?? '').replace(/^Bearer /, '');

// ---- SigV4, written from the AWS spec (not shared with tracegrove) ----
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const hm = (k, s) => createHmac('sha256', k).update(s, 'utf8').digest();
function sigv4Valid(req, body) {
  const m = (req.headers.authorization ?? '').match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/);
  if (!m) return 'missing or malformed SigV4 Authorization header';
  const [, keyId, date, region, service, signedHeaders, signature] = m;
  if (keyId !== env.AWS_KEY_ID) return 'unknown access key';
  const amz = req.headers['x-amz-date'] ?? '';
  const when = Date.UTC(+amz.slice(0, 4), +amz.slice(4, 6) - 1, +amz.slice(6, 8), +amz.slice(9, 11), +amz.slice(11, 13), +amz.slice(13, 15));
  if (!amz.startsWith(date) || Math.abs(Date.now() - when) > 5 * 60_000) return 'request time skew';
  const names = signedHeaders.split(';');
  if (!names.includes('host') || !names.includes('x-amz-date')) return 'host and x-amz-date must be signed';
  const canonical = [req.method, '/', '', ...names.map(n => `${n}:${String(req.headers[n] ?? '').trim()}`), '', signedHeaders, sha(body)].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, `${date}/${region}/${service}/aws4_request`, sha(canonical)].join('\n');
  const key = hm(hm(hm(hm(`AWS4${env.AWS_SECRET}`, date), region), service), 'aws4_request');
  return createHmac('sha256', key).update(toSign, 'utf8').digest('hex') === signature ? null : 'signature does not match';
}

function aws(req, res, body) {
  const problem = sigv4Valid(req, body);
  if (problem) { log(`aws denied: ${problem}`); return json(res, 403, { __type: 'com.amazonaws#InvalidSignatureException', message: problem }); }
  const target = String(req.headers['x-amz-target'] ?? '');
  const input = JSON.parse(body || '{}');
  log(`aws ${target} ${input.SecretId ?? input.Name ?? ''}`);
  if (target === 'secretsmanager.DescribeSecret' || target === 'secretsmanager.GetSecretValue') {
    if (!(input.SecretId in secrets)) return json(res, 400, { __type: 'com.amazonaws.secretsmanager#ResourceNotFoundException', message: 'Secrets Manager can\'t find the specified secret.' });
    return target.endsWith('DescribeSecret') ? json(res, 200, { Name: input.SecretId, ARN: `arn:aws:secretsmanager:us-east-1:000000000000:secret:${input.SecretId}` }) : json(res, 200, { Name: input.SecretId, SecretString: secrets[input.SecretId] });
  }
  if (target === 'AmazonSSM.GetParameter') {
    if (!(input.Name in parameters)) return json(res, 400, { __type: 'ParameterNotFound' });
    return json(res, 200, { Parameter: { Name: input.Name, Type: 'SecureString', Value: parameters[input.Name] } });
  }
  if (target === 'AmazonSSM.DescribeParameters') {
    const wanted = input.ParameterFilters?.[0]?.Values ?? [];
    return json(res, 200, { Parameters: wanted.filter(n => n in parameters).map(Name => ({ Name, Type: 'SecureString' })) });
  }
  return json(res, 400, { __type: 'UnknownOperationException' });
}

function broker(req, res, url, body) {
  if (bearer(req) !== env.BROKER_GRANT) return json(res, 401, { error: 'invalid_grant_key' });
  if (req.method === 'GET' && url.pathname === '/api/test-personas/capabilities') return json(res, 200, { enabled: url.searchParams.get('environment') === 'staging', roles: ['owner', 'member'] });
  if (req.method === 'POST' && url.pathname === '/api/test-personas') {
    const input = JSON.parse(body || '{}');
    if (input.environment !== 'staging') return json(res, 403, { error: 'environment_not_enabled' });
    const id = `tp_${randomUUID().slice(0, 8)}`;
    const subject = `${input.role}-${id}`;
    const ttl = Math.min(Number(input.ttlSeconds ?? 900), 3600);
    const token = mint(subject, ttl, { personaId: id });
    const persona = { id, role: input.role, subject, workspaceId: `ws_${input.runId}`.slice(0, 64), state: 'active', expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), token, runId: input.runId };
    personas.set(id, persona);
    log(`broker minted ${id} role=${input.role} run=${input.runId}`);
    return json(res, 201, { persona: { id, subject, workspaceId: persona.workspaceId, role: persona.role }, token, expiresAt: persona.expiresAt, receiptId: `awr_${id}`, browserEntry: `/sign-in?ticket=${token}` });
  }
  const m = url.pathname.match(/^\/api\/test-personas\/([A-Za-z0-9_.:-]+)$/);
  const persona = m ? personas.get(m[1]) : null;
  if (m && req.method === 'GET') return persona ? json(res, 200, { id: persona.id, state: persona.state, expiresAt: persona.expiresAt }) : json(res, 404, { error: 'not_found' });
  if (m && req.method === 'DELETE') {
    if (!persona) return json(res, 404, { error: 'not_found' });
    persona.state = 'revoked'; live.delete(persona.token); log(`broker revoked ${persona.id}`);
    return json(res, 204);
  }
  return json(res, 404, { error: 'not_found' });
}

function clerk(req, res, url, body) {
  if (url.pathname === '/v1/testing_tokens' || url.pathname === '/v1/sign_in_tokens') {
    if (bearer(req) !== env.CLERK_SECRET) return json(res, 401, { errors: [{ code: 'authentication_invalid' }] });
    if (url.pathname === '/v1/testing_tokens') return json(res, 200, { object: 'testing_token', token: `tt_${randomBytes(12).toString('hex')}`, expires_at: Date.now() + 3600_000 });
    const input = JSON.parse(body || '{}');
    if (!(input.user_id in clerkUsers)) return json(res, 404, { errors: [{ code: 'resource_not_found' }] });
    const ticket = `tk_${randomBytes(16).toString('hex')}`;
    tickets.set(ticket, input.user_id);
    return json(res, 200, { object: 'sign_in_token', token: ticket, user_id: input.user_id });
  }
  if (url.pathname === '/v1/client/sign_ins' && req.method === 'POST') {
    if (!url.searchParams.get('__clerk_testing_token')?.startsWith('tt_')) return json(res, 401, { errors: [{ code: 'bot_traffic_detected' }] });
    const form = new URLSearchParams(body);
    const user = tickets.get(form.get('ticket') ?? '');
    if (form.get('strategy') !== 'ticket' || !user) return json(res, 422, { errors: [{ code: 'ticket_invalid' }] });
    tickets.delete(form.get('ticket'));
    const exp = Math.floor(Date.now() / 1000) + 600;
    const sid = `sess_${randomBytes(6).toString('hex')}`;
    const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: clerkUsers[user], sid, exp })).toString('base64url')}.${randomBytes(16).toString('base64url')}`;
    live.set(jwt, { sub: clerkUsers[user], expiresAt: exp * 1000, uses: 0 });
    appendFileSync(join(state, 'minted-tokens.txt'), `${jwt}\n`);
    return json(res, 200, { response: { status: 'complete', created_session_id: sid }, client: { sessions: [{ id: sid, last_active_token: { jwt } }] } });
  }
  return json(res, 404, { errors: [{ code: 'not_found' }] });
}

function oauth(req, res, body) {
  const form = new URLSearchParams(body);
  const client = oauthClients[form.get('client_id') ?? ''];
  if (form.get('grant_type') !== 'client_credentials' || !client || client.secret !== form.get('client_secret')) return json(res, 401, { error: 'invalid_client' });
  return json(res, 200, { access_token: mint(client.sub, 600), token_type: 'Bearer', expires_in: 600 });
}

function introspect(res, body) {
  const { token } = JSON.parse(body || '{}');
  const entry = live.get(token);
  if (!entry || entry.expiresAt <= Date.now()) return json(res, 200, { active: false });
  entry.uses++;
  const persona = entry.personaId ? personas.get(entry.personaId) : null;
  if (persona && persona.role === 'owner' && revokeAfter > 0 && entry.uses > revokeAfter) {
    persona.state = 'revoked'; live.delete(token); log(`broker: an admin revoked ${persona.id} mid-run (after ${revokeAfter} uses)`);
    return json(res, 200, { active: false });
  }
  return json(res, 200, { active: true, sub: entry.sub });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const body = await read(req);
  if (req.method === 'POST' && url.pathname === '/' && req.headers['x-amz-target']) return aws(req, res, body);
  if (url.pathname.startsWith('/api/test-personas')) return broker(req, res, url, body);
  if (url.pathname.startsWith('/v1/')) return clerk(req, res, url, body);
  if (req.method === 'POST' && url.pathname === '/oauth/token') return oauth(req, res, body);
  if (req.method === 'POST' && url.pathname === '/introspect') return introspect(res, body);
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  // Test control (loopback only): make an "admin" revoke the next broker owner persona after N uses.
  if (req.method === 'POST' && url.pathname === '/__control') { revokeAfter = Number(JSON.parse(body || '{}').revokeOwnerAfter ?? 0); log(`control: revoke owner after ${revokeAfter}`); return json(res, 200, { revokeOwnerAfter: revokeAfter }); }
  return json(res, 404, { error: 'not_found' });
}).listen(Number(env.FAKES_PORT ?? 4810), '127.0.0.1', () => log(`fakes listening on ${env.FAKES_PORT ?? 4810}`));
