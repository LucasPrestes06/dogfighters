// Where the match state comes from: NetSource (server, online) or LocalSource (same Match run locally, solo).
// Both feed a Timeline of snapshots that the scene interpolates, and call onEvent() for reliable events.
import { Match } from './sim.js';
import { TICK_RATE, INTERP_DELAY, INPUT_RATE } from './constants.js';
import { clamp } from './utils.js';

const nowS = () => performance.now() / 1000;

function parse(s) {
  const pm = new Map(), em = new Map();
  for (const a of s.p) pm.set(a[0], { x: a[1], y: a[2], angle: a[3], hp: a[4], ammo: a[5], rl: a[6], alive: a[7] === 1, score: a[8], kills: a[9], inv: a[10] === 1, rt: a[11] });
  for (const a of s.e) em.set(a[0], { x: a[1], y: a[2], angle: a[3], hp: a[4] });
  return { t: s.t, pm, em };
}

// Buffer of server snapshots + a smoothed estimate of the server clock (separate from the render clock).
export class Timeline {
  constructor() { this.snaps = []; this.offset = null; this.lastRecv = 0; }
  push(raw) {
    const s = parse(raw), last = this.last();
    if (last && s.t <= last.t) return;                       // duplicate / out-of-order packet: ignore
    this.snaps.push(s); if (this.snaps.length > 30) this.snaps.shift();
    this.lastRecv = performance.now();
    const sample = s.t - nowS();
    this.offset = this.offset === null ? sample : this.offset + (sample - this.offset) * 0.05;
  }
  get ready() { return this.snaps.length > 0; }
  last() { return this.snaps[this.snaps.length - 1]; }
  renderTime() { return clamp(nowS() + this.offset - INTERP_DELAY, this.snaps[0].t, this.last().t); }
  pair(rt) {
    const s = this.snaps; let hi = s.length - 1;
    while (hi > 0 && s[hi - 1].t >= rt) hi--;
    if (hi === 0) return { a: s[0], b: s[0], k: 0 };
    const a = s[hi - 1], b = s[hi];
    return { a, b, k: clamp((rt - a.t) / ((b.t - a.t) || 1), 0, 1) };
  }
}

export class NetSource {
  constructor(net, myId) {
    this.net = net; this.myId = myId; this.tl = new Timeline(); this.lat = 0.05; this.seq = 0;
    this.sendT = 0; this.lastF = 0; this.pingT = 0; this.onEvent = null;
    this.onS = s => this.tl.push(s);
    this.onE = list => { if (Array.isArray(list) && this.onEvent) for (const e of list) this.onEvent(e); };
    net.socket.on('g:s', this.onS); net.socket.on('g:e', this.onE);
  }
  update(dt) {
    if ((this.pingT -= dt) > 0) return;
    this.pingT = 2; const t = Date.now();
    this.net.socket.emit('png', t, () => { this.lat += ((Date.now() - t) / 2000 - this.lat) * 0.3; }); // one-way latency (s)
  }
  sendInput(ax, ay, fire) {
    const now = performance.now(), f = fire ? 1 : 0;
    if (f === this.lastF && now - this.sendT < 1000 / INPUT_RATE) return;     // throttled; fire changes go out at once
    this.sendT = now; this.lastF = f;
    this.net.socket.volatile.emit('in', { s: ++this.seq, x: Math.round(ax * 10) / 10, y: Math.round(ay * 10) / 10, f });
  }
  close() { this.net.socket.off('g:s', this.onS); this.net.socket.off('g:e', this.onE); }
}

export class LocalSource {
  constructor(myId, nick) {
    this.myId = myId; this.lat = 0; this.seq = 0; this.acc = 0; this.onEvent = null;
    this.match = new Match({ respawn: false }); this.match.addPlayer(myId, nick);
    this.tl = new Timeline(); this.tl.push(this.match.snapshot());
  }
  update(dt) {
    this.acc += dt;
    while (this.acc >= 1 / TICK_RATE) {
      this.acc -= 1 / TICK_RATE; this.match.step(1 / TICK_RATE);
      this.tl.push(this.match.snapshot());
      for (const e of this.match.drainEvents()) if (this.onEvent) this.onEvent(e);
    }
  }
  sendInput(ax, ay, fire) { this.match.setInput(this.myId, { s: ++this.seq, x: ax, y: ay, f: fire ? 1 : 0 }); }
  close() {}
}
