// Enemy biplanes: pursuit AI with limited turn rate, short bursts of fire.
import { ENEMY_SPEED, ENEMY_TURN, ENEMY_HP, ENEMY_EVADE_DIST, ENEMY_FIRE_COOLDOWN } from './constants.js';
import { OWNER_ENEMY } from './bullet.js';
import { wrapPi, angleIndex, clamp, rand } from './utils.js';

export class Enemy {
  constructor(scene, bullets, fx) {
    this.bullets = bullets; this.fx = fx; this.alive = false;
    this.shadow = scene.add.image(0, 0, 'sh_0').setDepth(4).setVisible(false);
    this.img = scene.add.image(0, 0, 'en_0_0').setDepth(9).setVisible(false);
  }
  spawn(x, y, ang) {
    Object.assign(this, { x, y, angle: ang, hp: ENEMY_HP, alive: true, side: Math.random() < 0.5 ? -1 : 1,
      speed: ENEMY_SPEED * rand(0.9, 1.15), cd: rand(0.5, 1.5), burst: 0, burstT: 0, propT: Math.random(), smokeT: 0 });
    this.img.setVisible(true); this.shadow.setVisible(true);
  }
  update(dt, p) {
    if (!this.alive) return;
    const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy), toP = Math.atan2(dy, dx);
    const want = dist < ENEMY_EVADE_DIST ? toP + this.side * 1.2 : toP; // break away after a pass
    this.angle = wrapPi(this.angle + clamp(wrapPi(want - this.angle), -ENEMY_TURN * dt, ENEMY_TURN * dt));
    this.x += Math.cos(this.angle) * this.speed * dt; this.y += Math.sin(this.angle) * this.speed * dt;

    if (p.alive) {
      this.cd -= dt;
      if (this.burst > 0) {
        if ((this.burstT -= dt) <= 0) {
          this.bullets.fire(this.x + Math.cos(this.angle) * 10, this.y + Math.sin(this.angle) * 10, this.angle, OWNER_ENEMY);
          this.burst--; this.burstT = 0.1;
        }
      } else if (this.cd <= 0 && dist < 140 && Math.abs(wrapPi(toP - this.angle)) < 0.15) {
        this.burst = 3; this.burstT = 0; this.cd = ENEMY_FIRE_COOLDOWN + rand(0, 1);
      }
    }
    if (this.hp <= 1 && (this.smokeT -= dt) <= 0) { this.smokeT = 0.08; this.fx.smoke(this.x, this.y); }

    this.propT += dt;
    const i = angleIndex(this.angle);
    this.img.setTexture(`en_${i}_${(this.propT * 25 | 0) & 1}`).setPosition(Math.round(this.x), Math.round(this.y));
    this.shadow.setTexture(`sh_${i}`).setPosition(Math.round(this.x) + 6, Math.round(this.y) + 9);
  }
  hit(dmg) { this.hp -= dmg; if (this.hp <= 0) { this.kill(); return true; } return false; }
  kill() { this.alive = false; this.img.setVisible(false); this.shadow.setVisible(false); }
}
