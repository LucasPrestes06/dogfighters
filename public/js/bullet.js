// Client-side bullet visuals. Bullets are created from server 'fire' events, move with the same
// speed/lifetime/arena rules as the simulation and are removed by server 'hit' events.
import { MAX_BULLETS, BULLET_SPEED, BULLET_LIFE, ENEMY_BULLET_SPEED, ENEMY_BULLET_LIFE, ARENA_W, ARENA_H } from './constants.js';

export const OWNER_PLAYER = 0, OWNER_ENEMY = 1;
const TRACER = [[0xfff3a0, 0xffc21f, 0xff8a1f, 0xe8173c], [0xffffff, 0xff7ab0, 0xe8173c, 0x8a1650]];

export class BulletPool {
  constructor() {
    this.list = Array.from({ length: MAX_BULLETS }, () => ({ active: false, id: 0, x: 0, y: 0, vx: 0, vy: 0, dx: 0, dy: 0, life: 0, owner: 0 }));
  }
  spawn(id, x, y, ang, owner, age = 0) {
    for (const b of this.list) {
      if (b.active) continue;
      const sp = owner === OWNER_PLAYER ? BULLET_SPEED : ENEMY_BULLET_SPEED;
      b.active = true; b.id = id; b.owner = owner; b.dx = Math.cos(ang); b.dy = Math.sin(ang); b.vx = b.dx * sp; b.vy = b.dy * sp;
      b.x = x + b.vx * age; b.y = y + b.vy * age; b.life = (owner === OWNER_PLAYER ? BULLET_LIFE : ENEMY_BULLET_LIFE) - age;
      return b;
    }
    return null;
  }
  kill(id) { for (const b of this.list) if (b.active && b.id === id) { b.active = false; return; } }
  reset() { for (const b of this.list) b.active = false; }
  update(dt) {
    for (const b of this.list) {
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if ((b.life -= dt) <= 0 || b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H) b.active = false;
    }
  }
  draw(g) {
    for (const b of this.list) {
      if (!b.active) continue;
      const c = TRACER[b.owner];
      for (let j = 8; j >= 1; j--) {
        g.fillStyle(c[Math.min(3, 1 + (j >> 1))], 1);
        g.fillRect(Math.round(b.x - b.dx * j * 1.4), Math.round(b.y - b.dy * j * 1.4), 1, 1);
      }
      g.fillStyle(c[0], 1); g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
    }
  }
}
