import { randomUUID } from 'node:crypto';

export function send(res, status, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': randomUUID(), 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; if (data.length > 65536) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}
