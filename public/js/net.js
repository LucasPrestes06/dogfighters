// Socket.IO client wrapper + nickname rules (keep validateNick in sync with server.js).
export const NICK_MIN = 3, NICK_MAX = 16;
const NICK_RE = /^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/;
const KEY = 'dogfighters.nick';

export function validateNick(raw) {
  const nick = String(raw == null ? '' : raw).trim();
  if (nick.length === 0) return { ok: false, error: 'DIGITE UM NICK' };
  if (nick.length < NICK_MIN) return { ok: false, error: 'NICK MUITO CURTO: MIN 3' };
  if (nick.length > NICK_MAX) return { ok: false, error: 'NICK MUITO LONGO: MAX 16' };
  if (!NICK_RE.test(nick)) return { ok: false, error: 'USE LETRAS NUMEROS - _ E ESPACOS' };
  return { ok: true, nick };
}
function load() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

export const Net = {
  nick: load(), pid: null, room: null, log: [], notice: '', socket: null, handlers: {},

  connect() {
    if (this.socket || typeof io === 'undefined') return;
    const s = (this.socket = io());
    s.on('hello', d => { this.pid = d.pid; });
    s.on('room:update', r => { this.room = r; this.fire('update', r); });
    s.on('room:event', e => { this.log.push(e.text); if (this.log.length > 3) this.log.shift(); });
    s.on('room:started', r => { this.room = r; this.fire('started', r); });
    s.on('disconnect', () => {
      const had = !!this.room; this.room = null; this.log = []; this.pid = null;
      if (had) { this.notice = 'CONEXAO PERDIDA'; this.fire('disconnect'); }
    });
  },
  get connected() { return !!this.socket && this.socket.connected; },
  on(name, fn) { this.handlers[name] = fn; },
  clear() { this.handlers = {}; },
  fire(name, arg) { if (this.handlers[name]) this.handlers[name](arg); },

  request(ev, data) {
    return new Promise(resolve => {
      if (!this.connected) return resolve({ ok: false, error: 'SEM CONEXAO COM O SERVIDOR' });
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: 'SERVIDOR NAO RESPONDEU' }); } }, 5000);
      this.socket.emit(ev, data || {}, r => { if (done) return; done = true; clearTimeout(t); resolve(r || { ok: false, error: 'ERRO' }); });
    });
  },
  setNick(n) { this.nick = n; try { sessionStorage.setItem(KEY, n); } catch (e) { /* storage unavailable */ } },
  async create(nick) { const r = await this.request('room:create', { nick }); if (r.ok) { this.setNick(r.nick); this.room = r.room; this.log = []; } return r; },
  async join(code, nick) { const r = await this.request('room:join', { code, nick }); if (r.ok) { this.setNick(r.nick); this.room = r.room; this.log = []; } return r; },
  start() { return this.request('room:start'); },
  leave() { if (this.socket && this.room) this.socket.emit('room:leave'); this.room = null; this.log = []; },
};
