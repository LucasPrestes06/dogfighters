// Mouse input: crosshair position (screen + world) and left-button fire. SPACE (held) = boost.
import { W, H } from './constants.js';

export class Input {
  constructor(scene) {
    this.cam = scene.cameras.main;
    this.ptr = scene.input.activePointer;       // single shared pointer, no per-move allocations
    scene.input.mouse.disableContextMenu();     // right click must not open the browser menu
    this.space = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);   // also stops the page from scrolling
  }
  // Pointer coordinates are already in game pixels (Phaser's ScaleManager handles window resize / zoom).
  get screenX() { const p = this.ptr; return p.x === 0 && p.y === 0 ? W / 2 + 60 : Math.min(W - 1, Math.max(0, p.x)); }
  get screenY() { const p = this.ptr; return p.x === 0 && p.y === 0 ? H / 2 : Math.min(H - 1, Math.max(0, p.y)); }
  get fire() { return this.ptr.leftButtonDown(); }
  get boost() { return this.space.isDown; }                        // held, not toggled
  // Screen -> world using the camera's current scroll (zoom is 1).
  worldAim(out) { out.x = this.screenX + this.cam.scrollX; out.y = this.screenY + this.cam.scrollY; return out; }
}
