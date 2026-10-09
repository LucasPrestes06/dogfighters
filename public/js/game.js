// Main gameplay scene: world, camera, spawning, collisions.
import { W, H, PLAYER_MARGIN, CAMERA_LERP, MAX_ENEMIES, SPAWN_MARGIN, ENEMY_RADIUS, PLAYER_RADIUS, BULLET_DAMAGE, ENEMY_SCORE } from './constants.js';
import { Effects, Sky } from './effects.js';
import { BulletPool, OWNER_PLAYER } from './bullet.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Input } from './input.js';
import { Hud, drawText, textWidth } from './ui.js';
import { Net } from './net.js';
import { Sfx } from './audio.js';
import { segDist, rand, clamp, TAU } from './utils.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(data) { this.nick = (data && data.nick) || null; }
  create() {
    this.sky = new Sky(this);
    this.input.keyboard.on('keydown-ESC', () => { Net.leave(); this.scene.start('Menu'); });
    this.fx = new Effects(); this.bullets = new BulletPool();
    this.g = this.add.graphics().setDepth(12);
    this.player = new Player(this, this.bullets, this.fx);
    this.enemies = Array.from({ length: MAX_ENEMIES }, () => new Enemy(this, this.bullets, this.fx));
    this.keys = new Input(this); this.hud = new Hud(this);
    this.score = 0; this.kills = 0; this.spawnT = 1.5; this.endT = 0;
    this.camX = -W / 2; this.camY = -H / 2;
    // Crosshair: one persistent sprite fixed to the screen; the native cursor is hidden.
    this.cross = this.add.image(W / 2, H / 2, 'crosshair').setScrollFactor(0).setDepth(200);
    this.input.setDefaultCursor('none');
    this.cameras.main.setBackgroundColor('#2b9cf2');
    Sfx.unlock(); Sfx.startEngine();
    this.events.once('shutdown', () => { Sfx.stopEngine(); this.input.setDefaultCursor('default'); });
  }

  spawnEnemies(dt) {
    const p = this.player, alive = this.enemies.filter(e => e.alive).length;
    const want = Math.min(MAX_ENEMIES, 2 + Math.floor(this.kills / 4));
    if ((this.spawnT -= dt) > 0 || alive >= want) return;
    const e = this.enemies.find(en => !en.alive); if (!e) return;
    const a = rand(0, TAU), dist = Math.hypot(W, H) / 2 + SPAWN_MARGIN;   // always just outside the (resizable) view
    e.spawn(p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist, a + Math.PI);
    this.spawnT = 1.2;
  }

  collide() {
    const p = this.player;
    for (const b of this.bullets.list) {
      if (!b.active) continue;
      if (b.owner === OWNER_PLAYER) {
        for (const e of this.enemies) {
          if (!e.alive || segDist(b.px, b.py, b.x, b.y, e.x, e.y) >= ENEMY_RADIUS + 1) continue;
          b.active = false; this.fx.hit(b.x, b.y); Sfx.play('hit');
          if (e.hit(BULLET_DAMAGE)) { this.score += ENEMY_SCORE; this.kills++; this.fx.explosion(e.x, e.y); Sfx.play('boom'); }
          break;
        }
      } else if (p.alive && segDist(b.px, b.py, b.x, b.y, p.x, p.y) < PLAYER_RADIUS + 1) {
        b.active = false; this.fx.hit(b.x, b.y); p.hurt();
      }
    }
    if (p.alive && p.inv <= 0) for (const e of this.enemies) {
      if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) < ENEMY_RADIUS + PLAYER_RADIUS - 2) { p.hurt(); e.kill(); this.fx.explosion(e.x, e.y); Sfx.play('boom'); break; }
    }
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05), p = this.player;
    if (p.alive) p.update(dt, this.keys); else { p.updateDead(); this.endT += dt; }
    this.bullets.update(dt);
    for (const e of this.enemies) e.update(dt, p);
    this.spawnEnemies(dt); this.collide(); this.fx.update(dt);

    // Smooth camera keeps the plane near the centre. The clamp pushes the camera so the plane can never
    // leave the visible area, without ever slowing the plane down (works for any window size).
    const k = Math.min(1, dt * CAMERA_LERP);
    this.camX += (p.x - W / 2 - this.camX) * k; this.camY += (p.y - H / 2 - this.camY) * k;
    this.camX = clamp(this.camX, p.x + PLAYER_MARGIN - W, p.x - PLAYER_MARGIN);
    this.camY = clamp(this.camY, p.y + PLAYER_MARGIN - H, p.y - PLAYER_MARGIN);
    const bx = Math.round(this.camX), by = Math.round(this.camY);
    if (p.alive) p.render();
    const sh = p.shake > 0 ? 1 : 0;
    const cx = bx + (sh ? Math.round(rand(-1, 1)) : 0), cy = by + (sh ? Math.round(rand(-1, 1)) : 0);
    this.cameras.main.setScroll(cx, cy); this.sky.scroll(cx, cy);

    const g = this.g; g.clear();
    this.cross.setPosition(Math.round(this.keys.screenX), Math.round(this.keys.screenY));
    p.drawTrails(g);
    if (p.alive && this.nick) drawText(g, this.nick, Math.round(p.x - textWidth(this.nick) / 2), Math.round(p.y) + 13, 0xffffff, 1, 0x0b2a5c); this.bullets.draw(g); this.fx.draw(g);
    this.hud.draw(p, this.score, this.kills, time / 1000);
    if (this.endT > 1.8) this.scene.start('GameOver', { score: this.score, kills: this.kills, nick: this.nick });
  }
}
