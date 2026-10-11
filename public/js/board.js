// Pixel-art scoreboards drawn from SERVER data only (round results + final standings).
// Nothing here counts points: every number comes from the 'g:phase' message.
import { W, H } from './constants.js';
import { drawText, textWidth, centerText, drawButton } from './ui.js';

export const PALETTE_COLORS = { pl: 0xe8173c, p2: 0x9b4de0, p3: 0xff8a1f, p4: 0xe8edf5, p5: 0xff6ec7, p6: 0xffe14a, p7: 0x3a4a6a };
const SH = 0x0b2a5c, NAVY = 0x0b1330, GOLD = 0xffd21f;
const pad2 = n => String(n).padStart(2, '0');

function panel(g, x, y, w, h) {
  g.fillStyle(0x000000, 1); g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(NAVY, 1); g.fillRect(x, y, w, h);
  g.fillStyle(GOLD, 1); g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2); g.fillRect(x + w - 2, y + 1, 1, h - 2);
}
function plane(g, x, y, col) {                       // 7x7 biplane icon, nose to the right
  g.fillStyle(0x1a1030, 1); g.fillRect(x - 1, y - 1, 9, 9);
  g.fillStyle(col, 1); g.fillRect(x + 1, y + 3, 6, 1); g.fillRect(x + 2, y, 2, 7); g.fillRect(x, y + 2, 1, 3);
  g.fillStyle(0xffffff, 1); g.fillRect(x + 7, y + 2, 1, 3);
}
function pips(g, x, y, total, wins, color, blinkLast) {  // one 4x4 pip per win needed; filled = wins from the server
  for (let i = 0; i < total; i++) {
    const on = i < wins, last = i === wins - 1;
    g.fillStyle(on ? (blinkLast && last ? 0xffffff : color) : 0x2a3a6a, 1); g.fillRect(x + i * 5, y, 4, 4);
  }
}

// Geometry shared by both boards. Rows that do not fit the window are summarised as "+N".
function layout(d, extraH, titleH) {
  const total = d.w, maxRows = Math.max(2, Math.floor((H - titleH - extraH - 30) / 12)), rows = Math.min(d.sc.length, maxRows);
  const inner = 72 + total * 5 + 4 + 14, pw = Math.max(inner + 24, 200);
  const ph = titleH + rows * 12 + (d.sc.length > rows ? 10 : 0) + extraH + 14;
  return { rows, pw, ph, px: (W - pw) >> 1, py: Math.max(4, (H - ph) >> 1), inner };
}
function drawRows(g, d, L, y0, t) {
  const x0 = L.px + ((L.pw - L.inner) >> 1);
  d.sc.slice(0, L.rows).forEach(([pid, nick, wins], i) => {
    const y = y0 + i * 12, win = d.rw === pid && d.ph === 'ROUND_RESULTS', hot = (d.mw === pid && d.ph === 'MATCH_FINISHED') || win;
    if (hot && ((t * 3) | 0) % 2 === 0) { g.fillStyle(0x3a2a6a, 1); g.fillRect(x0 - 3, y - 2, L.inner + 6, 11); }   // temporary highlight
    plane(g, x0, y, d.color(pid));
    drawText(g, String(i + 1), x0 + 11, y + 1, 0x8aa6d8, 1);
    drawText(g, nick.slice(0, 12), x0 + 20, y + 1, pid === d.me ? 0x7cfc9a : 0xffffff, 1, SH);
    pips(g, x0 + 72, y + 2, d.w, wins, d.color(pid) === 0x3a4a6a ? GOLD : GOLD, win);
    drawText(g, String(wins), x0 + 72 + d.w * 5 + 4, y + 1, hot ? GOLD : 0xcfe8ff, 1, SH);
  });
  if (d.sc.length > L.rows) centerText(g, `+${d.sc.length - L.rows} JOGADORES`, y0 + L.rows * 12, 0x8aa6d8, 1, SH);
}

// d = { r, w, sc:[[pid,nick,wins]...] (server order), rw, elapsed, dur, me, color(pid), t }
export function drawRoundBoard(g, d) {
  const L = layout(d, 22, 38);
  panel(g, L.px, L.py, L.pw, L.ph);
  centerText(g, `ROUND ${pad2(d.r)} - PLACAR`, L.py + 7, GOLD, 2, 0x8a1650);
  const winner = d.rw && d.sc.find(s => s[0] === d.rw);
  centerText(g, winner ? `VENCEDOR: ${winner[1].slice(0, 14)}` : 'EMPATE - SEM VENCEDOR', L.py + 21, winner ? 0x7cfc9a : 0xff5a5a, 1, SH);
  centerText(g, `META: ${d.w} VITORIAS`, L.py + 29, 0x8aa6d8, 1, SH);
  drawRows(g, d, L, L.py + 40, d.t);
  const left = Math.max(0, Math.ceil(d.dur - d.elapsed));
  centerText(g, `PROXIMO ROUND EM ${left}`, L.py + L.ph - 14, 0xffffff, 1, SH);
}

// d adds { mw, why, host }, buttons: [{label, fn}] (cx/cy/w/h are filled in here for hit-testing)
export function drawFinalBoard(g, d, buttons, ptr) {
  const L = layout(d, 22 + buttons.length * 20, 52);
  panel(g, L.px, L.py, L.pw, L.ph);
  centerText(g, 'FIM DE JOGO', L.py + 7, GOLD, 3, 0x8a1650);
  const champ = d.sc.find(s => s[0] === d.mw);
  centerText(g, 'CAMPEAO', L.py + 26, 0x8aa6d8, 1, SH);
  centerText(g, champ ? champ[1].slice(0, 14) : '-', L.py + 34, 0x7cfc9a, 2, SH);
  if (d.why === 'WO') centerText(g, 'VITORIA POR ABANDONO', L.py + 45, 0xff5a5a, 1, SH);
  drawRows(g, d, L, L.py + 54, d.t);
  const bottom = L.py + 54 + L.rows * 12 + (d.sc.length > L.rows ? 10 : 0);
  if (!d.host) centerText(g, 'AGUARDANDO O HOST', bottom + 4, GOLD, 1, SH);
  buttons.forEach((b, i) => {
    b.cx = W >> 1; b.cy = bottom + 12 + i * 20; b.w = 124; b.h = 16;
    drawButton(g, b.label, b.cx, b.cy, b.w, b.h, Math.abs(ptr.x - b.cx) <= b.w / 2 && Math.abs(ptr.y - b.cy) <= b.h / 2);
  });
}
