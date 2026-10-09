// All tunable values live here (no magic numbers elsewhere).
export const BASE_W = 320, BASE_H = 180;  // reference resolution used to pick the pixel zoom
export let W = BASE_W, H = BASE_H;        // current logical view size (live bindings, updated on resize)
export function setViewSize(w, h) { W = w; H = h; }
export const ANGLES = 16;                 // pre-rendered plane rotations

export const PLAYER_SPEED = 88;           // px/s, CONSTANT while flying
export const PLAYER_TURN = 8;             // rad/s: how fast the heading swings toward the crosshair
export const AIM_EPSILON = 3;             // px: closer than this the last valid direction is kept
export const PLAYER_MARGIN = 12;          // px the plane is always kept inside the screen edges
export const CAMERA_LERP = 5;             // camera smoothing (1/s)
export const PLAYER_HEALTH = 5;
export const PLAYER_RADIUS = 6;
export const INVULN_TIME = 1.2;           // s

export const BULLET_SPEED = 260;          // px/s
export const BULLET_LIFE = 0.65;          // s
export const FIRE_RATE = 0.075;           // s between shots
export const BULLET_DAMAGE = 1;
export const MAX_AMMO = 30;
export const RELOAD_TIME = 2.0;           // s
export const MAX_BULLETS = 160;

export const ENEMY_SPEED = 52;
export const ENEMY_TURN = 1.5;
export const ENEMY_HP = 4;
export const ENEMY_RADIUS = 7;
export const ENEMY_SCORE = 100;
export const ENEMY_EVADE_DIST = 38;
export const ENEMY_FIRE_COOLDOWN = 1.6;
export const ENEMY_BULLET_SPEED = 120;
export const ENEMY_BULLET_LIFE = 1.5;
export const MAX_ENEMIES = 6;
export const SPAWN_MARGIN = 30;           // enemies spawn this far beyond the screen half-diagonal

export const MAX_PARTICLES = 500;
export const TRAIL_LENGTH = 70;
