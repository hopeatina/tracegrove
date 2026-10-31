/**
 * Resolvers and auth recipes against local fakes: the identity fake (AWS Secrets Manager and SSM with
 * an independent SigV4 check, the persona broker, Clerk, OAuth) and the fake `op` CLI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultResolveContext, probeSecret, resolveSecret, resolverKindOf } from '../src/credentials/registry.ts';
import { applyRecipe, RecipeError } from '../src/credentials/recipes.ts';
import { ResolverError } from '../src/credentials/types.ts';
import { Secret } from '../src/credentials/secret.ts';
import { signRequest, verifySignature } from '../src/credentials/aws/sigv4.ts';
import { awsCredentials, parseIni } from '../src/credentials/aws/chain.ts';

const EXAMPLE = resolve(import.meta.dirname, '../examples/staging-notes');
const AWS_ID = 'AKIAFAKETESTKEY';
const AWS_SECRET = 'fake-secret-access-key-for-tests';
const GRANT = 'oxk_test_grant_key';
const CLERK = 'sk_test_clerk_key';

const freePort = () => new Promise<number>((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });

let fakes: ChildProcess;
let origin = '';
let root = '';
const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  HOME: root, AWS_CONFIG_FILE: join(root, 'none'), AWS_SHARED_CREDENTIALS_FILE: join(root, 'aws-credentials'), AWS_PROFILE: 'notes', AWS_REGION: 'us-east-1',
  AWS_ENDPOINT_URL: origin, TRACEGROVE_ORGX_BROKER_URL: origin, TRACEGROVE_ORGX_TOKEN: GRANT,
  TRACEGROVE_OP_BIN: join(EXAMPLE, 'fakes/op'), OP_FAKE_ITEMS: JSON.stringify({ vault: { observer: { token: 'op-token-value-1' } } }), PATH: process.env.PATH, ...extra,
});
const ctx = (extra: NodeJS.ProcessEnv = {}, persona = 'owner') => defaultResolveContext({ root, persona, runId: 'run_test', env: env(extra) });

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'tg-creds-'));
  writeFileSync(join(root, 'aws-credentials'), `[notes]\naws_access_key_id = ${AWS_ID}\naws_secret_access_key = ${AWS_SECRET}\n`);
  writeFileSync(join(root, '.env.local'), 'OWNER_TOKEN="dotenv-owner-value"\n# comment\nexport OTHER=x\n'); chmodSync(join(root, '.env.local'), 0o600);
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  mkdirSync(join(root, 'state'));
  fakes = spawn(process.execPath, [join(EXAMPLE, 'fakes/identity.mjs')], { stdio: 'ignore', env: {
    FAKES_PORT: String(port), FAKES_STATE: join(root, 'state'), AWS_KEY_ID: AWS_ID, AWS_SECRET, BROKER_GRANT: GRANT, CLERK_SECRET: CLERK,
    SECRETS_JSON: JSON.stringify({ 'notes/personas': JSON.stringify({ owner: 'sm-owner-value', stranger: 'sm-stranger-value' }), 'notes/plain': 'plain-value-xyz' }),
    PARAMETERS_JSON: JSON.stringify({ '/notes/owner': 'ssm-owner-value' }),
    CLERK_USERS_JSON: JSON.stringify({ user_alice: 'alice' }), OAUTH_CLIENTS_JSON: JSON.stringify({ ci: { secret: 'client-secret-1', sub: 'bob' } }),
  } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${origin}/health`)).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 50)); }
  throw new Error('fakes did not start');
});
afterAll(() => { fakes?.kill(); });

describe('resolver registry', () => {
  it('maps references to kinds and rejects unknown schemes', () => {
    expect(resolverKindOf('aws-sm://x#y')).toBe('aws-sm');
    expect(resolverKindOf('host_issued')).toBe('host_issued');
    expect(() => resolverKindOf('vault://x')).toThrow(ResolverError);
  });
});

describe('env and file resolvers', () => {
  it('reads env vars and reports a fix when missing', async () => {
    expect((await resolveSecret('env:OWNER_TOKEN', ctx({ OWNER_TOKEN: 'from-env-value' }))).value.reveal()).toBe('from-env-value');
    const probe = await probeSecret('env:MISSING_ONE', ctx());
    expect(probe).toMatchObject({ kind: 'env', state: 'missing' });
    expect(probe.fix).toContain('MISSING_ONE');
  });
  it('reads a dotenv key inside the project and refuses paths outside it', async () => {
    expect((await resolveSecret('file:.env.local#OWNER_TOKEN', ctx())).value.reveal()).toBe('dotenv-owner-value');
    expect((await probeSecret('file:.env.local#NOPE', ctx())).state).toBe('missing');
    await expect(resolveSecret('file:../outside.env#X', ctx())).rejects.toMatchObject({ code: 'secret_ref_invalid' });
  });
});

describe('AWS resolvers (SigV4 against a fake with its own verifier)', () => {
  it('signs requests that verify independently', () => {
    const headers = signRequest({ method: 'POST', url: `${origin}/`, body: '{}', service: 'secretsmanager', region: 'us-east-1', credentials: { accessKeyId: AWS_ID, secretAccessKey: AWS_SECRET, source: 't' }, headers: { 'content-type': 'application/x-amz-json-1.1' } });
    expect(verifySignature({ method: 'POST', url: `${origin}/`, headers, body: '{}', secretAccessKey: AWS_SECRET })).toBe(true);
    expect(verifySignature({ method: 'POST', url: `${origin}/`, headers, body: '{"x":1}', secretAccessKey: AWS_SECRET })).toBe(false);
  });
  it('resolves a JSON field from Secrets Manager and a parameter from SSM', async () => {
    expect((await resolveSecret('aws-sm://notes/personas#stranger', ctx())).value.reveal()).toBe('sm-stranger-value');
    expect((await resolveSecret('aws-sm://notes/plain', ctx())).value.reveal()).toBe('plain-value-xyz');
    expect((await resolveSecret('aws-ssm:///notes/owner', ctx())).value.reveal()).toBe('ssm-owner-value');
  });
  it('probes with metadata calls and maps failures to typed states', async () => {
    expect((await probeSecret('aws-sm://notes/personas#owner', ctx())).state).toBe('resolvable');
    expect((await probeSecret('aws-sm://notes/absent', ctx())).state).toBe('missing');
    expect((await probeSecret('aws-ssm:///notes/absent', ctx())).state).toBe('missing');
    const bad = await probeSecret('aws-sm://notes/personas', ctx({ AWS_ACCESS_KEY_ID: AWS_ID, AWS_SECRET_ACCESS_KEY: 'wrong' }));
    expect(bad.state).toBe('expired');
    expect(bad.fix).toContain('aws sso login');
    await expect(resolveSecret('aws-sm://notes/personas#nobody', ctx())).rejects.toMatchObject({ code: 'secret_missing' });
  });
  it('walks the credential chain: env, shared file, then an expired SSO session with the login fix', async () => {
    expect((await awsCredentials({ env: env({ AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }), fetch, signal: AbortSignal.timeout(1000) })).source).toBe('environment');
    expect((await awsCredentials({ env: env(), fetch, signal: AbortSignal.timeout(1000) })).source).toContain('shared credentials');
    writeFileSync(join(root, 'sso-config'), '[profile sso]\nsso_start_url = https://example.awsapps.com/start\nsso_region = us-east-1\nsso_account_id = 1\nsso_role_name = r\n');
    await expect(awsCredentials({ env: env({ AWS_PROFILE: 'sso', AWS_CONFIG_FILE: join(root, 'sso-config') }), fetch, signal: AbortSignal.timeout(1000) }))
      .rejects.toMatchObject({ code: 'secret_expired', fix: 'aws sso login --profile sso' });
    expect(parseIni('[a]\nk = v ; not comment\n# c\n').get('a')).toEqual({ k: 'v ; not comment' });
  });
});

describe('1Password resolver (op read via a fake CLI)', () => {
  it('reads a field and probes without reading it', async () => {
    expect((await resolveSecret('op://vault/observer/token', ctx())).value.reveal()).toBe('op-token-value-1');
    expect((await probeSecret('op://vault/observer/token', ctx())).state).toBe('resolvable');
    expect((await probeSecret('op://vault/observer/password', ctx())).state).toBe('missing');
  });
  it('reports a signed-out CLI as expired with the signin fix, and a missing binary as unavailable', async () => {
    const probe = await probeSecret('op://vault/observer/token', ctx({ OP_FAKE_SIGNED_OUT: '1' }));
    expect(probe).toMatchObject({ state: 'expired', fix: 'eval $(op signin)' });
    await expect(resolveSecret('op://vault/observer/token', ctx({ TRACEGROVE_OP_BIN: join(root, 'no-such-op') }))).rejects.toMatchObject({ code: 'secret_store_unavailable' });
  });
});

describe('OrgX persona broker (wire contract against the fake)', () => {
  it('mints with POST, checks with GET and revokes with DELETE', async () => {
    const minted = await resolveSecret('orgx-broker://staging?role=owner&ttl=120', ctx());
    expect(minted.subject).toMatch(/^owner-tp_/);
    expect(minted.owned).toMatchObject({ entityKey: 'persona.owner', boundaryId: 'identity' });
    expect(Date.parse(minted.expiresAt!)).toBeGreaterThan(Date.now());
    expect(minted.browserEntry?.reveal()).toMatch(/^\/sign-in\?ticket=tok_/);
    expect(String(minted.browserEntry)).not.toContain('ticket=');
    expect(await minted.check!(AbortSignal.timeout(2000))).toBe('valid');
    expect(await minted.revoke!(AbortSignal.timeout(2000))).toMatchObject({ confirmed: true });
    expect(await minted.check!(AbortSignal.timeout(2000))).toBe('revoked');
  });
  it('probes capabilities and maps refusals', async () => {
    expect((await probeSecret('orgx-broker://staging?role=owner', ctx())).state).toBe('resolvable');
    expect((await probeSecret('orgx-broker://production?role=owner', ctx())).state).toBe('denied');
    expect((await probeSecret('orgx-broker://staging?role=admin', ctx())).state).toBe('missing');
    expect((await probeSecret('orgx-broker://staging', ctx({ TRACEGROVE_ORGX_TOKEN: 'wrong' }))).state).toBe('expired');
    expect((await probeSecret('orgx-broker://staging', ctx({ TRACEGROVE_ORGX_TOKEN: '' }))).state).toBe('missing');
    await expect(resolveSecret('orgx-broker://production?role=owner', ctx())).rejects.toMatchObject({ code: 'secret_access_denied' });
    await expect(resolveSecret('orgx-broker://staging?ttl=0', ctx())).rejects.toMatchObject({ code: 'secret_ref_invalid' });
  });
});

describe('auth recipes', () => {
  const recipeCtx = (allow = true) => ({ origin, fetch, signal: AbortSignal.timeout(5000), secretExpiresAt: null, allowHost: () => allow });
  it('bearer and header wrap the secret without exposing it', async () => {
    const bearer = await applyRecipe({ kind: 'bearer' }, Secret.of('bearer-value-1'), recipeCtx());
    expect(bearer.bearer?.reveal()).toBe('bearer-value-1');
    const header = await applyRecipe({ kind: 'header', name: 'X-Api-Key', prefix: 'k ' }, Secret.of('header-value-1'), recipeCtx());
    expect(header.headers['x-api-key']?.reveal()).toBe('k header-value-1');
    expect(JSON.stringify({ recipe: header.recipe })).not.toContain('header-value-1');
  });
  it('oauth_client_credentials exchanges a client secret for an expiring token', async () => {
    const cred = await applyRecipe({ kind: 'oauth_client_credentials', tokenUrl: `${origin}/oauth/token`, clientId: 'ci' }, Secret.of('client-secret-1'), recipeCtx());
    expect(cred.bearer?.reveal()).toMatch(/^tok_/);
    expect(cred.expiresAt).not.toBeNull();
    await expect(applyRecipe({ kind: 'oauth_client_credentials', tokenUrl: `${origin}/oauth/token`, clientId: 'ci' }, Secret.of('wrong-secret'), recipeCtx())).rejects.toMatchObject({ code: 'auth_recipe_failed' });
  });
  it('clerk_testing signs in through testing token, ticket and session JWT', async () => {
    const cred = await applyRecipe({ kind: 'clerk_testing', backendApi: origin, frontendApi: origin, userId: 'user_alice' }, Secret.of(CLERK), recipeCtx());
    expect(cred.recipe).toBe('clerk_testing');
    expect(cred.expiresAt).not.toBeNull();
  });
  it('refuses to send a secret to a host outside the allowlist', async () => {
    await expect(applyRecipe({ kind: 'oauth_client_credentials', tokenUrl: `${origin}/oauth/token`, clientId: 'ci' }, Secret.of('client-secret-1'), recipeCtx(false)))
      .rejects.toBeInstanceOf(RecipeError);
    await expect(applyRecipe({ kind: 'oauth_client_credentials', tokenUrl: `${origin}/oauth/token`, clientId: 'ci' }, Secret.of('client-secret-1'), recipeCtx(false)))
      .rejects.toMatchObject({ code: 'origin_not_allowed' });
  });
});
