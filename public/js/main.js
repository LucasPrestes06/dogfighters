// Entry point: boots Phaser, generates textures, fills the whole window with pixel-perfect scaling.
import { ARENA_W, ARENA_H, ARENA_PAD, setViewSize } from './constants.js';
import { makeSprites, makeBackgrounds } from './sprites.js';
import { GameOverScene } from './ui.js';
import { MenuScene, JoinScene, LobbyScene } from './lobby.js';
import { GameScene } from './game.js';

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { makeSprites(this); makeBackgrounds(this); this.scene.start('Menu'); }
}

// The WHOLE arena (+ small padding) must always be visible. Pick the largest whole-pixel zoom that fits
// (device pixels); if that would waste more than 20% of the window, use the exact fractional fit instead.
// The logical view then covers the full window: extra space around the arena is drawn as out-of-bounds.
function computeView() {
  const dpr = window.devicePixelRatio || 1;
  const s = Math.min(window.innerWidth * dpr / (ARENA_W + 2 * ARENA_PAD), window.innerHeight * dpr / (ARENA_H + 2 * ARENA_PAD));
  const zi = Math.floor(s), zd = s < 1 || (zi >= 1 && zi / s < 0.8) ? s : zi;
  const z = zd / dpr;                                                 // CSS px per logical pixel
  return { z, w: Math.ceil(window.innerWidth / z), h: Math.ceil(window.innerHeight / z) };
}

const v0 = computeView();
setViewSize(v0.w, v0.h);

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: v0.w, height: v0.h, backgroundColor: '#2b9cf2',
  pixelArt: true, roundPixels: true, antialias: false, fps: { target: 60 },
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, zoom: v0.z },
  scene: [BootScene, MenuScene, JoinScene, LobbyScene, GameScene, GameOverScene],
});

function fit() {
  if (!game.isBooted) return;
  const v = computeView();
  setViewSize(v.w, v.h);
  game.scale.setZoom(v.z);
  game.scale.resize(v.w, v.h);
  game.scale.refresh();
  for (const s of game.scene.scenes) if (s.cameras && s.cameras.main) s.cameras.main.setSize(v.w, v.h);
}
window.addEventListener('resize', fit);
game.events.once('ready', fit);
