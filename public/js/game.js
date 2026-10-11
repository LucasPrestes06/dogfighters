// Match scene: fixed camera on a finite arena; renders server snapshots (online FFA) or the local Match (solo).
// Online, the server owns rounds, eliminations, wins and the scoreboard ('g:phase'); this scene only presents them.
import { W, H, ARENA_W, ARENA_H } from './constants.js';
import { Effects, Sky } from './effects.js';
import { BulletPool, OWNER_PLAYER, OWNER_ENEMY } from './bullet.js';
import { PlaneView, Predictor } from './player.js';
import { EnemyView } from './enemy.js';
import { Input } from './input.js';
import { Hud, drawText, textWidth } from './ui.js';
import { drawRoundBoard, drawFinalBoard, PALETTE_COLORS } from './board.js';
import { Sfx } from './audio.js';
import { Net } from './net.js';
import { NetSource, LocalSource } from './sync.js';
import { wrapPi } from './utils.js';

const PALETTES = ['p2', 'p3', 'p4', 'p5', 'p6', 'p7'];   // remote players cycle through these colours; you are always red
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => a + wrapPi(b - a) * k;
const RESULTS_DELAY = 900, FINAL_DELAY = 1200;            // ms: let the last explosion play before the board appears (presentation only)

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(data) { this.online = !!(data && data.online); this.nick = (data && data.nick) || 'PILOT'; }

  create() {
    if (this.online && (!Net.room || !Net.socket || !Net.pid)) { this.scene.start('Menu'); return; }
    this.cameras.main.setBackgroundColor('#0b2a5c');
    this.sky = new Sky(this); this.arenaG = this.add.graphics().setDepth(-5); this.layout = '';
    this.fx = new Effects(); this.bullets = new BulletPool(); this.g = this.add.graphics().setDepth(12);
    this.keys = new Input(this); this.hud = new Hud(this);
    this.boardG = this.add.graphics().setScrollFactor(0).setDepth(150);
    this.cross = this.add.image(W >> 1, H >> 1, 'crosshair').setScrollFactor(0).setDepth(200);
    this.input.setDefaultCursor('none'); this.nativeCursor = false;
    this.aim = { x: 0, y: 0 }; this.views = new Map(); this.enemies = new Map(); this.pred = new Predictor();
    this.feed = []; this.notice = ''; this.noticeT = 0; this.deadT = 0; this.prevReload = false; this.lastGun = 0;
    // FFA state (all of it comes from the server's 'g:phase' messages)
    this.phase = this.online ? 'STARTING' : 'ROUND_ACTIVE'; this.round = 0; this.winsToWin = 0; this.sc = [];
    this.rw = null; this.mw = null; this.why = null; this.resultsDur = 5; this.phaseAt = 0; this.btns = []; this.lastHud = null;

    if (this.online) {                                // identities come from the room (pid = internal session id)
      this.myId = Net.pid; this.meta = new Map(Net.room.players.map(p => [p.pid, p.nick]));
      this.src = new NetSource(Net, this.myId);
    } else {
      this.myId = 'me'; this.meta = new Map([['me', this.nick]]);
      this.src = new LocalSource(this.myId, this.nick);
    }
    this.pal = new Map(); let n = 0;
    for (const id of this.meta.keys()) this.pal.set(id, id === this.myId ? 'pl' : PALETTES[n++ % PALETTES.length]);
    this.src.onEvent = ev => this.handleEvent(ev);

    this.input.keyboard.on('keydown-ESC', () => { Net.leave(); this.scene.start('Menu'); });
    this.input.on('pointerup', p => this.click(p));
    if (this.online) {
      Net.on('disconnect', () => this.scene.start('Menu'));
      Net.on('event', t => { this.notice = t; this.noticeT = this.time.now + 3000; });
      Net.on('update', r => this.syncRoster(r));
      Net.on('phase', d => this.onPhase(d));
      Net.on('lobby', () => this.scene.start('Lobby'));             // host sent the room back to the lobby
      Net.socket.emit('game:ready');                  // scene is built: the server starts round 1 when everyone is ready
    }
    Sfx.unlock(); Sfx.startEngine();
    this.events.once('shutdown', () => { this.src.close(); Net.clear(); Sfx.stopEngine(); this.input.setDefaultCursor('default'); });
  }

  // Players that left disappear from the roster (and from the scene); nicknames stay in sync.
  syncRoster(r) {
    const ids = new Set(r.players.map(p => p.pid));
    for (const p of r.players) this.meta.set(p.pid, p.nick);
    for (const id of [...this.meta.keys()]) if (!ids.has(id)) {
      this.meta.delete(id); const v = this.views.get(id); if (v) { v.destroy(); this.views.delete(id); }
    }
  }

  onPhase(d) {
    this.phase = d.ph; this.round = d.r; this.winsToWin = d.w; this.sc = d.sc; this.rw = d.rw; this.mw = d.mw; this.why = d.why;
    this.resultsDur = d.d; this.phaseAt = this.time.now;
    for (const [pid, nick] of d.sc) this.meta.set(pid, nick);
    if (d.ph === 'ROUND_ACTIVE') {                    // new round: clear everything left over from the previous one
      this.bullets.reset(); this.fx.reset(); this.src.tl.reset(); this.pred.has = false; this.feed = [];
      for (const v of this.views.values()) v.destroy();
      this.views.clear();
    }
  }

  click(p) {                                          // only the final board has clickable buttons
    if (this.phase !== 'MATCH_FINISHED') return;
    for (const b of this.btns) if (Math.abs(p.x - b.cx) <= b.w / 2 && Math.abs(p.y - b.cy) <= b.h / 2) { Sfx.unlock(); b.fn(); break; }
  }

  // Out-of-bounds area + hazard-striped border, redrawn only when the window size changes.
  drawArena(sx, sy) {
    const g = this.arenaG; g.clear();
    g.fillStyle(0x0b2a5c, 1);
    if (sy < 0) g.fillRect(sx, sy, W, -sy);
    if (sy + H > ARENA_H) g.fillRect(sx, ARENA_H, W, sy + H - ARENA_H);
    if (sx < 0) g.fillRect(sx, 0, -sx, ARENA_H);
    if (sx + W > ARENA_W) g.fillRect(ARENA_W, 0, sx + W - ARENA_W, ARENA_H);
    for (let i = 0; i < ARENA_W + 4; i += 8) {
      const c = (i >> 3) % 2 ? 0xffd21f : 0x8a1650;
      g.fillStyle(c, 1); g.fillRect(i - 2, -3, 8, 3); g.fillRect(i - 2, ARENA_H, 8, 3);
    }
    for (let i = 0; i < ARENA_H; i += 8) {
      const c = (i >> 3) % 2 ? 0xffd21f : 0x8a1650;
      g.fillStyle(c, 1); g.fillRect(-3, i, 3, 8); g.fillRect(ARENA_W, i, 3, 8);
    }
  }

  handleEvent(ev) {
    switch (ev.k) {
      case 'f': {                                     // a bullet was fired (by a player or an enemy)
        const enemy = ev.o.charAt(0) === 'E';
        this.bullets.spawn(ev.b, ev.x, ev.y, ev.a, enemy ? OWNER_ENEMY : OWNER_PLAYER, 0);
        if (!enemy) {
          this.fx.muzzle(ev.x, ev.y, ev.a);
          const now = this.time.now; if (now - this.lastGun > 35) { this.lastGun = now; Sfx.play('gun'); }
        }
        break;
      }
      case 'h': this.bullets.kill(ev.b); this.fx.hit(ev.x, ev.y); if (ev.s === this.myId) Sfx.play('hit'); break;
      case 'd': this.bullets.kill(ev.b); break;       // bullet dropped because its owner was eliminated
      case 'u': if (ev.id === this.myId) Sfx.play('hurt'); break;
      case 'x':
        this.fx.explosion(ev.x, ev.y); Sfx.play('boom');
        if (ev.v === 'p') {
          const v = this.meta.get(ev.id) || '?', k = ev.by && this.meta.get(ev.by);
          this.feed.push({ text: k ? `${k} DERRUBOU ${v}` : `${v} FOI ABATIDO`, until: this.time.now + 4000 });
          if (this.feed.length > 3) this.feed.shift();
        }
        break;
      case 's': if (ev.id === this.myId) this.pred.has = false; break;    // respawn (legacy mode): re-sync prediction
    }
  }

  planeView(id) {
    let v = this.views.get(id);
    if (!v) { v = new PlaneView(this, this.pal.get(id) || 'p2', this.fx, true, 2); this.views.set(id, v); }
    return v;
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05), now = this.time.now;
    // Fixed camera, centred on the arena (recomputed only because the window may be resized). No following, no parallax.
    const sx = Math.round(ARENA_W / 2 - W / 2), sy = Math.round(ARENA_H / 2 - H / 2);
    this.cameras.main.setScroll(sx, sy);
    const key = `${W}x${H}`; if (key !== this.layout) { this.layout = key; this.drawArena(sx, sy); }
    this.sky.scroll(sx, sy, time / 1000 * 4);                      // clouds drift slowly on their own
    this.cross.setPosition(Math.round(this.keys.screenX), Math.round(this.keys.screenY));
    this.src.update(dt);
    const tl = this.src.tl, g = this.g; g.clear(); this.boardG.clear(); this.btns = [];
    if (!tl.ready) { this.hud.waiting(time / 1000); return; }
    if (tl.fresh) {                                    // new round: wait for its first snapshot, keep the HUD steady
      if (this.lastHud) this.hud.draw(...this.lastHud); return;
    }

    const aim = this.keys.worldAim(this.aim);                      // screen -> world (camera is fixed, zoom is 1)
    if (!this.online || this.phase === 'ROUND_ACTIVE') this.src.sendInput(aim.x, aim.y, this.keys.fire);
    const rt = tl.renderTime(), { a, b, k } = tl.pair(rt), last = tl.last(), me = last.pm.get(this.myId);

    // Local plane: predicted every frame, corrected toward the server state. Eliminated players have no entry.
    const mv = this.planeView(this.myId);
    if (me && me.alive) {
      if (!this.pred.has) this.pred.snap(me);
      this.pred.step(dt, aim.x, aim.y);
      this.pred.reconcile(dt, me, (performance.now() - tl.lastRecv) / 1000 + this.src.lat);
      mv.set(this.pred.x, this.pred.y, this.pred.angle, true, me.inv, me.hp, dt);
    } else { this.pred.has = false; mv.set(this.pred.x, this.pred.y, this.pred.angle, false, false, 0, dt); }
    // Remote planes: interpolated between two snapshots. Not in the snapshot = eliminated this round (hidden).
    for (const id of this.meta.keys()) {
      if (id === this.myId) continue;
      const bs = b.pm.get(id);
      if (!bs) { const v = this.views.get(id); if (v) v.set(v.x, v.y, v.angle, false, false, 0, dt); continue; }
      const as = a.pm.get(id) || bs;
      this.planeView(id).set(lerp(as.x, bs.x, k), lerp(as.y, bs.y, k), lerpAng(as.angle, bs.angle, k), bs.alive, bs.inv, bs.hp, dt);
    }
    // Enemies exist only in solo mode (simulated by the local Match)
    const seen = new Set();
    const showEnemy = (id, as, bs) => {
      let v = this.enemies.get(id); if (!v) { v = new EnemyView(this, this.fx); this.enemies.set(id, v); }
      v.set(lerp(as.x, bs.x, k), lerp(as.y, bs.y, k), lerpAng(as.angle, bs.angle, k), true, false, bs.hp, dt); seen.add(id);
    };
    for (const [id, bs] of b.em) showEnemy(id, a.em.get(id) || bs, bs);
    if (k < 0.99) for (const [id, as] of a.em) if (!b.em.has(id)) showEnemy(id, as, as);
    for (const [id, v] of this.enemies) if (!seen.has(id)) { v.destroy(); this.enemies.delete(id); }

    this.bullets.update(dt); this.fx.update(dt);
    for (const v of this.views.values()) v.drawTrails(g);
    this.bullets.draw(g); this.fx.draw(g);
    for (const [id, v] of this.views) if (v.alive) {
      const nick = this.meta.get(id) || '?';
      drawText(g, nick, Math.round(v.x - textWidth(nick) / 2), Math.round(v.y) + 13, id === this.myId ? 0x7cfc9a : 0xffffff, 1, 0x0b2a5c);
    }

    // HUD from the authoritative state
    const hudMe = me ? { hp: me.hp, ammo: me.ammo, reloading: me.rl >= 0, reloadProgress: me.rl >= 0 ? me.rl : 1 } : { hp: 0, ammo: 0, reloading: false, reloadProgress: 1 };
    if (me && me.alive) {
      if (hudMe.reloading && !this.prevReload) Sfx.play('reload');
      if (!hudMe.reloading && this.prevReload) Sfx.play('reloadDone');
    }
    this.prevReload = hudMe.reloading;
    this.feed = this.feed.filter(f => f.until > now);
    const lines = this.feed.map(f => f.text); if (now < this.noticeT) lines.push(this.notice);
    const x = { feed: lines };
    if (this.online) {
      const mine = this.sc.find(s => s[0] === this.myId);
      x.scoreText = `VITORIAS: ${mine ? mine[2] : 0}/${this.winsToWin}`;
      x.killsText = `ROUND ${this.round}  VIVOS ${last.pm.size}`;
      x.board = this.sc.slice(0, 8).map(([pid, nick, wins]) => [nick, wins, pid === this.myId]);   // wins, in server order
      if (this.phase === 'ROUND_ACTIVE' && !me) x.banner = ['ELIMINADO', 'AGUARDE O FIM DO ROUND'];
      else if (this.phase === 'ROUND_ACTIVE' && now - this.phaseAt < 1500) x.banner = [`ROUND ${this.round}`, 'DERRUBE TODOS'];
    }
    this.lastHud = [hudMe, me ? me.score : 0, me ? me.kills : 0, time / 1000, x];
    this.hud.draw(...this.lastHud);

    // Scoreboards (server data only)
    let nativeCursor = false;
    if (this.online) {
      const d = { r: this.round, w: this.winsToWin, sc: this.sc, rw: this.rw, mw: this.mw, why: this.why, ph: this.phase, dur: this.resultsDur,
        elapsed: (now - this.phaseAt) / 1000, me: this.myId, color: id => PALETTE_COLORS[this.pal.get(id)] || 0xffffff, t: time / 1000 };
      if (this.phase === 'ROUND_RESULTS' && now - this.phaseAt > RESULTS_DELAY) drawRoundBoard(this.boardG, d);
      if (this.phase === 'MATCH_FINISHED' && now - this.phaseAt > FINAL_DELAY) {
        const host = Net.room && Net.room.players.some(p => p.host && p.pid === this.myId);
        this.btns = [];
        if (host) this.btns.push({ label: 'VOLTAR AO LOBBY', fn: async () => { const r = await Net.toLobby(); if (!r.ok) { this.notice = r.error; this.noticeT = this.time.now + 3000; } } });
        this.btns.push({ label: 'SAIR DA SALA', fn: () => { Net.leave(); this.scene.start('Menu'); } });
        drawFinalBoard(this.boardG, { ...d, host }, this.btns, this.input.activePointer);
        nativeCursor = true;                           // buttons: use the normal mouse cursor
      }
    }
    if (nativeCursor !== this.nativeCursor) { this.nativeCursor = nativeCursor; this.cross.setVisible(!nativeCursor); this.input.setDefaultCursor(nativeCursor ? 'default' : 'none'); }

    if (!this.online && me && !me.alive && (this.deadT += dt) > 1.8) this.scene.start('GameOver', { score: me.score, kills: me.kills, nick: this.nick });
  }
}
