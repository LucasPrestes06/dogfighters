// Shared game simulation. The SERVER runs one Match per room (authoritative); solo mode runs the very same
// Match locally. Clients only send inputs and render snapshots/events - nothing here is decided by a client.
import {
  ARENA_W, ARENA_H, ARENA_MARGIN, MAX_PLAYERS,
  PLAYER_SPEED, PLAYER_TURN, AIM_EPSILON, PLAYER_HEALTH, PLAYER_RADIUS, INVULN_TIME, SPAWN_INVULN, RESPAWN_TIME, PLAYER_KILL_SCORE,
  FIRE_RATE, MAX_AMMO, RELOAD_TIME, BULLET_SPEED, BULLET_LIFE, BULLET_DAMAGE,
  ENEMY_SPEED, ENEMY_TURN, ENEMY_HP, ENEMY_RADIUS, ENEMY_SCORE, ENEMY_EVADE_DIST, ENEMY_FIRE_COOLDOWN,
  ENEMY_BULLET_SPEED, ENEMY_BULLET_LIFE, MAX_ENEMIES,
} from './constants.js';
import { wrapPi, clamp, segDist, rand, TAU } from './utils.js';

const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// Constant-speed flight: the aim only decides the DIRECTION. Also used by the client for local prediction.
// The plane is kept inside the arena; at a wall it slides along it.
export function stepMovement(s, ax, ay, dt) {
  ax = clamp(ax, ARENA_MARGIN, ARENA_W - ARENA_MARGIN); ay = clamp(ay, ARENA_MARGIN, ARENA_H - ARENA_MARGIN);
  const dx = ax - s.x, dy = ay - s.y, near = dx * dx + dy * dy <= AIM_EPSILON * AIM_EPSILON;
  if (!near) s.aimAngle = Math.atan2(dy, dx);                   // else keep the last valid direction
  s.angle = wrapPi(s.angle + clamp(wrapPi(s.aimAngle - s.angle), -PLAYER_TURN * dt, PLAYER_TURN * dt));
  const nx = s.x + Math.cos(s.angle) * PLAYER_SPEED * dt, ny = s.y + Math.sin(s.angle) * PLAYER_SPEED * dt;
  s.x = clamp(nx, ARENA_MARGIN, ARENA_W - ARENA_MARGIN); s.y = clamp(ny, ARENA_MARGIN, ARENA_H - ARENA_MARGIN);
  // pressed against a wall with the aim right on the border: turn back toward the arena instead of sticking
  if (near && (s.x !== nx || s.y !== ny)) s.aimAngle = Math.atan2(ARENA_H / 2 - s.y, ARENA_W / 2 - s.x);
}

export class Match {
  constructor({ respawn = false } = {}) {
    this.respawn = respawn; this.time = 0; this.nextBullet = 1; this.nextEnemy = 1;
    this.players = new Map(); this.enemies = []; this.bullets = []; this.events = [];
    this.kills = 0; this.spawnT = 1.5;
  }
  emit(ev) { ev.t = r2(this.time); this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  addPlayer(id, nick) {
    const slot = this.players.size, a = slot / MAX_PLAYERS * TAU + Math.PI / 4, cx = ARENA_W / 2, cy = ARENA_H / 2, r = ARENA_H * 0.3;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, h = Math.atan2(cy - y, cx - x);
    const p = { id, nick, x, y, angle: h, aimAngle: h, hp: PLAYER_HEALTH, ammo: MAX_AMMO, reloading: false, reloadT: 0, fireT: 0,
      inv: this.respawn ? SPAWN_INVULN : 0, alive: true, deadT: 0, score: 0, kills: 0, inT: 0, in: { x: cx, y: cy, f: 0, s: -1 } };
    this.players.set(id, p); return p;
  }
  removePlayer(id) { this.players.delete(id); }
  // Untrusted input: validated, clamped and de-duplicated by sequence number.
  setInput(id, d) {
    const p = this.players.get(id);
    if (!p || !d || !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isInteger(d.s) || d.s <= p.in.s) return;
    p.in.s = d.s; p.in.x = clamp(d.x, 0, ARENA_W); p.in.y = clamp(d.y, 0, ARENA_H); p.in.f = d.f ? 1 : 0; p.inT = this.time;
  }

  step(dt) {
    this.time += dt;
    for (const p of this.players.values()) this.stepPlayer(p, dt);
    for (const e of this.enemies) if (!e.dead) this.stepEnemy(e, dt);
    this.stepBullets(dt);
    this.ram();
    this.spawnEnemies(dt);
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  stepPlayer(p, dt) {
    if (!p.alive) { if (this.respawn && (p.deadT -= dt) <= 0) this.respawnPlayer(p); return; }
    p.inv = Math.max(0, p.inv - dt);
    stepMovement(p, p.in.x, p.in.y, dt);
    if (this.time - p.inT > 1.5) p.in.f = 0;                        // stale input (tab hidden / lag): stop firing
    p.fireT = Math.max(p.fireT - dt, -dt);
    if (p.reloading) {
      p.reloadT += dt;
      if (p.reloadT >= RELOAD_TIME) { p.reloading = false; p.ammo = MAX_AMMO; p.reloadT = 0; }
    } else if (p.in.f && p.ammo > 0 && p.fireT <= 0) {               // fire direction: plane -> crosshair
      this.fireBullet(p.id, false, p.x + Math.cos(p.aimAngle) * 10, p.y + Math.sin(p.aimAngle) * 10, p.aimAngle + (Math.random() - 0.5) * 0.05);
      p.ammo--; p.fireT += FIRE_RATE;
      if (p.ammo === 0) { p.reloading = true; p.reloadT = 0; }
    }
  }
  respawnPlayer(p) {
    const x = rand(40, ARENA_W - 40), y = rand(40, ARENA_H - 40), h = Math.atan2(ARENA_H / 2 - y, ARENA_W / 2 - x);
    Object.assign(p, { x, y, angle: h, aimAngle: h, hp: PLAYER_HEALTH, ammo: MAX_AMMO, reloading: false, reloadT: 0, fireT: 0, inv: SPAWN_INVULN, alive: true });
    this.emit({ k: 's', id: p.id });
  }

  fireBullet(owner, enemy, x, y, a) {
    const sp = enemy ? ENEMY_BULLET_SPEED : BULLET_SPEED, dx = Math.cos(a), dy = Math.sin(a);
    const b = { id: this.nextBullet++, o: owner, en: enemy, x, y, px: x, py: y, vx: dx * sp, vy: dy * sp, life: enemy ? ENEMY_BULLET_LIFE : BULLET_LIFE };
    this.bullets.push(b);
    this.emit({ k: 'f', b: b.id, o: owner, x: r1(x), y: r1(y), a: r2(a) });
  }

  stepBullets(dt) {
    const keep = [];
    for (const b of this.bullets) {
      b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H) continue;   // expired / left the arena
      if (!this.bulletHit(b)) keep.push(b);
    }
    this.bullets = keep;
  }
  bulletHit(b) {                                                  // swept test: fast bullets never tunnel
    if (!b.en) {
      for (const e of this.enemies) {
        if (e.dead || segDist(b.px, b.py, b.x, b.y, e.x, e.y) >= ENEMY_RADIUS + 1) continue;
        this.emit({ k: 'h', b: b.id, x: r1(b.x), y: r1(b.y), s: b.o });
        e.hp -= BULLET_DAMAGE; if (e.hp <= 0) this.killEnemy(e, b.o);
        return true;
      }
    }
    for (const p of this.players.values()) {
      if (!p.alive || p.id === b.o || segDist(b.px, b.py, b.x, b.y, p.x, p.y) >= PLAYER_RADIUS + 1) continue;
      this.emit({ k: 'h', b: b.id, x: r1(b.x), y: r1(b.y), s: b.o });
      this.hurtPlayer(p, b.en ? null : b.o);
      return true;
    }
    return false;
  }

  hurtPlayer(p, by) {
    if (!p.alive || p.inv > 0) return;                            // invulnerable planes absorb the bullet
    p.hp--; p.inv = INVULN_TIME; this.emit({ k: 'u', id: p.id });
    if (p.hp > 0) return;
    p.alive = false; p.deadT = RESPAWN_TIME;
    this.emit({ k: 'x', v: 'p', id: p.id, x: r1(p.x), y: r1(p.y), by });
    const killer = by && this.players.get(by); if (killer) { killer.score += PLAYER_KILL_SCORE; killer.kills++; }
  }
  killEnemy(e, byId) {
    e.dead = true; this.emit({ k: 'x', v: 'e', id: e.id, x: r1(e.x), y: r1(e.y) });
    const p = byId && this.players.get(byId); if (p) { p.score += ENEMY_SCORE; p.kills++; }
    this.kills++;
  }

  stepEnemy(e, dt) {
    let tgt = null, bd = 1e9;
    for (const p of this.players.values()) { if (!p.alive) continue; const d = Math.hypot(p.x - e.x, p.y - e.y); if (d < bd) { bd = d; tgt = p; } }
    let want = e.angle, toP = e.angle;
    if (tgt) { toP = Math.atan2(tgt.y - e.y, tgt.x - e.x); want = bd < ENEMY_EVADE_DIST ? toP + e.side * 1.2 : toP; }
    e.angle = wrapPi(e.angle + clamp(wrapPi(want - e.angle), -ENEMY_TURN * dt, ENEMY_TURN * dt));
    e.x = clamp(e.x + Math.cos(e.angle) * e.speed * dt, 8, ARENA_W - 8); e.y = clamp(e.y + Math.sin(e.angle) * e.speed * dt, 8, ARENA_H - 8);
    if (!tgt) return;
    e.cd -= dt;
    if (e.burst > 0) {
      if ((e.burstT -= dt) <= 0) { this.fireBullet(e.id, true, e.x + Math.cos(e.angle) * 10, e.y + Math.sin(e.angle) * 10, e.angle); e.burst--; e.burstT = 0.1; }
    } else if (e.cd <= 0 && bd < 140 && Math.abs(wrapPi(toP - e.angle)) < 0.15) {
      e.burst = 3; e.burstT = 0; e.cd = ENEMY_FIRE_COOLDOWN + rand(0, 1);
    }
  }
  ram() {
    for (const p of this.players.values()) {
      if (!p.alive || p.inv > 0) continue;
      for (const e of this.enemies) {
        if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) >= ENEMY_RADIUS + PLAYER_RADIUS - 2) continue;
        this.hurtPlayer(p, null); this.killEnemy(e, null); break;
      }
    }
  }
  spawnEnemies(dt) {
    const alive = [...this.players.values()].filter(p => p.alive);
    if (!alive.length || (this.spawnT -= dt) > 0) return;
    if (this.enemies.length >= Math.min(MAX_ENEMIES, 1 + alive.length + Math.floor(this.kills / 4))) return;
    let x = 0, y = 0;                                              // spawn on the arena border, away from players
    for (let i = 0; i < 10; i++) {
      const side = (Math.random() * 4) | 0;
      if (side < 2) { x = rand(20, ARENA_W - 20); y = side === 0 ? ARENA_MARGIN : ARENA_H - ARENA_MARGIN; }
      else { y = rand(20, ARENA_H - 20); x = side === 2 ? ARENA_MARGIN : ARENA_W - ARENA_MARGIN; }
      if (alive.every(p => Math.hypot(p.x - x, p.y - y) > 100)) break;
    }
    this.enemies.push({ id: 'E' + this.nextEnemy++, x, y, angle: Math.atan2(ARENA_H / 2 - y, ARENA_W / 2 - x), hp: ENEMY_HP,
      side: Math.random() < 0.5 ? -1 : 1, speed: ENEMY_SPEED * rand(0.9, 1.15), cd: rand(0.5, 1.5), burst: 0, burstT: 0, dead: false });
    this.spawnT = 1.2;
  }

  // Compact state sent to clients (bullets travel as 'f'ire events and are simulated on both sides).
  snapshot() {
    return {
      t: r2(this.time),
      p: [...this.players.values()].map(p => [p.id, r1(p.x), r1(p.y), r2(p.angle), p.hp, p.ammo, p.reloading ? r2(p.reloadT / RELOAD_TIME) : -1,
        p.alive ? 1 : 0, p.score, p.kills, p.inv > 0 ? 1 : 0, p.alive ? 0 : r1(Math.max(0, p.deadT))]),
      e: this.enemies.map(e => [e.id, r1(e.x), r1(e.y), r2(e.angle), e.hp]),
    };
  }
}
