/** Minimal AWS Signature Version 4 for JSON-protocol POSTs (Secrets Manager, SSM). */
import { createHash, createHmac } from 'node:crypto';

export type AwsCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string | undefined; expiration?: string | null; source: string };

const hash = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function signRequest(input: { method: string; url: string; headers: Record<string, string>; body: string; service: string; region: string; credentials: AwsCredentials; now?: Date }): Record<string, string> {
  const url = new URL(input.url);
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: url.host, 'x-amz-date': amzDate };
  if (input.credentials.sessionToken) headers['x-amz-security-token'] = input.credentials.sessionToken;
  headers['x-amz-content-sha256'] = hash(input.body);
  const names = Object.keys(headers).sort();
  const canonicalQuery = [...url.searchParams.entries()].map(([k, v]) => [encode(k), encode(v)] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalPath = url.pathname.split('/').map(segment => encode(decodeURIComponent(segment))).join('/') || '/';
  const canonical = [input.method.toUpperCase(), canonicalPath, canonicalQuery, ...names.map(n => `${n}:${headers[n]}`), '', names.join(';'), headers['x-amz-content-sha256']].join('\n');
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.credentials.secretAccessKey}`, date), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/** Recompute the signature of a received request; local fakes use it to reject unsigned or mis-signed calls. */
export function verifySignature(input: { method: string; url: string; headers: Record<string, string | undefined>; body: string; secretAccessKey: string }): boolean {
  const auth = input.headers.authorization ?? '';
  const match = auth.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/);
  if (!match) return false;
  const [, accessKeyId, , region, service, signed] = match as unknown as [string, string, string, string, string, string];
  const amz = input.headers['x-amz-date'] ?? '';
  const now = new Date(Date.UTC(+amz.slice(0, 4), +amz.slice(4, 6) - 1, +amz.slice(6, 8), +amz.slice(9, 11), +amz.slice(11, 13), +amz.slice(13, 15)));
  if (Number.isNaN(now.getTime()) || Math.abs(Date.now() - now.getTime()) > 15 * 60_000) return false;
  const reserved = new Set(['host', 'x-amz-date', 'x-amz-content-sha256', 'x-amz-security-token']);
  const kept = Object.fromEntries(signed.split(';').filter(n => !reserved.has(n)).map(n => [n, input.headers[n] ?? '']));
  const again = signRequest({ method: input.method, url: input.url, headers: kept, body: input.body, service, region, now,
    credentials: { accessKeyId, secretAccessKey: input.secretAccessKey, sessionToken: input.headers['x-amz-security-token'], source: 'verify' } });
  return again.authorization === auth;
}
