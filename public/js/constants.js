// All tunable values live here (no magic numbers elsewhere).
export const BASE_W = 320, BASE_H = 180;  // reference resolution used to pick the pixel zoom
export let W = BASE_W, H = BASE_H;        // current logical view size (live bindings, updated on resize)
export function setViewSize(w, h) { W = w; H = h; }
export const ANGLES = 16;                 // pre-rendered plane rotations

export const PLAYER_SPEED = 88;           // px/s, CONSTANT while flying
export const PLAYER_TURN = 8;             // rad/s: how fast the heading swings toward the crosshair
// ---- Boost (hold SPACE). Server-authoritative; the client only sends the intent (see README "Boost").
export const BOOST_MAX_ENERGY = 100;      // full bar (units)
export const BOOST_SPEED_MULTIPLIER = 1.6; // x PLAYER_SPEED while boosting (88 -> 140.8 px/s); the normal speed is never changed
export const BOOST_DRAIN_RATE = 33.3;     // units/s while boosting  => ~3.0 s of boost with a full bar
export const BOOST_RECHARGE_DELAY = 0.8;  // s after releasing SPACE before energy starts coming back
export const BOOST_RECHARGE_RATE = 20;    // units/s once recharging (empty -> full in 5 s)
export const BOOST_EXHAUST_DELAY = 1.5;   // s of dead time after the bar hits 0 (longer than the normal delay)
export const BOOST_REARM_ENERGY = 30;     // after hitting 0 the boost stays locked until the bar refills to this value
export const AIM_EPSILON = 3;             // px: closer than this the last valid direction is kept

// ---- Arena & multiplayer (shared by the server and every client)
export const ARENA_W = 480, ARENA_H = 270; // finite world in logical pixels, always fully visible
export const ARENA_MARGIN = 10;           // planes stay this far from the border
export const ARENA_PAD = 10;              // extra view padding around the arena when fitting the window
export const TICK_RATE = 30;              // server simulation + snapshot rate (Hz)
export const INPUT_RATE = 30;             // client input messages per second (max)
export const INTERP_DELAY = 0.07;         // s: remote entities are rendered slightly in the past (interpolation)
export const PLAYER_KILL_SCORE = 200;     // legacy score for a player kill (FFA ranks by round wins instead)
// ---- Free For All
export const WIN_OPTIONS = [5, 10, 15];   // wins needed to take the match (host picks one in the lobby)
export const DEFAULT_WINS = 5;
export const MIN_PLAYERS = 2;             // minimum participants for an FFA round
export const ROUND_RESULTS_TIME = 5;      // s the round scoreboard stays up before the next round
export const RESPAWN_TIME = 3;            // s (online matches only)
export const READY_TIMEOUT = 6000;        // ms the server waits for all clients to load the match
// ---- Combat balance: HP is a 0..100 bar. There is NO invulnerability of any kind (no post-hit timer, no spawn shield).
export const PLAYER_HEALTH = 100;         // HP at the start of every round
export const DAMAGE_VS_PLAYER = 5;        // HP lost per bullet that hits a plane (player or enemy bullet) - see README "Balance"
export const DAMAGE_RAM = 20;             // HP lost when an enemy rams a player (solo)
export const DAMAGE_VS_ENEMY = 1;         // enemy planes have ENEMY_HP hits
export const LOW_HP = 30;                 // HP at or below which the UI warns (smoke / blinking bar); visual only
export const PLAYER_RADIUS = 6;

export const BULLET_SPEED = 260;          // px/s
export const BULLET_LIFE = 0.65;          // s
export const FIRE_RATE = 0.075;           // s between shots
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

export const MAX_PARTICLES = 500;
export const TRAIL_LENGTH = 70;
