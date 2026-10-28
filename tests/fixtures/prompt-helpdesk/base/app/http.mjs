export function send(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
export async function readBody(req) { let raw = ''; for await (const c of req) raw += c; try { return JSON.parse(raw || '{}'); } catch { return null; } }
