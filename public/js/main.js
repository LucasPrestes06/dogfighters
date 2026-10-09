// Entry point: boots Phaser, generates textures, fills the whole window with pixel-perfect scaling.
import { BASE_W, BASE_H, setViewSize } from './constants.js';
import { makeSprites, makeBackgrounds } from './sprites.js';
import { GameOverScene } from './ui.js';
import { MenuScene, JoinScene, LobbyScene } from './lobby.js';
import { GameScene } from './game.js';

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { makeSprites(this); makeBackgrounds(this); this.scene.start('Menu'); }
}

// Whole-pixel zoom (in device pixels) closest to the reference 320x180 view, then enough logical
// pixels to cover the entire window. Wider/taller windows simply reveal more world (no stretching).
function computeView() {
  const dpr = window.devicePixelRatio || 1;
  const s = Math.min(window.innerWidth * dpr / BASE_W, window.innerHeight * dpr / BASE_H);
  const z = Math.max(1, Math.round(s)) / dpr;                     // CSS px per logical pixel
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
