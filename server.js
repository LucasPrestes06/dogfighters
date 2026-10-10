// DOGFIGHTERS server (Render): static files + Socket.IO rooms + AUTHORITATIVE match simulation.
// Run exactly ONE instance: rooms and matches live in this process' memory.
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { Match } from './public/js/sim.js';                 // same rules the solo mode runs locally
import { TICK_RATE, MAX_PLAYERS, READY_TIMEOUT } from './public/js/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000; // Render sets PORT; 10000 is only a safety default

// Render terminates TLS in a reverse proxy; WebSockets work out of the box (Socket.IO falls back to polling).
app.set('trust proxy', 1);
const io = new Server(server, {
  pingInterval: 25000, pingTimeout: 20000,     // keeps idle sockets alive through the proxy
  maxHttpBufferSize: 1e4,                      // messages are tiny; refuse big payloads
  // Same-origin by default. Set CORS_ORIGIN="https://site1,https://site2" only if the client is hosted elsewhere.
  cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',').map(s => s.trim()) } : undefined,
});

app.disable('x-powered-by');
// Phaser is served straight from node_modules (no CDN dependency).
app.use('/vendor/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist'), { maxAge: '7d' }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) })); // Render health check

// ---------------------------------------------------------------- nickname rules (keep in sync with public/js/net.js)
const NICK_MIN = 3, NICK_MAX = 16;
const NICK_RE = /^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/;
function validateNick(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return { ok: false, error: 'NICK INVALIDO' };
  const nick = raw.trim();
  if (nick.length === 0) return { ok: false, error: 'DIGITE UM NICK' };
  if (nick.length < NICK_MIN) return { ok: false, error: 'NICK MUITO CURTO: MIN 3' };
  if (nick.length > NICK_MAX) return { ok: false, error: 'NICK MUITO LONGO: MAX 16' };
  if (!NICK_RE.test(nick)) return { ok: false, error: 'USE LETRAS NUMEROS - _ E ESPACOS' };
  return { ok: true, nick };
}

// ---------------------------------------------------------------- rooms
// Identity = the socket connection (socket.id, never sent to other clients); `pid` is the public per-session id used
// inside matches. Nicknames are display-only, so duplicates are fine and permissions never depend on them.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 500, MAX_CONN_PER_IP = 30, EVENT_LIMIT = 30, EVENT_WINDOW = 5000, GAME_MSG_LIMIT = 100, JOIN_FAILS = 6, JOIN_WINDOW = 30000;
const rooms = new Map(); // code -> { code, status, hostId, members:[{id,pid,nick}], match, running, ready:Set, goTimer }
const ipCount = new Map();

function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const snapshot = r => ({ code: r.code, status: r.status, players: r.members.map(m => ({ pid: m.pid, nick: m.nick, host: m.id === r.hostId })) });
const broadcast = r => io.to(r.code).emit('room:update', snapshot(r));
const say = (r, text) => io.to(r.code).emit('room:event', { text });

function addMember(room, socket) {
  room.members.push({ id: socket.id, pid: socket.data.pid, nick: socket.data.nick });
  socket.join(room.code); socket.data.room = room.code;
}

// Ordered start: server creates the Match, tells clients to load, and begins ticking when everyone is ready
// (or after READY_TIMEOUT, so a client that never answers can't block the room).
function beginMatch(room) {
  if (room.running || !rooms.has(room.code)) return;
  clearTimeout(room.goTimer); room.running = true;
  io.to(room.code).emit('game:go');
}
function checkReady(room) { if (room.match && !room.running && room.members.every(m => room.ready.has(m.pid))) beginMatch(room); }

function leaveRoom(socket) {
  const room = rooms.get(socket.data.room);
  socket.data.room = null;
  if (!room) return;
  socket.leave(room.code);
  const i = room.members.findIndex(m => m.id === socket.id);
  if (i < 0) return;
  const [gone] = room.members.splice(i, 1);
  if (room.match) room.match.removePlayer(gone.pid);      // plane disappears from every client's snapshot
  room.ready.delete(gone.pid);
  if (room.members.length === 0) { clearTimeout(room.goTimer); rooms.delete(room.code); return; }
  say(room, `${gone.nick} SAIU DA SALA`);
  if (room.hostId === gone.id) { room.hostId = room.members[0].id; say(room, `${room.members[0].nick} E O NOVO HOST`); } // lobby role only
  broadcast(room); checkReady(room);                       // the simulation authority always stays on the server
}

// ---------------------------------------------------------------- authoritative game loop
const TICK_MS = 1000 / TICK_RATE;
let lastLoop = Date.now(), acc = 0;
setInterval(() => {
  const now = Date.now(); acc += Math.min(now - lastLoop, 250); lastLoop = now;   // fixed-step simulation clock
  let steps = 0;
  while (acc >= TICK_MS) {
    acc -= TICK_MS; steps++;
    for (const room of rooms.values()) if (room.running) room.match.step(1 / TICK_RATE);
  }
  if (!steps) return;
  for (const room of rooms.values()) {
    if (!room.running) continue;
    io.to(room.code).volatile.emit('g:s', room.match.snapshot());    // state: latest wins, stale packets may be dropped
    const ev = room.match.drainEvents();
    if (ev.length) io.to(room.code).emit('g:e', ev);                  // events (fire/hit/kill): reliable + ordered
  }
}, 10);

// Behind Render's proxy the client address is the first X-Forwarded-For entry (soft abuse guard only).
const clientIp = s => { const xf = s.handshake.headers['x-forwarded-for']; return typeof xf === 'string' ? xf.split(',')[0].trim() : null; };

io.on('connection', socket => {
  const ip = clientIp(socket);
  if (ip) {
    const n = (ipCount.get(ip) || 0) + 1;
    if (n > MAX_CONN_PER_IP) { socket.disconnect(true); return; }
    ipCount.set(ip, n);
    socket.on('disconnect', () => { const c = (ipCount.get(ip) || 1) - 1; if (c <= 0) ipCount.delete(ip); else ipCount.set(ip, c); });
  }
  // Rate limits: gameplay messages ('in', 'png') have their own generous per-second budget; everything else is stricter.
  let stamps = [], gCount = 0, gWin = Date.now();
  socket.use((args, next) => {
    const now = Date.now(), ev = args[0];
    if (ev === 'in' || ev === 'png') {
      if (now - gWin >= 1000) { gWin = now; gCount = 0; }
      if (++gCount > GAME_MSG_LIMIT) return;                           // drop silently
      return next();
    }
    stamps = stamps.filter(t => now - t < EVENT_WINDOW);
    if (stamps.length >= EVENT_LIMIT) {
      const ack = args[args.length - 1]; if (typeof ack === 'function') ack({ ok: false, error: 'MUITAS ACOES: AGUARDE' });
      return;
    }
    stamps.push(now); next();
  });

  socket.data.pid = crypto.randomBytes(4).toString('hex');
  socket.data.nick = null; socket.data.room = null;
  socket.emit('hello', { pid: socket.data.pid });
  const reply = (ack, payload) => { if (typeof ack === 'function') ack(payload); };
  const fail = (ack, error) => reply(ack, { ok: false, error });

  socket.on('room:create', (data, ack) => {
    if (socket.data.room) return fail(ack, 'VOCE JA ESTA EM UMA SALA');
    const v = validateNick(data && data.nick); if (!v.ok) return reply(ack, v);
    if (rooms.size >= MAX_ROOMS) return fail(ack, 'SERVIDOR CHEIO: TENTE MAIS TARDE');
    socket.data.nick = v.nick;
    const room = { code: newCode(), status: 'waiting', hostId: socket.id, members: [], match: null, running: false, ready: new Set(), goTimer: null };
    rooms.set(room.code, room); addMember(room, socket);
    reply(ack, { ok: true, nick: v.nick, room: snapshot(room) });
    broadcast(room);
  });

  socket.on('room:join', (data, ack) => {
    if (socket.data.room) return fail(ack, 'VOCE JA ESTA EM UMA SALA');
    data = data || {};
    const v = validateNick(data.nick); if (!v.ok) return reply(ack, v);
    const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
    // Throttle code guessing: after JOIN_FAILS wrong codes in JOIN_WINDOW the socket must wait.
    const now = Date.now(); socket.data.fails = (socket.data.fails || []).filter(t => now - t < JOIN_WINDOW);
    if (socket.data.fails.length >= JOIN_FAILS) return fail(ack, 'MUITAS TENTATIVAS: AGUARDE');
    if (!/^[A-Z0-9]{5}$/.test(code)) { socket.data.fails.push(now); return fail(ack, 'CODIGO INVALIDO'); }
    const room = rooms.get(code);
    if (!room) { socket.data.fails.push(now); return fail(ack, 'SALA NAO ENCONTRADA'); }
    if (room.status !== 'waiting') return fail(ack, 'PARTIDA JA INICIADA');
    if (room.members.length >= MAX_PLAYERS) return fail(ack, 'SALA CHEIA');
    socket.data.nick = v.nick;
    addMember(room, socket);
    reply(ack, { ok: true, nick: v.nick, room: snapshot(room) });
    say(room, `${v.nick} ENTROU NA SALA`); broadcast(room);
  });

  socket.on('room:leave', () => leaveRoom(socket));

  socket.on('room:start', (data, ack) => {
    const room = rooms.get(socket.data.room);
    if (!room) return fail(ack, 'VOCE NAO ESTA EM UMA SALA');
    if (room.hostId !== socket.id) return fail(ack, 'APENAS O HOST PODE INICIAR'); // authoritative permission check
    if (room.status !== 'waiting') return fail(ack, 'PARTIDA JA INICIADA');
    room.status = 'playing';
    room.match = new Match({ respawn: true });                                      // fresh state for every new match
    for (const m of room.members) room.match.addPlayer(m.pid, m.nick);
    room.ready = new Set(); room.running = false;
    room.goTimer = setTimeout(() => beginMatch(room), READY_TIMEOUT);
    reply(ack, { ok: true });
    io.to(room.code).emit('room:started', snapshot(room));                          // clients load the scene, then answer 'game:ready'
  });

  socket.on('game:ready', () => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.match || room.running) return;
    room.ready.add(socket.data.pid); checkReady(room);
  });

  // Player input: only aim position + fire intent. Validated/clamped inside Match.setInput; position, speed, ammo,
  // damage and score are never accepted from the client.
  socket.on('in', d => {
    const room = rooms.get(socket.data.room);
    if (room && room.running && d && typeof d === 'object') room.match.setInput(socket.data.pid, { s: d.s, x: d.x, y: d.y, f: d.f });
  });
  socket.on('png', (t, ack) => { if (typeof ack === 'function') ack(t); });     // latency probe

  // Validated nickname change request (allowed while in a room; everyone is notified).
  socket.on('nick:change', (data, ack) => {
    const v = validateNick(data && data.nick); if (!v.ok) return reply(ack, v);
    const room = rooms.get(socket.data.room);
    const old = socket.data.nick; socket.data.nick = v.nick;
    if (room) { const m = room.members.find(x => x.id === socket.id); if (m) m.nick = v.nick; say(room, `${old} AGORA E ${v.nick}`); broadcast(room); }
    reply(ack, { ok: true, nick: v.nick });
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => console.log(`DOGFIGHTERS listening on port ${PORT}`));

// Render sends SIGTERM on every deploy/restart: close cleanly (players are returned to the menu by the client).
function shutdown() {
  console.log('SIGTERM received, shutting down');
  io.close(() => process.exit(0));            // also closes the underlying HTTP server
  if (server.closeAllConnections) server.closeAllConnections(); // don't wait for idle keep-alive sockets
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
