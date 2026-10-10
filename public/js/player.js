// Plane rendering (local + remote players) and client-side prediction of the local plane.
import { TRAIL_LENGTH, ARENA_W, ARENA_H, ARENA_MARGIN, PLAYER_SPEED } from './constants.js';
import { Trail } from './effects.js';
import { stepMovement } from './sim.js';
import { angleIndex, wrapPi, clamp } from './utils.js';

// Sprite + shadow + optional contrails + damage smoke. Pure view: it never decides anything about the match.
export class PlaneView {
  constructor(scene, pre, fx, trails, lowHp) {
    this.fx = fx; this.pre = pre; this.lowHp = lowHp;
    this.shadow = scene.add.image(0, 0, 'sh_0').setDepth(5);
    this.img = scene.add.image(0, 0, `${pre}_0_0`).setDepth(10);
    this.trails = trails ? [new Trail(TRAIL_LENGTH), new Trail(TRAIL_LENGTH)] : null;
    this.propT = Math.random(); this.acc = 0; this.smokeT = 0; this.x = 0; this.y = 0; this.angle = 0; this.alive = false;
  }
  set(x, y, angle, alive, inv, hp, dt) {
    this.x = x; this.y = y; this.angle = angle; this.alive = alive; this.propT += dt;
    this.img.setVisible(alive && (!inv || ((this.propT * 20) | 0) % 2 === 0)); this.shadow.setVisible(alive);
    if (alive) {
      const i = angleIndex(angle);
      this.img.setTexture(`${this.pre}_${i}_${(this.propT * 25 | 0) & 1}`).setPosition(Math.round(x), Math.round(y));
      this.shadow.setTexture(`sh_${i}`).setPosition(Math.round(x) + 6, Math.round(y) + 9);
      if (hp <= this.lowHp && (this.smokeT -= dt) <= 0) { this.smokeT = 0.07; this.fx.smoke(x - Math.cos(angle) * 6, y - Math.sin(angle) * 6); }
    }
    if (!this.trails) return;
    if (alive) {
      this.acc += dt;
      const px = -Math.sin(angle) * 7, py = Math.cos(angle) * 7;
      while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.trails[0].push(x + px, y + py); this.trails[1].push(x - px, y - py); }
    } else { this.trails[0].drain(); this.trails[1].drain(); }
  }
  drawTrails(g) { if (this.trails) { this.trails[0].draw(g); this.trails[1].draw(g); } }
  destroy() { this.img.destroy(); this.shadow.destroy(); }
}

// Local prediction: the plane responds instantly using the SAME movement rules as the server, then is
// gently pulled toward the (latency-compensated) authoritative position so it never drifts.
export class Predictor {
  constructor() { this.x = 0; this.y = 0; this.angle = 0; this.aimAngle = 0; this.has = false; }
  snap(s) { this.x = s.x; this.y = s.y; this.angle = s.angle; this.aimAngle = s.angle; this.has = true; }
  step(dt, ax, ay) { stepMovement(this, ax, ay, dt); }
  reconcile(dt, s, ahead) {
    const t = { x: clamp(s.x + Math.cos(s.angle) * PLAYER_SPEED * ahead, ARENA_MARGIN, ARENA_W - ARENA_MARGIN),
                y: clamp(s.y + Math.sin(s.angle) * PLAYER_SPEED * ahead, ARENA_MARGIN, ARENA_H - ARENA_MARGIN) };
    const ex = t.x - this.x, ey = t.y - this.y;
    if (Math.hypot(ex, ey) > 40) { this.snap(s); this.x = t.x; this.y = t.y; return; }  // large error: snap
    const k = Math.min(1, dt * 6);                                                        // small error: blend
    this.x += ex * k; this.y += ey * k; this.angle = wrapPi(this.angle + wrapPi(s.angle - this.angle) * k);
  }
}
