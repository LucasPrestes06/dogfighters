// Nickname + main menu, join-by-code screen and lobby. All text drawn with the game's pixel font.
import { W } from './constants.js';
import { Sky } from './effects.js';
import { Sfx } from './audio.js';
import { Net, validateNick, NICK_MAX } from './net.js';
import { drawText, textWidth, centerText, drawButton, offY } from './ui.js';

const SHADOW = 0x0b2a5c, BTN_W = 124, BTN_H = 16;

// In-canvas text field (so the pixel font and the normal mouse cursor are used; no DOM input needed).
class TextField {
  constructor(max, re, upper) { this.max = max; this.re = re; this.upper = upper; this.value = ''; }
  key(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Backspace') this.value = this.value.slice(0, -1);
    else if (ev.key.length === 1) {
      const c = this.upper ? ev.key.toUpperCase() : ev.key;
      if (this.re.test(c) && this.value.length < this.max) this.value += c;
    }
  }
  draw(g, cx, y, w, h, time, hint) {
    const x = cx - (w >> 1);
    g.fillStyle(0x3a0e3a, 1); g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(SHADOW, 1); g.fillRect(x, y, w, h);
    g.fillStyle(0xffd21f, 1); g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
    const ty = y + ((h - 10) >> 1);
    if (this.value) drawText(g, this.value, x + 5, ty, 0xffffff, 2);
    else drawText(g, hint, x + 5, y + ((h - 5) >> 1), 0x6a8ac8, 1);
    if (((time / 400) | 0) % 2 === 0) { g.fillStyle(0xffd21f, 1); g.fillRect(x + 5 + (this.value ? textWidth(this.value, 2) + 2 : 0), ty, 2, 10); }
  }
}

class UiScene extends Phaser.Scene {
  initUi() {
    this.sky = new Sky(this); this.g = this.add.graphics().setDepth(50);
    this.buttons = []; this.msg = ''; this.msgT = 0; this.busy = false; this.born = this.time.now;
    this.input.setDefaultCursor('default');   // normal mouse here; the crosshair only exists in the match
    this.input.on('pointerup', p => {
      if (this.time.now - this.born < 400) return; // ignore the click that opened this screen
      const o = offY();
      for (const b of this.buttons) if (this.over(b, p, o)) { Sfx.unlock(); b.fn(); break; }
    });
    this.events.once('shutdown', () => Net.clear());
    if (Net.notice) { this.say(Net.notice); Net.notice = ''; }
  }
  over(b, p, o) { return Math.abs(p.x - (W >> 1)) <= b.w / 2 && Math.abs(p.y - (o + b.y)) <= b.h / 2; }
  say(t) { this.msg = t; this.msgT = this.time.now + 4000; }
  drawUi(g, o, msgY) {
    const ptr = this.input.activePointer;
    for (const b of this.buttons) drawButton(g, b.label, W >> 1, o + b.y, b.w, b.h, this.over(b, ptr, o));
    if (this.time.now < this.msgT) centerText(g, this.msg, o + msgY, 0xff5a5a, 1, 0x3a0e3a);
  }
  title(g, o, y, sc) { centerText(g, 'DOGFIGHTERS', o + y, 0xffd21f, sc, 0x8a1650); }
}

export class MenuScene extends UiScene {
  constructor() { super('Menu'); }
  create() {
    this.initUi(); Net.connect();
    this.field = new TextField(NICK_MAX, /^[A-Za-z0-9 _-]$/, false); this.field.value = Net.nick || '';
    this.input.keyboard.on('keydown', ev => this.field.key(ev));
    this.buttons = [
      { label: 'JOGAR SOLO', y: 98, w: BTN_W, h: BTN_H, fn: () => this.scene.start('Game', { nick: this.validNick(false) }) },
      { label: 'CRIAR SALA', y: 118, w: BTN_W, h: BTN_H, fn: () => this.createRoom() },
      { label: 'ENTRAR EM SALA', y: 138, w: BTN_W, h: BTN_H, fn: () => { if (this.validNick(true)) this.scene.start('Join'); } },
    ];
  }
  validNick(required) {
    const v = validateNick(this.field.value);
    if (!v.ok) { if (required) this.say(v.error); return null; }
    Net.setNick(v.nick); return v.nick;
  }
  async createRoom() {
    const nick = this.validNick(true); if (!nick || this.busy) return;
    this.busy = true; const r = await Net.create(nick); this.busy = false;
    if (!this.sys.isActive()) return;
    if (r.ok) this.scene.start('Lobby'); else this.say(r.error);
  }
  update(time) {
    const o = offY(), g = this.g; this.sky.scroll(time * 0.03, 0); g.clear();
    this.title(g, o, 10, 4);
    centerText(g, 'PIXEL AIR COMBAT', o + 34, 0xffffff, 1, SHADOW);
    centerText(g, 'DIGITE SEU NICK', o + 48, 0xffffff, 1, SHADOW);
    this.field.draw(g, W >> 1, o + 56, 140, 18, time, 'SEU NOME AQUI');
    this.drawUi(g, o, 78);
    centerText(g, 'MOUSE - MOVE', o + 156, 0xffffff, 1, SHADOW);
    centerText(g, 'LEFT CLICK - FIRE', o + 164, 0xffffff, 1, SHADOW);
    const st = Net.connected ? 'ONLINE' : 'OFFLINE';
    drawText(g, st, W - 6 - textWidth(st), 4, Net.connected ? 0x7cfc9a : 0xff5a5a, 1, SHADOW);
  }
}

export class JoinScene extends UiScene {
  constructor() { super('Join'); }
  create() {
    this.initUi();
    if (!Net.nick) { this.scene.start('Menu'); return; }
    this.field = new TextField(5, /^[A-Za-z0-9]$/, true);
    this.input.keyboard.on('keydown', ev => { if (ev.key === 'Enter') this.join(); else this.field.key(ev); });
    this.buttons = [
      { label: 'ENTRAR', y: 118, w: BTN_W, h: BTN_H, fn: () => this.join() },
      { label: 'VOLTAR', y: 138, w: BTN_W, h: BTN_H, fn: () => this.scene.start('Menu') },
    ];
  }
  async join() {
    if (this.busy) return;
    if (this.field.value.length !== 5) return this.say('DIGITE O CODIGO DE 5 LETRAS');
    this.busy = true; const r = await Net.join(this.field.value, Net.nick); this.busy = false;
    if (!this.sys.isActive()) return;
    if (r.ok) this.scene.start('Lobby'); else this.say(r.error);
  }
  update(time) {
    const o = offY(), g = this.g; this.sky.scroll(time * 0.03, 0); g.clear();
    this.title(g, o, 10, 4);
    centerText(g, 'ENTRAR EM SALA', o + 40, 0xffffff, 2, SHADOW);
    centerText(g, `NICK: ${Net.nick}`, o + 60, 0xffd21f, 1, SHADOW);
    centerText(g, 'DIGITE O CODIGO', o + 74, 0xffffff, 1, SHADOW);
    this.field.draw(g, W >> 1, o + 82, 80, 18, time, 'CODIGO');
    this.drawUi(g, o, 104);
  }
}

export class LobbyScene extends UiScene {
  constructor() { super('Lobby'); }
  create() {
    this.initUi();
    if (!Net.room) { this.scene.start('Menu'); return; }
    Net.on('started', r => this.scene.start('Game', { nick: Net.nick, room: r.code, online: true }));
    Net.on('disconnect', () => this.scene.start('Menu'));
    this.startBtn = { label: 'INICIAR JOGO', y: 146, w: BTN_W, h: BTN_H, fn: async () => {
      if (this.busy) return; this.busy = true; const r = await Net.start(); this.busy = false; if (!r.ok) this.say(r.error); } };
    this.leaveBtn = { label: 'SAIR DA SALA', y: 166, w: BTN_W, h: BTN_H, fn: () => { Net.leave(); this.scene.start('Menu'); } };
  }
  update(time) {
    const room = Net.room; if (!room) return;
    const o = offY(), g = this.g; this.sky.scroll(time * 0.03, 0); g.clear();
    const isHost = room.players.some(p => p.host && p.pid === Net.pid);
    this.buttons = isHost ? [this.startBtn, this.leaveBtn] : [this.leaveBtn];
    this.title(g, o, 6, 3);
    centerText(g, `SALA: ${room.code}`, o + 28, 0xffffff, 2, SHADOW);
    centerText(g, `JOGADORES NA SALA ${room.players.length}/4`, o + 46, 0xffffff, 1, SHADOW);
    room.players.forEach((p, i) => {
      const t = p.nick + (p.host ? ' [HOST]' : '') + (p.pid === Net.pid ? ' [VOCE]' : '');
      centerText(g, t, o + 56 + i * 9, p.host ? 0xffd21f : p.pid === Net.pid ? 0x7cfc9a : 0xffffff, 1, SHADOW);
    });
    centerText(g, 'STATUS: AGUARDANDO', o + 96, 0xffffff, 1, SHADOW);
    Net.log.forEach((t, i) => centerText(g, t, o + 106 + i * 8, 0xcfe8ff, 1, SHADOW));
    if (!isHost && ((time / 500) | 0) % 2 === 0) centerText(g, 'AGUARDANDO O HOST', o + 146, 0xffd21f, 1, SHADOW);
    this.drawUi(g, o, 132);
  }
}
