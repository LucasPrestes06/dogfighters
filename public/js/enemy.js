// Enemy rendering only: enemy AI, damage and scoring run in the shared simulation (sim.js).
import { PlaneView } from './player.js';

export class EnemyView extends PlaneView {
  constructor(scene, fx) { super(scene, 'en', fx, false, 1); this.img.setDepth(9); this.shadow.setDepth(4); }
}
