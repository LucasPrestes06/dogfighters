// Pooled bullets with pixel tracer rendering and swept-collision data (previous position).
import { MAX_BULLETS, BULLET_SPEED, BULLET_LIFE, ENEMY_BULLET_SPEED, ENEMY_BULLET_LIFE } from './constants.js';

export const OWNER_PLAYER = 0, OWNER_ENEMY = 1;
const TRACER = [[0xfff3a0, 0xffc21f, 0xff8a1f, 0xe8173c], [0xffffff, 0xff7ab0, 0xe8173c, 0x8a1650]];

export class BulletPool {
  constructor() {
    this.list = Array.from({ length: MAX_BULLETS }, () => ({ active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, dx: 0, dy: 0, life: 0, owner: 0 }));
  }
  fire(x, y, ang, owner) {
    for (const b of this.list) {
      if (b.active) continue;
      const sp = owner === OWNER_PLAYER ? BULLET_SPEED : ENEMY_BULLET_SPEED;
      b.active = true; b.owner = owner; b.x = b.px = x; b.y = b.py = y;
      b.dx = Math.cos(ang); b.dy = Math.sin(ang); b.vx = b.dx * sp; b.vy = b.dy * sp;
      b.life = owner === OWNER_PLAYER ? BULLET_LIFE : ENEMY_BULLET_LIFE;
      return b;
    }
    return null;
  }
  reset() { for (const b of this.list) b.active = false; }
  update(dt) {
    for (const b of this.list) {
      if (!b.active) continue;
      b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
      if ((b.life -= dt) <= 0) b.active = false;
    }
  }
  draw(g) {
    for (const b of this.list) {
      if (!b.active) continue;
      const c = TRACER[b.owner];
      for (let j = 8; j >= 1; j--) { // tail, drawn first so the head stays on top
        g.fillStyle(c[Math.min(3, 1 + (j >> 1))], 1);
        g.fillRect(Math.round(b.x - b.dx * j * 1.4), Math.round(b.y - b.dy * j * 1.4), 1, 1);
      }
      g.fillStyle(c[0], 1); g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
    }
  }
}
