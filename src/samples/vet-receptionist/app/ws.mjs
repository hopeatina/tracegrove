// Minimal WebSocket server (RFC 6455 text frames) so the sample needs no dependencies.
import { createHash } from 'node:crypto';

export function acceptWebSocket(request, socket, onOpen) {
  const key = request.headers['sec-websocket-key'];
  if (!key || request.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const listeners = { message: [], close: [] };
  let buffer = Buffer.alloc(0); let open = true;
  const conn = {
    send(text) { if (open) socket.write(frame(0x1, Buffer.from(text))); },
    close() { if (!open) return; open = false; try { socket.end(frame(0x8, Buffer.alloc(0))); } catch { /* gone */ } listeners.close.forEach((fn) => fn()); },
    on(event, fn) { listeners[event].push(fn); },
  };
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const opcode = buffer[0] & 0x0f; const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f; let offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (length > 1 << 20) { conn.close(); return; }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      const payload = Buffer.from(buffer.subarray(offset + maskLength, offset + maskLength + length));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffer = buffer.subarray(offset + maskLength + length);
      if (opcode === 0x8) { conn.close(); return; }
      if (opcode === 0x9) { socket.write(frame(0xa, payload)); continue; }
      if (opcode === 0x1) listeners.message.forEach((fn) => fn(payload.toString('utf8')));
    }
  });
  socket.on('close', () => { if (open) { open = false; listeners.close.forEach((fn) => fn()); } });
  socket.on('error', () => socket.destroy());
  onOpen(conn);
}

function frame(opcode, payload) {
  const length = payload.length;
  const header = length < 126 ? Buffer.from([0x80 | opcode, length])
    : length < 65536 ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 0xff])
    : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(length)); return b; })()]);
  return Buffer.concat([header, payload]);
}
