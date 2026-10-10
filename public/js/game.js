// Match scene: fixed camera on a finite arena; renders server snapshots (online) or the local Match (solo).
import { W, H, ARENA_W, ARENA_H } from './constants.js';
import { Effects, Sky } from './effects.js';
import { BulletPool, OWNER_PLAYER, OWNER_ENEMY } from './bullet.js';
import { PlaneView, Predictor } from './player.js';
import { EnemyView } from './enemy.js';
import { Input } from './input.js';
import { Hud, drawText, textWidth } from './ui.js';
import { Sfx } from './audio.js';
import { Net } from './net.js';
import { NetSource, LocalSource } from './sync.js';
import { wrapPi } from './utils.js';

const PALETTES = ['p2', 'p3', 'p4'];                 // remote players get their own colours; you are always red
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => a + wrapPi(b - a) * k;

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(data) { this.online = !!(data && data.online); this.nick = (data && data.nick) || 'PILOT'; }

  create() {
    if (this.online && (!Net.room || !Net.socket || !Net.pid)) { this.scene.start('Menu'); return; }
    this.cameras.main.setBackgroundColor('#0b2a5c');
    this.sky = new Sky(this); this.arenaG = this.add.graphics().setDepth(-5); this.layout = '';
    this.fx = new Effects(); this.bullets = new BulletPool(); this.g = this.add.graphics().setDepth(12);
    this.keys = new Input(this); this.hud = new Hud(this);
    this.cross = this.add.image(W >> 1, H >> 1, 'crosshair').setScrollFactor(0).setDepth(200);
    this.input.setDefaultCursor('none');
    this.aim = { x: 0, y: 0 }; this.views = new Map(); this.enemies = new Map(); this.pred = new Predictor();
    this.feed = []; this.notice = ''; this.noticeT = 0; this.deadT = 0; this.prevReload = false; this.lastGun = 0;

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
    if (this.online) {
      Net.on('disconnect', () => this.scene.start('Menu'));
      Net.on('event', t => { this.notice = t; this.noticeT = this.time.now + 3000; });
      Net.on('update', r => { for (const p of r.players) this.meta.set(p.pid, p.nick); });
      Net.socket.emit('game:ready');                  // scene is built: the server starts the match when everyone is ready
    }
    Sfx.unlock(); Sfx.startEngine();
    this.events.once('shutdown', () => { this.src.close(); Net.clear(); Sfx.stopEngine(); this.input.setDefaultCursor('default'); });
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
      case 'u': if (ev.id === this.myId) Sfx.play('hurt'); break;
      case 'x':
        this.fx.explosion(ev.x, ev.y); Sfx.play('boom');
        if (ev.v === 'p') {
          const v = this.meta.get(ev.id) || '?', k = ev.by && this.meta.get(ev.by);
          this.feed.push({ text: k ? `${k} DERRUBOU ${v}` : `${v} FOI ABATIDO`, until: this.time.now + 4000 });
          if (this.feed.length > 3) this.feed.shift();
        }
        break;
      case 's': if (ev.id === this.myId) this.pred.has = false; break;    // respawn: re-sync prediction
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
    const tl = this.src.tl, g = this.g; g.clear();
    if (!tl.ready) { this.hud.waiting(time / 1000); return; }

    const aim = this.keys.worldAim(this.aim);                      // screen -> world (camera is fixed, zoom is 1)
    this.src.sendInput(aim.x, aim.y, this.keys.fire);
    const rt = tl.renderTime(), { a, b, k } = tl.pair(rt), last = tl.last(), me = last.pm.get(this.myId);

    // Local plane: predicted every frame, corrected toward the server state.
    if (me) {
      const v = this.planeView(this.myId);
      if (!me.alive) { this.pred.has = false; v.set(this.pred.x, this.pred.y, this.pred.angle, false, false, 0, dt); }
      else {
        if (!this.pred.has) this.pred.snap(me);
        this.pred.step(dt, aim.x, aim.y);
        this.pred.reconcile(dt, me, (performance.now() - tl.lastRecv) / 1000 + this.src.lat);
        v.set(this.pred.x, this.pred.y, this.pred.angle, true, me.inv, me.hp, dt);
      }
    }
    // Remote planes: interpolated between two snapshots.
    for (const [id, bs] of b.pm) {
      if (id === this.myId) continue;
      const as = a.pm.get(id) || bs;
      this.planeView(id).set(lerp(as.x, bs.x, k), lerp(as.y, bs.y, k), lerpAng(as.angle, bs.angle, k), bs.alive, bs.inv, bs.hp, dt);
    }
    for (const [id, v] of this.views) if (!last.pm.has(id)) { v.destroy(); this.views.delete(id); }   // left the match

    // Enemies (simulated by the server / local Match)
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
    const hudMe = me || { hp: 0, ammo: 0, reloading: false, reloadProgress: 1 };
    if (me) { hudMe.reloading = me.rl >= 0; hudMe.reloadProgress = me.rl >= 0 ? me.rl : 1; }
    if (me && me.alive) {
      if (hudMe.reloading && !this.prevReload) Sfx.play('reload');
      if (!hudMe.reloading && this.prevReload) Sfx.play('reloadDone');
    }
    this.prevReload = hudMe.reloading;
    this.feed = this.feed.filter(f => f.until > now);
    const lines = this.feed.map(f => f.text); if (now < this.noticeT) lines.push(this.notice);
    const x = { feed: lines };
    if (this.online) x.board = [...last.pm].map(([id, p]) => [this.meta.get(id) || '?', p.score, id === this.myId]).sort((p, q) => q[1] - p[1]);
    if (me && !me.alive && this.online) x.banner = ['ABATIDO', `RENASCE EM ${Math.ceil(me.rt)}`];
    this.hud.draw(hudMe, me ? me.score : 0, me ? me.kills : 0, time / 1000, x);

    if (!this.online && me && !me.alive && (this.deadT += dt) > 1.8) this.scene.start('GameOver', { score: me.score, kills: me.kills, nick: this.nick });
  }
}
