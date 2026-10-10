// Pixel particles (pooled), wingtip contrails and the scrolling sky.
import { W, H, MAX_PARTICLES } from './constants.js';
import { rand } from './utils.js';

export class Effects {
  constructor() {
    this.p = Array.from({ length: MAX_PARTICLES }, () => ({ a: false, x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 1, c: null, s: 1, d: 0 }));
    this.cur = 0;
  }
  emit(x, y, vx, vy, life, cols, size, drag = 0) {
    const n = this.p.length;
    for (let i = 0; i < n; i++) {
      const q = this.p[(this.cur + i) % n];
      if (!q.a) { Object.assign(q, { a: true, x, y, vx, vy, l: life, m: life, c: cols, s: size, d: drag }); this.cur = (this.cur + i + 1) % n; return; }
    }
  }
  reset() { for (const q of this.p) q.a = false; }
  muzzle(x, y, ang) {
    for (let i = 0; i < 3; i++) this.emit(x + Math.cos(ang) * i * 2, y + Math.sin(ang) * i * 2, 0, 0, 0.06, [0xffffff, 0xffd21f], 2 - (i > 0 ? 1 : 0));
  }
  hit(x, y) { for (let i = 0; i < 5; i++) { const a = rand(0, 6.28), v = rand(20, 60); this.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.1, 0.25), [0xffffff, 0xffd21f, 0xff8a1f], 1); } }
  smoke(x, y) { this.emit(x, y, rand(-6, 6), rand(-6, 6), rand(0.5, 0.9), [0xe8eefc, 0xa9b3c9, 0x6b7390], 2); }
  explosion(x, y) {
    for (let i = 0; i < 5; i++) this.emit(x + rand(-3, 3), y + rand(-3, 3), 0, 0, 0.16, [0xffffff, 0xfff3a0], 5);
    for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), v = rand(15, 75);
      this.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.75), [0xfff3a0, 0xffd21f, 0xff8a1f, 0xe8173c, 0x6a2a4a, 0x3a3a4a], 3, 2.5); }
    for (let i = 0; i < 8; i++) { const a = rand(0, 6.28), v = rand(5, 25);
      this.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.8, 1.3), [0x6b7390, 0x4a5170], 3, 1.5); }
  }
  update(dt) {
    for (const q of this.p) {
      if (!q.a) continue;
      q.l -= dt; if (q.l <= 0) { q.a = false; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.d) { const k = Math.max(0, 1 - q.d * dt); q.vx *= k; q.vy *= k; }
    }
  }
  draw(g) {
    for (const q of this.p) {
      if (!q.a) continue;
      const t = 1 - q.l / q.m, col = q.c[Math.min(q.c.length - 1, Math.floor(t * q.c.length))];
      const s = t > 0.7 && q.s > 1 ? q.s - 1 : q.s;
      g.fillStyle(col, 1); g.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), s, s);
    }
  }
}

// Ring-buffer contrail drawn as single pixels (white -> pale blue with age).
export class Trail {
  constructor(n) { this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.head = 0; this.count = 0; }
  push(x, y) { this.x[this.head] = x; this.y[this.head] = y; this.head = (this.head + 1) % this.n; this.count = Math.min(this.n, this.count + 1); }
  drain() { this.count = Math.max(0, this.count - 1); }
  clear() { this.count = 0; }
  draw(g) {
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - 1 - k + this.n * 2) % this.n, a = k / this.n;
      g.fillStyle(a < 0.4 ? 0xffffff : a < 0.75 ? 0xd6eeff : 0x9fd4ff, 1);
      g.fillRect(Math.round(this.x[i]), Math.round(this.y[i]), 1, 1);
    }
  }
}

// Two parallax tile layers: far ground marks and nearer clouds.
export class Sky {
  constructor(scene) {
    this.g = scene.add.tileSprite(0, 0, W, H, 'ground').setOrigin(0).setScrollFactor(0).setDepth(-20);
    this.c = scene.add.tileSprite(0, 0, W, H, 'clouds').setOrigin(0).setScrollFactor(0).setDepth(-10);
  }
  scroll(x, y, drift = 0) {
    if (this.g.width !== W || this.g.height !== H) { this.g.setSize(W, H); this.c.setSize(W, H); } // window resized
    this.g.tilePositionX = Math.round(x * 0.5); this.g.tilePositionY = Math.round(y * 0.5);
    this.c.tilePositionX = Math.round(x * 0.85 + drift); this.c.tilePositionY = Math.round(y * 0.85);
  }
}
