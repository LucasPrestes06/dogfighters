// Pixel font (3x5), HUD, menu and game-over scenes.
import { W, H, MAX_AMMO, PLAYER_HEALTH } from './constants.js';
import { Sky } from './effects.js';
import { Sfx } from './audio.js';
import { Net } from './net.js';

// Each glyph = 5 rows, each digit a 3-bit row (4 = left pixel).
const GLYPHS = {
  '0': '75557', '1': '26227', '2': '71747', '3': '71717', '4': '55711', '5': '74717', '6': '74757', '7': '71222', '8': '75757', '9': '75717',
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152', K: '55655', L: '44447',
  M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255',
  Y: '55222', Z: '71247', ':': '02020', '/': '11244', '.': '00002', '-': '00700', '!': '22202', '_': '00007', '[': '64446', ']': '31113', ' ': '00000',
};
export const textWidth = (s, sc = 1) => String(s).length * 4 * sc - sc;
export function drawText(g, str, x, y, color, sc = 1, shadow = null) {
  str = String(str).toUpperCase();
  const pass = (ox, oy, col) => {
    g.fillStyle(col, 1);
    for (let i = 0; i < str.length; i++) {
      const gl = GLYPHS[str[i]] || GLYPHS[' '];
      for (let r = 0; r < 5; r++) { const bits = +gl[r]; for (let c = 0; c < 3; c++) if (bits & (4 >> c)) g.fillRect(x + ox + (i * 4 + c) * sc, y + oy + r * sc, sc, sc); }
    }
  };
  if (shadow !== null) { const o = sc >= 4 ? 2 : 1; pass(o, o, shadow); }
  pass(0, 0, color);
}
export const centerText = (g, s, y, col, sc, sh) => drawText(g, s, Math.round((W - textWidth(s, sc)) / 2), y, col, sc, sh);
export const pad = n => String(n).padStart(6, '0');

export function drawButton(g, label, cx, cy, w, h, hover) {
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle(0x3a0e3a, 1); g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(hover ? 0xe8173c : 0x8a1650, 1); g.fillRect(x, y, w, h);
  g.fillStyle(hover ? 0xffffff : 0xffd21f, 1);
  g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  drawText(g, label, Math.round(cx - textWidth(label, 2) / 2), cy - 5, 0xffffff, 2, 0x3a0e3a);
}

export class Hud {
  constructor(scene) { this.g = scene.add.graphics().setScrollFactor(0).setDepth(100); }
  draw(p, score, kills, t) {
    const g = this.g; g.clear();
    drawText(g, `SCORE: ${pad(score)}`, 6, 6, 0xffffff, 1, 0x0b2a5c);
    drawText(g, `KILLS: ${kills}`, 6, 14, 0xffd21f, 1, 0x0b2a5c);
    drawText(g, 'HP', W - 8 - PLAYER_HEALTH * 9 - 12, 6, 0xffffff, 1, 0x0b2a5c);
    for (let i = 0; i < PLAYER_HEALTH; i++) {
      const x = W - 6 - (PLAYER_HEALTH - i) * 9 + 2;
      g.fillStyle(0x3a0e3a, 1); g.fillRect(x - 1, 5, 8, 8);
      g.fillStyle(i < p.hp ? 0xe8173c : 0x5a3a6a, 1); g.fillRect(x, 6, 6, 6);
    }
    drawText(g, `AMMO: ${p.ammo}/${MAX_AMMO}`, 6, H - 26, p.ammo <= 5 ? 0xff5a5a : 0xffffff, 1, 0x0b2a5c);
    if (p.reloading && ((t * 4) | 0) % 2 === 0) drawText(g, 'RELOADING...', 6, H - 19, 0xffd21f, 1, 0x0b2a5c);
    const bw = 60, fill = p.reloading ? p.reloadProgress : p.ammo / MAX_AMMO;
    g.fillStyle(0x3a0e3a, 1); g.fillRect(5, H - 13, bw + 2, 6);
    g.fillStyle(p.reloading ? 0xff8a1f : 0xffd21f, 1); g.fillRect(6, H - 12, Math.round(bw * fill), 4);
  }
}

// Menu layouts are designed for 180 px height; they are re-centred vertically for any window size.
export const offY = () => Math.round((H - 180) / 2);

class ScreenScene extends Phaser.Scene {
  place() { this.zone.setPosition(W >> 1, offY() + this.cy); return offY(); }
  buildScreen(label, cy, action) {
    this.sky = new Sky(this); this.g = this.add.graphics().setDepth(50); this.hover = false; this.cy = cy; this.label = label; this.t = 0;
    this.input.setDefaultCursor('default');
    this.born = this.time.now;
    // Ignore input for 0.6 s so a held fire button from the match can't trigger the button instantly.
    const go = () => { if (this.time.now - this.born < 600) return; Sfx.unlock(); action(); };
    const z = this.zone = this.add.zone(W >> 1, cy, 90, 22).setInteractive({ useHandCursor: true });
    z.on('pointerup', go); z.on('pointerover', () => (this.hover = true)); z.on('pointerout', () => (this.hover = false));
    this.input.keyboard.on('keydown-ENTER', go); this.input.keyboard.on('keydown-SPACE', go);
  }
}

export class GameOverScene extends ScreenScene {
  constructor() { super('GameOver'); }
  init(data) { this.score = data.score || 0; this.kills = data.kills || 0; this.nick = data.nick || null; }
  create() {
    this.buildScreen('RESTART', 118, () => this.scene.start('Game', { nick: this.nick }));
    this.input.keyboard.on('keydown-ESC', () => { Net.leave(); this.scene.start('Menu'); }); // back to menu (leaves the room)
  }
  update(time) {
    const o = this.place();
    this.sky.scroll(time * 0.01, 0);
    const g = this.g; g.clear();
    centerText(g, 'GAME OVER', o + 30, 0xe8173c, 4, 0x3a0e3a);
    centerText(g, `SCORE: ${pad(this.score)}`, o + 72, 0xffffff, 2, 0x0b2a5c);
    centerText(g, `KILLS: ${this.kills}`, o + 90, 0xffd21f, 1, 0x0b2a5c);
    drawButton(g, this.label, W >> 1, o + this.cy, 100, 20, this.hover);
    centerText(g, 'ESC - MENU', o + 142, 0xffffff, 1, 0x0b2a5c);
  }
}
