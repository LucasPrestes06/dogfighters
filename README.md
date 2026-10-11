# DOGFIGHTERS — Pixel Air Combat

Arcade biplane shooter in pixel art. Phaser 3 + Node/Express + Socket.IO. Hosted on **Render** (not run locally) — follow **DEPLOY_RENDER.md** step by step.

## Controls
- Mouse: move the crosshair; the plane always flies at constant speed toward it
- Left click (hold): machine gun toward the crosshair — 30 rounds, automatic 2 s reload
- ESC: leave the match / back to the menu

## Game modes
- **JOGAR SOLO**: the shared simulation (`sim.js`) runs locally with one player and AI enemies; Game Over when shot down.
- **CRIAR SALA / ENTRAR EM SALA** — **Free For All** (v1.1): 5-character room code, any number of players (technical cap, see below), nicknames and a lobby. No AI enemies: the players are the opponents.

## Free For All rules (online)
- Everybody competes individually; there are no teams. Every round all participants start alive on a spread-out start position (concentric rings, valid for any player count).
- **One life per round**: when a plane's hp (5) reaches 0 it is *eliminated*: it disappears, cannot move, shoot or cause damage, its bullets in flight are dropped, and it cannot come back until the next round.
- **Last survivor wins the round** and gets exactly **one** win. If nobody survives (simultaneous eliminations, or the last survivor leaves) nobody gets a win.
- After each round the server broadcasts the result and everybody sees the pixel-art scoreboard (round number, ranking by wins, win pips, highlighted winner, countdown) for `ROUND_RESULTS_TIME` = 5 s; then the next round starts with everyone alive again. Wins carry over; bullets and old state do not.
- **Wins to take the match: 5 / 10 / 15**, chosen by the host in the lobby (default 5). The value is stored on the room by the server, shown to everybody, and locked once the match starts. Guests' requests are rejected.
- The match ends the moment someone reaches the target: final board (champion + full ranking). The host can send everybody back to the lobby (new match = new scoreboard); anyone can leave.
- Minimum 2 players to start. **Leaving policy:** a player who leaves (or disconnects) is removed from the scoreboard together with his wins; the round is re-evaluated immediately (if that leaves one survivor he wins the round, once). If fewer than 2 players remain after a round, no new round is started and the match ends as a walkover (the remaining player is the champion). Players can only join while the room is in the lobby.
- **Room size:** there is no fixed limit of 4 any more. A configurable technical safety cap exists: env `MAX_PLAYERS_PER_ROOM` (default 24). Snapshots only carry *alive* planes, so traffic shrinks as players are eliminated.

### Server phases (server-authoritative, `ffa.js`)
`WAITING` (lobby) -> `STARTING` (clients load, send `game:ready`; 6 s timeout) -> `ROUND_ACTIVE` <-> `ROUND_RESULTS` -> `MATCH_FINISHED` -> `WAITING`. Only the server changes phases. Client requests are validated against the current phase, the room and the host role (`room:config`, `room:start`, `room:lobby`); anything else (fake phases, winners, scores, hp) is ignored.

## Multiplayer architecture
```
client                              server (one Match per room)
mouse aim + fire  --'in' 30 Hz-->   validates/clamps input, ignores out-of-order seq
                                    fixed 30 Hz simulation: movement, arena limits, ammo, reload,
                                    bullets, collisions, damage, kills, enemies, score, respawn
renders interpolated snapshots <--'g:s' (volatile, 30/s)-- compact state of the ALIVE planes (+ enemies in solo)
spawns/removes tracers, FX     <--'g:e' (reliable, ordered)-- fire / hit / hurt / elimination / bullet drop
round + scoreboard + match end <--'g:phase' (reliable, ordered)-- phase, round, round winner, ordered wins, champion
```
- **One rule set**: `public/js/sim.js` is imported by BOTH the server and the client (solo mode and prediction), so the rules exist once.
- **Server authority**: clients only send aim position + fire intent. Position, speed, ammo, damage, hp, eliminations, wins and the scoreboard are never accepted from a client (verified by tests). The scoreboard UI draws only the numbers received in `g:phase`.
- **Smoothness**: remote planes and enemies are interpolated ~70 ms in the past between two snapshots (out-of-order/duplicate snapshots are dropped); your own plane is predicted locally with the same movement code and gently corrected toward the latency-compensated server state (snap if the error is > 40 px). The server clock and the render clock are separate, so clients with different FPS see the same match.
- **Ordered start**: host `room:start` (min. 2 players) -> server creates a fresh FFA match and emits `room:started` -> each client builds the scene and answers `game:ready` -> server begins round 1 (`g:phase`) and starts ticking. A 6 s timeout prevents a silent client from blocking the room.
- **Isolation**: all traffic goes through Socket.IO rooms; nothing is shared between rooms. When the host leaves, only the lobby host role moves; the simulation stays on the server. A room with no players is deleted; every new match starts with a fresh scoreboard.
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
- 5 hp per round (one life, several hits). With many players rounds can be long; hp/round pacing is a constants tweak.
- No reconnection: a dropped player is out of the match (he can create/join another room).
- Many players on one screen: the in-game ranking shows the top 8; the scoreboards list everybody that fits the window and summarise the rest as `+N`.
- Browser-side behaviour (rendering, pixel scaling, real mouse) was exercised with a headless harness, not in a real browser; see the delivery notes.

## Structure
```
server.js              Express static + Socket.IO rooms + authoritative game loop
render.yaml            Render Blueprint
ffa.js                 FFA manager: phases, rounds, one life, wins, match end (server only)
public/js/sim.js       SHARED combat simulation (Match, stepMovement) - server + solo + prediction
public/js/board.js     pixel-art round/final scoreboards
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
