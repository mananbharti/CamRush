// CamRush server: serves the built game (dist/) and relays multiplayer messages between laptops on the same network.
// No dependencies. Usage: node scripts/serve.mjs   (port 4173, or PORT env)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = +(process.env.PORT || 4173);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.ico': 'image/x-icon' };

export const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/api/info') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ips: lanIps(), port: PORT })); }
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
});

// ---- minimal RFC 6455 websocket (text frames) ----
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const frame = (str) => { const b = Buffer.from(str); const n = b.length; const h = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const x = Buffer.alloc(10); x[0] = 0x81; x[1] = 127; x.writeBigUInt64BE(BigInt(n), 2); return x; })(); return Buffer.concat([h, b]); };
const rooms = new Map(); let nextId = 1;
const send = (c, o) => { if (!c.dead) try { c.sock.write(frame(JSON.stringify(o))); } catch { /* socket gone */ } };
const PAL = ['#ff4f7b', '#00e0ff', '#ffd36b', '#7dff6a', '#b18cff', '#ff9a3c', '#3c8bff', '#ff6bd6', '#2ee6c5', '#e8ff5a', '#ff5c5c', '#c0c8ff'];
const roomInfo = (r) => ({ t: 'room', code: r.code, players: r.members.map((m) => ({ id: m.id, name: m.name, host: m === r.host, color: m.color })) });
const freeColor = (r) => PAL.find((p) => !r.members.some((m) => m.color === p)) || PAL[0];
function leave(c) {
  if (c.dead) return; c.dead = true; const r = c.room; if (!r) return;
  r.members = r.members.filter((m) => m !== c);
  if (c === r.host) { r.members.forEach((m) => { send(m, { t: 'closed' }); m.room = null; }); rooms.delete(r.code); }
  else r.members.forEach((m) => send(m, roomInfo(r)));
}
function onMsg(c, m) {
  if (m.t === 'create') {
    let code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(code));
    const r = { code, host: c, members: [c] }; rooms.set(code, r); c.room = r; c.color = PAL[0]; c.name = String(m.name || 'Host').slice(0, 16); send(c, { t: 'hello', id: c.id, ips: lanIps(), port: PORT }); send(c, roomInfo(r));
  } else if (m.t === 'join') {
    const r = (m.code && rooms.get(String(m.code))) || (rooms.size === 1 ? [...rooms.values()][0] : null);
    if (!r) return send(c, { t: 'error', msg: 'No match found on this host. Ask the host to open Multiplayer > Host first.' });
    if (r.members.length >= 12) return send(c, { t: 'error', msg: 'Room is full (12 players).' });
    c.name = String(m.name || 'Player').slice(0, 16); c.color = freeColor(r); c.room = r; r.members.push(c); send(c, { t: 'hello', id: c.id }); r.members.forEach((x) => send(x, roomInfo(r)));
  } else if (m.t === 'msg' && c.room) {
    const out = { t: 'msg', from: c.id, d: m.d, to: m.to };
    c.room.members.forEach((x) => { if (x !== c && (m.to == null || m.to === x.id)) send(x, out); });
  } else if (m.t === 'ping') send(c, { t: 'pong', ts: m.ts });
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']; if (!key) return sock.destroy();
  sock.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + GUID).digest('base64'), '', ''].join('\r\n'));
  sock.setNoDelay(true);
  const c = { sock, id: nextId++, dead: false, room: null, name: '' }; let buf = Buffer.alloc(0);
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 128; if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null; off += masked ? 4 : 0;
      const payload = Buffer.from(buf.subarray(off, off + len)); if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + len);
      if (op === 8) { leave(c); return sock.end(); }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 1) { try { onMsg(c, JSON.parse(payload.toString())); } catch { /* bad json */ } }
    }
  });
  sock.on('close', () => leave(c)); sock.on('error', () => leave(c));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  CamRush is running.\n  This laptop:   http://localhost:' + PORT);
  for (const ip of lanIps()) console.log('  Other laptops: Multiplayer > Join, enter  ' + ip);
  console.log('');
});
