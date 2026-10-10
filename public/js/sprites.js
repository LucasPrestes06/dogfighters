// Procedural pixel art: a biplane pixel matrix rotated (nearest-neighbour) into 16 angles x 2 prop frames.
import { ANGLES } from './constants.js';
import { TAU } from './utils.js';

const S = 19, C = 9; // sprite size and centre pixel
const PAL = {
  pl: { R: '#e8173c', D: '#8a1650', Y: '#ffd21f', O: '#ff8a1f', G: '#9aa3b5', K: '#3a0e3a', W: '#ffffff', P: '#f2b89a' },
  p2: { R: '#9b4de0', D: '#5a2a8a', Y: '#ffd21f', O: '#ff8a1f', G: '#9aa3b5', K: '#2a0e3a', W: '#ffffff', P: '#f2b89a' },
  p3: { R: '#ff8a1f', D: '#a8480f', Y: '#fff3a0', O: '#e8173c', G: '#9aa3b5', K: '#3a1a0e', W: '#ffffff', P: '#f2b89a' },
  p4: { R: '#e8edf5', D: '#7d8aa3', Y: '#e8173c', O: '#ffd21f', G: '#6b7280', K: '#1a2236', W: '#ffffff', P: '#f2b89a' },
  en: { R: '#2f9e5b', D: '#17613a', Y: '#f4f4f4', O: '#ff8a1f', G: '#6b7280', K: '#0f2a24', W: '#ffffff', P: '#f2b89a' },
};

// Biplane facing right (+x). Coordinates are offset by 1 to leave room for the outline.
function baseGrid(prop) {
  const g = Array.from({ length: S }, () => Array(S).fill(null));
  const r = (x0, x1, y0, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y + 1][x + 1] = ch; };
  r(1, 10, 7, 9, 'R'); r(1, 10, 9, 9, 'D');                                   // fuselage
  r(1, 1, 4, 12, 'D'); r(2, 2, 4, 12, 'R'); r(0, 0, 7, 9, 'D');               // tail plane + fin
  r(4, 4, 2, 14, 'D'); r(5, 8, 1, 15, 'R'); r(6, 6, 1, 15, 'Y');              // lower wing, upper wing, stripe
  r(5, 8, 1, 1, 'O'); r(5, 8, 15, 15, 'O');                                   // wing tips
  r(9, 9, 7, 9, 'K'); r(9, 9, 8, 8, 'P'); r(10, 10, 7, 9, 'Y'); r(11, 12, 7, 9, 'G'); // cockpit, band, cowl
  for (let y = 4; y <= 12; y++) if (y % 2 === prop) g[y + 1][14] = 'W';       // spinning prop
  g[9][14] = 'Y';
  return g;
}

function rotate(grid, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return grid.map((_, y) => grid[0].map((__, x) => {
    const dx = x - C, dy = y - C;
    const sx = Math.round(C + dx * c + dy * s), sy = Math.round(C - dx * s + dy * c);
    return sx >= 0 && sy >= 0 && sx < S && sy < S ? grid[sy][sx] : null;
  }));
}

function outline(g) {
  const o = g.map(row => row.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x]) continue;
    if ((y > 0 && g[y - 1][x]) || (y < S - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < S - 1 && g[y][x + 1])) o[y][x] = 'K';
  }
  return o;
}

function toCanvas(g, colorOf) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (g[j][i]) { x.fillStyle = colorOf(g[j][i]); x.fillRect(i, j, 1, 1); }
  return c;
}

export function makeSprites(scene) {
  for (const key of Object.keys(PAL)) for (let i = 0; i < ANGLES; i++) for (let f = 0; f < 2; f++) {
    const g = outline(rotate(baseGrid(f), i * TAU / ANGLES));
    scene.textures.addCanvas(`${key}_${i}_${f}`, toCanvas(g, ch => PAL[key][ch]));
  }
  makeCrosshair(scene);
  for (let i = 0; i < ANGLES; i++) scene.textures.addCanvas(`sh_${i}`, toCanvas(rotate(baseGrid(0), i * TAU / ANGLES), () => '#1c7bd0'));
}

// 11x11 pixel-art crosshair: white arms + diagonal ticks, yellow centre, dark outline.
function makeCrosshair(scene) {
  const N = 11, g = Array.from({ length: N }, () => Array(N).fill(null));
  for (const d of [0, 1, 2]) { g[d][5] = 'W'; g[N - 1 - d][5] = 'W'; g[5][d] = 'W'; g[5][N - 1 - d] = 'W'; }
  for (const [x, y] of [[3, 3], [7, 3], [3, 7], [7, 7]]) g[y][x] = 'W';
  g[5][5] = 'Y';
  const o = g.map(r => r.slice());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!g[y][x])
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (g[y + j] && g[y + j][x + i]) o[y][x] = 'K';
  const c = document.createElement('canvas'); c.width = c.height = N;
  const cx = c.getContext('2d'), col = { W: '#ffffff', Y: '#ffd21f', K: '#3a0e3a' };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (o[y][x]) { cx.fillStyle = col[o[y][x]]; cx.fillRect(x, y, 1, 1); }
  scene.textures.addCanvas('crosshair', c);
}

// Sky layers: 'ground' (far, ocean marks) and 'clouds' (with offset shadows). 256x256 so they tile.
export function makeBackgrounds(scene) {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 256; return [c, c.getContext('2d')]; };

  const [gc, gx] = mk();
  gx.fillStyle = '#2b9cf2'; gx.fillRect(0, 0, 256, 256);
  gx.fillStyle = '#3aaaf7';
  for (let i = 0; i < 14; i++) gx.fillRect(Math.floor(rnd() * 240), Math.floor(rnd() * 250), 6 + Math.floor(rnd() * 6), 2);
  gx.fillStyle = '#1f6fd0';
  for (let i = 0; i < 26; i++) { const x = Math.floor(rnd() * 248), y = Math.floor(rnd() * 250);
    gx.fillRect(x, y + 1, 1, 1); gx.fillRect(x + 1, y, 3, 1); gx.fillRect(x + 4, y + 1, 1, 1); }
  scene.textures.addCanvas('ground', gc);

  const [cc, cx] = mk();
  const shape = (px, py, w, body, under) => {
    cx.fillStyle = body;
    cx.fillRect(px, py + 4, w, 7); cx.fillRect(px + 5, py, w - 14, 5); cx.fillRect(px + w - 12, py + 2, 9, 4);
    if (under) { cx.fillStyle = under; cx.fillRect(px + 2, py + 9, w - 4, 2); }
  };
  const list = [];
  for (let i = 0; i < 7; i++) list.push([10 + Math.floor(rnd() * 180), 10 + Math.floor(rnd() * 200), 28 + Math.floor(rnd() * 32)]);
  for (const [x, y, w] of list) shape(x + 9, y + 13, w, '#1f85db', null);   // shadows first
  for (const [x, y, w] of list) shape(x, y, w, '#ffffff', '#cfe8ff');
  scene.textures.addCanvas('clouds', cc);
}
