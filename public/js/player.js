// Player biplane: flies at constant speed; the crosshair only decides the DIRECTION. Left click fires toward it.
import { PLAYER_SPEED, PLAYER_TURN, AIM_EPSILON, PLAYER_HEALTH, INVULN_TIME, FIRE_RATE, MAX_AMMO, RELOAD_TIME, TRAIL_LENGTH } from './constants.js';
import { OWNER_PLAYER } from './bullet.js';
import { Trail } from './effects.js';
import { Sfx } from './audio.js';
import { wrapPi, angleIndex, clamp, rand } from './utils.js';

export class Player {
  constructor(scene, bullets, fx) {
    this.bullets = bullets; this.fx = fx; this.aim = { x: 0, y: 0 };
    this.shadow = scene.add.image(0, 0, 'sh_0').setDepth(5);
    this.img = scene.add.image(0, 0, 'pl_0_0').setDepth(10);
    this.trailL = new Trail(TRAIL_LENGTH); this.trailR = new Trail(TRAIL_LENGTH);
    this.reset();
  }
  reset() {
    Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, angle: 0, aimAngle: 0, hp: PLAYER_HEALTH, ammo: MAX_AMMO,
      reloading: false, reloadT: 0, fireT: 0, inv: 0, alive: true, propT: 0, trailAcc: 0, smokeT: 0, shake: 0 });
    this.trailL.clear(); this.trailR.clear(); this.img.setVisible(true); this.shadow.setVisible(true);
  }
  get reloadProgress() { return this.reloading ? this.reloadT / RELOAD_TIME : 1; }

  update(dt, input) {
    this.inv = Math.max(0, this.inv - dt); this.fireT -= dt; this.shake = Math.max(0, this.shake - dt);

    // Crosshair (world coords) -> desired direction. Distance never affects speed or stops the plane.
    input.worldAim(this.aim);
    const dx = this.aim.x - this.x, dy = this.aim.y - this.y;
    if (dx * dx + dy * dy > AIM_EPSILON * AIM_EPSILON) this.aimAngle = Math.atan2(dy, dx); // else keep last valid direction (no 0/0)
    // Heading swings smoothly toward the desired direction (rate-limited, frame-rate independent)
    this.angle = wrapPi(this.angle + clamp(wrapPi(this.aimAngle - this.angle), -PLAYER_TURN * dt, PLAYER_TURN * dt));
    // Velocity = unit heading vector * PLAYER_SPEED  =>  |v| is always exactly PLAYER_SPEED (diagonals included)
    this.vx = Math.cos(this.angle) * PLAYER_SPEED; this.vy = Math.sin(this.angle) * PLAYER_SPEED;
    this.x += this.vx * dt; this.y += this.vy * dt;

    // Weapon + reload (no shots while reloading)
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= RELOAD_TIME) { this.reloading = false; this.ammo = MAX_AMMO; Sfx.play('reloadDone'); }
    } else if (input.fire && this.ammo > 0 && this.fireT <= 0) {
      const ca = Math.cos(this.aimAngle), sa = Math.sin(this.aimAngle);
      const a = this.aimAngle + rand(-0.025, 0.025), mx = this.x + ca * 10, my = this.y + sa * 10;
      this.bullets.fire(mx, my, a, OWNER_PLAYER);          // direction: plane -> crosshair
      this.fx.muzzle(mx, my, this.aimAngle); Sfx.play('gun');
      this.ammo--; this.fireT = FIRE_RATE;
      if (this.ammo === 0) { this.reloading = true; this.reloadT = 0; Sfx.play('reload'); }
    }

    // Contrails at wingtips (fixed 60 Hz)
    this.trailAcc += dt;
    const px = -Math.sin(this.angle) * 7, py = Math.cos(this.angle) * 7;
    while (this.trailAcc >= 1 / 60) {
      this.trailAcc -= 1 / 60;
      this.trailL.push(this.x + px, this.y + py); this.trailR.push(this.x - px, this.y - py);
    }
    if (this.hp <= 2 && (this.smokeT -= dt) <= 0) { this.smokeT = 0.07; this.fx.smoke(this.x - Math.cos(this.angle) * 6, this.y - Math.sin(this.angle) * 6); }
    this.propT += dt;
  }
  // Sprite placement (whole pixels); called after the camera has been updated.
  render() {
    const i = angleIndex(this.angle);
    this.img.setTexture(`pl_${i}_${(this.propT * 25 | 0) & 1}`).setPosition(Math.round(this.x), Math.round(this.y));
    this.img.setVisible(this.inv <= 0 || ((this.inv * 20) | 0) % 2 === 0);
    this.shadow.setTexture(`sh_${i}`).setPosition(Math.round(this.x) + 6, Math.round(this.y) + 9);
  }
  updateDead() { this.trailL.drain(); this.trailR.drain(); }
  hurt() {
    if (this.inv > 0 || !this.alive) return;
    this.hp--; this.inv = INVULN_TIME; this.shake = 0.2; Sfx.play('hurt');
    if (this.hp <= 0) {
      this.alive = false; this.img.setVisible(false); this.shadow.setVisible(false);
      this.fx.explosion(this.x, this.y); Sfx.play('boom'); Sfx.stopEngine();
    }
  }
  drawTrails(g) { this.trailL.draw(g); this.trailR.draw(g); }
}
