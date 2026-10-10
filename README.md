# DOGFIGHTERS — Pixel Air Combat

Arcade biplane shooter in pixel art. Phaser 3 + Node/Express + Socket.IO. Hosted on **Render** (not run locally) — follow **DEPLOY_RENDER.md** step by step.

## Controls
- Mouse: move the crosshair; the plane always flies at constant speed toward it
- Left click (hold): machine gun toward the crosshair — 30 rounds, automatic 2 s reload
- ESC: leave the match / back to the menu

## Game modes
- **JOGAR SOLO**: the very same simulation (`sim.js`) runs locally with one player and enemies.
- **CRIAR SALA / ENTRAR EM SALA**: 5-character room code, up to 4 players, nicknames, lobby. The host starts the match; everyone plays in the same arena against each other and against enemies. Players respawn 3 s after being shot down. Score: enemy = 100, player = 200.

## Multiplayer architecture
```
client                              server (one Match per room)
mouse aim + fire  --'in' 30 Hz-->   validates/clamps input, ignores out-of-order seq
                                    fixed 30 Hz simulation: movement, arena limits, ammo, reload,
                                    bullets, collisions, damage, kills, enemies, score, respawn
renders interpolated snapshots <--'g:s' (volatile, 30/s)-- compact state of planes + enemies
spawns/removes tracers, FX     <--'g:e' (reliable, ordered)-- fire / hit / hurt / explosion / respawn
```
- **One rule set**: `public/js/sim.js` is imported by BOTH the server and the client (solo mode and prediction), so the rules exist once.
- **Server authority**: clients only send aim position + fire intent. Position, speed, ammo, damage, hp, score and kills are never accepted from a client (verified by tests).
- **Smoothness**: remote planes and enemies are interpolated ~70 ms in the past between two snapshots (out-of-order/duplicate snapshots are dropped); your own plane is predicted locally with the same movement code and gently corrected toward the latency-compensated server state (snap if the error is > 40 px). The server clock and the render clock are separate, so clients with different FPS see the same match.
- **Ordered start**: host `room:start` -> server creates a fresh Match and emits `room:started` -> each client builds the scene and answers `game:ready` -> server emits `game:go` and starts ticking. A 6 s timeout prevents a silent client from blocking the room.
- **Isolation**: all traffic goes through Socket.IO rooms; nothing is shared between rooms. Leaving/disconnecting removes the plane from every client. When the host leaves, only the lobby host role moves; the simulation stays on the server. A room with no players is deleted, and every new match starts from a clean state.
- **Limits/abuse guards**: per-socket rate limits (gameplay messages have their own budget), wrong-code throttling, max 500 rooms, max 30 connections per IP, 10 KB max message.

## Arena, camera and zoom
- Finite arena of **480 x 270** logical pixels (`ARENA_W/H`), shared by every client; planes are contained by the server (and predicted identically on the client) and slide along the borders; bullets leaving the arena are removed; enemies spawn on the border inside the arena. The border is drawn as a yellow/red hazard frame and everything outside is dark "out of bounds".
- **Fixed camera** centred on the arena: no following, no parallax (only the clouds drift slowly on their own). Pixel scale is chosen so the whole arena (+10 px padding) always fits the window; extra window space is shown as out-of-bounds, never cropping or stretching sprites. The view covers about 1.5x more world than before (zoomed out).
- Mouse -> world conversion uses the fixed camera scroll, so the crosshair and the aim stay aligned after resizing.

## Deploy (Render)
See **DEPLOY_RENDER.md**. Build Command `npm install`, Start Command `npm start`, health check `/health`, **one instance only** (rooms and matches live in memory; scaling out would need a shared store + Socket.IO Redis adapter). `package.json` now has `"type": "module"` (the server imports the shared simulation); no other deploy change is needed. Node 18+.

## Known limitations
- Your own shots are drawn when the server confirms them (about one network round trip), so tracers can start a few frames after the click on slow connections; movement itself is predicted and instant.
- Server and clients are not rolled back/lag-compensated: on high latency a bullet that looks like a hit on your screen can miss (the server decides).
- Matches have no end condition (free-for-all with respawn); the room stays "playing" until everyone leaves.
- Browser-side behaviour (rendering, pixel scaling, real mouse) was exercised with a headless harness, not in a real browser; see the delivery notes.

## Structure
```
server.js              Express static + Socket.IO rooms + authoritative game loop
render.yaml            Render Blueprint
public/js/sim.js       SHARED simulation (Match, stepMovement) - server + solo + prediction
public/js/constants.js all tunables (arena, speeds, tick rate, interpolation delay...)
public/js/sync.js      NetSource / LocalSource + snapshot Timeline (interpolation)
public/js/game.js      match scene: fixed camera, arena, rendering, HUD feed
public/js/player.js    PlaneView (sprites, trails, smoke) + Predictor
public/js/enemy.js     EnemyView   public/js/bullet.js  bullet visuals
public/js/net.js       Socket.IO client + nickname rules   public/js/lobby.js  menu/join/lobby
public/js/main.js      Phaser boot + arena-fit pixel zoom   public/js/ui.js  font, HUD, game over
public/js/effects.js, sprites.js, input.js, audio.js, utils.js
```
Real audio: `Sfx.register('gun', '/assets/audio/gun.wav')` (gun, hit, boom, hurt, reload, reloadDone).
